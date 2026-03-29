export class TransportOperationController {
  private readonly controller: AbortController;
  private readonly externalSignal: AbortSignal | undefined;
  private readonly abortListener: (() => void) | undefined;
  private timeoutMs: number | undefined;
  private timeoutMessage: string | undefined;
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  constructor(externalSignal?: AbortSignal) {
    this.controller = new AbortController();
    this.externalSignal = externalSignal;

    if (externalSignal) {
      const abort = () => {
        this.abort(createTransportAbortError());
      };

      this.abortListener = abort;
      if (externalSignal.aborted) {
        abort();
      } else {
        externalSignal.addEventListener("abort", abort, { once: true });
      }
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  configureTimeout(timeoutMs: number | undefined, timeoutMessage: string): void {
    this.clearTimeout();
    this.timeoutMs = timeoutMs;
    this.timeoutMessage = timeoutMessage;
    this.resetTimeout();
  }

  resetTimeout(): void {
    this.clearTimeout();
    if (this.signal.aborted || !this.timeoutMs || !this.timeoutMessage) {
      return;
    }

    this.timeoutHandle = setTimeout(() => {
      this.abort(new Error(this.timeoutMessage));
    }, this.timeoutMs);
  }

  abort(reason: Error): void {
    if (!this.signal.aborted) {
      this.controller.abort(reason);
    }
  }

  dispose(): void {
    this.clearTimeout();
    if (this.externalSignal && this.abortListener) {
      this.externalSignal.removeEventListener("abort", this.abortListener);
    }
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }
}

interface ReadBodyTextOptions {
  controller: TransportOperationController;
  maxBytes: number;
  sizeExceededMessage: string;
  resetTimeoutOnChunk?: boolean;
}

export async function awaitWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void
): Promise<T> {
  if (signal.aborted) {
    onAbort?.();
    throw toAbortError(signal.reason);
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) {
        return;
      }

      settled = true;
      onAbort?.();
      reject(toAbortError(signal.reason));
    };

    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

export async function readBodyText(
  response: Response,
  options: ReadBodyTextOptions
): Promise<string> {
  if (!response.body) {
    if (typeof response.text === "function") {
      const text = await awaitWithSignal(response.text(), options.controller.signal);
      if (utf8ByteLength(text) > options.maxBytes) {
        throw new Error(options.sizeExceededMessage);
      }

      return text;
    }

    if (typeof response.json === "function") {
      const payload = await awaitWithSignal(response.json(), options.controller.signal);
      const text = JSON.stringify(payload);
      if (utf8ByteLength(text) > options.maxBytes) {
        throw new Error(options.sizeExceededMessage);
      }

      return text;
    }

    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await awaitWithSignal(reader.read(), options.controller.signal, () => {
        void safeCancelReader(reader);
      });
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        void safeCancelReader(reader);
        throw new Error(options.sizeExceededMessage);
      }

      chunks.push(value);
      if (options.resetTimeoutOnChunk) {
        options.controller.resetTimeout();
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore release failures during cancellation paths.
    }
  }

  return new TextDecoder().decode(concatenateChunks(chunks, totalBytes));
}

export function createTransportAbortError(): Error {
  const error = new Error("Prediction transport aborted");
  error.name = "AbortError";
  return error;
}

async function safeCancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Ignore cancellation failures.
  }
}

function concatenateChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  return createTransportAbortError();
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
