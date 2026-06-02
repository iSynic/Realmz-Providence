import { buildBrowserSemanticSchema } from "./semantic";

type WorkerResponse =
  | { ok: true; semanticSchema: ReturnType<typeof buildBrowserSemanticSchema> }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<Parameters<typeof buildBrowserSemanticSchema>[0]>) => {
  try {
    const semanticSchema = buildBrowserSemanticSchema(event.data);
    self.postMessage({ ok: true, semanticSchema } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies WorkerResponse);
  }
};
