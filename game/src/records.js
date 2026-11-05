// DEEPWAKE - personal completion records.
// Versioned, validated local data. Only completed expeditions qualify.
// If storage is unavailable or full, records stay in memory for this session.

const KEY = 'deepwake.records.v1';
const VERSION = 1;

function blank() {
  return {
    version: VERSION,
    bestTime: null,
    bestFullArchiveTime: null,
    fewestRecoveries: null,
    fewestRecoveriesTime: null,
    completions: 0,
    fullArchiveCompletions: 0,
  };
}

const isPos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNat = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);

function validate(raw) {
  const b = blank();
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return b;
  return {
    version: VERSION,
    bestTime: isPos(raw.bestTime) ? raw.bestTime : null,
    bestFullArchiveTime: isPos(raw.bestFullArchiveTime) ? raw.bestFullArchiveTime : null,
    fewestRecoveries: isNat(raw.fewestRecoveries) ? raw.fewestRecoveries : null,
    fewestRecoveriesTime: isPos(raw.fewestRecoveriesTime) ? raw.fewestRecoveriesTime : null,
    completions: isNat(raw.completions) ? raw.completions : 0,
    fullArchiveCompletions: isNat(raw.fullArchiveCompletions) ? raw.fullArchiveCompletions : 0,
  };
}

export function createRecords(storage) {
  let store;
  try { store = storage !== undefined ? storage : globalThis.localStorage; }
  catch { store = null; }

  let data = blank();
  let storageOk = !!store;
  if (store) {
    try {
      const raw = store.getItem(KEY);
      if (raw) data = validate(JSON.parse(raw));
    } catch {
      storageOk = false; // corrupt or blocked storage: ignore, keep in-memory
    }
  }

  function persist() {
    if (!store || !storageOk) return false;
    try {
      store.setItem(KEY, JSON.stringify(data));
      return true;
    } catch { storageOk = false; return false; }
  }

  return {
    get data() { return { ...data }; },
    get storageAvailable() { return storageOk; },
    reset() { data = blank(); persist(); },
    // Returns which records improved. `completed` must be true.
    commit({ completed, time, recoveries, archives }) {
      if (!completed) return [];
      if (!isPos(time) || !isNat(recoveries) || !isNat(archives)) return [];
      const improved = [];
      data.completions += 1;
      if (data.bestTime === null || time < data.bestTime) {
        data.bestTime = time; improved.push('bestTime');
      }
      if (archives >= 3) {
        data.fullArchiveCompletions += 1;
        if (data.bestFullArchiveTime === null || time < data.bestFullArchiveTime) {
          data.bestFullArchiveTime = time; improved.push('bestFullArchiveTime');
        }
      }
      // Fewer recoveries wins; completion time is only the tie-breaker.
      if (data.fewestRecoveries === null || recoveries < data.fewestRecoveries ||
          (recoveries === data.fewestRecoveries &&
           (data.fewestRecoveriesTime === null || time < data.fewestRecoveriesTime))) {
        data.fewestRecoveries = recoveries;
        data.fewestRecoveriesTime = time;
        improved.push('fewestRecoveries');
      }
      persist();
      return improved;
    },
  };
}

export { KEY, VERSION, blank, validate };
