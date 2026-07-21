export function MapPaintProtectionSummary({
  enabled,
  onSetEnabled
}: {
  enabled: boolean;
  onSetEnabled: (enabled: boolean) => void;
}) {
  return (
    <section className="map-paint-protection" aria-label="Map painting safeguards">
      <label className="map-paint-protection-toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => onSetEnabled(event.currentTarget.checked)} />
        <strong>Protect Features</strong>
      </label>
    </section>
  );
}
