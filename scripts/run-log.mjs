#!/usr/bin/env node
// 영상 한 편의 실행 기록 videos/<id>/run-log.json 을 남긴다.
// refs.mjs board · storyboard.mjs · render.mjs 는 이 파일의 함수로 자동으로 덧붙인다. 스크립트가 알 수 없는 것은 아래 명령으로 적는다.
//   node scripts/run-log.mjs videos/<id> stage <0~8> [skip]     → 그 단계를 시작한다(앞 단계는 끝난다). skip 은 건너뛴 단계(예 · 무음 영상의 4단계)
//   node scripts/run-log.mjs videos/<id> defects <수> ["메모"]  → 6단계 검수에서 찾은 결함 수 (회차마다 한 번. 결함이 없었으면 0)
//   node scripts/run-log.mjs videos/<id> revision "바꾼 것" --redo <단계>  → 렌더 뒤 수정 요청 하나
//   node scripts/run-log.mjs videos/<id> check                → 빈 필드를 출력한다. 빈 곳이 있으면 종료 코드 1
//   node scripts/run-log.mjs videos/<id> show                 → 기록을 요약해 출력한다
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const now = () => new Date().toISOString();
const secs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
const file = (dir) => join(resolve(dir), "run-log.json");

export function readLog(dir) {
  const f = file(dir);
  const log = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  return { version: 1, video: basename(resolve(dir)), stages: {}, refs: [], storyboard: [], qa: { snapRuns: 0, det: [], defects: [] }, renders: [], revisions: [], ...log };
}

// fn 이 기록을 고친다. 기록을 남기다 실패해도 부른 스크립트는 멈추지 않는다
export function updateLog(dir, fn) {
  try {
    const log = readLog(dir);
    fn(log);
    writeFileSync(file(dir), JSON.stringify(log, null, 2) + "\n");
  } catch (e) { console.error(`run-log 기록 실패 (작업은 계속한다): ${e.message}`); }
}

// 2단계 · 비교 화면을 띄울 때와 답을 받을 때
export const logBoardShown = (dir, cands, sugs = []) => updateLog(dir, (l) => l.refs.push({
  shownAt: now(), candidates: cands.map((c) => c.id), suggestions: sugs.map(({ pick, id, support, text }) => ({ pick, id, support, text })), recommend: cands.find((c) => c.recommend)?.id ?? null, answer: null, answeredAt: null, seconds: null }));
export const logBoardAnswer = (dir, data) => updateLog(dir, (l) => {
  const r = l.refs.at(-1); if (!r) return;
  Object.assign(r, { answer: { pick: data.pick ?? null, id: data.id ?? null, support: data.support ?? null, suggestion: data.suggestion ?? null, suggestionIndex: data.suggestionIndex ?? null, memo: data.memo ?? "" }, answeredAt: data.at, seconds: secs(r.shownAt, data.at) });
  if (l.stages["2"] && !l.stages["2"].end) l.stages["2"].end = data.at;
});

// 3단계 · 확인 화면을 띄울 때(STORYBOARD.md 의 ## 레퍼런스 절에서 am: id 를 읽는다)와 답을 받을 때
export const logStoryboardShown = (dir, md, keyframes = 0) => updateLog(dir, (l) => {
  const ref = (md.split(/^## /m).find((s) => s.startsWith("레퍼런스")) ?? "");
  const techniques = [...new Set(ref.match(/\bam:[\w-]+/g) ?? [])];
  l.storyboard.push({ round: l.storyboard.length + 1, shownAt: now(), techniques, keyframes, decision: null, comments: null, answeredAt: null, seconds: null });
});
export const logStoryboardAnswer = (dir, data) => updateLog(dir, (l) => {
  const r = l.storyboard.at(-1); if (!r) return;
  Object.assign(r, { decision: data.decision, comments: (data.comments ?? []).length, answeredAt: data.at, seconds: secs(r.shownAt, data.at) });
  if (data.decision === "approve" && l.stages["3"] && !l.stages["3"].end) l.stages["3"].end = data.at;
});

// 6·7단계 · render.mjs 가 끝날 때
export const logSnap = (dir, det) => updateLog(dir, (l) => { l.qa.snapRuns++; if (det) l.qa.det.push({ at: now(), ...det }); });
export const logRender = (dir, frames, startedAt) => updateLog(dir, (l) => l.renders.push({ at: now(), frames, seconds: secs(startedAt, now()) }));

const STAGES = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
function check(l) {
  const miss = [];
  for (const s of STAGES) if (!l.stages[s]?.start && !l.stages[s]?.skip) miss.push(`stages.${s} (시작 기록 없음 · run-log.mjs stage ${s})`);
  const r = l.refs.at(-1);
  if (!r) miss.push("refs (refs.mjs board 기록 없음)");
  else {
    if (r.candidates.length !== 6) miss.push(`refs.candidates (${r.candidates.length}개)`);
    if (!r.recommend) miss.push("refs.recommend");
    if (!r.answer) miss.push("refs.answer (화면 답 없음)");
  }
  const s = l.storyboard.at(-1);
  if (!s) miss.push("storyboard (storyboard.mjs 기록 없음)");
  else if (s.decision !== "approve") miss.push(`storyboard.decision (마지막 회차 ${s.decision ?? "답 없음"})`);
  if (!l.qa.defects.length) miss.push("qa.defects (run-log.mjs defects <수>)");
  if (!l.qa.det.length) miss.push("qa.det (render.mjs --snap --det 기록 없음)");
  if (!l.renders.length) miss.push("renders (전체 렌더 기록 없음)");
  return miss;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, cmd, ...args] = process.argv.slice(2);
  if (!dir || !existsSync(resolve(dir)) || !cmd) {
    console.error("usage: run-log.mjs videos/<id> stage <0~8> [skip] | defects <수> [메모] | revision \"바꾼 것\" --redo <단계> | check | show");
    process.exit(1);
  }
  if (cmd === "stage") {
    const n = args[0];
    if (!STAGES.includes(n)) { console.error("단계는 0~8 이다"); process.exit(1); }
    updateLog(dir, (l) => {
      const t = now();
      for (const s of STAGES) if (l.stages[s]?.start && !l.stages[s].end && s !== n) l.stages[s].end = t;
      const cur = l.stages[n];
      if (args[1] === "skip") l.stages[n] = { skip: true, at: t };
      else if (cur?.start) { cur.again = [...(cur.again ?? []), t]; delete cur.end; }  // 수정 요청으로 다시 들어온 단계. 처음 시작 시각은 남긴다
      else l.stages[n] = { start: t };
    });
    console.log(`run-log · ${n}단계 ${args[1] === "skip" ? "건너뜀" : "시작"}`);
  } else if (cmd === "defects") {
    const count = Number(args[0]);
    if (!Number.isInteger(count) || count < 0) { console.error("결함 수는 0 이상의 정수다"); process.exit(1); }
    updateLog(dir, (l) => l.qa.defects.push({ at: now(), count, note: args[1] ?? "" }));
    console.log(`run-log · 결함 ${count}개`);
  } else if (cmd === "revision") {
    const i = args.indexOf("--redo"), redo = i > -1 ? args[i + 1] : null, what = args.filter((_, k) => k !== i && k !== i + 1).join(" ");
    if (!what || !STAGES.includes(redo)) { console.error("usage: revision \"바꾼 것\" --redo <0~8>"); process.exit(1); }
    updateLog(dir, (l) => l.revisions.push({ at: now(), what, redo }));
    console.log(`run-log · 수정 요청 기록 (${redo}단계부터)`);
  } else if (cmd === "check") {
    const l = readLog(dir);
    if (l.stages["8"]?.start && !l.stages["8"].end) updateLog(dir, (x) => { x.stages["8"].end = now(); });
    const miss = check(l);
    console.log(miss.length ? `run-log · 빈 곳 ${miss.length}개\n- ${miss.join("\n- ")}` : "run-log · 빈 곳 없음");
    console.log(`렌더 뒤 수정 요청 ${l.revisions.length}건 (요청이 없었으면 0 이 맞다)`);
    if (miss.length) process.exitCode = 1;
  } else if (cmd === "show") {
    const l = readLog(dir), r = l.refs.at(-1);
    console.log(`단계 · ${STAGES.map((s) => `${s}:${l.stages[s]?.skip ? "건너뜀" : l.stages[s]?.start ? (l.stages[s].end ? `${secs(l.stages[s].start, l.stages[s].end)}초` : "진행 중") : "-"}`).join(" ")}`);
    console.log(`후보 · ${r ? `${r.candidates.join(" ")} · 추천 ${r.recommend} · 선택 ${r.answer ? (r.answer.id ?? `메모만 "${r.answer.memo}"`) : "답 없음"} · ${r.seconds ?? "-"}초` : "-"}`);
    console.log(`스토리보드 · ${l.storyboard.map((s) => `${s.round}회 ${s.decision ?? "답 없음"}/의견 ${s.comments ?? "-"}`).join(", ") || "-"} · 기법 ${l.storyboard.at(-1)?.techniques.join(" ") || "없음"}`);
    console.log(`검수 · 스냅 ${l.qa.snapRuns}회 · 결함 ${l.qa.defects.map((d) => d.count).join("+") || "-"} · 결정성 ${l.qa.det.map((d) => d.result).join(", ") || "-"}`);
    console.log(`렌더 · ${l.renders.length}회 · 수정 요청 ${l.revisions.length}건`);
  } else { console.error(`모르는 명령: ${cmd}`); process.exit(1); }
}
