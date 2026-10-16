# Design

## Context

The React application currently mounts a lightweight route map without an auth or data provider. The Worker currently serves only `/api/v1/health`; its generated environment has D1 and Cloudflare AI bindings, while its declared Supabase settings are optional. Supabase already owns profiles and community memberships, including active-member and admin roles. D1 already holds governance proposals, but no chat persistence or chat feature data is implemented. The service worker caches the application shell, not feature data.

See [proposal.md](./proposal.md) for motivation and [specs/real-time-chat/spec.md](./specs/real-time-chat/spec.md) for observable behavior.

## Goals / Non-Goals

**Goals:**
- Keep Stream server credentials and moderation webhook secrets in Worker secrets.
- Keep Supabase as identity and membership authority, D1 as the existing proposal authority and moderation audit store, and Stream as the message and automated moderation provider.
- Use the browser Stream SDK for live chat only after Worker authorization, with channel creation and membership mutations restricted to the server.
- Make authorization checks and moderation outcomes explicit at the boundary between providers.

**Non-Goals:**
- Proxying every message through the Worker or building a separate real-time transport.
- Running chat moderation inference with Cloudflare AI or Worker code.
- Adding offline sends, private-media hosting, or cross-community federation.

## Decisions

### Worker authorizes and provisions; browser SDK transports messages

The browser sends its Supabase access token and the requested community or resource to a Worker chat endpoint. The Worker validates the session, resolves current membership and resource eligibility from their authoritative stores, and uses Stream's server API to provision or retrieve the channel, reconcile its participant set, and issue a short-lived user token. It returns only the public Stream app key, the authenticated member's mapped Stream identity, the token, and authorized channel metadata. The Stream API secret is never returned to the client.

After authorization, the browser's Stream client SDK connects directly to Stream for message history, sends, live events, typing, reads, threads, and reactions. Stream permissions must prevent clients from creating channels, adding participants, or changing channel policy. The Worker remains the only path for issuing tokens and mutating membership or policy. Short-lived tokens and membership reconciliation limit stale access after eligibility changes; unauthorized requests fail closed.

This is preferred over proxying all chat traffic through Workers because it uses Stream's supported real-time client transport and avoids turning the Worker into a message relay. Provider app permissions and token/session lifetime must be verified before deployment.

### Authorization reads identity and resource data from existing authorities

Validate Supabase access tokens server-side and make membership decisions from Supabase's active community membership records, never from client-supplied role or community claims alone. Use the existing D1 `governance_proposals` record to resolve a proposal's community and the Supabase task record to resolve the assigned contributor. Direct-message participants must both be active members with mutual authorization in the relevant community; derive a canonical participant pair for a stable channel identity.

The current React application has no Supabase auth client or provider, so chat integration must connect to the authenticated session at the chat boundary and make protected routes request sign-in rather than imply access. The Worker must use the member's validated identity for Supabase reads and keep any required provider credentials server-only. If an authoritative record or provider is unavailable, deny new access rather than assume eligibility.

### Keep provider messages separate from the moderation audit

Stream remains authoritative for chat content and moderation actions. Add D1 tables for verified moderation events, administrative overrides, and the policy settings needed to represent community thresholds and stricter proposal rules. Store a unique Stream event identifier for idempotency, plus the required channel, message, label, confidence, action, timestamp, and reviewer/override audit fields. Never persist message bodies in the audit tables.

The webhook endpoint verifies the signature against the raw request body before parsing or writing the event, rejects invalid signatures, and deduplicates accepted events. Admin dashboard reads and override writes go through the Worker and require an active Admin membership. A human override updates the Stream moderation outcome using the provider's supported server API and records the actor, prior decision, new decision, and time in D1. Stream AI Moderation remains the only automated classifier; the Worker only validates, authorizes, persists, and enforces provider decisions.

Community-configured thresholds and stricter proposal rules are policy, not a second inference engine. Use Stream's available moderation configuration for the chosen account; confirm that its supported configuration can express the required scope and behavior before implementation. If it cannot, do not emulate moderation inference in Workers; return to the provider-policy decision before shipping.

The rollout gate is the fallback if the Maker account cannot express the requested policy: do not ship chat scopes that lack those moderation controls until Stream supports them or the user explicitly approves a different policy design. Do not silently introduce an application-side classifier or policy engine.

### Cache only content visible to the current member

Add a versioned IndexedDB store keyed by authenticated member and channel, with message identifiers, sender, timestamp, text, attachment metadata, moderation state, and a monotonic per-channel cursor. Reconcile incremental history on startup, foregrounding, and online events. Cache visible flagged messages with their warning state; do not cache quarantined content for ordinary members; scope shadow-blocked cached messages to the sender's local identity. Clear member-scoped cached data on sign-out or account change.

IndexedDB is preferred to service-worker caching because chat data is private, member-scoped feature data, while the existing service worker is intentionally limited to the public app shell. Offline views are read-only, and local optimistic sends must not be represented as authoritative or queued.

### Add chat within the existing React route and Worker structure

Add an authenticated chat provider that obtains a Worker-issued token before connecting the Stream client and closes the client on sign-out. Build route views for `/hub/chat`, `/governance/proposal/:proposalId/chat`, `/tasks/:taskId/chat`, and `/messages/:memberId`; each route requests its channel through the Worker and renders only authorized channel state. Keep Stream UI headless and compose it with the existing Tailwind design tokens and route layout.

Add versioned `/api/v1/chat` Worker endpoints for session/token issuance, channel authorization/provisioning, and Admin moderation operations, plus a dedicated Stream webhook endpoint. Preserve the health route and return explicit authentication, authorization, provider-limit, and unavailable errors. Do not call the existing Cloudflare AI binding for chat moderation.

### Treat account limits as deployment gates, not promises

Before deployment, record a dated check of the actual Stream Maker account's quotas, AI moderation availability, attachment support, webhook behavior, and channel limits. Configure message size, attachment size/type, and history retention to fit confirmed limits. Do not hard-code assumed free-tier quotas in product behavior. On provider throttling, report live chat as unavailable and expose cached history read-only; token issuance/authentication failure requires reauthentication.

## Risks / Trade-offs

- [A provider token or live connection can outlast a membership change briefly] → Use short-lived tokens, reconcile membership on every Worker authorization, remove revoked members from Stream channels, and test the maximum stale-access window.
- [Webhook delays can leave a short moderation visibility gap] → Configure Stream-side actions to enforce visibility at the provider, treat pending/unknown moderation as unapproved, and test delayed and duplicate webhook delivery.
- [Per-community or proposal-specific moderation settings may not be available on the selected Stream plan] → Verify configuration support against the actual Maker account before implementation and deployment; do not substitute Worker inference.
- [A free-tier quota may be exhausted or changed] → Record dated quota checks, bound history and attachment use, and retain read-only cached fallback.
- [Local history persists on shared devices] → Scope records by authenticated member, clear on sign-out/account change, and never place private message data in the public service-worker cache.
- [Stream lock-in affects messages and moderation operations] → Keep identity, authorization, policy, and moderation audit records in CommunityMesh-owned systems; isolate Stream-specific calls behind the chat service boundary.

## Migration Plan

1. Provision Stream credentials, webhooks, moderation configuration, and Worker/D1 resources in a non-production environment; verify actual account limits and moderation controls.
2. Add Worker authorization/token/channel flows, webhook verification, D1 audit/policy tables, and focused tests without exposing chat routes.
3. Integrate authenticated client setup, community chat, and member-scoped IndexedDB read caching; validate blocked, delayed, and offline cases.
4. Enable proposal chat, then task chat, then DMs behind independently controllable rollout flags after each channel's eligibility checks pass.
5. Monitor provider quotas and moderation outcomes during each rollout stage. To roll back, disable chat route access and token issuance, leave governance and identity data unchanged, and retain moderation audit records under their retention policy. Re-enable only after the failure is corrected.

## Open Questions

- Confirm actual Stream message, attachment, history-retention, webhook, and rate limits against the account before setting production values.
