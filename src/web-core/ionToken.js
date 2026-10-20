import { Ion } from 'cesium';

const STORAGE_KEY = 'gev.cesiumIonToken';
const SESSION_KEY = 'gev.cesiumIonToken.session';
const PERSIST_KEY = 'gev.cesiumIonToken.persist';

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function getStoredIonToken() {
  return (
    readStorage(window.localStorage, STORAGE_KEY) ||
    readStorage(window.sessionStorage, SESSION_KEY) ||
    ''
  );
}

export function hasStoredIonToken() {
  return Boolean(getStoredIonToken());
}

export function applyStoredIonToken() {
  const token = getStoredIonToken().trim();
  if (!token) return false;
  Ion.defaultAccessToken = token;
  return true;
}

export function saveIonToken(token, persist = true) {
  const normalized = token.trim();
  if (!normalized) throw new Error('A Cesium Ion access token is required.');

  Ion.defaultAccessToken = normalized;

  if (persist) {
    removeStorage(window.sessionStorage, SESSION_KEY);
    if (!writeStorage(window.localStorage, STORAGE_KEY, normalized)) {
      throw new Error(
        'Browser storage is unavailable; use this token for the current session only.',
      );
    }
    writeStorage(window.localStorage, PERSIST_KEY, '1');
  } else {
    removeStorage(window.localStorage, STORAGE_KEY);
    removeStorage(window.localStorage, PERSIST_KEY);
    if (!writeStorage(window.sessionStorage, SESSION_KEY, normalized)) {
      throw new Error(
        'Session storage is unavailable; enable “Remember on this device” or allow browser storage.',
      );
    }
  }

  return true;
}

export function clearIonToken() {
  removeStorage(window.localStorage, STORAGE_KEY);
  removeStorage(window.localStorage, PERSIST_KEY);
  removeStorage(window.sessionStorage, SESSION_KEY);
  Ion.defaultAccessToken = '';
}

export function getIonTokenStatus() {
  const localToken = readStorage(window.localStorage, STORAGE_KEY);
  const sessionToken = readStorage(window.sessionStorage, SESSION_KEY);
  return {
    configured: Boolean(localToken || sessionToken),
    persisted: Boolean(localToken),
  };
}
