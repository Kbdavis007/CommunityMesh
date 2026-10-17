# Spec Delta

## Purpose

Guides members through securely connecting and testing a supported personal AI provider using approachable language. It reports provider and reward outcomes accurately while preserving shared routing, security, and community reward policies.

## ADDED Requirements

### Requirement: Members can complete a guided provider setup
The system MUST present provider setup as a five-step flow with clear progress, a way to resume or move between completed steps, and plain-language guidance.

#### Scenario: Member opens provider setup
- **WHEN** a member starts the setup wizard
- **THEN** the system presents provider choice, account creation guidance, credential entry, an AI test, and routing explanation as five clearly ordered steps with current progress

#### Scenario: Member needs help during setup
- **WHEN** a member requests help from any wizard step
- **THEN** the system presents concise, provider-appropriate instructions without requiring knowledge of APIs or technical jargon

#### Scenario: Member uses assistive technology or reduced motion
- **WHEN** a member navigates the wizard with a keyboard, screen reader, touch input, or reduced-motion preference
- **THEN** all controls and progress are perceivable and operable without relying on animation, color, or pointer-only interaction

### Requirement: Provider choices are limited to supported onboarding options
The system MUST offer only providers enabled for onboarding by the trusted provider registry and MUST identify each option using its approved display name and verified capabilities.

#### Scenario: Member chooses a listed provider
- **WHEN** the registry enables Groq, Gemini, or OpenRouter for onboarding
- **THEN** the wizard presents that provider with its approved plain-language description and an explicit selection action

#### Scenario: A provider is unsupported or disabled
- **WHEN** a provider is not enabled in the trusted registry
- **THEN** the wizard does not allow the member to configure or activate it, even if a client submits its identifier

#### Scenario: Member opens provider account instructions
- **WHEN** a member chooses to create an account for a listed provider
- **THEN** the wizard opens only the provider's configured official account destination in a separate tab and keeps the setup progress available

### Requirement: Members can personalize and compare provider choices
The system MUST allow a member to give their configured AI buddy a display name and MUST make the provider comparison activity optional and grounded in verified provider information.

#### Scenario: Member names an AI buddy
- **WHEN** a member enters a valid display name for their AI buddy
- **THEN** the system associates that name only with the member's own provider profile and displays it as non-secret profile metadata

#### Scenario: Member skips the comparison activity
- **WHEN** a member chooses to skip the provider comparison activity
- **THEN** the wizard lets them continue without changing provider eligibility, configuration, or reward eligibility

#### Scenario: Member completes the comparison activity
- **WHEN** a member completes the optional comparison activity
- **THEN** the wizard explains differences only using registry-verified capabilities and does not claim unsupported performance, quality, or cost guarantees

### Requirement: Provider credentials are validated and kept secret
The system MUST validate credentials through the trusted server-side provider profile service and MUST NOT persist raw credentials in browser storage, analytics, logs, queue messages, or user-visible responses.

#### Scenario: Member submits a credential
- **WHEN** a member submits a credential for a supported provider
- **THEN** the system sends it only to the authenticated server-side profile service, clears the entry from the wizard after submission, and returns a non-secret validation status

#### Scenario: Credential input is incomplete or invalid
- **WHEN** the submitted credential is incomplete, malformed, or rejected by the provider
- **THEN** the wizard gives a friendly, actionable message and does not activate the provider or expose the credential

#### Scenario: Provider validation is temporarily unavailable
- **WHEN** the validation service or provider cannot verify the credential
- **THEN** the wizard distinguishes temporary unavailability from successful validation and offers a safe retry without claiming the provider is ready

#### Scenario: Member returns to a saved profile
- **WHEN** the wizard displays a previously submitted provider profile
- **THEN** it shows only non-secret metadata and never pre-fills or reveals the saved credential

### Requirement: Members can test a validated provider
The system MUST let a member test a successfully validated provider through the shared AI routing boundary and MUST show the actual success or failure outcome.

#### Scenario: Test call succeeds
- **WHEN** a member requests the “Write a fun sentence about CommunityMesh” test and inference returns a valid result
- **THEN** the wizard displays the result as the member's AI buddy response and identifies the actual provider used

#### Scenario: Test call fails or falls back
- **WHEN** the member's provider cannot serve the test or the shared router uses a site-managed fallback
- **THEN** the wizard reports the actual outcome and provider honestly, explains that CommunityMesh may use its own AI when needed, and does not describe fallback as success from the member's provider

#### Scenario: Member has not validated a provider
- **WHEN** a member attempts to test a provider that has not passed server-side validation
- **THEN** the system blocks the test and directs the member to complete validation first

### Requirement: Members control their own provider-first preference
The system MUST let a member set whether eligible requests should prefer their own configured providers and MUST default this preference to enabled for a new setup.

#### Scenario: New member completes setup
- **WHEN** a member has not previously selected a provider-use preference
- **THEN** the wizard presents “Always use my AI when possible” as enabled by default

#### Scenario: Member changes their preference
- **WHEN** a member saves a change to the provider-use preference
- **THEN** the system stores it only for that authenticated member and the shared router applies it without bypassing platform eligibility or safety rules

### Requirement: Setup activation is processed through safe retryable queues
The system MUST submit setup and reward events through `ai_user_setup_queue` and `ai_user_rewards_queue` using retry-safe references that contain no raw provider credentials.

#### Scenario: Setup event is accepted
- **WHEN** a member submits a provider setup event
- **THEN** the system queues an authenticated member and profile reference, reports a pending state until the boss worker confirms validation and activation, and never puts the credential in the queue payload

#### Scenario: Setup event is retried
- **WHEN** the same setup event is delivered more than once
- **THEN** the boss worker processes it idempotently and does not create duplicate profiles or activations

#### Scenario: Setup event cannot be processed
- **WHEN** the boss worker cannot validate or activate the profile
- **THEN** the wizard presents a recoverable failure state and does not report the provider as active

### Requirement: Onboarding rewards reflect confirmed community policy
The system MUST display Reward Tokens only after an idempotent reward event is confirmed by the active versioned community policy and ledger.

#### Scenario: Setup and test qualify for an onboarding reward
- **WHEN** the member completes eligible setup and test steps and the active community policy authorizes the requested 10 RT award
- **THEN** the system queues and applies the award once and shows the confirmed amount to the member

#### Scenario: Multiple configured providers qualify for a bonus
- **WHEN** a member adds multiple eligible providers and the active community policy authorizes a multiple-provider bonus
- **THEN** the system applies that bonus once for its qualifying source event and reports only the confirmed amount

#### Scenario: No reward policy authorizes an award
- **WHEN** no active policy authorizes the onboarding or multiple-provider reward
- **THEN** the system does not mint or promise Reward Tokens and explains that no reward is currently available

#### Scenario: Reward event is retried or rejected
- **WHEN** a reward event is retried or the ledger rejects it
- **THEN** the system creates no duplicate or unauthorized award and does not show an unconfirmed reward as earned
