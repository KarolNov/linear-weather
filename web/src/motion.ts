import * as stylex from "@stylexjs/stylex";
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { media, motion } from "ui/tokens.stylex";

// Entrances shared by the pages. Everything rises a little and fades in; with reduced motion it
// only fades. `fill-mode: backwards` holds the start frame through the delay, then lets go, so
// an element's own hover transform still works once it has arrived.

export const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(var(--rise, 16px))" },
  to: { opacity: 1, transform: "none" },
});

export const fadeIn = stylex.keyframes({ from: { opacity: 0 } });

const slideIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateX(16px)" },
  to: { opacity: 1, transform: "none" },
});

// A value that just changed settles into place, so a redraw points at what moved rather than
// flashing the whole board.
const tick = stylex.keyframes({
  from: { opacity: 0.2, transform: "translateY(-5px) scale(0.9)" },
  to: { opacity: 1, transform: "none" },
});

const drop = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  to: { opacity: 1, transform: "none" },
});

export const entrance = stylex.create({
  /** The sign-in page: seen rarely, so slow and showy. */
  page: {
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "800ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "both",
  },
  /** The board: opened many times a day, so quick and close to rest. */
  board: {
    "--rise": "10px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "320ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /** Something the PM just opened, like an issue list: barely moves, done in a blink. */
  reveal: {
    "--rise": "6px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "220ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /**
   * A panel opening: docked at the side of a wide board it slides in from the edge it's docked
   * to; stacked above the people it rises like a revealed list.
   */
  panel: {
    "--rise": "6px",
    animationName: {
      default: rise,
      [media.dockedMotion]: slideIn,
      "@media (prefers-reduced-motion: reduce)": fadeIn,
    },
    animationDuration: "240ms",
    animationTimingFunction: motion.easeOut,
    animationFillMode: "backwards",
  },
  /**
   * A number or icon whose value just changed. Key the element by its value so it replays only
   * when the value does.
   */
  changed: {
    animationName: { default: tick, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "260ms",
    animationTimingFunction: motion.easeOut,
  },
  /** A menu dropping open from its trigger. */
  menu: {
    animationName: { default: drop, "@media (prefers-reduced-motion: reduce)": fadeIn },
    animationDuration: "160ms",
    animationTimingFunction: motion.easeOut,
  },
  delay: (ms: number) => ({ animationDelay: `${ms}ms` }),
});

/** Milliseconds between one piece of a public page starting to appear and the next. */
export const PAGE_STEP = 150;

/** A public page's piece rising in after `delayMs`. */
export const enterPage = (delayMs: number) => [entrance.page, entrance.delay(delayMs)];

/**
 * Whether a value has changed since its component mounted, so `entrance.changed` marks a value a
 * move changed rather than every value on the board as it first draws.
 */
export function useChanged<T>(value: T): boolean {
  const first = useRef(value);
  const changed = useRef(false);
  if (value !== first.current) changed.current = true;
  return changed.current;
}

/** `motion.easeOut` spelled out, for WAAPI: it wants the curve, not the CSS variable. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/** The attribute a list's items carry, set to their key, for `useSettle` to follow them. */
export const SETTLE_KEY = "data-settle";

// A list settling after a change: quick, since it follows something the PM did or Linear sent.
const SETTLE_MS = 240;
const LEAVE_MS = 180;

interface Snapshot {
  /** What was shown: a change of scene (a quadrant picked, say) only eases the height. */
  scene: string;
  box: DOMRect;
  items: Map<string, { el: HTMLElement; rect: DOMRect }>;
}

/** The settling animations running on each element, so a change mid-settle starts from there. */
const settling = new WeakMap<Element, Animation>();

/**
 * Settles a list into its new shape when what it shows changes, instead of jumping: its height
 * eases from the old to the new, items that stay glide to where they now sit, and items that
 * left fade out where they were. Items mark themselves with `SETTLE_KEY` set to their key; new
 * ones bring their own entrance. `items` says what's shown, e.g. the keys in order; within the
 * same `scene` items move, and when the scene changes (a quadrant picked) only the height eases.
 * Nothing moves while `enabled` is false, or with reduced motion: the list just changes.
 */
export function useSettle(
  container: RefObject<HTMLElement>,
  items: string,
  scene: string,
  enabled = true,
): void {
  const committed = useRef(items);
  const before = useRef<Snapshot | null>(null);
  // Read during render, before the change reaches the DOM: there's no later moment to see the
  // old layout. Reading is all it does.
  const el = container.current;
  if (items !== committed.current && !before.current && el && enabled) {
    before.current = snapshot(el, scene);
  }
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (committed.current === items) return;
    committed.current = items;
    const el = container.current;
    if (!was || !el || !enabled || !el.isConnected) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    settle(el, was, was.scene === scene);
  }, [items]);
}

function itemsOf(el: HTMLElement): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const item of el.querySelectorAll<HTMLElement>(`[${SETTLE_KEY}]`)) {
    found.set(item.getAttribute(SETTLE_KEY) as string, item);
  }
  return found;
}

function snapshot(el: HTMLElement, scene: string): Snapshot {
  const items = new Map<string, { el: HTMLElement; rect: DOMRect }>();
  for (const [key, item] of itemsOf(el))
    items.set(key, { el: item, rect: item.getBoundingClientRect() });
  return { scene, box: el.getBoundingClientRect(), items };
}

function settle(el: HTMLElement, was: Snapshot, sameScene: boolean): void {
  const options = { duration: SETTLE_MS, easing: EASE_OUT };
  // From wherever a settle still under way has things now, which the snapshot caught.
  settling.get(el)?.cancel();
  const now = itemsOf(el);
  for (const item of now.values()) settling.get(item)?.cancel();
  const box = el.getBoundingClientRect();

  if (sameScene) {
    for (const [key, item] of now) {
      const old = was.items.get(key);
      if (!old) continue;
      // Moved to another quadrant, it's a new element with the list's entrance: it's been here
      // all along, so it glides in solid instead of fading in on the way.
      for (const running of item.getAnimations()) {
        if (running instanceof CSSAnimation) running.finish();
      }
      const rect = item.getBoundingClientRect();
      const dx = old.rect.left - was.box.left - (rect.left - box.left);
      const dy = old.rect.top - was.box.top - (rect.top - box.top);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const glide = item.animate({ transform: [`translate(${dx}px, ${dy}px)`, "none"] }, options);
      settling.set(item, glide);
    }
    for (const [key, old] of was.items) {
      if (now.has(key)) continue;
      leave(el, old, was.box);
    }
  }

  if (Math.abs(was.box.height - box.height) >= 1) {
    // Not clipped: the items are already where they end up, and a card's open menu or focus
    // ring hangs past the list's edge.
    const ease = el.animate({ height: [`${was.box.height}px`, `${box.height}px`] }, options);
    settling.set(el, ease);
  }
}

/** An item that left, fading out where it was: a copy, since the list no longer has it. */
function leave(
  el: HTMLElement,
  { el: item, rect }: { el: HTMLElement; rect: DOMRect },
  box: DOMRect,
) {
  const ghost = item.cloneNode(true) as HTMLElement;
  ghost.removeAttribute(SETTLE_KEY);
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "absolute",
    top: `${rect.top - box.top}px`,
    left: `${rect.left - box.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    boxSizing: "border-box",
    pointerEvents: "none",
    animation: "none",
  });
  el.append(ghost);
  const fade = ghost.animate(
    { opacity: [1, 0], transform: ["none", "scale(0.97)"] },
    { duration: LEAVE_MS, easing: EASE_OUT, fill: "forwards" },
  );
  fade.onfinish = () => ghost.remove();
  fade.oncancel = () => ghost.remove();
}
