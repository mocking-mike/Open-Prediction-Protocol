# Communication Protocols Reference

Quick reference for A2A and MCP protocols used in the agentic economy.

---

## A2A Protocol (Agent-to-Agent)

**Maintainer:** Google → Linux Foundation  
**Purpose:** Standardize inter-agent collaboration (the "HTTP of Agents")  
**Built on:** HTTPS, JSON-RPC 2.0, Server-Sent Events (SSE)

### Agent Card

The core discovery mechanism. Served at `/.well-known/agent.json`.

```json
{
  "@context": "https://schema.org",
  "@type": "Agent",
  "name": "invoice-processor",
  "description": "Processes and validates invoice documents",
  "url": "https://agents.example.com/invoice-processor",
  "version": "1.2.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "invoice-extraction",
      "name": "Invoice Data Extraction",
      "description": "Extracts structured data from invoice PDFs",
      "inputModes": ["application/pdf", "image/png"],
      "outputModes": ["application/json"]
    }
  ],
  "authentication": {
    "schemes": ["OAuth2"],
    "credentials": "https://auth.example.com/.well-known/openid-configuration"
  }
}
```

### Task Lifecycle

```
┌──────────┐    ┌───────────┐    ┌────────────┐    ┌───────────┐
│ submitted│───▶│  working   │───▶│  completed  │    │  failed   │
└──────────┘    └─────┬─────┘    └────────────┘    └───────────┘
                      │                                   ▲
                      │         ┌──────────────┐          │
                      └────────▶│input-required│──────────┘
                                └──────────────┘
```

**Task states:** `submitted` → `working` → `completed` | `failed` | `input-required`

### Message Format (JSON-RPC 2.0)

```json
{
  "jsonrpc": "2.0",
  "method": "tasks/send",
  "id": "req-001",
  "params": {
    "id": "task-42",
    "message": {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Process this invoice and extract line items"
        }
      ]
    }
  }
}
```

### Artifacts

Artifacts are the **tangible outputs** of a task (documents, images, data). They are incrementally streamed as the task progresses.

### Key Properties

| Property | Description |
|---|---|
| **Opaque agents** | Internal logic, prompts, and tools are never exposed |
| **Framework-agnostic** | Works across LangGraph, CrewAI, AutoGen, etc. |
| **Enterprise-ready** | Built on HTTPS + JSON-RPC + SSE |
| **IP protection** | Agents collaborate without revealing implementation |

---

## MCP (Model Context Protocol)

**Purpose:** Universal bridge between AI models and tools/data/services  
**Solves:** The "AI Integration Paradox" — N models × M tools = N×M custom connectors

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    MCP Host     │     │   MCP Client    │     │   MCP Server    │
│                 │     │                 │     │                 │
│  AI application │◄───▶│  Protocol       │◄───▶│  External       │
│  (IDE, desktop  │     │  translator     │     │  service        │
│   assistant)    │     │                 │     │  (GitHub, Slack, │
│                 │     │                 │     │   database...)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### MCP Server Exposes

| Type | Description | Example |
|---|---|---|
| **Tools** | Executable functions the LLM can call | `search_repos`, `create_issue` |
| **Resources** | File-like data the LLM can read | Config files, database schemas |
| **Prompts** | Pre-built prompt templates | Analysis templates, report formats |

### When to Use MCP vs Direct Function Calls

| Scenario | Recommendation |
|---|---|
| General tool integration | ✅ Use MCP |
| Multi-tool orchestration | ✅ Use MCP |
| Reducing hallucinations with live data | ✅ Use MCP |
| Mission-critical steps | ⚠️ Prefer direct function calls |
| Simple, single-tool operations | ⚠️ Direct calls may be simpler |
| Latency-sensitive operations | ⚠️ MCP adds abstraction overhead |

---

## A2A vs MCP: When to Use Each

| Dimension | A2A | MCP |
|---|---|---|
| **Communication** | Agent ↔ Agent | Model ↔ Tool/Data |
| **Discovery** | Agent Cards at `/.well-known/agent.json` | Server manifests |
| **Use case** | Task delegation between autonomous agents | Connecting LLMs to external capabilities |
| **Abstraction** | High-level (opaque agent collaboration) | Low-level (tool/resource access) |
| **Complementary?** | Yes — an agent can use MCP internally while exposing A2A externally |

> **They are complementary:** An agent uses **MCP** to connect to its tools internally, and **A2A** to collaborate with other agents externally.
