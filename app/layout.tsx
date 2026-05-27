import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "var(--sidebar-w) 1fr",
              minHeight: "100vh",
            }}
          >
            <Sidebar />
            <main
              style={{
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              {children}
            </main>
          </div>
          <LunaAsk />
        </ThemeProvider>
      </body>
    </html>
  );
}
