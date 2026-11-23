// videos/<id>/STORYBOARD.md 를 확인 화면 storyboard.html 로 바꿔 띄우고, 사용자가 화면에 적은 의견을 storyboard-feedback.json 으로 받는다.
// 사용: node scripts/storyboard.mjs videos/<id> [--no-open]   (--no-open 은 파일만 만든다)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { CLIENT_JS, serve } from "./review-server.mjs";
import { logStoryboardAnswer, logStoryboardShown } from "./run-log.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank">$1</a>');
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

// "## 제목" 단위로 나누고, 절마다 표(머리글·행)와 나머지 줄을 뽑는다
function parse(md) {
  const out = { title: "", status: "", sections: {} };
  let cur = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("# ")) out.title = line.slice(2).trim();
    else if (line.startsWith("상태 ·")) out.status = line.slice(4).trim();
    else if (line.startsWith("## ")) cur = out.sections[line.slice(3).trim()] = { head: null, rows: [], lines: [] };
    else if (cur && line.trim().startsWith("|")) {
      if (/^\|[\s:|-]+\|$/.test(line.trim())) continue;
      if (!cur.head) cur.head = cells(line); else cur.rows.push(cells(line));
    } else if (cur && line.trim()) cur.lines.push(line);
  }
  return out;
}
const list = (lines) => `<ul>${lines.map((l) => `<li${/^\s{2,}/.test(l) ? ' class="sub"' : ""}>${inline(l.trim().replace(/^- /, ""))}</li>`).join("")}</ul>`;
const note = (target) => `<textarea data-target="${esc(target)}" placeholder="${esc(target)} 에 대한 의견 (없으면 비워 둔다)"></textarea>`;

function images(dir) {
  const root = join(dir, "assets"), found = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jpe?g|png|webp)$/i.test(e.name)) found.push(p); } };
  if (existsSync(root)) walk(root);
  return found.map((p) => ({ name: basename(p, extname(p)), src: relative(dir, p) })).sort((a, b) => b.name.length - a.name.length);
}

function build(dir) {
  const sb = parse(readFileSync(join(dir, "STORYBOARD.md"), "utf8"));
  const sec = (name) => sb.sections[Object.keys(sb.sections).find((k) => k.startsWith(name))] ?? { head: [], rows: [], lines: [] };
  const imgs = images(dir);
  const [, fw, fh] = sec("방향").lines.join(" ").match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/) ?? [, 16, 9];   // 형식 줄의 화면 크기로 장면 카드 비율을 맞춘다 (세로 영상)
  const scenes = sec("장면표"), col = (name) => scenes.head.findIndex((h) => h.includes(name));
  const [iNo, iTime, iRole, iView, iCopy, iCond, iMotion, iNext] = ["#", "시간", "역할", "화면", "문구", "조건", "모션", "전환"].map(col);

  const spans = scenes.rows.map((r) => (r[iTime].match(/[\d.]+/g) ?? []).map(Number));
  const total = Math.max(1, ...spans.map((s) => s[1] ?? 0));
  const timeline = scenes.rows.map((r, i) => `<a href="#scene${i}" style="flex:${(spans[i][1] - spans[i][0]) || 1}"><b>${esc(r[iNo])}</b> ${esc(r[iRole])}<small>${esc(r[iTime])}</small></a>`).join("");

  const cards = scenes.rows.map((r, i) => {
    const view = r[iView];
    const used = []; let text = view;   // 화면 칸에 적힌 사진 파일 이름을 찾아 미리보기로 넣는다
    for (const im of imgs) if (text.includes(im.name)) { used.push(im); text = text.split(im.name).join(""); }
    const copy = r[iCopy].split(" / ").map((c, j) => `<div class="${j ? "c2" : "c1"}">${esc(c)}</div>`).join("");
    return `<section class="scene" id="scene${i}">
  <div class="frame">${used.length ? `<div class="shots">${used.map((u) => `<figure><img src="${esc(u.src)}" alt=""><figcaption>${esc(u.name)}</figcaption></figure>`).join("")}</div>` : ""}<div class="copy">${copy}</div>${r[iCond] && r[iCond] !== "없음" ? `<div class="cond">${esc(r[iCond])}</div>` : ""}</div>
  <div class="info"><h3><span class="no">${esc(r[iNo])}</span>${esc(r[iRole])}<small>${esc(r[iTime])}</small></h3>
    <h4>화면</h4><p>${inline(view)}</p>
    ${iMotion >= 0 && r[iMotion] ? `<h4>모션</h4><p>${inline(r[iMotion])}</p>` : ""}
    <h4>다음 장면으로의 전환</h4><p>${inline(r[iNext] ?? "")}</p>
    ${note(`장면 ${r[iNo]}`)}</div>
</section>`;
  }).join("\n");

  const nar = sec("내레이션");
  const narRows = nar.rows.map((r) => `<tr><td class="no">${esc(r[0])}</td><td><div class="say">${esc(r[1])}</div>${r[2] && r[2] !== "(같음)" ? `<div class="read">읽는 소리 · ${esc(r[2])}</div>` : ""}${note(`대사 ${r[0]}`)}</td></tr>`).join("");
  const others = Object.keys(sb.sections).filter((k) => !/^(방향|레퍼런스|내레이션|장면표)/.test(k));

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(sb.title)}</title><style>
*{box-sizing:border-box}body{margin:0;padding:40px 40px 140px;background:#ECEEF1;color:#12151B;font:16px/1.6 -apple-system,"Pretendard","Apple SD Gothic Neo",sans-serif}
.wrap{max-width:1280px;margin:0 auto}h1{font-size:30px;margin:0 0 4px}.status{color:#6B7280;margin:0 0 24px}
h2{font-size:14px;color:#0046FF;margin:36px 0 10px;letter-spacing:.04em}
.box{background:#fff;border-radius:16px;padding:20px 24px;box-shadow:0 8px 30px rgba(20,30,60,.06)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}ul{margin:0;padding-left:18px}li.sub{margin-left:18px;color:#4B5563}
code{font:13px ui-monospace,Menlo,monospace;background:#F1F3F6;border-radius:5px;padding:1px 5px}a{color:#0046FF}
.timeline{display:flex;gap:4px;position:sticky;top:0;z-index:5;padding:10px 0;background:#ECEEF1}
.timeline a{background:#12151B;color:#fff;border-radius:8px;padding:8px 10px;text-decoration:none;font-size:13px;white-space:nowrap;overflow:hidden;min-width:0}
.timeline small{display:block;opacity:.6}
table{width:100%;border-collapse:collapse}td{padding:12px 8px;border-top:1px solid #E6E9EE;vertical-align:top}tr:first-child td{border-top:0}
td.no,.no{font-weight:700;color:#0046FF;width:36px}.say{font-size:19px;font-weight:600}.read{color:#6B7280;font-size:14px}
.scene{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:24px;background:#fff;border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:0 8px 30px rgba(20,30,60,.06);scroll-margin-top:80px}
.frame{aspect-ratio:${fw}/${fh};${+fh > +fw ? "height:560px;justify-self:center;" : ""}background:#F7F8FA;border:1.5px solid #D5D9E0;border-radius:10px;padding:4%;display:flex;flex-direction:column;justify-content:center;gap:12px;overflow:hidden;position:relative}
.shots{display:flex;gap:10px;min-height:0;flex:1}.shots figure{margin:0;flex:1;min-width:0;position:relative}
.shots img{width:100%;height:100%;object-fit:cover;border-radius:6px;display:block}.shots figcaption{position:absolute;left:6px;bottom:6px;background:rgba(18,21,27,.75);color:#fff;font-size:11px;border-radius:4px;padding:1px 6px}
.c1{font-size:clamp(18px,2.2vw,30px);font-weight:700;line-height:1.25}.c2{color:#4B5563;font-size:14px;line-height:1.4}
.cond{font-size:12px;color:#6B7280;border-top:1px dashed #D5D9E0;padding-top:8px}
.info h3{margin:0 0 6px;font-size:20px}.info h3 .no{margin-right:10px}.info h3 small{margin-left:10px;color:#6B7280;font-weight:400;font-size:14px}
h4{font-size:12px;color:#0046FF;margin:12px 0 0}p{margin:0}
textarea{display:block;width:100%;min-height:52px;margin-top:12px;padding:10px 12px;border:1.5px solid #D5D9E0;border-radius:10px;font:inherit;font-size:14px;resize:vertical}
textarea:focus{outline:0;border-color:#0046FF}textarea.filled{border-color:#0046FF;background:#F3F6FF}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #D5D9E0;padding:14px 40px;display:flex;gap:12px;align-items:center;justify-content:flex-end;z-index:10}
.bar span{margin-right:auto;color:#6B7280}button{padding:13px 22px;border-radius:12px;border:1.5px solid #0046FF;font:700 16px/1 inherit;cursor:pointer;background:#fff;color:#0046FF}
button.go{background:#0046FF;color:#fff}button:disabled{opacity:.35;cursor:default}
@media(max-width:900px){.scene,.cols{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<h1>${esc(sb.title)}</h1><p class="status">상태 · ${esc(sb.status)}</p>
<div class="cols"><div><h2>방향</h2><div class="box">${list(sec("방향").lines)}</div></div><div><h2>레퍼런스</h2><div class="box">${list(sec("레퍼런스").lines)}</div></div></div>
<h2>장면 (전체 약 ${total}초)</h2><div class="timeline">${timeline}</div>
${cards}
${scenes.lines.length ? `<div class="box">${list(scenes.lines)}</div>` : ""}
<h2>내레이션</h2><div class="box"><table>${narRows}</table>${list(nar.lines)}</div>
${others.map((k) => `<h2>${esc(k)}</h2><div class="box">${list(sb.sections[k].lines)}${note(k)}</div>`).join("\n")}
<h2>전체 의견</h2><div class="box">${note("전체")}</div>
</div>
<div class="bar"><span id="count">의견 0건</span><button id="revise" disabled onclick="submit('revise')">수정 요청 보내기</button><button id="approve" class="go" onclick="submit('approve')">이대로 승인</button></div>
<script>${CLIENT_JS}
const areas = [...document.querySelectorAll('textarea')];
const comments = () => areas.filter((a) => a.value.trim()).map((a) => ({ target: a.dataset.target, text: a.value.trim() }));
function refresh() { const n = comments().length; areas.forEach((a) => a.classList.toggle('filled', !!a.value.trim()));
  document.getElementById('count').textContent = '의견 ' + n + '건'; document.getElementById('revise').disabled = !n;
  document.getElementById('approve').textContent = n ? '의견을 반영하는 조건으로 승인' : '이대로 승인'; }
areas.forEach((a) => a.addEventListener('input', refresh));
function submit(decision) { send({ decision, comments: comments() }); }
</script></body></html>`;
}

const dir = resolve(process.argv[2] ?? "");
if (!existsSync(join(dir, "STORYBOARD.md"))) { console.error("usage: storyboard.mjs videos/<id> [--no-open]"); process.exit(1); }
writeFileSync(join(dir, "storyboard.html"), build(dir));
console.log(join(dir, "storyboard.html"));
if (!process.argv.includes("--no-open")) {
  logStoryboardShown(dir, readFileSync(join(dir, "STORYBOARD.md"), "utf8"));
  serve(dir, "storyboard.html", "storyboard-feedback.json", { onAnswer: (a) => logStoryboardAnswer(dir, a) });
}
