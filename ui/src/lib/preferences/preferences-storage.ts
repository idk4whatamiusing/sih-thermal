"use client";

import { setClientCookie } from "../cookie.client";
import { setLocalStorageValue } from "../local-storage.client";
import {
  getPreferencePersistence,
  type PreferenceKey,
  type PreferencePersistence,
  type PreferenceValueMap,
} from "./preferences-config";

// This app is deployed as a static export (Cloudflare Worker serving static
// files + proxying /api/*, no live Next.js server) - Server Actions can
// never run in production here, so "server-cookie" just uses the same
// client-side cookie write as "client-cookie" rather than depending on one.
async function persistByMode(mode: PreferencePersistence, key: string, value: string): Promise<void> {
  switch (mode) {
    case "none":
      return;

    case "client-cookie":
    case "server-cookie":
      setClientCookie(key, value);
      return;

    case "localStorage":
      setLocalStorageValue(key, value);
      return;
  }
}

export function persistPreference<K extends PreferenceKey>(key: K, value: PreferenceValueMap[K]): Promise<void> {
  return persistByMode(getPreferencePersistence(key), key, value);
}
