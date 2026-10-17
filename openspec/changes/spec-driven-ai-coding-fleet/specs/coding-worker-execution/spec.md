# Spec Delta

## Purpose

Executes assigned coding tasks through narrowly scoped queue consumers that follow their resolved specifications and return validated, reviewable changes without writing to the main branch.

## ADDED Requirements

### Requirement: Specialized workers consume assigned queue tasks only
Each coding worker MUST consume tasks from `coding_tasks_queue` and MUST process only tasks matching its configured specialization and eligibility.

#### Scenario: A matching task is received
- **WHEN** a worker receives an eligible task for its specialization
- **THEN** it claims the task and begins processing it under the task's declared agent and skill requirements

#### Scenario: A mismatched or malformed task is received
- **WHEN** a worker receives a task for another specialization or with invalid required fields
- **THEN** it does not execute the task and reports the rejection through the configured failure or alert flow

### Requirement: Coding work is bounded by its resolved specification
Workers MUST load the task's referenced OpenSpec artifacts and MUST NOT begin code changes when the required specification is missing, invalid, or outside the task's permitted repository scope.

#### Scenario: Required specification is available
- **WHEN** a worker starts a task with valid permitted OpenSpec artifacts
- **THEN** it uses those artifacts as the behavioral contract for its changes

#### Scenario: Required specification cannot be loaded
- **WHEN** a worker cannot load or validate the task's required OpenSpec artifacts
- **THEN** it stops without producing code changes and reports an explicit failure

### Requirement: Queue delivery does not duplicate task effects
Workers MUST handle repeated delivery of the same task idempotently and MUST bound retries for transient processing failures.

#### Scenario: A task is delivered more than once
- **WHEN** a worker receives a task whose identifier already has a terminal outcome or active claim
- **THEN** it does not perform duplicate code changes and reports or acknowledges the existing task state

#### Scenario: A transient failure occurs
- **WHEN** task processing fails transiently
- **THEN** the worker retries only within the configured attempt and time bounds, then emits an explicit failure if exhausted

### Requirement: Worker changes remain isolated for human review
Workers MUST place task changes on bot-controlled branches and MUST NOT commit or write changes directly to the main branch.

#### Scenario: A worker completes code changes
- **WHEN** a worker produces a diff for a task
- **THEN** the diff is associated with an isolated bot branch and is available for human review through the configured pull-request workflow

#### Scenario: A task attempts a main-branch write
- **WHEN** a worker operation would write or commit directly to the main branch
- **THEN** the operation is denied and recorded as a guardrail violation

### Requirement: OpenSpec validation gates successful results
Workers MUST run the applicable OpenSpec validation before reporting a coding task as successful.

#### Scenario: OpenSpec validation passes
- **WHEN** a worker's task artifacts pass the required OpenSpec validation
- **THEN** the worker may emit a successful result with the validation outcome

#### Scenario: OpenSpec validation fails
- **WHEN** required OpenSpec validation fails or cannot run
- **THEN** the worker does not report success and emits the failure details through the result or alert flow

### Requirement: Results and failures are explicit and traceable
Workers MUST publish a result for each terminal task outcome to `coding_results_queue`, including task identity, status, diff or diff reference, explanation, validation outcome, and applicable failure details.

#### Scenario: A task completes
- **WHEN** a task reaches a terminal success or failure outcome
- **THEN** the worker publishes a truthful result to `coding_results_queue` and records any operational alert in `coding_alerts_queue`

#### Scenario: Downstream automation handles a successful result
- **WHEN** CI or GitHub automation accepts a validated successful result
- **THEN** it applies the change only to a bot branch and opens or updates a human-review pull request
