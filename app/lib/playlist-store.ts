const DATABASE_NAME = "contin-player";
const DATABASE_VERSION = 1;
const PLAYLIST_STORE = "playlists";
const SETTINGS_STORE = "settings";
const ACTIVE_PLAYLIST_KEY = "activePlaylistId";

export interface PlaylistInputItem {
  url: string;
  title: string;
}

export interface PlaylistItem extends PlaylistInputItem {
  id: string;
  position: number;
  currentTime: number;
  duration: number;
  completed: boolean;
  progressUpdatedAt: string | null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  originalFilename: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
}

export interface PlaylistDetail {
  playlist: PlaylistSummary;
  currentItemId: string | null;
  items: PlaylistItem[];
}

interface PlaylistRecord {
  id: string;
  name: string;
  originalFilename: string | null;
  items: PlaylistItem[];
  currentItemId: string | null;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
}

interface SettingRecord {
  key: string;
  value: string | null;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function storageUnavailableError() {
  return new Error("這個瀏覽器無法使用 IndexedDB，請確認未停用網站資料儲存功能。");
}

function openDatabase() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(storageUnavailableError());
  }

  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PLAYLIST_STORE)) {
          database.createObjectStore(PLAYLIST_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? storageUnavailableError());
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error("瀏覽器資料庫正在被另一個分頁使用，請關閉其他分頁後重試。"));
      };
    });
  }

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("讀取瀏覽器資料失敗。"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("儲存瀏覽器資料失敗。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("儲存瀏覽器資料已取消。"));
  });
}

function enqueueWrite<T>(operation: () => Promise<T>) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function toSummary(record: PlaylistRecord): PlaylistSummary {
  return {
    id: record.id,
    name: record.name,
    originalFilename: record.originalFilename,
    itemCount: record.items.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastPlayedAt: record.lastPlayedAt,
  };
}

function toDetail(record: PlaylistRecord): PlaylistDetail {
  return {
    playlist: toSummary(record),
    currentItemId: record.currentItemId,
    items: record.items,
  };
}

function makeItem(item: PlaylistInputItem, position: number): PlaylistItem {
  return {
    id: crypto.randomUUID(),
    position,
    url: item.url,
    title: item.title,
    currentTime: 0,
    duration: 0,
    completed: false,
    progressUpdatedAt: null,
  };
}

export async function listPlaylists() {
  const database = await openDatabase();
  const transaction = database.transaction(PLAYLIST_STORE, "readonly");
  const records = await requestResult(
    transaction.objectStore(PLAYLIST_STORE).getAll() as IDBRequest<PlaylistRecord[]>,
  );
  await transactionDone(transaction);
  return records
    .sort((left, right) => {
      const leftDate = left.lastPlayedAt ?? left.updatedAt;
      const rightDate = right.lastPlayedAt ?? right.updatedAt;
      return rightDate.localeCompare(leftDate);
    })
    .map(toSummary);
}

export async function getPlaylist(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(PLAYLIST_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(PLAYLIST_STORE).get(id) as IDBRequest<PlaylistRecord | undefined>,
  );
  await transactionDone(transaction);
  return record ? toDetail(record) : null;
}

export async function getActivePlaylistId() {
  const database = await openDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readonly");
  const setting = await requestResult(
    transaction.objectStore(SETTINGS_STORE).get(ACTIVE_PLAYLIST_KEY) as IDBRequest<
      SettingRecord | undefined
    >,
  );
  await transactionDone(transaction);
  return setting?.value ?? null;
}

export function setActivePlaylist(id: string | null) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ key: ACTIVE_PLAYLIST_KEY, value: id });
    await transactionDone(transaction);
  });
}

export function createPlaylist(input: {
  name: string;
  originalFilename: string;
  items: PlaylistInputItem[];
}) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const items = input.items.map(makeItem);
    const record: PlaylistRecord = {
      id,
      name: input.name.trim(),
      originalFilename: input.originalFilename || null,
      items,
      currentItemId: items[0]?.id ?? null,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
    };
    const transaction = database.transaction([PLAYLIST_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(PLAYLIST_STORE).add(record);
    transaction
      .objectStore(SETTINGS_STORE)
      .put({ key: ACTIVE_PLAYLIST_KEY, value: id } satisfies SettingRecord);
    await transactionDone(transaction);
    return id;
  });
}

export function updatePlaylist(
  id: string,
  input: { name: string; originalFilename?: string; items?: PlaylistInputItem[] },
) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(PLAYLIST_STORE, "readwrite");
    const store = transaction.objectStore(PLAYLIST_STORE);
    const record = await requestResult(store.get(id) as IDBRequest<PlaylistRecord | undefined>);
    if (!record) {
      transaction.abort();
      throw new Error("找不到這個播放清單。");
    }

    let nextItems = record.items;
    if (input.items) {
      const itemsByUrl = new Map<string, PlaylistItem[]>();
      record.items.forEach((item) => {
        const matches = itemsByUrl.get(item.url) ?? [];
        matches.push(item);
        itemsByUrl.set(item.url, matches);
      });
      nextItems = input.items.map((item, position) => {
        const existing = itemsByUrl.get(item.url)?.shift();
        return existing
          ? { ...existing, position, url: item.url, title: item.title }
          : makeItem(item, position);
      });
    }

    const retainedIds = new Set(nextItems.map((item) => item.id));
    const updated: PlaylistRecord = {
      ...record,
      name: input.name.trim(),
      originalFilename:
        input.originalFilename === undefined ? record.originalFilename : input.originalFilename || null,
      items: nextItems,
      currentItemId:
        record.currentItemId && retainedIds.has(record.currentItemId)
          ? record.currentItemId
          : nextItems[0]?.id ?? null,
      updatedAt: new Date().toISOString(),
    };
    store.put(updated);
    await transactionDone(transaction);
  });
}

export function deletePlaylist(id: string) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction([PLAYLIST_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(PLAYLIST_STORE).delete(id);
    const settings = transaction.objectStore(SETTINGS_STORE);
    const active = await requestResult(
      settings.get(ACTIVE_PLAYLIST_KEY) as IDBRequest<SettingRecord | undefined>,
    );
    if (active?.value === id) settings.put({ key: ACTIVE_PLAYLIST_KEY, value: null });
    await transactionDone(transaction);
  });
}

export function setCurrentPlaylistItem(playlistId: string, itemId: string) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction([PLAYLIST_STORE, SETTINGS_STORE], "readwrite");
    const store = transaction.objectStore(PLAYLIST_STORE);
    const record = await requestResult(
      store.get(playlistId) as IDBRequest<PlaylistRecord | undefined>,
    );
    if (!record || !record.items.some((item) => item.id === itemId)) {
      transaction.abort();
      throw new Error("找不到要播放的影片。");
    }
    const now = new Date().toISOString();
    store.put({ ...record, currentItemId: itemId, updatedAt: now, lastPlayedAt: now });
    transaction
      .objectStore(SETTINGS_STORE)
      .put({ key: ACTIVE_PLAYLIST_KEY, value: playlistId } satisfies SettingRecord);
    await transactionDone(transaction);
  });
}

export function savePlaybackProgress(input: {
  playlistId: string;
  itemId: string;
  currentTime: number;
  duration: number;
  completed: boolean;
}) {
  return enqueueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction([PLAYLIST_STORE, SETTINGS_STORE], "readwrite");
    const store = transaction.objectStore(PLAYLIST_STORE);
    const record = await requestResult(
      store.get(input.playlistId) as IDBRequest<PlaylistRecord | undefined>,
    );
    if (!record) {
      transaction.abort();
      throw new Error("找不到播放進度所屬的清單。");
    }

    const now = new Date().toISOString();
    const items = record.items.map((item) =>
      item.id === input.itemId
        ? {
            ...item,
            currentTime: Math.max(0, Number.isFinite(input.currentTime) ? input.currentTime : 0),
            duration: Math.max(0, Number.isFinite(input.duration) ? input.duration : 0),
            completed: input.completed,
            progressUpdatedAt: now,
          }
        : item,
    );
    store.put({
      ...record,
      items,
      currentItemId: input.itemId,
      updatedAt: now,
      lastPlayedAt: now,
    } satisfies PlaylistRecord);
    transaction
      .objectStore(SETTINGS_STORE)
      .put({ key: ACTIVE_PLAYLIST_KEY, value: input.playlistId } satisfies SettingRecord);
    await transactionDone(transaction);
  });
}
