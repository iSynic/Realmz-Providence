declare module "chiptune3/chiptune3.js" {
  export type ChiptuneMetadata = {
    dur?: number;
    title?: string;
    type?: string;
    [key: string]: unknown;
  };

  export class ChiptuneJsPlayer {
    constructor(config?: { repeatCount?: number; stereoSeparation?: number; interpolationFilter?: number; context?: AudioContext | false });
    context: AudioContext;
    play(value: ArrayBuffer): void;
    stop(): void;
    pause(): void;
    unpause(): void;
    setVol(value: number): void;
    onInitialized(handler: () => void): void;
    onEnded(handler: () => void): void;
    onError(handler: (error: { type?: string }) => void): void;
    onMetadata(handler: (metadata: ChiptuneMetadata) => void): void;
  }
}
