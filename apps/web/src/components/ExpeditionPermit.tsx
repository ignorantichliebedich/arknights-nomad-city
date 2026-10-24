import { useRef } from "react";

export function ExpeditionPermit({
  code,
  name,
  entryCode,
  expansion,
  oripathy,
  expert,
  onOripathy,
  onExpert,
  loading,
  error,
  onName,
  onCode,
  onExpansion,
  onEnter,
  onHome,
}: {
  code: string;
  name: string;
  entryCode: string;
  expansion: boolean;
  oripathy: boolean;
  expert: boolean;
  onOripathy: (enabled: boolean) => void;
  onExpert: (enabled: boolean) => void;
  loading: boolean;
  error: string;
  onName: (value: string) => void;
  onCode: (value: string) => void;
  onExpansion: (value: boolean) => void;
  onEnter: (join: boolean) => Promise<void>;
  onHome: () => void;
}) {
  const joinButton = useRef<HTMLButtonElement>(null);
  return (
    <section
      className={`departure-permit ${code ? "is-invited" : ""}`}
      aria-labelledby="permit-title"
    >
      <div className="permit-serial">
        <span>PIONEER REGISTRATION</span>
        <span>NO. 105</span>
      </div>
      <div className="permit-heading">
        <div>
          <span className="eyebrow">拓荒许可申请</span>
          <h2 id="permit-title">
            {code ? "赴一场拓荒之约" : "下一座城，由你铸就"}
          </h2>
        </div>
        <span className="permit-seal" aria-hidden="true">
          <small>PIONEER</small>
          <b>105</b>
          <small>COLUMBIA</small>
        </span>
      </div>
      <p className="permit-intro">
        {code
          ? "填写昵称，与朋友在这片拓荒区会合。"
          : "签下你的名字，召集同行的企业家。"}
      </p>
      {code && (
        <div className="permit-invitation">
          <span>受邀拓荒区</span>
          <b>{code}</b>
          <small>入座后查看本局配置</small>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          void onEnter(!!code || submitter?.value === "join");
        }}
        aria-busy={loading}
      >
        <label htmlFor="nickname">
          企业家昵称 <span>YOUR NAME</span>
        </label>
        <input
          id="nickname"
          maxLength={20}
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoComplete="nickname"
          placeholder="你的朋友怎么称呼你"
          required
          disabled={loading}
        />
        {!code && (
          <label className={`permit-expansion ${expansion ? "enabled" : ""}`}>
            <input
              type="checkbox"
              checked={expansion}
              onChange={(e) => onExpansion(e.target.checked)}
              disabled={loading}
              aria-label="创建房间时启用企业扩展"
            />
            <span className="permit-expansion-icon" aria-hidden="true">
              ＋
            </span>
            <span>
              <strong>携手合作企业</strong>
              <small>企业扩展 · 八家企业、新角色与城市样式</small>
            </span>
            <b aria-hidden="true">{expansion ? "已启用" : "可选"}</b>
          </label>
        )}
        {!code && (
          <div className="permit-oripathy">
            <label className={`permit-expansion ${oripathy ? "enabled" : ""}`}>
              <input
                type="checkbox"
                checked={oripathy}
                onChange={(e) => onOripathy(e.target.checked)}
                disabled={loading}
                aria-label="创建房间时启用感染者扩展"
              />
              <span className="permit-expansion-icon" aria-hidden="true">
                O
              </span>
              <span>
                <strong>感染者 · 做出你的抉择</strong>
                <small>自动包含企业扩展 · 新干员、合作企业与城市样式</small>
              </span>
              <b aria-hidden="true">{oripathy ? "已启用" : "可选"}</b>
            </label>
            {oripathy && (
              <label className="permit-expert">
                <input
                  type="checkbox"
                  checked={expert}
                  onChange={(e) => onExpert(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  企业家与抉择
                  <small>
                    原版可选专家规则 · 逆序选人、A／B 抉择与专属能力
                  </small>
                </span>
              </label>
            )}
          </div>
        )}
        {!code && (
          <p className="permit-edition" aria-live="polite">
            本次启航{" "}
            <strong>
              {oripathy
                ? `感染者${expert ? " · 企业家抉择" : " · 常规玩法"}`
                : expansion
                  ? "铸基者 + 企业扩展"
                  : "铸基者 · 基础版"}
            </strong>
          </p>
        )}
        <button
          className="primary-button permit-submit"
          type="submit"
          value={code ? "join" : "create"}
          disabled={loading || !name.trim()}
        >
          <span>
            {loading ? "正在连接…" : code ? "加入这场拓荒" : "创建新房间"}
          </span>
          <span aria-hidden="true">↗</span>
        </button>
        {!code && (
          <div className="permit-join">
            <div className="join-ticket-heading">
              <span className="join-ticket-mark" aria-hidden="true">
                ▥
              </span>
              <label htmlFor="room-code">
                房间码 <small>持邀约入座 / INVITATION PASS</small>
              </label>
              <span className="join-ticket-number" aria-hidden="true">
                06<small>位代码</small>
              </span>
            </div>
            <div className="join-row">
              <input
                id="room-code"
                value={entryCode}
                onChange={(e) =>
                  onCode(
                    e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
                  )
                }
                maxLength={6}
                placeholder="六位房间码"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!joinButton.current?.disabled)
                      joinButton.current?.click();
                  }
                }}
              />
              <button
                ref={joinButton}
                className="secondary-button"
                type="submit"
                value="join"
                disabled={loading || !name.trim() || entryCode.length !== 6}
              >
                加入 <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="error permit-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {code && (
        <button className="permit-home" onClick={onHome} disabled={loading}>
          ← 返回入口，创建自己的房间
        </button>
      )}
      <div className="permit-bottom">
        <span aria-hidden="true">◇</span>
        <p>
          对局自动保存，回来即可继续。
          <br />
          <span>叫上朋友，下一站是共同的荒野。</span>
        </p>
      </div>
      <div className="permit-tear" aria-hidden="true">
        <span>NOMAD CITY</span>
        <i />
        <span>THE FOUNDERS</span>
      </div>
    </section>
  );
}
