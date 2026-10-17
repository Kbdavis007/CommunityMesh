// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  IndexedDBStorageError,
  STORES,
  commitSyncPage,
  getAssetMetadata,
  getCachedRecords,
  getConflicts,
  getPendingOperations,
  getSyncCursor,
  openCommunityDatabase,
  putAssetMetadata,
  putConflict,
  putCachedRecord,
  queueOperation,
  type PendingOperation,
  type RecordConflict,
} from "./indexed-db";

const communityScope = { kind: "community", id: "river-town" } as const;

function openLegacyDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore(STORES.records, {
        keyPath: ["scopeId", "collection", "recordId"],
      });
      records.put({
        scopeId: "community:river-town",
        collection: "listings",
        recordId: "listing-1",
        revision: 1,
        updatedAt: "2026-10-16T00:00:00.000Z",
        value: { title: "Legacy listing" },
      });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

describe("versioned IndexedDB storage", () => {
  let factory: IDBFactory;
  let database: IDBDatabase;

  beforeEach(async () => {
    factory = new IDBFactory();
    database = await openCommunityDatabase(factory);
  });

  afterEach(() => {
    database.close();
  });

  it("stores scoped records and account-partitioned operations and conflicts", async () => {
    await putCachedRecord(database, communityScope, {
      collection: "listings",
      recordId: "listing-1",
      revision: 3,
      updatedAt: "2026-10-16T00:00:00.000Z",
      value: { title: "Community listing" },
    });
    await putCachedRecord(
      database,
      { kind: "account", id: "member-1" },
      {
        collection: "profiles",
        recordId: "member-1",
        revision: 1,
        updatedAt: "2026-10-16T00:00:00.000Z",
        value: { displayName: "Member one" },
      },
    );

    const operation: PendingOperation = {
      accountId: "member-1",
      operationId: "operation-1",
      communityId: "river-town",
      kind: "listing.update",
      entityId: "listing-1",
      baseRevision: 3,
      payload: { title: "Updated listing" },
      createdAt: "2026-10-16T00:01:00.000Z",
    };
    await queueOperation(database, operation);
    await queueOperation(database, { ...operation, accountId: "member-2" });

    const conflict: RecordConflict = {
      accountId: "member-1",
      conflictId: "conflict-1",
      collection: "listings",
      recordId: "listing-1",
      field: "title",
      baseValue: "Original",
      localValue: "Local",
      serverValue: "Server",
      baseRevision: 3,
      serverRevision: 4,
      detectedAt: "2026-10-16T00:02:00.000Z",
    };
    await putConflict(database, conflict);

    await expect(getCachedRecords(database, communityScope, "listings")).resolves.toMatchObject([
      { recordId: "listing-1", value: { title: "Community listing" } },
    ]);
    await expect(
      getCachedRecords(database, { kind: "community", id: "other-town" }, "listings"),
    ).resolves.toEqual([]);
    await expect(getPendingOperations(database, "member-1")).resolves.toEqual([operation]);
    await expect(getConflicts(database, "member-1")).resolves.toEqual([conflict]);
    await expect(getConflicts(database, "member-2")).resolves.toEqual([]);
  });

  it("commits records, tombstones, and the per-source cursor atomically", async () => {
    await putCachedRecord(database, communityScope, {
      collection: "listings",
      recordId: "deleted-listing",
      revision: 1,
      updatedAt: "2026-10-16T00:00:00.000Z",
      value: { title: "Remove me" },
    });

    await commitSyncPage(database, {
      scope: communityScope,
      source: "supabase",
      cursor: "cursor-2",
      updatedAt: "2026-10-16T00:03:00.000Z",
      records: [
        {
          collection: "listings",
          recordId: "listing-2",
          revision: 2,
          updatedAt: "2026-10-16T00:03:00.000Z",
          value: { title: "New listing" },
        },
      ],
      tombstones: [{ collection: "listings", recordId: "deleted-listing" }],
    });

    await expect(getCachedRecords(database, communityScope, "listings")).resolves.toMatchObject([
      { recordId: "listing-2", value: { title: "New listing" } },
    ]);
    await expect(getSyncCursor(database, communityScope, "supabase")).resolves.toMatchObject({
      cursor: "cursor-2",
    });
  });

  it("caches only public asset metadata", async () => {
    const metadata = {
      communityId: "river-town",
      assetId: "asset-1",
      cdnUrl: "https://cdn.example.test/asset-1",
      cacheVersion: "v2",
      visibility: "public" as const,
      cachedAt: "2026-10-16T00:04:00.000Z",
    };
    await putAssetMetadata(database, metadata);

    await expect(getAssetMetadata(database, "river-town", "asset-1")).resolves.toEqual(metadata);
    await expect(
      putAssetMetadata(database, { ...metadata, assetId: "private-1", visibility: "protected" }),
    ).rejects.toBeInstanceOf(IndexedDBStorageError);
    await expect(getAssetMetadata(database, "river-town", "private-1")).resolves.toBeUndefined();
  });

  it("preserves version-one records while upgrading all stores", async () => {
    database.close();
    factory = new IDBFactory();
    const legacyDatabase = await openLegacyDatabase(factory);
    legacyDatabase.close();

    database = await openCommunityDatabase(factory);

    expect(database.version).toBe(DATABASE_VERSION);
    expect(Array.from(database.objectStoreNames).sort()).toEqual(
      Object.values(STORES).sort(),
    );
    await expect(getCachedRecords(database, communityScope, "listings")).resolves.toMatchObject([
      { recordId: "listing-1", value: { title: "Legacy listing" } },
    ]);
  });

  it("surfaces storage failures instead of reporting a queued write", async () => {
    const operation: PendingOperation = {
      accountId: "member-1",
      operationId: "operation-1",
      communityId: "river-town",
      kind: "listing.create",
      entityId: "listing-1",
      baseRevision: null,
      payload: { title: "Pending listing" },
      createdAt: "2026-10-16T00:05:00.000Z",
    };
    database.close();

    await expect(queueOperation(database, operation)).rejects.toBeInstanceOf(
      IndexedDBStorageError,
    );

    const open = vi.spyOn(factory, "open").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
    });

    await expect(openCommunityDatabase(factory)).rejects.toBeInstanceOf(IndexedDBStorageError);
    open.mockRestore();
  });
});
