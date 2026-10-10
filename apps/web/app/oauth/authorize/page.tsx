"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { NewAgentForm } from "@/components/app/NewAgentForm";
import { Logo } from "@/components/ui/Logo";
import { PillButton } from "@/components/ui/Pill";
import { Waves } from "@/components/ui/Waves";
import { cn } from "@/lib/cn";
import { getHiveClient } from "@/lib/hive/client";
import { parseConsentRequest } from "@/lib/hive/oauthRequest";
import { displayName, useGraph } from "@/lib/stores/graph";
import { useSession } from "@/lib/stores/session";

const chip = "min-h-9 cursor-pointer rounded-chip border px-3 text-[14px] font-medium disabled:cursor-default disabled:opacity-50";
const linkButton = "min-h-9 cursor-pointer text-[15px] font-medium text-ink underline underline-offset-2 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-45";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-paper">
      <Waves />
      <header className="relative flex items-center px-[clamp(16px,4.4444vw,64px)] pt-[17px]">
        <Logo />
      </header>
      <main className="relative mx-auto flex max-w-[560px] flex-col px-4 pt-16 pb-16 sm:px-8 sm:pt-[140px]">{children}</main>
    </div>
  );
}

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section aria-live="polite" className="flex w-full flex-col gap-5 border border-ink bg-paper px-6 pt-9 pb-8 sm:px-11 sm:pt-11 sm:pb-10">
      <div className="flex flex-col gap-3.5">
        <p className="font-mono text-[14px] tracking-[0.1em] text-ink-3">{eyebrow}</p>
        <h1 className="font-display text-[clamp(28px,2.5vw,36px)] leading-[1.15] tracking-[-0.01em] text-ink">{title}</h1>
      </div>
      {children}
    </section>
  );
}

// The page the bridge's GET /oauth/authorize sends the owner to (ADR-019): sign in, pick the Claude agent, hand the bridge its
// keys through the usual authorize, then ask it for a code and send the browser back to the connector.
function Consent() {
  const router = useRouter();
  const search = useSearchParams();
  const consent = useMemo(() => parseConsentRequest(new URLSearchParams(search.toString())), [search]);
  const restored = useSession((s) => s.restored);
  const owner = useSession((s) => s.owner);
  const signedIn = useSession((s) => s.status === "signed-in") && !!owner;
  const authorizeAgent = useSession((s) => s.authorizeAgent);
  const graphStatus = useGraph((s) => s.status);
  const graphError = useGraph((s) => s.error);
  const agents = useGraph((s) => s.agents);
  const labels = useGraph((s) => s.labels);
  const [picked, setPicked] = useState<string>();
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState<"allow" | "deny">();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  // Not signed in: the passkey sign-in sends the owner straight back here with the request intact.
  useEffect(() => {
    if (consent && restored && !signedIn) router.replace(`/login?next=${encodeURIComponent(`/oauth/authorize?${search.toString()}`)}`);
  }, [consent, restored, signedIn, search, router]);

  useEffect(() => {
    if (signedIn && owner) void useGraph.getState().load(owner);
  }, [signedIn, owner]);

  const mine = Object.values(agents).filter((a) => a.agentType === "claude").sort((a, b) => Number(a.agentId - b.agentId));
  const selected = mine.find((a) => a.agentId.toString() === picked) ?? mine[0];

  if (!consent) {
    return (
      <Shell>
        <Card eyebrow="CONNECTION REQUEST" title="This link isn’t a valid connection request">
          <p className="text-[17px] leading-[1.55] text-ink-2">Start again from Claude: add Hive as a custom connector and it opens this page itself.</p>
        </Card>
      </Shell>
    );
  }
  if (!signedIn || graphStatus === "idle" || graphStatus === "loading") {
    return (
      <Shell>
        <Card eyebrow="CONNECTION REQUEST" title="Loading your agents…">
          <p role="status" className="text-[17px] leading-[1.55] text-ink-2">{restored ? "Opening your passkey sign-in if you’re signed out." : "One moment."}</p>
        </Card>
      </Shell>
    );
  }

  async function finish(decision: "allow" | "deny") {
    if (!consent) return;
    setBusy(decision);
    setError(undefined);
    try {
      // The keys go to the bridge the same way as on Connect (one passkey touch when locked); approving then only mints a code for that session.
      if (decision === "allow") {
        if (!selected) throw new Error("Choose an agent to connect.");
        await authorizeAgent(selected.agentId);
      }
      const { redirectTo } = await (await getHiveClient()).oauth.approve({ request: consent.request, decision, agentId: decision === "allow" ? selected?.agentId : undefined });
      window.location.assign(redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(undefined);
    }
  }

  return (
    <Shell>
      <Card eyebrow="CONNECTION REQUEST" title="Connect Claude to one of your agents">
        <p className="text-[17px] leading-[1.55] text-ink-2">
          <strong className="font-medium text-ink">{consent.who}</strong> wants to use Hive as this agent. It can write memory as the agent and read what the agent is allowed to see on your canvas, and nothing else. You can end it from the canvas at any time.
        </p>

        {graphError ? (
          <p role="alert" className="text-[15px] text-status-revoked">Couldn’t load your agents: {graphError}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-label="Claude agents">
              {mine.map((a) => (
                <button
                  key={a.agentId.toString()}
                  type="button"
                  disabled={busy !== undefined}
                  aria-pressed={a === selected}
                  onClick={() => setPicked(a.agentId.toString())}
                  className={cn(chip, a === selected ? "border-ink bg-paper-2 text-ink" : "border-line text-ink-2 hover:border-ink-3")}
                >
                  {displayName(a, labels)}
                </button>
              ))}
              {!naming && (
                <button type="button" disabled={busy !== undefined} onClick={() => setNaming(true)} className={cn(chip, "border-dashed border-clay text-ink-2 hover:text-ink")}>
                  + New Claude agent
                </button>
              )}
            </div>
            {mine.length === 0 && !naming && <p className="text-[15px] text-ink-2">You don’t have a Claude agent yet. Create one to continue.</p>}
            {naming && (
              <NewAgentForm
                type="claude"
                onCancel={() => setNaming(false)}
                onCreated={(id) => {
                  setPicked(id.toString());
                  setNaming(false);
                }}
              />
            )}
          </div>
        )}

        {error && <p role="alert" className="text-[15px] leading-[1.45] text-status-revoked">{error}</p>}

        <div className="flex flex-col items-center gap-4">
          <PillButton wide disabled={!selected || busy !== undefined || naming} onClick={() => void finish("allow")}>
            {busy === "allow" ? "Waiting for your passkey…" : selected ? `Connect ${displayName(selected, labels)}` : "Choose an agent"}
          </PillButton>
          <button type="button" disabled={busy !== undefined} onClick={() => void finish("deny")} className={linkButton}>
            {busy === "deny" ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      </Card>
    </Shell>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <Consent />
    </Suspense>
  );
}
