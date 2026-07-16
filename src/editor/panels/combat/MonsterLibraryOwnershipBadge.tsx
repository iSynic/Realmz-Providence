import { TutorialTip } from "../../components/TutorialTip";

export function MonsterLibraryOwnershipBadge({ custom }: { custom: boolean }) {
  const label = custom ? "Providence Custom Library" : "Protected Built-in Reference";
  const help = custom
    ? "Reusable Providence monster template shared across projects. Copy it into Scenario Monsters before a scenario owns or exports it."
    : "Protected built-in monster template. Preview it, create a Providence customization, or copy it into Scenario Monsters without changing the bundled reference.";
  return (
    <TutorialTip title={label} body={help} side="below">
      <span className={`monster-library-ownership-badge ${custom ? "custom" : "built-in"}`}>{label}</span>
    </TutorialTip>
  );
}
