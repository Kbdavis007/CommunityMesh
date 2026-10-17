# Spec Delta

## Purpose

Lets authenticated members configure their own supported AI provider credentials without exposing secrets or allowing one member's credentials to be accessed or used by another.

## ADDED Requirements

### Requirement: Members manage only their own provider profiles
The system MUST allow an authenticated member to create, update, activate, deactivate, and remove configurations for supported AI providers, and MUST derive the profile owner from the authenticated identity.

#### Scenario: Member saves a provider credential
- **WHEN** an authenticated member submits a credential for a supported provider
- **THEN** the system validates the provider configuration and stores it under that member's identity

#### Scenario: Member changes another member's profile
- **WHEN** a member attempts to read or change a profile owned by a different identity
- **THEN** the system rejects the request without disclosing profile data or changing either profile

#### Scenario: Member disables or removes a provider
- **WHEN** a member deactivates or removes one of their provider configurations
- **THEN** the system stops selecting that configuration for subsequent requests and preserves no usable credential after removal

### Requirement: Provider credentials remain confidential
The system MUST protect provider credentials at rest and MUST NOT return plaintext credentials to clients or include them in logs, analytics, or user-visible errors.

#### Scenario: Member views a saved profile
- **WHEN** a member views their provider profile
- **THEN** the system returns provider identity, configuration status, and non-secret metadata without returning the credential

#### Scenario: Credential validation fails
- **WHEN** a submitted credential is invalid or the provider validation service is unavailable
- **THEN** the system reports a safe validation outcome without exposing the credential in the response or operational logs

### Requirement: Provider configurations are constrained to supported providers
The system MUST accept only the supported provider identifiers Groq, OpenRouter, Gemini Flash, Cohere, Fal.ai, Together AI, and HuggingFace, and MUST validate provider-specific configuration before marking a credential active.

#### Scenario: Member submits an unsupported provider
- **WHEN** a member submits a provider identifier outside the supported set
- **THEN** the system rejects the configuration and does not store or activate its credential

#### Scenario: Provider configuration passes validation
- **WHEN** a supported provider credential and its required settings pass validation
- **THEN** the system records the provider as eligible for the member to activate

#### Scenario: Provider configuration cannot be verified
- **WHEN** provider validation cannot confirm the credential because the provider is unavailable
- **THEN** the system does not report the credential as validated or eligible for routing
