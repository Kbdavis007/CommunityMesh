# Spec Delta

## Purpose

Uses scheduled AI assistance to reduce routine community maintenance while preserving human authority over enforcement, governance, and consequential platform changes.

## ADDED Requirements

### Requirement: Scheduled agent runs are bounded and observable
The system MUST run configured moderation, curation, summarization, task-dispatch, and maintenance agents on their configured schedules and record each run's status and outcome.

#### Scenario: Scheduled run completes
- **WHEN** a configured agent schedule is triggered
- **THEN** the system records the agent, start time, outcome, and affected record identifiers

#### Scenario: Scheduled run fails
- **WHEN** an agent run fails or exceeds its configured limits
- **THEN** the system records the failure and does not report the run as successful

### Requirement: AI moderation can apply only temporary holds
The moderator MUST apply a temporary listing hold only when its result meets the configured high-confidence threshold and MUST NOT permanently remove content or impose account sanctions without human review.

#### Scenario: High-confidence harmful listing
- **WHEN** the moderator classifies a listing above the configured high-confidence threshold
- **THEN** the system temporarily holds the listing, records the classification, and queues it for human review

#### Scenario: Low-confidence or unavailable classification
- **WHEN** classification confidence is below threshold or the model is unavailable
- **THEN** the system does not automatically hold the listing and queues it for review as configured

### Requirement: Human reviewers control final moderation outcomes
The system MUST let an authorized human reviewer uphold or release a temporary hold and MUST retain the review outcome for audit.

#### Scenario: Reviewer releases a listing
- **WHEN** an authorized reviewer determines a held listing is allowed
- **THEN** the system releases the hold and restores the listing's eligible visibility

#### Scenario: Reviewer upholds a listing hold
- **WHEN** an authorized reviewer determines further action is warranted
- **THEN** the system records the decision and reason, and applies only the permitted human-authorized outcome

### Requirement: AI curation and summaries are advisory
The system MUST identify AI-generated rankings and summaries as such and MUST preserve the underlying listing or proposal as authoritative.

#### Scenario: View curated listings
- **WHEN** a member views a curated listing collection
- **THEN** the system presents recommendations without hiding otherwise eligible listings solely because they were not selected

#### Scenario: View a proposal summary
- **WHEN** a member views an AI-generated proposal summary
- **THEN** the system labels it as AI-generated and provides access to the full proposal

### Requirement: AI task dispatch follows configured rules
The task dispatcher MUST create human tasks only from configured, actionable findings and MUST avoid duplicate open tasks for the same finding.

#### Scenario: Dispatch an actionable finding
- **WHEN** an agent identifies a finding that meets configured task criteria
- **THEN** the system creates a task with its source, description, and review expectations

#### Scenario: Reprocess an existing finding
- **WHEN** a scheduled run encounters a finding that already has an open task
- **THEN** the system does not create a duplicate open task

### Requirement: Maintenance agents cannot change policy autonomously
The maintenance agent MUST limit itself to diagnostics and task proposals and MUST NOT alter governance rules, access controls, or production configuration without authorized human or governance approval.

#### Scenario: Maintenance finds an operational issue
- **WHEN** the agent detects an issue that meets configured criteria
- **THEN** the system records the diagnostic and may create a reviewable human task

#### Scenario: Maintenance proposes a policy change
- **WHEN** the agent identifies a possible policy or configuration change
- **THEN** the system records a recommendation for authorized review without applying the change

### Requirement: Agent processing protects private information
The system MUST restrict agent inputs to the minimum data required for the configured task and MUST NOT expose private profile fields in public agent activity records.

#### Scenario: Publish an agent activity record
- **WHEN** an agent run is shown in the public activity log
- **THEN** the system exposes its type, status, and permitted outcome details without disclosing private profile data