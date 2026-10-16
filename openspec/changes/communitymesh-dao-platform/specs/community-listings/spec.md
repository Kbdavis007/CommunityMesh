# Spec Delta

## Purpose

Lets community members publish and discover local offers and needs across a consistent set of listing categories, with clear ownership, visibility, and moderation states.

## ADDED Requirements

### Requirement: Members can manage listings
Authenticated members MUST be able to create, edit, and archive listings in the donation, event, job, free item, service, and mutual aid categories.

#### Scenario: Create a listing
- **WHEN** an authenticated member submits valid listing details and one of the six defined categories
- **THEN** the system creates an active listing attributed to that member

#### Scenario: Reject invalid listing
- **WHEN** a member submits a listing missing required details or using an unsupported category
- **THEN** the system rejects it and identifies the invalid fields without creating a listing

### Requirement: Members can discover local listings
The system MUST let members search active listings by text and filter results by community and category.

#### Scenario: Search and filter listings
- **WHEN** a member searches within a community and applies one or more category filters
- **THEN** results include only matching active listings in that community and category set

#### Scenario: No matching listings
- **WHEN** no active listing matches the query and filters
- **THEN** the system returns an empty result set without exposing listings from other communities

### Requirement: Listing details and images respect access rules
The system MUST show listing details and accept only supported image uploads from the listing owner or an authorized moderator.

#### Scenario: Attach a supported image
- **WHEN** an authorized member attaches a supported image within configured size limits
- **THEN** the image is associated with the listing and can be displayed with its details

#### Scenario: Reject unauthorized image change
- **WHEN** a member who does not own a listing attempts to change its images
- **THEN** the system rejects the operation and leaves the listing unchanged

### Requirement: Listing moderation state is visible
The system MUST distinguish active listings from temporarily held or archived listings and provide an appeal path for an owner whose listing is held.

#### Scenario: Owner appeals a temporary hold
- **WHEN** an owner submits an appeal for a held listing
- **THEN** the system records the appeal for human review and does not treat the hold as a final removal

#### Scenario: Held listing is not publicly discoverable
- **WHEN** a listing is under temporary moderation hold
- **THEN** the listing is excluded from public search while its owner can see its status and appeal instructions