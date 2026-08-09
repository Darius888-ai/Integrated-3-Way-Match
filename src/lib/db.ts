/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = "BoonHuatApp2DB";
const DB_VERSION = 2;

export async function initDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("poRecords")) {
        db.createObjectStore("poRecords", { keyPath: "poRecordId" });
      }
      if (!db.objectStoreNames.contains("grnRecords")) {
        db.createObjectStore("grnRecords", { keyPath: "grnRecordId" });
      }
      if (!db.objectStoreNames.contains("poJobs")) {
        db.createObjectStore("poJobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("grnJobs")) {
        db.createObjectStore("grnJobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("appState")) {
        db.createObjectStore("appState", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("auditLogs")) {
        db.createObjectStore("auditLogs", { keyPath: "audit_id" });
      }
      if (!db.objectStoreNames.contains("reports")) {
        db.createObjectStore("reports", { keyPath: "report_id" });
      }
      if (!db.objectStoreNames.contains("messageDrafts")) {
        db.createObjectStore("messageDrafts", { keyPath: "message_id" });
      }
      if (!db.objectStoreNames.contains("deptResponses")) {
        db.createObjectStore("deptResponses", { keyPath: "issue_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(storeName: string) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecord(storeName: string, record: any) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecords(storeName: string) {
  const db = await initDB();
  return new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecord(storeName: string, id: string) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveFile(id: string, file: File | Blob) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.put({ id, file });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFile(id: string) {
  const db = await initDB();
  return new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error);
  });
}
