import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { LunaAsk } from "@/components/luna-ask";
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
          <AppShell>{children}</AppShell>
          <LunaAsk />
        </ThemeProvider>
      </body>
    </html>
  );
}
