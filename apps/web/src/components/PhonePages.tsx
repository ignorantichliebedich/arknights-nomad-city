import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDisplayMode } from "../display-mode.ts";

/** Keep small screens stationary; long sheets turn pages with a shared overlap. */
export function PhonePages({
  children,
  label = "内容",
  pageKey,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  pageKey?: string;
  className?: string;
}) {
  const { phone } = useDisplayMode();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ height: 0, extent: 0 });
  const [position, setPosition] = useState(0);
  useLayoutEffect(() => {
    if (!phone || !viewport.current || !content.current) return;
    const view = viewport.current;
    const body = content.current;
    const measure = () => {
      const whole = view.parentElement!.clientHeight;
      const natural = body.scrollHeight;
      const height = natural <= whole + 1 ? whole : view.clientHeight;
      const extent = Math.max(0, natural - height);
      setLayout((old) =>
        old.height === height && old.extent === extent
          ? old
          : { height, extent },
      );
      setPosition(Math.min(view.scrollTop, extent));
    };
    const resize = new ResizeObserver(measure);
    resize.observe(view);
    resize.observe(content.current);
    measure();
    return () => resize.disconnect();
  }, [phone]);
  useLayoutEffect(() => {
    viewport.current?.scrollTo(0, 0);
    setPosition(0);
  }, [pageKey]);
  if (!phone) return <>{children}</>;
  // An overlapping strip keeps a line or a touch target crossing a page intact.
  const step = Math.max(48, layout.height - 56);
  const pages = layout.extent > 1 ? Math.ceil(layout.extent / step) + 1 : 1;
  const page =
    position >= layout.extent - 1
      ? pages - 1
      : Math.min(pages - 2, Math.floor(position / step));
  function turn(next: number) {
    const top = Math.min(layout.extent, Math.max(0, next) * step);
    viewport.current?.scrollTo({ top, behavior: "instant" });
    setPosition(top);
  }
  return (
    <div className={`phone-pages ${className}`}>
      <div
        ref={viewport}
        className="phone-page-viewport"
        onScroll={(event) => setPosition(event.currentTarget.scrollTop)}
      >
        <div className="phone-page-content" ref={content}>
          {children}
        </div>
      </div>
      <nav
        className="phone-page-controls"
        aria-label={`${label}翻页`}
        hidden={pages === 1}
      >
        <button disabled={page === 0} onClick={() => turn(page - 1)}>
          ← 上一页
        </button>
        <span role="status" aria-live="polite">
          {page + 1} / {pages}
        </span>
        <button disabled={page === pages - 1} onClick={() => turn(page + 1)}>
          下一页 →
        </button>
      </nav>
    </div>
  );
}
