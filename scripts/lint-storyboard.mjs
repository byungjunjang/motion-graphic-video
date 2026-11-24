#!/usr/bin/env node
// STORYBOARD.md 와 refs/candidates.json 이 SKILL.md 2·3단계 규칙을 지켰는지 검사한다. 고치지 않고 위반만 출력한다.
//   node scripts/lint-storyboard.mjs videos/<id>              → 위반 목록. 위반이 있으면 종료 코드 1
//   node scripts/lint-storyboard.mjs videos/<id> ... --table  → 영상마다 규칙별 위반 수 표 (기준값 재기)
//   --json 을 붙이면 JSON 으로 낸다
// 검사 (규칙 출처)
//   R1 핵심 문구 5단어 이하 · 장면표 "화면 문구" 칸의 첫 덩어리. 이름·제목 한 덩어리(1~2단어)는 위반으로 보지 않는다 (motion-rules.md ## 구성)
//   R2 전환 칸 · 금지 전환(크로스페이드·페이드·디졸브·와이프·글리치·회전 전환)이 적혀 있지 않다. 마지막 장면은 뺀다 (motion-rules.md ## 전환)
//      "사물이 다음 사물로 바뀌는가"는 낱말로 판정하면 오탐이 많아(동사 활용이 다양하다) 검사하지 않는다
//   R3 ## 방향 의 네 줄 · 톤(옷)·이야기 방식·움직임 원칙·쓰지 않는 것 (tone-catalog.md, storyboard-template.md)
//   R4 기법 줄에 데모 소재가 없음 · 기법 줄의 낱말이 그 데모 제목의 낱말과 겹치지 않는다 (technique-refs.md)
//   R5 추천 1개 · candidates.json 의 recommend 가 정확히 1개 (SKILL.md 2단계 4번)
//   R6 어두운 발광 추천 근거 · 추천 후보가 어두운 발광 계열이면 why 에 근거(어두운·검은·발광·FACTS·홈페이지)가, risk 가 "기본값 주의"로 시작 (SKILL.md 2단계 4번)
//   R7 마지막 1초 정지 · 마지막 장면의 모션·전환·화면 칸에 정지·멈춤이 적혀 있다 (motion-rules.md ## 구성)
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DARK = new Set(["particle", "dark-neon", "cinematic-3d", "cyberpunk"]);
const DARK_KO = /파티클|다크 네온|시네마틱 3D|사이버펑크/;
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function parse(md) {
  const out = { sections: {} };
  let cur = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) cur = out.sections[line.slice(3).trim()] = { head: null, rows: [], lines: [] };
    else if (cur && line.trim().startsWith("|")) {
      if (/^\|[\s:|-]+\|$/.test(line.trim())) continue;
      if (!cur.head) cur.head = cells(line); else cur.rows.push(cells(line));
    } else if (cur && line.trim()) cur.lines.push(line);
  }
  return out;
}
const sec = (sb, name) => sb.sections[Object.keys(sb.sections).find((k) => k.startsWith(name))];
// 한국어 어절·영어 낱말 수. 쉼표·마침표·괄호는 떼고 센다. 숫자 묶음도 한 낱말이다
// 라틴 글자·숫자 뒤에 띄어 쓴 조사 한 글자("mp4 가")는 앞 낱말에 붙여 센다
const words = (s) => s.replace(/[()\[\]「」"'“”‘’·,.!?…:;—–-]/g, " ").split(/\s+/).filter((w) => w && !/^[가이은는을를의에로와과도]$/.test(w)).length;
const tokens = (s) => new Set((s.match(/[가-힣]{2,}|[A-Za-z]{4,}/g) ?? []).map((w) => w.toLowerCase()));
const STOP = new Set(["장면", "화면", "기법", "효과", "움직임", "글자", "모양", "만든다", "있다", "없다", "그리고", "the", "with", "from", "into"]);

let INDEX = null, LABELS = null;
const index = () => INDEX ??= existsSync(join(ROOT, "references/ref-index.json")) ? Object.fromEntries(JSON.parse(readFileSync(join(ROOT, "references/ref-index.json"), "utf8")).entries.map((e) => [e.id, e])) : {};
const labels = () => LABELS ??= existsSync(join(ROOT, "references/tone-labels.json")) ? JSON.parse(readFileSync(join(ROOT, "references/tone-labels.json"), "utf8")) : {};

export function lint(dir) {
  const v = [], add = (rule, where, msg) => v.push({ rule, where, msg });
  const sbPath = join(dir, "STORYBOARD.md");
  if (existsSync(sbPath)) {
    const sb = parse(readFileSync(sbPath, "utf8"));
    // R1 · R2 · R7 장면표
    const sc = sec(sb, "장면표");
    if (!sc?.head) add("R1", "장면표", "장면표가 없다");
    else {
      const col = (n) => sc.head.findIndex((h) => h.includes(n));
      const [iNo, iCopy, iMotion, iNext, iView] = ["#", "문구", "모션", "전환", "화면"].map(col);
      sc.rows.forEach((r, k) => {
        const no = r[iNo] ?? k + 1;
        if (iCopy >= 0 && r[iCopy] && !/^(없음|-|—)$/.test(r[iCopy])) {
          // "자막 · " 같은 칸 이름은 떼고, 박자마다 바뀌는 조각(→)은 조각마다 센다
          const main = r[iCopy].split(/\s+\/\s+|<br>/)[0].replace(/^(자막|문구|제목)\s*·\s*/, "");
          const n = Math.max(...main.split(/\s*→\s*/).map(words));
          if (n > 5 && !/^\(/.test(main)) add("R1", `장면 ${no}`, `핵심 문구 ${n}단어 · "${main.slice(0, 40)}"`);
        }
        const last = k === sc.rows.length - 1;
        if (!last && iNext >= 0) {
          const t = r[iNext] ?? "", bad = t.match(/크로스\s?페이드|페이드|디졸브|와이프|글리치|회전 전환/);
          if (bad && !/(쓰지 않|없이|대신|아니)/.test(t)) add("R2", `장면 ${no}`, `금지 전환 "${bad[0]}" · "${t.slice(0, 50)}"`);
        }
        if (last) {
          const txt = [iMotion, iNext, iView].filter((i) => i >= 0).map((i) => r[i]).join(" ");
          if (!/정지|멈춘|멈춤|멈춰|머문다|고정/.test(txt)) add("R7", `장면 ${no}`, "마지막 장면에 정지가 적혀 있지 않다");
        }
      });
    }
    // R3 방향 네 줄
    const dir3 = sec(sb, "방향");
    const keys = [["톤", /^-\s*톤(\(옷\))?\s*·/], ["이야기 방식", /^-\s*이야기 방식\s*·/], ["움직임 원칙", /^-\s*움직임 원칙\s*·/], ["쓰지 않는 것", /^-\s*쓰지 않는 것\s*·/]];
    for (const [name, re] of keys) {
      if (dir3?.lines.some((l) => re.test(l.trim()))) continue;
      const elsewhere = Object.entries(sb.sections).find(([k, s]) => !k.startsWith("방향") && s.lines.some((l) => re.test(l.trim())));
      add("R3", "## 방향", `"${name}" 줄이 없다${elsewhere ? ` (## ${elsewhere[0]} 에 있다)` : ""}`);
    }
    // R4 기법 줄 · 데모 제목·장면 설명과 겹치는 낱말
    const ref = sec(sb, "레퍼런스");
    for (const l of ref?.lines ?? []) {
      const m = l.match(/기법\s*·\s*(am:[\w-]+)\s*[—-]?\s*(.*)/);
      if (!m) continue;
      const e = index()[m[1]];
      if (!e) { add("R4", m[1], "색인에 없는 기법 id"); continue; }
      const demo = tokens(e.title ?? "");
      const hit = [...tokens(m[2])].filter((w) => demo.has(w) && !STOP.has(w));
      if (hit.length) add("R4", m[1], `데모 소재 낱말 · ${hit.join(", ")}`);
    }
  }
  // R5 · R6 후보
  const cPath = join(dir, "refs", "candidates.json");
  if (existsSync(cPath)) {
    const cands = JSON.parse(readFileSync(cPath, "utf8"));
    const rec = cands.filter((c) => c.recommend);
    if (rec.length !== 1) add("R5", "candidates.json", `추천 ${rec.length}개`);
    for (const c of rec) {
      // 후보의 tone(에이전트가 고른 톤)을 먼저 본다. 비어 있으면 톤 판정의 첫 톤을 본다
      const dark = c.tone ? DARK_KO.test(c.tone) : DARK.has((labels()[c.id]?.tones ?? [])[0]);
      if (!dark) continue;
      if (!/어두운|검은|검정|발광|FACTS|홈페이지/.test(c.why ?? "")) add("R6", c.id, "어두운 발광 추천인데 why 에 근거가 없다");
      if (!/^기본값 주의/.test(c.risk ?? "")) add("R6", c.id, 'risk 가 "기본값 주의"로 시작하지 않는다');
    }
  }
  return v;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((d) => resolve(d));
  if (!dirs.length) { console.error("usage: lint-storyboard.mjs videos/<id> [...] [--table] [--json]"); process.exit(1); }
  const all = dirs.map((d) => ({ video: basename(d), v: lint(d) }));
  if (process.argv.includes("--json")) console.log(JSON.stringify(all, null, 2));
  else if (process.argv.includes("--table")) {
    const R = ["R1", "R2", "R3", "R4", "R5", "R6", "R7"];
    console.log(["영상", ...R, "합"].join(" | "));
    for (const { video, v } of all) console.log([video, ...R.map((r) => v.filter((x) => x.rule === r).length), v.length].join(" | "));
  } else for (const { video, v } of all) {
    console.log(`${video} · 위반 ${v.length}개`);
    for (const x of v) console.log(`  ${x.rule} ${x.where} · ${x.msg}`);
  }
  if (all.some((a) => a.v.length)) process.exitCode = 1;
}
