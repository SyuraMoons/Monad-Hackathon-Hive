# Notice

This repository is a submission for the **Monad Metropolis Hackathon, Track 4 (Trust, Identity & AI Infra)**, 2026.

## Licenses

| Part | License |
| --- | --- |
| The app, the bridge, the indexer, `@hive/crypto` and the agent runner (everything not listed below) | [PolyForm Noncommercial 1.0.0](LICENSE). Free for personal, research, educational and other noncommercial use. Using it in a commercial product or selling it needs the authors' written permission |
| [`packages/mcp-client`](packages/mcp-client), [`packages/shared`](packages/shared) | MIT, their own `LICENSE` file. This is the surface other developers integrate with |
| [`packages/contracts`](packages/contracts) | MIT, also in every file's `SPDX-License-Identifier`. The contracts are deployed and public |

The hosted bridge, the indexer and the contracts on Monad testnet can be called by anyone without a copy of this code.

Third-party code keeps its own licenses: the packages in `node_modules` and the Foundry libraries under `packages/contracts/lib`.

Product and company names (Monad, Mera, Envio, Claude, ChatGPT, ERC-8004) belong to their owners. The licenses cover the code, not any trademark.

Questions or permission for commercial use: open an issue on this repository.
