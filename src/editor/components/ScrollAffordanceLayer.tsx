import { PointerEvent as ReactPointerEvent, useEffect, useState } from "react";

type ScrollAffordance = {
  id: string;
  orientation: "vertical" | "horizontal";
  x: number;
  y: number;
  width: number;
  height: number;
  thumbX: number;
  thumbY: number;
  thumbWidth: number;
  thumbHeight: number;
  target: HTMLElement;
};

const SCROLL_TARGET_SELECTOR = [
  ".domain-rail",
  ".tool-sidebar",
  ".editor-sidebar",
  ".editor-inspector",
  ".contextual-sidebar",
  ".library-hub",
  ".library-source-list",
  ".domain-workbench",
  ".domain-main-column",
  ".domain-entity-list",
  ".domain-detail-panel",
  ".room-canvas-wrap",
  ".room-list-items",
  ".trigger-list",
  ".paint-palette-grid",
  ".tile-palette",
  ".tile-strip",
  ".entity-browser",
  ".semantic-left",
  ".semantic-right",
  ".semantic-inspector",
  ".semantic-entity-list",
  ".semantic-link-list",
  ".semantic-diagnostics",
  ".summary-table",
  ".script-category-grid",
  ".script-detail",
  ".realmz-script-list",
  ".realmz-script-form",
  ".realmz-step-list",
  ".realmz-step-detail",
  ".edcd-grid",
  ".record-table",
  ".resource-list",
  ".resource-browser",
  ".atlas-browser",
  ".records-index",
  ".record-table-panel",
  ".lint-results",
  ".asset-workbench-main",
  ".managed-asset-grid",
  ".library-asset-strip",
  ".asset-grid",
  ".compact-assets",
  ".resource-type-grid",
  ".source-file-list",
  ".alignment-strip",
  ".overlay-popover",
  ".overlay-table",
  ".documents-nav",
  ".documents-content",
  ".workbench-panel-section.is-scrollable .workbench-panel-section-body"
].join(",");

const elementIds = new WeakMap<Element, string>();
let nextElementId = 1;

export function ScrollAffordanceLayer() {
  const [bars, setBars] = useState<ScrollAffordance[]>([]);

  useEffect(() => {
    let frame = 0;
    let interval = 0;
    const resizeObserver = new ResizeObserver(schedule);
    const observed = new Set<Element>();

    function schedule() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(collect);
    }

    function collect() {
      frame = 0;
      const elements = Array.from(document.querySelectorAll<HTMLElement>(SCROLL_TARGET_SELECTOR));
      const nextBars: ScrollAffordance[] = [];
      for (const element of elements) {
        if (!observed.has(element)) {
          observed.add(element);
          resizeObserver.observe(element);
        }
        appendElementBars(element, nextBars);
      }
      setBars(nextBars);
    }

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style", "open"]
    });

    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    interval = window.setInterval(schedule, 450);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearInterval(interval);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  if (bars.length === 0) return null;
  return (
    <div className="scroll-affordance-layer" aria-hidden="true">
      {bars.map((bar) => (
        <div
          key={bar.id}
          className={`scroll-affordance ${bar.orientation}`}
          onPointerDown={(event) => beginScrollbarDrag(event, bar)}
          style={{ left: bar.x, top: bar.y, width: bar.width, height: bar.height }}
        >
          <span
            style={{
              left: bar.thumbX,
              top: bar.thumbY,
              width: bar.thumbWidth,
              height: bar.thumbHeight
            }}
          />
        </div>
      ))}
    </div>
  );
}

function appendElementBars(element: HTMLElement, bars: ScrollAffordance[]) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 28 || rect.height < 28) return;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return;

  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

  const clippedLeft = clamp(rect.left, 0, window.innerWidth);
  const clippedRight = clamp(rect.right, 0, window.innerWidth);
  const clippedTop = clamp(rect.top, 0, window.innerHeight);
  const clippedBottom = clamp(rect.bottom, 0, window.innerHeight);
  const clippedWidth = clippedRight - clippedLeft;
  const clippedHeight = clippedBottom - clippedTop;
  if (clippedWidth < 28 || clippedHeight < 28) return;

  const canScrollVertically = element.scrollHeight > element.clientHeight + 2;
  const canScrollHorizontally = element.scrollWidth > element.clientWidth + 2;
  const id = idForElement(element);

  if (canScrollVertically) {
    const trackWidth = 10;
    const trackTop = clippedTop + 3;
    const trackHeight = Math.max(28, clippedHeight - (canScrollHorizontally ? 18 : 6));
    const thumbHeight = Math.max(30, Math.min(trackHeight, trackHeight * (element.clientHeight / element.scrollHeight)));
    const maxThumbTravel = Math.max(1, trackHeight - thumbHeight);
    const maxScroll = Math.max(1, element.scrollHeight - element.clientHeight);
    bars.push({
      id: `${id}:y`,
      orientation: "vertical",
      x: clippedRight - trackWidth - 2,
      y: trackTop,
      width: trackWidth,
      height: trackHeight,
      thumbX: 2,
      thumbY: 2 + maxThumbTravel * (element.scrollTop / maxScroll),
      thumbWidth: trackWidth - 4,
      thumbHeight: Math.max(20, thumbHeight - 4),
      target: element
    });
  }

  if (canScrollHorizontally) {
    const trackHeight = 10;
    const trackLeft = clippedLeft + 3;
    const trackWidth = Math.max(28, clippedWidth - (canScrollVertically ? 18 : 6));
    const thumbWidth = Math.max(30, Math.min(trackWidth, trackWidth * (element.clientWidth / element.scrollWidth)));
    const maxThumbTravel = Math.max(1, trackWidth - thumbWidth);
    const maxScroll = Math.max(1, element.scrollWidth - element.clientWidth);
    bars.push({
      id: `${id}:x`,
      orientation: "horizontal",
      x: trackLeft,
      y: clippedBottom - trackHeight - 2,
      width: trackWidth,
      height: trackHeight,
      thumbX: 2 + maxThumbTravel * (element.scrollLeft / maxScroll),
      thumbY: 2,
      thumbWidth: Math.max(20, thumbWidth - 4),
      thumbHeight: trackHeight - 4,
      target: element
    });
  }
}

function beginScrollbarDrag(event: ReactPointerEvent<HTMLDivElement>, bar: ScrollAffordance) {
  event.preventDefault();
  event.stopPropagation();
  const target = bar.target;
  const axis = bar.orientation === "vertical" ? "clientY" : "clientX";
  const startPointer = event[axis];
  const startScroll = bar.orientation === "vertical" ? target.scrollTop : target.scrollLeft;
  const trackTravel =
    bar.orientation === "vertical"
      ? Math.max(1, bar.height - bar.thumbHeight - 4)
      : Math.max(1, bar.width - bar.thumbWidth - 4);
  const scrollTravel =
    bar.orientation === "vertical"
      ? Math.max(1, target.scrollHeight - target.clientHeight)
      : Math.max(1, target.scrollWidth - target.clientWidth);
  const scale = scrollTravel / trackTravel;

  function move(pointerEvent: PointerEvent) {
    const delta = pointerEvent[axis] - startPointer;
    if (bar.orientation === "vertical") {
      target.scrollTop = startScroll + delta * scale;
    } else {
      target.scrollLeft = startScroll + delta * scale;
    }
  }

  function stop() {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", stop);
    document.removeEventListener("pointercancel", stop);
    document.body.classList.remove("scroll-affordance-dragging");
  }

  document.body.classList.add("scroll-affordance-dragging");
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", stop);
  document.addEventListener("pointercancel", stop);
}

function idForElement(element: Element) {
  const existing = elementIds.get(element);
  if (existing) return existing;
  const id = `scroll-${nextElementId}`;
  nextElementId += 1;
  elementIds.set(element, id);
  return id;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
