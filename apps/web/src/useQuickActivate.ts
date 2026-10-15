import { useRef, type PointerEvent, type MouseEvent } from "react";

/** Native double click and two stationary touch taps share one deduplicated intent. */
export function useQuickActivate() {
  const tap = useRef({ key: "", time: 0, x: 0, y: 0 });
  const last = useRef({ key: "", time: 0 });
  const invoke = (key: string, action: () => void) => {
    const now = performance.now();
    if (last.current.key === key && now - last.current.time < 500) return;
    last.current = { key, time: now };
    action();
  };
  return {
    quiet(key: string) {
      return (
        last.current.key === key && performance.now() - last.current.time < 450
      );
    },
    touch(key: string, event: PointerEvent, action: () => void) {
      if (event.pointerType !== "touch" || event.isPrimary === false) return;
      const now = performance.now(),
        previous = tap.current;
      if (
        previous.key === key &&
        now - previous.time < 360 &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 22
      ) {
        tap.current = { key: "", time: 0, x: 0, y: 0 };
        event.preventDefault();
        invoke(key, action);
      } else
        tap.current = { key, time: now, x: event.clientX, y: event.clientY };
    },
    double(key: string, event: MouseEvent, action: () => void) {
      event.preventDefault();
      invoke(key, action);
    },
  };
}
