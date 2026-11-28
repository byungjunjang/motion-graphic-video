// videos/<id>/src/index.html 의 window.seek(t) 를 프레임마다 불러 PNG 로 찍는다.
// 사용: node scripts/render.mjs videos/<id>                 → renders/frames/ 에 전체 프레임
//       node scripts/render.mjs videos/<id> --snap 1,5.5,12 → renders/snaps/ 에 해당 시각 + 검수용 renders/sheet.png
//       node scripts/render.mjs videos/<id> --snap 1,5.5,12 --det → 위에 더해, 새 페이지에서 같은 시각을 역순으로 다시 찍어 화소를 비교한다
// 페이지를 열 때마다 선언된 글꼴을 모두 불러 둔다. 하나라도 못 불러오면 font not loaded 를 출력하고 종료 코드 1 로 끝난다
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logRender, logSnap } from './run-log.mjs';

const dir = resolve(process.argv[2] ?? '');
const cfg = JSON.parse(readFileSync(resolve(dir, 'video.json'), 'utf8'));
const { fps: FPS, duration: DUR, width: W, height: H } = cfg;
const WORKERS = 4;
const snapIdx = process.argv.indexOf('--snap');
const snaps = snapIdx > -1 ? process.argv[snapIdx + 1].split(',').map(Number) : null;
const det = process.argv.includes('--det');
const startedAt = new Date().toISOString();
let detResult = null;  // run-log.json 에 남길 결정성 결과
if (det && !snaps) console.warn('--det 는 --snap 과 함께 쓴다. 이번에는 비교하지 않는다.');
const targetDir = resolve(dir, snaps ? 'renders/snaps' : 'renders/frames');
mkdirSync(resolve(dir, 'renders'), { recursive: true });
const outDir = mkdtempSync(resolve(dir, 'renders', snaps ? '.snaps-' : '.frames-'));

if (/src=["']beats\.js["']/.test(readFileSync(resolve(dir, 'src/index.html'), 'utf8')) && !existsSync(resolve(dir, 'src/beats.js')))
  console.warn('src/beats.js 가 아직 없다. 박자 맞춤 없이 찍는다 (콘솔의 404 는 무시해도 된다). 음악을 만든 뒤 audio-probe.py --onsets --write 로 만들고 다시 찍는다.');

// Chrome 이 없으면 Edge 로 찍는다. 같은 영상의 프레임은 한 브라우저로만 찍는다
const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(async e => {
  console.warn(`Chrome 을 띄우지 못했다. Edge 로 찍는다 · ${e.message.split('\n')[0]}`);
  return chromium.launch({ channel: 'msedge', headless: true });
});
let opened = false;
const open = async () => {
  const first = !opened; opened = true;  // 글꼴 오류와 WebGL 이름은 첫 페이지에서 한 번만 알린다
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error(`page error: ${e.message}`); process.exitCode = 1; });
  await page.goto(pathToFileURL(resolve(dir, 'src/index.html')).href);
  await page.waitForFunction('window.__ready === true');
  // 숨은 장면에만 쓰는 굵기도 미리 불러 두어 대체 글꼴로 찍히지 않게 한다
  const [bad, nFonts] = await page.evaluate(async () => {
    const fs = [...document.fonts];
    await Promise.all(fs.map(f => f.load().catch(() => {})));
    return [[...new Set(fs.filter(f => f.status !== 'loaded').map(f => `${f.family} ${f.weight}`))], fs.length];
  });
  if (first && bad.length) { console.error(`font not loaded · ${bad.join(', ')}`); process.exitCode = 1; }
  else if (first) console.log(`fonts · ${nFonts}개 loaded`);
  // canvas 가 있으면 이 PC 의 WebGL 렌더러 이름을 알린다 (3D 톤 속도의 근거). 페이지의 canvas 는 건드리지 않고 새 canvas 로 잰다
  const gl = first && await page.evaluate(() => {
    if (!document.querySelector('canvas')) return null;
    const g = document.createElement('canvas').getContext('webgl');
    if (!g) return 'WebGL 없음';
    const e = g.getExtension('WEBGL_debug_renderer_info'), name = g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER);
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  });
  if (gl) console.log(`webgl · ${gl} (canvas 있음, 2D·WebGL 종류는 확인 안 함)`);
  return page;
};
const snapFile = t => resolve(outDir, `t${t.toFixed(2).padStart(6, '0')}.png`);
// 두 PNG 에서 8 넘게 다른 화소 수, 최대 화소 차(0~255), 차이 지도. 빈 페이지에서 canvas 로 디코드해 비교한다
// 차이 지도는 첫 장을 흐리게 깔고 8 넘게 다른 화소를 빨갛게 칠한 PNG(data URL)다. 다른 화소가 없으면 null
const pixelDiff = async ([a, b]) => {
  const px = async s => { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); };
  const [P, Q] = await Promise.all([px(a), px(b)]), p = P.data, q = Q.data;
  let n = 0, m = 0;
  for (let k = 0; k < p.length; k += 4) {
    const d = Math.max(Math.abs(p[k] - q[k]), Math.abs(p[k + 1] - q[k + 1]), Math.abs(p[k + 2] - q[k + 2]));
    if (d > m) m = d;
    if (d > 8) { n++; p[k] = 255; p[k + 1] = p[k + 2] = 0; } else { p[k] = p[k + 1] = p[k + 2] = 225 + (p[k] + p[k + 1] + p[k + 2]) / 25; }
  }
  if (!n) return [0, m, null];
  const c = new OffscreenCanvas(P.width, P.height); c.getContext('2d').putImageData(P, 0, 0);
  const r = new FileReader(), blob = await c.convertToBlob({ type: 'image/png' });
  return [n, m, await new Promise(ok => { r.onload = () => ok(r.result); r.readAsDataURL(blob); })];
};
const shot = async (page, t, file) => {
  await page.evaluate(t => window.seek(t), t);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
};

if (snaps) {
  const page = await open();
  const files = snaps.map(snapFile);
  if (new Set(files).size < files.length) console.warn('--snap 시각이 소수 둘째 자리에서 겹친다. 같은 파일을 덮어쓰므로 --det 비교도 틀린다.');
  for (const [i, t] of snaps.entries()) await shot(page, t, files[i]);
  const cols = snaps.length <= 4 ? 2 : 3;
  const sheet = resolve(dir, 'renders/sheet.png');
  // Windows ffmpeg 는 -pattern_type glob 을 지원하지 않는다. 파일을 입력으로 하나씩 넘긴다.
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.sort().flatMap(f => ['-i', f]),
    '-filter_complex', `concat=n=${files.length}:v=1:a=0,scale=${Math.round(1920 / cols)}:-1,tile=${cols}x${Math.ceil(snaps.length / cols)}`, '-frames:v', '1', sheet]);
  console.log(sheet);
  if (det) {
    // 새 페이지에서 가운데 시각을 먼저 찍은 뒤 같은 시각들을 역순으로 다시 찍는다. seek 밖에 남는 상태나 첫 seek 에 기대는 코드가 있으면 달라진다
    // Chrome 은 앞에 그린 프레임에 따라 기울어진 글자 가장자리와 필터 결과를 조금 다르게 그린다. 승인 영상에서 8 넘게 다른 화소가
    // 수백~천여 개 나온다. seek 밖 상태를 일부러 넣은 시험본은 9만~17만 개였다. 그래서 화면의 0.1% 를 넘을 때 다름으로 본다.
    // 작은 요소 하나의 어긋남(22px 카운터 시험 · 147~1163개)은 이 오차와 화소 수로 구별되지 않는다. 그래서 차이가 있으면
    // 차이 지도(det-t*.png)를 남긴다. 가장자리에 흩어진 빨간 점은 그리기 오차, 덩어리는 요소의 어긋남이다. 처음에는 경고만 한다
    const p2 = await open(), cmp = await browser.newPage(), LIMIT = Math.round(W * H * 0.001);
    await p2.evaluate(t => window.seek(t), DUR / 2);
    await p2.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });  // 가운데 시각을 실제로 한 번 그려 그리기 이력을 첫 페이지와 다르게 만든다
    const diffs = [], detFile = t => snapFile(t).replace(/t(\d[\d.]*\.png)$/, 'det-t$1');
    for (const t of [...snaps].reverse()) {
      await p2.evaluate(t => window.seek(t), t);
      const b = await p2.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      const [n, m, map] = await cmp.evaluate(pixelDiff, [readFileSync(snapFile(t)).toString('base64'), b.toString('base64')]);
      if (map) writeFileSync(detFile(t), Buffer.from(map.split(',')[1], 'base64'));
      diffs.unshift([t, n, m]);
    }
    const bad = diffs.filter(([, n]) => n > LIMIT), small = diffs.filter(([, n]) => n > 0 && n <= LIMIT);
    console.log(bad.length ? `결정성 · 다름 ${bad.map(([t, n, m]) => `t=${t} (8 넘게 다른 화소 ${n}개, 최대 차 ${m})`).join(', ')} · 기준 ${LIMIT}개 · 차이 지도는 renders/snaps/det-t*.png`
      : `결정성 · 같음 (${snaps.length}개 시각, 8 넘게 다른 화소 최대 ${Math.max(...diffs.map(([, n]) => n))}개 · 기준 ${LIMIT}개)`);
    if (!bad.length && small.length) console.log(`결정성 · 작은 차이 ${small.map(([t, n]) => `t=${t} (${n}개)`).join(', ')} · renders/snaps/det-t*.png 차이 지도에서 빨간 덩어리가 있는지 본다`);
    detResult = { result: bad.length ? '다름' : small.length ? '작은 차이' : '같음', times: snaps.length, diff: (bad.length ? bad : small).map(([t, n]) => ({ t, px: n })) };
  }
} else {
  const total = Math.round(FPS * DUR);
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const page = await open();
    for (let f = w; f < total; f += WORKERS) await shot(page, f / FPS, resolve(outDir, `f${String(f).padStart(5, '0')}.png`));
  }));
  console.log(`frames: ${total}`);
}
await browser.close();

// Failed renders keep the previous frame directory intact.
if (!process.exitCode) {
  const backupDir = `${outDir}-previous`;
  const hadPrevious = existsSync(targetDir);
  if (hadPrevious) renameSync(targetDir, backupDir);
  try {
    renameSync(outDir, targetDir);
  } catch (error) {
    if (hadPrevious) renameSync(backupDir, targetDir);
    throw error;
  }
  if (hadPrevious) rmSync(backupDir, { recursive: true, force: true });
  if (snaps) logSnap(dir, detResult); else logRender(dir, Math.round(FPS * DUR), startedAt);
}
