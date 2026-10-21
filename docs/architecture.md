# Architecture and design decisions

Portfolio Agent answers questions about a GitHub portfolio with an LLM agent that calls MCP tools on live GitHub data. This page explains how one question flows through the system, and why each piece is built the way it is, including what each decision costs.

## One question, end to end

1. **Browser.** `useChat` posts the whole conversation to `/api/chat` (a Next.js Route Handler).
2. **Guards.** Rate limit per client, then body validation with zod: message count, part count, text length, and an aggregate 128 KiB budget (`lib/http/guards.ts`, `lib/chat/request.ts`).
3. **Model.** `resolveModel(env)` turns `LLM_PROVIDER` into a fallback chain, built fresh for each request (`lib/llm/provider.ts`, `lib/llm/fallback.ts`).
4. **Tools.** An MCP client connects to the MCP server **in-process** over an in-memory transport and lists its tools: `list_repos`, `get_readme`, `detect_stack`, `list_contributions`, `get_profile` (`lib/mcp/client.ts`).
5. **History.** The client history is converted to model messages and pruned: earlier tool payloads and reasoning are dropped, and only the conversation's text is kept.
6. **Agent loop.** `streamText` runs up to 6 steps. In each step the model either answers or calls tools. The AI SDK executes those tools through MCP and feeds the results back. The last step may not call tools.
7. **Data.** GitHub tools go through `GitHubPort`, implemented by a REST adapter behind a process-wide cache. `get_profile` reads a JSON file bundled with the server.
8. **Response.** Text, tool calls and per-answer metadata (the serving model and the duration) stream back to the UI.

## Decisions

### The MCP server runs in-process, and is also published over HTTP and stdio

- **Why:** the agent and the server ship together. In-process means no network hop, no serverless self-request and no URL derived from the incoming request (an SSRF surface). It is still real MCP on both sides, so `MCP_SERVER_URL` can point the agent at a remote server without other changes.
- **Cost:** in-process mode cannot scale the tools separately from the web app. That does not matter at this size.

### Hexagonal core in the MCP package

- **Why:** tools depend on `GitHubPort`, never on HTTP. This lets tests use an in-memory fake, and it let caching be added as a decorator (`CachingGitHubPort`) without touching any tool.
- **Cost:** a little indirection. One interface and one adapter per transport.

### A fallback chain instead of one provider

- **Why:** free tiers fail in ordinary ways. We measured a 503 "high demand", a 429 when the per-minute token budget runs out, and requests that sit in a queue for 20-40 s. `createFallbackModel` implements the AI SDK `LanguageModelV4` interface, so `streamText` sees one model, and each step can move to the next model in the chain.
- **Rules:**
  - Only failures before the first output (text or a tool call) fail over. A retry after output started would duplicate it.
  - Reasoning is held back until that output. Groq checks a tool call against the tool's schema only after the model has reasoned, and reports a mismatch (an invented tool name, a value out of range) as a stream error at that point. Held back, it still fails over to the next model instead of ending the answer. The first-chunk timeout still stops counting at the model's first part, reasoning included, since a model that has started is not queued.
  - The user's Stop never counts as a model failure.
  - The model that last succeeded serves the next steps of the same answer.
- **Cost:**
  - Answers can mix models within one question.
  - Gemini 3 requires "thought signatures" on tool calls it replays. `@ai-sdk/google` injects the documented placeholder for calls that came from another model, so the mix works.
  - A stalled model costs up to 8 s before the switch.

### 8 s first-chunk timeout, but only with somewhere to fall back to

- **Why:** healthy models start streaming in 0.5-3.5 s, while overloaded ones queue requests for 20 s or more. 8 s separates the two groups clearly.
- **Exception:** with a single model, abandoning a slow answer would only turn it into an error. So a chain of one gets no wrapper and no timeout.

### No SDK retries (`maxRetries: 0`)

- **Why:** the SDK's backoff waits 2-4 s and only reads a `Retry-After` header. These free tiers report their wait in the response body instead, so a retry is doomed and spends another unit of quota. Moving to the next model gives better recovery at a lower cost.

### Bound every answer: steps, tokens, reasoning

- **Steps:** at most 6, and the last one must answer with text. Without that rule, one model called `detect_stack` once per turn and finished with no answer at all.
- **Tokens:**
  - Tool results are compact JSON (−23% on `list_repos`).
  - READMEs default to 4,000 characters, about 1.1k tokens.
  - Earlier tool payloads are pruned from history, because earlier answers already summarize them.
  - Groq's free tier allows 8,000 tokens per minute per model.
- **Reasoning:** `reasoning: "low"`. Each provider maps it to its own setting (Gemini `thinkingLevel`, Groq `reasoning_effort`). Choosing a tool does not need long deliberation.

### Cache GitHub reads for 10 minutes, shared across requests

- **Why:** unauthenticated GitHub allows 60 requests per hour, and one question can spend 10-20 of them.
- **What is cached:** successful results, including "not found". Failures are never cached. Concurrent identical reads share a single request.
- **Cost:** answers can be up to 10 minutes stale. The cache lives in process memory, so on serverless it is best-effort per instance.

### Contributions come from the search API, public only

- **Why:** a portfolio is also what someone built with others. `list_contributions` runs two searches: every pull request the owner opened outside its own repositories (`is:pr author:<owner> -user:<owner>`), and the approved subset (`review:approved`), which the first search does not report.
- **Private work:** GitHub publishes an anonymous count of private contributions when the owner enables it on their profile. `getPrivateContributionCount` reads it over GraphQL (any token, the login passed as a variable), and the agent reports it as "N contributions to private repositories in the last year, GitHub does not say which". Nothing about private work comes from the owner's own declarations: every figure is GitHub's.
- **Cost:** with a scope-less token, private repositories (a company's, a client's) cannot be named. For a named project with no public match, the tool's note is the answer: contributions to private repositories cannot be shown. A token with `repo` scope would name them, but `/api/mcp` would then serve private files to any caller, so it is not used. The search API allows 30 requests per minute, so results go through the same 10-minute cache.

### The CV and portfolio site are converted once, and read through a tool

- **Why:** a recruiter asks about roles, studies and skills, which GitHub does not have. Parsing two PDFs or fetching the portfolio site at question time would add seconds and a failure point, so they were converted once into `src/data/profile.json`. Text is copied verbatim in the sources' language, and every answer carries the `sources` with their dates, so the agent attributes facts ("according to their CV") instead of stating them as verified. The owner asked for data from GitHub or the CV, never from answers they could have planted.
- **A tool, not the system prompt:** the whole profile is about 4,300 tokens. In the prompt it would be paid on every step of every question; behind `get_profile` it is paid only when a question needs it.
- **Several sections per call, with no limit in the schema:** a technology question needs skills and projects. Asked for one section per call, the model spent four steps and hit the free tier's per-minute token budget (14 s, two fallbacks); with both in one call it answers in two steps (about 1.6 s). A first version capped a call at two sections in the input schema, and a broad question failed: Groq checks each tool call against the schema after generating it and fails the whole answer, and back then the fallback had already committed to Groq when the reasoning streamed. Two fixes: the fallback now holds reasoning back (see the fallback chain above), and the schema rejects only what is meaningless (an unknown section, or none); how much to read is guidance in the description.
- **Owner-pinned:** the file declares its GitHub login, and the tool serves it only for that owner. Pointing the server at another owner never presents this CV as theirs.
- **Cost:** the data is as old as its sources, and the CV can lag the repositories (it says 137 tests; the repository has more by now). The prompt makes the GitHub tools win for a repository's current state. Email and phone stay out of the file, which is public in the repository; contact goes through the portfolio site.

### Server-pinned owner and a trust boundary on history

- **Owner:** comes from server configuration only (`resolveOwner`). No tool accepts it as input, so a caller cannot point the server, and any token it holds, at another account.
- **History:** client-authored history is trusted for its text only. Fabricated tool results are pruned before the model sees them. A forged assistant answer can still mislead the model, which is acceptable only while every tool is read-only and owner-pinned.

### Route Handlers, not Server Actions

- **Why:** the chat endpoint streams a long response to `useChat` and is also called by non-browser clients. That is what Route Handlers are for. Server Actions fit form-driven mutations from React components, and this app has no mutations.

## Known limits

| Limit | Why it is acceptable here | What would change it |
|---|---|---|
| Rate limiter and cache are in process memory | Single-instance demo; failure mode is over-throttling, not bypass | A shared store (Redis/Upstash) |
| History is client-authored | Tools are read-only and owner-pinned | Server-side sessions or signed history |
| Mid-stream provider errors are not retried | Retrying would duplicate output already shown | Buffering whole steps (slower first token) |
| Free-tier quotas | It is a portfolio demo | Paid tiers, or a self-hosted model in the chain |
