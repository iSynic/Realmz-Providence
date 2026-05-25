import { useEffect, useMemo, useState } from "react";
import { BookOpen, Camera, ExternalLink, FileText, Search, X } from "lucide-react";
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
} from "../docs/documentationContent";

export function DocumentsView({
  onClose,
  initialSection = DOCUMENTATION_TOPICS[0].id,
  onSectionChange
}: {
  onClose: () => void;
  initialSection?: string;
  onSectionChange?: (section: string) => void;
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
      <section className="documents-panel" role="dialog" aria-modal="true" aria-label="Providence Documents" onClick={(event) => event.stopPropagation()}>
        <header className="documents-header">
          <div>
            <span>Providence Documents</span>
            <strong>{activeTopic.title}</strong>
          </div>
          <button className="btn btn-ghost btn-xs" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="documents-body">
          <aside className="documents-nav-shell">
            <label className="documents-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search docs"
                aria-label="Search documentation"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear documentation search">
                  <X size={13} />
                </button>
              )}
            </label>
            <nav className="documents-nav" aria-label="Document sections">
              {groupedTopics.map(({ group, topics }) => (
                <section key={group.id} className="documents-nav-group" aria-label={group.label}>
                  <header>
                    <strong>{group.label}</strong>
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
              <PanelSection title="Visual Reference Slots" eyebrow="Prepared assets" count={`${activeTopic.visualSlots.length} slot${activeTopic.visualSlots.length === 1 ? "" : "s"}`}>
                <div className="documents-visual-grid">
                  {activeTopic.visualSlots.map((slot) => (
                    <VisualSlot key={slot.title} slot={slot} />
                  ))}
                </div>
              </PanelSection>
            )}
            {relatedTopics.length > 0 && (
              <PanelSection title="Related Topics" eyebrow="Keep reading" density="compact">
                <div className="documents-chip-row" aria-label="Related document topics">
                  {relatedTopics.map((topic) => (
                    <LinkChip key={topic.id} label={topic.label} detail={topic.groupId === "reference" ? "reference" : "workflow"} onClick={() => selectSection(topic.id, { clearSearch: true })} />
                  ))}
                </div>
              </PanelSection>
            )}
          </article>

          <aside className="documents-reference-panel" aria-label="Source references">
            <PanelSection title="Source References" eyebrow="Divinity and repo" density="compact">
              <div className="documents-source-list">
                {activeTopic.references.map((reference) => (
                  <SourceReferenceChip key={referenceKey(reference)} reference={reference} />
                ))}
              </div>
            </PanelSection>
            <PanelSection title="Status Badges" eyebrow="Current topic" density="compact">
              <div className="documents-status-list">
                {activeTopic.badges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
            </PanelSection>
            <PanelSection title="Search Terms" eyebrow="Indexed tags" density="compact">
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
    <PanelSection eyebrow={topic.groupId === "reference" ? "Reference" : "Author workflow"} title={topic.title} count={searching ? `${resultCount} result${resultCount === 1 ? "" : "s"}` : `${topic.sections.length} sections`}>
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

function SourceReferenceChip({ reference }: { reference: DocumentationReference }) {
  if (reference.kind === "divinity") {
    return (
      <a className="documents-source-chip source-divinity" href={reference.href} target="_blank" rel="noreferrer">
        <BookOpen size={13} />
        <span>
          <strong>{reference.label}</strong>
          <small>{reference.detail}</small>
        </span>
        <ExternalLink size={12} />
      </a>
    );
  }

  return (
    <span className="documents-source-chip source-repo">
      <FileText size={13} />
      <span>
        <strong>{reference.label}</strong>
        <small>{reference.detail}</small>
        <code>{reference.path}</code>
      </span>
    </span>
  );
}

function referenceKey(reference: DocumentationReference) {
  return reference.kind === "divinity" ? reference.href : reference.path;
}
