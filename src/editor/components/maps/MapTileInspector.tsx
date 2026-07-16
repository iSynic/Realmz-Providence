import { normalizeIconId } from "../../map/renderValues";
import { classifyTileValue } from "../../map/tileMetadata";
import type { ProjectCommand } from "../../types";
import { InfoGrid } from "../InfoGrid";
import { attributeSourceLabel, forestTypeLabel, normalizedCombatBuild, tileAttributeLabel, yesNo } from "./mapTileUiUtils";

export function TileMeaningInspector({
  title,
  meaning,
  compact = false
}: {
  title: string;
  meaning: ReturnType<typeof classifyTileValue>;
  compact?: boolean;
}) {
  const flags = [
    meaning.flags.markerBit ? "marker" : null,
    meaning.flags.pathBit ? "path" : null,
    meaning.flags.noteBit ? "note" : null,
    meaning.iconId != null ? `icon ${meaning.iconId}` : null
  ].filter(Boolean).join(", ") || "none";
  const iconState = meaning.iconCandidates.length === 0
    ? "none"
    : meaning.iconAvailable
      ? `loaded ${meaning.iconCandidates.join(", ")}`
      : `missing ${meaning.iconCandidates.join(", ")}`;
  const attributes = meaning.attributes;
  const attributeFlags = meaning.attributeFlags.length ? meaning.attributeFlags.map(tileAttributeLabel).join(", ") : "unknown";
  return (
    <div className={`tile-meaning-inspector${compact ? " compact" : ""}`}>
      <div className="tile-meaning-title">
        <span>{title}</span>
        <b>{meaning.kind.replace(/-/g, " ")}</b>
      </div>
      <div className="tile-meaning-grid">
        <span>Raw</span>
        <b>{meaning.raw}</b>
        <span>Render</span>
        <b>{meaning.renderTile}</b>
        <span>Normalized</span>
        <b>{meaning.normalized}</b>
        <span>Flags</span>
        <b>{flags}</b>
        <span>Icon Art</span>
        <b>{iconState}</b>
        <span>Solid Type</span>
        <b>{attributes?.solidType ?? "unknown"}</b>
        <span>Traits</span>
        <b>{attributeFlags}</b>
        <span>Attribute Table</span>
        <b>{attributeSourceLabel(attributes)}</b>
        <span>Move Cost</span>
        <b>{attributes?.movementCost ?? "unknown"}</b>
        <span>Sound</span>
        <b>{attributes?.movementSoundId ?? "unknown"}</b>
        <span>Shore / Water</span>
        <b>{yesNo(attributes?.shore)}</b>
        <span>Runtime Path</span>
        <b>{yesNo(attributes?.pathFlag)}</b>
        <span>Road Art</span>
        <b>{meaning.attributeFlags.includes("visual-path") ? "yes" : "no"}</b>
        <span>Boat Required</span><b>{attributes?.boatRequirement ?? "unknown"}</b>
        <span>Blocks LOS</span>
        <b>{yesNo(attributes?.blocksLos)}</b>
        <span>Fly / Float</span>
        <b>{yesNo(attributes?.flyFloatRequired)}</b>
        <span>Forest</span>
        <b>{forestTypeLabel(attributes?.forestType)}</b>
        <span>Combat Map</span>
        <b>{normalizedCombatBuild(attributes) ? "3 x 3 expansion" : "none"}</b>
        <span>Status</span>
        <b>{userFacingConfidence(attributes?.confidence ?? (meaning.iconCandidates.length > 0 ? "preserved" : "unknown"))}</b>
      </div>
      {!compact && <p>{meaning.compatibility}</p>}
    </div>
  );
}

export function SpecialTileSolidityEditor({
  meaning,
  onApplyCommand
}: {
  meaning: ReturnType<typeof classifyTileValue>;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const attributes = meaning.attributes;
  if (meaning.raw >= 0 || attributes?.sourceKind !== "data-solids") return null;
  const tile = attributes.tile ?? Math.abs(normalizeIconId(meaning.raw) ?? meaning.raw);
  const solid = attributes.flags.includes("solid") || Boolean(attributes.solidType);
  return (
    <div className="tile-attribute-editor compact">
      <div className="tile-meaning-title">
        <span>Special Tile Solidity</span>
        <b>Data Solids</b>
      </div>
      <InfoGrid
        rows={[
          ["Special Tile", meaning.raw],
          ["Data Solids Row", tile],
          ["Passable", solid ? "no" : "yes"],
          ["Source", attributes.source]
        ]}
      />
      <div className="tile-toggle-grid">
        <button
          type="button"
          className={!solid ? "active" : ""}
          onClick={() => onApplyCommand({ kind: "updateSpecialTileSolidity", label: "Make special tile passable", tile, solid: false })}
        >
          Passable
          <b>{!solid ? "yes" : "set"}</b>
        </button>
        <button
          type="button"
          className={solid ? "active" : ""}
          onClick={() => onApplyCommand({ kind: "updateSpecialTileSolidity", label: "Make special tile solid", tile, solid: true })}
        >
          Solid
          <b>{solid ? "yes" : "set"}</b>
        </button>
      </div>
    </div>
  );
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}
