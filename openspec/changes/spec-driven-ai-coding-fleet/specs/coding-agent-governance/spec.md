# Spec Delta

## Purpose

Provides governed agent and skill profiles for coding workers so each task runs with explicit capabilities, bounded permissions, versioned instructions, and an auditable record of how its result was produced.

## ADDED Requirements

### Requirement: Agent profiles declare task capabilities and bounds
Each agent profile MUST declare its supported task types, required skills, permitted repository and spec paths, per-task resource bounds, and allowed operations.

#### Scenario: A task is assigned to an agent
- **WHEN** the boss selects an agent profile for a coding task
- **THEN** it verifies that the profile supports the task type and records the profile version and applicable limits

#### Scenario: A profile is incomplete or incompatible
- **WHEN** an agent profile lacks required bounds or does not support the task
- **THEN** the boss does not assign the task to that profile and records an explicit configuration failure

### Requirement: Communities can configure hub-specific profiles
The system MUST allow each community hub to configure agent and skill profiles within platform guardrails, while keeping one hub's configuration and permissions isolated from another's.

#### Scenario: A hub configures a profile
- **WHEN** an authorized hub administrator configures a permitted agent or skill profile
- **THEN** tasks for that hub use its validated profile configuration

#### Scenario: A profile is requested across hubs
- **WHEN** a task or administrator attempts to access another hub's profile configuration
- **THEN** the system denies access and does not disclose or apply that configuration

### Requirement: Skills are versioned and governed
The system MUST give each skill an identifiable version and governance status, and MUST bind a task to the exact approved skill versions it requires.

#### Scenario: A task starts with approved skills
- **WHEN** a task begins with all required skills available and approved
- **THEN** the worker loads those exact versions and records them for the task

#### Scenario: A required skill is missing or unapproved
- **WHEN** a required skill version is unavailable, withdrawn, or unapproved
- **THEN** the worker does not substitute an unapproved version and reports an explicit blocked outcome

### Requirement: Worker operations enforce profile permissions
Workers MUST enforce an assigned profile's path, operation, and resource restrictions before each corresponding action, and MUST deny operations not explicitly permitted.

#### Scenario: A change is within the allowed scope
- **WHEN** a worker action targets a permitted path and operation within configured bounds
- **THEN** the action may proceed and remains attributable to the assigned profile

#### Scenario: A change exceeds an allowed scope
- **WHEN** a worker action targets a disallowed path, exceeds a resource limit, or performs an unapproved operation
- **THEN** the worker denies the action and records a guardrail violation

#### Scenario: A task requires a schema change
- **WHEN** a task requires a database schema change and its profile does not explicitly permit that operation
- **THEN** the worker does not alter the schema and reports the unmet permission

### Requirement: Task provenance records agents, skills, models, and changes
The system MUST record each task's resolved spec paths, agent profile and version, skill versions used, AI model identifiers called, outcomes, and produced diff reference or digest.

#### Scenario: A task produces a result
- **WHEN** a task reaches a terminal outcome
- **THEN** its audit record identifies the specification, agent, skills, models, outcome, and resulting diff or failure

#### Scenario: An operation is denied
- **WHEN** a guardrail blocks a task action
- **THEN** the audit record identifies the denied action and applicable policy without treating the task as successful
