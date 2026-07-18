import type { BrowserRawSourceFile, BrowserRawSourceSnapshot } from "./fsAccess";

export class BrowserCompatibilityAnnex {
  readonly rootName: string;
  readonly #files: BrowserRawSourceFile[];

  constructor(snapshot: BrowserRawSourceSnapshot) {
    this.rootName = snapshot.rootName;
    this.#files = [...snapshot.files].sort((left, right) => (
      left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0
    ));
  }

  files(): readonly BrowserRawSourceFile[] {
    return this.#files;
  }

  find(predicate: (file: BrowserRawSourceFile) => boolean) {
    return this.#files.find(predicate);
  }
}
