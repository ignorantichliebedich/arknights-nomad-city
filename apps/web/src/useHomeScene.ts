import { useEffect, useRef, useState } from "react";
import { gameAudio } from "./audio.ts";
import { ENTRY_MOTION, motionDuration } from "./entry-motion.ts";

type HomeScene = "hero" | "lobby";

export function useHomeScene(
  code: string,
  loading: boolean,
  initialLobby = false,
) {
  const [scene, setScene] = useState<HomeScene>(
    code || initialLobby ? "lobby" : "hero",
  );
  const [moving, setMoving] = useState(false);
  const [arriving, setArriving] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  const lock = useRef(true);
  const focusPending = useRef(false);
  const target = useRef("nickname");
  const start = useRef<HTMLButtonElement>(null);
  const previousCode = useRef(code);
  useEffect(() => {
    const timer = setTimeout(() => {
      setArriving(false);
      lock.current = false;
    }, motionDuration(ENTRY_MOTION.reveal));
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (previousCode.current === code) return;
    previousCode.current = code;
    begin(code ? "lobby" : "hero");
  }, [code]);
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => {
      setMoving(false);
      lock.current = false;
    }, motionDuration(ENTRY_MOTION.scene));
    return () => clearTimeout(timer);
  }, [scene, moving]);
  useEffect(() => {
    if (moving || arriving || !focusPending.current) return;
    focusPending.current = false;
    if (scene === "lobby")
      document.getElementById(target.current)?.focus({ preventScroll: true });
    else start.current?.focus({ preventScroll: true });
  }, [scene, moving, arriving]);

  function begin(next: HomeScene, focus = "nickname") {
    if (next === scene) return;
    target.current = focus;
    focusPending.current = true;
    lock.current = true;
    setMoving(true);
    setScene(next);
  }
  function change(next: HomeScene, focus = "nickname") {
    if (lock.current || loading || next === scene) return;
    begin(next, focus);
    void gameAudio.play("open");
  }
  function motion(panel: HomeScene) {
    return moving
      ? scene === panel
        ? "entering"
        : "leaving"
      : arriving && scene === panel
        ? "arriving"
        : undefined;
  }
  return {
    scene,
    moving,
    arriving,
    hidden,
    start,
    change,
    motion,
    busy: moving || arriving,
  };
}
