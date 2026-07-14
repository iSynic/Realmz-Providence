import { describe, expect, it } from "vitest";
import {
  DOCUMENTATION_GROUPS,
  DOCUMENTATION_TOPICS,
  documentationSearchText,
  documentationTopicById,
  documentationVisualReferences
} from "./authoringManualContent";

const CORE_CHAPTER_IDS = [
  "getting-started",
  "projects",
  "scenario",
  "maps",
  "player-maps",
  "scripts",
  "text",
  "encounters-targets",
  "combat",
  "economy",
  "rules",
  "assets",
  "linter-release"
] as const;

const AUTHORING_DOMAINS = new Set([
  "maps",
  "player-maps",
  "scripts",
  "text",
  "scenario",
  "rules",
  "encounters",
  "combat",
  "economy",
  "assets",
  "linter",
  "export"
]);

describe("Providence authoring manual", () => {
  it("keeps the authoring chapters separate from reference appendices", () => {
    expect(DOCUMENTATION_GROUPS.map((group) => group.id)).toEqual(["chapters", "appendix"]);
    expect(CORE_CHAPTER_IDS.every((id) => documentationTopicById(id).groupId === "chapters")).toBe(true);
    expect(DOCUMENTATION_TOPICS.filter((topic) => topic.groupId === "appendix").length).toBeGreaterThanOrEqual(6);
  });

  it("gives every core chapter a substantive procedure and practical cautions", () => {
    for (const id of CORE_CHAPTER_IDS) {
      const topic = documentationTopicById(id);
      const procedures = topic.sections.filter((section) => (section.steps?.length ?? 0) >= 4);
      const cautions = topic.sections.filter((section) => /pitfalls|practical checks/i.test(section.title));

      expect(topic.sections.length, `${topic.label} section count`).toBeGreaterThanOrEqual(3);
      expect(procedures.length, `${topic.label} numbered procedure`).toBeGreaterThanOrEqual(1);
      expect(cautions.length, `${topic.label} practical cautions`).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps chapter links and tool actions resolvable", () => {
    const topicIds = new Set(DOCUMENTATION_TOPICS.map((topic) => topic.id));

    for (const topic of DOCUMENTATION_TOPICS) {
      for (const relatedId of topic.relatedTopicIds) {
        expect(topicIds.has(relatedId), `${topic.id} -> ${relatedId}`).toBe(true);
      }
      for (const target of topic.toolTargets ?? []) {
        expect(AUTHORING_DOMAINS.has(target.domain), `${topic.id} -> ${target.domain}`).toBe(true);
        expect(target.editor.trim().length, `${topic.id} editor`).toBeGreaterThan(0);
        expect(target.label.trim().length, `${topic.id} action label`).toBeGreaterThan(0);
      }
    }
  });

  it("indexes procedural text for author-facing search", () => {
    expect(documentationSearchText(documentationTopicById("scripts"))).toContain("apply step");
    expect(documentationSearchText(documentationTopicById("maps"))).toContain("combat-clearing");
    expect(documentationSearchText(documentationTopicById("assets"))).toContain("scenario-range id");
    expect(documentationSearchText(documentationTopicById("linter-release"))).toContain("providence project zip");
  });

  it("does not expose unfinished visual placeholders as references", () => {
    for (const topic of DOCUMENTATION_TOPICS) {
      expect(documentationVisualReferences(topic).every((slot) => slot.imageSrc.length > 0)).toBe(true);
    }
    expect(documentationVisualReferences(documentationTopicById("getting-started"))).toEqual([]);
  });
});
