export function GameBrand() {
  return (
    <span className="official-wordmark" aria-hidden="true">
      <img
        src="/assets/official-nomad-logo.webp"
        alt=""
        width="230"
        height="77"
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
      <span>游城拓荒</span>
    </span>
  );
}
