import { describe, expect, it } from "vitest";
import { remakeExportReportForPanel } from "./useProjectLifecycleActions";

describe("remakeExportReportForPanel", () => {
  it("adapts the desktop command report without losing Remake counts or limitations", () => {
    const report = remakeExportReportForPanel({
      outputDir: "C:\\Exports\\Proof",
      writtenFiles: ["campaign.json", "classic/maps.json"],
      counts: {
        maps: 2,
        landMaps: 1,
        dungeonMaps: 1,
        triggers: 10,
        activeTriggers: 8,
        extraCodes: 4,
        messages: 12,
        battles: 1,
        monsters: 3,
        scenarioItems: 2,
        itemTexts: 2,
        treasures: 1,
        shops: 1,
        simpleEncounters: 1,
        complexEncounters: 1,
        thiefEncounters: 1,
        timedEncounters: 1,
        managedAssets: 2,
        packagedAssetPayloads: 4
      },
      limitations: ["Known compatibility boundary"]
    });

    expect(report.target).toBe("realmz-remake-folder");
    expect(report.outputPath).toBe("C:\\Exports\\Proof");
    expect(report.writtenFiles).toEqual(["campaign.json", "classic/maps.json"]);
    expect(report.remakeCounts?.packagedAssetPayloads).toBe(4);
    expect(report.warnings).toEqual(["Known compatibility boundary"]);
  });
});
