import { useLayoutEffect, useRef } from "react";

/** One modal cut at a time; restore keyboard control after the curtain closes. */
export function useSceneCurtain(
  onDone: () => void,
  duration: number,
  destination?: string,
) {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement;
    dialog.showModal();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setTimeout(
      () => done.current(),
      reduced.matches ? 160 : duration,
    );
    const shorten = () => {
      if (reduced.matches) done.current();
    };
    reduced.addEventListener("change", shorten);
    return () => {
      clearTimeout(timer);
      reduced.removeEventListener("change", shorten);
      dialog.close();
      // The destination and its focusable controls have mounted by the next frame.
      requestAnimationFrame(() => {
        const target = destination
          ? destination
              .split(",")
              .map((selector) => document.querySelector<HTMLElement>(selector))
              .find(
                (element) =>
                  element &&
                  !element.closest("[inert]") &&
                  element.getClientRects().length,
              )
          : opener;
        if (
          target instanceof HTMLElement &&
          target.isConnected &&
          !target.closest("[inert]")
        )
          target.focus({ preventScroll: true });
        else if (destination)
          document
            .querySelector<HTMLElement>(".brand")
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  return ref;
}
