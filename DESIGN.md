# Design

## How it works

The agent is a **function-calling loop** on top of Gemini. When a message arrives, it goes to Gemini along with the recent session history and two function declarations. Gemini decides autonomously whether to call functions or respond directly. If it calls a function, the result feeds back in and Gemini decides again. This repeats until it has enough information to answer (capped at 6 rounds as a safety valve).

```
User message
     │
     ▼
┌──────────┐  function    ┌─────────────────────────────┐
│  Gemini   │  calling    │  recall_conversations        │
│  (tool    │────────────▶│    → SQLite FTS5 + date idx  │
│   use     │◀────────────│  web_search                  │
│   loop)   │             │    → Tavily API              │
└──────────┘              └─────────────────────────────┘
     │
     ▼
  Response
```

**Storage.** Every message is persisted in SQLite with a session ID and timestamp. An FTS5 virtual table (kept in sync by triggers) provides full-text search. Date-indexed queries use a plain index on `created_at`.

**Recall flow** ("What did I ask on 3 November?"):
1. Gemini calls `recall_conversations(date: "2025-11-03")`
2. The function queries SQLite by date
3. Gemini summarizes the retrieved messages

**Verification flow** ("Has pricing changed since then?"):
1. Gemini calls `recall_conversations` to find the original exchange
2. Gemini calls `web_search` with a targeted query about current state
3. Gemini compares old answer with current data and reports the diff

**Streaming.** The endpoint uses SSE. While functions execute, the UI shows live status labels ("Searching past conversations…"). The final text arrives as one event. This keeps the user informed during multi-step reasoning without the complexity of token-by-token streaming.

## Why this design

**Function calling over RAG.** The challenge's example questions are date-based ("on 3 November", "last Tuesday"), not semantic similarity queries. Date indexing in SQLite handles these perfectly. FTS5 covers keyword-based recall ("I asked about Postgres hosting"). An embedding pipeline would add latency, a dependency on an embedding model, and solve the wrong retrieval problem.

**Function calling over prompt stuffing.** Injecting the full conversation history into the context window is the simplest approach, but it doesn't scale past a few sessions and wastes tokens on irrelevant context. The function-based approach lets Gemini surgically retrieve only what's needed, keeping cost and latency low.

**SQLite over Postgres/Redis.** Zero configuration, no Docker, data survives restarts in one file. Matches the "npm install → npm run dev" requirement with no infrastructure. FTS5 is built in and fast enough — no external search service needed.

**No framework (no LangChain, no LlamaIndex).** The agent loop is ~80 lines. Gemini's function calling API is the right abstraction already. A framework adds indirection that obscures the control flow without reducing complexity for a two-function agent.

**Single-process, flat file structure.** Four source files, each under 120 lines. The architecture is legible end-to-end in one sitting. No microservices, no message queues — they'd add operational complexity with no benefit at this scale.

## What I rejected

| Option | Why not |
|---|---|
| **Vector embeddings for conversation search** | Adds an embedding model dependency and ~200ms per query. The example questions are date/keyword queries, not semantic. Embeddings solve fuzzy recall ("something about databases") which is a second-order concern. |
| **LangChain / agent framework** | Wraps a simple loop in layers of abstraction. The function-calling cycle is straightforward enough that a framework makes the code harder to read, not easier. |
| **Conversation summarization** | Periodically compressing old conversations into summaries would save tokens, but adds a background job and risks losing the exact wording users might ask about. Premature for the current scale. |
| **Separate user auth / multi-tenancy** | Adds complexity without testing the core capability. Session IDs provide enough isolation for a demo. |
| **Token-by-token streaming on final response** | Requires either buffering (defeating the purpose) or accepting that intermediate function-call reasoning might leak to the client. The status-label approach gives good perceived responsiveness with simpler code. |

## What I'd do with another week

1. **Hybrid retrieval.** Add embedding-based search as a fallback when FTS returns nothing useful. This handles fuzzy recall ("that thing about databases we discussed") alongside the existing date+keyword paths.

2. **Streaming the final response.** After the last function-call round, switch to Gemini's streaming API for the text generation turn so tokens appear as they're generated.

3. **Conversation summarization.** Summarize sessions older than N days into compressed summaries. Store summaries separately and search them when exact message recall finds nothing.

4. **Eval harness.** A test suite of scripted multi-turn conversations that verify: (a) correct date-based recall, (b) correct keyword recall, (c) accurate verification when web data has changed, (d) graceful handling of missing history.

5. **Multi-user auth.** Session isolation per authenticated user, so the agent doesn't leak one user's history to another.
