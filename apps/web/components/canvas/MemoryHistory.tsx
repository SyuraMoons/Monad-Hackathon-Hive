"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clockTime, longDate, shortHash } from "@/lib/format";
import type { HistoryEntry } from "@/lib/hive/memoryHistory";
import { pageOf } from "@/lib/pagination";
import { useFeed } from "@/lib/stores/feed";
import { useSession } from "@/lib/stores/session";
import { useUi } from "@/lib/stores/ui";
import { topicColor } from "@/lib/topics";

export const eyebrow = "font-mono text-[14px] tracking-[0.08em] whitespace-pre text-ink-3";
export const section = "flex flex-col gap-2.5 border-t border-line px-6 py-[18px]";
export const button = "min-h-9 cursor-pointer rounded-chip border border-ink px-3.5 text-[14px] font-medium text-ink hover:bg-paper-2 disabled:cursor-default disabled:opacity-50";

const ALL_PAGE_SIZE = 20;
const shortDate = (at: number) => longDate(at).replace(/ \d{4}$/, "");

/** A page of writes as numbered rows. No memory text here: a row opens the memory, and only then is it decrypted. */
export function MemoryList({ entries, page, onPage, pageSize, from }: { entries: HistoryEntry[]; page: number; onPage(page: number): void; pageSize: number; from: "agent" | "history" }) {
  const setUi = useUi((s) => s.set);
  const shown = pageOf(entries, page, pageSize);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.items.map((w) => (
          <li key={w.slotId.toString()}>
            <button
              type="button"
              onClick={() => setUi({ drawerView: { slotId: w.slotId.toString(), from } })}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-chip border border-line px-3 py-2.5 text-left hover:border-ink hover:bg-paper-2"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-medium text-ink">Saved #{w.n}</span>
                <span className="flex items-center gap-2 truncate font-mono text-[14px] whitespace-pre text-ink-3">
                  <span aria-hidden="true" className="h-[3px] w-3.5 shrink-0" style={{ background: topicColor(w.topic) }} />
                  {w.topic}  ·  {shortDate(w.at)}
                </span>
              </span>
              <span aria-hidden="true" className="text-[15px] text-ink-3">→</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.pages > 1 && (
        <nav aria-label="Memory history pages" className="flex items-center justify-between gap-3 pt-1">
          <p aria-live="polite" className="font-mono text-[14px] whitespace-pre text-ink-3">{shown.from}–{shown.to} of {shown.total}</p>
          <div className="flex gap-2">
            <button type="button" className={button} aria-label="Newer writes" disabled={shown.page === 0} onClick={() => onPage(shown.page - 1)}>Prev</button>
            <button type="button" className={button} aria-label="Older writes" disabled={shown.page >= shown.pages - 1} onClick={() => onPage(shown.page + 1)}>Next</button>
          </div>
        </nav>
      )}
    </>
  );
}

// A view that covers the agent drawer. Back and Esc return one step; ✕ closes the drawer.
function Panel({ title, subtitle, back, children }: { title: string; subtitle: string; back: "agent" | "history"; children: ReactNode }) {
  const setUi = useUi((s) => s.set);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    backRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  return (
    <aside role="dialog" aria-labelledby="drawer-view-title" className="absolute inset-0 z-30 flex min-h-0 flex-col border-l border-ink bg-paper shadow-[-8px_0_24px_rgb(0_0_0/0.12)]">
      <div className="flex items-center justify-between px-6 pt-4">
        <button ref={backRef} type="button" onClick={() => setUi({ drawerView: back })} className="min-h-9 cursor-pointer text-[14px] font-medium whitespace-pre text-ink underline underline-offset-2 hover:text-ink-2">
          ←  {back === "history" ? "All history" : "Back"}
        </button>
        <button type="button" onClick={() => setUi({ drawerAgentId: null })} aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-chip text-[18px] text-ink-2 hover:bg-paper-2 hover:text-ink">
          ✕
        </button>
      </div>
      <div className="px-6 pt-1 pb-[18px]">
        <h2 id="drawer-view-title" className="truncate font-display text-[26px] leading-tight text-ink">{title}</h2>
        <p className="truncate font-mono text-[14px] whitespace-pre text-ink-3">{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

/** Every loaded write of the agent, filling the panel. */
export function AllHistory({ agentName, entries, page, onPage }: { agentName: string; entries: HistoryEntry[]; page: number; onPage(page: number): void }) {
  return (
    <Panel title="Memory history" subtitle={`${agentName}  ·  ${entries.length} ${entries.length === 1 ? "write" : "writes"}`} back="agent">
      <section className={section} aria-label="All memory history">
        <MemoryList entries={entries} page={page} onPage={onPage} pageSize={ALL_PAGE_SIZE} from="history" />
      </section>
    </Panel>
  );
}

/** One write in full. The text is fetched as ciphertext and decrypted on this device when the view opens. */
export function MemoryDetail({ agentName, entry, back, name }: { agentName: string; entry: HistoryEntry; back: "agent" | "history"; name(id: bigint): string }) {
  const preview = useFeed((s) => s.previews[entry.contentHash]);
  const loadPreview = useFeed((s) => s.loadPreview);
  const unlock = useSession((s) => s.unlock);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string>();
  const view = typeof preview === "object" ? preview : null;
  const text = "text-[15px] leading-[1.5] break-words whitespace-pre-wrap text-ink";

  useEffect(() => {
    void loadPreview(entry.contentHash);
  }, [entry.contentHash, loadPreview]);

  async function unlockMemories() {
    setUnlocking(true);
    setUnlockError(undefined);
    try {
      await unlock();
      useFeed.getState().retryLocked();
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : "Could not unlock. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <Panel title={`Saved #${entry.n}`} subtitle={agentName} back={back}>
      <section className={section} aria-label="Details">
        <p className={eyebrow}>DETAILS</p>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
          <dt className="text-ink-3">topic</dt>
          <dd className="flex items-center gap-2 font-mono text-ink">
            <span aria-hidden="true" className="h-[3px] w-3.5 shrink-0" style={{ background: topicColor(entry.topic) }} />
            {entry.topic}
          </dd>
          {view?.kind && (
            <>
              <dt className="text-ink-3">kind</dt>
              <dd className="font-mono text-ink">{view.kind}</dd>
            </>
          )}
          <dt className="text-ink-3">written</dt>
          <dd className="font-mono whitespace-pre text-ink">{longDate(entry.at)}  ·  {clockTime(entry.at)}</dd>
          {entry.propagatedTo && (
            <>
              <dt className="text-ink-3">reached</dt>
              <dd className="font-mono break-words text-ink">{entry.propagatedTo.length ? entry.propagatedTo.map(name).join(", ") : "stayed here"}</dd>
            </>
          )}
          <dt className="text-ink-3">content</dt>
          <dd className="font-mono whitespace-pre text-ink">{shortHash(entry.contentHash)}  ·  encrypted</dd>
        </dl>
      </section>

      {view?.gist && view.gist !== view.content && (
        <section className={section} aria-label="Summary">
          <p className={eyebrow}>SUMMARY</p>
          <p className={text}>{view.gist}</p>
        </section>
      )}

      <section className={section} aria-label="Memory">
        <p className={eyebrow}>MEMORY</p>
        {view ? (
          <p className={text}>{view.content}</p>
        ) : preview === "locked" ? (
          <div className="flex flex-col gap-2 rounded-chip border border-line bg-paper-2 px-3.5 py-3">
            <p className="text-[15px] leading-[1.5] text-ink-2">Your memories stay encrypted until you unlock with your passkey. They are decrypted on this device and never leave it.</p>
            <div>
              <button type="button" className={button} disabled={unlocking} onClick={() => void unlockMemories()}>{unlocking ? "Waiting for your passkey…" : "Unlock to read"}</button>
            </div>
            {unlockError && <p role="alert" className="text-[14px] leading-[1.45] text-status-revoked">{unlockError}</p>}
          </div>
        ) : preview === "error" ? (
          <p className="text-[15px] leading-[1.5] text-ink-3">Couldn’t read this memory here.</p>
        ) : (
          <p className="text-[15px] leading-[1.5] text-ink-3">Decrypting on this device…</p>
        )}
      </section>
    </Panel>
  );
}
