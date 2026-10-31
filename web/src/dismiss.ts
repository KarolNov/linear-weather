import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/**
 * While `open`, closes a menu when the PM clicks outside `ref` or presses Escape. Escape also
 * hands focus back to `trigger`, so the keyboard isn't left on something that just vanished.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  open: boolean,
  close: () => void,
  trigger: () => HTMLElement | null | undefined,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      trigger()?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
}
