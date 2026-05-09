import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";

export default function NotFound() {
  return (
    <>
      <Topbar title="Customer not found" />
      <div
        style={{
          padding: "60px 28px",
          textAlign: "center",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 8,
          }}
        >
          That customer doesn&apos;t exist
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            marginBottom: 20,
            lineHeight: 1.55,
          }}
        >
          The customer you&apos;re looking for might have been deleted, or the
          link could be stale.
        </p>
        <Link
          href="/customers"
          style={{
            display: "inline-block",
            background: "var(--tg-primary)",
            color: "white",
            padding: "8px 14px",
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          ← Back to all customers
        </Link>
      </div>
    </>
  );
}
