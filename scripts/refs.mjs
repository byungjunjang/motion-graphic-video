#!/usr/bin/env node
// 모션그래픽 레퍼런스 아홉 곳을 한 색인으로 모은다 · prompt-motion.com(pm:), yihui-dev/awesome-opus5-5-videos(gh:), claudevideo.org(cv:),
// lemomo-ai/lemo-opuscar 스타일 라이브러리(lo:), Vincentwei1021/mg-styles-15 쇼케이스(ms:), ItsssssJack/claude-video-2 스타일 명세(c2:),
// Pinterest 에서 모은 손제작 영상(pn:), Futurepedia AI Style Atlas 의 스타일 영상(fa:), kstost/cokacmotion 의 aimotion 표현 기법 데모(am:).
// c2: 는 스타일마다 STYLE.md(색 hex·글꼴·이징 수치·움직임 규칙·금지 목록)가 전문이다. 포스터 그림이 없어서 poster 를 비운다. 화면은 영상의 첫 화면을 쓴다.
// fa: 는 pn: 과 같은 방식이다. 원본의 프롬프트와 코드는 옮기지 않는다. 영상을 보고 쓴 분석 노트(references/atlas/<slug>.md)가 전문 자리에 온다. 목록은 references/atlas-refs.json 이다.
// pn: 은 프롬프트가 없다. 영상 프레임을 보고 쓴 분석 노트(references/pinterest/<slug>.md)가 전문 자리에 온다. 목록은 references/pinterest-refs.json 이다.
// pm:·gh:·cv: 가운데 작성자의 프롬프트에 화면 지시가 없는 항목은 영상 프레임을 보고 쓴 분석 노트(references/notes/<출처>-<slug>.md)로 보완한다.
// 노트가 있으면 색인의 chars·excerpt·tones 는 노트에서 만들고 analysis: true 를 붙인다. show 는 노트를 먼저 내고 작성자의 프롬프트를 뒤에 붙인다.
// am: 은 스타일 레퍼런스가 아니라 표현 기법이다(kind: technique). 효과를 만드는 방법만 가져온다. 영상 파일이 없고 브라우저에서 도는 데모 페이지가 있다.
// search·tones 는 기법을 스타일과 따로 센다. search 는 --tech 를 줄 때만 기법을 낸다. show 는 구현 노트(NOTES.md) 전문과 소스 파일 주소를 낸다.
// claudevideo.org 는 Motion graphics 유형 중 프롬프트가 공개된 항목만 넣는다. 조회수(views)를 함께 적는다.
// 색인에는 제목·출처·발췌·미리보기 주소만 둔다. 프롬프트 전문은 저장하지 않고 show 로 그때그때 읽는다.
// lo: 의 show 는 STYLE.md 의 본질·모션·카메라·함정 절과 DEMO.md 의 ## Shots 만 낸다. 사용자가 고른 뒤에는 show lo:<slug> --demo 로 DEMO.md 전체를 읽는다.
// 색인 발췌에서는 실존 작가·스튜디오·상표 이름을 뺀다. show·board 미리보기의 전문(lo: 숏 표와 --demo, ms: Creative seed)에는 이름이 남아 있다. 이름은 영상에 옮기지 않는다.
// AE·Blender 같은 도구 이름은 기법 설명이라 남긴다. id 의 slug(lo:hd-2d 등)는 원본을 찾는 내부 키다. 영상·문구에 쓰지 않는다.
//   node scripts/refs.mjs index                         → references/ref-index.json 을 다시 만든다 (1~2분)
//   node scripts/refs.mjs index --only <lo|c2|pn|fa|am>  → 그 출처만 다시 받아 그 출처의 항목과 바꾼다. 다른 출처 항목과 built 날짜는 그대로 둔다
//   node scripts/refs.mjs index --only notes            → 분석 노트만 다시 읽어 그 항목의 chars·excerpt·tones 를 바꾼다. 접속하지 않는다
//   node scripts/refs.mjs search <단어...> [--tag t] [--tone 톤id] [--min-chars n] [--limit n] [--tech]
//     --tech 는 스타일 레퍼런스 대신 표현 기법(am:)에서 찾는다
//   node scripts/refs.mjs tones                         → 톤별 레퍼런스 개수를 센다 (포스터 판정 + 단어표 판정). 기법 수는 따로 낸다
//   node scripts/refs.mjs unlabeled [--limit n] [--sample n] → 포스터 판정이 없는 항목의 id·포스터 주소를 출력한다
//   node scripts/refs.mjs verify                        → 원본 영상을 볼 수 있는지 확인한다. 못 보면 제외 목록(ref-videos.json)에 넣는다
//   node scripts/refs.mjs show <id> [--demo]            → 전문을 출력하고 읽은 기록을 남긴다 (--demo 는 lo: 의 DEMO.md 전체를 붙인다)
//     am: 은 번호만 적어도 된다 (show am:18)
//   node scripts/refs.mjs board videos/<id> [--no-open] → refs/candidates.json 으로 비교 화면 refs/board.html 을 만들어 띄우고,
//     사용자가 화면에서 고른 답을 refs/choice.json 으로 받는다 (--no-open 은 파일만 만든다)
//     refs/suggestions.json 이 있으면 메모 칸 위에 제안 2~4개가 나온다. 항목 { pick: "A", text: "한 문장", why?: "생각할 거리 한 줄", support?: "<보조 id>" }.
//     섞기 제안은 support 를 단다(선택). 답의 suggestion 은 accepted · edited · ignored, suggestionIndex 는 고른 제안 번호다
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { CLIENT_JS, serve } from "./review-server.mjs";
import { logBoardAnswer, logBoardShown } from "./run-log.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(ROOT, "references", "ref-index.json");
const READ_LOG = join(ROOT, "videos", ".refs-read.log");
const PM = "https://prompt-motion.com";
const GH_JSON = "https://raw.githubusercontent.com/yihui-dev/awesome-opus5-5-videos/main/data/videos.json";
const GH_REPO = "https://github.com/yihui-dev/awesome-opus5-5-videos";
const CV = "https://claudevideo.org";
const LO = "https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main";
const LO_FILMS = "https://lemomo-ai.github.io/lemo-opuscar-films";
const LO_REPO = "https://github.com/lemomo-ai/lemo-opuscar";
const MS = "https://raw.githubusercontent.com/Vincentwei1021/mg-styles-15/main";
const MS_SITE = "https://vincentwei1021.github.io/mg-styles-15";
const MS_REPO = "https://github.com/Vincentwei1021/mg-styles-15";
const AM = "https://raw.githubusercontent.com/kstost/cokacmotion/main/skills/aimotion";
const AM_SITE = "https://kstost.github.io/cokacmotion";
const AM_REPO = "https://github.com/kstost/cokacmotion";
const C2 = "https://raw.githubusercontent.com/ItsssssJack/claude-video-2/main";
const C2_CDN = "https://cdn.jsdelivr.net/gh/ItsssssJack/claude-video-2@main";   // 원본 저장소 주소는 mp4 를 영상 형식으로 주지 않는다. CDN 은 video/mp4 로 준다
const C2_REPO = "https://github.com/ItsssssJack/claude-video-2";
const FA_PAGE = "https://www.futurepedia.io/resources/ai-style-atlas/view";
const EXCERPT = 400;
const TONES = JSON.parse(readFileSync(join(ROOT, "references", "tone-keywords.json"), "utf8"));
delete TONES._;
// 포스터 이미지를 보고 붙인 톤. 색인을 다시 만들어도 남도록 색인과 따로 둔다. 단어표 판정보다 우선한다.
const LABELS_PATH = join(ROOT, "references", "tone-labels.json");
const LABELS = existsSync(LABELS_PATH) ? JSON.parse(readFileSync(LABELS_PATH, "utf8")) : {};
const POSTER_WEIGHT = 3;
// 원본 영상 확인 결과. { id: { via: "source" | "x", post?, checked } } 이면 볼 수 있다.
// { id: { excluded: true, reason, checked } } 이면 원본을 볼 수 없는 불량 레퍼런스라 검색·후보에서 뺀다.
const VIDEOS_PATH = join(ROOT, "references", "ref-videos.json");
const VIDEOS = existsSync(VIDEOS_PATH) ? JSON.parse(readFileSync(VIDEOS_PATH, "utf8")) : {};
// 항목의 톤. 포스터 판정이 있으면 그 톤에 POSTER_WEIGHT 를 주고, 없으면 단어표 판정을 쓴다.
// 판정 불가(tones 가 빈 배열이고 by 가 unknown)면 단어표 판정을 그대로 쓴다.
const tonesFor = (e) => (LABELS[e.id] && LABELS[e.id].by !== "unknown" ? Object.fromEntries(LABELS[e.id].tones.map((t) => [t, POSTER_WEIGHT])) : e.tones ?? {});

// 연결이 끊기면 0.5초 뒤 한 번 더 시도한다. 그래도 안 되면 어느 호스트에 접속하지 못했는지 적는다.
const get = async (url, retry = 1) => {
  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  } catch (err) {
    if (retry) return new Promise((r) => setTimeout(r, 500)).then(() => get(url, retry - 1));
    throw new Error(`${new URL(url).host} 에 접속하지 못했다 (${err.cause?.code ?? err.message})`);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};
const unescape = (s) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 세 출처의 항목을 같은 모양으로 맞춘다. prompt 는 색인에 저장하지 않는다.
function pmEntry(html, url) {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "{}");
  const prompt = unescape(html.match(/<div id="entry-prompt"[^>]*>(.*?)<\/div>/s)?.[1] ?? "");
  return {
    id: `pm:${url.split("/").pop()}`,
    source: "prompt-motion.com",
    title: ld.name ?? url,
    author: ld.creator?.url?.split("/").pop() ?? "",
    url,
    date: ld.uploadDate ?? "",
    tool: ld.description?.match(/made with (.+?) by @/)?.[1] ?? "",
    tags: [...new Set([...html.matchAll(/href="\/tags\/([a-z0-9-]+)"/g)].map((m) => m[1]))],
    poster: [ld.thumbnailUrl].flat()[0] ?? "",
    video: ld.contentUrl ?? "",
    partial: false,
    prompt,
  };
}
function ghEntry(v) {
  const prompt = v.prompt ?? "";
  return {
    id: `gh:${v.slug}`,
    source: "awesome-opus5-5-videos",
    title: cut(flat(prompt), 60),
    author: v.author ?? "",
    url: v.skillry_url || v.post_url || GH_REPO,
    post: v.post_url ?? "",
    date: v.added ?? "",
    tool: "Claude Opus 5.5",
    tags: [v.category, ...(v.tech_tags ?? [])].filter(Boolean),
    poster: v.poster_url ?? "",
    // 목록에는 포스터만 있다. 원본 영상은 skillry 미디어 서버의 정해진 경로에 있다.
    video: v.slug ? `https://media.skillry.dev/opus-5-5/${v.slug}/original.mp4` : "",
    partial: Boolean(v.prompt_partial),
    prompt,
  };
}
function cvEntry(html, url) {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "{}");
  const look = html.match(/>LOOK<\/div><div[^>]*>(.*?)<\/div>/s)?.[1] ?? "";
  return {
    id: `cv:${url.split("/").pop()}`,
    source: "claudevideo.org",
    title: ld.name ?? url,
    author: ld.creator?.alternateName?.replace(/^@/, "") ?? "",
    url,
    post: ld.isBasedOn ?? "",
    date: ld.uploadDate?.slice(0, 10) ?? "",
    tool: "Claude Opus 5.5",
    tags: ["motion-graphics", ...[...look.matchAll(/>([^<]+)<\/span>/g)].map((m) => m[1])],
    poster: [ld.thumbnailUrl].flat()[0] ?? "",
    video: ld.contentUrl ?? "",
    partial: false,
    views: ld.interactionStatistic?.userInteractionCount ?? 0,
    prompt: unescape(html.match(/<pre data-prompt-text[^>]*>(.*?)<\/pre>/s)?.[1] ?? ""),
  };
}
// lemo-opuscar 의 스타일 한 개. STYLE.md 머리의 인용문은 첫 설명 줄만 남긴다. 둘째 줄부터는 실존 작가·작품·상표 이름(References·Name 줄)이다.
// prompt 는 STYLE.md 의 머리, 본질·모션(편집)·카메라(숏)·함정 절과 DEMO.md 의 숏 표(## Shots, 없으면 ## Layouts, 그것도 없으면 ## Story 절)다. fullDemo 면 숏 표 대신 DEMO.md 전체를 붙인다.
// 절은 번호가 아니라 머리글로 고른다. 편집·다큐 계열은 절 번호가 다르다. 발췌(400자)에 걸리는 실존 이름 구절은 LO_DROP 으로 지운다
const LO_TITLE = { "hd-2d": "Pixel Diorama" };   // 원본 이름이 상표인 스타일은 일반 이름으로 부른다
const LO_DROP = [" (Cassandre, Lempicka)"];
const loNames = (s) => LO_DROP.reduce((x, d) => x.split(d).join(""), s);
function loEntry(row, style, demo, fullDemo = false) {
  const md = style.replace(/\r\n/g, "\n"), parts = md.split(/^(?=## )/m);
  const head = parts[0].split("\n").filter((l, i, a) => !l.startsWith(">") || a.findIndex((x) => x.startsWith(">")) === i).join("\n")
    .replace(/^# .*? —/, (h) => (LO_TITLE[row.slug] ? `# ${LO_TITLE[row.slug]} —` : h));
  const pick = parts.filter((p) => /^## \d+\. (Essence|Motion|Edit|Camera|Shot|Pitfalls)/.test(p));
  const dparts = demo.replace(/\r\n/g, "\n").split(/^(?=## )/m);
  const shots = ["## Shots", "## Layouts", "## Story"].reduce((s, h) => s ?? dparts.find((p) => p.startsWith(h)), undefined) ?? "";
  return {
    id: `lo:${row.slug}`,
    source: "lemo-opuscar (LemoLab · CC BY 4.0)",
    title: LO_TITLE[row.slug] ?? row.en,
    author: "LemoLab",
    url: `${LO_REPO}/tree/main/styles/${row.slug}`,
    post: "",
    date: "",
    tool: "Claude Opus 5.5",
    tags: [row.cat_en, ...(row.uses ?? []), `${row.dur}s`].filter(Boolean),
    poster: `${LO}/styles/${row.slug}/poster.jpg`,
    video: `${LO_FILMS}/${row.slug}.mp4`,
    partial: false,
    prompt: [loNames(head).trim(), ...pick.map((p) => loNames(p).trim()), fullDemo ? `---\n# DEMO.md\n\n${demo}` : shots.trim()].filter(Boolean).join("\n\n"),
  };
}
// mg-styles-15 의 쇼케이스 한 편. 15편이 같은 머리말(스튜디오 이름)과 같은 # Output 블록으로 시작하므로 둘을 버린다.
// 발췌가 스타일 이름과 # Signature features 로 시작하게 순서를 바꾼다. 스타일 이름의 '…风格/style' 괄호(실존 채널·인물 이름)는 지운다.
function msEntry(f) {
  const body = f.prompt.replace(/\r\n/g, "\n"), secs = body.slice(body.indexOf("# Style")).split(/^(?=# )/m);
  const name = secs[0].replace(/^# Style\n/, "").replace(/[（(][^）)]*(风格|style)[^）)]*[）)]/gi, "").trim();
  const sig = secs.find((s) => s.startsWith("# Signature features")) ?? "";
  const rest = secs.slice(1).filter((s) => !s.startsWith("# Output") && s !== sig);
  // Signature features 의 첫 단락은 업계 사례(실존 스튜디오·브랜드·채널 이름)다. 그 단락을 버리고 '视觉特征'(시각 특징)부터 쓴다
  const cut = sig.indexOf("视觉特征"), lead = sig.slice(0, sig.indexOf("\n") + 1);
  // 업계 사례 단락 밖에도 실존 이름이 든 구절이 있다(MS_DROP). 그 구절은 앞의 쉼표부터 줄 끝까지 지운다
  const sigBody = (cut > 0 ? `${lead}${sig.slice(cut)}` : sig).replace(new RegExp(`，[^，\\n]*(${MS_DROP.join("|")})[^\\n]*`, "g"), "");
  return {
    id: `ms:${f.slug}`,
    source: "mg-styles-15",
    title: f.name_en,
    author: "Vincentwei1021",
    url: `${MS_REPO}/tree/main/demos/${f.slug}`,
    post: "",
    date: "",
    tool: "Claude Opus 5.5",
    tags: [`${f.w}x${f.h}`, `${f.fps}fps`, `${f.dur}s`, "no-narration"],
    poster: `${MS_SITE}/${f.poster}`,
    video: `${MS_SITE}/${f.video}`,
    partial: false,
    prompt: [`# Style\n${name}`, sigBody.trim(), ...rest.map((s) => s.trim())].filter(Boolean).join("\n\n"),
  };
}
const MS_DROP = ["Motion Design School"];
// Pinterest 핀 한 개. 목록과 분석 노트가 저장소 안에 있어서 접속 없이 읽는다.
const PN_PATH = join(ROOT, "references", "pinterest-refs.json");
const pnRows = () => (existsSync(PN_PATH) ? JSON.parse(readFileSync(PN_PATH, "utf8")).pins : []);
function pnEntry(r) {
  return {
    id: `pn:${r.slug}`,
    source: `pinterest (${r.board})`,
    title: r.title,
    author: r.author,
    url: `https://www.pinterest.com/pin/${r.pin}/`,
    post: "",
    date: r.saved,
    tool: "손제작 영상 · 분석 노트",
    tags: [...r.tags, `${r.w}x${r.h}`, `${r.fps}fps`, `${r.dur}s`],
    poster: r.poster,
    video: r.video,
    partial: false,
    prompt: readFileSync(join(ROOT, "references", "pinterest", `${r.slug}.md`), "utf8").trim(),
  };
}
// claude-video-2 의 스타일 한 개. l 은 목록(gallery/looks.js)의 한 줄, md 는 STYLE.md 다
function c2Entry(l, md) {
  return {
    id: `c2:${l.id}`,
    source: "claude-video-2 (ItsssssJack · MIT)",
    title: l.name,
    author: "ItsssssJack",
    url: `${C2_REPO}/tree/main/styles/${l.id}`,
    post: "",
    date: "",
    tool: "Claude Code",
    tags: [l.kind === "studio" ? "studio-piece" : "code-style", ...l.best.split(", ")],
    poster: "",
    video: `${C2_CDN}/gallery/videos/${l.id}.mp4`,
    partial: false,
    prompt: md.trim(),
  };
}
// 목록은 JSON 이 아니라 스크립트다. 실행하지 않고 줄마다 id·name·kind·best 를 읽는다
const c2Looks = async () =>
  [...(await get(`${C2}/gallery/looks.js`)).matchAll(/\{ id: '([^']+)', name: '((?:[^'\\]|\\.)*)', kind: '([^']+)'.*?best: '((?:[^'\\]|\\.)*)'/g)]
    .map(([, id, name, kind, best]) => ({ id, name: name.replace(/\\'/g, "'"), kind, best: best.replace(/\\'/g, "'") }));
// AI Style Atlas 의 스타일 한 개. 목록과 분석 노트가 저장소 안에 있어서 접속 없이 읽는다
const FA_PATH = join(ROOT, "references", "atlas-refs.json");
const faRows = () => (existsSync(FA_PATH) ? JSON.parse(readFileSync(FA_PATH, "utf8")).styles : []);
function faEntry(r) {
  return {
    id: `fa:${r.slug}`,
    source: "AI Style Atlas (Futurepedia)",
    title: r.title,
    author: "Futurepedia",
    url: FA_PAGE,
    post: "",
    date: r.saved,
    tool: "코드 스타일 영상 · 분석 노트",
    tags: [...r.tags, `${r.w}x${r.h}`, `${r.fps}fps`, `${r.dur}s`],
    poster: r.poster,
    video: r.video,
    partial: false,
    prompt: readFileSync(join(ROOT, "references", "atlas", `${r.slug}.md`), "utf8").trim(),
  };
}
// 분석 노트. 파일 이름은 id 의 쌍점을 하이픈으로 바꾼 것이다 (pm:abc-123 → pm-abc-123.md). 노트가 없으면 null
const NOTES_DIR = join(ROOT, "references", "notes");
const noteOf = (id) => {
  const p = join(NOTES_DIR, `${id.replace(":", "-")}.md`);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
};
const msFilms = async () => { const s = await get(`${MS}/site/data.js`); return JSON.parse(s.slice(s.indexOf("["), s.lastIndexOf("]") + 1)); };
// aimotion 의 기법 데모 한 편. d 는 목록(index.json)의 한 줄이다. url 은 데모 페이지, notes 는 구현 노트(NOTES.md) 주소다.
// 색인에 넣을 때는 목록의 기법 이름·배울 점·라이브러리·주의만 쓴다. 데모 장면 설명(scene)은 넣지 않는다. 가져오지 않는 것이고, 넣으면 장면에 나온 낱말이 기법 검색에 걸린다.
// 기법은 카탈로그 화면에 싣지 않는다. search --tech 와 show 로만 본다.
// md(구현 노트 전문)를 주면 그 전문과 소스 파일 주소가 prompt 가 된다(show 용). 노트가 main.js:줄 을 가리키므로 소스 주소를 함께 낸다.
function amEntry(d, md) {
  const raw = `${AM}/demos/${d.id}`;
  return {
    id: `am:${d.id}`,
    kind: "technique",
    source: "aimotion (kstost/cokacmotion · MIT)",
    title: d.title,
    tech: d.tech,
    group: d.group,
    author: "kstost",
    url: `${AM_SITE}/${d.id}/`,
    notes: `${AM_REPO}/blob/main/skills/aimotion/demos/${d.id}/NOTES.md`,
    post: "",
    date: "",
    tool: "웹 기법 데모 · 구현 노트",
    tags: [d.group, ...d.libraries, "1080x1920"],
    poster: `${AM_SITE}/${d.id}/out/poster.jpg`,
    video: "",
    partial: false,
    prompt: md
      ? `${md.trim()}\n\n## 소스\n\n${d.files.map((f) => `- ${raw}/${f}`).join("\n")}\n- 공통 코드 · ${AM}/demos/_lib/stage.js · ${AM}/demos/_lib/type.js${d.sheet ? `\n- 1초마다 한 장 · ${raw}/out/sheet.jpg` : ""}`
      : [`기법 · ${d.tech}`, `배울 점 · ${d.points.join(" / ")}`, d.libraries.length ? `라이브러리 · ${d.libraries.join(", ")}` : "", d.cautions.length ? `옮길 때 주의 · ${d.cautions.join(" / ")}` : ""].filter(Boolean).join(" | "),
  };
}
const amIndex = async () => JSON.parse(await get(`${AM}/index.json`));

// 톤 단어표의 단어가 몇 개 맞았는지 톤마다 센다. 단어는 앞뒤가 영문·숫자가 아닐 때만 맞는다 (ink 가 think 에 맞지 않게).
const toneRe = (w) => new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]")}(?![a-z0-9])`, "i");
const TONE_RES = Object.fromEntries(Object.entries(TONES).map(([id, t]) => [id, t.words.map(toneRe)]));
function tonesOf(text, tags) {
  const out = {};
  for (const [id, t] of Object.entries(TONES)) {
    const n = TONE_RES[id].filter((re) => re.test(text)).length + t.tags.filter((g) => tags.includes(g)).length;
    if (n) out[id] = n;
  }
  return out;
}
// 분석 노트가 있으면 글자 수·발췌·단어표 톤을 노트에서 만든다
const noted = (e, text) => ({ chars: text.length, excerpt: cut(flat(text), EXCERPT), tones: tonesOf(`${e.title} ${text}`, e.tags) });
const toIndex = ({ prompt, ...e }) => {
  const note = noteOf(e.id);
  return { ...e, ...(note && { analysis: true }), ...noted(e, note ?? prompt) };
};

// Motion graphics 유형 목록에서 PROMPT 표시가 붙은 항목만 상세를 읽는다.
// 목록 위쪽의 인기 영상은 아래 전체 목록에 한 번 더 나오므로 주소를 한 번씩만 센다.
async function cvPrompted(failed) {
  const list = (await get(`${CV}/videos/type/motion-graphics`)).split('<a href="/videos/').slice(1).map((s) => s.slice(0, s.indexOf("</a>")));
  const urls = [...new Set(list.filter((s) => /^[a-z0-9-]+"/.test(s) && s.includes(">PROMPT<")).map((s) => `${CV}/videos/${s.slice(0, s.indexOf('"'))}`))];
  return crawl(urls, cvEntry, failed);
}

// 같은 영상이 여러 출처에 있으면 base 쪽 항목 하나로 합치고, 각 list 에서 합쳐지지 않은 항목만 돌려준다.
// X 게시글 번호가 양쪽에 있으면 그 번호로만 맞춘다. 같은 작성자가 같은 프롬프트로 영상을 여러 번 올린 경우를 가르기 위해서다.
// 번호가 없는 쪽이 있으면 작성자 + 프롬프트 앞 80자로 맞춘다.
function mergeTwins(base, ...lists) {
  const key = (e) => `${e.author.toLowerCase()}|${flat(e.prompt).slice(0, 80).toLowerCase()}`;
  const sid = (e) => e.post?.match(/status\/(\d+)/)?.[1];
  const seen = new Map();
  const add = (e) => {
    seen.set(key(e), e);
    if (sid(e)) seen.set(sid(e), e);
  };
  base.forEach(add);
  return lists.map((list) =>
    list.filter((e) => {
      const byKey = seen.get(key(e));
      const twin = (sid(e) && seen.get(sid(e))) || (byKey && !(sid(byKey) && sid(e)) ? byKey : undefined);
      if (!twin) {
        add(e);
        return true;
      }
      Object.assign(twin, { source: twin.source.includes(e.source) ? twin.source : `${twin.source} + ${e.source}`, alsoIn: [twin.alsoIn ?? [], e.id].flat(), post: twin.post ?? e.post, views: twin.views ?? e.views });
      add(twin);
      return false;
    }),
  );
}

// 4개씩 나눠 받는다. 실패하거나 프롬프트가 없는 주소는 failed 에 모은다.
async function crawl(urls, parse, failed) {
  const out = [];
  for (let i = 0; i < urls.length; i += 4) {
    const batch = await Promise.allSettled(urls.slice(i, i + 4).map(async (u) => parse(await get(u), u)));
    batch.forEach((r, k) => (r.status === "fulfilled" && r.value.prompt ? out.push(r.value) : failed.push(urls[i + k])));
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

// 다른 출처와 겹치는 재게시가 없는 출처. 합치기를 거치지 않아서 --only <키> 로 그 출처만 다시 받을 수 있다
const SOLO = {
  // lo: 는 스타일마다 STYLE.md 와 DEMO.md 를 받는다
  lo: async (failed) => {
    const rows = JSON.parse(await get(`${LO}/styleboard/catalog.json`)), by = Object.fromEntries(rows.map((r) => [r.slug, r]));
    return crawl(rows.map((r) => `${LO}/styles/${r.slug}/STYLE.md`), async (style, u) => {
      const slug = u.split("/").at(-2);
      return loEntry(by[slug], style, await get(`${LO}/styles/${slug}/DEMO.md`));
    }, failed);
  },
  c2: async (failed) => {
    const looks = await c2Looks(), by = Object.fromEntries(looks.map((l) => [l.id, l]));
    return crawl(looks.map((l) => `${C2}/styles/${l.id}/STYLE.md`), (md, u) => c2Entry(by[u.split("/").at(-2)], md), failed);
  },
  pn: async () => pnRows().map(pnEntry),
  fa: async () => faRows().map(faEntry),
  am: async () => (await amIndex()).demos.map((d) => amEntry(d)),
};

async function buildIndex(only) {
  // --only <출처> · SOLO 의 출처는 다른 출처를 다시 훑지 않고 그 출처의 항목만 바꿀 수 있다
  // --only notes · 분석 노트는 저장소 안에 있다. 그래서 접속하지 않고 노트가 있는 항목의 글자 수·발췌·톤만 바꿀 수 있다
  if (only === "notes") {
    const idx = loadIndex("all"), ids = new Set(idx.entries.map((e) => e.id));
    const entries = idx.entries.map((e) => { const note = noteOf(e.id); return note ? { ...e, analysis: true, ...noted(e, note) } : e; });
    writeFileSync(INDEX, JSON.stringify({ built: idx.built, entries }, null, 1));
    console.log(`분석 노트 ${entries.filter((e) => e.analysis).length}개 반영 · 다른 항목과 built(${idx.built})는 그대로 → ${INDEX}`);
    // 파일 이름이 틀리면 노트가 쓰이지 않는다. 색인에 없는 id 의 노트 파일을 알린다
    const stray = (existsSync(NOTES_DIR) ? readdirSync(NOTES_DIR) : []).filter((f) => f.endsWith(".md") && !ids.has(f.slice(0, -3).replace("-", ":")));
    if (stray.length) console.log(`색인에 없는 id 의 노트 파일 (${stray.length}): ${stray.join(", ")}`);
    return;
  }
  if (only) {
    if (!SOLO[only]) throw new Error(`--only 는 ${Object.keys(SOLO).join(", ")}, notes 만 받는다: ${only}`);
    const idx = loadIndex("all"), mine = (e) => e.id.startsWith(`${only}:`), kept = idx.entries.filter((e) => !mine(e)), failed = [];
    const fresh = (await SOLO[only](failed)).map(toIndex);
    // 그 출처가 있던 자리에 넣는다. 새 출처면 표현 기법(am:) 앞에 넣는다
    const was = idx.entries.findIndex(mine), tech = kept.findIndex((e) => e.kind === "technique");
    const at = was >= 0 ? was : tech >= 0 ? tech : kept.length;
    writeFileSync(INDEX, JSON.stringify({ built: idx.built, entries: [...kept.slice(0, at), ...fresh, ...kept.slice(at)] }, null, 1));
    console.log(`${only}: ${fresh.length} · 다른 출처 ${kept.length}개와 built(${idx.built})는 그대로 → ${INDEX}`);
    if (failed.length) console.log(`failed (${failed.length}):\n${failed.join("\n")}`);
    return;
  }
  const sitemap = await get(`${PM}/sitemap.xml`);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/[a-z0-9-]+-[0-9a-f]{6}$/.test(u));
  const failed = [];
  const pm = await crawl(urls, pmEntry, failed);
  const gh = JSON.parse(await get(GH_JSON)).map(ghEntry);
  const cv = await cvPrompted(failed);
  const lo = await SOLO.lo(failed);
  const ms = (await msFilms()).map(msEntry);
  const c2 = await SOLO.c2(failed), pn = await SOLO.pn(), fa = await SOLO.fa(), am = await SOLO.am();
  // 같은 영상이 여러 곳에 있으면 한 항목으로 합치고 출처를 모두 적는다. 검색 순위에는 출처를 쓰지 않는다.
  const [ghOnly, cvOnly] = mergeTwins(pm, gh, cv);
  const entries = [...pm, ...ghOnly, ...cvOnly, ...lo, ...ms, ...c2, ...pn, ...fa, ...am].map(toIndex);
  mkdirSync(dirname(INDEX), { recursive: true });
  writeFileSync(INDEX, JSON.stringify({ built: new Date().toISOString().slice(0, 10), entries }, null, 1));
  console.log(`prompt-motion ${pm.length}/${urls.length} · github ${ghOnly.length}/${gh.length} (양쪽에 다 있는 ${gh.length - ghOnly.length}개는 한 항목으로 합침) · claudevideo ${cvOnly.length}/${cv.length} · lemo-opuscar ${lo.length} · mg-styles-15 ${ms.length} · claude-video-2 ${c2.length} · pinterest ${pn.length} · style atlas ${fa.length} · aimotion ${am.length} → ${INDEX}`);
  if (failed.length) console.log(`failed (${failed.length}):\n${failed.join("\n")}`);
}

// 원본을 볼 수 없어 제외한 항목은 빼고 돌려준다. 톤 판정(tone-labels.json)이 없는 항목은 검토 대기라 검색·후보에서도 뺀다.
// mode · "all" 은 제외 항목까지 (verify 용), "usable" 은 검토 대기까지 (unlabeled·show 용), 기본은 둘 다 뺀다.
const loadIndex = (mode = "reviewed") => {
  if (!existsSync(INDEX)) throw new Error("색인이 없다. 먼저 `node scripts/refs.mjs index` 를 실행한다.");
  const idx = JSON.parse(readFileSync(INDEX, "utf8"));
  if (mode === "all") return idx;
  return { ...idx, entries: idx.entries.filter((e) => !VIDEOS[e.id]?.excluded && (mode === "usable" || LABELS[e.id])) };
};

// 확인 기록이 없는 항목만 본다. 출처 영상 주소가 열리면 source, 아니면 작성자 X 게시글에 영상이 있으면 x, 둘 다 아니면 제외한다.
// ffprobe 와 yt-dlp 가 필요하다. 다시 확인하려면 ref-videos.json 에서 그 항목을 지운다.
// 기법(am:)은 영상 파일이 없다. 데모 페이지가 열리면 page, 아니면 제외한다(curl).
function verify() {
  const { entries } = loadIndex("all");
  const todo = entries.filter((e) => !VIDEOS[e.id]);
  const checked = new Date().toISOString().slice(0, 10);
  const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", timeout: 120000 });
  for (const e of todo) {
    let rec;
    if (e.kind === "technique") rec = run("curl", ["-sfL", "-o", "/dev/null", e.url]).status === 0 ? { via: "page", checked } : { excluded: true, reason: "데모 페이지 없음", checked };
    else if (e.video && run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", e.video]).stdout.trim()) rec = { via: "source", checked };
    else if (e.post && /x\.com|twitter\.com/.test(e.post) && run("yt-dlp", ["-q", "--no-warnings", "--simulate", e.post]).status === 0) rec = { via: "x", post: e.post, checked };
    else rec = { excluded: true, reason: e.post ? "출처 영상 없음 · X 게시글에 영상 없음" : "출처 영상 없음 · 게시글 주소 없음", checked };
    VIDEOS[e.id] = rec;
    console.log(`${e.id}\t${rec.excluded ? `제외 (${rec.reason})` : rec.via}`);
  }
  writeFileSync(VIDEOS_PATH, JSON.stringify(VIDEOS, null, 1));
  const ex = Object.values(VIDEOS).filter((v) => v.excluded).length;
  console.log(`새로 확인 ${todo.length}개 · 제외 누적 ${ex}개 → ${VIDEOS_PATH}`);
}

// 전문을 출처에서 직접 읽는다. 첫 출처가 막혔거나 목록에서 빠졌으면 같은 영상의 다른 출처(alsoIn)에서 읽는다.
// 조회수는 claudevideo 에만 있으므로 색인에 적힌 값을 붙인다. id 는 요청한 것을 그대로 둔다.
async function fetchFull(id) {
  const ix = existsSync(INDEX) ? loadIndex("usable").entries.find((x) => x.id === id) : undefined;
  let last;
  for (const alt of [id, ix?.alsoIn ?? []].flat()) {
    try {
      const e = await fetchSource(alt), note = noteOf(id);
      // 분석 노트가 있으면 노트를 먼저 내고 작성자의 프롬프트를 뒤에 붙인다
      const withNote = note && { analysis: true, prompt: `${note}\n\n---\n\n## 작성자의 프롬프트 (${e.prompt.length.toLocaleString()}자${e.partial ? " · 일부만 공개" : ""})\n\n${e.prompt}` };
      return { ...e, id, views: e.views ?? ix?.views, ...withNote };
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`${id} 를 읽지 못했다 · ${last.message}`);
}
async function fetchSource(id) {
  const [src, slug] = [id.slice(0, 2), id.slice(3)];
  if (src === "pm") return pmEntry(await get(`${PM}/${slug}`), `${PM}/${slug}`);
  if (src === "gh") {
    const v = JSON.parse(await get(GH_JSON)).find((x) => x.slug === slug);
    if (!v) throw new Error(`github 목록에 없는 slug: ${slug}`);
    return ghEntry(v);
  }
  if (src === "cv") return cvEntry(await get(`${CV}/videos/${slug}`), `${CV}/videos/${slug}`);
  if (src === "lo") {
    const row = JSON.parse(await get(`${LO}/styleboard/catalog.json`)).find((r) => r.slug === slug);
    if (!row) throw new Error(`lemo-opuscar 목록에 없는 slug: ${slug}`);
    return loEntry(row, await get(`${LO}/styles/${slug}/STYLE.md`), await get(`${LO}/styles/${slug}/DEMO.md`), process.argv.includes("--demo"));
  }
  if (src === "ms") {
    const f = (await msFilms()).find((x) => x.slug === slug);
    if (!f) throw new Error(`mg-styles-15 목록에 없는 slug: ${slug}`);
    return msEntry(f);
  }
  if (src === "pn") {
    const r = pnRows().find((x) => x.slug === slug);
    if (!r) throw new Error(`pinterest 목록에 없는 slug: ${slug}`);
    return pnEntry(r);
  }
  if (src === "c2") {
    const l = (await c2Looks()).find((x) => x.id === slug);
    if (!l) throw new Error(`claude-video-2 목록에 없는 id: ${slug}`);
    return c2Entry(l, await get(`${C2}/styles/${slug}/STYLE.md`));
  }
  if (src === "fa") {
    const r = faRows().find((x) => x.slug === slug);
    if (!r) throw new Error(`style atlas 목록에 없는 slug: ${slug}`);
    return faEntry(r);
  }
  if (src === "am") {
    const d = (await amIndex()).demos.find((x) => x.id === slug);
    if (!d) throw new Error(`aimotion 목록에 없는 id: ${slug}`);
    return amEntry(d, await get(`${AM}/demos/${d.id}/NOTES.md`));
  }
  throw new Error(`id 는 pm:<slug>, gh:<slug>, cv:<slug>, lo:<slug>, ms:<slug>, c2:<id>, pn:<slug>, fa:<slug>, am:<id> 형식이다: ${id}`);
}

function search(words, opts) {
  const { entries: all, built } = loadIndex();
  // 스타일 레퍼런스와 표현 기법(am:)은 쓰는 곳이 다르다. 한 번에 한쪽만 찾는다. 기본은 스타일이다
  const entries = all.filter((e) => (e.kind === "technique") === !!opts.tech);
  const ws = words.map((w) => w.toLowerCase());
  const hits = entries
    .filter((e) => !opts.tag || e.tags.includes(opts.tag))
    .filter((e) => e.chars >= (opts.minChars ?? 0))
    .map((e) => {
      const hay = `${e.title} ${e.tags.join(" ")} ${e.tool} ${e.excerpt}`.toLowerCase();
      // --tone 은 거르지 않고 점수만 더한다. 단어만 맞는 항목도, 톤만 맞는 항목도 나온다. 둘 다 맞으면 위로 간다.
      const tone = opts.tone ? Math.min(tonesFor(e)[opts.tone] ?? 0, POSTER_WEIGHT) / 2 : 0;
      const words = ws.filter((w) => hay.includes(w)).length;
      return { e, words, tone, score: words + tone };
    })
    // 단어도 톤도 주지 않으면 전부 낸다. 같은 점수 안에서는 조회수가 많은 것을 먼저 낸다. 조회수가 없는 출처는 0 으로 본다.
    // 같은 점수·조회수에서는 리뷰를 거친 항목(new 아님)을 먼저, 그다음 글자 수 순서로 낸다. lo:·ms: 는 스타일 명세라 글이 길어서 글자 수만 보면 출처 때문에 위로 올라간다
    .filter((h) => (!ws.length && !opts.tone) || h.score > 0)
    .sort((a, b) => b.score - a.score || (b.e.views ?? 0) - (a.e.views ?? 0) || !!LABELS[a.e.id]?.new - !!LABELS[b.e.id]?.new || b.e.chars - a.e.chars)
    .slice(0, opts.limit ?? 20);
  if (opts.tone && !TONES[opts.tone]) throw new Error(`톤 id 가 아니다: ${opts.tone}. 쓸 수 있는 id: ${Object.keys(TONES).join(", ")}`);
  console.log(`색인 ${built} · ${opts.tech ? "표현 기법" : "스타일 레퍼런스"} ${entries.length}개 중 ${hits.length}개`);
  // 기법의 글자 수는 색인에 넣은 요약의 길이다. 구현 노트의 길이가 아니라서 적지 않는다
  for (const { e } of hits)
    console.log(`\n${e.id} · ${e.title}\n  @${e.author} · ${e.tags.join(", ")}${e.kind === "technique" ? "" : ` · ${e.chars}자${e.analysis ? " (분석 노트)" : e.partial ? " (일부)" : ""}`}${e.views ? ` · 조회 ${e.views.toLocaleString()}회` : ""} · ${e.source}\n  톤: ${toneLabel(e)}\n  ${cut(e.excerpt, 180)}`);
}

// 포스터 판정이면 [포스터], 단어표 판정이면 맞은 단어가 많은 순서로 보여 준다. 단어 하나만 맞은 톤은 (?) 를 붙인다.
const toneLabel = (e) => {
  const mark = [e.kind === "technique" ? "[기법]" : "", LABELS[e.id]?.new ? "[새 항목 · 리뷰 전]" : "", ...(LABELS[e.id]?.flags ?? []).map((f) => `[${f}]`)].filter(Boolean).join(" ");
  return [toneText(e), mark].filter(Boolean).join(" ");
};
const toneText = (e) => {
  if (LABELS[e.id] && LABELS[e.id].by !== "unknown") return LABELS[e.id].tones.length ? `${LABELS[e.id].tones.map((t) => TONES[t].name).join(", ")} [${LABELS[e.id].by}]` : `해당 없음 [${LABELS[e.id].by}] ${LABELS[e.id].note ?? ""}`.trim();
  const unknown = LABELS[e.id] ? " [포스터 판정 불가]" : "";
  return (Object.entries(e.tones ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${TONES[id].name}${n < 2 ? "(?)" : ""}`)
    .join(", ") || "-") + unknown;
};

// 포스터 판정이 아직 없는 항목. --sample n 은 무작위 n개(시험용), --limit n 은 앞에서 n개.
function unlabeled(opts) {
  const { entries } = loadIndex("usable");
  let rows = entries.filter((e) => !LABELS[e.id] && e.poster);
  if (opts.untoned) rows = rows.filter((e) => !Object.keys(e.tones ?? {}).length);
  if (opts.sample) rows = rows.map((e) => [Math.random(), e]).sort((a, b) => a[0] - b[0]).map(([, e]) => e).slice(0, opts.sample);
  else if (opts.limit) rows = rows.slice(0, opts.limit);
  for (const e of rows) console.log(`${e.id}\t${e.poster}\t${cut(e.title, 60)}`);
  console.error(`${rows.length}개 · 포스터 판정 ${Object.keys(LABELS).length}개 저장됨`);
}

// 기법(am:)은 후보로 내는 레퍼런스가 아니다. 그래서 톤별 레퍼런스 수와 상태(충분·적음·거의 없음)에 넣지 않고 "기법" 칸에 따로 센다.
// 기법의 톤은 그 기법을 쓸 수 있는 톤이다.
function tones() {
  const { entries: both, built } = loadIndex();
  const entries = both.filter((e) => e.kind !== "technique"), techs = both.filter((e) => e.kind === "technique");
  if (!entries.some((e) => e.tones)) throw new Error("색인에 톤 정보가 없다. `node scripts/refs.mjs index` 로 다시 만든다.");
  const labeled = entries.filter((e) => LABELS[e.id]).length;
  console.log(`색인 ${built} · ${entries.length}개 · 포스터 판정 ${labeled}개 · 톤 정보가 없는 항목 ${entries.filter((e) => !Object.keys(tonesFor(e)).length).length}개 · 표현 기법 ${techs.length}개(톤이 붙은 것 ${techs.filter((e) => Object.keys(tonesFor(e)).length).length}개)는 따로 센다`);
  console.log("톤 id · 이름 · 전체(포스터 판정 또는 단어 2개 이상) · 실자료를 뺀 수 · 기법 수 · 예시");
  for (const [id, t] of Object.entries(TONES)) {
    const all = entries.filter((e) => tonesFor(e)[id]).sort((a, b) => tonesFor(b)[id] - tonesFor(a)[id]);
    const strong = all.filter((e) => tonesFor(e)[id] >= 2);
    console.log(`${id} · ${t.name} · ${all.length}(${strong.length}) · 실자료 뺀 수 ${all.filter((e) => !LABELS[e.id]?.flags?.includes("실자료")).length} · 기법 ${techs.filter((e) => tonesFor(e)[id]).length} · ${all.slice(0, 3).map((e) => e.id).join(" ") || "레퍼런스 없음"}`);
  }
}

async function board(dir, open) {
  const refs = join(resolve(dir), "refs");
  const cands = JSON.parse(readFileSync(join(refs, "candidates.json"), "utf8"));
  if (cands.length !== 6) console.error(`경고: 후보가 ${cands.length}개다. 사용자에게는 6개를 보여 준다.`);
  const read = new Set(existsSync(READ_LOG) ? readFileSync(READ_LOG, "utf8").split("\n").map((l) => l.split("\t")[1]) : []);
  const sugPath = join(refs, "suggestions.json"), sugRaw = existsSync(sugPath) ? JSON.parse(readFileSync(sugPath, "utf8")) : [];
  const unread = [...cands.map((c) => c.id), ...sugRaw.map((x) => x.support).filter(Boolean)].filter((id) => !read.has(id));
  if (unread.length) throw new Error(`show 로 전문을 읽지 않은 후보: ${unread.join(", ")}`);
  const unlabeled = cands.filter((c) => !LABELS[c.id]).map((c) => c.id), fresh = cands.filter((c) => LABELS[c.id]?.new).map((c) => c.id);
  if (unlabeled.length) console.error(`경고: 톤 판정이 없는 후보다(검토 대기): ${unlabeled.join(", ")}`);
  if (fresh.length) console.error(`경고: 사용자 리뷰 전인 새 항목이다. 주의할 점에 적는다: ${fresh.join(", ")}`);
  // 제안 · 2~4개. 각 제안은 카드 하나(pick)를 바탕으로 한다. 보조가 후보 밖이면 원본 주소를 붙인다
  if (sugRaw.length && (sugRaw.length < 2 || sugRaw.length > 4)) console.error(`경고: 제안은 2~4개다. 지금 ${sugRaw.length}개`);
  const sugs = [];
  for (const x of sugRaw) {
    const k = "ABCDEF".indexOf(x.pick);
    if (k < 0 || !cands[k]) throw new Error(`제안의 pick 이 후보 기호가 아니다: ${x.pick}`);
    const inside = x.support && cands.some((c) => c.id === x.support);
    sugs.push({ pick: x.pick, id: cands[k].id, support: x.support ?? null, text: x.text, why: x.why ?? "", url: x.support && !inside ? (await fetchFull(x.support)).url : null });
  }
  const cards = [];
  for (const [i, c] of cands.entries()) {
    const e = await fetchFull(c.id);
    // 영상 주소가 없거나 재생에 실패하면 포스터와 원본 링크로 바꾼다.
    // verify 가 출처 영상을 못 찾고 X 원본으로 확인한 항목(via: x)은 출처 영상 주소가 죽어 있다. X 게시글로 연결한다.
    const xpost = VIDEOS[c.id]?.via === "x" ? VIDEOS[c.id].post : null;
    if (VIDEOS[c.id]?.excluded) console.error(`경고: ${c.id} 는 verify 에서 제외된 항목이다 (${VIDEOS[c.id].reason})`);
    const fallback = xpost
      ? `<a href="${esc(xpost)}" target="_blank"><img src="${esc(e.poster)}" alt=""><span class="play">X 원본에서 영상 보기 ↗</span></a>`
      : `<a href="${esc(e.url)}" target="_blank"><img src="${esc(e.poster)}" alt=""><span class="play">원본 페이지에서 영상 보기 ↗</span></a>`;
    const media = e.video && !xpost
      ? `<video src="${esc(e.video)}" poster="${esc(e.poster)}" controls muted loop playsinline preload="metadata" onerror="this.replaceWith(this.nextElementSibling.content.cloneNode(true))"></video><template>${fallback}</template>`
      : fallback;
    cards.push(`<article>
  <div class="media">${media}</div>
  <div class="body">
    <div class="pick">${"ABCDEF"[i] ?? i + 1}</div>${c.recommend ? `<span class="rec">추천</span>` : ""}${c.tone ? `<span class="tone">톤 · ${esc(c.tone)}</span>` : ""}
    <h2>${esc(c.label || e.title)}</h2>
    <p class="meta">${[LABELS[c.id]?.new ? "[새 항목 · 리뷰 전]" : "", LABELS[c.id]?.flags?.includes("실자료") ? "[실자료 필요]" : "", LABELS[c.id]?.flags?.includes("AI이미지") ? "[AI 이미지 필요]" : ""].filter(Boolean).map((m) => `${esc(m)} · `).join("")}${esc(e.source)} · @${esc(e.author)} · ${esc(e.tool)} · ${esc(e.date)} · ${e.analysis ? "분석 노트 + 프롬프트" : "프롬프트"} ${e.prompt.length.toLocaleString()}자${e.partial ? " (일부만 공개)" : ""}${e.views ? ` · 조회 ${e.views.toLocaleString()}회` : ""}</p>
    <h3>어떤 영상인가</h3><p>${esc(c.what)}</p>
    <h3>가져올 것</h3><ul>${(c.borrow ?? []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    <h3>이 영상에 맞는 이유</h3><p>${esc(c.why)}</p>
    ${c.risk ? `<h3>주의할 점</h3><p>${esc(c.risk)}</p>` : ""}
    <details><summary>${e.analysis ? "분석 노트" : "프롬프트"} 앞부분 보기</summary><pre>${esc(cut(e.prompt, 1200))}</pre></details>
    <p class="links"><a href="${esc(e.url)}" target="_blank">원본 페이지 ↗</a>${(xpost ?? e.post) ? ` · <a href="${esc(xpost ?? e.post)}" target="_blank">작성자 게시글 ↗</a>` : ""} · <code>${esc(c.id)}</code></p>
    <button class="choose" onclick="choose('${"ABCDEF"[i] ?? i + 1}', '${esc(c.id)}')">${"ABCDEF"[i] ?? i + 1} 방향으로 만들기</button>
  </div>
</article>`);
  }
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>레퍼런스 후보</title><style>
*{box-sizing:border-box}body{margin:0;padding:40px;background:#ECEEF1;color:#12151B;font:16px/1.6 -apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif}
h1{font-size:28px;margin:0 0 6px}.sub{color:#6B7280;margin:0 0 28px}
main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:start}
article{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(20,30,60,.08)}
.media{background:#0C0F14;aspect-ratio:16/9;position:relative}.media video,.media img{width:100%;height:100%;object-fit:contain;display:block}
.media a{display:block;height:100%}.play{position:absolute;left:12px;bottom:12px;background:#0046FF;color:#fff;border-radius:99px;padding:6px 14px;font-size:14px}
.body{padding:22px 24px 24px}.pick{display:inline-block;width:34px;height:34px;border-radius:50%;background:#0046FF;color:#fff;font-weight:700;text-align:center;line-height:34px}
h2{font-size:21px;margin:10px 0 2px;line-height:1.35}.meta{color:#6B7280;font-size:13px;margin:0 0 6px}
h3{font-size:13px;color:#0046FF;margin:16px 0 2px}p{margin:0}ul{margin:0;padding-left:18px}
details{margin-top:16px}summary{cursor:pointer;color:#6B7280;font-size:14px}pre{white-space:pre-wrap;font:12.5px/1.55 ui-monospace,Menlo,monospace;background:#F4F5F7;border-radius:10px;padding:12px;max-height:320px;overflow:auto}
.links{margin-top:14px;font-size:13px;color:#6B7280}a{color:#0046FF}code{font-size:12px}
.tone{margin-left:8px;padding:4px 12px;border-radius:99px;background:#12151B;color:#fff;font-size:13px;font-weight:700;vertical-align:top;line-height:24px;display:inline-block}
.rec{margin-left:8px;padding:4px 12px;border-radius:99px;border:1.5px solid #0046FF;color:#0046FF;font-size:13px;font-weight:700;vertical-align:top;line-height:24px;display:inline-block}
.choose{margin-top:16px;width:100%;padding:13px;border:0;border-radius:12px;background:#0046FF;color:#fff;font:700 16px/1 inherit;cursor:pointer}
.sug{max-width:900px;margin:0 0 14px;padding:16px 18px;border:1.5px solid #0046FF;border-radius:12px;background:#F3F6FF}.sug b{color:#0046FF;margin-right:8px}.sug .hint{color:#6B7280;font-size:13px}.sug p{margin:0 0 8px}.sug ol{margin:0;padding-left:22px}.sug li{margin:0 0 14px}.sug .why{color:#6B7280;font-size:14px}.sug button{margin-right:8px;padding:10px 16px;border-radius:10px;border:1.5px solid #0046FF;font:700 15px/1 inherit;cursor:pointer;background:#fff;color:#0046FF}.sug button.go{background:#0046FF;color:#fff}
.memo{display:block;width:100%;max-width:900px;min-height:64px;margin:0 0 10px;padding:12px 14px;border:1.5px solid #D5D9E0;border-radius:12px;font:inherit;resize:vertical}
@media(max-width:1100px){main{grid-template-columns:1fr}}
</style></head><body><h1>레퍼런스 후보 ${cands.length}개</h1><p class="sub">영상을 재생해 보고 카드 아래의 단추로 하나를 고른다. 프롬프트와 영상의 권리는 각 작성자에게 있다. 이 화면은 원본을 링크로만 불러온다.</p>
${sugs.length ? `<div class="sug"><p><b>제안</b><span class="hint">고르지 않아도 된다. 생각할 거리로 본다</span></p><ol>${sugs.map((x, k) => `<li><p>${esc(x.text)}${x.url ? ` · <a href="${esc(x.url)}" target="_blank">보조 레퍼런스 ↗</a>` : ""}</p>${x.why ? `<p class="why">${esc(x.why)}</p>` : ""}<button class="go" onclick="acceptSug(${k})">이대로 만들기</button><button onclick="moveSug(${k})">메모 칸에 옮겨 고치기</button></li>`).join("")}</ol></div>` : ""}
<textarea id="memo" class="memo" placeholder="덧붙일 말이 있으면 적는다 (선택). 예 · B 로 하되 C 의 숫자 장면을 섞어 주세요"></textarea>
<button class="choose" style="width:auto;margin:0 0 28px;padding:13px 22px" onclick="sendMemo()">적은 내용만 보내기</button><main>
${cards.join("\n")}
</main><script>${CLIENT_JS}
const SUG = ${JSON.stringify(sugs)};
let moved = null;
// 제안에 대한 답 · accepted(그대로) · edited(메모 칸에 옮겨 고침) · ignored(제안을 쓰지 않음). 제안 번호는 1부터
const verdict = (memo) => !SUG.length ? {} : moved === null ? { suggestion: 'ignored' } : { suggestion: memo === SUG[moved].text ? 'accepted' : 'edited', suggestionIndex: moved + 1 };
function acceptSug(k) { const x = SUG[k]; send({ pick: x.pick, id: x.id, ...(x.support ? { support: x.support } : {}), memo: x.text, suggestion: 'accepted', suggestionIndex: k + 1 }); }
function moveSug(k) { const m = document.getElementById('memo'); m.value = SUG[k].text; moved = k; m.focus(); }
function choose(pick, id) { const memo = document.getElementById('memo').value.trim(); send({ pick, id, memo, ...verdict(memo) }); }
function sendMemo() { const memo = document.getElementById('memo').value.trim(); if (memo) send({ pick: null, id: null, memo, ...verdict(memo) }); else document.getElementById('memo').focus(); }
</script></body></html>`;
  const out = join(refs, "board.html");
  writeFileSync(out, html);
  console.log(out);
  if (open) {
    logBoardShown(dir, cands, sugs);
    serve(resolve(dir), "refs/board.html", "refs/choice.json", { onAnswer: (a) => logBoardAnswer(dir, a) });
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const positional = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.match(/^--(tag|tone|min-chars|limit|sample|only)$/));
// 예상한 실패(접속 끊김, 색인 없음, 읽지 않은 후보)는 스택 트레이스 없이 한 줄로 알리고 끝낸다.
try {
  if (cmd === "index") await buildIndex(flag("--only"));
  else if (cmd === "tones") tones();
  else if (cmd === "verify") verify();
  else if (cmd === "unlabeled") unlabeled({ limit: Number(flag("--limit") ?? 0), sample: Number(flag("--sample") ?? 0), untoned: rest.includes("--untoned") });
  else if (cmd === "search") search(positional, { tag: flag("--tag"), tone: flag("--tone"), minChars: Number(flag("--min-chars") ?? 0), limit: Number(flag("--limit") ?? 20), tech: rest.includes("--tech") });
  else if (cmd === "show" && positional[0]) {
    // am:18 처럼 번호만 적으면 색인에서 am:18-watercolor 를 찾는다. 번호는 aimotion 의 데모 번호다
    const want = positional[0].replace(/^am:(\d+)$/, (id, n) => loadIndex("usable").entries.find((x) => x.id.startsWith(`am:${n.padStart(2, "0")}-`))?.id ?? id);
    const e = await fetchFull(want);
    if (!e.prompt) throw new Error(`프롬프트 본문을 찾지 못했다: ${positional[0]}`);
    console.log(`# ${e.title}\n${e.id} · ${e.url} · @${e.author} · ${e.tool} · ${e.date} · tags: ${e.tags.join(", ")}${e.views ? ` · 조회 ${e.views.toLocaleString()}회` : ""}${e.partial ? " · 일부만 공개" : ""}${e.analysis ? " · 분석 노트(영상 프레임을 보고 쓴 글)가 앞에 온다" : ""}\n\n${e.prompt}`);
    mkdirSync(dirname(READ_LOG), { recursive: true });
    appendFileSync(READ_LOG, `${new Date().toISOString()}\t${e.id}\n`);
  } else if (cmd === "board" && positional[0]) await board(positional[0], !rest.includes("--no-open"));
  else {
    console.error("usage: refs.mjs index [--only lo|c2|pn|fa|am|notes] | search <단어...> [--tag t] [--tone 톤id] [--min-chars n] [--limit n] [--tech] | tones | verify | unlabeled [--sample n] [--untoned] | show <id> [--demo] | board videos/<id> [--no-open]");
    process.exit(1);
  }
} catch (err) {
  console.error(`오류 · ${err.message}`);
  process.exit(1);
}
