import { useState } from "react";
import { FACILITIES, ROLES } from "../../../../packages/rules/src/data.ts";
import { highResolutionArt } from "../art.ts";
import { GUIDE_TOPICS, LESSONS } from "./guide-content.ts";

export type GuideMode = "tutorial" | "lookup";
const practiceRoles = ROLES.filter((role) => !role.operative).slice(0, 3);

function LessonDemo({ step }: { step: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [moving, setMoving] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  return (
    <div className={`lesson-demo lesson-demo-${step}`}>
      <span className="lesson-demo-label">
        {[1, 2, 4].includes(step)
          ? "独立练习桌 · 不影响对局"
          : "拓荒手册 · 操作示意"}
      </span>
      {step === 0 && (
        <div className="lesson-assembly">
          {[0, 1, 2, 3].map((seat) => (
            <div key={seat}>
              <img
                src={`/assets/entrepreneur-${seat}.webp`}
                alt={`第 ${seat + 1} 席企业家`}
              />
              <span>SEAT 0{seat + 1}</span>
            </div>
          ))}
          <p>入座 → 全员准备 → 房主开局</p>
        </div>
      )}
      {step === 1 && (
        <>
          <div className="lesson-practice-hand">
            {practiceRoles.map((role) => (
              <button
                key={role.id}
                className={picked === role.id ? "chosen" : ""}
                aria-label={`练习选牌 ${role.name}`}
                aria-pressed={picked === role.id}
                disabled={confirmed}
                onClick={() => setPicked(role.id)}
              >
                <img
                  src={
                    confirmed && picked === role.id
                      ? "/assets/role-back.webp"
                      : highResolutionArt(role.image)
                  }
                  alt=""
                />
                <span>
                  {confirmed && picked === role.id ? "已秘密盖放" : role.name}
                </span>
              </button>
            ))}
          </div>
          <p role="status">
            {confirmed
              ? "盖放完成。正式对局会等待全员确认。"
              : picked
                ? `已选 ${practiceRoles.find((r) => r.id === picked)!.name}，确认前可以改选。`
                : "试着点选一张角色牌。"}
          </p>
          <button
            className="primary-button"
            disabled={!picked}
            onClick={() => {
              if (confirmed) {
                setConfirmed(false);
                setPicked(null);
              } else setConfirmed(true);
            }}
          >
            {confirmed ? "重新练习" : "确认练习盖放"}
          </button>
        </>
      )}
      {(step === 2 || step === 4) && (
        <>
          <div className="lesson-map">
            <svg viewBox="0 0 440 230" aria-hidden="true">
              <path
                className="lesson-map-road"
                d="M70 170 218 114 350 50M218 114 365 180"
              />
              <path
                className={
                  moving || points.length
                    ? "lesson-map-route active"
                    : "lesson-map-route"
                }
                d="M70 170 218 114"
              />
              <path
                className={
                  moving || points.includes("A")
                    ? "lesson-map-route active"
                    : "lesson-map-route"
                }
                d="M218 114 350 50"
              />
              <path
                className={
                  points.includes("B")
                    ? "lesson-map-route active"
                    : "lesson-map-route"
                }
                d="M218 114 365 180"
              />
              <circle cx="70" cy="170" r="17" />
              <circle cx="218" cy="114" r="13" />
              <circle cx="350" cy="50" r="17" />
              <circle cx="365" cy="180" r="17" />
              {step === 2 && (
                <g
                  className="lesson-moving-city"
                  style={{
                    transform: `translate(${moving ? 350 : 70}px, ${moving ? 50 : 170}px)`,
                  }}
                >
                  <image
                    href="/assets/city-model-0.svg"
                    x="-44"
                    y="-48"
                    width="88"
                    height="62"
                  />
                </g>
              )}
              {step === 4 && (
                <image
                  href="/assets/city-model-0.svg"
                  x="26"
                  y="122"
                  width="88"
                  height="62"
                />
              )}
            </svg>
            {step === 4 &&
              ["A", "B"].map((id) => (
                <button
                  key={id}
                  className={`lesson-resource-point point-${id} ${points.includes(id) ? "chosen" : ""}`}
                  aria-label={`练习选择采集点 ${id}`}
                  aria-pressed={points.includes(id)}
                  disabled={confirmed}
                  onClick={() =>
                    setPoints(
                      points.includes(id)
                        ? points.filter((p) => p !== id)
                        : [...points, id],
                    )
                  }
                >
                  <img
                    src={`/assets/resource-${id === "A" ? "ore" : "rock"}.webp`}
                    alt=""
                  />
                  {id}
                </button>
              ))}
          </div>
          {step === 2 ? (
            <>
              <p role="status">
                {moving
                  ? "拖动城市到虚线指示的合法落点，松手即可支付费用并移动；也可用按钮预览后确认。"
                  : "虚线连接的是示意路线，试着预览移动。"}
              </p>
              <button
                className="secondary-button"
                onClick={() => setMoving(!moving)}
              >
                {moving ? "返回起点" : "预览城市移动"}
              </button>
            </>
          ) : (
            <>
              <p role="status">
                {confirmed
                  ? "练习方案已确认。正式对局等全员完成后统一收付。"
                  : `已选 ${points.length} 处采集点；再点一次可撤回，共用航道同步高亮。`}
              </p>
              <button
                className="primary-button"
                onClick={() => {
                  if (confirmed) {
                    setConfirmed(false);
                    setPoints([]);
                  } else setConfirmed(true);
                }}
              >
                {confirmed ? "重新练习" : "确认练习方案"}
              </button>
            </>
          )}
        </>
      )}
      {step === 3 && (
        <div className="lesson-building">
          <div className="lesson-city">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i}>
                {i === 7 ? (
                  <>
                    <img src="/assets/city-model-0.svg" alt="" />
                    <small>城市核心</small>
                  </>
                ) : [4, 6, 8].includes(i) ? (
                  <img
                    src={FACILITIES[[4, 6, 8].indexOf(i)].image}
                    alt="设施牌示意"
                  />
                ) : (
                  <span>＋</span>
                )}
              </div>
            ))}
          </div>
          <p>查看设施 → 选择格位 → 核对付款 → 确认建设</p>
        </div>
      )}
      {step === 5 && (
        <div className="lesson-summary">
          <img
            className="lesson-score"
            src="/assets/resource-score.webp"
            alt="得分"
          />
          <h4>从第一枚棋子，到城市的未来</h4>
          <div>
            {["rock", "ore", "iron", "prime", "cash"].map((type) => (
              <img key={type} src={`/assets/resource-${type}.webp`} alt="" />
            ))}
          </div>
          <p>实时分数 + 区域结算 + 资源结算</p>
        </div>
      )}
    </div>
  );
}

export function HelpCenter({
  initialMode,
  onDone,
  onPractice,
}: {
  initialMode: GuideMode;
  onDone: () => void;
  onPractice: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState("");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = GUIDE_TOPICS.filter(
    (topic) =>
      (category === "全部"
        ? terms.length > 0 || topic.category === "操作"
        : topic.category === category) &&
      terms.every((term) =>
        `${topic.title} ${topic.keywords} ${topic.text}`
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
  const current = results.find((topic) => topic.id === selected) ?? results[0];
  const lesson = LESSONS[step];
  return (
    <div className="help-center">
      <div className="guide-mode-tabs" role="group" aria-label="指南内容">
        <button
          aria-pressed={mode === "tutorial"}
          onClick={() => setMode("tutorial")}
        >
          新手教程 <span>从入座到结算</span>
        </button>
        <button
          aria-pressed={mode === "lookup"}
          onClick={() => setMode("lookup")}
        >
          功能查询 <span>操作 · 角色 · 设施 · 企业</span>
        </button>
      </div>
      {mode === "tutorial" ? (
        <>
          <div className="guide-practice-entry">
            <div>
              <strong>亲自操作一张真实棋桌</strong>
              <p>
                选牌、落子、城市移动、事件、建设、角色能力和采集，共七课。进度在本机保存。
              </p>
            </div>
            <button className="primary-button" onClick={onPractice}>
              进入实操教程 →
            </button>
          </div>
          <div className="guide-tutorial">
            <nav className="lesson-index" aria-label="教程章节">
              {LESSONS.map((item, i) => (
                <button
                  key={item.kicker}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => setStep(i)}
                >
                  <b>0{i + 1}</b>
                  <span>{item.title}</span>
                </button>
              ))}
            </nav>
            <section
              className="lesson-content"
              aria-labelledby="lesson-heading"
            >
              <div className="lesson-copy">
                <span className="eyebrow">{lesson.kicker}</span>
                <h3 id="lesson-heading">{lesson.title}</h3>
                <p>{lesson.text}</p>
                <ul>
                  {lesson.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
              <LessonDemo key={step} step={step} />
              <div className="lesson-navigation">
                <button
                  className="secondary-button"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  上一课
                </button>
                <span aria-live="polite">
                  {step + 1} / {LESSONS.length}
                </span>
                <button
                  className="primary-button"
                  onClick={() =>
                    step === LESSONS.length - 1 ? onDone() : setStep(step + 1)
                  }
                >
                  {step === LESSONS.length - 1 ? "完成教程" : "下一课"} →
                </button>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="guide-lookup">
          <label htmlFor="guide-search">查找操作与牌面</label>
          <div className="guide-search-row">
            <input
              id="guide-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="试试：路费、拖动、罗德岛、角色名…"
            />
            <span aria-live="polite">{results.length} 项</span>
          </div>
          <div className="guide-categories" role="group" aria-label="查询分类">
            {["全部", "操作", "角色", "设施", "企业"].map((item) => (
              <button
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {current ? (
            <div className="guide-results">
              <nav className="guide-result-list" aria-label="查询结果">
                {results.map((topic) => (
                  <button
                    key={topic.id}
                    aria-current={current.id === topic.id ? "true" : undefined}
                    onClick={() => setSelected(topic.id)}
                  >
                    <small>{topic.category}</small>
                    <span>{topic.title}</span>
                    <b aria-hidden="true">↗</b>
                  </button>
                ))}
              </nav>
              <article
                className="guide-result"
                aria-labelledby="guide-result-title"
              >
                <span className="eyebrow">
                  {current.category} / FIELD REFERENCE
                </span>
                <h3 id="guide-result-title">{current.title}</h3>
                {current.image && (
                  <img
                    className="guide-result-art"
                    src={highResolutionArt(current.image)}
                    alt={current.title}
                  />
                )}
                {current.text
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                <small className="guide-readonly-note">
                  查询与练习只供阅读，不会执行对局指令。
                </small>
              </article>
            </div>
          ) : (
            <div className="guide-no-results">
              <strong>没有找到相关条目</strong>
              <p>试试更短的关键词，例如“移动”“路费”或完整角色名。</p>
              <button
                className="secondary-button"
                onClick={() => {
                  setQuery("");
                  setCategory("全部");
                }}
              >
                查看全部操作
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
