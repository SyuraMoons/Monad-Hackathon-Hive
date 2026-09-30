"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/ui/Logo";
import { PillButton } from "@/components/ui/Pill";
import { useSession } from "@/lib/stores/session";

// Temporary sign-in so the app shell's guard can be exercised. Step 4 replaces this with Figma Login 46:57.
function LoginPlaceholder() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { status, error, signIn } = useSession();

  async function go() {
    if (await signIn()) router.replace(next?.startsWith("/") ? next : "/canvas");
  }

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="flex w-full max-w-[520px] flex-col items-start gap-5 border border-ink px-11 pt-11 pb-10">
        <Logo />
        <h1 className="font-display text-[36px] leading-[1.1]">Sign in</h1>
        <p className="text-[17px] text-ink-2">The full login flow is planned for step 4.</p>
        <PillButton onClick={go} disabled={status === "signing-in"}>
          {status === "signing-in" ? "Waiting for your passkey…" : "Continue with passkey"}
        </PillButton>
        {status === "error" && error && (
          <p role="alert" className="text-[15px] text-status-revoked">{error.message}</p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPlaceholder />
    </Suspense>
  );
}
