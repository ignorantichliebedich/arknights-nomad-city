import {
  useEffect,
  useRef,
  type TouchEvent,
  type PointerEvent,
  type MouseEvent,
} from "react";

/** Pinch changes the camera only; two fingers cancel a piece drag before it can drop. */
export function useMapTouch(zoom: number, onZoom: (zoom: number) => void) {
  const pointers = useRef(new Set<number>());
  const gesture = useRef<{
    distance: number;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const frame = useRef(0);
  const quietUntil = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function touches(event: TouchEvent<HTMLDivElement>) {
    const [a, b] = Array.from(event.touches);
    return b
      ? {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          x: (a.clientX + b.clientX) / 2,
          y: (a.clientY + b.clientY) / 2,
        }
      : null;
  }
  return {
    onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
      if (event.pointerType === "touch") pointers.current.add(event.pointerId);
    },
    onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
      if (gesture.current) event.stopPropagation();
    },
    onPointerUpCapture(event: PointerEvent<HTMLDivElement>) {
      pointers.current.delete(event.pointerId);
      if (gesture.current) event.stopPropagation();
    },
    onTouchStartCapture(event: TouchEvent<HTMLDivElement>) {
      const pair = touches(event);
      if (!pair || gesture.current || pair.distance < 5) return;
      const surface =
        event.currentTarget.querySelector<HTMLElement>(".board-surface");
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      gesture.current = {
        distance: pair.distance,
        zoom,
        x: Math.max(0, Math.min(1, (pair.x - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (pair.y - rect.top) / rect.height)),
      };
      const svg = surface.querySelector("svg");
      svg?.dispatchEvent(
        new window.PointerEvent("pointercancel", { bubbles: true }),
      );
      for (const id of pointers.current)
        if (svg?.hasPointerCapture(id)) svg.releasePointerCapture(id);
      quietUntil.current = performance.now() + 400;
    },
    onTouchMoveCapture(event: TouchEvent<HTMLDivElement>) {
      const pair = touches(event),
        initial = gesture.current;
      if (!pair || !initial) return;
      const viewport = event.currentTarget;
      onZoom(
        Math.max(
          1,
          Math.min(
            3,
            Math.round(
              ((initial.zoom * pair.distance) / initial.distance) * 100,
            ) / 100,
          ),
        ),
      );
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const surface = viewport.querySelector<HTMLElement>(".board-surface");
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        viewport.scrollLeft += rect.left + initial.x * rect.width - pair.x;
        viewport.scrollTop += rect.top + initial.y * rect.height - pair.y;
      });
      quietUntil.current = performance.now() + 400;
    },
    onTouchEndCapture(event: TouchEvent<HTMLDivElement>) {
      if (!event.touches.length) gesture.current = null;
    },
    onTouchCancelCapture() {
      gesture.current = null;
      pointers.current.clear();
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (performance.now() < quietUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
