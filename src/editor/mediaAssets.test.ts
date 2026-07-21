import { describe, expect, it } from "vitest";
import {
  fileToMediaAssetRequest,
  inspectStandardMod,
  isScenarioPictureReferenceId,
  nextResourceId,
  nextScenarioResourceIdInRange,
  SCENARIO_DISPLAY_PICTURE_MAX_ID,
  SCENARIO_PICTURE_MIN_ID,
  SCENARIO_SPLASH_PICTURE_ID
} from "./mediaAssets";

describe("scenario asset resource allocation", () => {
  it("accepts imported high-numbered Classic resource IDs as scenario picture references", () => {
    expect(isScenarioPictureReferenceId(30000)).toBe(true);
    expect(isScenarioPictureReferenceId(30128)).toBe(true);
    expect(isScenarioPictureReferenceId(32128)).toBe(true);
    expect(isScenarioPictureReferenceId(29999)).toBe(false);
    expect(isScenarioPictureReferenceId(32768)).toBe(false);
  });

  it("never allocates the reserved title picture ID to an ordinary scenario picture", () => {
    const occupied = Array.from(
      { length: SCENARIO_DISPLAY_PICTURE_MAX_ID - SCENARIO_PICTURE_MIN_ID + 1 },
      (_, index) => ({ kind: "picture" as const, resourceType: "PICT", resourceId: SCENARIO_PICTURE_MIN_ID + index })
    );

    expect(nextResourceId(occupied, "picture")).toBe(SCENARIO_SPLASH_PICTURE_ID + 1);
    expect(() => nextScenarioResourceIdInRange(occupied, "picture")).toThrow("No unused scenario picture resource ID remains");
  });

  it("allocates only the three canonical Classic music slots", () => {
    expect(nextScenarioResourceIdInRange([], "music")).toBe(1);
    const occupied = [1, 2, 3].map((resourceId) => ({ kind: "music" as const, resourceType: "MOD ", resourceId }));
    expect(() => nextScenarioResourceIdInRange(occupied, "music")).toThrow("No unused scenario music resource ID remains");
  });

  it("keeps reusable Custom Library MOD assets independent of scenario slots", async () => {
    const file = new File([minimalMod()], "library-track.mod", { type: "audio/x-mod" });
    const request = await fileToMediaAssetRequest(file, "music", 4, { libraryScope: "custom-library" });
    expect(request.resourceId).toBe(4);
    expect(request.scenarioMusicSlot).toBeNull();
    expect(request.linkedEntity).toBeNull();
  });
});

describe("standard MOD validation", () => {
  it("accepts a complete silent 4-channel module", () => {
    const bytes = minimalMod();
    expect(inspectStandardMod(bytes)).toEqual({ title: "Providence Test", channels: 4, patterns: 1, sampleBytes: 0 });
  });

  it("rejects non-MOD signatures and truncated pattern data", () => {
    const wrong = minimalMod();
    wrong.set(new TextEncoder().encode("IMPM"), 1080);
    expect(() => inspectStandardMod(wrong)).toThrow("not a supported standard MOD");
    expect(() => inspectStandardMod(minimalMod().slice(0, 1200))).toThrow("payload is truncated");
  });
});

function minimalMod() {
  const bytes = new Uint8Array(1084 + 64 * 4 * 4);
  bytes.set(new TextEncoder().encode("Providence Test"), 0);
  bytes[950] = 1;
  bytes.set(new TextEncoder().encode("M.K."), 1080);
  return bytes;
}
