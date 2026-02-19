import { migrate } from "../migrateState.js";
import { mergeWithConflictStrategy, nextUpdatedAt } from "./conflict.js";

const LS_KEY = "nicofit_data_v5";
const REMOTE_PREFIX = "nicofit_remote_v1";
const AUTH_KEY = "nicofit_auth_user";

const defaultSyncStatus = {
  phase: "idle", // idle | syncing | conflict | error
  lastSyncedAt: null,
  error: null,
};

function createBrowserKV(storage) {
  return {
    getItem: (key) => storage?.getItem?.(key) ?? null,
    setItem: (key, value) => storage?.setItem?.(key, value),
    removeItem: (key) => storage?.removeItem?.(key),
  };
}

function getRemoteKey(userId) {
  return `${REMOTE_PREFIX}:${userId}`;
}

function getCurrentUser(localKV) {
  return localKV.getItem(AUTH_KEY) || "guest";
}

function parseEnvelope(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function createStorage({ local = createBrowserKV(globalThis.localStorage), remote = createBrowserKV(globalThis.localStorage) } = {}) {
  let syncStatus = { ...defaultSyncStatus };
  const listeners = new Set();

  const emit = (patch) => {
    syncStatus = { ...syncStatus, ...patch };
    listeners.forEach((cb) => cb(syncStatus));
  };

  const subscribeSyncStatus = (cb) => {
    listeners.add(cb);
    cb(syncStatus);
    return () => listeners.delete(cb);
  };

  const loadState = () => {
    const localEnvelope = parseEnvelope(local.getItem(LS_KEY), { state: null, metadata: {} });
    const migrated = migrate(localEnvelope.state || {}).state;
    return {
      state: migrated,
      metadata: {
        updatedAt: localEnvelope?.metadata?.updatedAt || {},
        lastSyncedAt: localEnvelope?.metadata?.lastSyncedAt || null,
      },
      userId: getCurrentUser(local),
    };
  };

  const saveState = async ({ state, previousState, metadata = {} }) => {
    const userId = getCurrentUser(local);
    emit({ phase: "syncing", error: null });

    try {
      const localUpdatedAt = nextUpdatedAt(metadata.updatedAt, state, previousState);
      const localEnvelope = {
        userId,
        state,
        metadata: {
          updatedAt: localUpdatedAt,
          lastSyncedAt: metadata.lastSyncedAt || null,
        },
      };
      local.setItem(LS_KEY, JSON.stringify(localEnvelope));

      const remoteEnvelope = parseEnvelope(remote.getItem(getRemoteKey(userId)), { state: {}, metadata: {} });
      const mergedState = mergeWithConflictStrategy(state, remoteEnvelope.state || {}, {
        local: localUpdatedAt,
        remote: remoteEnvelope?.metadata?.updatedAt || {},
      });

      const mergedUpdatedAt = {
        ...(remoteEnvelope?.metadata?.updatedAt || {}),
        ...localUpdatedAt,
      };

      const hasConflict = JSON.stringify(mergedState) !== JSON.stringify(state);
      const nowIso = new Date().toISOString();
      const mergedEnvelope = {
        userId,
        state: mergedState,
        metadata: {
          updatedAt: mergedUpdatedAt,
          lastSyncedAt: nowIso,
        },
      };

      remote.setItem(getRemoteKey(userId), JSON.stringify(mergedEnvelope));
      local.setItem(LS_KEY, JSON.stringify(mergedEnvelope));

      emit({
        phase: hasConflict ? "conflict" : "idle",
        lastSyncedAt: nowIso,
        error: null,
      });

      return { state: mergedState, metadata: mergedEnvelope.metadata };
    } catch (error) {
      emit({ phase: "error", error: String(error?.message || error) });
      return { state, metadata };
    }
  };

  return { loadState, saveState, subscribeSyncStatus };
}

export const appStorage = createStorage();
