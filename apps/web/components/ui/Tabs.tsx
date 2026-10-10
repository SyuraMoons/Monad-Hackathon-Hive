"use client";

import Image from "next/image";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type TabItem<K extends string> = { key: K; label: string; icon?: string };

// Connect 54:121: pill track, the active tab is a raised paper pill. Arrow keys move between tabs.
export function Tabs<K extends string>({ items, value, onChange, idPrefix, label }: {
  items: TabItem<K>[];
  value: K;
  onChange(key: K): void;
  idPrefix: string;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(e: KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].key);
  }
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 rounded-full border border-line bg-paper-2 p-1">
      {items.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[15px] leading-none transition-colors duration-200 ease-hive",
              active ? "border-line bg-paper font-medium text-ink shadow-[0_1px_3px_rgb(0_0_0/0.06)]" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.icon && <Image src={t.icon} alt="" width={16} height={16} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
