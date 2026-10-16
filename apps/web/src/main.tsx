import React, { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
  RESOURCE_NAMES,
} from "../../../packages/rules/src/data.ts";
import type {
  InfluencePlacement,
  LegalAction,
  PlayerView,
} from "../../../packages/rules/src/types.ts";
import { readCredential, saveCredential, useRoom } from "./network.ts";
import { EnterprisePanel } from "./components/EnterprisePanel.tsx";
import { ActionComposer } from "./components/ActionComposer.tsx";
import { EventEncounter } from "./components/EventEncounter.tsx";
import {
  PlacementPreview,
  placementOptions,
} from "./components/PlacementPreview.tsx";
import { TableFeedback } from "./components/TableFeedback.tsx";
import { CardArtwork } from "./components/CardArtwork.tsx";
import { RoleHand } from "./components/RoleHand.tsx";
import { TableDashboard } from "./components/TableDashboard.tsx";
import { CityPanel } from "./components/CityPanel.tsx";
import {
  ExpeditionAtmosphere,
  ExpeditionEntry,
} from "./components/ExpeditionEntry.tsx";
import { RoomLobby } from "./components/RoomLobby.tsx";
import { HelpCenter, type GuideMode } from "./components/HelpCenter.tsx";
import { usePractice } from "./usePractice.ts";
import { PRACTICE_LESSONS } from "./practice.ts";
import { PracticeGuide } from "./components/PracticeGuide.tsx";
import { SceneMotion, buttonFeedback } from "./components/SceneMotion.tsx";
import { EntryBootstrap } from "./components/EntryBootstrap.tsx";
import { AudioSettings } from "./components/AudioSettings.tsx";
import { GameSoundFeedback } from "./components/GameSoundFeedback.tsx";
import { gameAudio } from "./audio.ts";
import { GameBrand } from "./components/GameBrand.tsx";
import {
  useDisplayMode,
  displaySnapshot,
  enterGameFullscreen,
  exitGameFullscreen,
} from "./display-mode.ts";
import { ResourceStock } from "./components/ResourceStock.tsx";
import { useMapTouch } from "./useMapTouch.ts";
import { InvitationPass } from "./components/InvitationPass.tsx";
import { BoardMap, mapBounds } from "./components/BoardMap.tsx";
import { RoutePanel } from "./components/MapRoutes.tsx";
import {
  ActiveEntrepreneur,
  BoardEdgeHints,
  TurnAnnouncement,
} from "./components/TableMotion.tsx";
import {
  SupplyWindow,
  useTableReceipt,
  ReceiptContents,
} from "./components/SupplyWindow.tsx";
import "./style.css";
import "./table-windows.css";
import "./table-motion.css";
import "./table-fan.css";
import "./city-inspector.css";
import "./enterprise-showcase.css";
import "./expedition-entry.css";
import "./guide-motion.css";
import "./action-dossier.css";
import "./event-encounter.css";
import "./direct-deployment.css";
import "./bots-practice.css";
import "./entry-audio.css";
import "./phone.css";
import "./table-experience.css";
import "./entry-redesign.css";
import "./entry-motion.css";
import "./practice-curtain.css";
import {
  InfluencePreview,
  type InfluenceTransfer,
} from "./components/InfluenceDrag.tsx";

const phaseNames: Record<string, string> = {
  setup: "开局入场",
  select: "角色盖放",
  actions: "玩家行动",
  harvest: "采集资源",
  cleanup: "回合收尾",
  finished: "拓荒结算",
  lobby: "集结中",
};
function currentCode() {
  return (
    /^\/room\/([A-Z0-9]{6})$/i.exec(location.pathname)?.[1].toUpperCase() ?? ""
  );
}
function Marker({ seat }: { seat: number }) {
  return (
    <span className="marker" style={{ color: PLAYER_COLORS[seat] }}>
      {PLAYER_SYMBOLS[seat]}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  className?: string;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    void gameAudio.play("open");
    const opener = document.activeElement;
    const parentDialog = opener?.closest("dialog");
    const scrollPosition = parentDialog && {
      top: parentDialog.scrollTop,
      left: parentDialog.scrollLeft,
    };
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
      if (parentDialog?.isConnected && scrollPosition)
        parentDialog.scrollTo(scrollPosition);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className || "dossier-window"}`}
      aria-labelledby={headingId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const display = useDisplayMode();
  const [code, setCode] = useState(currentCode);
  const [token, setToken] = useState(() => readCredential(currentCode()));
  const [name, setName] = useState(
    () => localStorage.getItem("nomad:nickname") ?? "",
  );
  const [entryCode, setEntryCode] = useState(currentCode);
  const [expansion, setExpansion] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);
  const [guide, setGuide] = useState<GuideMode | null>(null);
  const [audioSettings, setAudioSettings] = useState(false);
  useEffect(() => {
    gameAudio.preload();
  }, []);
  useEffect(() => {
    if (entryError) void gameAudio.play("error");
  }, [entryError]);
  const net = useRoom(code, token);
  const practice = usePractice();
  const activeRoom = net.room?.id === code ? net.room : null;
  const playing = practice.active || !!(code && token && activeRoom?.game);
  useEffect(() => {
    const listener = () => {
      const id = currentCode();
      setCode(id);
      setEntryCode(id);
      setToken(readCredential(id));
    };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  async function enter(join: boolean) {
    setLoading(true);
    setEntryError("");
    try {
      const id = entryCode.trim().toUpperCase();
      if (join && !/^[A-Z0-9]{6}$/.test(id))
        throw new Error("房间码需要 6 位字母或数字");
      const response = await fetch(
        join ? `/api/rooms/${id}/join` : "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, expansion }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      saveCredential(result.room.id, result.token);
      localStorage.setItem("nomad:nickname", name.trim());
      history.pushState({}, "", `/room/${result.room.id}`);
      setCode(result.room.id);
      setToken(result.token);
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : "连接房间失败");
    } finally {
      setLoading(false);
    }
  }
  function home() {
    practice.exit();
    history.pushState({}, "", "/");
    setCode("");
    setToken("");
    setEntryCode("");
  }
  return (
    <div
      className={`app-shell ${playing ? "" : "expedition-shell"} ${display.phone ? "phone-layout" : ""}`}
      style={
        display.phone
          ? ({ "--app-height": `${display.height}px` } as React.CSSProperties)
          : undefined
      }
      onClickCapture={(event) => {
        buttonFeedback(event);
        gameAudio.handleClick(event.nativeEvent);
      }}
    >
      {!playing && <ExpeditionAtmosphere />}
      {display.phone && display.portrait && display.fullscreen && (
        <div className="phone-rotate-hint" role="status">
          <span aria-hidden="true">↻</span> 横放手机，展开横屏棋桌
        </div>
      )}
      <header className={`topbar ${playing ? "in-game" : "staging-header"}`}>
        <button className="brand" onClick={home} aria-label="返回游戏入口">
          <GameBrand />
        </button>
        <div className="topbar-right">
          <span className="edition">
            第 105 号拓荒区 · v{import.meta.env.VITE_APP_VERSION}
          </span>
          <button
            className="subtle-button audio-entry"
            onClick={() => setAudioSettings(true)}
            aria-label="声音设置"
          >
            声音
          </button>
          {display.phone && (
            <>
              <button
                className="subtle-button phone-fullscreen"
                onClick={() =>
                  void (
                    display.nativeFullscreen
                      ? exitGameFullscreen()
                      : enterGameFullscreen()
                  ).catch(() => {})
                }
              >
                {display.nativeFullscreen ? "退出全屏" : "全屏"}
              </button>
              <button
                className="subtle-button phone-guide"
                onClick={() => setGuide("tutorial")}
              >
                指南
              </button>
            </>
          )}
          {practice.active ? (
            <span className="practice-status">本地实操练习</span>
          ) : (
            code &&
            token && (
              <span className={`connection ${net.status}`}>
                <i />
                {net.status === "online"
                  ? "已连接"
                  : net.status === "connecting"
                    ? "连接中"
                    : "等待连接"}
              </span>
            )
          )}
          {practice.active ? (
            <button className="subtle-button" onClick={practice.exit}>
              退出练习
            </button>
          ) : (
            <button
              className="subtle-button guide-entry"
              onClick={practice.start}
            >
              实操练习
            </button>
          )}
          <button
            className="subtle-button guide-entry"
            onClick={() => setGuide("tutorial")}
          >
            新手教程
          </button>
          <button
            className="subtle-button guide-entry"
            onClick={() => setGuide("lookup")}
          >
            功能查询
          </button>
          <button className="subtle-button" onClick={() => setHelp(true)}>
            规则速览 <span>↗</span>
          </button>
        </div>
      </header>
      {practice.active ? (
        <GameRoom
          key={`practice-${practice.snapshot.lesson}-${practice.attempt}`}
          net={practice.net}
          training={<PracticeGuide practice={practice} />}
          phone={display.phone}
        />
      ) : !code || !token ? (
        <ExpeditionEntry
          code={code}
          name={name}
          entryCode={entryCode}
          expansion={expansion}
          loading={loading}
          error={entryError}
          onName={setName}
          onCode={setEntryCode}
          onExpansion={setExpansion}
          onEnter={enter}
          onHome={home}
          onGuide={() => setGuide("tutorial")}
          onPractice={() => practice.start()}
          paused={!!guide || help || audioSettings}
        />
      ) : activeRoom ? (
        <GameRoom net={net} phone={display.phone} />
      ) : (
        <main className="connection-screen">
          <span className="brand-mark">▥</span>
          <h1>连接拓荒区 {code}</h1>
          <p>{net.error || "正在恢复你的玩家席位…"}</p>
          <button className="secondary-button" onClick={home}>
            返回入口
          </button>
        </main>
      )}
      {help && (
        <Modal title="拓荒规则速览" onClose={() => setHelp(false)}>
          <div className="rule-summary">
            <p>
              全局 8
              回合。每回合盖放一张角色牌，依次进行两轮主要行动，再采集资源与收尾。先手可连续使用角色的策略与计谋，其他玩家选择其一。
            </p>
            <dl>
              <dt>部署与调度</dt>
              <dd>
                部署放置一次影响力；调度移动自己的影响力，最多两次。资源点须已探索，且不能有对手城市停靠。
              </dd>
              <dt>探索与移动</dt>
              <dd>
                探索支付沿途路费并选择事件结果。移动城市通常支付 3
                源石，清除经过航道与目标点的对手影响力。
              </dd>
              <dt>采集与建设</dt>
              <dd>
                选择有自己影响力或自己城市停靠的资源点，支付路费后采集；同一资源点一次采集只产出一次。建设可用牌面资源费用或金券费用。
              </dd>
              <dt>最终得分</dt>
              <dd>
                每区影响力独占最多的玩家得分，城市视为 2
                个影响力，平局不计分。每 9 源岩、8 源石、6 异铁、1 至纯源石各计
                1 分。
              </dd>
            </dl>
            <p>
              <a
                href="https://ak.hypergryph.com/boardgame_nomadcity"
                target="_blank"
                rel="noreferrer"
              >
                官方桌游网站 ↗
              </a>
              　
              <a
                href="https://prts.wiki/w/游城拓荒：铸基者"
                target="_blank"
                rel="noreferrer"
              >
                PRTS 资料 ↗
              </a>
            </p>
          </div>
        </Modal>
      )}
      {guide && (
        <Modal
          className="guide-window"
          title="拓荒指南"
          onClose={() => setGuide(null)}
        >
          <HelpCenter
            initialMode={guide}
            onDone={() => setGuide(null)}
            onPractice={() => {
              setGuide(null);
              practice.start();
            }}
          />
        </Modal>
      )}
      <SceneMotion
        room={activeRoom}
        entered={!!(code && token)}
        practice={practice.active}
        lesson={`第 ${practice.snapshot.lesson + 1} 课 · ${PRACTICE_LESSONS[practice.snapshot.lesson].title}`}
      />
      {audioSettings && (
        <Modal
          className="dossier-window audio-window"
          title="声音与音乐"
          onClose={() => setAudioSettings(false)}
        >
          <AudioSettings />
        </Modal>
      )}
    </div>
  );
}
function GameRoom({
  net,
  training,
  phone = false,
}: {
  net: ReturnType<typeof useRoom>;
  training?: React.ReactNode;
  phone?: boolean;
}) {
  const room = net.room!;
  const game = room.game;
  const [invite, setInvite] = useState(false);
  const [detail, setDetail] = useState<{
    title: string;
    image?: string;
    text?: string;
  } | null>(null);
  const [cityPlayer, setCityPlayer] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LegalAction | null>(null);
  const [target, setTarget] = useState("");
  const [preferredFacility, setPreferredFacility] = useState("");
  const [plannedCity, setPlannedCity] = useState<{
    target: string;
    optionId: string;
    label: string;
  } | null>(null);
  const [handOpen, setHandOpen] = useState(false);
  const [plannedInfluence, setPlannedInfluence] =
    useState<InfluenceTransfer | null>(null);
  const [plannedPlacement, setPlannedPlacement] =
    useState<InfluencePlacement | null>(null);
  const queuedPlacement = useRef<
    (InfluencePlacement & { revision: number }) | null
  >(null);
  const queuedInfluence = useRef<{
    from: string;
    to: string;
    revision: number;
    stage: "from" | "to";
  } | null>(null);
  const queuedMove = useRef<{
    target: string;
    optionId: string;
    revision: number;
    kind?: "city" | "explore";
  } | null>(null);
  const { receipt, closeReceipt } = useTableReceipt(game);
  const [drawer, setDrawer] = useState<
    "supply" | "enterprise" | "journal" | null
  >(null);
  const [interaction, setInteraction] = useState<
    "hand" | "action" | "event" | null
  >(null);
  const previousCities = useRef<Record<string, string | null>>({});
  const autoWindow = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const table = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const touchMap = useMapTouch(zoom, setZoom);
  const [boardSide, setBoardSide] = useState(650);
  const [mapGutter, setMapGutter] = useState(180);
  const boardViewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  // Other seats can update readiness without dismissing this player's preview.
  const choiceContext = game?.parallel
    ? (game.parallel.choiceToken ?? `${game.parallel.id}:ready`)
    : game?.revision;
  useEffect(() => {
    setTarget("");
    setConfirm(null);
    setPlannedInfluence(null);
    setPlannedPlacement(null);
    const decision = game?.decision;
    const isMine = decision?.playerId === room.me;
    if (isMine && ["select-role", "trim"].includes(decision?.kind ?? ""))
      setHandOpen(true);
    const moved = game?.players.some(
      (p) =>
        previousCities.current[p.id] &&
        p.city &&
        previousCities.current[p.id] !== p.city,
    );
    previousCities.current = Object.fromEntries(
      game?.players.map((p) => [p.id, p.city]) ?? [],
    );
    const shouldOpen =
      isMine &&
      (decision?.kind === "event" || !game?.actions.some((a) => a.target)) &&
      !["select-role", "trim", "toll", "harvest"].includes(
        decision?.kind ?? "",
      );
    const nextWindow = decision?.kind === "event" ? "event" : "action";
    // Show the landing before the resulting event covers the map. This changes
    // presentation timing only; the server choice remains pending throughout.
    if (
      moved &&
      shouldOpen &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInteraction(null);
      autoWindow.current = setTimeout(() => {
        setInteraction((current) => current ?? nextWindow);
        autoWindow.current = null;
      }, 900);
      return () => {
        if (autoWindow.current) clearTimeout(autoWindow.current);
        autoWindow.current = null;
      };
    }
    setInteraction((current) => (shouldOpen ? nextWindow : null));
  }, [choiceContext, room.id]);
  useEffect(() => {
    const changed = () => setTableFullscreen(!!document.fullscreenElement);
    changed();
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    const node = boardViewport.current;
    if (!node) return;
    const resize = () => {
      const size = Math.min(
        node.clientWidth,
        node.clientHeight * (game ? mapBounds(game).w / mapBounds(game).h : 1),
      );
      setBoardSide(size);
      setMapGutter(Math.max(100, (node.clientWidth - size) / 2 - 10));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, [!!game, game?.players.length]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [game?.log.length, drawer]);
  useEffect(() => {
    const pending = queuedMove.current;
    if (!pending || !game || net.busy || net.status !== "online") return;
    if (net.error) {
      queuedMove.current = null;
      return;
    }
    if (game.revision === pending.revision) return;
    queuedMove.current = null;
    // A confirmed drag authorizes exactly the advertised city option after
    // starting its main action. If anything differs, leave the server choice open.
    const legal =
      game.decision?.kind === (pending.kind ?? "city") &&
      game.revision === pending.revision + 1
        ? game.actions.find(
            (a) =>
              a.target === pending.target &&
              a.command.optionId === pending.optionId,
          )
        : undefined;
    if (legal) net.send("command", { command: legal.command });
  }, [game?.revision, net.busy, net.status, net.error]);
  useEffect(() => {
    const pending = queuedPlacement.current;
    if (!pending || !game || net.busy || net.status !== "online") return;
    if (net.error) {
      queuedPlacement.current = null;
      return;
    }
    if (game.revision === pending.revision) return;
    queuedPlacement.current = null;
    // The user confirmed this exact slot. Only finish that choice after the
    // acknowledged deploy action; an unexpected state leaves placement pending.
    const legal =
      game.revision === pending.revision + 1 && game.decision?.kind === "place"
        ? game.actions.find(
            (a) =>
              a.target === pending.target &&
              a.command.optionId === pending.optionId,
          )
        : undefined;
    if (legal) net.send("command", { command: legal.command });
  }, [game?.revision, net.busy, net.status, net.error]);
  useEffect(() => {
    if (!plannedPlacement) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setPlannedPlacement(null);
        setConfirm(null);
        setTarget("");
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [plannedPlacement]);
  useEffect(() => {
    const pending = queuedInfluence.current;
    if (!pending || !game || net.busy || net.status !== "online") return;
    if (net.error) {
      queuedInfluence.current = null;
      return;
    }
    if (game.revision === pending.revision) return;
    queuedInfluence.current = null;
    if (game.revision !== pending.revision + 1) return;
    const expectedKind = pending.stage === "from" ? "shift-from" : "shift-to";
    const optionId = pending.stage === "from" ? pending.from : pending.to;
    const legal =
      game.decision?.kind === expectedKind
        ? game.actions.find((a) => a.command.optionId === optionId)
        : undefined;
    if (!legal) return;
    if (pending.stage === "from")
      queuedInfluence.current = {
        ...pending,
        stage: "to",
        revision: game.revision,
      };
    net.send("command", { command: legal.command });
  }, [game?.revision, net.busy, net.status, net.error]);
  function showInteraction(value: "hand" | "action" | "event" | null) {
    if (autoWindow.current) clearTimeout(autoWindow.current);
    autoWindow.current = null;
    if (value === "hand") {
      setHandOpen(true);
      setInteraction(null);
    } else setInteraction(value);
  }
  function action(value: LegalAction) {
    if (net.busy || net.status !== "online") return;
    setConfirm(value);
    setPlannedCity(null);
    setPlannedInfluence(null);
    setPlannedPlacement(null);
  }
  function submit(
    confirmation: LegalAction | null,
    previews?: {
      placement: InfluencePlacement | null;
      city: NonNullable<PlayerView["cityDestinations"]>[number] | null;
      influence: InfluenceTransfer | null;
    },
  ) {
    const confirm = confirmation;
    const placement = previews ? previews.placement : plannedPlacement;
    const city = previews ? previews.city : plannedCity;
    const influence = previews ? previews.influence : plannedInfluence;
    if (!confirm || net.busy || net.status !== "online") return;
    // Keep previews local. Submit only a choice still present in this player's view.
    const legal = game?.actions.find(
      (a) =>
        a.id === confirm.id &&
        JSON.stringify(a.command) === JSON.stringify(confirm.command),
    );
    if (legal) {
      if (
        placement &&
        legal.command.type === "main" &&
        legal.command.action === "deploy"
      ) {
        if (
          !game?.influencePlacements?.some(
            (p) =>
              p.optionId === placement.optionId &&
              p.target === placement.target,
          )
        )
          return;
        queuedPlacement.current = {
          ...placement,
          revision: game.revision,
        };
      }
      setPlannedPlacement(null);
      if (influence && game?.decision?.kind !== "shift-to")
        queuedInfluence.current = {
          ...influence,
          revision: game!.revision,
          stage: legal.command.type === "main" ? "from" : "to",
        };
      if (game?.decision?.kind === "select-role") setHandOpen(false);
      setPlannedInfluence(null);
      if (
        city &&
        legal.command.type === "main" &&
        legal.command.action === "city"
      )
        queuedMove.current = { ...city, revision: game!.revision };
      setPlannedCity(null);
      net.send("command", { command: legal.command });
      showInteraction(null);
    }
    setConfirm(null);
  }
  function commit() {
    submit(confirm);
  }
  async function fullscreen() {
    if (displaySnapshot().fullscreen) await exitGameFullscreen();
    else await enterGameFullscreen();
  }
  const me = game?.players.find((p) => p.id === room.me);
  const activeId = game?.parallel
    ? (room.me ?? undefined)
    : (game?.decision?.playerId ?? game?.players[game.active]?.id);
  const activeName = room.seats.find((p) => p.id === activeId)?.name;
  const decision = game?.decision;
  const parallelReady = !!game?.parallel?.ready.includes(room.me!);
  const waitingNames = game?.parallel?.participants
    .filter((id) => !game.parallel!.ready.includes(id))
    .map((id) => room.seats.find((p) => p.id === id)?.name)
    .join("、");
  const waiting =
    !!game &&
    game.phase !== "finished" &&
    (game.parallel ? parallelReady : activeId !== room.me);
  const choosingHand =
    decision?.playerId === room.me &&
    ["select-role", "trim"].includes(decision.kind);
  const boardChoice =
    decision?.kind !== "event" &&
    (game?.actions.some((a) => a.target) ?? false);
  const openAction = () => {
    if (plannedPlacement) {
      setPlannedPlacement(null);
      setConfirm(null);
      setTarget("");
    }
    showInteraction(
      choosingHand ? "hand" : decision?.kind === "event" ? "event" : "action",
    );
  };
  const placements = game ? placementOptions(game) : [];
  const selectPlacement = (choice: InfluencePlacement, quick = false) => {
    if (
      !game ||
      net.busy ||
      net.status !== "online" ||
      !placements.some(
        (p) => p.optionId === choice.optionId && p.target === choice.target,
      )
    )
      return;
    const legal =
      game.decision?.kind === "place"
        ? game.actions.find((a) => a.command.optionId === choice.optionId)
        : game.actions.find(
            (a) => a.command.type === "main" && a.command.action === "deploy",
          );
    if (!legal) return;
    if (quick) {
      submit(legal, { placement: choice, city: null, influence: null });
      return;
    }
    setTarget(choice.target);
    setConfirm(legal);
    setPlannedPlacement(choice);
    setPlannedCity(null);
    setPlannedInfluence(null);
    showInteraction(null);
  };
  const chooseSite = (id: string) => {
    if (!game) return;
    const placement = placements.find((p) => p.target === id);
    if (placement) {
      selectPlacement(placement);
      return;
    }
    const actions = boardChoice
      ? game.actions.filter((a) => a.target === id)
      : [];
    if (
      !actions.length &&
      game.explorationTargets?.some((p) => p.target === id)
    ) {
      setTarget(id);
      setConfirm(null);
      setDetail(null);
      showInteraction(null);
      return;
    }
    if (actions.length) {
      if (decision?.kind === "harvest") {
        if (!net.busy && net.status === "online")
          net.send("command", { command: actions[0].command });
        return;
      }
      setTarget(id);
      setConfirm(actions.length === 1 ? actions[0] : null);
      if (!["city", "explore"].includes(decision?.kind ?? ""))
        showInteraction("action");
    } else {
      const site = game.sites[id];
      const city = game.players.find((p) => p.city === id);
      setDetail({
        title: id,
        text: `${game.board.nodes.some((n) => n.id === id) ? "资源点" : "航道"} · ${site.resource ? `${site.amount} ${RESOURCE_NAMES[site.resource]}` : "等待探索"}${city ? ` · ${city.name} 的城市` : ""}${site.publicRoad ? " · 公路免费通行" : ""}`,
      });
    }
  };
  const quickSite = (id: string) => {
    if (!game || net.busy || net.status !== "online") return;
    const exploration = game.explorationTargets?.find((p) => p.target === id);
    if (exploration) {
      const main = game.actions.find(
        (a) => a.command.type === "main" && a.command.action === "explore",
      );
      if (!main) return;
      queuedMove.current = {
        ...exploration,
        revision: game.revision,
        kind: "explore",
      };
      submit(main, { placement: null, city: null, influence: null });
      return;
    }
    if (game.decision?.kind === "explore") {
      const option = game.actions.find((a) => a.target === id);
      if (option)
        submit(option, { placement: null, city: null, influence: null });
      return;
    }
    const slot = placements.find((p) => p.target === id);
    if (slot) selectPlacement(slot, true);
  };
  return (
    <>
      <div
        className={`room-toolbar ${game ? "in-game" : ""}`}
        data-revision={room.revision}
      >
        <div>
          <span className="eyebrow">PRIVATE EXPEDITION</span>
          <span className="room-code">{room.id}</span>
          {!training && (
            <button
              className="subtle-button"
              onClick={() => {
                setInvite(true);
              }}
            >
              邀请朋友 ↗
            </button>
          )}
          {training && <span className="practice-room-note">独立练习桌</span>}
        </div>
        <div className="room-meta">
          {!training && (
            <span>
              {room.expansion ? "铸基者 + 企业扩展" : "铸基者 · 基础版"}
            </span>
          )}
          {game && !training && (
            <strong>
              第 {game.round} / 8 回合 · {phaseNames[game.phase]}
            </strong>
          )}
        </div>
      </div>
      {net.error && (
        <div className="error-banner" role="alert">
          {net.error}
          <button onClick={net.clearError} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      )}
      {!game ? (
        <RoomLobby
          room={room}
          busy={net.busy}
          status={net.status}
          onReady={() =>
            net.send("ready", {
              ready: !room.seats.find((s) => s.id === room.me)?.ready,
            })
          }
          onStart={() => net.send("start")}
          onInvite={() => {
            setInvite(true);
          }}
        />
      ) : (
        <main className="game-layout" ref={table}>
          {phone && (
            <div className="phone-resource-hud">
              <ResourceStock wallet={me!.wallet} />
              <button
                popoverTarget="phone-dashboard"
                aria-label="查看资源、玩家与城市"
                aria-haspopup="dialog"
              >
                {game.phase === "finished" ? "终局详情" : "配件盘"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
          {phone && (
            <div className="phone-phase-bar">
              <span>
                <img
                  src={`/assets/avatar-${game.players.find((p) => p.id === activeId)?.seat ?? 0}.webp`}
                  alt=""
                />
                {activeId === game.players[game.first]?.id && (
                  <img src="/assets/president.webp" alt="大总统" />
                )}
                第 {game.round}/8 回合 · {phaseNames[game.phase]}
              </span>
              <button popoverTarget="phone-score-reference">
                回合与终局计分 ▾
              </button>
            </div>
          )}
          {phone && (
            <div
              id="phone-score-reference"
              className="phone-score-reference"
              popover="auto"
              role="dialog"
              aria-label="回合与终局计分"
            >
              <header>
                <strong>回合与终局计分</strong>
                <button
                  popoverTarget="phone-score-reference"
                  popoverTargetAction="hide"
                  aria-label="关闭计分说明"
                >
                  ×
                </button>
              </header>
              <BoardEdgeHints game={game} expanded />
            </div>
          )}
          <section
            className="table-area"
            style={{ "--map-gutter": `${mapGutter}px` } as React.CSSProperties}
          >
            {training}
            <div
              className="board-toolbar"
              id="phone-camera-controls"
              popover={phone ? "auto" : undefined}
            >
              <div>
                <span className="phase-dot" />
                <strong>
                  {game.phase === "finished"
                    ? "拓荒结束"
                    : game.parallel
                      ? parallelReady
                        ? "已确认，等待全员"
                        : "所有玩家同时选择"
                      : waiting
                        ? `${activeName} 正在${phaseNames[game.phase]}`
                        : "轮到你了"}
                </strong>
                <span className="muted">
                  {game.phase === "actions"
                    ? `第 ${game.lap} 轮主要行动`
                    : phaseNames[game.phase]}
                </span>
              </div>
              <div className="zoom-controls">
                <button
                  onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                  aria-label="缩小棋盘"
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                  aria-label="放大棋盘"
                >
                  +
                </button>
                <button onClick={() => setZoom(1)}>复位</button>
                <button
                  onClick={() =>
                    void fullscreen().catch(() =>
                      setDetail({
                        title: "全屏棋桌",
                        text: "浏览器未允许全屏，可按 F11 放大游戏窗口。",
                      }),
                    )
                  }
                >
                  {tableFullscreen ? "退出全屏" : "全屏棋桌"}
                </button>
              </div>
            </div>
            <div
              className={`board-viewport ${zoom > 1 ? "can-pan" : ""}`}
              ref={boardViewport}
              {...touchMap}
              tabIndex={0}
              aria-label="棋盘视野，放大后可拖动空白处或使用滚动条"
              onPointerDown={(e) => {
                if (
                  zoom <= 1 ||
                  e.button !== 0 ||
                  (e.target as Element).closest(
                    ".board-hit, .deployment-slot, .city-drag-handle, .influence-drag-handle",
                  )
                )
                  return;
                pan.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: e.currentTarget.scrollLeft,
                  top: e.currentTarget.scrollTop,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!pan.current) return;
                e.currentTarget.scrollLeft =
                  pan.current.left - e.clientX + pan.current.x;
                e.currentTarget.scrollTop =
                  pan.current.top - e.clientY + pan.current.y;
              }}
              onPointerUp={(e) => {
                pan.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                pan.current = null;
              }}
            >
              <div
                className="board-surface"
                style={{
                  width: `${boardSide * zoom}px`,
                  aspectRatio: `${mapBounds(game).w} / ${mapBounds(game).h}`,
                }}
              >
                <img
                  className="board-terrain"
                  style={{
                    width: `${(1000 / mapBounds(game).w) * 100}%`,
                    height: `${(1000 / mapBounds(game).h) * 100}%`,
                    left: `${(-mapBounds(game).x / mapBounds(game).w) * 100}%`,
                    top: `${(-mapBounds(game).y / mapBounds(game).h) * 100}%`,
                  }}
                  src="/assets/terrain-margin-v1.webp"
                  sizes={`${boardSide * zoom}px`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <img
                  className={`board-art board-${game.players.length === 4 ? 4 : 3}`}
                  style={{
                    width: `${(1000 / mapBounds(game).w) * 100}%`,
                    height: `${(1000 / mapBounds(game).h) * 100}%`,
                    left: `${(-mapBounds(game).x / mapBounds(game).w) * 100}%`,
                    top: `${(-mapBounds(game).y / mapBounds(game).h) * 100}%`,
                  }}
                  src={game.board.image.replace(".webp", "-hd.webp")}
                  srcSet={`${game.board.image} 2400w, ${game.board.image.replace(".webp", "-hd.webp")} 5000w`}
                  sizes={`${boardSide * zoom}px`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <BoardMap
                  game={game}
                  confirm={confirm}
                  target={target}
                  placement={plannedPlacement}
                  placements={placements}
                  choosePlacement={selectPlacement}
                  quickPlacement={(choice) => selectPlacement(choice, true)}
                  boardChoice={boardChoice}
                  chooseSite={chooseSite}
                  quickSite={quickSite}
                  disabled={net.busy || net.status !== "online"}
                  onInfluenceDrop={(move) => {
                    const legal =
                      game.decision?.kind === "shift-to"
                        ? game.actions.find(
                            (a) => a.command.optionId === move.to,
                          )
                        : game.decision?.kind === "shift-from"
                          ? game.actions.find(
                              (a) => a.command.optionId === move.from,
                            )
                          : game.actions.find(
                              (a) =>
                                a.command.type === "main" &&
                                a.command.action === "shift",
                            );
                    if (!legal) return;
                    setConfirm(legal);
                    setPlannedCity(null);
                    setPlannedPlacement(null);
                    setTarget("");
                    setPlannedInfluence(move);
                    showInteraction(null);
                  }}
                  onInfluenceKeyboard={(from) => {
                    const legal =
                      game.decision?.kind === "shift-from"
                        ? game.actions.find((a) => a.command.optionId === from)
                        : game.actions.find(
                            (a) =>
                              a.command.type === "main" &&
                              a.command.action === "shift",
                          );
                    if (legal) action(legal);
                    openAction();
                  }}
                  onCityKeyboard={() => {
                    const city = game.actions.find(
                      (a) =>
                        a.command.type === "main" &&
                        a.command.action === "city",
                    );
                    if (city) action(city);
                    openAction();
                  }}
                  onCityDrop={(destination, optionId) => {
                    if (decision?.kind === "city") {
                      const option = game.actions.find(
                        (a) =>
                          a.command.optionId === optionId &&
                          a.target === destination,
                      );
                      if (option)
                        submit(option, {
                          placement: null,
                          city: null,
                          influence: null,
                        });
                      return;
                    }
                    const main = game.actions.find(
                      (a) =>
                        a.command.type === "main" &&
                        a.command.action === "city",
                    );
                    const move = game.cityDestinations?.find(
                      (d) => d.optionId === optionId,
                    );
                    if (!main || !move) return;
                    submit(main, {
                      placement: null,
                      city: move,
                      influence: null,
                    });
                  }}
                />
              </div>
            </div>
            <ActiveEntrepreneur game={game} activeId={activeId}>
              {plannedPlacement && !interaction && (
                <PlacementPreview
                  game={game}
                  selected={plannedPlacement}
                  disabled={net.busy || net.status !== "online"}
                  onSelect={selectPlacement}
                  onCancel={() => {
                    setPlannedPlacement(null);
                    setConfirm(null);
                    setTarget("");
                  }}
                  onCommit={commit}
                />
              )}
              {!training &&
                game.phase !== "finished" &&
                !plannedCity &&
                !plannedInfluence &&
                !plannedPlacement &&
                !(
                  ["harvest", "explore", "city", "toll"].includes(
                    decision?.kind ?? "",
                  ) && decision?.playerId === game.me
                ) && (
                  <div
                    className={`map-prompt ${waiting ? "is-waiting" : ""}`}
                    aria-live="polite"
                  >
                    <div>
                      <span>
                        {game.parallel
                          ? parallelReady
                            ? game.parallel.kind === "select-role"
                              ? "角色已盖放"
                              : "采集方案已确认"
                            : "同时安排角色"
                          : waiting
                            ? "等待企业家"
                            : boardChoice
                              ? "在地图上选择"
                              : choosingHand
                                ? "安排角色"
                                : "轮到你了"}
                      </span>
                      <strong className="map-decision-title">
                        {game.parallel && parallelReady
                          ? `等待 ${waitingNames} 完成后继续`
                          : waiting
                            ? `${activeName} 正在作出选择`
                            : (decision?.title ??
                              (placements.length
                                ? "点击地图高亮位置，放置影响力"
                                : "打开行动窗口，安排本轮行动"))}
                      </strong>
                    </div>
                    {!waiting && (
                      <button
                        onClick={() => {
                          if (boardChoice) {
                            setTarget("");
                            setConfirm(null);
                          }
                          openAction();
                        }}
                      >
                        {boardChoice
                          ? "目标列表 ↗"
                          : choosingHand
                            ? "打开手牌 ↗"
                            : "打开窗口 ↗"}
                      </button>
                    )}
                  </div>
                )}
            </ActiveEntrepreneur>
            {!phone && <BoardEdgeHints game={game} />}
            <RoutePanel
              game={game}
              selected={confirm}
              disabled={net.busy || net.status !== "online"}
              onChoose={chooseSite}
              onSelect={(v) => {
                setConfirm(v);
                if (!v) {
                  setPlannedCity(null);
                  setTarget("");
                }
              }}
              onCommit={commit}
              plannedCity={plannedCity}
            />
            {plannedInfluence && (
              <InfluencePreview
                game={game}
                move={plannedInfluence}
                disabled={net.busy || net.status !== "online"}
                onCancel={() => {
                  setPlannedInfluence(null);
                  setConfirm(null);
                }}
                onCommit={commit}
              />
            )}
            <TurnAnnouncement game={game} />
            <GameSoundFeedback game={game} error={net.error} />
            <RoleHand
              game={game}
              selected={confirm}
              disabled={net.busy || net.status !== "online"}
              expanded={handOpen}
              onExpand={setHandOpen}
              onSelect={(value) => (value ? action(value) : setConfirm(null))}
              onCommit={commit}
              onQuickCommit={(choice) =>
                submit(choice, { placement: null, city: null, influence: null })
              }
              onDetail={setDetail}
              onAction={() => showInteraction("action")}
              touch={phone}
            />
            <nav className="map-dock" aria-label="地图旁操作">
              <button
                className={
                  !waiting && !choosingHand && game.phase !== "finished"
                    ? "attention"
                    : ""
                }
                disabled={waiting || game.phase === "finished"}
                onClick={openAction}
                aria-label={
                  decision?.kind === "event" ? "处理事件" : "进行行动"
                }
                aria-haspopup="dialog"
              >
                <span className="dock-icon" aria-hidden="true">
                  ⌖
                </span>
                <strong>{decision?.kind === "event" ? "事件" : "行动"}</strong>
                <small>
                  {waiting ? "等待朋友" : decision ? "继续选择" : "安排本轮"}
                </small>
              </button>
              <button
                onClick={() => setDrawer("journal")}
                aria-haspopup="dialog"
              >
                <span className="dock-icon" aria-hidden="true">
                  ≡
                </span>
                <strong>拓荒日志</strong>
              </button>
              {phone && (
                <button
                  popoverTarget="phone-camera-controls"
                  aria-label="调整棋盘视野"
                >
                  <strong>视野</strong>
                </button>
              )}
            </nav>
          </section>
          <aside
            className="game-sidebar"
            id="phone-dashboard"
            popover={phone ? "auto" : undefined}
            role={phone ? "dialog" : undefined}
            aria-label={phone ? "资源、玩家与城市" : undefined}
          >
            {phone && (
              <div className="phone-dashboard-heading">
                <h2>资源、玩家与城市</h2>
                <button
                  popoverTarget="phone-dashboard"
                  popoverTargetAction="hide"
                  aria-label="关闭配件盘"
                  autoFocus
                >
                  ×
                </button>
              </div>
            )}
            <TableDashboard
              game={game}
              activeId={activeId}
              connectedIds={room.seats
                .filter((p) => p.connected)
                .map((p) => p.id)}
              onCity={setCityPlayer}
              onSupply={() => setDrawer("supply")}
              onEnterprise={() => setDrawer("enterprise")}
            />
            <TableFeedback game={game} />
            {game.phase === "finished" && (
              <div className="final-summary">
                <h3>
                  {game.winners
                    .map((id) => game.players.find((p) => p.id === id)!.name)
                    .join("、")}{" "}
                  获胜
                </h3>
                {game.finalScores.map((s) => (
                  <div key={s.playerId}>
                    <strong>
                      {game.players.find((p) => p.id === s.playerId)!.name}
                    </strong>
                    <b>{s.total} 分</b>
                    <small>
                      对局 {s.ongoing} + 区域{" "}
                      {Object.values(s.regions).reduce((a, b) => a + b, 0)} +
                      资源{" "}
                      {Object.values(s.resources).reduce(
                        (a, b) => a + (b ?? 0),
                        0,
                      )}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </aside>
          {interaction && (
            <Modal
              className={
                interaction === "event"
                  ? "event-window event-card-window"
                  : `dossier-window interaction-window ${interaction}-window ${interaction === "hand" && choosingHand ? "picking-hand" : ""}`
              }
              title={
                interaction === "hand"
                  ? "角色手牌"
                  : interaction === "event"
                    ? "探索事件"
                    : "行动安排"
              }
              onClose={() => showInteraction(null)}
            >
              {interaction === "event" &&
                decision?.kind === "event" &&
                !waiting && (
                  <EventEncounter
                    game={game}
                    selected={confirm}
                    disabled={net.busy || net.status !== "online"}
                    onSelect={(value) =>
                      value ? action(value) : setConfirm(null)
                    }
                    onCommit={commit}
                    onDetail={setDetail}
                  />
                )}
              {interaction !== "event" &&
                (interaction !== "hand" || choosingHand) &&
                !waiting &&
                game.phase !== "finished" && (
                  <div className="window-composer">
                    {boardChoice && (
                      <button
                        className="return-to-map"
                        onClick={() => {
                          setTarget("");
                          setConfirm(null);
                          showInteraction(null);
                        }}
                      >
                        ← 返回地图选择位置
                      </button>
                    )}
                    <ActionComposer
                      key={game.revision}
                      game={game}
                      selected={confirm}
                      target={target}
                      disabled={net.busy || net.status !== "online"}
                      onSelect={(value) =>
                        value ? action(value) : setConfirm(null)
                      }
                      onCommit={commit}
                      onTarget={setTarget}
                      onDetail={setDetail}
                      hideOptions={interaction === "hand"}
                      preferredFacility={preferredFacility}
                    />
                  </div>
                )}
            </Modal>
          )}
          {drawer === "enterprise" && (
            <Modal
              className="enterprise-window"
              title="合作企业"
              onClose={() => setDrawer(null)}
            >
              <EnterprisePanel game={game} onDetail={setDetail} />
            </Modal>
          )}
          {drawer === "supply" && (
            <Modal title="设施供应与城市样式" onClose={() => setDrawer(null)}>
              <SupplyWindow
                game={game}
                disabled={net.busy || net.status !== "online"}
                onDetail={setDetail}
                onAction={(a, instance) => {
                  setPreferredFacility(instance ?? "");
                  action(a);
                  setDrawer(null);
                  showInteraction("action");
                }}
              />
            </Modal>
          )}
          {receipt && (
            <Modal
              title={receipt.title}
              className="dossier-window receipt-window"
              onClose={closeReceipt}
            >
              <ReceiptContents receipt={receipt} onClose={closeReceipt} />
            </Modal>
          )}
          {drawer === "journal" && (
            <Modal title="拓荒日志" onClose={() => setDrawer(null)}>
              <section className="journal-panel">
                <div className="section-label">
                  <h2>拓荒日志</h2>
                  <span>{game.log.length} 条</span>
                </div>
                <div className="journal" ref={scroll}>
                  {game.log.slice(-100).map((e) => (
                    <div key={e.seq} className="journal-entry">
                      <span className="journal-round">
                        {String(e.round).padStart(2, "0")}
                      </span>
                      <p>
                        {e.actor && (
                          <strong>
                            {
                              game.players.find((p) => p.id === e.actor)?.name
                            }{" "}
                          </strong>
                        )}
                        {e.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </Modal>
          )}
        </main>
      )}
      {invite && (
        <Modal
          className="invitation-window"
          title="邀请朋友加入"
          onClose={() => setInvite(false)}
        >
          <InvitationPass
            room={room}
            disabled={net.busy || net.status !== "online"}
            onAddBot={() => net.send("add-bot")}
            onRemoveBot={(playerId) => net.send("remove-bot", { playerId })}
          />
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <div className="card-detail">
            {detail.image && (
              <CardArtwork
                key={detail.image}
                src={detail.image}
                title={detail.title}
              />
            )}
            <div>
              {detail.text?.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {cityPlayer && game && (
        <Modal
          className="city-window"
          title={`${game.players.find((p) => p.id === cityPlayer)!.name} 的移动城市`}
          onClose={() => setCityPlayer(null)}
        >
          <CityPanel
            game={game}
            playerId={cityPlayer}
            onPlayerChange={setCityPlayer}
            onDetail={setDetail}
          />
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EntryBootstrap>
      <App />
    </EntryBootstrap>
  </React.StrictMode>,
);
