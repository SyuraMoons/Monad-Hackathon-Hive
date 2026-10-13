# Manual test: two Claude Code agents, and the canvas pulse

A run you can repeat in about 15 minutes to see a memory travel from one agent to another on the canvas. It uses the live web app and a bridge (local on `:4000`, or the deployed one) with two Claude Code terminals. Written after the 12 Oct run; see [feedback.md](feedback.md) for what went wrong in it.

Gas is paid by the owner wallet (ADR-006), so the wallet needs testnet MON. Registering an agent is two transactions.

## Setup

1. Sign in on `/canvas` with a passkey. Use the faucet in the wallet menu if the balance is low.
2. **+ New agent**, twice: `agent 1` and `agent 2`, type Claude. Wait for both transactions of each. If one stops halfway, "Finish setup" sends the second.
3. For each agent copy its **terminal** command (`claude -n hive-agent-1 --mcp-config '...'`). Do not use `claude mcp add` in the same folder (see gotchas).
4. One terminal per agent. In each, run `/mcp` and check that `hive` is connected.
5. **Check who each terminal is.** The window title and the label at the bottom right show the session name. Both must differ (`hive-agent-1`, `hive-agent-2`). Then ask each: `Call hive_whoami and show agentId and name.` Once the `as` field is deployed, every result also shows it.
6. Keep the canvas tab open and visible. Pulses arrive over the bridge's SSE stream and only draw while the tab is open.
7. Draw an edge `agent 1 → agent 2`, **All topics**, sign with the passkey.

Agent ids on chain are global, so they are not 1 and 2. Read the number on each node card.

## Cases

Name the tool in the prompt. Claude Code does not always call a tool you only describe.

| # | Edge | Prompt (terminal) | Expect |
| --- | --- | --- | --- |
| T1 | all topics | Agent 1: `Call hive_write_memory with topic "general" and content "MARKER-001: standup moved to 10:30". Show the raw result (slotId, txHash, propagatedTo).` | Agent 1's border lights up, a dot travels to agent 2, agent 2 flashes. `propagatedTo` holds agent 2's id and the feed says "propagated to". |
| T2 | all topics | Agent 2: `Call hive_read_memory with no filter. Say what the memories are, word for word, and which agent wrote them.` | MARKER-001 from agent 1. No pulse: a read sends nothing. |
| T3 | all topics | Agent 1: three writes, topics `work`, `research`, `personal`, contents `MARKER-002`, `MARKER-003`, `MARKER-004`. | Three dots in a row. The dot takes the topic colour (work, research, personal have their own; any other topic is grey). |
| T4 | one topic | Edit the edge (right-click, **Edit topic or expiry**) to **Only one topic** `work`. Agent 1 writes `personal` (`MARKER-005`), then `work` (`MARKER-006`). | `personal`: no pulse, `propagatedTo` empty. `work`: pulse. Agent 2's read never shows MARKER-005. |
| T5 | both ways | Draw `agent 2 → agent 1`, all topics. Agent 2 writes `general` (`MARKER-007`). | Two parallel arrows, one per direction. The dot goes from agent 2 to agent 1. |
| T6 | revoked | Revoke the edge `agent 1 → agent 2`. Agent 1 writes `work` (`MARKER-008`). | No pulse, the edge fades as a ghost, `propagatedTo` empty, agent 2 reads nothing new from agent 1. |

Sharing is pull: an agent only sees a memory when it calls `hive_read_memory`, `hive_list_memory` or `hive_search_memory`.

## If something looks wrong

| Symptom | Meaning |
| --- | --- |
| A read returns `{"memories":[],"more":false}` right after a write | The reading terminal is probably the writer's own agent (an agent does not read its own writes by default). Check step 5. |
| `propagatedTo` has an id but no dot | Canvas or SSE. Check "Bridge · live", reload the tab, look at the browser console. |
| `propagatedTo` is empty with an edge drawn | The edge, not the animation: check its topic and expiry. An edge made before a contract redeploy may not emit `Propagate`. |
| `/mcp` shows failed | The token (24 h) expired or the bridge restarted. Reconnect from the canvas and run the new command. |
| Claude Code does not call the tool | Repeat with the tool name exactly as in the prompt. |

Don't put real secrets in a test memory: what an agent reads goes to its model provider.

## Seeing the animation without agents

For the animation alone, run the mock on another port and sign in with a real or virtual passkey. See "Testing the canvas" in [gotchas.md](gotchas.md).
