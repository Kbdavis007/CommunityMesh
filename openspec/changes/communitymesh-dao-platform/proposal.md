# Proposal

## Why

Communities lack a single, locally focused place to coordinate free items, donations, events, jobs, services, and mutual aid while sharing governance and contributor work. CommunityMesh will provide these workflows with transparent, auditable automation and governance, using the requested Cloudflare and Supabase services as hosted infrastructure rather than claiming that those providers are decentralized.

## What Changes

- Introduce a React and Vite community application hosted on Cloudflare Pages, with local hubs, listings, profiles, contributor tasks, governance, and AI activity views.
- Make the application an installable, offline-first PWA whose interface reads persisted device data and synchronizes supported changes bidirectionally when connectivity returns.
- Route application data access through Cloudflare Workers; use Supabase for authentication, listing data, listing images, and task lifecycle, and D1 for governance, credit ledgers, and AI audit logs.
- Add searchable, filterable listings for donations, events, jobs, free items, services, and mutual aid.
- Add DAO proposals with one ballot per member weighted by snapshotted Voting Token balances, configurable quorum and approval rules, proposal summaries, execution records, and a public governance log.
- Add published action-based rewards and two auditable app-native tokens: Reward Tokens (RT) are earned for eligible activities, transferred within a community, and redeemed for approved non-cash in-app perks; every 100 RT earned cumulatively within a community grants 1 non-transferable Voting Token (VT) without consuming RT. VT is used only for voting. A qualifying login earns 0.001 RT once per member/community per UTC day.
- Add scheduled Cloudflare AI agents for moderation, curation, summarization, task dispatch, and maintenance. The moderator may apply a temporary hold to high-confidence harmful listings; a human must decide permanent enforcement, and an appeal path must be available.
- Document provider setup, schemas, API boundaries, scheduled jobs, operational limits, and recovery behavior.

## Capabilities

### New Capabilities
- `community-listings`: Create, browse, search, filter, and manage local community listings and their images.
- `community-identity`: Authenticate users and provide profiles with privacy-conscious community trust and reputation information.
- `dao-governance`: Create and summarize proposals, conduct elections weighted by snapshotted Voting Token balances, apply quorum and approval rules, execute passed proposals, and expose an audit log.
- `contribution-system`: Dispatch and complete human tasks; award Contribution Credits, Work Credits, and Reward Tokens under published action rules; convert cumulative Reward Token earnings into Voting Tokens; and support auditable Reward Token transfers and in-app perk redemption.
- `ai-operations`: Run scheduled AI moderation, curation, summarization, task dispatch, and maintenance with human review and auditable outcomes.
- `offline-sync`: Persist scoped application data on the device and synchronize supported local changes and server updates safely across intermittent connectivity.
- `community-experience`: Provide the installable web application routes and workflows for local hubs, listings, profiles, tasks, governance, and AI activity, including an offline-capable application shell.

### Modified Capabilities

None. The repository has no existing main capability specs.

## Impact

This is a greenfield product in the current repository, which contains no application source or existing capability specs. The change will define an installable React/Vite and Tailwind PWA, Cloudflare Pages and Workers deployment, Supabase Auth/Postgres/Storage, Cloudflare D1, and Cloudflare AI integrations. The browser service worker will cache the application shell; IndexedDB will hold scoped records and a durable outgoing queue, and the UI will render from that local store before synchronizing through Worker APIs. Supabase will own user-facing listing and task records; D1 will own governance and credit/token ledgers and AI audit logs, with Workers coordinating cross-store operations and idempotency. Reward Tokens and Voting Tokens are app-native ledger units, not blockchain assets or money: Reward Tokens support same-community transfers and non-cash in-app perks, while every 100 Reward Tokens earned cumulatively within a community grants 1 non-transferable Voting Token without consuming RT. The design must verify current free-tier quotas, model availability, account/payment requirements, privacy, and provider terms before implementation; the architecture cannot guarantee perpetual free operation or provider-independent decentralization.