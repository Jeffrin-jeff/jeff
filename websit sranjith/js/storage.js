"use strict";
/* ============================================================
   storage.js – saves reports on THIS device only (localStorage).
   Nothing is sent anywhere. Users can delete one report, clear
   everything, or export a backup file from history.html.
   ============================================================ */
const Store = (() => {
  const KEY = "lablens.reports.v1";

  const read = () => {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  };
  const write = (arr) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
      return true;
    } catch {
      return false; // storage full or blocked
    }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    /* false in some private-browsing modes */
    available() {
      try {
        localStorage.setItem("lablens.test", "1");
        localStorage.removeItem("lablens.test");
        return true;
      } catch {
        return false;
      }
    },

    /* newest report date first */
    list() {
      return read().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.savedAt || 0) - (a.savedAt || 0));
    },

    get(id) {
      return read().find((r) => r.id === id) || null;
    },

    /* returns the report id, or null if it could not be saved.
       If report.id already exists it is overwritten. */
    save(report) {
      const all = read();
      if (report.id) {
        const i = all.findIndex((r) => r.id === report.id);
        if (i >= 0) {
          all[i] = { ...report, savedAt: Date.now() };
          return write(all) ? report.id : null;
        }
      }
      const id = report.id || uid();
      all.push({ ...report, id, savedAt: Date.now() });
      return write(all) ? id : null;
    },

    remove(id) {
      return write(read().filter((r) => r.id !== id));
    },

    clear() {
      try {
        localStorage.removeItem(KEY);
        return true;
      } catch {
        return false;
      }
    },

    exportJSON() {
      return JSON.stringify({ app: "LabLens", version: 1, exported: new Date().toISOString(), reports: read() }, null, 2);
    },
  };
})();