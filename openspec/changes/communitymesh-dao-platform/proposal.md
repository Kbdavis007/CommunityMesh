# Proposal

## Why

Communities lack a single, locally focused place to coordinate free items, donations, events, jobs, services, and mutual aid while sharing governance and contributor work. CommunityMesh will provide these workflows with transparent, auditable automation and governance, using the requested Cloudflare and Supabase services as hosted infrastructure rather than claiming that those providers are decentralized. Public and semi-public media also need a scalable, cacheable delivery path without weakening access controls on private user media.

## What Changes

- Introduce a React and Vite community application hosted on Cloudflare Pages, with local hubs, listings, profiles, contributor tasks, governance, and AI activity views.
- Make the application an installable, offline-first PWA whose interface reads persisted device data and synchronizes supported changes bidirectionally when connectivity returns.
- Route application data access through Cloudflare Workers; use Supabase for authentication, profile and private media, application records, asset metadata, and task lifecycle; Cloudflare R2 for public and semi-public asset objects; and D1 for governance, credit ledgers, and AI audit logs.
- Add an `asset-hosting` capability that stores public and semi-public images and files in the `r2_assets` R2 bucket, issues authorized short-lived upload URLs, and provides `POST /r2/upload-url`, `GET /r2/file/:id`, and `GET /r2/image/:id` endpoints. Keep `r2_key`, `cdn_url`, and `cache_version` metadata in Supabase.
- Serve R2 assets through Cloudflare CDN with cache-control headers and image optimization where applicable. Proxy Supabase profile images through Cloudflare while preserving Supabase access rules; keep identity-verification and other private user media protected.
- Cache eligible public images on devices and asset metadata in IndexedDB; refresh cached assets when their `cache_version` changes without putting private media in shared caches.
- Add searchable, filterable listings for donations, events, jobs, free items, services, and mutual aid.
- Add DAO proposals with one ballot per member weighted by snapshotted Voting Token balances, configurable quorum and approval rules, proposal summaries, execution records, and a public governance log.
- Add a community-scoped Admin role that can propose token-policy changes for community vote. Keep action rewards, eligibility/frequency limits, RT-to-VT conversion, perk prices, and governance thresholds in versioned community configuration; only a passed vote activates a policy version.
- Add published action-based rewards and two auditable app-native tokens: Reward Tokens (RT) are earned for eligible activities, transferred within a community, and redeemed for approved non-cash in-app perks; Voting Tokens (VT) are earned according to the community-approved RT conversion policy and used only for voting.
- Add scheduled Cloudflare AI agents for moderation, curation, summarization, task dispatch, and maintenance. The moderator may apply a temporary hold to high-confidence harmful listings; a human must decide permanent enforcement, and an appeal path must be available.
- Document provider setup, schemas, API boundaries, scheduled jobs, operational limits, and recovery behavior.

## Capabilities

### New Capabilities
- `community-listings`: Create, browse, search, filter, and manage local community listings and their images.
- `asset-hosting`: Store and deliver public and semi-public assets through R2 and the CDN while preserving access controls for private Supabase media.
- `community-identity`: Authenticate users, provide privacy-conscious profiles, and enforce community-scoped member and Admin roles.
- `dao-governance`: Create and summarize proposals, conduct elections weighted by snapshotted Voting Token balances, allow Admins to submit policy changes for a community vote, apply configurable quorum and approval rules, execute passed proposals, and expose an audit log.
- `contribution-system`: Dispatch and complete human tasks; award Contribution Credits, Work Credits, and Reward Tokens under configurable published action rules; convert Reward Token earnings into Voting Tokens according to approved community policy; and support auditable transfers and in-app perk redemption.
- `ai-operations`: Run scheduled AI moderation, curation, summarization, task dispatch, and maintenance with human review and auditable outcomes.
- `offline-sync`: Persist scoped application data and eligible asset-cache metadata on the device, cache public images, and synchronize supported local changes and server updates safely across intermittent connectivity.
- `community-experience`: Provide the installable web application routes and workflows for local hubs, listings, profiles, tasks, governance, and AI activity, including an offline-capable application shell.

### Modified Capabilities

None. The repository has no existing main capability specs.

## Impact

This is a greenfield product in the current repository, which contains no application source or existing capability specs. The change will define an installable React/Vite and Tailwind PWA, Cloudflare Pages and Workers deployment, Supabase Auth/Postgres/Storage, the Cloudflare R2 `r2_assets` bucket, Cloudflare D1, and Cloudflare AI integrations. Supabase will own authentication, profile and private user media, listing and task records, and asset metadata; R2 will own public and semi-public asset objects. Workers will authorize asset operations and coordinate storage metadata, while the Cloudflare CDN serves eligible assets. The browser service worker will cache the application shell and eligible public images; IndexedDB will hold scoped records, asset-cache metadata, and a durable outgoing queue, and the UI will render from that local store before synchronizing through Worker APIs. Private Supabase media remains subject to Supabase access controls and is excluded from shared caches. D1 will own governance, versioned community policy, credit/token ledgers, and AI audit logs, with Workers coordinating cross-store operations and idempotency. Reward Tokens and Voting Tokens are app-native ledger units, not blockchain assets or money. Community Admins may propose changes to tokenomics and governance values, but each proposed policy becomes active only after the community approves it; initial values are supplied through deployment configuration rather than hard-coded in application logic. The design must verify current free-tier quotas, model availability, account/payment requirements, privacy, and provider terms before implementation; the architecture cannot guarantee perpetual free operation or provider-independent decentralization.