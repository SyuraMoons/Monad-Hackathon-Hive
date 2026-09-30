import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { NavButton } from "@/components/ui/NavButton";
import { OptionChip } from "@/components/ui/OptionChip";
import { PillButton, PillLink } from "@/components/ui/Pill";
import { StatusDot } from "@/components/ui/StatusDot";
import { Toast } from "@/components/ui/Toast";

export const metadata = { title: "Hive — UI components (dev)" };

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="mb-5 font-mono text-[14px] tracking-[0.1em] text-ink-3 uppercase">{title}</h2>
      <div className="flex flex-wrap items-center gap-6">{children}</div>
    </section>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-[1312px] px-4 py-12 sm:px-16">
      <h1 className="mb-10 font-display text-[50px] leading-[1.04] tracking-[-0.01em]">
        Components <em className="text-amber-strong">review</em>
      </h1>

      <Row title="Logo">
        <Logo />
      </Row>

      <Row title="Pill button · link">
        <PillLink href="/login">Get started with a passkey</PillLink>
        <PillButton>Sign edge with passkey</PillButton>
        <PillButton disabled>Open the canvas</PillButton>
        <PillButton variant="danger">Revoke edge</PillButton>
      </Row>

      <Row title="Nav button">
        <NavButton href="/login">Get started with a passkey</NavButton>
      </Row>

      <Row title="Status dot">
        {(["active", "idle", "revoked", "pending"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-2 font-mono text-[14px] text-ink-2">
            <StatusDot status={s} /> {s}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 font-mono text-[14px] text-ink-2">
          <StatusDot status="active" size={6} /> 6px (network)
        </span>
      </Row>

      <Row title="Option chip">
        <OptionChip selected>30d</OptionChip>
        <OptionChip>24h</OptionChip>
        <OptionChip>7d</OptionChip>
        <OptionChip disabled>custom</OptionChip>
      </Row>

      <Row title="Toast">
        <Toast status="pending" message="Signing edge… pending" />
        <Toast status="success" message="Edge signed · Claude → GPT" link={{ href: "https://testnet.monadscan.com", label: "View on Monadscan →" }} />
        <Toast status="revoked" message="Edge revoked · Claude ✕ GPT" link={{ href: "https://testnet.monadscan.com", label: "View on Monadscan →" }} />
        <Toast status="error" message="Transaction failed. Try again." />
      </Row>

      <Row title="Agent icons">
        <Image src="/agents/claude.png" alt="Claude" width={22} height={22} />
        <Image src="/agents/gpt.png" alt="GPT" width={22} height={22} />
      </Row>
    </main>
  );
}
