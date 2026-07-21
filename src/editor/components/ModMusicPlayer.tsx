import { Music, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Player = import("chiptune3/chiptune3.js").ChiptuneJsPlayer;

export function ModMusicPlayer({ source, label, compact = false }: { source: string; label: string; compact?: boolean }) {
  const playerRef = useRef<Player | null>(null);
  const disposedRef = useRef(false);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [detail, setDetail] = useState("Standard MOD module");

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const player = playerRef.current;
      playerRef.current = null;
      player?.stop();
      void player?.context.close();
    };
  }, [source]);

  async function play() {
    releasePlayer();
    setState("loading");
    setDetail("Loading libopenmpt...");
    try {
      const [{ ChiptuneJsPlayer }, response] = await Promise.all([
        import("chiptune3/chiptune3.js"),
        fetch(source)
      ]);
      if (!response.ok) throw new Error(`Could not load the module (${response.status})`);
      const payload = await response.arrayBuffer();
      if (disposedRef.current) return;
      const player = new ChiptuneJsPlayer({ repeatCount: 0 });
      playerRef.current = player;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("libopenmpt initialization timed out")), 10_000);
        player.onInitialized(() => {
          window.clearTimeout(timeout);
          resolve();
        });
        player.onError((error) => {
          window.clearTimeout(timeout);
          reject(new Error(error.type ? `libopenmpt could not play this module (${error.type})` : "libopenmpt could not play this module"));
        });
      });
      if (disposedRef.current) return;
      player.onMetadata((metadata) => {
        if (disposedRef.current) return;
        const title = typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : label;
        const duration = typeof metadata.dur === "number" && Number.isFinite(metadata.dur) ? ` · ${formatSeconds(metadata.dur)}` : "";
        setDetail(`${title}${duration}`);
      });
      player.onEnded(() => {
        if (playerRef.current === player) {
          playerRef.current = null;
          void player.context.close();
        }
        if (!disposedRef.current) setState("idle");
      });
      await player.context.resume();
      setState("playing");
      setDetail(label);
      player.play(payload);
    } catch (error) {
      if (disposedRef.current) return;
      releasePlayer();
      setState("error");
      setDetail(error instanceof Error ? error.message : String(error));
    }
  }

  function stop() {
    releasePlayer();
    setState("idle");
    setDetail("Standard MOD module");
  }

  function releasePlayer() {
    const player = playerRef.current;
    playerRef.current = null;
    player?.stop();
    void player?.context.close();
  }

  return (
    <div className={`mod-music-player${compact ? " compact" : ""}`}>
      <Music size={compact ? 18 : 24} />
      <span>{detail}</span>
      {state === "playing" ? (
        <button type="button" className="btn btn-secondary btn-xs" onClick={stop} aria-label={`Stop ${label}`}>
          <Square size={12} /> Stop
        </button>
      ) : (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => void play()} disabled={state === "loading"} aria-label={`Play ${label}`}>
          <Music size={12} /> {state === "loading" ? "Loading..." : state === "error" ? "Retry" : "Play"}
        </button>
      )}
    </div>
  );
}

function formatSeconds(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
