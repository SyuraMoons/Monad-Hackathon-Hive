"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { PillButton } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { Waves } from "@/components/ui/Waves";
import { cn } from "@/lib/cn";
import { useSession, type LoginError } from "@/lib/stores/session";

const PROGRESS_MS = 1200; // design.md §8: Login state 3 progress bar

// State 4 copy per error (design.md §9 voice, D6 for PRF_UNAVAILABLE). Never "Face ID".
function errorCopy(error: LoginError | undefined): { title: string; body: string; hint: string } {
  switch (error?.code) {
    case "PRF_UNAVAILABLE":
      return {
        title: "Try another passkey",
        body: "This passkey can’t create encryption keys. Try Safari with iCloud Keychain, 1Password, or Chrome with Google Password Manager.",
        hint: "A passkey saved only in desktop Chrome can’t do this. Nothing was signed and nothing was saved.",
      };
    case "UNSUPPORTED":
      return {
        title: "Passkeys aren’t available here",
        body: "Open Hive over HTTPS or on localhost, in a current browser. Nothing was signed and nothing was saved.",
        hint: "On a shared or projector laptop? Choose “use a phone” in the passkey prompt.",
      };
    case "BRIDGE":
      return {
        title: "Hive didn’t answer",
        body: "Your passkey worked and your keys stayed on this device, but the Hive bridge couldn’t confirm the sign-in. Nothing was signed onchain.",
        hint: error.message,
      };
    default:
      return {
        title: "We couldn’t verify you",
        body: "No Hive passkey was found on this device, or the prompt was closed. Nothing was signed and nothing was saved.",
        hint: "On a shared or projector laptop? Choose “use a phone” in the passkey prompt.",
      };
  }
}

function KeyRow({ done, name, detail }: { done: boolean; name: string; detail: string }) {
  return (
    <li className="flex items-center gap-3 font-mono text-[14px]">
      <span className={cn("w-4 font-medium", done ? "text-status-active" : "text-amber-strong")} aria-hidden="true">{done ? "✓" : "…"}</span>
      <span className="w-[130px] shrink-0 text-ink">{name}</span>
      <span className="text-ink-3">{detail}</span>
      <span className="sr-only">{done ? "ready" : "in progress"}</span>
    </li>
  );
}

function Card({ eyebrow, eyebrowClass, title, body, children, footer }: {
  eyebrow: string; eyebrowClass?: string; title: string; body: ReactNode; children: ReactNode; footer: ReactNode;
}) {
  return (
    <section aria-live="polite" className="flex w-full max-w-[520px] flex-col gap-5 border border-ink bg-paper px-6 pt-9 pb-8 sm:px-11 sm:pt-11 sm:pb-10">
      <div className="flex flex-col gap-3.5">
        <p className={cn("font-mono text-[14px] tracking-[0.1em]", eyebrowClass ?? "text-ink-3")}>{eyebrow}</p>
        <h2 className="font-display text-[clamp(30px,2.5vw,36px)] leading-[1.15] tracking-[-0.01em] text-ink">{title}</h2>
        <div className="text-[17px] leading-[1.55] text-ink-2">{body}</div>
      </div>
      <div className="flex flex-col items-center gap-4">{children}</div>
      <div className="h-px w-full bg-line" aria-hidden="true" />
      {footer}
    </section>
  );
}

const linkButton = "min-h-9 cursor-pointer text-[15px] font-medium text-ink underline underline-offset-2 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-45";

const Secured = () => (
  <p className="flex items-center gap-2.5 font-mono text-[14px] whitespace-pre-wrap text-ink-3">
    <StatusDot status="active" />
    Secured by Mera passkey  ·  WebAuthn PRF
  </p>
);

function LoginScreen() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { status, progress, destination, error, signIn, cancel, reset } = useSession();
  const [barDone, setBarDone] = useState(false);
  const [barStarted, setBarStarted] = useState(false);
  const started = useRef(false);

  // Already signed in (e.g. back button): go straight on.
  useEffect(() => {
    if (!started.current && useSession.getState().status === "signed-in") router.replace(next?.startsWith("/") ? next : "/canvas");
    started.current = true;
  }, [next, router]);

  // Login 3: run the 1.2 s bar, then leave once the bridge has also confirmed.
  useEffect(() => {
    if (status !== "verified" && status !== "signed-in") {
      setBarDone(false);
      setBarStarted(false);
      return;
    }
    const raf = requestAnimationFrame(() => setBarStarted(true));
    const t = setTimeout(() => setBarDone(true), PROGRESS_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [status === "verified" || status === "signed-in"]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "signed-in" && barDone && destination) {
      router.replace(next?.startsWith("/") && next !== "/login" ? next : destination);
    }
  }, [status, barDone, destination, next, router]);

  let card: ReactNode;
  if (status === "waiting") {
    card = (
      <Card eyebrow="WAITING FOR PASSKEY" title="Check your device" body="Your browser has opened the passkey prompt. Confirm it with your usual device unlock. Hive only ever receives a signature." footer={<Secured />}>
        <PillButton disabled wide>Waiting for passkey…</PillButton>
        <button type="button" onClick={cancel} className={linkButton}>Cancel</button>
      </Card>
    );
  } else if (status === "verified" || status === "signed-in") {
    card = (
      <Card eyebrow="VERIFIED" eyebrowClass="text-status-active" title="Deriving your keys" footer={<Secured />}
        body={
          <>
            <p>One passkey, three kinds of key. All derived on this device.</p>
            <ul className="mt-3.5 flex flex-col gap-2.5">
              <KeyRow done={progress.owner} name="owner key" detail="signs every graph edit" />
              <KeyRow done={progress.encryption} name="encryption key" detail="AES-256-GCM · on device" />
              <KeyRow done={progress.scope} name="scope keys" detail="one per agent · 24h" />
            </ul>
          </>
        }
      >
        <div className="h-[3px] w-full overflow-hidden bg-line" role="progressbar" aria-label="Signing in" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barDone ? 100 : undefined}>
          <div className={cn("h-full bg-amber-strong transition-[width] ease-linear motion-reduce:transition-none", barStarted ? "w-full" : "w-0")} style={{ transitionDuration: `${PROGRESS_MS}ms` }} />
        </div>
        <p className="text-[15px] font-medium text-ink-3">
          {destination === "/connect" ? "Next: connect your agents…" : "Opening your canvas…"}
        </p>
      </Card>
    );
  } else if (status === "error") {
    const copy = errorCopy(error);
    card = (
      <Card eyebrow="NOT VERIFIED" eyebrowClass="text-status-revoked" title={copy.title} body={copy.body}
        footer={
          <p className="flex items-start gap-2.5 font-mono text-[14px] text-ink-2">
            <StatusDot status="pending" className="mt-1.5" />
            <span className="min-w-0 break-words">{copy.hint}</span>
          </p>
        }
      >
        <PillButton wide onClick={() => void signIn()}>Try again</PillButton>
        <button type="button" onClick={() => void signIn({ create: true })} className={linkButton}>Create a passkey instead</button>
      </Card>
    );
  } else {
    card = (
      <Card eyebrow="WELCOME" title="Sign in to Hive" body="Use the passkey saved on this device. It takes one tap and nothing leaves your machine except a signature." footer={<Secured />}>
        <PillButton wide onClick={() => void signIn()}>Continue with passkey</PillButton>
        <button type="button" onClick={() => void signIn({ create: true })} className={linkButton}>
          New here?&nbsp; Create a passkey
        </button>
      </Card>
    );
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-paper">
      <Waves />
      <header className="relative flex items-center justify-between px-[clamp(16px,4.4444vw,64px)] pt-[17px]">
        <Link href="/" aria-label="Hive home" className="inline-flex min-h-9 items-center" onClick={() => reset()}>
          <Logo />
        </Link>
        <Link href="/" className="inline-flex min-h-9 items-center text-[14.5px] text-ink-2 hover:text-ink">
          <span aria-hidden="true">←&nbsp;&nbsp;</span>Back to home
        </Link>
      </header>

      <main className="relative mx-auto grid max-w-[1200px] items-start gap-12 px-4 pt-16 pb-16 sm:px-8 min-[1100px]:grid-cols-[minmax(0,560px)_520px] min-[1100px]:justify-between min-[1100px]:pt-[176px]">
        <div className="flex flex-col items-start gap-6">
          <p className="font-mono text-[14px] tracking-[0.1em] whitespace-pre text-ink-2">Sign in  ·  One step</p>
          <h1 className="font-display text-[clamp(44px,5.28vw,76px)] leading-[0.97] tracking-[-0.018em] text-ink">
            One passkey.
            <br />
            <em className="text-amber-strong">Every</em> key.
          </h1>
          <p className="max-w-[520px] text-[clamp(17px,1.32vw,19px)] leading-[1.5] text-ink-2">
            No wallet to install, no seed phrase to keep. The passkey on this device signs every edge you draw and unlocks the memory only you can read.
          </p>
          <ul className="flex flex-col gap-3 font-mono text-[14px] text-ink-2">
            {["keys are derived on your device", "Hive servers cannot read your memory", "every permission is signed on Monad"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <StatusDot status="pending" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        {card}
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
