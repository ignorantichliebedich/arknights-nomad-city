export function ExpeditionShortcuts({
  onPractice,
  onGuide,
}: {
  onPractice: () => void;
  onGuide: () => void;
}) {
  return (
    <div className="hero-shortcuts">
      <button
        className="subtle-button expedition-shortcut shortcut-practice"
        aria-label="实操演习"
        onClick={onPractice}
      >
        <span className="shortcut-emblem" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path d="M20 3 35 12v16L20 37 5 28V12Z" />
            <path d="m20 10 8 13H12Zm0 6v6m-8 7h16M20 3v4m0 26v4M5 12l4 2m22 12 4 2M5 28l4-2m22-12 4-2" />
          </svg>
        </span>
        <span className="shortcut-copy">
          <small aria-hidden="true">FIELD TRAINING / 01</small>
          <strong>实操演习</strong>
        </span>
        <span className="shortcut-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
      <button
        className="subtle-button expedition-shortcut shortcut-guide"
        aria-label="拓荒指南"
        onClick={onGuide}
      >
        <span className="shortcut-emblem" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path d="M20 3 35 12v16L20 37 5 28V12Z" />
            <path d="M20 14c-3-3-6-3-10-2v14c4-1 7-1 10 2 3-3 6-3 10-2V12c-4-1-7-1-10 2Zm0 0v14m-7-11 4 1m-4 4 4 1m6-5 4-1m-4 6 4-1" />
          </svg>
        </span>
        <span className="shortcut-copy">
          <small aria-hidden="true">FRONTIER ARCHIVE / 02</small>
          <strong>拓荒指南</strong>
        </span>
        <span className="shortcut-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
    </div>
  );
}
