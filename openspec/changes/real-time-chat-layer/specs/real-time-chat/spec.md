# Spec Delta

## Purpose

Provides members with real-time, community-scoped conversations and safe access to their recent history when offline. It also gives authorized administrators auditable controls for reviewing chat moderation decisions.

## ADDED Requirements

### Requirement: Chat access is authenticated and community-scoped
The system MUST authenticate members with Supabase Auth and authorize access to each chat channel against current membership and channel-specific eligibility before granting Stream access.

#### Scenario: Active member requests chat access
- **WHEN** an authenticated active community member requests access to a channel in that community
- **THEN** the system authorizes the member for that channel and grants access without exposing privileged Stream credentials

#### Scenario: Inactive or out-of-scope member requests access
- **WHEN** a member is unauthenticated, inactive, or not eligible for the requested channel
- **THEN** the system denies access and does not issue a Stream token or add the member to the channel

#### Scenario: Membership is revoked
- **WHEN** a member's eligibility or active membership is revoked
- **THEN** subsequent authorization checks deny access and the member cannot continue to access the channel through a newly issued token

### Requirement: Chat channels enforce participant eligibility
The system MUST provide community, proposal, task, and direct-message channels whose participants satisfy the applicable community and resource-specific eligibility rules.

#### Scenario: Community channel access
- **WHEN** an active member requests the channel for their selected community hub
- **THEN** the system grants access only to that community's channel

#### Scenario: Proposal channel access
- **WHEN** a member requests a proposal discussion channel
- **THEN** the system grants access only if the member is eligible for the proposal's community

#### Scenario: Task channel access
- **WHEN** a member requests a task coordination channel
- **THEN** the system grants access only if the member is an assigned contributor to that task

#### Scenario: Direct-message channel access
- **WHEN** either participant requests a direct-message channel
- **THEN** the system grants access only to the two mutually authorized members and does not expose the channel to other community members

### Requirement: Members can use real-time chat
The system MUST allow authorized participants to exchange messages in real time and use typing indicators, read receipts, threaded replies, and reactions.

#### Scenario: Authorized member sends a message online
- **WHEN** an authorized member submits a message while connected
- **THEN** the message is sent through the Stream client SDK and its delivery and moderation state are reflected in the chat view

#### Scenario: Participant uses chat interactions
- **WHEN** a participant types, reads, replies to, or reacts to a message
- **THEN** the corresponding typing indicator, read receipt, thread, or reaction is available to eligible channel participants

### Requirement: Chat content uses Stream AI Moderation
The system MUST use Stream AI Moderation as the sole automated chat-content moderation engine and MUST NOT run chat moderation inference in Cloudflare Workers.

#### Scenario: Chat content is evaluated
- **WHEN** a message or supported image or video attachment is submitted
- **THEN** Stream AI Moderation evaluates the content and applies the configured action for its channel and community

#### Scenario: Moderation service is unavailable
- **WHEN** Stream moderation cannot evaluate submitted content
- **THEN** the system does not represent the content as approved and follows the configured safe failure behavior

### Requirement: Moderation outcomes are visible and enforceable
The system MUST enforce and communicate flagged, blocked, shadow-blocked, and quarantined moderation outcomes according to the viewer's authorization and the configured Stream action.

#### Scenario: Message is flagged
- **WHEN** a message receives a flag action
- **THEN** eligible viewers see the message marked with a warning

#### Scenario: Message is blocked
- **WHEN** a message receives a block action
- **THEN** the message is rejected and its sender receives a rejection notification

#### Scenario: Message is shadow-blocked
- **WHEN** a message receives a shadow-block action
- **THEN** its sender sees the message normally and other channel participants cannot see it

#### Scenario: Message is quarantined
- **WHEN** a message receives a quarantine action
- **THEN** ordinary participants see a pending-review placeholder instead of the quarantined content

### Requirement: Moderation policy is configurable and reviewable
The system MUST allow authorized community administrators to configure moderation thresholds, apply stricter rules to proposal channels, and review or override moderation decisions without changing governance eligibility or voting weight.

#### Scenario: Administrator configures channel policy
- **WHEN** an authorized administrator changes a community moderation threshold or proposal-channel policy
- **THEN** subsequent moderation in that scope uses the configured policy

#### Scenario: Administrator reviews a moderation decision
- **WHEN** an authorized administrator opens the moderation dashboard
- **THEN** the administrator can review flagged and quarantined content and override a Stream decision, with the override and actor recorded for audit

#### Scenario: Moderation affects proposal discussion
- **WHEN** a moderation action applies to proposal discussion content
- **THEN** the action does not change any member's voting weight or proposal eligibility

#### Scenario: Proposal discussion is summarized
- **WHEN** a proposal discussion summary is generated
- **THEN** blocked and quarantined content is excluded

### Requirement: Moderation events are verified and auditable
The system MUST validate Stream webhook signatures before accepting moderation events and MUST persist accepted events with their channel, message, label, confidence, action, and timestamp.

#### Scenario: Valid moderation webhook arrives
- **WHEN** a webhook has a valid Stream signature and contains a moderation event
- **THEN** the system records the event for administrative review and enforcement

#### Scenario: Invalid moderation webhook arrives
- **WHEN** a webhook signature is missing or invalid
- **THEN** the system rejects the event without persisting it as an authentic moderation decision

### Requirement: Recent chat history is available offline without offline sending
The system MUST cache recent authorized channel history and incremental-sync cursors for offline reading, while treating Stream as authoritative and never queuing offline message sends.

#### Scenario: Member reads cached history offline
- **WHEN** a member opens a previously synchronized channel without a network connection
- **THEN** the member can read eligible cached messages and the view indicates that live chat is unavailable

#### Scenario: Member sends while offline
- **WHEN** a member attempts to send a message without a live connection
- **THEN** the system does not queue or represent the message as sent

#### Scenario: History synchronizes
- **WHEN** the application starts, returns to the foreground, or regains connectivity
- **THEN** it synchronizes changed channel history from each channel's cursor and updates the cursor monotonically

#### Scenario: Moderated content is cached
- **WHEN** channel history is persisted locally
- **THEN** only messages visible to that member are cached, flagged messages retain warning metadata, quarantined content is not cached for ordinary participants, and shadow-blocked messages are cached only on the sender's device

### Requirement: Chat degrades safely under provider or quota failure
The system MUST keep privileged Stream credentials server-side, bound chat message and attachment usage, and provide a truthful read-only fallback when provider quotas or Worker token issuance prevent live chat.

#### Scenario: Stream rate limit or quota prevents live chat
- **WHEN** a provider limit prevents a chat operation
- **THEN** the system reports that chat is temporarily unavailable and offers cached history read-only when available

#### Scenario: Worker cannot issue a Stream token
- **WHEN** token issuance fails because authentication is expired or unavailable
- **THEN** the system requires reauthentication and does not initialize a privileged or unauthenticated chat session

#### Scenario: User uploads prohibited or oversized content
- **WHEN** an attachment exceeds configured limits or contains private media or identity-verification images
- **THEN** the system rejects the attachment before it is stored or sent through Stream

#### Scenario: Chat is prepared for deployment
- **WHEN** a deployment is approved
- **THEN** operators have recorded a dated check of applicable Stream Maker quotas, configured message and attachment limits, and documented history retention
