import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Camera, ExternalLink, FileText, ListTree } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";
import { EmptyState, LinkChip, ModalDialog, PanelSection, PreviewCard, SearchField } from "../ui";
import {
  DOCUMENTATION_GROUPS,
  DOCUMENTATION_TOPICS,
  DocumentationCallout,
  DocumentationReference,
  DocumentationSection,
  DocumentationToolTarget,
  DocumentationTopic,
  DocumentationVisualSlot,
  documentationSearchText,
  documentationTopicById,
  documentationVisualReferences
} from "../docs/authoringManualContent";

const DOCUMENTS_HELP =
  "Documents is Providence's authoring manual. It explains the editor controls, records, and workflows used to build a Realmz scenario.";
const DOCUMENT_SEARCH_HELP =
  "Document search scans every chapter and appendix. Search for the editor task, record, field, or warning you are working with.";
const DOCUMENT_NAV_HELP =
  "The navigation list groups the manual into chapters and appendices. Selecting a chapter only changes the manual view; it does not change the active project.";
const TOPIC_HERO_HELP =
  "The chapter header summarizes the selected authoring area and opens the corresponding Providence tools.";
const VISUAL_SLOTS_HELP =
  "Chapter galleries show the actual Providence editor surfaces described by the manual.";
const RELATED_TOPICS_HELP =
  "Related chapters are curated jumps to adjacent concepts. They clear the current document search so you can keep reading without fighting the filter.";
const SOURCE_REFERENCES_HELP =
  "Further references are optional background. The chapter itself is the Providence editor manual.";
const CHAPTER_NAV_HELP =
  "Use these links to jump to a specific editor surface or task in the current chapter.";
const DIVINITY_SOURCE_HELP =
  "Divinity source chips open the local Divinity Manual chapter that anchors a legacy concept or editor behavior.";
const REPO_SOURCE_HELP =
  "Technical reference chips identify compatibility notes and supporting project documentation for readers who need implementation-level detail.";

export function DocumentsView({
  onClose,
  initialSection = DOCUMENTATION_TOPICS[0].id,
  onSectionChange,
  onOpenDivinityReference,
  onOpenTool
}: {
  onClose: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
  onOpenDivinityReference?: (href: string) => void;
  onOpenTool?: (target: DocumentationToolTarget) => void;
}) {
  const [activeSection, setActiveSection] = useState(() => documentationTopicById(initialSection).id);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setActiveSection(documentationTopicById(initialSection).id);
  }, [initialSection]);

  const filteredTopics = useMemo(() => {
    if (!normalizedQuery) return DOCUMENTATION_TOPICS;
    return DOCUMENTATION_TOPICS.filter((topic) => documentationSearchText(topic).includes(normalizedQuery));
  }, [normalizedQuery]);

  const groupedTopics = useMemo(() => {
    return DOCUMENTATION_GROUPS.map((group) => ({
      group,
      topics: filteredTopics.filter((topic) => topic.groupId === group.id)
    })).filter((entry) => entry.topics.length > 0);
  }, [filteredTopics]);

  const activeTopic = filteredTopics.find((topic) => topic.id === activeSection) ?? filteredTopics[0] ?? documentationTopicById(activeSection);
  const relatedTopics = activeTopic.relatedTopicIds.map(documentationTopicById).filter((topic) => topic.id !== activeTopic.id);
  const displayReferences = activeTopic.groupId === "chapters"
    ? activeTopic.references.filter((reference) => reference.kind === "divinity")
    : activeTopic.references;
  const visibleVisualSlots = documentationVisualReferences(activeTopic);

  function selectSection(sectionId: string, options: { clearSearch?: boolean } = {}) {
    if (options.clearSearch) setQuery("");
    setActiveSection(sectionId);
    onSectionChange?.(sectionId);
  }

  return (
    <ModalDialog
      backdropClassName="documents-overlay"
      className="documents-panel"
      ariaLabel="Providence Authoring Manual"
      initialFocusSelector=".documents-search input"
      onDismiss={onClose}
    >
        <header className="documents-header">
          <div>
            <TutorialTip title="Providence Documents" body={DOCUMENTS_HELP} side="below">
              <span>Providence Authoring Manual</span>
            </TutorialTip>
            <strong>{activeTopic.title}</strong>
          </div>
          <button className="btn btn-ghost btn-xs" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="documents-body">
          <aside className="documents-nav-shell">
            <SearchField
              className="documents-search"
              label={(
                <TutorialTip title="Search Documents" body={DOCUMENT_SEARCH_HELP} side="below">
                  <span>Manual Search</span>
                </TutorialTip>
              )}
              value={query}
              onChange={setQuery}
              placeholder="Search manual"
              ariaLabel="Search manual"
              resultCount={normalizedQuery ? filteredTopics.length : undefined}
              resultNoun="chapter"
              resultNounPlural="chapters"
            />
            <nav className="documents-nav" aria-label="Manual chapters">
              {groupedTopics.map(({ group, topics }) => (
                <section key={group.id} className="documents-nav-group" aria-label={group.label}>
                  <header>
                    <TutorialTip title={group.label} body={DOCUMENT_NAV_HELP} side="below">
                      <strong>{group.label}</strong>
                    </TutorialTip>
                    <span>{topics.length}</span>
                  </header>
                  {topics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      data-document-topic={topic.id}
                      className={topic.id === activeTopic.id ? "active" : ""}
                      onClick={() => selectSection(topic.id)}
                    >
                      <span>{topic.label}</span>
                      <small>{topic.summary}</small>
                    </button>
                  ))}
                </section>
              ))}
              {filteredTopics.length === 0 && (
                <EmptyState compact title="No document matches" body="Try searching for teleport, map tile, item response, custom sound, or export warning." />
              )}
            </nav>
          </aside>

          <article className="documents-content documents-content-workbench" data-active-document-topic={activeTopic.id}>
            <TopicHero
              topic={activeTopic}
              resultCount={filteredTopics.length}
              searching={Boolean(normalizedQuery)}
              onOpenTool={onOpenTool}
            />
            {visibleVisualSlots.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Chapter Gallery" body={VISUAL_SLOTS_HELP} side="below">
                    <span>Chapter Gallery</span>
                  </TutorialTip>
                )}
                eyebrow="Providence editor"
                count={`${visibleVisualSlots.length} image${visibleVisualSlots.length === 1 ? "" : "s"}`}
              >
                <div className="documents-visual-grid">
                  {visibleVisualSlots.map((slot) => (
                    <VisualSlot key={slot.title} slot={slot} />
                  ))}
                </div>
              </PanelSection>
            )}
            {activeTopic.sections.map((section) => (
              <ArticleSection key={section.title} topicId={activeTopic.id} section={section} />
            ))}
            {relatedTopics.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Related Topics" body={RELATED_TOPICS_HELP} side="below">
                    <span>Related Chapters</span>
                  </TutorialTip>
                )}
                eyebrow="Keep reading"
                density="compact"
              >
                <div className="documents-chip-row" aria-label="Related document topics">
                  {relatedTopics.map((topic) => (
                    <LinkChip key={topic.id} label={topic.label} detail={topic.groupId === "appendix" ? "appendix" : "chapter"} onClick={() => selectSection(topic.id, { clearSearch: true })} />
                  ))}
                </div>
              </PanelSection>
            )}
            {displayReferences.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Source References" body={SOURCE_REFERENCES_HELP} side="below">
                    <span>Further Reference</span>
                  </TutorialTip>
                )}
                eyebrow="Optional background"
                density="compact"
              >
                <details className="documents-reference-drawer">
                  <summary>Open classic and technical references</summary>
                  <div className="documents-source-list">
                    {displayReferences.map((reference) => (
                      <SourceReferenceChip key={referenceKey(reference)} reference={reference} onOpenDivinityReference={onOpenDivinityReference} />
                    ))}
                  </div>
                </details>
              </PanelSection>
            )}
          </article>

          <aside className="documents-reference-panel" aria-label="Reading tools">
            <PanelSection
              title={(
                <TutorialTip title="In This Chapter" body={CHAPTER_NAV_HELP} side="below">
                  <span>In This Chapter</span>
                </TutorialTip>
              )}
              eyebrow="Jump to"
              density="compact"
            >
              <nav className="documents-section-nav" aria-label="Sections in this chapter">
                {activeTopic.sections.map((section) => (
                  <a key={section.title} href={`#${sectionAnchor(activeTopic.id, section.title)}`}>
                    <ListTree size={12} />
                    <span>{section.title}</span>
                  </a>
                ))}
              </nav>
            </PanelSection>
          </aside>
        </div>
    </ModalDialog>
  );
}

function TopicHero({
  topic,
  resultCount,
  searching,
  onOpenTool
}: {
  topic: DocumentationTopic;
  resultCount: number;
  searching: boolean;
  onOpenTool?: (target: DocumentationToolTarget) => void;
}) {
  return (
    <PanelSection
      eyebrow={topic.groupId === "appendix" ? "Appendix" : "Manual chapter"}
      title={(
        <TutorialTip title="Topic Header" body={TOPIC_HERO_HELP} side="below">
          <span>{topic.title}</span>
        </TutorialTip>
      )}
      count={searching ? `${resultCount} result${resultCount === 1 ? "" : "s"}` : `${topic.sections.length} sections`}
    >
      <div className="documents-topic-hero">
        <div className="documents-topic-hero-copy">
          <p>{topic.summary}</p>
        </div>
        {topic.toolTargets && topic.toolTargets.length > 0 && (
          <div className="documents-topic-actions" aria-label="Open chapter tools">
            {topic.toolTargets.map((target) => (
              <button
                key={`${target.domain}:${target.editor}`}
                className="btn btn-secondary btn-xs"
                type="button"
                disabled={!onOpenTool}
                title={onOpenTool ? `Open ${target.label}` : "Open or import a project first"}
                onClick={() => onOpenTool?.(target)}
              >
                {target.label}
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </PanelSection>
  );
}

function ArticleSection({ topicId, section }: { topicId: string; section: DocumentationSection }) {
  return (
    <div id={sectionAnchor(topicId, section.title)} className="documents-section-anchor">
      <PanelSection title={section.title} density="compact">
        <div className="documents-article-section">
          {section.paragraphs && (
            <div className="documents-copy">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          )}
          {section.points && (
            <ul className="documents-point-list">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          {section.steps && (
            <ol className="documents-step-list">
              {section.steps.map((step) => (
                <li key={step.title}>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.body}</span>
                    {step.result && <small>{step.result}</small>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {section.cards && (
            <div className="workbench-preview-grid">
              {section.cards.map((card) => (
                <PreviewCard key={card.title} title={card.title} subtitle={card.body} facts={card.facts} />
              ))}
            </div>
          )}
          {section.callout && <DocumentationCalloutView callout={section.callout} />}
        </div>
      </PanelSection>
    </div>
  );
}

function DocumentationCalloutView({ callout }: { callout: DocumentationCallout }) {
  return (
    <aside className={`documents-callout tone-${callout.tone}`}>
      <strong>{callout.title}</strong>
      <span>{callout.body}</span>
    </aside>
  );
}

function VisualSlot({ slot }: { slot: DocumentationVisualSlot }) {
  return (
    <article className="documents-visual-slot">
      <div className="documents-visual-frame">
        {slot.imageSrc ? <img src={slot.imageSrc} alt={slot.title} /> : <Camera size={22} />}
      </div>
      <div>
        <strong>{slot.title}</strong>
        <span>{slot.caption}</span>
        {slot.sourceHref && (
          <a href={slot.sourceHref} target="_blank" rel="noreferrer">
            {slot.sourceLabel ?? "Open source"}
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </article>
  );
}

function SourceReferenceChip({ reference, onOpenDivinityReference }: { reference: DocumentationReference; onOpenDivinityReference?: (href: string) => void }) {
  if (reference.kind === "divinity") {
    return (
      <TutorialTip title="Divinity Manual Reference" body={DIVINITY_SOURCE_HELP} side="left">
        <button className="documents-source-chip source-divinity" type="button" onClick={() => onOpenDivinityReference?.(reference.href)}>
          <BookOpen size={13} />
          <span>
            <strong>{reference.label}</strong>
            <small>{reference.detail}</small>
          </span>
          <BookOpen size={12} />
        </button>
      </TutorialTip>
    );
  }

  return (
    <TutorialTip title="Technical Reference" body={REPO_SOURCE_HELP} side="left">
      <span className="documents-source-chip source-repo">
        <FileText size={13} />
        <span>
          <strong>{reference.label}</strong>
          <small>{reference.detail}</small>
          <code>{reference.path}</code>
        </span>
      </span>
    </TutorialTip>
  );
}

function referenceKey(reference: DocumentationReference) {
  return reference.kind === "divinity" ? reference.href : reference.path;
}

function sectionAnchor(topicId: string, title: string) {
  return `${topicId}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}
