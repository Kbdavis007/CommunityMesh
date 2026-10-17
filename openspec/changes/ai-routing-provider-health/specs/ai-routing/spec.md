# Spec Delta

## Purpose

Defines configurable task-specific provider order and durable health, quota, and community preference signals for health-aware AI routing.

## ADDED Requirements

### Requirement: Routing uses a task-specific default provider chain
The system MUST use the following ordered provider/model chains as defaults for the listed tasks, while considering only configured, enabled providers that support the task and can satisfy current policy and budget constraints.

#### Scenario: Task has a configured default chain
- **WHEN** a task is routed without an applicable community override
- **THEN** the default chain is:
  | Task | Primary | Secondary | Fallback |
  |---|---|---|---|
  | Summarize | Groq Llama 3.3 70B | Gemini Flash | OpenRouter frontier models |
  | Classify | Qwen 2.5 72B (Groq) | Mistral via OpenRouter | HuggingFace free inference |
  | Embed | Cohere Embed | NVIDIA NIM embeddings | LiteLLM embedding fallback |
  | Image Generate | Fal.ai Flux | Replicate SDXL | HuggingFace Diffusers |
  | Metadata Extract | Groq Llama 3.3 8B | Gemini Flash Lite | OpenRouter balanced models |
  | Governance Analysis | Groq Llama 3.3 70B | Gemini Flash | Mistral Large |
  | Task Routing | Qwen 2.5 72B (Groq) | Mistral via OpenRouter | Together AI free tier |
  | Maintenance / Diagnostics | Groq Llama 3.3 8B | Gemini Flash Lite | OpenRouter cheap models |

#### Scenario: Default model is not available or eligible
- **WHEN** a model or provider in the default chain is disabled, unavailable, incompatible, unhealthy, or constrained by policy or quota
- **THEN** the system considers the next eligible entry and does not treat the default chain as a guarantee that a named model is available

### Requirement: Health and quota signals adjust candidate priority
The system MUST rank eligible providers using task priority, quality, context requirements, health, latency, quota headroom, and applicable user and agent budgets, preserving the configured chain order as the tie-breaker.

#### Scenario: Realtime task has different provider latency
- **WHEN** multiple eligible providers can satisfy a realtime task with different measured latencies
- **THEN** the system prefers the lower-latency provider while respecting quality, context, community, and platform policy

#### Scenario: Provider approaches its daily quota
- **WHEN** provider token usage exceeds 90% of its configured daily limit
- **THEN** the system deprioritizes that provider and considers another eligible entry

#### Scenario: Health or budget constrains a candidate
- **WHEN** a provider is degraded or a user or agent approaches a soft cap
- **THEN** the system lowers that candidate's priority and may select a cheaper eligible provider for non-critical work; a provider in cooldown or offline is skipped

### Requirement: Community routing preferences override defaults within platform policy
The system MUST allow an authorized community to configure provider preferences for its AI tasks and MUST apply them only within platform-configured provider allowlists, task capabilities, safety rules, and budget limits.

#### Scenario: Active community preference changes provider order
- **WHEN** an authorized community has an active routing preference for a task
- **THEN** the system uses that preference ahead of the default chain while retaining health, capability, quality, quota, and fallback eligibility checks

#### Scenario: Community preference exceeds platform constraints
- **WHEN** a community preference selects a disallowed provider, unsupported capability, or policy-ineligible quality or budget
- **THEN** the system ignores the ineligible selection and routes using the remaining eligible preference or default chain

#### Scenario: Community has no active preference
- **WHEN** no active community preference applies to the request
- **THEN** the system uses the task's configured default chain

### Requirement: Governance analysis quality is selected per case
The system MUST determine governance-analysis routing quality from the individual request's quality and priority, applicable community policy, task risk, provider health, and available budgets rather than requiring frontier-quality models for every governance task.

#### Scenario: Governance case permits a lower-cost eligible model
- **WHEN** a governance request's policy and risk allow a lower quality tier and its budget favors lower cost
- **THEN** the system may select an eligible lower-cost provider instead of requiring a frontier model

#### Scenario: Governance case requires higher quality
- **WHEN** a governance request's policy or risk calls for higher quality
- **THEN** the system prefers an eligible provider meeting that quality requirement, subject to platform limits and available quota, and reports fallback or degraded quality when it cannot

### Requirement: Provider cooldown adapts to observed health
The system MUST apply a configurable safe default cooldown and adapt its duration using provider failure and rate-limit signals and provider retry or reset guidance, bounded by configured minimum and maximum durations.

#### Scenario: Rate limiting or repeated failures extend cooldown
- **WHEN** a provider exceeds its configured rate-limit or failure threshold within the observation window
- **THEN** the system increases or applies its cooldown within the configured bounds and excludes that provider until the cooldown expires

#### Scenario: Provider retry guidance sets a longer cooldown
- **WHEN** a provider supplies a valid retry-after or reset time later than the default cooldown
- **THEN** the system honors that guidance within the configured maximum cooldown

#### Scenario: Health recovers
- **WHEN** subsequent health samples and elapsed cooldown indicate recovery
- **THEN** the system may reduce the adaptive cooldown or restore the provider to eligible status without exceeding the configured safe bounds

### Requirement: D1 stores provider catalog, health, and usage state
The system MUST persist provider metadata, health samples, provider quota usage, and per-user and per-agent budgets in D1 using the defined fields and stable keys.

#### Scenario: Provider catalog is persisted
- **WHEN** a provider is configured for routing
- **THEN** `ai_provider` stores its `provider_id` primary key, `name`, JSON `capabilities`, `priority_default`, `base_url`, and JSON `model_catalog`

#### Scenario: Provider health is sampled
- **WHEN** the router records a provider health sample
- **THEN** `ai_provider_health` stores `provider_id`, Unix `timestamp`, `latency_ms`, percentage `error_rate`, `rate_limit_hits`, `cooldown_until`, and a `status` of `healthy`, `degraded`, `offline`, or `cooldown`, keyed by provider and sample timestamp

#### Scenario: Provider quota is accounted
- **WHEN** the router records provider usage for a UTC day
- **THEN** `ai_provider_usage` stores daily request and token totals, rolling per-minute request and token totals, and daily and per-minute quota limits, keyed by provider and date

#### Scenario: User and agent budgets are accounted
- **WHEN** the router records usage for a user or agent for a UTC day
- **THEN** `ai_user_budget` and `ai_agent_budget` store daily request and token totals and configurable request and token soft caps, keyed by user or agent and date respectively

### Requirement: Quota accounting remains safe under concurrent routing
The system MUST ensure concurrent requests cannot reserve more provider, user, or agent request or token budget than is available, and MUST reconcile reservations with reported usage or provider failures.

#### Scenario: Concurrent requests contend for remaining quota
- **WHEN** concurrent requests attempt to reserve the same remaining quota
- **THEN** only reservations within the remaining applicable limits are admitted and rejected reservations do not dispatch to a provider

#### Scenario: Provider reports actual usage
- **WHEN** a request completes and the provider reports usage
- **THEN** the system reconciles the reservation with reported usage and updates the applicable provider, user, and agent accounting

### Requirement: Routing signals do not persist prompts or credentials
The system MUST keep provider credentials out of D1 routing records and MUST NOT persist prompts, completions, or sensitive task payloads in provider health, usage, budget, or routing outcome records.

#### Scenario: Routing outcome is recorded
- **WHEN** the system records a provider selection, fallback, cooldown, or quota outcome
- **THEN** it stores only the routing and accounting metadata needed for operations and does not store prompt content, completion content, or provider credentials
