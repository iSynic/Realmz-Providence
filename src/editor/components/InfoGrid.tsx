import { ReactNode } from "react";

export function InfoGrid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
