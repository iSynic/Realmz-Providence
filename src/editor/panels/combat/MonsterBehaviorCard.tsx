import { ContextualBehaviorCard } from "../../components/ContextualBehaviorCard";
import type { MonsterRecord, Project, ProjectCommand } from "../../types";

export function MonsterBehaviorCard({
  project,
  monster,
  onApplyCommand
}: {
  project: Project;
  monster: MonsterRecord;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  return (
    <ContextualBehaviorCard
      project={project}
      role="monster-ai"
      hook="decide"
      targetKind="monster"
      recordId={String(monster.id)}
      recordLabel={`${monster.displayName || `Monster ${monster.id}`} combat decision`}
      onApplyCommand={onApplyCommand}
    />
  );
}
