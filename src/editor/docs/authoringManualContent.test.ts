/// <reference types="vite/client" />

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

const GALLERY_IMAGES = new Set(
  Object.keys(import.meta.glob("../../../public/manual/gallery/*.png", { eager: true, query: "?url", import: "default" }))
    .map((path) => `/manual/gallery/${path.split("/").pop()}`)
);

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

  it("teaches the Providence editor instead of delegating the chapter to references", () => {
    for (const id of CORE_CHAPTER_IDS) {
      const topic = documentationTopicById(id);
      const editorTours = topic.sections.filter((section) => /inside|tour|project controls/i.test(section.title));
      const body = chapterBody(topic);

      expect(editorTours.length, `${topic.label} editor tour`).toBeGreaterThanOrEqual(1);
      expect(body.length, `${topic.label} chapter detail`).toBeGreaterThan(1_200);
      expect(body, `${topic.label} internal planning language`).not.toMatch(/reserve the preview space|writer boundar|repo reference|source-backed|provenance|codex/i);
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

  it("keeps developer planning and automation instructions out of the manual body", () => {
    for (const topic of DOCUMENTATION_TOPICS) {
      expect(chapterBody(topic), topic.label).not.toMatch(/codex|reserve the preview space|follow-up issue|roadmap|fixture-proven|oracle harness|writer support|repo reference/i);
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
  });

  it("keeps committed editor screenshots behind the core chapter galleries", () => {
    const illustratedChapters = CORE_CHAPTER_IDS.filter((id) => documentationVisualReferences(documentationTopicById(id)).length > 0);
    expect(illustratedChapters).toHaveLength(CORE_CHAPTER_IDS.length - 1);

    for (const id of illustratedChapters) {
      for (const slot of documentationVisualReferences(documentationTopicById(id))) {
        expect(slot.imageSrc, `${id} gallery path`).toMatch(/^\/manual\/gallery\/[a-z0-9-]+\.png$/);
        expect(GALLERY_IMAGES.has(slot.imageSrc), `${id} gallery file`).toBe(true);
      }
    }
  });
});

function chapterBody(topic: ReturnType<typeof documentationTopicById>) {
  return topic.sections.flatMap((section) => [
    section.title,
    ...(section.paragraphs ?? []),
    ...(section.points ?? []),
    ...(section.steps ?? []).flatMap((step) => [step.title, step.body, step.result ?? ""]),
    ...(section.cards ?? []).flatMap((card) => [card.title, card.body, ...(card.facts ?? [])]),
    section.callout?.title ?? "",
    section.callout?.body ?? ""
  ]).join(" ");
}
