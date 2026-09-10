"use client";

// The Cloudflare Worker gateway (gateway/src/index.ts, not modified by this
// app) requires a valid session for every /api/* request, including
// GraphQL queries that are otherwise public at the resolver level. Rather
// than touch that shared gateway, the whole dashboard is gated behind login
// here - an anonymous visitor sees a sign-in prompt instead of pages that
// would silently fail to load any data.
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";

export function DashboardAuthGate({ children }: { readonly children: ReactNode }) {
  const { user, loading, loginHref } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sign in to continue</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The thermal map, incidents, and AI predict tools all require a signed-in session.
          </p>
        </div>
        <Button asChild>
          <a href={loginHref}>Sign in with Google</a>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
