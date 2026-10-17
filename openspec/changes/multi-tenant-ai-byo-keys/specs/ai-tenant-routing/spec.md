# Spec Delta

## Purpose

Routes a member's AI requests through that member's active compatible providers before using site-managed AI, while accounting for tenant usage and applying authorized BYO rewards without weakening platform policy.

## ADDED Requirements

### Requirement: Active tenant providers are preferred when eligible
The system MUST attempt the authenticated member's active, validated provider configurations before site-managed routing when at least one configured provider supports the requested task.

#### Scenario: Member has an eligible provider
- **WHEN** a member's request can be served by one or more of their active, validated providers
- **THEN** the system selects among those providers using the member's configured order and platform eligibility constraints before attempting site-managed routing

#### Scenario: Member has no eligible provider for a task
- **WHEN** the member has no active, validated provider that supports the requested task
- **THEN** the system routes the request through the site's configured AI routing layer

#### Scenario: Platform policy excludes a tenant provider
- **WHEN** a tenant provider cannot satisfy platform safety, task, request-size, or policy constraints
- **THEN** the system excludes that provider and proceeds to another eligible tenant provider or the site routing layer

### Requirement: Tenant failures fall back to site routing within request bounds
The system MUST fall back to the site's configured AI routing layer when eligible tenant providers are exhausted by quota, fail, time out, or return invalid output, and MUST bound retries by the shared route's deadline and attempt policy.

#### Scenario: Tenant provider reports quota exhaustion
- **WHEN** an attempted tenant provider rejects a request because its quota is exhausted
- **THEN** the system records the provider outcome and attempts the site routing layer if time and policy bounds permit

#### Scenario: Tenant provider fails or times out
- **WHEN** a tenant provider fails, times out, or returns an invalid response
- **THEN** the system records the outcome and attempts the next eligible tenant provider or site routing layer within the configured retry bound

#### Scenario: No route can serve the request
- **WHEN** tenant providers and the site routing layer cannot complete the request within their limits
- **THEN** the system returns an explicit unavailable or failure result and does not present it as a successful fresh inference

### Requirement: Tenant AI usage is attributed and quota-aware
The system MUST account for each request against its authenticated member and selected provider, retain usage and outcome metadata needed for configured quota enforcement, and MUST NOT retain prompts or sensitive request payloads for that accounting.

#### Scenario: Tenant provider serves a request
- **WHEN** a tenant provider completes a request
- **THEN** the system records the authenticated member, provider, available token or request usage, outcome, and time for quota accounting

#### Scenario: Tenant provider attempt fails
- **WHEN** a tenant provider attempt fails, times out, or is rejected by its quota
- **THEN** the system records that outcome against the authenticated member without recording the request prompt or provider credential

#### Scenario: Concurrent requests contend for a tenant quota
- **WHEN** concurrent requests would exceed a configured per-member or per-provider budget
- **THEN** the system admits only requests within the configured budget and routes rejected work through eligible site fallback or returns an explicit unavailable result

### Requirement: Members can inspect their own AI usage
The system MUST provide each authenticated member a summary of their own AI usage and configured quota state without exposing another member's data, prompts, or provider credentials.

#### Scenario: Member views usage and quota state
- **WHEN** a member requests their usage summary
- **THEN** the system returns available request and token usage by provider and period together with applicable configured quota state

#### Scenario: Member has no recorded usage
- **WHEN** a member requests a summary before any AI usage has been recorded
- **THEN** the system returns an empty usage summary and the applicable configured quota state

#### Scenario: Member requests another member's usage
- **WHEN** a member attempts to request a usage summary for another identity
- **THEN** the system rejects the request without disclosing that member's usage

### Requirement: BYO rewards follow authorized versioned policies
The system MUST award Reward Tokens for eligible BYO onboarding, successful tenant-provider use, and configured usage milestones only through active versioned reward rules and MUST process each qualifying source event idempotently.

#### Scenario: Member completes eligible onboarding
- **WHEN** a member completes onboarding and the active community reward policy defines an eligible BYO onboarding award
- **THEN** the system records the policy-authorized Reward Token award once for that onboarding event

#### Scenario: Member successfully uses a tenant provider
- **WHEN** a tenant provider successfully completes an eligible request and the active policy authorizes a usage reward
- **THEN** the system records the policy-authorized Reward Token award once for that qualifying usage event

#### Scenario: Member reaches a configured usage milestone
- **WHEN** a member's eligible cumulative tenant-provider usage reaches a milestone in the active policy
- **THEN** the system records the configured Reward Token award once for that milestone

#### Scenario: A BYO reward event is retried or not eligible
- **WHEN** a reward event is retried or does not satisfy the active policy
- **THEN** the system creates no duplicate or unauthorized award and leaves the member's token balance unchanged

### Requirement: Tenant routing preserves shared guardrails
The system MUST apply the shared router's authentication, abuse limits, task validation, output validation, and moderation boundaries to tenant-provider requests and MUST NOT let a member credential change global routing policy.

#### Scenario: Tenant provider returns an invalid or unsafe result
- **WHEN** a tenant provider returns a result rejected by the shared validation or safety policy
- **THEN** the system rejects that result and follows only an eligible bounded fallback

#### Scenario: Member attempts to alter global routing policy
- **WHEN** a member's profile includes a provider preference or setting outside their own provider configuration
- **THEN** the system ignores or rejects it without changing global routing rules or another member's routing
