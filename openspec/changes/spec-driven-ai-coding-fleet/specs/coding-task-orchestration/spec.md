# Spec Delta

## Purpose

Routes coding requests through a durable queue and a governed boss process into prioritized, traceable tasks that specialized workers can execute within configured limits.

## ADDED Requirements

### Requirement: Coding requests enter through the request queue
The system MUST treat `coding_requests_queue` as the source of truth for coding requests and MUST NOT let coding workers execute tasks directly from HTTP user requests.

#### Scenario: A coding request is submitted
- **WHEN** an authorized producer submits a coding request
- **THEN** it is placed on `coding_requests_queue` for boss processing

#### Scenario: A worker receives direct user input
- **WHEN** a coding worker receives an HTTP request containing a coding task
- **THEN** it does not execute the task and leaves queue processing as the only execution path

### Requirement: The boss normalizes requests against OpenSpec
The boss MUST resolve each accepted request to its repository, applicable OpenSpec change and behavior spec, specialization, agent profile, and required skills before creating a worker task.

#### Scenario: A request has a resolvable specification
- **WHEN** the boss processes a valid request with applicable OpenSpec artifacts
- **THEN** it records the resolved spec paths and task requirements and publishes a normalized task to `coding_tasks_queue`

#### Scenario: A request cannot be grounded in OpenSpec
- **WHEN** the boss cannot resolve applicable OpenSpec artifacts or a permitted agent and skill set
- **THEN** it does not dispatch the request and records an actionable failure in `coding_alerts_queue`

### Requirement: Task assignment follows specialization and priority
The boss MUST assign normalized tasks only to eligible worker specializations and MUST preserve configured request priority when selecting among eligible queued tasks.

#### Scenario: A matching worker is available
- **WHEN** a normalized task is eligible for a configured specialization
- **THEN** the boss routes it to that specialization with its priority and required capabilities intact

#### Scenario: No specialization can accept a task
- **WHEN** no configured specialization can execute a normalized task
- **THEN** the boss retains or rejects it according to configured policy and emits an explicit status and alert

### Requirement: Quotas are enforced before dispatch
The boss MUST enforce configured per-agent, per-user, and per-project task limits before dispatch and MUST report quota-limited outcomes without exceeding those limits.

#### Scenario: Dispatch would exceed a configured limit
- **WHEN** accepting a task would exceed a per-agent, per-user, or per-project limit
- **THEN** the boss defers or rejects the task according to configured policy and records the applicable limit outcome

#### Scenario: Capacity becomes available
- **WHEN** a deferred task becomes eligible within its configured lifetime
- **THEN** the boss may dispatch it without duplicating its task record or exceeding a limit

### Requirement: Overloaded workers can be reassigned safely
The boss MUST be able to reassign a task when its assigned worker type is overloaded, while preserving task identity, required specialization, attempt limits, and audit history.

#### Scenario: A specialization is overloaded
- **WHEN** backlog or health policy identifies the assigned worker type as overloaded
- **THEN** the boss reassigns the task to an eligible available worker type or records an explicit deferred outcome

#### Scenario: A reassignment limit is reached
- **WHEN** a task reaches its configured reassignment or attempt limit
- **THEN** the boss stops reassignment and emits an actionable alert

### Requirement: Task lifecycle and fleet health are observable
The system MUST record task state transitions and expose queue backlog, worker health, success and failure outcomes, and quota or routing alerts to authorized operators.

#### Scenario: A task changes state
- **WHEN** the boss accepts, defers, dispatches, reassigns, or closes a task
- **THEN** it records the task identifier, transition, timestamp, and reason

#### Scenario: Fleet health or backlog crosses policy
- **WHEN** monitored worker health, queue depth, or quota health crosses a configured threshold
- **THEN** the system reports the condition through the operational monitoring or alert flow
