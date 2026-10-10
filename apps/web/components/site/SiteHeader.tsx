import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { NavButton } from "@/components/ui/NavButton";
import s from "./SiteHeader.module.css";

const LINKS = [
  { href: "#isolation", label: "Isolation" },
  { href: "#developers", label: "Developers" },
  { href: "#how-it-works", label: "How it works" },
];

export function SiteHeader() {
  return (
    <header className={s.chrome}>
      <Link href="/" className={s.home} aria-label="Hive home">
        <Logo />
      </Link>
      <nav className={s.nav} aria-label="Main">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={s.link}>{l.label}</a>
        ))}
        <NavButton href="/login" aria-label="Get started with a passkey">
          <span className={s.full}>Get started with a passkey</span>
          <span className={s.short} aria-hidden="true">Get started</span>
        </NavButton>
      </nav>
    </header>
  );
}
