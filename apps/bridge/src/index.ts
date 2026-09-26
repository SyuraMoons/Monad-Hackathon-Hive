import { createServer } from "node:http";
import { monadTestnet } from "@hive/shared";

const port = Number(process.env.BRIDGE_PORT ?? 4000);

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, chainId: monadTestnet.id }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, () => {
  console.log(`bridge listening on http://localhost:${port}`);
});
