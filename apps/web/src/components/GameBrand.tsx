export function GameBrand() {
  return (
    <span className="game-wordmark" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="wordmark-city">
        <path d="M4 31h40v8H4zM9 25h29v6H9zM14 17h9v8h-9zM27 12h5v13h-5zM34 22h8v9h-8z" />
        <path
          d="M29 4v9M30 4h11l-5 4h-6M8 39l4 5M39 39l-4 5"
          className="wordmark-flag"
        />
      </svg>
      <span>
        <strong>游城拓荒</strong>
        <small>
          NOMAD CITY <i>THE FOUNDERS</i>
        </small>
      </span>
    </span>
  );
}
