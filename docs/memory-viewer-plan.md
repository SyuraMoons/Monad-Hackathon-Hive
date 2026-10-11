# Plan: read your own memories in the canvas

Status: built in two stacked PRs (bridge route, then web). Unit-tested; not yet run in a browser or on testnet.

## Problem

The agent drawer on the canvas has a MEMORY HISTORY section (`apps/web/components/canvas/NodeDrawer.tsx`). In live mode it lists rows, but each one only says `content 0x1234… · encrypted`. The owner can't read what their own agents saved.

Why:

1. `memory.preview` is a stub in the live client (`apps/web/lib/hive/live/index.ts:75`, `todo("memory.preview")`).
2. Nothing asks for the text of past writes. `useFeed.loadPreview` only runs for live `memory.written` events (`apps/web/lib/stores/feed.ts`), never for history rows read from `MemorySlots.slotsSince`.
3. The bridge has no user route that serves ciphertext. `GET /v1/memory/:contentHash` is in the contract (`zMemoryResponse` in `packages/shared/src/schema/api.ts`, `docs/backend-handoff.md` §routes) and on the roadmap as planned, but it isn't built.

## Is it possible?

Yes, without breaking any hard rule:

- **The browser already holds the key.** `deriveKeysFromPhrase` makes `encryptionKey` (HKDF `hive/encrypt`), the same key the bridge seals memories with. It lives in memory only and is `undefined` after a reload until `unlock()` (one passkey touch).
- **The bridge serves ciphertext only.** It never decrypts for the user. Rule 2 holds: no plaintext in a log, an error, an SSE event or a row.
- **Decryption is portable.** `@hive/crypto` uses WebCrypto and viem, so it runs in the browser. `openDoc` in `@hive/shared` unwraps the `hive-memory/v1` envelope and never throws, so legacy memories still read.
- **Ownership can be checked.** `memory_content.owner` holds the owner address, and it's written on every `put`.
- **Rule 3 isn't affected.** It governs what an agent may read. Here the owner reads their own data with their own key.

## Design

### Bridge: `GET /v1/memory/:contentHash`

- `requireUser`. Agent tokens are refused, as on every `/v1/*` route.
- Validate the hash with `zContentHash`. Otherwise `INVALID_INPUT`.
- Look the row up and return it only when `owner == token owner` (lowercase compare). A missing row and someone else's row both give the same `NOT_FOUND`, so the route doesn't reveal which hashes exist.
- Response is `zMemoryResponse`: base64 `ciphertext` (with the tag), base64 `iv` and `keyId`.
- `Cache-Control: private, no-store`.
- Interface change: a new `CiphertextStore.getOwned` returns `owner` and `keyId` as well. `get` stays as it is, because MCP reads and the live store test rely on its shape. Done in the Supabase store and the in-memory stub.
- Add the route to `src/openapi.ts`, or `test/openapi.test.ts` fails.

The shared contract has a single-hash route. A drawer page is 5 rows, so 5 parallel requests are fine. A batch route can come later if the feed needs it, but it would be a contract change, so not now.

### Web

1. **Dependency.** Add `@hive/crypto` to `apps/web` and to `transpilePackages`. Move `keyIdOf` from `apps/bridge/src/memory.ts` into `@hive/crypto` so both sides compute the key id the same way.
2. **Live client.** Add `bridge.memory(hash)`. `memory.preview(hash)` fetches it, checks `keyId` against `keyIdOf(encryptionKey)`, decrypts, runs `openDoc` and returns `{ content, gist?, kind? }`. Errors:
   - Keys are locked: `LOCKED`, and the UI offers Unlock.
   - Key id doesn't match: "sealed with another key".
   - Missing row, or decryption fails: "couldn't read".
3. **Feed store.** Previews store `MemoryDoc`-shaped values (`content`, `gist`, `kind`), not a string. They stay in memory only (never localStorage) and are cleared by `reset()` on sign-out. The live feed shares the same cache.
4. **Drawer.** When a history page shows, call `loadPreview` for its rows. Each row shows the gist, or else the first ~160 characters of the content, and expands to the full text on click. The kind shows as a small tag. When keys are locked, the section shows one "Unlock to read" button instead of per-row errors.
5. **Mock mode** keeps its current fake previews.

### Out of scope

- Editing or deleting memories. `MemorySlots` is append-only.
- Search from the canvas.
- Showing memories other agents shared into this one. The drawer stays "what this agent wrote".

## PRs

1. `feat/bridge-memory-route`: route, store `owner`/`keyId`, stub, OpenAPI, tests (owner gets it, another owner gets 404, agent token gets 401, bad hash gets 400, nothing logged).
2. `feat/web-memory-viewer` (stacked on 1): `@hive/crypto` in web, live `memory.preview`, feed store, drawer UI, unit tests for preview (decrypt, envelope, legacy, key mismatch, locked).
3. Docs: roadmap row P0.6/P0.7, backend-handoff route marked built, architecture "who can read what" mentions the owner reading in the browser. Probably an ADR-024 too ("the owner reads ciphertext through the bridge and decrypts on the device"), since it adds a read path that isn't the MCP one.

## Verify

- `pnpm build`, `pnpm --filter @hive/bridge test`, `pnpm --filter @hive/web test`.
- Manual check on testnet: write a memory from Claude, open the drawer, unlock, read it. Reload: rows show as locked until unlock. Sign out: previews are gone.

## Open questions

- Gist with click-to-expand (proposed), or always the full text?
- Should the drawer also list memories this agent received through edges? That needs a permission-aware read path, so it's a separate plan.
