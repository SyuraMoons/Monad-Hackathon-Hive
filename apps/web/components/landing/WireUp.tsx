import { InstallCard } from "@/components/ui/InstallCard";
import { cn } from "@/lib/cn";
import { anchor, eyebrow, gutter, h2, lead } from "./type";

const TOKEN = "hive_sk_…";
const COMMAND = [
  "claude mcp add --transport http hive \\",
  "  https://<your-hive-bridge>/mcp \\",
  `  --header "Authorization: Bearer ${TOKEN}"`,
].join("\n");

// Same five tools the bridge registers (apps/bridge/src/mcp.ts) and the Connect page lists.
const TOOLS = ["hive_write_memory", "hive_save_session", "hive_list_memory", "hive_read_memory", "hive_whoami"];

// Figma Section/Wire-up 12:23, with the Connect terminal card (54:89) in place of the TBD panel (design.md D8).
export function WireUp() {
  return (
    <section id="developers" aria-labelledby="developers-title" className={cn(anchor, gutter, "flex flex-col items-start py-[78px]")}>
      <p className={eyebrow}>For developers</p>
      <h2 id="developers-title" className={cn(h2, "mt-[22px]")}>Wire Hive into your agents.</h2>
      <p className={cn(lead, "mt-[18px] max-w-[620px]")}>
        One MCP server connects the models you use. Add it once, and Hive carries memory between them along the edges you draw.
      </p>
      <InstallCard
        className="mt-[34px]"
        tab="claude"
        command={COMMAND}
        token={TOKEN}
        maskToken={false}
        note="Setup happens in the app: sign in with your passkey, and the Connect page fills in your bridge URL and a token scoped to one agent."
      />
      <p className="mt-4 max-w-[900px] text-[14.5px] leading-[1.4] text-ink-3">
        Once wired, your agents get{" "}
        {TOOLS.map((t, i) => (
          <span key={t}>
            <code className="font-mono text-[14px] text-ink-2">{t}</code>
            {i < TOOLS.length - 2 ? ", " : i === TOOLS.length - 2 ? " and " : ""}
          </span>
        ))}{" "}
        — plus the permissions you signed.
      </p>
    </section>
  );
}
