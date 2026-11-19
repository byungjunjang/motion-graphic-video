#!/usr/bin/env node
// 레퍼런스 색인의 스타일 레퍼런스를 톤별 장(章)으로 묶은 카탈로그(브로셔) 화면을 만들어 띄운다.
// 표현 기법(am: · kind technique)은 싣지 않는다. 기법은 제작 단계에서만 쓴다 (.claude/skills/motion-video/references/technique-refs.md).
// 사용자가 화면에서 레퍼런스 1개를 고르고 소개할 대상을 적어 보내면 videos/.catalog-choice.json 으로 받는다.
//   node scripts/catalog.mjs             → references/catalog.html 을 만들고 브라우저에 띄운 뒤 답을 기다린다
//   node scripts/catalog.mjs --no-open   → 파일만 만든다. 파일로 직접 열면 답이 클립보드에 복사된다
//   node scripts/catalog.mjs --site      → 배포용 폴더 catalog-site/ 에 index.html 과 글꼴만 담는다. 저장소의 다른 파일은 들어가지 않는다.
//                                          배포한 화면에서도 답은 클립보드에 복사된다 (vercel deploy catalog-site)
// 장 설명은 .claude/skills/motion-video/references/tone-catalog.md 의 표에서, 카드 문구는 references/tone-labels.json 에서 읽는다.
// 카드 표시는 셋이다. '새 항목'(사용자 리뷰 전에 넣은 항목), '실자료 필요'(flags 의 실자료), 'AI 이미지 필요'(flags 의 AI이미지).
// flags 의 실존은 화면에 표시하지 않는다. 제작할 때 에이전트가 지키는 규칙이다 (tone-catalog.md 의 표시 줄).
// 분석 노트가 있는 항목(색인의 analysis)은 자세히 보기 창에 "프롬프트 N자" 대신 "분석 노트 N자"와 안내 한 줄을 낸다. 발췌는 노트의 앞부분이다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CLIENT_JS, serve } from "./review-server.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const INDEX = read("references/ref-index.json");
const LABELS = read("references/tone-labels.json");
const VIDEOS = existsSync(join(ROOT, "references/ref-videos.json")) ? read("references/ref-videos.json") : {};
const TONES = read("references/tone-keywords.json");
delete TONES._;
const SITE = process.argv.includes("--site");
const PAGE = SITE ? "catalog-site/index.html" : "references/catalog.html";
const ANSWER = "videos/.catalog-choice.json";
const FONT_DIR = "templates/starter/assets/fonts", FONT_FILES = ["Pretendard-Regular.woff2", "Pretendard-SemiBold.woff2"];
const FONTS = SITE ? "fonts" : `../${FONT_DIR}`;
// 출처 · 왼쪽 "출처" 고르기와 맨 아래 출처 줄에 쓴다. 키는 id 의 앞 두 글자다
const SOURCES = {
  pm: ["prompt-motion", "https://prompt-motion.com"],
  gh: ["awesome-opus5-5-videos", "https://github.com/yihui-dev/awesome-opus5-5-videos"],
  cv: ["claudevideo", "https://claudevideo.org"],
  lo: ["lemo-opuscar", "https://github.com/lemomo-ai/lemo-opuscar", "CC BY 4.0"],
  ms: ["mg-styles-15", "https://github.com/Vincentwei1021/mg-styles-15"],
  pn: ["Pinterest", "https://www.pinterest.com"],
};
// 카탈로그 제목 끝의 "featured by" 와 머리·바닥의 유튜브 링크
const FEATURED = { name: "장피엠", url: "https://www.youtube.com/@jangpm" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

// tone-catalog.md 표의 한 줄 · | 톤 | 맞는 콘텐츠 | 색·질감 | 움직임 서명 | ... → 톤 이름으로 찾는다.
// 머리글이 "| 톤 | 맞는 콘텐츠" 인 톤 표의 줄만 읽는다. 뒤쪽의 톤별 개수 표 같은 다른 표는 건너뛴다.
// '쓰지 않는 것'은 머리글 이름으로 칸을 찾는다. 열이 늘어도 칸이 어긋나지 않게 하려는 것이다.
const rows = {};
let head = null; // 지금 읽는 톤 표의 머리글 칸. 톤 표 밖이면 null
for (const l of readFileSync(join(ROOT, ".claude/skills/motion-video/references/tone-catalog.md"), "utf8").split("\n")) {
  if (!l.startsWith("|")) { head = null; continue; }
  const cells = l.split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, "")); // 화면에는 마크다운 백틱을 지우고 보여 준다
  if (cells[0] === "톤" && cells[1] === "맞는 콘텐츠") { head = cells; continue; }
  if (!head || /^:?-+:?$/.test(cells[0])) continue;
  const [name, fit, lookCell, move] = cells;
  const [look, sound = ""] = lookCell.split(/\.? 소리 · /);   // 색·질감 칸 끝의 '소리 ·' 는 따로 보여 준다
  rows[name] ??= { fit, look, sound, move, not: cells[head.indexOf("쓰지 않는 것")] ?? "" };
}

// 표현 기법(kind: technique), 원본 영상을 볼 수 없어 제외한 항목, 톤 판정 전(검토 대기)인 항목은 뺀다.
// 첫 번째 톤의 장에 넣는다. 판정이 "해당 없음"이면 "그 밖의 것" 장에 넣는다.
const entries = INDEX.entries.filter((e) => e.kind !== "technique" && !VIDEOS[e.id]?.excluded && LABELS[e.id]);
// 장 안에서는 리뷰를 거친 항목을 먼저 두고, 판정 확신(confidence, 없으면 mid 로 본다)과 글자 수 순서로 놓는다
const conf = (e) => ({ high: 0, mid: 1, low: 2 })[LABELS[e.id]?.confidence] ?? 1;
const chapters = [...Object.keys(TONES), "other"]
  .map((tone) => ({
    tone,
    name: TONES[tone]?.name ?? "그 밖의 것",
    info: rows[TONES[tone]?.name] ?? { fit: "톤 표에 없는 형식", look: "", move: "" },
    items: entries
      .filter((e) => (LABELS[e.id]?.tones?.[0] ?? "other") === tone)
      .sort((a, b) => !!LABELS[a.id]?.new - !!LABELS[b.id]?.new || conf(a) - conf(b) || b.chars - a.chars),
  }))
  .filter((c) => c.items.length);

// 카드 표시 · 화면의 "보기"와 찾기 칸의 '새항목'·'실자료필요' 가 이 표시를 쓴다
const NEW = "새 항목", REAL = "실자료 필요", AI = "AI 이미지 필요";
const marksOf = (label) => [label.new ? NEW : "", label.flags?.includes("실자료") ? REAL : "", label.flags?.includes("AI이미지") ? AI : ""].filter(Boolean);
const anyNew = entries.some((e) => LABELS[e.id].new), anyReal = entries.some((e) => LABELS[e.id].flags?.includes("실자료")), anyAI = entries.some((e) => LABELS[e.id].flags?.includes("AI이미지"));

let no = 0;
const card = (e, tone) => {
  const label = LABELS[e.id] ?? {}, marks = marksOf(label);
  // verify 가 X 원본으로 확인한 항목(via: x)은 출처 영상 주소가 죽어 있다. 포스터만 보이고 X 게시글로 연결한다.
  const xpost = VIDEOS[e.id]?.via === "x" ? VIDEOS[e.id].post : null;
  const data = {
    id: e.id, tone, no: String(++no).padStart(3, "0"), note: label.note ?? e.title, title: e.title, author: e.author, tool: e.tool,
    date: e.date, source: e.source, chars: e.chars, partial: e.partial, excerpt: cut(e.excerpt, 400), url: e.url, post: xpost ?? e.post,
    poster: e.poster, video: xpost ? null : e.video, tones: (label.tones ?? []).map((t) => TONES[t]?.name ?? t), tags: e.tags, real: marks.includes(REAL), ai: marks.includes(AI), analysis: !!e.analysis,
  };
  const hay = `${data.note} ${e.title} ${e.author} ${e.tags.join(" ")} ${data.tones.join(" ")} ${e.excerpt} ${marks.map((m) => m.replace(/ /g, "")).join(" ")}`.toLowerCase();
  return `<article class="card" tabindex="0" role="button" data-src="${e.id.slice(0, 2)}" data-marks="${esc(marks.join(","))}" data-hay="${esc(hay)}" data-ref="${esc(JSON.stringify(data))}">
  <figure><img src="${esc(e.poster)}" alt="" loading="lazy">${data.video ? `<video muted loop playsinline preload="none" data-src="${esc(data.video)}"></video>` : `<span class="xonly">X 원본</span>`}${marks.length ? `<span class="marks">${marks.map((m) => `<i${m === NEW ? ' class="new"' : ""}>${m}</i>`).join("")}</span>` : ""}</figure>
  <div class="cap"><h3>${esc(data.note)}</h3>
  <p class="by">${e.id.startsWith("pm:") ? `${esc(cut(e.title, 48))} · ` : ""}@${esc(e.author)}</p>
  <p class="no">No.${data.no}${data.tones.slice(1).map((t) => `<span>+ ${esc(t)}</span>`).join("")}</p></div>
</article>`;
};

const info = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
const body = chapters
  .map((c, i) => `<section class="chapter" id="${c.tone}">
  <header><span class="ghost" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><h2>${esc(c.name)}<small>${c.items.length}편</small></h2>
  <dl>${info([["맞는 콘텐츠", c.info.fit], ["색·질감", c.info.look], ["소리", c.info.sound], ["움직임", c.info.move], ["쓰지 않는 것", c.info.not]])}</dl></header>
  <div class="grid">${c.items.map((e) => card(e, c.tone)).join("\n")}</div>
</section>`)
  .join("\n");

const tonesN = chapters.filter((c) => c.tone !== "other").length;
const srcCount = (k) => entries.filter((e) => e.id.startsWith(`${k}:`)).length;
const ICON = {
  search: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor"/><path d="M10 9.2v5.6l5-2.8z" fill="#fff"/></svg>`,
};
const featLink = (text, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${FEATURED.url}" target="_blank" rel="noopener">${text}</a>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2333415E'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23EE5B24'/%3E%3C/svg%3E">
<title>모션 그래픽 스타일 레퍼런스 (featured by ${esc(FEATURED.name)})</title><style>
@font-face{font-family:P;src:url(${FONTS}/Pretendard-Regular.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:P;src:url(${FONTS}/Pretendard-SemiBold.woff2) format("woff2");font-weight:600 800;font-display:swap}
:root{--bg:#F4F6F9;--surface:#FDFDFE;--well:#E9EDF2;--line:#E2E7EE;--ghost:#E7EBF1;--ink:#33415E;--text:#4A5773;--mute:#667189;--accent:#EE5B24;--accent-ink:#C5470F;--r:8px;--ease:cubic-bezier(.16,1,.3,1)}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:92px}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 P,-apple-system,"Apple SD Gothic Neo",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wrap{max-width:1200px;margin:0 auto;padding:0 clamp(16px,4vw,40px)}

.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.top .wrap{max-width:1400px;display:flex;align-items:center;gap:20px;height:72px}
.menu{display:none;align-items:center;justify-content:center;width:36px;height:36px;margin-left:-8px;border:0;border-radius:50%;background:none;color:var(--ink);cursor:pointer}
.brand{font-weight:700;font-size:17px;letter-spacing:-.01em;color:var(--ink);text-decoration:none;white-space:nowrap}
.parts{display:flex;align-items:center;gap:26px;margin-left:clamp(12px,6vw,88px);font-size:13.5px;font-weight:600;white-space:nowrap}
.parts a{position:relative;padding:6px 0;color:var(--text);text-decoration:none;transition:color .2s}
.parts b{margin-left:4px;font-weight:400;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.parts a:hover{color:var(--accent-ink)}
.parts .on{color:var(--ink)}
.parts .on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--accent)}
.search{position:relative;display:block;color:var(--mute)}
.search svg{position:absolute;left:18px;top:50%;translate:0 -50%;pointer-events:none}
.search input{width:100%;padding:11px 18px 11px 44px;border:0;border-radius:99px;background:var(--surface);box-shadow:0 8px 22px -8px rgba(51,65,94,.2);font:inherit;color:var(--ink)}
.search input::placeholder{color:var(--mute)}
.search input:focus-visible{outline:2px solid var(--accent);outline-offset:0}
.top .search{margin-left:auto;flex:0 1 320px}
.yt{display:inline-flex;align-items:center;gap:7px;margin-left:clamp(8px,3vw,48px);font-size:13px;font-weight:600;color:var(--text);text-decoration:none;white-space:nowrap;transition:color .2s}
.yt svg{color:var(--accent)}
.yt:hover{color:var(--accent-ink)}

.title{display:flex;align-items:flex-end;justify-content:space-between;gap:20px 24px;flex-wrap:wrap;padding:72px 0 36px;isolation:isolate}
.title>div{position:relative}
.ghost{position:absolute;z-index:-1;left:-.1em;bottom:-.06em;font-size:clamp(84px,11vw,128px);font-weight:800;line-height:.8;letter-spacing:-.03em;color:var(--ghost);white-space:nowrap;user-select:none;pointer-events:none}
.title h1{margin:0;font-size:clamp(24px,3vw,32px);font-weight:400;letter-spacing:-.02em;color:var(--ink);word-break:keep-all}
.title h1 b{font-weight:700}
.title h1 .feat{margin-left:.3em;font-size:.5em;letter-spacing:0;color:var(--mute);text-decoration:none;white-space:nowrap;transition:color .2s}
.title h1 .feat:hover{color:var(--accent-ink)}
.views{display:flex;align-items:center;gap:20px;margin:0;font-size:13px;color:var(--mute)}
.views button{background:none;border:0;padding:4px 0;font-weight:600;color:var(--text);cursor:pointer;transition:color .2s}
.views button:hover{color:var(--ink)}.views button.on{color:var(--accent-ink)}

.layout{display:grid;grid-template-columns:236px minmax(0,1fr);gap:28px;align-items:start}
aside{position:sticky;top:88px;max-height:calc(100vh - 104px);overflow-y:auto;display:grid;gap:16px;padding-bottom:4px;scrollbar-width:thin}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}
.panel summary{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;list-style:none}
.panel summary::-webkit-details-marker{display:none}
.panel summary::after{content:"";width:6px;height:6px;margin-top:-3px;border-right:1.5px solid var(--mute);border-bottom:1.5px solid var(--mute);rotate:45deg;transition:rotate .25s var(--ease),margin .25s var(--ease)}
.panel[open] summary{border-bottom:1px solid var(--line)}
.panel[open] summary::after{rotate:-135deg;margin-top:3px}
.cats,.checks{list-style:none;margin:0;padding:8px 0}
.cats a{display:flex;align-items:center;gap:10px;padding:8px 18px;font-size:13px;font-weight:600;color:var(--text);text-decoration:none;transition:color .2s}
.cats a b{margin-left:auto;font-weight:400;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.cats a::after{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-top:1.5px solid currentColor;rotate:45deg;opacity:.45}
.cats a:hover,.cats a.on{color:var(--accent-ink)}
.checks label{display:flex;align-items:center;gap:10px;padding:7px 18px;font-size:13px;cursor:pointer}
.checks label b{margin-left:auto;font-weight:400;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.checks input{appearance:none;-webkit-appearance:none;display:grid;place-content:center;flex:none;width:17px;height:17px;margin:0;border:1.5px solid #C5CDD9;border-radius:50%;background:var(--surface);cursor:pointer;transition:background .15s,border-color .15s}
.checks input:checked{background:var(--accent);border-color:var(--accent)}
.checks input:checked::after{content:"";width:8px;height:4px;margin-top:-2px;border-left:2px solid #fff;border-bottom:2px solid #fff;rotate:-45deg}
.legend{margin:0;padding:14px 18px 16px;display:grid;gap:10px;font-size:12.5px;line-height:1.55}
.legend dt{display:inline-block;margin-right:6px;padding:1px 9px;border-radius:99px;background:var(--ink);color:#fff;font-size:11px;font-weight:600}
.legend dt.new{background:var(--accent-ink)}
.legend dd{display:inline;margin:0}

main{min-width:0}
.chapter{padding-bottom:64px}
.chapter[hidden],.card[hidden]{display:none}
.chapter header{position:relative;isolation:isolate;padding:40px 0 24px}
.chapter .ghost{top:0;bottom:auto;left:-.05em;font-size:88px}
.chapter h2{margin:0 0 14px;font-size:22px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.chapter h2 small{margin-left:10px;font-size:13px;font-weight:400;letter-spacing:0;color:var(--mute)}
.chapter dl{display:grid;grid-template-columns:84px minmax(0,1fr);gap:5px 14px;margin:0;max-width:720px;font-size:13px}
dt{color:var(--mute)}dd{margin:0}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px 20px}
.card{display:flex;flex-direction:column;background:var(--surface);border-radius:var(--r);overflow:hidden;cursor:pointer;box-shadow:0 0 0 1px var(--line);transition:translate .4s var(--ease),box-shadow .4s var(--ease)}
.card:hover,.card:focus-visible{translate:0 -3px;box-shadow:0 0 0 1px var(--line),0 16px 32px -14px rgba(51,65,94,.28)}
.card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
figure{position:relative;margin:0;aspect-ratio:16/9;background:var(--well);overflow:hidden}
figure img,figure video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
figure img{transition:scale .6s var(--ease)}.card:hover figure img{scale:1.03}
figure video{opacity:0;transition:opacity .2s}.card:hover figure video.on{opacity:1}
.marks{position:absolute;left:10px;top:10px;display:flex;gap:5px}
.marks i{padding:2px 9px;border-radius:99px;background:rgba(40,52,78,.86);color:#fff;font-size:11px;font-style:normal;font-weight:600}
.marks i.new{background:var(--accent-ink)}
.xonly{position:absolute;right:10px;bottom:10px;padding:2px 9px;border-radius:99px;background:rgba(40,52,78,.86);color:#fff;font-size:11px}
.cap{display:flex;flex-direction:column;flex:1;padding:16px 16px 18px;text-align:center}
.cap h3{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:3em;margin:0 0 4px;font-size:13.5px;font-weight:600;line-height:1.5;color:var(--text);word-break:keep-all}
.by{margin:0 0 12px;font-size:12px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.no{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:2px 8px;margin:auto 0 0;font-size:13px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.no span{font-size:11.5px;font-weight:400;color:var(--mute);white-space:nowrap}
#empty{margin:0;padding:72px 0 96px;text-align:center;color:var(--mute)}

.guide{margin-top:8px;padding:56px 32px 52px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);text-align:center}
.guide h2{margin:0 0 20px;font-size:24px;font-weight:400;letter-spacing:-.02em;color:var(--ink)}.guide h2 b{font-weight:700}
.guide ol{display:grid;gap:8px;max-width:560px;margin:0 auto 30px;padding:0;list-style:none;counter-reset:s;text-align:left;font-size:13.5px}
.guide li{display:grid;grid-template-columns:24px 1fr;counter-increment:s}
.guide li::before{content:counter(s);font-weight:700;color:var(--accent-ink)}
.find{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.find .search{flex:0 1 300px}
.find .search input{box-shadow:none;border:1px solid var(--line)}
.pill{padding:11px 30px;border:0;border-radius:99px;background:var(--accent-ink);color:#fff;font-weight:600;cursor:pointer;transition:background .2s}
.pill:hover{background:#AC3C0B}
footer{display:grid;grid-template-columns:1fr 1.5fr 1.3fr;gap:32px;padding:64px 0 28px;font-size:12.5px;color:var(--mute)}
footer .brand{display:block;margin:0 0 10px}
footer p{margin:0}
footer h5{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--ink)}
footer ul{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin:0;padding:0;list-style:none}
footer a{font-weight:600;color:var(--text);text-decoration:none}footer a:hover{color:var(--accent-ink)}

dialog{width:min(1120px,94vw);max-height:92vh;padding:0;border:0;border-radius:14px;background:var(--surface);color:var(--text);box-shadow:0 40px 90px -30px rgba(25,34,54,.6)}
dialog::backdrop{background:rgba(40,52,78,.5)}
.sheet{display:grid;grid-template-columns:1.5fr 1fr}
.media{display:flex;align-items:center;justify-content:center;background:#111620}
.media video,.media img{display:block;width:100%}
.info{max-height:92vh;padding:30px 30px 28px;overflow:auto}
.dno{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink)}
.info h2{margin:6px 0;font-size:22px;font-weight:700;line-height:1.35;letter-spacing:-.01em;color:var(--ink);word-break:keep-all}
.info .meta{margin:0 0 12px;font-size:12.5px;color:var(--mute)}
.info .meta a{color:var(--text);font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.chips span{padding:1px 9px;border:1px solid var(--line);border-radius:99px;font-size:11.5px}
blockquote{margin:14px 0;padding:14px 16px;border-radius:6px;background:var(--bg);font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.need{margin:0 0 12px;font-size:12.5px}.need b{margin-right:6px;padding:1px 9px;border-radius:99px;background:var(--ink);color:#fff;font-size:11px}
.info label{display:block;margin:16px 0 6px;font-size:13px;font-weight:600;color:var(--ink)}
textarea{width:100%;min-height:72px;padding:11px 13px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;color:var(--ink);resize:vertical}
textarea:focus-visible{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.go{width:100%;margin-top:16px;padding:14px;font-size:15px}
.go:disabled{background:#C5CDD9;cursor:default}
.close{position:absolute;right:10px;top:8px;width:36px;height:36px;border:0;border-radius:50%;background:none;font-size:24px;line-height:1;color:var(--mute);cursor:pointer}
.close:hover{color:var(--ink)}

@media(max-width:1100px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:860px){
.top .wrap{flex-wrap:wrap;height:auto;gap:8px 16px;padding-top:12px;padding-bottom:12px}
.menu{display:inline-flex}.parts{margin-left:auto;gap:18px}.top .search{flex:1 1 100%}.yt{display:none}
.title{padding:56px 0 28px}
.layout{grid-template-columns:1fr}
aside{display:none;position:static;max-height:none}body.side-open aside{display:grid}
.sheet{grid-template-columns:1fr}.info{max-height:none}
dialog{overflow:auto}
footer{grid-template-columns:1fr}
}
@media(max-width:520px){.grid{gap:14px 12px}.cap{padding:12px 10px 14px}.guide{padding:40px 18px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::after{transition:none!important}}
</style></head><body>
<header class="top"><div class="wrap">
<button class="menu" id="menu" type="button" aria-label="톤 목록과 출처 고르기 열기" aria-expanded="false">${ICON.menu}</button>
<a class="brand" href="#top">Motion Catalog</a>
<nav class="parts" aria-label="바로 가기"><a class="on" href="#top">레퍼런스<b id="count">${entries.length}</b></a><a href="#guide">고르는 법</a></nav>
<label class="search">${ICON.search}<input id="q" type="search" placeholder="찾기 · 예) 숫자, 앱, 수묵" aria-label="카드 찾기"></label>
${featLink(`${ICON.play}${esc(FEATURED.name)} 유튜브`, "yt")}
</div></header>
<div class="wrap" id="top">
<div class="title">
<div><span class="ghost" aria-hidden="true">STYLE</span><h1>모션 그래픽 <b>스타일 레퍼런스</b> ${featLink(`(featured by ${esc(FEATURED.name)})`, "feat")}</h1></div>
<p class="views">보기<button type="button" class="on" data-view="">전체</button>${anyNew ? `<button type="button" data-view="new">${NEW}</button>` : ""}${anyReal ? `<button type="button" data-view="noreal">${REAL} 빼고</button>` : ""}</p>
</div>
<div class="layout">
<aside id="side" aria-label="톤 목록과 출처 고르기">
<details class="panel" open><summary>톤 ${tonesN}개</summary><ul class="cats">${chapters.map((c) => `<li><a href="#${c.tone}">${esc(c.name)}<b>${c.items.length}</b></a></li>`).join("")}</ul></details>
<details class="panel" open><summary>출처</summary><ul class="checks">${Object.entries(SOURCES).filter(([k]) => srcCount(k)).map(([k, [name]]) => `<li><label><input type="checkbox" value="${k}">${esc(name)}<b>${srcCount(k)}</b></label></li>`).join("")}</ul></details>
${anyNew || anyReal || anyAI ? `<details class="panel" open><summary>카드 표시</summary><dl class="legend">
${anyNew ? `<div><dt class="new">${NEW}</dt><dd>사용자 리뷰 전에 넣은 항목</dd></div>` : ""}
${anyReal ? `<div><dt>${REAL}</dt><dd>촬영본·사진·스캔·3D 파일 같은 실제 자료가 화면의 주 재료다. 이 카드를 고르면 소개할 대상의 실제 자료를 요청한다</dd></div>` : ""}
${anyAI ? `<div><dt>${AI}</dt><dd>인물·사물·풍경 일러스트가 화면의 주 재료다. 이 카드를 고르면 일러스트를 AI 이미지로 그린다. 글자·도형·움직임은 코드로 만든다</dd></div>` : ""}
</dl></details>` : ""}
</aside>
<main>
${body}
<p id="empty" hidden>맞는 카드가 없다. 찾는 말을 줄이거나 보기를 "전체"로 바꾼다.</p>
</main>
</div>
<section class="guide" id="guide"><h2>카탈로그에서 <b>고르는 법</b></h2>
<ol><li>카드에 마우스를 올려 영상을 본다. 눌러서 자세히 본다.</li><li>소개할 대상을 적고 "이 스타일로 만들기"를 누른다.</li><li>"${REAL}" 카드를 고르면 소개할 대상의 실제 자료(촬영본·사진 등)를 요청받는다.</li><li>"${AI}" 카드를 고르면 일러스트를 AI 이미지로 그린다. 그림체는 스토리보드에서 확인한다.</li></ol>
<form class="find" id="find"><label class="search">${ICON.search}<input id="q2" type="search" placeholder="톤, 소재, 형식" aria-label="카드 찾기"></label><button class="pill">찾기</button></form>
</section>
<footer>
<div><span class="brand">Motion Catalog</span><p>featured by ${featLink(`${esc(FEATURED.name)} 유튜브 ↗`)}<br>스타일 레퍼런스 ${entries.length}편 · ${tonesN}개 톤<br>색인 ${esc(INDEX.built)}</p></div>
<div><h5>출처</h5><ul>${Object.entries(SOURCES).filter(([k]) => srcCount(k)).map(([k, [name, url, license]]) => `<li><a href="${url}" target="_blank" rel="noopener">${esc(name)}</a> ${srcCount(k)}편${license ? ` · ${license}` : ""}</li>`).join("")}</ul></div>
<div><h5>권리</h5><p>프롬프트와 영상의 권리는 각 작성자에게 있다. 이 화면은 원본을 링크로만 불러온다. 프롬프트는 앞부분 발췌만 싣는다. "분석 노트"는 이 카탈로그가 영상을 보고 쓴 글이다.</p></div>
</footer>
</div>
<dialog id="dlg" aria-labelledby="dnote"><button class="close" id="close" type="button" aria-label="닫기">×</button><div class="sheet"><div class="media" id="media"></div><div class="info">
<span class="dno" id="dno"></span><h2 id="dnote"></h2><p class="meta" id="dmeta"></p><p class="chips" id="dtones"></p><blockquote id="dexcerpt"></blockquote>
<p class="need" id="dana" hidden><b>분석 노트</b>작성자의 프롬프트에 화면 지시가 없어서 영상 프레임을 보고 쓴 글이다. 위는 그 글의 앞부분이다.</p>
<p class="need" id="dneed" hidden><b>${REAL}</b>이 스타일을 고르면 소개할 대상의 실제 자료(촬영본·사진 등)를 요청한다. 자료가 없으면 그림으로 대신하는 안을 스토리보드에서 확인한다.</p>
<p class="need" id="dai" hidden><b>${AI}</b>이 스타일을 고르면 인물·사물·풍경 일러스트를 AI 이미지로 그린다. 디자인 시트와 장면 그림을 스토리보드에 붙여 그림체를 확인받는다.</p>
<p class="meta" id="dlinks"></p>
<label for="subject">무엇을 소개하나요? (필수)</label><textarea id="subject" placeholder="URL, 제품·서비스 이름, 설명. 예) https://… 의 신규 카드 혜택을 30초로"></textarea>
<label for="memo">덧붙일 말 (선택)</label><textarea id="memo" placeholder="예) 색은 우리 브랜드 남색으로, 내레이션은 여성 목소리"></textarea>
<button class="pill go" id="go" type="button" disabled>이 스타일로 만들기</button></div></div></dialog>
<script>${CLIENT_JS}
const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const dlg = $('dlg'), ref = (el) => JSON.parse(el.dataset.ref);
let cur = null, view = '';
// 카드 · 올리면 영상이 재생되고, 누르면 자세히 본다
document.querySelectorAll('.card').forEach((el) => {
  const v = el.querySelector('video');
  if (v) {
    el.addEventListener('mouseenter', () => { if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('on')).catch(() => {}); });
    el.addEventListener('mouseleave', () => { v.pause(); v.classList.remove('on'); });
  }
  el.addEventListener('click', () => openRef(ref(el)));
  el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRef(ref(el)); } });
});
function openRef(r) {
  cur = r;
  const link = (href, text) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + ' ↗</a>';
  $('media').innerHTML = r.video ? '<video src="' + esc(r.video) + '" poster="' + esc(r.poster) + '" controls autoplay muted loop playsinline></video>'
    : '<a href="' + esc(r.post) + '" target="_blank" rel="noopener"><img src="' + esc(r.poster) + '" alt=""></a>';
  $('dno').textContent = 'No.' + r.no;
  $('dnote').textContent = r.note;
  $('dmeta').textContent = [r.source, r.title, '@' + r.author, r.tool, r.date, (r.analysis ? '분석 노트 ' : '프롬프트 ') + r.chars.toLocaleString() + '자' + (r.partial && !r.analysis ? ' (일부만 공개)' : '')].filter(Boolean).join(' · ');
  $('dtones').innerHTML = r.tones.concat(r.tags).map((t) => '<span>' + esc(t) + '</span>').join('');
  $('dexcerpt').textContent = r.excerpt;
  $('dana').hidden = !r.analysis;
  $('dneed').hidden = !r.real;
  $('dai').hidden = !r.ai;
  $('dlinks').innerHTML = link(r.url, '원본 페이지') + (r.post ? ' · ' + link(r.post, '작성자 게시글') : '') + ' · <code>' + esc(r.id) + '</code>';
  dlg.showModal();
}
$('subject').addEventListener('input', () => { $('go').disabled = !$('subject').value.trim(); });
$('go').addEventListener('click', () => send({ id: cur.id, no: cur.no, tone: cur.tone, note: cur.note, subject: $('subject').value.trim(), memo: $('memo').value.trim() }));
$('close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
// 닫힌 뒤에 영상을 멈춘다. close 는 조금 늦게 온다. 그사이 다른 카드를 열었으면 그 카드의 영상을 지우지 않는다
dlg.addEventListener('close', () => { if (!dlg.open) $('media').innerHTML = ''; });
// 찾기·보기·출처를 한 번에 건다. 맞는 카드가 없는 장은 숨기고, 맞은 수를 위쪽에 적는다
function apply() {
  const ws = $('q').value.toLowerCase().split(/\\s+/).filter(Boolean);
  const srcs = [...document.querySelectorAll('.checks input:checked')].map((i) => i.value);
  const on = ws.length || srcs.length || view;
  let n = 0;
  document.querySelectorAll('.chapter').forEach((sec) => {
    let k = 0;
    sec.querySelectorAll('.card').forEach((el) => {
      const m = el.dataset.marks;
      const ok = ws.every((w) => el.dataset.hay.includes(w)) && (!srcs.length || srcs.includes(el.dataset.src))
        && (view !== 'new' || m.includes('${NEW}')) && (view !== 'noreal' || !m.includes('${REAL}'));
      el.hidden = !ok; k += ok;
    });
    sec.hidden = on ? !k : false;
    n += k;
  });
  $('count').textContent = n;
  $('empty').hidden = n > 0;
}
document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; document.querySelectorAll('.views button').forEach((x) => x.classList.toggle('on', x === b)); apply(); }));
$('q').addEventListener('input', apply);
document.querySelectorAll('.checks input').forEach((i) => i.addEventListener('change', apply));
$('find').addEventListener('submit', (ev) => { ev.preventDefault(); $('q').value = $('q2').value; apply(); scrollTo({ top: 0 }); });
$('menu').addEventListener('click', () => $('menu').setAttribute('aria-expanded', document.body.classList.toggle('side-open')));
// 왼쪽 목록 · 지금 보는 장을 표시한다. 좁은 화면에서는 장을 고르면 목록을 닫는다
const links = new Map([...document.querySelectorAll('.cats a')].map((a) => [a.getAttribute('href').slice(1), a]));
const spy = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; links.forEach((a) => a.classList.remove('on')); links.get(e.target.id)?.classList.add('on'); }), { rootMargin: '-15% 0px -75% 0px' });
document.querySelectorAll('.chapter').forEach((s) => spy.observe(s));
links.forEach((a) => a.addEventListener('click', () => { document.body.classList.remove('side-open'); $('menu').setAttribute('aria-expanded', false); }));
apply();
</script></body></html>`;

const out = join(ROOT, PAGE);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
if (SITE) {
  mkdirSync(join(dirname(out), "fonts"), { recursive: true });
  for (const f of FONT_FILES) copyFileSync(join(ROOT, FONT_DIR, f), join(dirname(out), "fonts", f));
}
console.log(`${out} · ${entries.length}편 · ${chapters.map((c) => `${c.name} ${c.items.length}`).join(", ")}`);
if (!SITE && !process.argv.includes("--no-open")) serve(ROOT, PAGE, ANSWER);
