# Spec Delta

## Purpose

Coordinates community maintenance work and recognizes verified contributions through transparent, auditable platform credits that cannot be mistaken for money or blockchain assets.

## ADDED Requirements

### Requirement: Contributors can discover and claim tasks
The system MUST let authenticated members view eligible open tasks and claim a task only while it remains available.

#### Scenario: Claim an open task
- **WHEN** an authenticated member claims an eligible open task
- **THEN** the system assigns the task to that member and prevents another member from claiming it concurrently

#### Scenario: Claim an unavailable task
- **WHEN** a member attempts to claim a task that is no longer open or is not eligible for them
- **THEN** the system rejects the claim and leaves the task assignment unchanged

### Requirement: Task completion is reviewed
The system MUST let an assigned contributor submit completion evidence and MUST record the review outcome before awarding completion-based Work Credits.

#### Scenario: Approve completed work
- **WHEN** an authorized reviewer approves the contributor's submitted evidence
- **THEN** the system marks the task complete and initiates the configured Work Credit award

#### Scenario: Reject submitted work
- **WHEN** a reviewer rejects the submitted evidence
- **THEN** the system records the reason, leaves the task incomplete, and does not award completion-based Work Credits

### Requirement: Credit awards follow published rules
The system MUST maintain separate Contribution Credit, Work Credit, Reward Token, and Voting Token balances and identify the published rule or milestone that authorizes each award.

#### Scenario: Award an eligible contribution
- **WHEN** a qualifying activity satisfies a published award rule
- **THEN** the system records the credit type, amount, recipient, source activity, rule, and time

#### Scenario: Activity does not qualify
- **WHEN** an activity does not satisfy an award rule
- **THEN** the system creates no credit award and does not change the member's balance

### Requirement: Every qualifying action has a published reward rule
The system MUST define a versioned reward rule for each qualifying member action, including its credit type, amount, eligibility, frequency limit, and source event, and MUST apply an eligible reward no more than once per source event.

#### Scenario: Reward a qualifying login
- **WHEN** a member successfully logs in within the active login reward window for a community
- **THEN** the system awards the amount and credit type defined by that community's active login rule

#### Scenario: Repeat login within the reward window
- **WHEN** the same member logs in again before the active login reward window has elapsed
- **THEN** the system creates no second login reward

#### Scenario: Reward verified task completion
- **WHEN** an authorized reviewer approves a task with a published Reward Token rule
- **THEN** the system awards the configured Work Credits and Reward Tokens exactly once

### Requirement: Reward Tokens are minted only through authorized rules
The system MUST mint Reward Tokens only through server-authorized processing of published, versioned reward rules and MUST reject direct member requests to mint tokens.

#### Scenario: Apply an authorized token reward
- **WHEN** a qualifying action is accepted and its published reward rule authorizes Reward Tokens
- **THEN** the system appends a mint entry identifying the rule, member, amount, and source action

#### Scenario: Member requests arbitrary minting
- **WHEN** a member requests a token amount without an eligible source action and published rule
- **THEN** the system rejects the request and leaves token balances unchanged

### Requirement: Earned Reward Tokens grant Voting Token milestones
The system MUST grant non-transferable Voting Tokens according to the active, community-approved conversion policy applied to cumulative qualifying Reward Tokens earned in that community, without consuming the Reward Tokens.

#### Scenario: Cross a Voting Token milestone
- **WHEN** a member's cumulative eligible Reward Token earnings reach a threshold in the active conversion policy
- **THEN** the system grants the configured Voting Token amount and preserves the member's Reward Token balance

#### Scenario: Transfer-in does not count toward a milestone
- **WHEN** a member receives Reward Tokens from another member
- **THEN** the received amount does not increase cumulative earned Reward Tokens or grant Voting Tokens

### Requirement: Token economy values come from active community policy
The system MUST use the active, versioned community policy for action reward amounts and limits, Reward-to-Voting Token conversion, and perk prices rather than embedding economic values in application behavior.

#### Scenario: Apply a community-approved policy
- **WHEN** a qualifying action or perk redemption is processed
- **THEN** the system uses the active policy version for that member's community and records the version with the ledger event

#### Scenario: Proposed policy has not passed
- **WHEN** an Admin submits a policy change that has not been approved by the community
- **THEN** the system continues to use the previously active policy

### Requirement: Members can transfer Reward Tokens within their community
The system MUST let an authenticated member transfer available Reward Tokens to another member of the same community as one idempotent operation that cannot create a negative balance.

#### Scenario: Complete a token transfer
- **WHEN** a member transfers a valid Reward Token amount to another member in the same community
- **THEN** the system atomically debits the sender, credits the recipient, and records the transfer once

#### Scenario: Reject an invalid transfer
- **WHEN** a transfer exceeds the sender's available balance or targets a member outside the community
- **THEN** the system rejects the transfer without changing either balance

### Requirement: Members can redeem Reward Tokens for in-app perks
The system MUST let members spend Reward Tokens on active, published, non-cash in-app perks and MUST record each redemption without representing it as payment for external goods or services.

#### Scenario: Redeem an available perk
- **WHEN** a member redeems an active perk with sufficient Reward Tokens
- **THEN** the system debits the required amount once and records the perk and fulfillment state

#### Scenario: Reject an unavailable or unaffordable perk
- **WHEN** a perk is inactive or the member's available balance is insufficient
- **THEN** the system rejects redemption and leaves the balance unchanged

### Requirement: Credit ledger is auditable and retry-safe
The system MUST preserve an append-only history of credit changes and MUST apply each source activity's award no more than once.

#### Scenario: Retry an award request
- **WHEN** the same award request is processed more than once
- **THEN** the system records at most one award for that source activity and returns the existing result for retries

#### Scenario: Inspect credit history
- **WHEN** a member views their credit history
- **THEN** the system shows each balance separately with its award or adjustment reason and source

### Requirement: Credits are not represented as money
The system MUST identify Contribution Credits and Work Credits as non-transferable platform records, Reward Tokens as a non-cash app token for published transfers and perks, and Voting Tokens as non-transferable units used only for governance voting; none may be represented as fiat, an external blockchain asset, or guaranteed financial value.

#### Scenario: View a credit balance
- **WHEN** a member views a credit balance
- **THEN** the system identifies its type and displays the applicable earning, transfer, or redemption rules without implying monetary value

#### Scenario: Use Reward or Voting Tokens
- **WHEN** a member transfers or redeems Reward Tokens, or uses Voting Tokens in governance
- **THEN** the system permits only the published in-app use for that token type and does not offer cash or external-chain withdrawal