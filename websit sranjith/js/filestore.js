"use strict";
/* Hands uploaded files from index.html to analyze.html through IndexedDB.
   The files are removed as soon as the analyze page reads them. */
const FileStore = (() => {
  const open = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open("lablens", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("handoff");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });

  async function put(files) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction("handoff", "readwrite");
      tx.objectStore("handoff").put(files, "files");
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    });
  }

  async function take() {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction("handoff", "readwrite");
      const store = tx.objectStore("handoff");
      let out = null;
      const g = store.get("files");
      g.onsuccess = () => { out = g.result || null; store.delete("files"); };
      tx.oncomplete = () => { db.close(); res(out); };
      tx.onerror = () => rej(tx.error);
    });
  }

  return { put, take };
})();