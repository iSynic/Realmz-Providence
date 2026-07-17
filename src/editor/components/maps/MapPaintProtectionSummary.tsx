import type { MapPaintOperationImpact } from "../../map/mapPaintSafeguards";

export function MapPaintProtectionSummary({
  enabled,
  impact,
  onSetEnabled
}: {
  enabled: boolean;
  impact: MapPaintOperationImpact | null;
  onSetEnabled: (enabled: boolean) => void;
}) {
  const protectedCount = impact?.protectedChanges.length ?? 0;
  const protectedReasons = impact
    ? [
        impact.protectedCounts["action-point"] > 0 ? `${impact.protectedCounts["action-point"]} Action Point` : null,
        impact.protectedCounts["special-icon"] > 0 ? `${impact.protectedCounts["special-icon"]} icon-backed` : null,
        impact.protectedCounts.structure > 0 ? `${impact.protectedCounts.structure} structure` : null
      ].filter((reason): reason is string => reason != null)
    : [];
  return (
    <section className="map-paint-protection" aria-label="Map painting safeguards">
      <label className="map-paint-protection-toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => onSetEnabled(event.currentTarget.checked)} />
        <strong>Protect Features</strong>
      </label>
      {impact && impact.requestedCount > 0 && (
        <div className="map-paint-impact-summary">
          <div>
            <strong>{impact.allowedChanges.length.toLocaleString()} will change</strong>
            <span>{protectedCount.toLocaleString()} protected</span>
          </div>
          {protectedCount > 0 && <small>{protectedReasons.join("; ")}</small>}
          <div className="map-paint-composition" aria-label="Original tile composition">
            <span>Original tiles</span>
            {impact.sourceComposition.slice(0, 5).map(({ tile, count }) => (
              <b key={tile}>Tile {tile} x{count.toLocaleString()}</b>
            ))}
            {impact.sourceComposition.length > 5 && <b>+{impact.sourceComposition.length - 5} more</b>}
          </div>
        </div>
      )}
    </section>
  );
}
