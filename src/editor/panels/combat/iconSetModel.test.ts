import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { LibraryAsset, MonsterIconOverride, MonsterRecord } from "../../types";
import {
  MONSTER_ICON_PAIR_OFFSET,
  monsterIconSetTabCount,
  monsterIconTargetSourceStatus,
  nextScenarioMonsterIconTargetBaseId,
  resolveMonsterIconTargetPair,
  type MonsterIconTargetLookups
} from "./iconSetModel";

function asset(resourceId: number, source = "Realmz reference"): LibraryAsset {
  return {
    id: `asset:${resourceId}`,
    type: "icon",
    label: `Icon ${resourceId}`,
    source,
    relativePath: `cicn/${resourceId}`,
    bytes: 1,
    sha256: `icon-${resourceId}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,${resourceId}`,
    mimeType: "image/png"
  };
}

function override(targetBaseIconId: number): MonsterIconOverride {
  return {
    targetBaseIconId,
    sourceBaseIconId: 900,
    sourceLabel: `Override ${targetBaseIconId}`,
    sourceKind: "monster-mash",
    sourceBaseResourceBase64: "override-base",
    sourcePairedResourceBase64: "override-paired"
  };
}

function lookups(overrides: MonsterIconOverride[] = []): MonsterIconTargetLookups {
  return {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterIconOverridesByTarget: new Map(overrides.map((entry) => [entry.targetBaseIconId, entry]))
  };
}

describe("combat icon set model", () => {
  it("keeps scenario overrides ahead of scenario resources and default art", () => {
    const project = createBrowserProject("Icon precedence");
    const selectedOverride = override(400);
    project.monsterIconOverrides = [selectedOverride];
    project.scenarioIconResources = [
      { resourceId: 400, label: "Scenario base", sourceKind: "scenario-resource", resourceBase64: "scenario-base" },
      { resourceId: 400 + MONSTER_ICON_PAIR_OFFSET, label: "Scenario paired", sourceKind: "scenario-resource", resourceBase64: "scenario-paired" }
    ];
    const model = lookups([selectedOverride]);
    model.realmzActorIconAssetsByAbsId.set(400, asset(400));
    model.realmzActorIconAssetsByAbsId.set(400 + MONSTER_ICON_PAIR_OFFSET, asset(400 + MONSTER_ICON_PAIR_OFFSET));

    const resolved = resolveMonsterIconTargetPair(project, model, {}, 400, true);

    expect(resolved).not.toBeNull();
    expect(resolved?.override).toBe(selectedOverride);
    expect(resolved?.resourceBase64).toBe("override-base");
    expect(resolved?.pairedResourceBase64).toBe("override-paired");
    expect(resolved && monsterIconTargetSourceStatus(resolved)).toBe("scenario-override");
  });

  it("counts only complete target pairs across override, scenario, and default sources", () => {
    const project = createBrowserProject("Icon counts");
    const selectedOverride = override(400);
    project.monsterIconOverrides = [selectedOverride];
    project.monsters = [500, 600, 700].map((iconId, id) => ({ id, iconId }) as MonsterRecord);
    project.scenarioIconResources = [
      { resourceId: 500, label: "Scenario base", sourceKind: "scenario-resource", resourceBase64: "base" },
      { resourceId: 500 + MONSTER_ICON_PAIR_OFFSET, label: "Scenario paired", sourceKind: "scenario-resource", resourceBase64: "paired" }
    ];
    const model = lookups([selectedOverride]);
    model.realmzActorIconAssetsByAbsId.set(600, asset(600));
    model.realmzActorIconAssetsByAbsId.set(600 + MONSTER_ICON_PAIR_OFFSET, asset(600 + MONSTER_ICON_PAIR_OFFSET));
    model.realmzActorIconAssetsByAbsId.set(700, asset(700));

    expect(monsterIconSetTabCount(project, model)).toBe(3);
  });

  it("allocates a target base without colliding with either member of an override pair", () => {
    const sourceBaseId = 601;
    const targets = [
      { baseId: 601, override: override(601) },
      { baseId: 294, override: override(294) }
    ];

    expect(294 + MONSTER_ICON_PAIR_OFFSET).toBe(602);
    expect(nextScenarioMonsterIconTargetBaseId(sourceBaseId, targets)).toBe(603);
  });
});
