import { cn } from "@/lib/cn";
import { gutter } from "./type";

// Figma Divider/Dotted 5:2: 1.4px clay dots on an 8px rhythm.
export function DottedDivider({ className }: { className?: string }) {
  return (
    <div className={cn(gutter, className)} aria-hidden="true">
      <svg width="100%" height="2" className="block overflow-visible">
        <line x1="0.7" y1="1" x2="100%" y2="1" className="stroke-clay" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.6 6.4" />
      </svg>
    </div>
  );
}
