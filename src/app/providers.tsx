"use client";

import { ThemeProvider, Toaster, TooltipProvider } from "@puckoops/camelot";
import type { ReactNode } from "react";
import { DEFAULT_THEME } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPreference={DEFAULT_THEME}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
