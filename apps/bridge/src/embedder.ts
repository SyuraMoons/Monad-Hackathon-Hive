import type { Embedder, EmbedderStatus } from "./types.js";

// The real embedder (ADR-022): a multilingual e5 model run by @huggingface/transformers (onnxruntime on the CPU), inside the
// bridge, so plaintext never goes to a third party. The package is imported on first use: a bridge with embeddings off never loads it.

type Extractor = (inputs: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

export class TransformersEmbedder implements Embedder {
  /** multilingual-e5-small. */
  readonly dims = 384;
  private state: EmbedderStatus = "loading";
  private loading?: Promise<Extractor>;
  // One batch at a time: the model is the slow part, and two parallel runs only fight for the same cores.
  private turn: Promise<unknown> = Promise.resolve();

  constructor(
    readonly model: string,
    private cacheDir?: string,
  ) {}

  status(): EmbedderStatus {
    return this.state;
  }

  /** Starts loading the model. Safe to call twice. Resolves when ready, or when loading failed (`status()` says which). */
  load(): Promise<void> {
    this.loading ??= (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      if (this.cacheDir) env.cacheDir = this.cacheDir;
      return (await pipeline("feature-extraction", this.model, { dtype: "q8" })) as unknown as Extractor;
    })();
    return this.loading.then(
      () => {
        this.state = "ready";
      },
      (e) => {
        this.state = "error";
        // The name only: a message can carry a path or a URL.
        console.error(`bridge: embedding model failed to load${e instanceof Error ? ` (${e.name})` : ""}`);
      },
    );
  }

  embedQuery(text: string): Promise<Float32Array> {
    return this.run([`query: ${text}`]).then((v) => v[0]!);
  }

  embedPassages(texts: string[]): Promise<Float32Array[]> {
    return this.run(texts.map((t) => `passage: ${t}`));
  }

  private run(inputs: string[]): Promise<Float32Array[]> {
    const job = this.turn.catch(() => undefined).then(async () => {
      if (!this.loading || this.state !== "ready") throw new Error("embedding model is not ready");
      const extractor = await this.loading;
      const rows = (await extractor(inputs, { pooling: "mean", normalize: true })).tolist();
      return rows.map((row) => {
        if (row.length !== this.dims) throw new Error("embedding has the wrong size");
        return Float32Array.from(row);
      });
    });
    this.turn = job;
    return job;
  }
}
