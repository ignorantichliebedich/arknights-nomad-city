import { useEffect, useRef, useState } from "react";
import {
  RESOURCES,
  RESOURCE_NAMES,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";

export function TableFeedback({ game }: { game: PlayerView }) {
  const previous = useRef(game);
  const [notice, setNotice] = useState<{
    key: number;
    changes: string[];
    text: string;
  } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (before.revision === game.revision || before.me !== game.me) return;
    const old = before.players.find((p) => p.id === game.me);
    const me = game.players.find((p) => p.id === game.me);
    if (!old || !me) return;
    const changes = RESOURCES.flatMap((r) => {
      const delta = me.wallet[r] - old.wallet[r];
      return delta
        ? [`${RESOURCE_NAMES[r]} ${delta > 0 ? "+" : ""}${delta}`]
        : [];
    });
    const latest = game.log.filter(
      (e) => e.seq > (before.log.at(-1)?.seq ?? -1),
    );
    const own = latest.filter((e) => e.actor === game.me);
    if (!own.length && !changes.length) return;
    setNotice({
      key: game.revision,
      changes,
      text: own.at(-1)?.text ?? "资源已结算",
    });
  }, [game]);
  if (!notice) return null;
  return (
    <div className="table-feedback" role="status" key={notice.key}>
      <div>
        <span>行动回响</span>
        <p>{notice.text}</p>
        {!!notice.changes.length && (
          <strong>{notice.changes.join(" · ")}</strong>
        )}
      </div>
      <button onClick={() => setNotice(null)} aria-label="收起行动回响">
        ×
      </button>
    </div>
  );
}
