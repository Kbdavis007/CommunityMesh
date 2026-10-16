# Spec Delta

## Purpose

Provides a consistent, access-controlled path for public and semi-public images and files, while keeping private user media in Supabase Storage.

## ADDED Requirements

### Requirement: Public assets use the R2 asset store
The system MUST store public and semi-public non-profile images and files in the `r2_assets` bucket and MUST keep their identifying metadata in Supabase.

#### Scenario: Store a public community asset
- **WHEN** an authorized member uploads a listing photo, event or hub image, mesh node image, public document, attachment, or generated image
- **THEN** the object is stored in `r2_assets` and its metadata includes its R2 key, CDN URL, and cache version

#### Scenario: Keep private user media out of R2
- **WHEN** a member uploads an avatar, identity-verification image, or other private user-specific media
- **THEN** the media remains in Supabase Storage and is governed by its access policies

### Requirement: Asset uploads use authorized, expiring upload access
The system MUST authorize asset uploads through `POST /r2/upload-url` and issue short-lived upload access only for supported content and an authorized asset owner.

#### Scenario: Request an authorized upload
- **WHEN** an authorized member requests an upload for a permitted asset type and size
- **THEN** the system returns short-lived upload access scoped to that asset and records the associated metadata in Supabase

#### Scenario: Reject an invalid or unauthorized upload request
- **WHEN** a request has an unsupported type, exceeds configured limits, or targets a resource the requester cannot edit
- **THEN** the system rejects the request and creates no asset metadata

### Requirement: Asset retrieval enforces visibility
The system MUST resolve public and semi-public assets through `GET /r2/file/:id` or `GET /r2/image/:id` without exposing storage credentials or bypassing resource visibility rules.

#### Scenario: Retrieve a visible asset
- **WHEN** a visitor requests an asset they are authorized to view
- **THEN** the system returns the asset through its configured CDN URL with the correct content type

#### Scenario: Retrieve an unauthorized asset
- **WHEN** a visitor requests a private or unavailable asset without permission
- **THEN** the system denies access without disclosing the object key or protected content

### Requirement: Asset versions invalidate stale cached content
The system MUST maintain `r2_key`, `cdn_url`, and `cache_version` in Supabase metadata and MUST change the cache version when an asset's bytes or delivery policy changes.

#### Scenario: Replace an asset
- **WHEN** an authorized update replaces an asset or changes its cache-relevant policy
- **THEN** the system updates its metadata and cache version so clients can stop using the stale cached representation

### Requirement: CDN caching respects asset visibility
The system MUST apply cache-control headers to R2 responses for CDN delivery and MUST NOT expose protected content through a shared cache.

#### Scenario: Cache a public image
- **WHEN** a public image is served through the CDN
- **THEN** the response uses its configured cache policy and image optimization when supported

#### Scenario: Serve a protected asset
- **WHEN** an asset requires authorization
- **THEN** the response is authorized before delivery and is not stored in a shared cache

### Requirement: Existing public asset references survive migration
The system MUST migrate existing public asset objects and references to R2 without breaking their associated listings, events, or other records.

#### Scenario: Verify migrated asset references
- **WHEN** an existing public asset is migrated
- **THEN** its stable application identifier resolves to the R2-backed CDN asset and the source object is retained until the migrated reference is verified
