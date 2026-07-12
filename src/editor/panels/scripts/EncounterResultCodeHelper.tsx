import { useMemo, useState } from "react";
import {
  DIVINITY_OPCODE_HELP_SOURCE,
  allDivinityOpcodeHelpEntries,
  divinityHelpEntriesForOpcode,
  type DivinityOpcodeHelpEntry
} from "../../divinityOpcodeHelp";
import { actionOptionFor } from "../../realmzActions";
import { EmptyState, FloatingWorkbenchPanel } from "../../ui";
import { RESULT_ACTION_OPTIONS } from "./encounterFlow";

type ResultCodeHelperListItem = {
  code: number;
  title: string;
  alias?: string;
  category: string;
  description: string;
  entries: DivinityOpcodeHelpEntry[];
  searchText: string;
};

export function ResultCodeHelperPanel({
  selectedCode,
  onSelectCode,
  onClose
}: {
  selectedCode: number;
  onSelectCode: (code: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => buildResultCodeHelperItems(), []);
  const filteredItems = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items;
    return items.filter((item) => terms.every((term) => item.searchText.includes(term)));
  }, [items, query]);
  const selectedItem = items.find((item) => item.code === selectedCode) ?? filteredItems[0] ?? items[0];
  const selectedEntries = selectedItem?.entries ?? [];
  return (
    <FloatingWorkbenchPanel
      title="Code Helper"
      eyebrow="Divinity Manual"
      storageKey="encounters.resultCodeHelper.position"
      defaultWidth={900}
      defaultHeight={640}
      minWidth={560}
      minHeight={420}
      className="encounter-code-helper-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="encounter-code-helper-body">
        <aside className="encounter-code-helper-list" aria-label="Divinity action codes">
          <input
            type="search"
            value={query}
            placeholder="Search codes..."
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className="encounter-code-helper-source">
            <strong>{DIVINITY_OPCODE_HELP_SOURCE.opcodeEntryCount}</strong>
            <span>manual code entries</span>
          </div>
          <div className="encounter-code-helper-results">
            {filteredItems.map((item) => (
              <button
                key={item.code}
                type="button"
                className={item.code === selectedItem?.code ? "selected" : ""}
                onClick={() => onSelectCode(item.code)}
              >
                <strong>{item.code} {item.title}</strong>
                <small>{item.entries.length > 0 ? item.category : "No extracted manual text"}</small>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <EmptyState title="No Matching Codes" body="Try searching by opcode number, title, target field, option, or E-Code text." />
            )}
          </div>
        </aside>
        <section className="encounter-code-helper-detail">
          {selectedItem ? (
            <>
              <header>
                <div>
                  <strong>{selectedItem.code} {selectedItem.title}</strong>
                  {selectedItem.alias && <small>Providence alias: {selectedItem.alias}</small>}
                </div>
                <span>{selectedItem.category}</span>
              </header>
              {selectedEntries.length === 0 ? (
                <div className="field-warning">
                  This action exists in Providence's action catalog, but no extracted Divinity manual text is available for this code.
                </div>
              ) : (
                <div className="encounter-code-helper-entry-stack">
                  {selectedEntries.map((entry) => (
                    <article key={entry.resourceId} className="encounter-code-helper-entry">
                      <header>
                        <strong>{entry.title}</strong>
                        <small>Manual text resource {entry.resourceId}; code{entry.codes.length === 1 ? "" : "s"} {entry.codes.join(", ")}</small>
                      </header>
                      {entry.summary && <p className="encounter-code-helper-summary">{entry.summary}</p>}
                      <dl className="encounter-code-helper-fields">
                        {codeHelperSectionsForEntry(entry).map((section) => (
                          <CodeHelperField key={section.label} label={section.label} value={section.value} />
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No Code Selected" body="Choose a code from the list to read the Divinity manual text." />
          )}
        </section>
      </div>
    </FloatingWorkbenchPanel>
  );
}

export type CodeHelperSection = {
  label: string;
  value: string;
};

function CodeHelperField({ label, value }: CodeHelperSection) {
  return (
    <div className="encounter-code-helper-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function codeHelperSectionsForEntry(entry: DivinityOpcodeHelpEntry): CodeHelperSection[] {
  const parsed = parseCodeHelperManualText(entry.fullText, entry.codes);
  const sections: CodeHelperSection[] = [];
  const addSection = (label: string, value: string | undefined, fallback?: string) => {
    const normalized = normalizeCodeHelperSection(label, value || fallback || "");
    if (!normalized || normalized.toLowerCase() === "none listed") return;
    sections.push({ label, value: normalized });
  };

  addSection("ID Field", parsed.get("ID"), entry.idField || "Not specified");
  addSection("Use", parsed.get("Use"), entry.use || "Not specified");
  addSection("Options", parsed.get("Options"), entry.options || "None");
  addSection("E-Codes", parsed.get("E-Codes"), entry.extraCodes || "None");
  addSection("Example", parsed.get("Example"));
  addSection("Script Tip", parsed.get("Script Tip"));
  addSection("Note", parsed.get("Note"));

  if (sections.length === 0) {
    sections.push({
      label: "Manual Text",
      value: normalizeCodeHelperSection("Manual Text", entry.fullText) || "No extracted manual text."
    });
  }
  return sections;
}

export function parseCodeHelperManualText(fullText: string | undefined, codes: number[] = []): Map<string, string> {
  const sections = new Map<string, string>();
  if (!fullText) return sections;
  const normalized = sliceCodeHelperManualText(fullText, codes).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pattern = /(^|\n)\s*(ID|Use|Options|E-Codes|Example|Script Tip|Note)\s*:?\s*/g;
  const matches = Array.from(normalized.matchAll(pattern));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[2];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    const value = normalized.slice(start, end);
    const cleaned = normalizeCodeHelperRawText(value);
    if (cleaned) sections.set(label, cleaned);
  }
  return sections;
}

export function sliceCodeHelperManualText(fullText: string, codes: number[]) {
  const normalized = fullText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const wantedCodes = new Set(codes);
  if (wantedCodes.size === 0) return normalized;
  const headings = Array.from(normalized.matchAll(/^Code\s+(-?\d+)\b[^\n]*/gim));
  if (headings.length === 0) return normalized;
  const startHeadingIndex = headings.findIndex((match) => wantedCodes.has(Number(match[1])));
  if (startHeadingIndex < 0) return normalized;
  const start = headings[startHeadingIndex].index ?? 0;
  const nextHeading = headings
    .slice(startHeadingIndex + 1)
    .find((match) => !wantedCodes.has(Number(match[1])));
  const end = nextHeading?.index ?? normalized.length;
  return normalized.slice(start, end);
}

function normalizeCodeHelperSection(label: string, value: string | undefined): string {
  if (label === "E-Codes") return formatCodeHelperEcodes(value);
  return formatCodeHelperProse(value);
}

function normalizeCodeHelperRawText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatCodeHelperProse(value: string | undefined): string {
  return normalizeCodeHelperRawText(value)
    .replace(/([^\n])\s+(?=(?:Example|Script Tip|Note):)/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatCodeHelperEcodes(value: string | undefined): string {
  const raw = normalizeCodeHelperRawText(value);
  if (!raw) return "";
  const prepared = raw
    .replace(/(^|\n)\s*E-?Code\s*\n\s*(\d+)\)/gi, "$1\nE-Code $2)")
    .replace(/(^|\n|\.\s+)E-?Code\s+(\d+)\)/gi, (_match, prefix: string, code: string) => {
      const spacer = prefix.trim() ? `${prefix.trimEnd()}\n\n` : prefix;
      return `${spacer}E-Code ${code})`;
    })
    .replace(/(^|\n)(E-Code \d+\))\s+/g, "$1$2\n")
    .replace(/\n{3,}/g, "\n\n");
  const lines = prepared.split("\n").map((line) => line.trim()).filter(Boolean);
  const formatted: string[] = [];
  let inNumberedEntry = false;
  let previousWasHeading = false;

  for (const line of lines) {
    if (/^E-Code \d+\)/i.test(line)) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== "") formatted.push("");
      formatted.push(line.replace(/^E-Code/i, "E-Code"));
      inNumberedEntry = false;
      previousWasHeading = true;
      continue;
    }

    if (/^\d+\)/.test(line)) {
      formatted.push(line);
      inNumberedEntry = true;
      previousWasHeading = false;
      continue;
    }

    if (inNumberedEntry && !previousWasHeading) {
      formatted.push(`   ${line}`);
    } else {
      formatted.push(line);
    }
    previousWasHeading = false;
  }

  return formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildResultCodeHelperItems(): ResultCodeHelperListItem[] {
  const manualCodes = new Set(allDivinityOpcodeHelpEntries().flatMap((entry) => entry.codes).filter((code) => code >= 0));
  const actionCodes = new Set(RESULT_ACTION_OPTIONS.map((option) => option.code));
  const codes = Array.from(new Set([...manualCodes, ...actionCodes])).sort((left, right) => left - right);
  return codes.map((code) => {
    const action = actionOptionFor(code);
    const entries = divinityHelpEntriesForOpcode(code);
    const title = entries[0]?.title ?? action.displayTitle;
    const searchText = [
      code,
      title,
      action.aliasTitle,
      action.category,
      action.description,
      ...entries.flatMap((entry) => [
        entry.title,
        entry.idField,
        entry.use,
        entry.options,
        entry.extraCodes,
        entry.summary,
        entry.fullText
      ])
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      code,
      title,
      alias: action.aliasTitle,
      category: action.category,
      description: action.description,
      entries,
      searchText
    };
  });
}
