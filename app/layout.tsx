import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { LunaAskProvider } from "@/components/luna-ask-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luna Work — Travelgenix CRM",
  description: "The travel-native CRM, built on Supabase and Claude.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {/* The provider owns the one Luna and renders it, so the dashboard
              prompt line and the floating button open the same panel. */}
          <LunaAskProvider>
            <AppShell>{children}</AppShell>
          </LunaAskProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
