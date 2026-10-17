# Spec Delta

## Purpose

Provides members with secure access and control over their community profile while making reputation signals understandable and appropriately limited.

## ADDED Requirements

### Requirement: Members authenticate before protected actions
The system MUST authenticate members before allowing them to create listings, vote, claim tasks, or change protected profile information.

#### Scenario: Unauthenticated protected action
- **WHEN** an unauthenticated visitor attempts a protected action
- **THEN** the system denies the action and provides a path to authenticate

#### Scenario: Authenticated member action
- **WHEN** an authenticated member requests an action permitted by their role
- **THEN** the system evaluates the request using that member's identity and authorization

### Requirement: Members control profile visibility
The system MUST let members view and update their profile information and MUST NOT expose private profile fields to other members.

#### Scenario: Update profile
- **WHEN** a member submits valid changes to their own profile
- **THEN** the system saves the changes and displays only fields configured as public

#### Scenario: Read another member's profile
- **WHEN** a member views another member's profile
- **THEN** the system returns public profile fields and omits private fields

### Requirement: Trust and reputation are explainable
The system MUST present trust or reputation information with its contributing activity and MUST NOT imply that it is a verified measure of a person's character.

#### Scenario: View reputation details
- **WHEN** a member views a profile's reputation information
- **THEN** the system identifies the platform activities contributing to the displayed signals and labels them as platform-derived

#### Scenario: No contribution history
- **WHEN** a profile has no eligible contribution history
- **THEN** the system presents no reputation score or identifies the profile as having insufficient history

### Requirement: Community Admin permissions are scoped and explicit
The system MUST assign Admin permissions to a specific community and MUST allow that community's Admin to prepare policy proposals without directly activating policy changes.

#### Scenario: Community Admin prepares a policy proposal
- **WHEN** an authenticated Admin submits a policy proposal for a community they administer
- **THEN** the system accepts it for community governance review and does not change the active policy

#### Scenario: Member or unrelated Admin submits policy
- **WHEN** a member without Admin permission or an Admin from another community attempts to submit a community policy proposal
- **THEN** the system rejects the request without changing policy

#### Scenario: Bootstrap initial community Admin
- **WHEN** deployment configuration assigns an initial Admin to a community
- **THEN** the system grants Admin permissions only for that community and records the assignment

#### Scenario: Change Admin assignment after bootstrap
- **WHEN** a request attempts to grant or revoke a community Admin role after bootstrap
- **THEN** the system applies the change only when authorized by an approved community governance action