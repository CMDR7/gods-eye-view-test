import { Ion } from 'cesium';

const STORAGE_KEY = 'gev.cesiumIonToken';
const PERSIST_KEY = 'gev.cesiumIonToken.persist';

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function getStoredIonToken() {
  return readStorage(STORAGE_KEY) || '';
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
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
      window.localStorage.setItem(PERSIST_KEY, '1');
    } catch {
      throw new Error('Browser storage is unavailable; use this token for the current session only.');
    }
  } else {
    removeStorage(STORAGE_KEY);
    removeStorage(PERSIST_KEY);
  }

  return true;
}

export function clearIonToken() {
  removeStorage(STORAGE_KEY);
  removeStorage(PERSIST_KEY);
  Ion.defaultAccessToken = undefined;
}

export function getIonTokenStatus() {
  const token = getStoredIonToken();
  return {
    configured: Boolean(token),
    persisted: readStorage(PERSIST_KEY) === '1',
  };
}
