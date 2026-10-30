import { entrepreneurPresentation } from "../entrepreneur.ts";

export function EntrepreneurPortrait({
  player,
  variant = "avatar",
  className = "",
}: {
  player: Parameters<typeof entrepreneurPresentation>[0];
  variant?: "avatar" | "portrait" | "bust";
  className?: string;
}) {
  const art = entrepreneurPresentation(player);
  const label = art.identity ? art.name : "本席企业家";
  // The fifth identity uses its printed silhouette, without borrowing a founder's face.
  return art.silhouette ? (
    <svg
      className={`${className} entrepreneur-image`}
      data-entrepreneur={art.id}
      viewBox={variant === "avatar" ? "520 80 560 560" : "150 100 1050 720"}
      preserveAspectRatio="xMidYMin slice"
      role="img"
      aria-label={label}
    >
      <image href={art[variant]} width="1200" height="1700" />
    </svg>
  ) : (
    <img
      className={`${className} entrepreneur-image`}
      data-entrepreneur={art.id}
      src={art[variant]}
      alt={label}
      draggable={false}
    />
  );
}
