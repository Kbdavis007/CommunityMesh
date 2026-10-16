# Spec Delta

## Purpose

Provides authorized, bounded inference for CommunityMesh's non-moderation AI agents. It keeps provider credentials server-side and preserves usable degraded behavior when provider quotas or connectivity prevent inference.

## ADDED Requirements

### Requirement: Non-chat agents use the configured Groq inference route
The system MUST route summarization, curation, task dispatch, and maintenance inference through the authenticated `ai/groq` Worker boundary, using configured task-appropriate Groq models and structured outputs. The route MUST NOT perform chat moderation.

#### Scenario: Summarization request
- **WHEN** an authorized summarization agent submits a supported request
- **THEN** the Worker invokes the configured summarization model and returns a structured summary result

#### Scenario: Structured classification or dispatch request
- **WHEN** an authorized curator or task dispatcher submits a supported request
- **THEN** the Worker invokes the configured structured-task model and returns a validated classification or routing result

#### Scenario: Lightweight maintenance request
- **WHEN** an authorized maintenance agent submits a supported lightweight request
- **THEN** the Worker invokes the configured lightweight model and returns a structured diagnostic result

#### Scenario: Moderation is not routed to Groq
- **WHEN** a request asks the Groq route to perform chat moderation
- **THEN** the Worker rejects the request without invoking Groq or a fallback provider

### Requirement: Inference is authorized and provider details remain server-side
The system MUST validate Supabase Auth for each protected inference request, limit accepted agent and task inputs to configured values, and MUST NOT expose provider credentials or unfiltered provider responses to the browser.

#### Scenario: Request has no valid Supabase identity
- **WHEN** a client submits an inference request without a valid Supabase Auth token
- **THEN** the Worker rejects the request and does not call an inference provider

#### Scenario: Provider returns an inference result
- **WHEN** a valid request completes through a provider
- **THEN** the Worker returns only the validated CommunityMesh result shape and does not return provider secrets or a raw provider response

### Requirement: Usage quotas protect provider capacity
The system MUST record inference usage by agent and user, enforce configurable per-user and per-agent soft quotas within the provider's organization-level limits, and record quota rejections or provider failures without reporting them as successful inference.

#### Scenario: Request exceeds a user or agent soft quota
- **WHEN** a request would exceed a configured per-user or per-agent budget
- **THEN** the system prevents further primary-provider use for that request, records the quota outcome, and follows the configured fallback or degraded path

#### Scenario: Provider reports a rate limit
- **WHEN** Groq reports a rate limit or exhausted request/token budget
- **THEN** the system records the provider limit outcome and does not retry in a way that exceeds the configured request policy

#### Scenario: Inference completes
- **WHEN** a provider returns a usable result
- **THEN** the system records the agent, user, provider/model, request and token usage when available, outcome, and time

### Requirement: Provider fallback and degraded results are explicit
The system MUST use only configured fallback providers when Groq is unavailable or its limits prevent a request, and MUST make fallback or offline degraded outcomes distinguishable from normal Groq results.

#### Scenario: Groq quota or availability failure with fallback configured
- **WHEN** Groq cannot serve an eligible non-moderation request and a Together AI, Cohere, or Hugging Face fallback is configured
- **THEN** the system attempts the configured fallback under its own quota and returns a validated result marked with its actual provider and degraded or fallback status

#### Scenario: No provider is available
- **WHEN** neither Groq nor an eligible fallback can serve the request
- **THEN** the system uses an applicable local heuristic or cached summary, or returns an explicit unavailable result, without representing it as a fresh inference

#### Scenario: Offline inference request
- **WHEN** network connectivity is unavailable
- **THEN** the client uses an applicable local heuristic or cached summary, or reports inference unavailable without claiming a provider request succeeded

### Requirement: Groq quotas and CommunityMesh workload budgets are documented
The system's operational documentation MUST identify current official Groq limits and sources, map provider limits to per-user, per-agent, per-community, and burst workloads, and define a quota budget for each supported agent.

#### Scenario: Maintainer reviews the Groq limits guide
- **WHEN** a maintainer opens `openspec/operations/groq-limits.md`
- **THEN** the guide lists requests per minute and day, tokens per minute and day, concurrency information, a dated reference to Groq's official limits, workload scenarios, and an agent/model/calls-per-day/token-budget table

#### Scenario: Groq does not publish a concurrency quota
- **WHEN** the official Groq account limits do not expose a separate concurrency value
- **THEN** the guide identifies that provider limit as unpublished or unavailable and documents CommunityMesh's own concurrency control separately rather than inventing a Groq quota

#### Scenario: Groq publishes or changes a limit
- **WHEN** an official Groq limit changes or the limits guide is next operationally reviewed
- **THEN** maintainers verify the current organization/model limits against the official console and documentation, update the values and verification date, and recalculate the CommunityMesh budgets
