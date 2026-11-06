"use client";

import { PageRecovery } from "@/components/page-recovery";

// Replaces the root layout when a provider itself fails, so it owns html/body.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>
        <PageRecovery error={error} reset={reset} standalone />
      </body>
    </html>
  );
}
