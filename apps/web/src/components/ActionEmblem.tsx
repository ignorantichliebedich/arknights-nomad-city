const drawings: Record<string, string> = {
  deploy:
    "M16 3 27 9v14l-11 6L5 23V9Z M5 9l11 6 11-6 M16 15v14 M10 6l12 6 M11 20h10 M16 15v10",
  shift: "M4 10h22m-5-5 5 5-5 5 M28 22H6m5-5-5 5 5 5",
  explore:
    "M16 2v5m0 18v5M2 16h5m18 0h5 M16 5a11 11 0 1 1 0 22 11 11 0 0 1 0-22 M21 11l-3 7-7 3 3-7Z",
  city: "M3 23h26l-3 5H6Z M6 23V11h8v12 M14 23V6h10v17 M9 11V6m8 4h4m-4 4h4m-4 4h4 M9 15h2m-2 4h2",
  build: "M4 5h24v23H4Z M4 13h24M4 21h24M12 5v23m8-23v23 M10 2h12",
};

export function ActionEmblem({ action }: { action: string }) {
  const drawing = drawings[action];
  if (!drawing) return null;
  return (
    <span className="action-emblem" aria-hidden="true">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={drawing} />
      </svg>
    </span>
  );
}
