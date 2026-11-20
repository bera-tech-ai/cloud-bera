'use strict';

// Bera adapter: keep imported pack data under global.db.data.xadon so it uses
// the existing PostgreSQL/JSON persistence instead of creating a second DB.
const store = () => {
  if (!global.db?.data) return {};
  if (!global.db.data.xadon) global.db.data.xadon = {};
  return global.db.data.xadon;
};
const persist = () => Promise.resolve(global.db?.write?.()).catch((error) => {
  console.error('[XADON DB]', error?.message || error);
});
module.exports = {
  get(key, fallback) {
    const data = store();
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
  },
  set(key, value) { store()[key] = value; persist(); return value; },
  delete(key) { delete store()[key]; persist(); },
  all() { return { ...store() }; },
};
