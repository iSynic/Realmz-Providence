import { AlertTriangle } from "lucide-react";
import type { ScriptDiagnostic } from "../../scriptValidation";

export function ScriptDiagnostics({ issues }: { issues: ScriptDiagnostic[] }) {
  if (issues.length === 0) {
    return (
      <div className="script-diagnostics ok">
        <span>Ready</span>
        <strong>No script blockers detected for this selection.</strong>
      </div>
    );
  }
  return (
    <div className="script-diagnostics">
      {issues.slice(0, 5).map((issue) => (
        <div key={issue.id} className={`script-diagnostic ${issue.severity}`}>
          <AlertTriangle size={13} />
          <span>
            <strong>{issue.slot != null ? `Slot ${issue.slot}: ${issue.message}` : issue.message}</strong>
            <small>{issue.detail}</small>
          </span>
        </div>
      ))}
      {issues.length > 5 && <small className="script-diagnostic-more">{issues.length - 5} more issue(s) in this script.</small>}
    </div>
  );
}
