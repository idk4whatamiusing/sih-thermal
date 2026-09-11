import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

// Dashboard-only providers. The OceanX landing at / uses the bare root
// layout so none of this ever wraps or overlays the fullscreen experience.
export default function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen">
      <TooltipProvider>
        <PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </PreferencesStoreProvider>
      </TooltipProvider>
      {/* Used for this project's hosted demo. Feel free to remove it; it is not required for template functionality. */}
      <Analytics />
    </div>
  );
}
