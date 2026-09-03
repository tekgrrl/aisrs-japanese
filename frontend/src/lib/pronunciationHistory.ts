const DB_NAME = "aisrs-pronunciation";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const CREATED_AT_INDEX = "by-createdAt";

export type PronounceMode = "clear" | "paced";

export interface PronunciationEntry {
  key: string;
  text: string;
  mode: PronounceMode;
  pauseMs?: number;
  voice: string;
  audioBuffer: ArrayBuffer;
  mimeType: string;
  note: string | null;
  voiceUsed: string | null;
  createdAt: number;
}

/**
 * Matches the exact key expression used by the pronounce page — single
 * source of truth. `voice` is part of the key so switching voices produces
 * a fresh cache entry instead of replaying stale audio in a different voice.
 */
export function historyKey(text: string, mode: PronounceMode, pauseMs: number, voice: string): string {
  return `${mode}:${mode === "paced" ? pauseMs : ""}:${voice}:${text}`;
}

export function isHistoryAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex(CREATED_AT_INDEX, "createdAt");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function getDb(): Promise<IDBDatabase> {
  if (!isHistoryAvailable()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  dbPromise ??= openDb();
  return dbPromise;
}

export async function getEntry(key: string): Promise<PronunciationEntry | undefined> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as PronunciationEntry | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("pronunciationHistory.getEntry failed", error);
    return undefined;
  }
}

export async function putEntry(entry: PronunciationEntry): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("pronunciationHistory.putEntry failed", error);
  }
}

export async function getAllEntries(): Promise<PronunciationEntry[]> {
  try {
    const db = await getDb();
    const entries = await new Promise<PronunciationEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).index(CREATED_AT_INDEX).getAll();
      request.onsuccess = () => resolve(request.result as PronunciationEntry[]);
      request.onerror = () => reject(request.error);
    });
    return entries.reverse(); // newest first
  } catch (error) {
    console.warn("pronunciationHistory.getAllEntries failed", error);
    return [];
  }
}

export async function deleteEntry(key: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("pronunciationHistory.deleteEntry failed", error);
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("pronunciationHistory.clearAll failed", error);
  }
}
