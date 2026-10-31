import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * While `open`, closes a menu when the PM clicks outside `ref`, tabs out of it, or presses Escape.
 * Escape also hands focus back to `trigger`, so the keyboard isn't left on something that just
 * vanished. Tabbing out closes it so only one menu is ever open, and one Escape closes that one.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  open: boolean,
  close: () => void,
  trigger: () => HTMLElement | null | undefined,
) {
  // The listeners stay put while it's open, so they call whatever the last render passed.
  const latest = useRef({ close, trigger });
  latest.current = { close, trigger };
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const onPointerDown = (event: PointerEvent) => {
      if (!el?.contains(event.target as Node)) latest.current.close();
    };
    const onFocusOut = (event: FocusEvent) => {
      // Null when focus goes nowhere, like a click on the page, which pointerdown covers.
      const to = event.relatedTarget as Node | null;
      if (to && !el?.contains(to)) latest.current.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      latest.current.close();
      latest.current.trigger()?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    el?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      el?.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);
}
