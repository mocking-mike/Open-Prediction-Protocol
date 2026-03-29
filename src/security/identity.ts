import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject
} from "node:crypto";

import bs58 from "bs58";

import type { PredictionResponse } from "../types/index.js";

const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);
const DID_KEY_PREFIX = "did:key:z";

export interface DidKeyIdentity {
  did: string;
  privateKey: string;
  publicKey: string;
}

interface SignedPayload {
  did: string;
  alg: string;
  value: string;
}

function extractRawPublicKey(publicKey: KeyObject): Buffer {
  const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  if (spkiDer.length !== 44) {
    throw new Error("Unexpected Ed25519 SPKI DER length");
  }
  return spkiDer.subarray(-32);
}

function base58btcEncode(buffer: Buffer): string {
  return bs58.encode(buffer);
}

function base58btcDecode(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

function compareUtf16CodeUnits(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }

  return left.length - right.length;
}

export function createDidKeyIdentity(): DidKeyIdentity {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = extractRawPublicKey(publicKey);
  const did = `${DID_KEY_PREFIX}${base58btcEncode(Buffer.concat([ED25519_MULTICODEC_PREFIX, rawPublicKey]))}`;

  return {
    did,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString()
  };
}

export function publicKeyFromDid(did: string): KeyObject {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error("Unsupported DID format");
  }

  const decoded = base58btcDecode(did.slice(DID_KEY_PREFIX.length));
  const prefix = decoded.subarray(0, 2);
  if (!prefix.equals(ED25519_MULTICODEC_PREFIX)) {
    throw new Error("Unsupported did:key codec");
  }

  const rawPublicKey = decoded.subarray(2);
  if (rawPublicKey.length !== 32) {
    throw new Error("Invalid Ed25519 public key length");
  }

  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([spkiPrefix, rawPublicKey]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

function canonicalizeJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical JSON does not support non-finite numbers");
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : canonicalizeJson(item)))
      .join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJson(entryValue)}`);

  return `{${entries.join(",")}}`;
}

export function createSignaturePayload(response: PredictionResponse): string {
  const { signature: _signature, ...unsignedResponse } = response;
  return canonicalizeJson(unsignedResponse);
}

export function signPredictionResponse(
  response: PredictionResponse,
  identity: Pick<DidKeyIdentity, "did" | "privateKey">
): SignedPayload {
  const privateKey = createPrivateKey(identity.privateKey);
  const payload = Buffer.from(createSignaturePayload(response), "utf8");
  const signature = sign(null, payload, privateKey);

  return {
    did: identity.did,
    alg: "Ed25519",
    value: signature.toString("base64")
  };
}

export function verifyPredictionResponseSignature(response: PredictionResponse): boolean {
  if (!response.signature || !response.provider.did) {
    return false;
  }

  if (response.signature.alg !== "Ed25519") {
    return false;
  }

  const payload = Buffer.from(createSignaturePayload(response), "utf8");
  const publicKey = publicKeyFromDid(response.provider.did);

  return verify(
    null,
    payload,
    publicKey,
    Buffer.from(response.signature.value, "base64")
  );
}
