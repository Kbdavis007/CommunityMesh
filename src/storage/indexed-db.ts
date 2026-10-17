export const DATABASE_NAME = "communitymesh-local";
export const DATABASE_VERSION = 2;

export const STORES = {
  records: "records",
  pendingOperations: "pending_operations",
  syncCursors: "sync_cursors",
  conflicts: "conflicts",
  assetMetadata: "asset_metadata",
} as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DataScope =
  | { kind: "community"; id: string }
  | { kind: "account"; id: string };

export type OperationKind =
  | "listing.create"
  | "listing.update"
  | "listing.archive"
  | "profile.update"
  | "task.completion_evidence";

export interface CachedRecordInput {
  collection: string;
  recordId: string;
  revision: number | null;
  updatedAt: string;
  value: JsonValue;
}

export interface CachedRecord extends CachedRecordInput {
  scopeId: string;
}

export interface PendingOperation {
  accountId: string;
  operationId: string;
  communityId: string;
  kind: OperationKind;
  entityId: string;
  baseRevision: number | null;
  payload: JsonValue;
  createdAt: string;
}

export interface SyncCursor {
  scopeId: string;
  source: "supabase" | "d1";
  cursor: string;
  updatedAt: string;
}

export interface RecordConflict {
  accountId: string;
  conflictId: string;
  collection: string;
  recordId: string;
  field: string;
  baseValue: JsonValue;
  localValue: JsonValue;
  serverValue: JsonValue;
  baseRevision: number;
  serverRevision: number;
  detectedAt: string;
}

export interface AssetCacheMetadata {
  communityId: string;
  assetId: string;
  cdnUrl: string;
  cacheVersion: string;
  visibility: "public" | "protected";
  cachedAt: string;
}

export interface SyncPage {
  scope: DataScope;
  source: SyncCursor["source"];
  cursor: string;
  updatedAt: string;
  records: readonly CachedRecordInput[];
  tombstones: readonly Pick<CachedRecordInput, "collection" | "recordId">[];
}

export class IndexedDBStorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "IndexedDBStorageError";
  }
}

export function scopeIdFor(scope: DataScope): string {
  if (!scope.id.trim()) {
    throw new IndexedDBStorageError("A non-empty data scope is required.");
  }

  return `${scope.kind}:${scope.id}`;
}

function storageError(operation: string, cause: unknown): IndexedDBStorageError {
  if (cause instanceof IndexedDBStorageError) {
    return cause;
  }

  return new IndexedDBStorageError(`IndexedDB could not ${operation}.`, cause);
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function upgradeDatabase(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
): void {
  if (oldVersion < 1) {
    database.createObjectStore(STORES.records, {
      keyPath: ["scopeId", "collection", "recordId"],
    });
  }

  const records = transaction.objectStore(STORES.records);
  ensureIndex(records, "byScope", "scopeId");
  ensureIndex(records, "byScopeCollection", ["scopeId", "collection"]);

  if (oldVersion < 2) {
    const operations = database.createObjectStore(STORES.pendingOperations, {
      keyPath: ["accountId", "operationId"],
    });
    ensureIndex(operations, "byAccount", "accountId");
    ensureIndex(operations, "byAccountCreatedAt", ["accountId", "createdAt"]);

    const cursors = database.createObjectStore(STORES.syncCursors, {
      keyPath: ["scopeId", "source"],
    });
    ensureIndex(cursors, "byScope", "scopeId");

    const conflicts = database.createObjectStore(STORES.conflicts, {
      keyPath: ["accountId", "conflictId"],
    });
    ensureIndex(conflicts, "byAccount", "accountId");

    const assets = database.createObjectStore(STORES.assetMetadata, {
      keyPath: ["communityId", "assetId"],
    });
    ensureIndex(assets, "byCommunity", "communityId");
    ensureIndex(assets, "byCommunityVersion", ["communityId", "cacheVersion"]);
  }
}

export function openCommunityDatabase(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<IDBDatabase> {
  if (!factory) {
    return Promise.reject(
      new IndexedDBStorageError("IndexedDB is unavailable in this browser."),
    );
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(storageError("open the local database", error));
      return;
    }

    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(storageError("open the local database", error));
      }
    };

    request.onupgradeneeded = (event) => {
      try {
        if (!request.transaction) {
          throw new Error("The schema upgrade transaction is unavailable.");
        }
        upgradeDatabase(request.result, request.transaction, event.oldVersion);
      } catch (error) {
        fail(error);
        request.transaction?.abort();
      }
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => {
      fail(new Error("Close older CommunityMesh tabs to upgrade local storage."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function runWriteTransaction(
  database: IDBDatabase,
  stores: string[],
  operation: string,
  schedule: (transaction: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;

    try {
      transaction = database.transaction(stores, "readwrite");
    } catch (error) {
      reject(storageError(operation, error));
      return;
    }

    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(storageError(operation, error));
      }
    };

    transaction.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error);

    try {
      schedule(transaction);
    } catch (error) {
      try {
        transaction.abort();
      } catch (abortError) {
        fail(new AggregateError([error, abortError], "IndexedDB transaction failed."));
        return;
      }
      fail(error);
    }
  });
}

function readRequest<T>(
  database: IDBDatabase,
  storeName: string,
  operation: string,
  schedule: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;

    try {
      transaction = database.transaction(storeName, "readonly");
      request = schedule(transaction.objectStore(storeName));
    } catch (error) {
      reject(storageError(operation, error));
      return;
    }

    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(storageError(operation, error));
      }
    };

    request.onsuccess = () => {
      if (!settled) {
        settled = true;
        resolve(request.result);
      }
    };
    request.onerror = () => fail(request.error);
    transaction.onabort = () => fail(transaction.error);
  });
}

function toCachedRecord(scope: DataScope, record: CachedRecordInput): CachedRecord {
  if (!record.collection.trim() || !record.recordId.trim()) {
    throw new IndexedDBStorageError("Cached records require a collection and record ID.");
  }

  return { ...record, scopeId: scopeIdFor(scope) };
}

export function putCachedRecord(
  database: IDBDatabase,
  scope: DataScope,
  record: CachedRecordInput,
): Promise<void> {
  let storedRecord: CachedRecord;
  try {
    storedRecord = toCachedRecord(scope, record);
  } catch (error) {
    return Promise.reject(storageError("prepare a cached record", error));
  }

  return runWriteTransaction(
    database,
    [STORES.records],
    "save a cached record",
    (transaction) => {
      transaction.objectStore(STORES.records).put(storedRecord);
    },
  );
}

export function getCachedRecords(
  database: IDBDatabase,
  scope: DataScope,
  collection: string,
): Promise<CachedRecord[]> {
  let range: IDBKeyRange;
  try {
    range = IDBKeyRange.only([scopeIdFor(scope), collection]);
  } catch (error) {
    return Promise.reject(storageError("prepare a cached-record query", error));
  }

  return readRequest(
    database,
    STORES.records,
    "read cached records",
    (store) => store.index("byScopeCollection").getAll(range),
  );
}

export function commitSyncPage(
  database: IDBDatabase,
  page: SyncPage,
): Promise<void> {
  const scopeId = scopeIdFor(page.scope);
  const records = page.records.map((record) => toCachedRecord(page.scope, record));

  for (const tombstone of page.tombstones) {
    if (!tombstone.collection.trim() || !tombstone.recordId.trim()) {
      return Promise.reject(
        new IndexedDBStorageError("Tombstones require a collection and record ID."),
      );
    }
  }

  return runWriteTransaction(
    database,
    [STORES.records, STORES.syncCursors],
    "commit a synchronization page",
    (transaction) => {
      const recordStore = transaction.objectStore(STORES.records);
      for (const record of records) {
        recordStore.put(record);
      }
      for (const tombstone of page.tombstones) {
        recordStore.delete([scopeId, tombstone.collection, tombstone.recordId]);
      }
      transaction.objectStore(STORES.syncCursors).put({
        scopeId,
        source: page.source,
        cursor: page.cursor,
        updatedAt: page.updatedAt,
      } satisfies SyncCursor);
    },
  );
}

export function getSyncCursor(
  database: IDBDatabase,
  scope: DataScope,
  source: SyncCursor["source"],
): Promise<SyncCursor | undefined> {
  let key: IDBValidKey[];
  try {
    key = [scopeIdFor(scope), source];
  } catch (error) {
    return Promise.reject(storageError("prepare a synchronization cursor query", error));
  }

  return readRequest(
    database,
    STORES.syncCursors,
    "read a synchronization cursor",
    (store) => store.get(key),
  );
}

export function queueOperation(
  database: IDBDatabase,
  operation: PendingOperation,
): Promise<void> {
  if (!operation.accountId.trim() || !operation.operationId.trim()) {
    return Promise.reject(
      new IndexedDBStorageError("Queued operations require an account and operation ID."),
    );
  }

  return runWriteTransaction(
    database,
    [STORES.pendingOperations],
    "queue an offline operation",
    (transaction) => {
      transaction.objectStore(STORES.pendingOperations).put(operation);
    },
  );
}

export function getPendingOperations(
  database: IDBDatabase,
  accountId: string,
): Promise<PendingOperation[]> {
  let range: IDBKeyRange;
  try {
    if (!accountId.trim()) {
      throw new Error("An account ID is required.");
    }
    range = IDBKeyRange.only(accountId);
  } catch (error) {
    return Promise.reject(storageError("prepare an offline-operation query", error));
  }

  return readRequest(
    database,
    STORES.pendingOperations,
    "read offline operations",
    (store) => store.index("byAccount").getAll(range),
  );
}

export function putConflict(
  database: IDBDatabase,
  conflict: RecordConflict,
): Promise<void> {
  if (!conflict.accountId.trim() || !conflict.conflictId.trim()) {
    return Promise.reject(
      new IndexedDBStorageError("Conflicts require an account and conflict ID."),
    );
  }

  return runWriteTransaction(
    database,
    [STORES.conflicts],
    "save a synchronization conflict",
    (transaction) => {
      transaction.objectStore(STORES.conflicts).put(conflict);
    },
  );
}

export function getConflicts(
  database: IDBDatabase,
  accountId: string,
): Promise<RecordConflict[]> {
  let range: IDBKeyRange;
  try {
    if (!accountId.trim()) {
      throw new Error("An account ID is required.");
    }
    range = IDBKeyRange.only(accountId);
  } catch (error) {
    return Promise.reject(storageError("prepare a conflict query", error));
  }

  return readRequest(
    database,
    STORES.conflicts,
    "read synchronization conflicts",
    (store) => store.index("byAccount").getAll(range),
  );
}

export function putAssetMetadata(
  database: IDBDatabase,
  metadata: AssetCacheMetadata,
): Promise<void> {
  if (metadata.visibility !== "public") {
    return Promise.reject(
      new IndexedDBStorageError("Only public asset metadata may be cached on the device."),
    );
  }
  if (!metadata.communityId.trim() || !metadata.assetId.trim()) {
    return Promise.reject(
      new IndexedDBStorageError("Asset metadata requires a community and asset ID."),
    );
  }

  return runWriteTransaction(
    database,
    [STORES.assetMetadata],
    "save public asset metadata",
    (transaction) => {
      transaction.objectStore(STORES.assetMetadata).put(metadata);
    },
  );
}

export function getAssetMetadata(
  database: IDBDatabase,
  communityId: string,
  assetId: string,
): Promise<AssetCacheMetadata | undefined> {
  let key: IDBValidKey[];
  try {
    if (!communityId.trim() || !assetId.trim()) {
      throw new Error("A community and asset ID are required.");
    }
    key = [communityId, assetId];
  } catch (error) {
    return Promise.reject(storageError("prepare an asset metadata query", error));
  }

  return readRequest(
    database,
    STORES.assetMetadata,
    "read public asset metadata",
    (store) => store.get(key),
  );
}
