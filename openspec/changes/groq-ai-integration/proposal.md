# Proposal

## Why

CommunityMesh's non-moderation AI agents need fast inference without exposing provider credentials to browsers or relying on unbounded provider quotas. A server-side Groq integration with measured quota budgets, controlled fallback, and an operational limits guide will make summarization, curation, dispatch, and maintenance work predictable under normal and burst traffic.

## What Changes

- Add an authenticated Cloudflare Worker `ai/groq` boundary that routes non-chat agent requests to configured Groq models and returns validated, structured results.
- Make Groq the primary inference provider for summarization, curation, task dispatch, and maintenance; keep Stream AI Moderation authoritative and out of scope.
- Track usage by agent and user, enforce configurable per-user and per-agent soft quotas, and account for provider-level request and token limits.
- Route quota-limited or unavailable work to configured Together AI, Cohere, or Hugging Face fallback providers; use local heuristics or cached summaries when online inference is unavailable.
- Add `openspec/operations/groq-limits.md` with dated, official Groq quota values, CommunityMesh workload mappings and scenarios, operational thresholds, a per-agent quota budget, and a maintenance instruction to refresh it whenever Groq changes its limits.
- Validate provider model identifiers and quotas against the current Groq console and documentation during implementation; do not treat example or historical values as authoritative.

## Capabilities

### New Capabilities

- `ai-inference`: Server-side inference for non-chat AI agents, including provider routing, authorization, quota enforcement, fallback, and graceful degradation.

### Modified Capabilities

None. The repository has no canonical specs yet; the existing `ai-operations` requirements are part of an in-progress change and do not need to change for this provider integration.

## Impact

- Cloudflare Worker API routing and environment bindings, currently represented by `src/worker/index.ts` and `src/worker/env.d.ts`; the Worker currently exposes only a health route.
- Worker tests for authorization, structured inference responses, quota accounting, fallback, and degraded operation.
- D1-backed usage and failure observability, subject to confirming the existing project data model and deployment bindings during implementation.
- New operational documentation at `openspec/operations/groq-limits.md`, separate from the change's planning artifacts.
- External services: Groq as primary inference, with Together AI, Cohere, or Hugging Face as configured fallbacks. Provider secrets remain server-side. No chat moderation, image/video generation, or browser-direct provider calls are introduced.
