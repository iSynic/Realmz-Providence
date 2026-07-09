import { useEffect, useMemo, useState } from "react";
import { BookOpen, Camera, ExternalLink, FileText, Search, X } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";
import { EmptyState, LinkChip, PanelSection, PreviewCard } from "../ui";
import {
  DOCUMENTATION_GROUPS,
  DOCUMENTATION_TOPICS,
  DocumentationCallout,
  DocumentationReference,
  DocumentationSection,
  DocumentationTopic,
  DocumentationVisualSlot,
  documentationSearchText,
  documentationTopicById
} from "../docs/authoringManualContent";

const DOCUMENTS_HELP =
  "Documents is Providence's authoring manual. It teaches scenario-building workflows first, with Divinity and repo evidence available as secondary references.";
const DOCUMENT_SEARCH_HELP =
  "Document search scans chapter titles, summaries, tags, badges, references, section text, cards, and callouts. Use it for concepts like EDCD, special land, runtime cache, release, or Divinity.";
const DOCUMENT_NAV_HELP =
  "The navigation list groups the manual into chapters and appendices. Selecting a chapter only changes the manual view; it does not change the active project.";
const TOPIC_HERO_HELP =
  "The chapter header summarizes the selected manual page, shows its status badges, and counts either its sections or filtered search results.";
const VISUAL_SLOTS_HELP =
  "Visual slots mark screenshots or diagrams we plan to capture for stable documentation. Empty slots are placeholders, not missing scenario data.";
const RELATED_TOPICS_HELP =
  "Related chapters are curated jumps to adjacent concepts. They clear the current document search so you can keep reading without fighting the filter.";
const SOURCE_REFERENCES_HELP =
  "References and source notes are secondary context. Divinity links explain legacy UI concepts; repo evidence explains parser, writer, and runtime behavior.";
const STATUS_BADGES_HELP =
  "Status badges summarize what kind of handbook page this is, such as authoring workflow, reference-only, release, verified, or compatibility-oriented.";
const SEARCH_TERMS_HELP =
  "Search terms are indexed tags for the current chapter. Click one to filter the manual to related pages.";
const DIVINITY_SOURCE_HELP =
  "Divinity source chips open the local Divinity Manual chapter that anchors a legacy concept or editor behavior.";
const REPO_SOURCE_HELP =
  "Repo source chips point at local evidence files, generated ledgers, format notes, or release documentation that support the Providence summary.";

export function DocumentsView({
  onClose,
  initialSection = DOCUMENTATION_TOPICS[0].id,
  onSectionChange,
  onOpenDivinityReference
}: {
  onClose: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
  onOpenDivinityReference?: (href: string) => void;
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
  const divinityReferences = activeTopic.references.filter((reference) => reference.kind === "divinity");

  function selectSection(sectionId: string, options: { clearSearch?: boolean } = {}) {
    if (options.clearSearch) setQuery("");
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
      <section className="documents-panel" role="dialog" aria-modal="true" aria-label="Providence Authoring Manual" onClick={(event) => event.stopPropagation()}>
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
            <label className="documents-search">
              <TutorialTip title="Search Documents" body={DOCUMENT_SEARCH_HELP} side="below">
                <span className="documents-help-anchor"><Search size={14} /></span>
              </TutorialTip>
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search manual"
                aria-label="Search manual"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear documentation search">
                  <X size={13} />
                </button>
              )}
            </label>
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
                <EmptyState compact title="No document matches" body="Try searching for EDCD, special land, release, Divinity, dispatcher, or oracle." />
              )}
            </nav>
          </aside>

          <article className="documents-content documents-content-workbench">
            <TopicHero topic={activeTopic} resultCount={filteredTopics.length} searching={Boolean(normalizedQuery)} />
            {activeTopic.sections.map((section) => (
              <ArticleSection key={section.title} section={section} />
            ))}
            {activeTopic.visualSlots && activeTopic.visualSlots.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Visual Reference Slots" body={VISUAL_SLOTS_HELP} side="below">
                    <span>Visual Reference Slots</span>
                  </TutorialTip>
                )}
                eyebrow="Prepared assets"
                count={`${activeTopic.visualSlots.length} slot${activeTopic.visualSlots.length === 1 ? "" : "s"}`}
              >
                <div className="documents-visual-grid">
                  {activeTopic.visualSlots.map((slot) => (
                    <VisualSlot key={slot.title} slot={slot} />
                  ))}
                </div>
              </PanelSection>
            )}
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
            {activeTopic.references.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Source References" body={SOURCE_REFERENCES_HELP} side="below">
                    <span>References and Source Notes</span>
                  </TutorialTip>
                )}
                eyebrow="Secondary context"
                density="compact"
              >
                <details className="documents-reference-drawer">
                  <summary>Open references for this chapter</summary>
                  <div className="documents-source-list">
                    {activeTopic.references.map((reference) => (
                      <SourceReferenceChip key={referenceKey(reference)} reference={reference} onOpenDivinityReference={onOpenDivinityReference} />
                    ))}
                  </div>
                </details>
              </PanelSection>
            )}
          </article>

          <aside className="documents-reference-panel" aria-label="Reading tools">
            {divinityReferences.length > 0 && (
              <PanelSection
                title={(
                  <TutorialTip title="Divinity Manual Reference" body={DIVINITY_SOURCE_HELP} side="below">
                    <span>Classic Manual</span>
                  </TutorialTip>
                )}
                eyebrow="Optional reference"
                density="compact"
              >
                <div className="documents-source-list">
                  {divinityReferences.map((reference) => (
                    <SourceReferenceChip key={referenceKey(reference)} reference={reference} onOpenDivinityReference={onOpenDivinityReference} />
                  ))}
                </div>
              </PanelSection>
            )}
            <PanelSection
              title={(
                <TutorialTip title="Status Badges" body={STATUS_BADGES_HELP} side="below">
                  <span>Status Badges</span>
                </TutorialTip>
              )}
              eyebrow="Current topic"
              density="compact"
            >
              <div className="documents-status-list">
                {activeTopic.badges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
            </PanelSection>
            <PanelSection
              title={(
                <TutorialTip title="Search Terms" body={SEARCH_TERMS_HELP} side="below">
                  <span>Search Terms</span>
                </TutorialTip>
              )}
              eyebrow="Indexed tags"
              density="compact"
            >
              <div className="documents-tag-list">
                {activeTopic.tags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setQuery(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </PanelSection>
          </aside>
        </div>
      </section>
    </div>
  );
}

function TopicHero({ topic, resultCount, searching }: { topic: DocumentationTopic; resultCount: number; searching: boolean }) {
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
        <p>{topic.summary}</p>
        <div className="documents-status-list" aria-label="Topic status badges">
          {topic.badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
    </PanelSection>
  );
}

function ArticleSection({ section }: { section: DocumentationSection }) {
  return (
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
        {slot.imageSrc ? <img src={slot.imageSrc} alt="" /> : <Camera size={22} />}
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
    <TutorialTip title="Repo Evidence Reference" body={REPO_SOURCE_HELP} side="left">
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
