import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { EmptyState, LinkChip, PanelSection, PreviewCard } from "../ui";

type DocumentSection = {
  id: string;
  label: string;
  title: string;
  eyebrow: string;
  body: string[];
  cards?: Array<{ title: string; body: string; facts?: string[] }>;
};

const SECTIONS: DocumentSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    title: "Providence Workbenches",
    eyebrow: "Suite orientation",
    body: [
      "Providence has a Project Workbench for scenario packages and a Library Workbench for bundled Realmz and Divinity data.",
      "Create or open a project before importing a scenario. Scenario import is intentionally disabled once a project contains records so source data cannot be accidentally merged."
    ],
    cards: [
      { title: "Project Workbench", body: "Maps, scripts, scenario data, managed assets, validation, and export safety.", facts: ["editable", "exportable"] },
      { title: "Library Workbench", body: "Read-only shared fixtures: pictures, sounds, icons, items, monsters, spells, races, castes, and reference resources.", facts: ["read-only", "shared"] }
    ]
  },
  {
    id: "projects",
    label: "Projects",
    title: "Projects, Import, and Export",
    eyebrow: "Folder package workflow",
    body: [
      "A Providence project is a folder package with its own schema, source snapshot metadata, managed assets, semantic records, and editor-only names.",
      "Export writes a new Realmz-readable scenario folder. Source scenarios remain read-only evidence and are never mutated."
    ],
    cards: [
      { title: "New Project", body: "Creates an empty package. Import remains available while the package is empty.", facts: ["empty package"] },
      { title: "Open Project", body: "Loads a valid Providence folder package.", facts: ["folder package"] },
      { title: "Export", body: "Writes supported edited records and passes through unsupported compatible source files.", facts: ["safe output"] }
    ]
  },
  {
    id: "assets",
    label: "Assets",
    title: "Assets and Resource Forks",
    eyebrow: "Media compatibility",
    body: [
      "Project assets are user-authored media converted into Realmz resource entries. Library assets are bundled reference material and remain read-only.",
      "Each resource should either preview/play/decode or explain why it is metadata-only, unsupported, malformed, or missing a fallback."
    ],
    cards: [
      { title: "Pictures", body: "Imported images are converted into PICT resources for scripts such as picture display actions.", facts: ["PICT"] },
      { title: "Sounds", body: "Imported audio is browser-decoded to PCM and exported as classic sampled snd resources when supported.", facts: ["snd"] },
      { title: "Icons", body: "32 x 32 icon-like art is converted into cicn resources for Realmz-compatible icon workflows.", facts: ["cicn"] }
    ]
  },
  {
    id: "pictures-sounds",
    label: "Pictures & Sounds",
    title: "Picture and Sound Authoring",
    eyebrow: "Divinity-compatible roles",
    body: [
      "Divinity exposed pictures and sounds as scenario resources addressed by script codes. Providence keeps that native Realmz model.",
      "Use the Assets panel to import, preview, play, name, replace, and assign resource IDs. Editor-only names help authors work, but only real Realmz fields and resources are exported."
    ]
  },
  {
    id: "special-land",
    label: "Special Land Tiles",
    title: "Special Land Tiles",
    eyebrow: "32 x 32 cicn tiles",
    body: [
      "Special Land Tiles are small scenario cicn resources addressed by negative tile IDs such as -100. They are not the same thing as standard landlook tile atlases.",
      "Providence imports an image, normalizes it to 32 x 32 pixels, creates a cicn resource, assigns the next available negative ID, and can select that tile for painting."
    ],
    cards: [
      { title: "Use Special Tile", body: "Select for painting, then paint it on a land map like any other tile value.", facts: ["paintable"] },
      { title: "Export Safety", body: "A Special Land Tile exports only when converted cicn bytes are present and the resource ID is valid.", facts: ["validated"] }
    ]
  },
  {
    id: "standard-land",
    label: "Standard Land Sets",
    title: "Standard Land Tile Sets",
    eyebrow: "Future atlas editor",
    body: [
      "Divinity also had a Standard Land Tile Editor for full landlook tile sets. Those are large PICT atlas-style resources, separate from Special Land Tiles.",
      "Providence currently documents and inventories these resources; destructive atlas editing remains blocked until fixture-backed writer support exists."
    ]
  },
  {
    id: "scripts",
    label: "Action Points",
    title: "Action Points, GOSUBs, CODE/ID, and EDCD",
    eyebrow: "Realmz-native script model",
    body: [
      "Providence scripts are Realmz-native: action slots preserve CODE/ID values and use EDCD rows for parameter-heavy operations.",
      "The visual editor is inspired by Adventure Engine's step editing, but it does not compile JavaScript. It emits and validates Realmz records."
    ]
  },
  {
    id: "records",
    label: "Records",
    title: "Records and Evidence",
    eyebrow: "Archaeology model",
    body: [
      "The semantic schema keeps raw sources, decoded records, entities, links, reverse links, evidence, and diagnostics separate.",
      "Unknown records stay inspectable and source-backed. Editing is blocked until the format has fixture-backed writer coverage."
    ]
  },
  {
    id: "linter-export",
    label: "Linter & Export",
    title: "Linter and Export Safety",
    eyebrow: "Compatibility gates",
    body: [
      "The linter explains missing resources, unsupported edits, malformed forks, generated caches, unresolved semantic links, and export blockers.",
      "Export is conservative: supported edited files are written, compatible unsupported files pass through, and destructive unknown writes are blocked."
    ]
  }
];

export function DocumentsView({
  onClose,
  initialSection = SECTIONS[0].id,
  onSectionChange
}: {
  onClose: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const section = SECTIONS.find((candidate) => candidate.id === activeSection) ?? SECTIONS[0];

  function selectSection(sectionId: string) {
    setActiveSection(sectionId);
    onSectionChange?.(sectionId);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="documents-overlay" role="presentation" onClick={onClose}>
      <section className="documents-panel" role="dialog" aria-modal="true" aria-label="Providence Documents" onClick={(event) => event.stopPropagation()}>
        <header className="documents-header">
          <div>
            <span>Providence Documents</span>
            <strong>{section.title}</strong>
          </div>
          <button className="btn btn-ghost btn-xs" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="documents-body">
          <nav className="documents-nav" aria-label="Document sections">
            {SECTIONS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={candidate.id === activeSection ? "active" : ""}
                onClick={() => selectSection(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </nav>
          <article className="documents-content documents-content-workbench">
            <PanelSection
              eyebrow={section.eyebrow}
              title={section.title}
              count={section.cards?.length ? `${section.cards.length} notes` : undefined}
            >
              <div className="documents-copy">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.cards && (
                <div className="documents-chip-row" aria-label="Document topics">
                  {section.cards.map((card) => (
                    <LinkChip key={card.title} label={card.title} inert />
                  ))}
                </div>
              )}
            </PanelSection>
            {section.cards && (
              <PanelSection title="Workbench Notes" density="compact">
                <div className="workbench-preview-grid">
                  {section.cards.map((card) => (
                    <PreviewCard key={card.title} title={card.title} subtitle={card.body} facts={card.facts} />
                  ))}
                </div>
              </PanelSection>
            )}
            <EmptyState
              compact
              icon={<Camera size={18} />}
              title="Screenshot Slots"
              body="Illustrated reference slots are ready for stable Providence and Divinity screenshots as the UI settles."
            />
          </article>
        </div>
      </section>
    </div>
  );
}
