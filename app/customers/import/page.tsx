/**
 * Import customers — /customers/import
 *
 * The three-step wizard: drop a CSV → Luna maps the columns (review/override)
 * → import with dedupe. All parsing and mapping preview run client-side on the
 * user's file; only the header + a few sample rows go to the mapping API, and
 * the final validated records go to the import API.
 */

import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { ImportWizard } from "./import-view";

export default function ImportPage() {
  return (
    <>
      <Topbar
        title="Import customers"
        actions={
          <Link
            href="/customers"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text-muted)",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            ← Customers
          </Link>
        }
      />
      <div style={{ padding: 28, maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <ImportWizard />
      </div>
    </>
  );
}
