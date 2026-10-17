# Spec Delta

## Purpose

Provides one authenticated application-facing AI endpoint that routes supported tasks to eligible configured providers. It keeps provider-specific behavior and credentials behind the service boundary while making selection, quota, and fallback outcomes explicit.

## ADDED Requirements

### Requirement: Supported AI tasks use one application endpoint
The system MUST accept supported AI requests through `POST /api/v1/ai/route` using a validated task type (`chat`, `summarize`, `classify`, `embed`, or `image_generate`), priority (`realtime`, `normal`, or `batch`), quality (`frontier`, `balanced`, or `cheap`), non-negative context estimate, agent identifier, and task payload, and MUST NOT expose provider-specific inference APIs to application clients.

#### Scenario: Supported request arrives
- **WHEN** a caller submits a valid supported request to the route
- **THEN** the system processes it using the shared request contract and returns a CommunityMesh result

#### Scenario: Request has invalid or unsupported fields
- **WHEN** a request contains an unknown task type, invalid priority or quality, negative context estimate, oversized payload, or malformed required field
- **THEN** the system rejects it before dispatching to any provider

#### Scenario: Caller requests chat moderation
- **WHEN** a request attempts to use the AI route for chat-content moderation
- **THEN** the system rejects it without invoking a model provider, leaving chat moderation to Stream AI Moderation

### Requirement: Requests are authenticated and attributed to trusted identities
The system MUST validate Supabase Auth before provider dispatch, derive the requesting user identity from the validated identity, and verify that the caller is allowed to invoke the requested agent.

#### Scenario: Request has no valid identity
- **WHEN** a request has no valid Supabase Auth identity
- **THEN** the system rejects it without contacting a provider

#### Scenario: Request supplies a mismatched user identifier
- **WHEN** the request includes a user identifier that differs from the validated identity
- **THEN** the system rejects it before provider dispatch and never attributes usage to that other user

#### Scenario: Caller requests an unauthorized agent
- **WHEN** an authenticated caller invokes an unknown or unauthorized agent identifier
- **THEN** the system rejects the request before provider dispatch

### Requirement: Provider selection respects task needs and current eligibility
The system MUST select an eligible configured provider using task capability, priority, quality, context size, provider health and latency, and available provider and application quota, without promising a permanent provider for any task.

#### Scenario: Multiple providers can serve a request
- **WHEN** more than one configured provider supports the requested task and satisfies current context, health, and quota constraints
- **THEN** the system ranks eligible providers according to the request's priority and quality needs and selects an eligible provider

#### Scenario: Preferred provider is unhealthy or constrained
- **WHEN** a provider is unavailable, incompatible with the task or context, or near a configured quota limit
- **THEN** the system excludes or down-ranks it and considers another eligible provider

#### Scenario: Task needs a provider capability
- **WHEN** a request requires embeddings or image generation
- **THEN** the system selects only a configured provider that supports the required capability

### Requirement: User, agent, and provider budgets are enforced and observable
The system MUST enforce configured per-user, per-agent, and provider request and token budgets, account for concurrent requests without allowing reservations to exceed those budgets, and record minimal routing and outcome metadata without retaining request prompts or sensitive payloads.

#### Scenario: Request would exceed a budget
- **WHEN** a request would exceed a configured user, agent, or provider budget
- **THEN** the system does not dispatch it to that constrained provider and follows an eligible fallback or returns an explicit unavailable outcome

#### Scenario: Request completes or fails
- **WHEN** provider dispatch succeeds, fails, or is rejected by quota
- **THEN** the system records the authenticated user and agent, selected provider and model when applicable, available usage, outcome, and time without storing the prompt or private profile data

#### Scenario: Concurrent requests compete for remaining budget
- **WHEN** concurrent requests attempt to reserve the same remaining budget
- **THEN** the system admits only requests covered by available budget and records rejected reservations as quota outcomes

### Requirement: Fallback is bounded and reported truthfully
The system MUST attempt only configured eligible fallbacks under bounded retry and time limits and MUST identify the actual provider and fallback status in a successful result.

#### Scenario: Primary provider fails and fallback is eligible
- **WHEN** a selected provider fails or becomes quota-constrained and a configured fallback supports the task within its own budget
- **THEN** the system attempts the fallback within the request's configured bounds and reports the provider that served the result

#### Scenario: All eligible providers fail or are constrained
- **WHEN** no configured provider can serve the request within its limits
- **THEN** the system returns an explicit unavailable or applicable cached/degraded result and does not represent it as fresh provider inference

#### Scenario: Provider failures occur during fallback
- **WHEN** a fallback attempt also fails or returns invalid output
- **THEN** the system stops at the configured attempt or deadline bound and returns an explicit failure or unavailable outcome

### Requirement: Provider outputs are validated before returning
The system MUST validate provider output against the requested task's CommunityMesh result shape and MUST NOT return raw provider responses or provider credentials.

#### Scenario: Provider returns valid output
- **WHEN** an eligible provider returns output that satisfies the task result contract
- **THEN** the system returns the validated task result with provider, model, and completion status

#### Scenario: Provider returns malformed output
- **WHEN** a provider response is malformed, incomplete, or does not satisfy the task result contract
- **THEN** the system rejects that response, records the outcome, and may attempt an eligible bounded fallback

#### Scenario: Provider returns credentials or unrelated fields
- **WHEN** a provider response contains fields outside the CommunityMesh result contract
- **THEN** the system excludes those fields from the client response

### Requirement: Quality and budget constraints apply to consequential tasks
The system MUST use the requested quality and priority as routing preferences subject to provider eligibility, quota, and configured policy, and MUST NOT imply that a requested quality level guarantees a specific model or provider.

#### Scenario: Governance-related request asks for frontier quality
- **WHEN** a governance-related request specifies frontier quality
- **THEN** the system prefers eligible providers meeting that quality policy but may select a lower tier, fallback, or unavailable result when policy, health, or budgets prevent the preferred choice

#### Scenario: User or agent budget is near its soft cap
- **WHEN** a request approaches a configured user or agent budget
- **THEN** the system may throttle or select a lower-cost eligible provider for non-critical work and identifies any degraded quality or fallback outcome
