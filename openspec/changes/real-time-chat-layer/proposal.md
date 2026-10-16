# Proposal

## Why

CommunityMesh has no real-time communication layer for community discussion, proposal deliberation, task coordination, or direct messages. A hosted chat service integrated with the existing Supabase identity and Cloudflare Worker boundary can provide these conversations while retaining community-scoped authorization and offline read access.

## What Changes

- Add Stream Chat as the hosted chat provider, with Stream AI Moderation as the sole automated chat moderation engine.
- Add Worker-mediated Supabase authentication, community and channel authorization, Stream user mapping, short-lived Stream token issuance, channel provisioning, and signed moderation webhook handling. The browser uses Stream's client SDK for real-time message transport after Worker authorization; privileged Stream credentials remain server-side.
- Add community, proposal, task, and direct-message channels with membership rules tied to active community membership, proposal eligibility, task assignment, and mutual DM access.
- Add React chat provider and route-level chat experiences with threaded replies, reactions, typing indicators, read receipts, moderation states, and an Admin moderation review surface.
- Cache recent message history visible to the member and per-channel sync cursors in IndexedDB for offline reading. Do not queue offline sends; degrade to cached read-only history when chat or token issuance is unavailable.
- Persist moderation webhook events in D1 and expose review and override actions to authorized Admins. Allow community-configured moderation thresholds and stricter proposal-channel rules; moderation decisions do not change governance eligibility or voting weight.
- Document provider quota checks, message and attachment limits, retention, and rollout constraints. Do not store private media or identity-verification images as chat attachments.
- Roll out incrementally: community chat, proposal discussions, task coordination, then direct messages.

## Capabilities

### New Capabilities
- `real-time-chat`: Authenticated, community-scoped Stream conversations, moderation, administrative review, and offline read access.

### Modified Capabilities
- None.

## Impact

- **Worker API:** `src/worker/index.ts` currently exposes only a versioned health route; it will gain authenticated chat endpoints and Stream webhook handling. Worker bindings will need server-only Stream credentials and the persistence resources required for moderation events.
- **Client:** `src/app/routes.tsx` currently contains lightweight route shells, and `src/main.tsx` mounts the router directly. The chat UI will add Stream client SDK integration and the proposed hub, proposal, task, and message routes.
- **Identity and authorization:** The Supabase schema already defines authenticated profiles, active community memberships, and member/admin roles. Chat authorization must use the authenticated member and relevant community, proposal, task, and relationship records rather than client-supplied membership claims.
- **Persistence and offline behavior:** D1 moderation-event storage, IndexedDB message caching, and incremental history synchronization are new. Existing application-shell offline behavior does not currently provide feature-data caching.
- **Dependencies and operations:** Add Stream client/server integrations and provider secrets; verify Maker account quotas and moderation behavior against the actual account before deployment. Stream is a new hosted-provider dependency; Workers must not run chat model inference.
- **Governance and safety:** Proposal discussion moderation must not affect voting rights. Any later proposal summaries must exclude blocked or quarantined content.
