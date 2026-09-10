"use client";

// Real auth state for the whole app, backed by the Cloudflare Worker
// gateway's Google OAuth (gateway/src/index.ts) - HttpOnly session cookie,
// never touched directly here. loginHref is relative so it works whether
// the UI is served from the same origin as the gateway (production) or
// proxied through NEXT_PUBLIC_API_URL in dev.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { createClient, ME, type User } from "@/lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

interface AuthState {
  user: User | null;
  loading: boolean;
  loginHref: string;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api.graphql<{ me: User | null }>(ME);
      setUser(d.me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.graphql("mutation { logout }").catch(() => undefined);
    setUser(null);
  }, []);

  const loginHref = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/google`;

  return (
    <AuthContext.Provider value={{ user, loading, loginHref, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
