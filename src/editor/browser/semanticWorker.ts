import { buildBrowserSemanticSchema, type BrowserSemanticBuildProgress } from "./semantic";

type WorkerResponse =
  | { ok: true; semanticSchema: ReturnType<typeof buildBrowserSemanticSchema> }
  | { ok: "progress"; progress: BrowserSemanticBuildProgress }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<Parameters<typeof buildBrowserSemanticSchema>[0]>) => {
  try {
    const semanticSchema = buildBrowserSemanticSchema(event.data, (progress) => {
      self.postMessage({ ok: "progress", progress } satisfies WorkerResponse);
    });
    self.postMessage({ ok: true, semanticSchema } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies WorkerResponse);
  }
};
