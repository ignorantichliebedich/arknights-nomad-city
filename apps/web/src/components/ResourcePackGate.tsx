import { useEffect, useRef, useState } from "react";
import {
  resourcePackSourceIds,
  resourcePackSources,
  type ResourcePack,
} from "../../../../packages/shared/resource-pack.ts";
import { useLocalMedia } from "../resource-media.ts";
import {
  installPack,
  readInstalledPack,
  readLatestPack,
} from "../resource-pack-store.ts";
import { Modal } from "./Modal.tsx";

export function ResourcePackGate({ onReady }: { onReady: () => void }) {
  const [pack, setPack] = useState<ResourcePack>();
  const [status, setStatus] = useState("正在检查资源包…");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const latest = await readLatestPack();
        if (!active) return;
        if (!latest) return onReady();
        setPack(latest);
        const installed = await readInstalledPack();
        if (!active) return;
        if (installed?.version === latest.version) {
          useLocalMedia(installed.files);
          return onReady();
        }
        setStatus(installed ? "本机资源包需要更新" : "本机还未安装资源包");
      } catch {
        if (!active) return;
        setStatus("无法检查资源包");
        setNotice("请确认网络连接及浏览器的网站存储权限，再重新检查。");
      }
      setBusy(false);
      setShowActions(true);
    }
    void check();
    return () => {
      active = false;
    };
  }, [attempt, onReady]);

  useEffect(() => {
    if (showActions) title.current?.focus();
  }, [showActions]);

  function recheck() {
    setBusy(true);
    setNotice("");
    setStatus("正在检查资源包…");
    setAttempt((value) => value + 1);
  }

  async function importZip(file: File) {
    if (!pack || busy) return;
    setBusy(true);
    setNotice("");
    setStatus("正在校验并安装资源包…");
    try {
      await installPack(file, pack);
      recheck();
    } catch (error) {
      setStatus("资源包安装失败");
      setNotice(error instanceof Error ? error.message : "请重新导入 ZIP。");
      setBusy(false);
    }
  }

  if (!showActions)
    return (
      <p className="boot-pack-check" role="status">
        {status}
      </p>
    );
  return (
    <main className="boot-pack-layout">
      <section
        className="boot-pack-panel"
        aria-labelledby="resource-pack-title"
      >
        <h1 id="resource-pack-title" tabIndex={-1} ref={title}>
          游戏资源包
        </h1>
        <p role="status">{status}</p>
        {pack && (
          <p>
            下载 ZIP
            后直接导入。图片和音频保存在这个浏览器，下次可以直接进入游戏。
          </p>
        )}
        {notice && (
          <p className="boot-pack-notice" role="alert">
            {notice}
          </p>
        )}
        <div className="boot-pack-actions">
          {pack && (
            <>
              <button
                type="button"
                className="secondary-button"
                aria-haspopup="dialog"
                onClick={(event) => {
                  event.currentTarget.focus();
                  setShowDownloads(true);
                }}
              >
                下载资源包 · {(pack.bytes / 1024 ** 2).toFixed(1)} MiB
              </button>
              <input
                ref={input}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void importZip(file);
                }}
              />
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                导入 ZIP
              </button>
            </>
          )}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={recheck}
          >
            重新检查
          </button>
        </div>
      </section>
      {showDownloads && pack && (
        <Modal
          title="资源包下载"
          className="pack-download-window"
          onClose={() => setShowDownloads(false)}
        >
          <div className="pack-download-body">
            <p>任选一个来源下载 ZIP，完成后回到此页导入。</p>
            <ul className="pack-download-sources">
              {resourcePackSourceIds.map((source) => {
                const { label } = resourcePackSources[source];
                const entry = pack.downloads[source];
                return (
                  <li key={source}>
                    {entry ? (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <strong>{label}</strong>
                        {entry.code && <small>提取码 {entry.code}</small>}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <div>
                        <strong>{label}</strong>
                        <small>链接待配置</small>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Modal>
      )}
    </main>
  );
}
