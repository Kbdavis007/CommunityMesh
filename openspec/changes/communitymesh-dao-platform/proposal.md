# Proposal

## Why

Communities lack a single, locally focused place to coordinate free items, donations, events, jobs, services, and mutual aid while sharing governance and contributor work. CommunityMesh will provide these workflows with transparent, auditable automation and governance, using the requested Cloudflare and Supabase services as hosted infrastructure rather than claiming that those providers are decentralized.

## What Changes

- Introduce a React and Vite community application hosted on Cloudflare Pages, with local hubs, listings, profiles, contributor tasks, governance, and AI activity views.
- Route application data access through Cloudflare Workers; use Supabase for authentication, listing data, listing images, and task lifecycle, and D1 for governance, credit ledgers, and AI audit logs.
- Add searchable, filterable listings for donations, events, jobs, free items, services, and mutual aid.
- Add one-member-one-vote DAO proposals, configurable quorum and approval rules, proposal summaries, execution records, and a public governance log.
- Add auditable Contribution Credit, Work Credit, and DAO Token records, with task completion and credit awards coordinated by Workers.
- Add scheduled Cloudflare AI agents for moderation, curation, summarization, task dispatch, and maintenance. The moderator may apply a temporary hold to high-confidence harmful listings; a human must decide permanent enforcement, and an appeal path must be available.
- Document provider setup, schemas, API boundaries, scheduled jobs, operational limits, and recovery behavior.

## Capabilities

### New Capabilities
- `community-listings`: Create, browse, search, filter, and manage local community listings and their images.
- `community-identity`: Authenticate users and provide profiles with privacy-conscious community trust and reputation information.
- `dao-governance`: Create and summarize proposals, conduct one-member-one-vote elections, apply quorum and approval rules, execute passed proposals, and expose an audit log.
- `contribution-system`: Dispatch and complete human tasks and maintain auditable Contribution Credit, Work Credit, and DAO Token records.
- `ai-operations`: Run scheduled AI moderation, curation, summarization, task dispatch, and maintenance with human review and auditable outcomes.
- `community-experience`: Provide the React application routes and workflows for local hubs, listings, profiles, tasks, governance, and AI activity through Worker APIs.

### Modified Capabilities

None. The repository currently has no existing capability specs.

## Impact

This is a greenfield product in the current repository, which contains no application source or existing capability specs. The change will define a React/Vite and Tailwind client, Cloudflare Pages and Workers deployment, Supabase Auth/Postgres/Storage, Cloudflare D1, and Cloudflare AI integrations. Supabase will own user-facing listing and task records; D1 will own governance and credit/audit ledgers, with Workers coordinating cross-store operations and idempotency. DAO Tokens are an internal platform record, not a blockchain asset, and do not alter the selected one-member-one-vote model. The design must verify current free-tier quotas, model availability, account/payment requirements, privacy, and provider terms before implementation; the architecture cannot guarantee perpetual free operation or provider-independent decentralization.