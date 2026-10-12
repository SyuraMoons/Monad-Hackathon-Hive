import { cn } from "@/lib/cn";

// Waves, reused on Login and Connect.
export function Waves({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 [&>svg]:absolute [&>svg]:top-0 [&>svg]:left-0 [&>svg]:w-full", className)} aria-hidden="true">
      <svg height="300" viewBox="0 0 1440 300" preserveAspectRatio="none">
        <path className="fill-wave-1" d="M0 300C240 180 480 150 720 210C960 270 1200 250 1440 190V0H0V300Z" />
      </svg>
      <svg height="248.571" viewBox="0 0 1440 248.571" preserveAspectRatio="none">
        <path className="fill-wave-1" d="M0 68.5714C240 -11.4286 520 -21.4286 760 38.5714C1000 98.5714 1220 78.5714 1440 18.5714V248.571H0V68.5714Z" />
      </svg>
      <svg height="190.859" viewBox="0 0 1440 190.859" preserveAspectRatio="none">
        <path className="fill-wave-2 opacity-90" d="M0 60.8587C260 -9.14131 540 -19.1413 780 32.8587C1020 84.8587 1240 62.8587 1440 10.8587V190.859H0V60.8587Z" />
      </svg>
    </div>
  );
}
