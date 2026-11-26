# 화면 코드 규칙 (seek 패턴)

본보기는 `templates/starter/src/index.html` 이다(가상 앱 소개 14초). 새 영상은 이 파일의 뼈대(글꼴 선언, `#stage`, 도우미 함수, `seek` 의 구조)를 가져와 장면만 새로 쓴다.

## 계약

- `#stage` 는 `video.json` 의 width×height 크기다. `overflow:hidden`.
- `window.seek(t)` 는 t(초)를 받아 그 시각의 화면을 만든다. 같은 t 에는 항상 같은 화면이 나와야 한다.
- 글꼴이 준비되면 `window.seek(0)` 을 부르고 `window.__ready = true` 로 둔다. 렌더러가 이 값을 기다린다.
- `render.mjs` 는 프레임을 순서 없이(4개 페이지가 나눠서) 찍는다. 앞 프레임의 상태에 기대는 코드는 깨진다.

## 금지

- CSS `transition`, `animation`, `setTimeout`, `requestAnimationFrame`, `Date.now()`, 씨앗 없는 `Math.random()`
- seek 밖에 남는 상태 (누적 변수, 한 번만 실행되는 플래그)
- 외부 네트워크 자원 (CDN 스크립트·글꼴). 전부 `assets/` 에 둔다

## 도우미

```js
const cl = x => Math.max(0, Math.min(1, x));
const pr = (t, a, d) => cl((t - a) / d);          // a 초에 시작해 d 초 동안 0→1
const lerp = (a, b, p) => a + (b - a) * p;
const eo = x => 1 - Math.pow(1 - x, 4);           // 감속 (등장)
const ei = x => x * x * x;                        // 가속 (퇴장)
const eio = x => x < .5 ? 8*x*x*x*x : 1 - Math.pow(-2*x + 2, 4) / 2;  // 이동
const back = x => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3*Math.pow(x-1, 3) + c1*Math.pow(x-1, 2); };  // 작은 overshoot (진행 거리의 약 4.5%)
function rise(el, t, a, d = 0.7, dist = 44) { const p = eo(pr(t, a, d)); el.style.opacity = p; el.style.transform = `translateY(${(1-p)*dist}px)`; }
```

- 등장 `rise`, 타일·카드 등장 `pop`, 큰 글자 `slam` 은 본보기에 있다.
- 퇴장은 `1 - pr(t, 끝-0.4, 0.4)` 를 opacity 에 곱한다.

### 톤별 프로필 도우미

`motion-rules.md` 의 `## 톤별 모션 프로필` 에서 쓰는 도우미다. 필요한 것만 복사한다.

```js
// 씨앗 난수 (mulberry32). 같은 seed 는 항상 같은 수열을 낸다. Math.random() 대신 쓴다
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
const hash = (...n) => rng(n.reduce((a, b) => Math.imul(a ^ Math.round(b * 1000), 2654435761), 7))();  // 숫자 몇 개 → 0~1 하나

// stepped · 시간을 fps 칸으로 끊는다. fps 는 영상 fps 의 약수다 (30fps 영상이면 스톱모션 15·10, 픽셀 10·6, 올드 필름 15)
// 1e-6 은 부동소수 오차를 막는다. 없으면 30fps 영상의 15fps 칸이 가끔 3·1 프레임으로 갈린다 (t = 8.2 에서 8.2 * 15 = 122.99999…)
const stepped = (t, fps) => Math.floor(t * fps + 1e-6) / fps;

// expo · 노출표. XS = [[시작초, 끝초, 칸 프레임 수], ...]. 빠른 동작 1, 기본 2, 멈춘 구간 3. 칸은 구간 시작에서 센다. 표 밖은 끊지 않는다
// fps 는 영상 fps 이고 반드시 넘긴다. mg-styles-15 demos/05-cel-boil 의 SCHED 를 t 기준으로 줄였다 (MIT, Copyright (c) 2026 Vincentwei1021)
const expo = (t, XS, fps) => { const x = XS.find(([a, b]) => t >= a && t < b); if (!x) return t; const f = Math.round(t * fps), fa = Math.round(x[0] * fps); return (fa + Math.floor((f - fa) / x[2]) * x[2]) / fps; };

// boil · 칸마다 바뀌는 떨림. 같은 칸 안에서는 값이 같다. 칸 fps 는 영상 fps 의 약수다 (30fps 면 10)
const boil = (t, id, amp = 1.5, fps = 10) => (hash(id, Math.floor(t * fps + 1e-6)) * 2 - 1) * amp;
// boilN · 그림 n 장을 칸마다 돌려 쓴다. 번호를 씨앗(rng)이나 그림 번호로 쓴다. 손그림 영상의 7 + Math.floor(t * 10) % 3 과 같다
// 손그림 영상은 이 번호를 SVG 필터(feTurbulence) seed 로 바꾼다. --det 로 재면 앞 프레임에 따라 화소가 조금 달라졌다(최대 720개, 원인은 나누지 못함). 새 영상은 경로 좌표를 떨게 한다
const boilN = (t, fps = 10, n = 3) => Math.floor(t * fps + 1e-6) % n;

// draw · SVG 경로를 p(0~1)만큼 그린다. 길이는 처음 한 번만 잰다
function drawOn(path, p) {
  const L = path.__len ??= path.getTotalLength();
  path.style.strokeDasharray = L; path.style.strokeDashoffset = L * (1 - p);
}
// hand · 손이 쓰는 속도. 천천히 시작해 빨라졌다가 천천히 끝난다. drawOn 의 진행도에 씌운다
// lemo-opuscar styles/whiteboard/demo/engine/wb.js 의 prog 곡선 (MIT, Copyright (c) 2026 LemoLab)
const hand = u => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.8;
// scheduleDraw · 선 길이에 비례해 [t0, t1] 안에서 선마다 시작·끝 시각을 나눠 p.__s0·p.__s1 에 적는다. 경로의 d 를 정한 뒤 로드 때 한 번 부른다
// 선은 배열 순서대로 가장 먼저 비는 줄(conc 개)에 들어간다. 그래서 시작 시각은 배열 순서를 따른다. minDur 은 짧은 선의 하한(초)
// 선이 너무 많아 minDur 로도 창에 들어가지 않으면 창을 넘는다. 그때는 conc 를 늘린다
// lemo-opuscar styles/engraving/demo/engine/burin.js 의 Ink.schedule 을 줄였다 (MIT, Copyright (c) 2026 LemoLab)
function scheduleDraw(paths, t0, t1, conc = 1, minDur = 0.15) {
  paths = [...paths];
  const len = paths.map(p => p.__len ??= p.getTotalLength());
  const plan = k => { const free = Array(conc).fill(t0); return len.map(l => { const j = free.indexOf(Math.min(...free)), s = free[j]; free[j] = s + Math.max(minDur, l * k); return [s, free[j]]; }); };
  const end = k => Math.max(...plan(k).map(([, e]) => e));
  let lo = 0, hi = 1;
  while (end(hi) < t1 && hi < 1e9) hi *= 2;
  for (let i = 0; i < 60; i++) { const k = (lo + hi) / 2; if (end(k) > t1) hi = k; else lo = k; }  // 끝이 t1 에 오는 초당 길이 배율을 찾는다
  plan(lo).forEach(([s, e], i) => { paths[i].__s0 = s; paths[i].__s1 = e; });
}
// seek 안에서는 drawOn(p, hand(pr(t, p.__s0, p.__s1 - p.__s0))) 만 부른다

// popScale · snap 프로필의 크기 곡선. 진행도 p(0~1)에서 from → peak(최종 크기의 6~10%) → 1. back 은 진행 거리의 약 4.5%(0.6 → 1 크기에 쓰면 최종 크기의 약 1.8%)라 snap 에 쓰지 않는다
// 본보기의 등장 함수 pop(el, t, …)과 이름이 겹치지 않게 popScale 로 부른다. 둘을 한 페이지에 함께 복사해도 된다
const popScale = (p, peak = 1.08, from = 0.6) => p <= 0 ? from : p < .55 ? lerp(from, peak, eo(p / .55)) : lerp(peak, 1, eio((p - .55) / .45));
// snapIn · a 초에 d 초 동안 popScale 로 착지시킨다. extra 에 translate 등을 넘기면 scale 앞에 붙는다
function snapIn(el, t, a, d = 0.2, peak = 1.08, extra = '') {
  el.style.opacity = t < a ? 0 : cl((t - a) / 0.05);
  el.style.transform = `${extra} scale(${popScale(pr(t, a, d), peak)})`;
}

// squash · 착지 진행도 p(0~1)에서 [가로 배율, 세로 배율]. 닿는 순간 눌리고(p 0.22 에서 가로 +15%, 세로 −15%) 튀어 오르며 늘어났다가(p 0.68 에서 세로 약 +6%) 돌아온다
const squash = p => { const q = cl(p), k = Math.sin(2 * Math.PI * q) * (1 - q) * 0.196; return [1 + k, 1 - k]; };

// flicker · a 초에 켜지기 시작해 dur 동안 깜빡인 뒤 1 로 고정. 반환값을 opacity 로 쓴다. fps 는 영상 fps 다 (24fps 영상이면 24 를 넘긴다)
const flicker = (t, a, seed, dur = 0.3, fps = 30) => t < a ? 0 : t >= a + dur ? 1 : (hash(seed, Math.floor((t - a) * fps + 1e-6)) > 0.45 ? 1 : 0.15);

// parallax · 깊이 depth(0=멀다, 1=가깝다) 층의 이동량. drift 프로필에서만 등속을 허용한다
const parallax = (depth, t, speed = 120) => -t * speed * (0.2 + 0.8 * depth);
```

### 도형 변형 도우미

`motion-rules.md` 의 `### 같은 톤 안의 전환` 에서 쓴다. 점 배열은 `P = [[x, y], ...]` 다.

```js
// 점 맞춤(orient·alignTo·circ)은 mg-styles-15 demos/08-morph 에서 줄여 옮겼다 (MIT, Copyright (c) 2026 Vincentwei1021)
// pathPts · SVG 경로에서 점 n 개를 뽑는다. 로드 때만 부른다. closed 면 끝점을 겹치지 않게 고르게 나눈다
const pathPts = (path, n, closed = true) => { const L = path.getTotalLength(); return Array.from({ length: n }, (_, i) => { const q = path.getPointAtLength(L * i / (closed ? n : n - 1)); return [q.x, q.y]; }); };
// resamplePts · 점 배열을 둘레 길이 기준으로 n 개로 다시 나눈다. closed 면 마지막 변(끝 → 처음)도 포함한다. 열린 선은 n 이 2 이상이어야 한다
// 손그림 영상의 resample(pts) 와 인자가 달라서 이름을 나눴다
function resamplePts(P, n, closed = true) {
  const Q = closed ? [...P, P[0]] : P, d = [0];
  for (let i = 1; i < Q.length; i++) d.push(d[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
  const L = d[d.length - 1], out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const s = L * k / (closed ? n : n - 1);
    while (j < Q.length - 1 && d[j] < s) j++;
    const u = (s - d[j - 1]) / ((d[j] - d[j - 1]) || 1);
    out.push([lerp(Q[j - 1][0], Q[j][0], u), lerp(Q[j - 1][1], Q[j][1], u)]);
  }
  return out;
}
// orient · 닫힌 모양의 감는 방향을 하나로 맞춘다 (신발끈 넓이가 음수면 뒤집는다)
const orient = P => { let a = 0; P.forEach(([x, y], i) => { const [u, v] = P[(i + 1) % P.length]; a += x * v - u * y; }); return a < 0 ? [...P].reverse() : P; };
// alignTo · B 의 첫 점을 돌려 A 와의 점 거리 제곱합이 가장 작은 순서로 맞춘다. 닫힌 모양끼리 바꿀 때 꼬임을 막는다
function alignTo(A, B) {
  if (A.length !== B.length) throw new Error(`alignTo · 두 모양의 점 수가 다르다 (${A.length}, ${B.length})`);
  let best = 0, bd = Infinity;
  for (let s = 0; s < B.length; s++) { let e = 0; for (let i = 0; i < A.length && e < bd; i++) { const [x, y] = B[(i + s) % B.length]; e += (x - A[i][0]) ** 2 + (y - A[i][1]) ** 2; } if (e < bd) { bd = e; best = s; } }
  return B.map((_, i) => B[(i + best) % B.length]);
}
const lerpP = (A, B, p) => A.map(([x, y], i) => [lerp(x, B[i][0], p), lerp(y, B[i][1], p)]);
// circ · 모양이 크게 다를 때 거쳐 가는 원. A → circ → B 로 두 번 나눠 바꾼다
const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n - Math.PI / 2), cy + r * Math.sin(2 * Math.PI * i / n - Math.PI / 2)]);
const toD = (P, closed = true) => 'M' + P.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + (closed ? 'Z' : '');
// settle · 사건 뒤 감쇠 흔들림. evs = [[시각, 세기], ...]. 착지·충돌 뒤의 크기나 회전에 더한다
// ClaudeAnimationBase src/core.js 의 spring·ring 을 [시각, 세기] 목록으로 바꿨다 (MIT, Copyright (c) 2026 John Heibel)
const settle = (t, evs, k = 6, w = 18) => evs.reduce((s, [t0, A]) => s + (t < t0 ? 0 : A * Math.exp(-k * (t - t0)) * Math.sin(w * (t - t0))), 0);
```

- 재표본·정렬은 로드 때 한 번 한다. 순서는 `orient(resamplePts(pathPts(...)))` 를 두 모양에 하고, 뒤 모양에 `alignTo(앞, 뒤)` 를 한다. seek 는 `lerpP` 와 `toD` 만 부른다.
- 두 모양의 점 수는 같아야 한다. 아이콘은 120~240개면 충분하다.
- 하위 경로(M…Z)가 하나인 모양만 다룬다. 구멍이 있거나 조각이 여러 개인 아이콘은 `getPointAtLength` 가 조각 사이를 건너뛰어 다리 선이 생긴다. 그런 모양은 하위 경로마다 따로 변형하거나 가장 큰 조각만 변형한다.
- 변형하는 경로를 선으로 그려 보일 때는 `pathLength="1"` 을 주고 `strokeDasharray = 1`, `strokeDashoffset = 1 - p` 로 쓴다. `drawOn` 의 길이 캐시(`__len`)는 모양이 바뀌면 틀린다.

### 월드 카메라

`motion-rules.md` 의 `## 원테이크 (이야기 방식)` 에서 쓴다. 큰 월드 한 장(`#world`)을 카메라 하나로 훑는다.

```html
<div id="stage">
  <div id="world"></div>                 <!-- 월드 층 · 5760×3240, transform-origin:0 0 -->
  <div id="cond" class="fine">…</div>    <!-- 화면 층 · 카메라 밖. 조건 표기는 여기 -->
</div>
```

```js
// 콜라주 영상의 CAM_KEYS·camPose·camAt 을 넓혔다. 키 [t, 세계 x, 세계 y, 화면 x, 화면 y, 배율, 회전 deg, ease]
// 그 시각에 세계 점 (x, y) 가 화면 점에 온다. ease 는 앞 키에서 이 키로 오는 곡선 · 'eio'(기본) 'eo' 'ei' 'lin' 'cut' 'mono'
// monotone · 단조 3차 보간 (Fritsch–Carlson). 끝 기울기는 0 으로 둔다(원본은 이웃 구간 기울기). 그래서 'mono' 묶음은 멈춘 채 시작하고 멈춘 채 끝난다
// from lemo-opuscar core/lib.js (MIT, Copyright (c) 2026 LemoLab)
function monotone(xs, ys) {
  const n = xs.length, d = [], m = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return t => {
    if (t <= xs[0]) return ys[0]; if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2*u3 - 3*u2 + 1) * ys[i] + (u3 - 2*u2 + u) * h * m[i] + (-2*u3 + 3*u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}
const CAM_EASE = { eio, eo, ei, lin: x => x };
// 배율은 로그로 보간한다 · Math.exp(lerp(Math.log(a), Math.log(b), q)). 같은 시간에 같은 비율로 줄고 는다
// from mg-styles-15 demos/19-paperclip (MIT, Copyright (c) 2026 Vincentwei1021)
const camVec = k => [k[1], k[2], k[3], k[4], Math.log(k[5]), k[6]];
// 'mono' 가 이어진 키 묶음마다 차원별 곡선을 로드 때 한 번 만든다. [시작 t, 끝 t, 곡선 6개]
const camMono = K => {
  const runs = [];
  for (let i = 1; i < K.length; i++) {
    if (K[i][7] !== 'mono') continue;
    let j = i; while (K[j + 1]?.[7] === 'mono') j++;
    const ks = K.slice(i - 1, j + 1), xs = ks.map(k => k[0]);
    runs.push([xs[0], xs[xs.length - 1], [0, 1, 2, 3, 4, 5].map(d => monotone(xs, ks.map(k => camVec(k)[d])))]);
    i = j;
  }
  return runs;
};
function camPose(t) {
  const K = CAM_KEYS; if (t <= K[0][0]) return camVec(K[0]);
  let i = K.length - 1; while (i > 0 && K[i][0] > t) i--;
  if (i === K.length - 1) return camVec(K[i]);
  const A = K[i], B = K[i + 1], e = B[7] || 'eio';
  if (e === 'cut' || B[0] <= A[0]) return camVec(A);
  if (e === 'mono') return CAM_MONO.find(([a, b]) => t >= a && t <= b)[2].map(f => f(t));
  const q = CAM_EASE[e](cl((t - A[0]) / (B[0] - A[0]))), a = camVec(A), b = camVec(B);
  return a.map((v, d) => lerp(v, b[d], q));
}
function camAt(t) {
  const [wx, wy, sx, sy, ls, rot] = camPose(t), s = Math.exp(ls), a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  const tx = sx - s * (c * wx - sn * wy), ty = sy - s * (sn * wx + c * wy);
  return { t, s, rot, tx, ty,
    css: `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) rotate(${rot.toFixed(4)}deg) scale(${s.toFixed(5)})`,
    toScreen: (X, Y) => [tx + s * (c * X - sn * Y), ty + s * (sn * X + c * Y)],
    toWorld: (x, y) => { const dx = (x - tx) / s, dy = (y - ty) / s; return [c * dx + sn * dy, -sn * dx + c * dy]; } };
}
// 세계 사각형 [x0, y0, x1, y1] 이 화면(여백 m) 밖이면 false. 화면 밖 정거장을 display:none 으로 거른다
function onScreen(C, [x0, y0, x1, y1], m = 80) {
  const P = [C.toScreen(x0, y0), C.toScreen(x1, y0), C.toScreen(x0, y1), C.toScreen(x1, y1)];
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return Math.max(...xs) > -m && Math.min(...xs) < 1920 + m && Math.max(...ys) > -m && Math.min(...ys) < 1080 + m;
}
// 월드 층 글자 · 화면 크기(CSS 크기 × 배율)가 24px 아래면 숨기고 26px 에서 다 보인다
const fitOp = (el, C) => cl((el.__fs * C.s - 24) / 2);

// 쓰는 예 · 정거장에서 멈추고, 둘째 이동은 가운데 점을 멈추지 않고 지나고, 끝에 물러났다가 돌아온다
const CAM_KEYS = [
  [1.5,  800, 1000,  960, 760, 1.0, 0],              // 정거장 1 (세계 800,1000 이 화면 960,760 에)
  [2.3,  800, 1000,  960, 760, 1.0, 0],              // 결과 정지
  [5.9,  2000, 2300, 960, 320, .92, 0, 'eio'],       // 정거장 2
  [6.7,  2000, 2300, 960, 320, .92, 0],
  [8.45, 2550, 1600, 960, 540, .80, 0, 'mono'],      // 지나가는 점
  [10.3, 3100, 900,  960, 760, 1.05, 0, 'mono'],     // 정거장 3
  // …
  [22.9, 5000, 1100, 1596, 384, .30, 0, 'eio'],      // 공개 · 마지막 정거장을 기준점으로 물러난다
  [25.4, 5000, 1100, 1596, 384, .30, 0],
  [28.6, 5000, 1100, 960, 760, 1.0, 0, 'eio'],       // 마지막 정거장으로 돌아온다
];
const CAM_MONO = camMono(CAM_KEYS);   // 키를 정한 뒤 로드 때 한 번
window.seek = function (t) {
  const C = camAt(Math.min(t, 29.0));   // 끝 1초 정지
  $('world').style.transform = C.css;
  for (const o of STATIONS) { const on = onScreen(C, o.box); o.el.style.display = on ? '' : 'none'; if (!on) continue; /* 반응 */ }
  for (const e of KO) e.style.opacity = fitOp(e, C);   // 다른 opacity 가 있으면 곱한다
};
document.fonts.ready.then(() => { KO.forEach(e => e.__fs = parseFloat(getComputedStyle(e).fontSize)); window.seek(0); window.__ready = true; });
```

- 키 하나는 "그 시각에 세계 점 (x, y) 가 화면 점 (sx, sy) 에 온다"는 뜻이다. 멈춤은 값이 같은 키 두 개로 만든다.
- 줌 구간은 두 키의 세계 점을 같게 둔다. 그 점(기준점)은 화면에서 곧게 움직이고, 나머지는 그 점을 중심으로 커지거나 줄어든다. 공개 구도에서 기준점의 화면 자리는 `960 + s·(x − 월드 가운데 x)`, `540 + s·(y − 월드 가운데 y)` 다.
- 배율은 로그로 보간한다. 1.0 → 0.3 줌을 0.1초 간격으로 쟀다. `lin` 곡선에서 로그 보간은 비율이 1.0409 로 일정했다. 선형 보간은 1.0239~1.0778 로 뒤로 갈수록 빨라졌다. `eio` 곡선에서 로그 보간은 앞·뒤 절반의 변화(로그 합)가 0.602·0.602 로 같았다. 선형 보간은 0.431·0.773 이었다.
- `'mono'` 가 이어진 키는 멈추지 않고 지난다. 묶음의 처음과 끝은 멈춘 채 붙는다. 시험에서 카메라는 가운데 점을 프레임당 세계 21px 로 지났고, 배율은 0.800 아래로 내려가지 않았다. 키가 둘뿐인 `'mono'` 는 smoothstep 과 같다. 묶음 안의 키 시각은 모두 달라야 한다.
- `#world` 에는 `transform-origin:0 0` 을 준다. 없으면 배율이 월드 가운데를 기준으로 걸려 `toScreen` 이 화면과 어긋난다.
- 화면 밖 정거장은 `onScreen` 으로 `display:none` 한다. 이 함수에는 1920·1080 이 박혀 있다. 세로 영상이면 두 수를 바꾼다.
- 월드 층 한국어 글자에는 `class="ko"` 를 준다. 글꼴이 로드된 뒤 `__fs` 를 한 번 잰다.
- 조건 표기·자막 같은 화면 층은 `#world` 밖에 둔다.
- 콜라주 영상은 망점 모아레를 줄이려고 `tx`·`ty` 를 반올림한다. 줌 중에 반올림하면 화면이 1px 씩 떨린다. 그래서 이 판은 반올림하지 않는다.
- 시험 페이지에서 `--det` 는 '같음'이었다(12개 시각). 주인공 지름(CSS 60 × 배율)은 공개 장면을 빼면 48~63px(지나는 점 배율 0.8 에서 48px)였고, 공개(배율 0.3)에서는 18px 였다. 공개 장면에서 24px 미만인데 보이는 한국어 글자는 0개였다. 실제 영상에서는 아직 쓰지 않았다.

### 카툰 연기 도우미

`motion-rules.md` 의 `### 캐릭터 연기 (카툰 톤)` 에서 쓴다. 부속물(모자·안테나·꼬리)의 흔들림은 위의 `settle(t, evs)` 를 쓴다. 원본의 `spring` 은 따로 옮기지 않는다.

```js
// 카툰 연기 · src/core.js 의 arcPt·jump·take 와 src/clawd.js 의 emotions() 를 옮겼다. 원본의 ease(smoothstep) 는 eio 로 바꿨다
// from ClaudeAnimationBase (MIT, Copyright (c) 2026 John Heibel)
// 원본은 세 곳(이륙·착지·take 시작)에서 값을 한 프레임에 바꾼다. 여기서는 2프레임(SNAP)에 eio 로 잇고 그 뒤에 원본 곡선을 붙인다. 극값은 같고 뒤 흔들림이 2프레임 늦다
// sq 는 찌그러짐이다. 양수가 눌림, 음수가 늘어남. 몸에는 발끝 기준 scale(1 + sq*.6, 1 - sq) 로 쓴다
// dy 는 몸 단위 u(몸 높이의 1/10)다. 음수가 위다. 화면 px 은 dy * u
const SNAP = 1 / 15;
const backOut = x => 1 + 2.9 * Math.pow(cl(x) - 1, 3) + 1.9 * Math.pow(cl(x) - 1, 2);   // 자세 overshoot 약 12%. back 보다 크다
// arcPt · p0 에서 p1 로 던지거나 뛸 때 진행도 k(0~1)의 점. h 는 직선 위로 솟는 높이(px)
const arcPt = (p0, p1, h, k) => [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k) - h * 4 * k * (1 - k)];
// jump · t0 에 뛰어 t1 에 내린다. 0.12초 웅크림 → 이륙에서 늘어남 → 꼭대기에서 둥긂 → 착지에서 눌렸다가 흔들리며 돌아옴. h 는 몸 단위
function jump(t, t0, t1, h = 3) {
  if (t < t0 - .12) return { dy: 0, sq: 0 };
  if (t < t0) return { dy: 0, sq: .18 * eio(pr(t, t0 - .12, .12)) };
  if (t < t1) { const k = (t - t0) / (t1 - t0), q = cl((t - t0 - SNAP) / (t1 - t0 - SNAP)); return { dy: -h * 4 * k * (1 - k), sq: lerp(.18, -.16 * Math.abs(1 - 2 * q), eio(pr(t, t0, SNAP))) }; }
  const a = Math.max(0, t - t1 - SNAP); return { dy: 0, sq: lerp(-.16, .22 * Math.exp(-8 * a) * Math.cos(20 * a), eio(pr(t, t1, SNAP))) };
}
// take · t0 에 놀란다. 0.1초 찌그러진 뒤 크게 늘어나며 솟았다가 흔들리며 돌아온다. amt 는 크기(감정 표의 take)
function take(t, t0, amt = 1) {
  if (t < t0 - .1) return { sq: 0, dy: 0 };
  if (t < t0) return { sq: .12 * amt * eio(pr(t, t0 - .1, .1)), dy: 0 };
  const a = Math.max(0, t - t0 - SNAP), k = eio(pr(t, t0, SNAP));
  return { sq: lerp(.12 * amt, -.26 * amt * Math.exp(-6 * a) * Math.cos(16 * a), k), dy: k * -1.2 * amt * Math.exp(-7 * a) * Math.max(0, Math.cos(9 * a)) };
}
// emotions · 감정 키 [[t, 이름], ...] 에서 시각 t 의 표정과 자세
// 다음 감정 0.1초 전부터 눈을 감는다. 감긴 프레임(키 시각)에 눈·입을 바꾸고 0.14초 안에 뜬다. squint 가 .8 을 넘으면 감은 눈을 그린다
// 바뀐 순간 새 감정 크기의 take 가 나간다. 자세는 0.4초(backOut), 색은 0.3초(eio)에 옮겨 간다
// EMO[이름] = { eyes, mouth, col: [r, g, b], take, body: t => ({ dy, sq, aL, aR }) }. aL·aR 은 팔 각도(라디안, + 가 올림)
function emotions(t, keys, EMO) {
  let i = 0; while (i + 1 < keys.length && t >= keys[i + 1][0]) i++;
  const tc = keys[i][0], age = t - tc, E = EMO[keys[i][1]], tn = i + 1 < keys.length ? keys[i + 1][0] : Infinity;
  const cur = { eyes: E.eyes, mouth: E.mouth, col: E.col, ...E.body(t) };
  let squint = 0;
  if (tn - t < .1) squint = 1 - (tn - t) / .1;
  if (i > 0 && age < .14) squint = Math.max(squint, 1 - age / .14);
  if (i > 0) {
    const P = EMO[keys[i - 1][1]], prev = P.body(t), k = backOut(age / .4), kc = eio(cl(age / .3)), tk = take(t, tc, E.take);
    for (const f of ['dy', 'sq', 'aL', 'aR']) cur[f] = lerp(prev[f], cur[f], k);
    cur.col = P.col.map((v, j) => lerp(v, E.col[j], kc));
    cur.sq += tk.sq; cur.dy += tk.dy;
  }
  if (tn < Infinity) { const tk = take(t, tn, EMO[keys[i + 1][1]].take); cur.sq += tk.sq; cur.dy += tk.dy; }   // 다음 take 의 예비 찌그러짐
  cur.squint = squint;
  return cur;
}

// 감정 표 예 · 몸짓 수치는 원본 EMO 의 neutral·surprised·happy 다. 눈·입 이름과 색은 영상마다 새로 정한다
// 몸짓은 음악 박자에 묶인다. 박은 beats.js 의 beat(다듬은 BPM), 위상은 첫 마디 첫 박(downbeats[0])에서 잰다
const BPM = window.BEATS?.beat ?? window.BEATS?.bpm ?? 100, B0 = window.BEATS?.downbeats?.[0] ?? 0;
const beat = t => { const bp = (t - B0) * BPM / 60, s1 = Math.sin(bp * Math.PI); return { s1, ab: Math.abs(s1), s2: Math.sin(bp * 2 * Math.PI), hit: Math.exp(-(bp - Math.floor(bp)) * 6) }; };
const EMO = {
  neutral:   { eyes: 'dot',   mouth: 'flat',  col: [126, 190, 176], take: .3, body: t => { const b = beat(t); return { dy: -.25 * b.ab, sq: .03 * b.hit, aL: .15 + .05 * b.s1, aR: .15 - .05 * b.s1 }; } },
  surprised: { eyes: 'wide',  mouth: 'O',     col: [242, 205, 96],  take: 1.3, body: t => { const b = beat(t); return { dy: -.3 - .15 * b.ab, sq: -.12, aL: 1.1 + .05 * b.s2, aR: 1.1 - .05 * b.s2 }; } },
  happy:     { eyes: 'happy', mouth: 'smile', col: [240, 150, 172], take: .6, body: t => { const b = beat(t); return { dy: -1.2 * b.ab, sq: .1 * b.hit, aL: .4 + .4 * b.s1, aR: .4 - .4 * b.s1 }; } },
};
const KEYS = [[0, 'neutral'], [2, 'surprised'], [4, 'happy']];   // 시각은 내레이션 시각을 프레임에 맞춘 값 · Math.round(t * 30) / 30
const U = 40;   // 몸 단위 px
window.seek = function (t) {
  const p = emotions(t, KEYS, EMO), closed = p.squint > .8, z = closed ? 0 : p.squint;
  root.setAttribute('transform', `translate(960 ${940 + p.dy * U}) scale(${1 + p.sq * .6} ${1 - p.sq})`);   // root 의 원점은 발끝
  eyes.setAttribute('transform', `translate(0 -250) scale(${1 + z * .15} ${1 - z})`);                  // 감는 중에는 눈 묶음을 납작하게
  show(eyeL, closed ? 'closed' : p.eyes); show(eyeR, closed ? 'closed' : p.eyes); show(mouth, p.mouth);  // show · data-k 가 같은 자식만 켠다
  armL.setAttribute('transform', `translate(-186 -230) rotate(${p.aL * 180 / Math.PI})`);              // 왼팔은 시계 방향이 올림
  armR.setAttribute('transform', `translate(186 -230) rotate(${-p.aR * 180 / Math.PI})`);
  body.setAttribute('fill', `rgb(${p.col.map(Math.round).join(',')})`);
};
```

- 원본은 이륙·착지·take 시작에서 값을 한 프레임에 바꾼다. node 로 잰 경계 좌우 차는 jump 이륙 sq 0.34, 착지 sq 0.38, take(amt 1.3) 시작 dy 1.56·sq 0.49 였다. 이 판은 세 곳을 2프레임에 잇고 원본 곡선을 2프레임 늦게 붙인다. 그래서 경계 차가 0 이다. 극값(착지 눌림 0.22, take 늘어남 −0.338, 솟음 −1.56)은 원본과 같다. 키 시각이 프레임 위에 있으면 30fps 프레임당 최대 변화가 절반으로 준다(jump sq 0.359 → 0.190, take dy 1.56 → 0.78). 키가 프레임 사이에 있으면 거의 줄지 않는다(16.7ms 어긋나면 jump sq 0.356, take dy 1.46). 그래서 jump·take·감정 키의 시각은 프레임에 맞춘다(`Math.round(t * fps) / fps`). 한 프레임에 붙는 원본의 맛이 필요하면 `SNAP` 을 `1e-6` 으로 둔다.
- jump 의 비행 시간(t1 − t0)은 SNAP(1/15초)보다 길어야 한다.
- 감은 눈은 `squint > .8` 일 때 그린다. 키 시각이 프레임 위에 있으면 그 프레임 하나가 감은 눈이고, 그 프레임에서 눈·입이 바뀐다. 키가 프레임 사이에 있으면 어긋난 정도에 따라 감은 눈이 2프레임 이어지거나, 어긋남이 5ms 안이면 뜬 눈 프레임에서 입이 바뀐다.
- 감정 키 간격은 0.4초 이상 둔다. 자세(0.4초)·색(0.3초)이 다 옮겨 가기 전에 다음 키가 오면 그 키 시각에서 값이 끊긴다.
- `hit` 는 원본처럼 박마다 한 프레임에 1 로 오른다. `beats.js` 에 `beat`·`downbeats` 가 있으면 몸이 실제 박에 맞춰 톡 튄다. (측정 · 세기 0.58 이상인 타격이 박 격자 ±1프레임 안에 드는 수는 `bpm` 줄과 위상 0 으로 잰 격자에서 첫 작업 영상 0/14, 관광 영상 0/20 이었고, `beat`·`downbeats[0]` 격자에서 10/14, 20/20 이었다. 엇박 타격은 격자 밖에 남는다) `cut`·`repeat` 의 길이가 마디의 정수배가 아니면 그 뒤로 격자가 어긋난다. 없으면 `bpm` 줄 값과 위상 0 으로 튀어서 박과 맞지 않는다.
- 두 팔은 `a ± b·sin` 꼴로 반대 위상이다. 시험에서 세 감정 모두 aL·aR 상관이 −1.000 이었다. 감정 전환의 눈 감김은 원본처럼 두 눈이 함께 감는다. 평소 깜빡임을 따로 넣으면 두 눈을 1~2프레임 어긋나게 한다.
- 시험 캐릭터에서 `--det` 는 '같음'이었다(12개 시각). 시험 페이지의 디버그 글자(시스템 monospace)를 켜면 그 글자 가장자리만 달라져 '다름'이 나왔다. 화면 글자는 프로젝트 글꼴만 쓴다. 실제 영상에서는 아직 쓰지 않았다.

### 박자 도우미

`src/beats.js` 가 있을 때만 쓴다. 만드는 법은 `motion-rules.md` 의 `## 음악 박자 맞춤`.

```js
const BEAT_MIN = 0.6;  // 큰 타격 기준. 곡마다 정점 구간 값을 보고 정한다
const BEAT = (window.BEATS?.onsets ?? []).filter(([, v]) => v >= BEAT_MIN).map(([b]) => b);  // 큰 타격
const SOFT = (window.BEATS?.onsets ?? []).map(([b]) => b);                                // 모든 타격
const KICK = window.BEATS?.kicks ?? [];                                                    // 킥(큰 타격 가운데 120Hz 아래 비율 0.5 이상)
const lastBeat = (t, list) => { let b = -Infinity; for (const x of list) { if (x > t) break; b = x; } return b; };
const beatHit = (t, decay = 0.25) => cl(1 - (t - lastBeat(t, BEAT)) / decay);             // 큰 타격 직후 1 → 0
const beatPulse = (t, decay = 0.12) => cl(1 - (t - lastBeat(t, SOFT)) / decay);           // 작은 떨림용
const snapToBeat = (at, list = SOFT, tol = 0.15) => { let best = at, d = tol; for (const b of list) if (Math.abs(b - at) <= d) { best = b; d = Math.abs(b - at); } return best; };
```

- `snapToBeat` 은 장면 시각 상수를 정할 때 한 번 부른다. seek 안에서 매번 부르지 않아도 된다.
- `BEATS` 의 시각은 모두 영상 시각이다. `onsets` 는 [시각, 세기], `beat` 는 downbeats 줄의 다듬은 BPM, `downbeats` 는 마디 첫 박, `kicks` 는 킥이다. 큰 타격 반응을 킥에만 걸려면 `lastBeat(t, KICK)` 을 쓴다. `beat`·`downbeats`·`kicks` 는 `--write` 를 다시 실행해야 생긴다.

### 질감 층

- 종이 질감은 `vendor/paper/texture.js` 의 `texTile` 을 복사해 쓴다. 파일 없이 씨앗으로 한 번 만든다. 함수 밖의 `_tiles` 와 `rng` 도 함께 복사한다.
- 그레인은 같은 파일(`vendor/paper/texture.js`)의 `grainLayer` 를 쓴다. 기본값은 15fps 로 타일이 바뀌는 soft-light 층이다. 콜라주·올드 필름은 기본값 그대로 쓴다.
- 손그림·수묵은 그레인을 멈춘다. `grainLayer` 가 돌려주는 update 를 늘 `0` 으로 부른다. blend 는 soft-light 그대로 둔다. 타일이 평균 128 회색이라 multiply 로 바꾸면 화면이 약 17% 어두워진다.
- `grainLayer` 는 크기를 1920×1080 으로 박아 두었다. 세로 영상(1080×1920)에 쓰려면 감싸개와 비네트의 크기를 바꾼다.
- 그레인 위에서도 24px 작은 안내와 조건 표기의 대비가 남는지 스냅을 확대해 본다.

## seek 의 구조

```js
window.seek = function (t) {
  // 1. 배경
  // 2. 장면을 건너가는 요소 (제품 이미지의 위치·크기 키프레임, 포인트 점)
  // 3. 장면별 블록: 보이는 시간대에만 display 를 켜고 그 안에서 값을 계산한다
  const sc2 = $('sc2'); sc2.style.display = (t >= 5.0 && t < 10.9) ? '' : 'none';
  if (t >= 5.0 && t < 10.9) { /* rise(...), 숫자 계산, 퇴장 */ }
};
```

- 장면 시각 상수는 `video.json` 의 내레이션 시각과 같은 값을 쓴다. 대사를 다시 만들면 여기도 고친다.
- 장면을 건너가는 요소는 키프레임 배열 `[t, x, y, scale, rot, ease]` 하나로 관리한다 (`CARD_KEYS`, `cardCam`).
- 반복 요소(타일·칩·달력 칸)는 배열에서 DOM 을 한 번 만들고, 배열의 시각으로 등장시킨다.
- 마지막 구간은 `const tv = Math.min(t, 끝-1.2)` 처럼 시간을 멈춰 화면을 정지시킨다.

## canvas 손그림

손그림·수묵·판화 톤에서 떨리는 선·해칭·연필 채움·점묘·붓 선·수채를 canvas 2D 로 그릴 때 쓴다. SVG 경로 몇 개로 되면 `drawOn`·`boil` 로 충분하다. 그때는 쓰지 않는다.

1. `cp vendor/handdrawn/hand.js videos/<id>/assets/` 로 복사하고 `<script src="../assets/hand.js"></script>` 로 읽는다. 전역 `HAND` 가 생긴다. 함수와 인자는 `vendor/handdrawn/README.md` 에 있다.
2. canvas 는 `#stage` 안에 하나 둔다. 글자는 canvas 에 그리지 않는다. 그 위 DOM 층에 쓴다. 글꼴은 `motion-rules.md` 의 `## 글자` 를 따른다.

```js
const { ink, paint, ribbon, wobble } = HAND;
const ctx = $('cv').getContext('2d');
const paper = document.createElement('canvas'); paper.width = 1920; paper.height = 1080;  // 떨지 않는 층은 로드 때 한 번 그린다
window.seek = function (t) {
  const B = boilN(t);                       // 떨림 칸 번호. 떨지 않는 요소는 B = 0
  ctx.clearRect(0, 0, 1920, 1080);
  ctx.drawImage(paper, 0, 0);
  paint(ctx, FACE, { key: 'face', B, fill: '#f0c55a', tex: [{ k: 'hatch', angle: 0.3, gap: 9 }] });
  ink(ctx, LINE, { key: 'l1', B, frac: hand(pr(t, 1, 0.8)) });
  ribbon(ctx, wobble(BRUSH, false, 1.6, 'br', B), u => 4 + 30 * Math.sin(Math.PI * u) ** 0.7);
};
```

- 프레임마다 `clearRect` 뒤 전부 다시 그린다. 시간은 t 에서만, 떨림은 `B` 에서만 가져온다.
- `key` 는 요소마다 다르게 준다. 줄의 자리·개수는 `key` 로 정하고, 칸마다 바뀌는 흔들림은 `key + B` 로 정한다. 그래서 `paint` 로 그리면 칸이 바뀌어도 해칭 줄 수는 그대로다. `hatch`·`pencil`·`stipple` 을 직접 부를 때는 떨지 않은 모양을 넘긴다.
- `boil` 프로필의 떨림 폭(1~2px)은 `amt` 로 준다. 기본값은 `ink` 1.8, `paint` 1.6 이다.
- 종이·단색 바탕·정지한 그림은 로드 때 오프스크린 canvas 에 그린다. seek 는 `drawImage` 만 한다.
- 시험(1920×1080, 해칭 면 3·떨리는 선 10·연필 채움·점묘·ribbon 2·수채 사물 3) · seek 는 1.4~2.1ms, seek + 스크린샷은 중앙값 141~153ms 였다. 같은 boil 칸 안의 프레임은 화소가 같았다(psnr inf). 종이 영역은 모든 프레임에서 같았다. `--det` 에서 8 넘게 다른 화소는 0개였다. 실제 영상에서는 아직 쓰지 않았다. 첫 영상의 6단계 검수 결과를 `vendor/handdrawn/README.md` 의 잰 값에 더한다.

### 수채·붓 판

- 수채로 칠한 사물은 로드 때 `washPlate(w, h, shapeP, { seed, color })` 로 판을 굽는다. 사물마다 seed 를 달리해 3장을 굽는다. seek 는 `plates[boilN(t)]` 를 고르고 놓기만 한다.
- 판은 종이 위에 `ctx.globalCompositeOperation = 'multiply'` 로 놓는다. 그러면 종이 결이 비친다. 놓은 뒤 `'source-over'` 로 되돌린다.
- 배경·종이 판은 1장만 굽고 떨지 않는다.
- "칠해지는" 등장은 판을 다시 칠하지 않는다. `HAND.trace` 로 만든 경로에 `clip` 해서 판을 마스크로 공개한다.
- 수묵은 먹선을 `ribbon` 으로, 먹 번짐을 먹색 `washPlate` 판으로 만든다. 수묵 판은 아직 시험하지 않았다.
- p5.brush 를 프레임마다 쓰지 않는다.
  - WebGL 이 필요하다. GPU 가 없으면 프레임당 초 단위로 느리다.
  - p5.brush 는 로드 때 `Math.random` 으로 씨앗을 둔다. `render.mjs` 의 4개 페이지가 각자 칠하면 판이 달라질 수 있다.
  - PNG 로 한 번 구우면 두 문제가 모두 없어진다.
- `washPlate` 의 질감이 모자라면 p5.brush 로 판을 한 번 칠해 `assets/` 에 PNG 로 굽는다. 이 판단은 완성 뒤의 수정 요청으로만 받는다. 제작 중에 묻지 않는다.
  - 굽는 페이지는 seek 화면과 따로 둔다. p5.js·p5.brush 는 CDN 으로 읽지 않고 파일로 둔다.
  - p5.js 는 LGPL-2.1 이다. 파일을 고치지 않고 원본 그대로 두고, 그 옆에 라이선스 고지를 둔다. p5.brush 의 라이선스는 쓰기 전에 확인한다.

## three.js

3D 톤(크롬·Y2K, 글래스모픽 3D, 시네마틱 3D, 복셀, 사이버펑크)과 클레이·판화·HUD 의 입체판에서만 쓴다. 평면으로 되면 쓰지 않는다.

1. `cp vendor/three/three.min.js videos/<id>/assets/` 로 복사하고 `<script src="../assets/three.min.js"></script>` 로 읽는다. 전역 `THREE` 가 생긴다.
   ES 모듈판(`import`)은 `file://` 에서 막힌다. 이때 오류 문구 없이 30초 timeout 으로만 끝난다(2026-10-26 시험). CDN 은 쓰지 않는다.
2. 렌더러는 `#stage` 안의 `<canvas>` 하나에 만든다.

```js
const gl = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(1); gl.setSize(1920, 1080, false);
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
// 장면 구성(메시·조명)은 seek 밖에서 한 번만 만든다. 위치·회전·재질 값은 seek 안에서 t 로 정한다
window.seek = function (t) {
  // 모든 메시의 position·rotation·scale, 카메라 위치를 t 에서 계산
  gl.render(scene, cam);   // seek 마다 직접 한 번 그린다
};
```

- `preserveDrawingBuffer: true` 가 없으면 스크린샷이 빈 화면이 된다.
- `renderer.setAnimationLoop`, `THREE.Clock`, `AnimationMixer` 의 자체 시간을 쓰지 않는다. 시간은 t 뿐이다. (`mixer.setTime(t)` 처럼 t 를 넣는 방식은 된다)
- seek 마다 모든 물체·조명·카메라 값을 기본값으로 되돌린 뒤 t 로 정한다. 앞 프레임에서 바꾼 값이 남으면 찍는 순서에 따라 화면이 달라진다. 이 규칙을 어긴 시험 페이지는 `--det` 에서 21만~75만 화소가 달랐다. 한 시각은 우연히 같게 나올 수 있으므로 `--det` 는 시각을 여러 개 찍는다.
- 안개(`FogExp2`)를 쓰면 광원 메시(빛 점·빛줄기)에 `fog: false` 를 준다. 재질의 fog 기본값이 true 라서, 주지 않으면 빛의 심이 회색 원으로 잠긴다.
- 빛 번짐(bloom)은 실제 광원에만 약하게, 높은 문턱으로 건다. 발광 방법은 영상 하나에 한 가지만 쓴다. 구운 발광 이미지에 bloom 을 겹치자 광원 둘레가 크게 번졌다. 내장 three.js 에는 후처리 애드온(EffectComposer·UnrealBloomPass)이 없다. 직접 짠 bloom 은 시험에서 `--det` '같음'이었다. 후처리가 필요하면 `### three-looks 키트` 의 `LOOKS.post` 를 쓴다.
- 난수 배치는 `rng(seed)` 로 만든다. 블록 64개 배치를 같은 seed 로 두 번 찍어 PNG 가 같은지 확인했다.
- 글자는 3D 로 만들지 않는다. 3D 캔버스 위에 DOM 글자 층을 올린다. 글꼴 규칙이 그대로 적용된다. 예외는 3D 로 기우는 판 위의 UI 글자다. 이 글자는 `LOOKS.panel` 의 canvas 에 그린다(`### three-looks 키트`).
- 반사 재질(크롬)은 환경맵이 필요하다. `PMREMGenerator` 로 그라데이션 장면을 구워 `scene.environment` 에 넣는다. `LOOKS.env(gl, 'studio'|'strips'|'dome')` 가 이 일을 한다.
- 프레임 시간은 대부분 스크린샷이 차지한다. 2026-10-26 Windows · Intel Arc GPU 에서 잰 값은 3D 시험 장면과 평면 영상 모두 seek + 스크린샷 프레임당 약 150~260ms 였다. WebGL 그리기는 3~11ms(셔터 8회 누적은 44ms)였다. `render.mjs` 의 `webgl ·` 줄에 SwiftShader 가 보이면 소프트웨어 GL 이고, 그때는 2~7배 느렸다. GPU 와 소프트웨어 GL 의 화면 차이(688~946화소)는 `--det` 기준(2,074화소)보다 작아서 섞여도 잡히지 않는다. 한 영상은 한 방식으로만 렌더하고, 장면 하나를 다시 찍을 때도 같은 PC 에서 찍는다. `--snap` 으로 몇 장 찍어 시간을 재고 보고에 적는다.

### three-looks 키트

유리·액체 금속·클레이·망점·홀로그램 재질과 후처리가 필요한 영상만 쓴다. 함수 표와 룩별 조합은 `vendor/three-looks/README.md` 에, 본보기는 `vendor/three-looks/demo/src/index.html` 에 있다.

1. `cp vendor/three-looks/looks.js videos/<id>/assets/` 로 복사하고 `three.min.js` 다음 줄에 `<script src="../assets/looks.js"></script>` 로 읽는다. 전역 `LOOKS` 가 생긴다.
2. 환경맵(`LOOKS.env`)·후처리(`LOOKS.post`)·재질은 seek 밖에서 한 번만 만든다. seek 의 마지막 줄은 `gl.render` 대신 `post.render(scene, cam, t)` 다.
3. 렌더러는 `antialias: false` 로 만든다. 계단 제거는 `post` 의 MSAA(4배)가 한다.

- 재질의 시간 값은 uniform 으로 넣는다. `metal.u.uLmT.value = t`, `tr.u.uP.value = 진행`, `clay.u.uShow.value = 진행`. seek 마다 전부 다시 넣는다.
- 카메라는 `LOOKS.fly(cam, keys, t)` 로 정한다. 장면을 서로 다른 3D 위치에 두고 키를 장면마다 하나씩 둔다. 구간 안의 `drift` 는 0 으로 두지 않는다(`motion-rules.md` 의 시네마틱 3D 카메라 규칙). 카메라만 움직이지 말고 장면 안의 사물도 움직인다.
- 서리 유리(`glass`) 너머로는 불투명 목록의 사물만 비친다. `trail`·`orbs` 는 기본이 불투명 목록이다. 유리보다 앞에 둘 것만 `front:true` 를 준다.
- 판 위의 UI 는 `panel.draw((ctx, W, H) => …)` 로 매 seek 다시 그린다. canvas 글자도 `@font-face` 로 선언한 글꼴만 쓴다. 제목·설명·조건 표기는 DOM 층에 둔다.
- 3D 사물의 이름표는 DOM 으로 만들고 `LOOKS.pin(점, cam, 1920, 1080)` 의 좌표에 놓는다. `pin` 은 카메라를 정한 뒤에 부른다.
- 망점(`halftone`)은 `post` 의 `tone:'none'`, `bloom:0`, `ca:0` 과 함께 쓴다. 톤 매핑이 잉크 색을 바꾸기 때문이다.
- `post.o` 의 `threshold` 는 1 근처로 둔다. 밝은 광원(`trail`·`orbs`·녹는 가장자리)만 번지고 흰 글자·밝은 바탕은 번지지 않는다. 발광 방법은 영상 하나에 한 가지만 쓴다는 위 규칙이 그대로 적용된다.
- 2026-11-10 Mac · Apple M4 에서 시험 페이지의 10개 시각은 `--det` '같음'(다른 화소 0개)이었다. 실제 영상에서는 아직 쓰지 않았다.

## 겪은 함정

- **scale 로 키우는 원** · 2px 원을 `translate(x-r, y-r) scale(r)` 로 키울 때 `transform-origin: 0 0` 이 없으면 원이 엉뚱한 곳에서 커져 화면을 다 덮지 못한다.
- **`#stage *{position:absolute}`** · 문장 안의 `<span>` 까지 절대 위치가 된다. 인라인으로 둘 요소에는 `position:static` 을 준다.
- **숫자로 시작하는 id·class** · CSS 선택자에서 깨진다. 글자로 시작한다.
- **글자 폭** · 한글 SemiBold 한 글자의 폭은 글자 크기의 약 0.92배다. 문구 폭이 화면을 넘지 않는지 계산하고 스냅샷으로 확인한다.
- **칩처럼 폭이 내용에 따라 달라지는 요소** · 글꼴 로드 뒤에 `offsetWidth` 로 한 번 배치한다 (`layoutChips`).
- **canvas** · 프레임마다 `clearRect` 뒤 전부 다시 그린다. 시간은 t 에서만 가져온다.
- **CSS 필터** · `drop-shadow` 는 GPU 캐시 때문에 같은 t 라도 앞 프레임에 따라 화소가 1~2 달라진다(콜라주 영상의 kit.js 의 기록). 그림자는 로드 때 canvas 에 구워 이미지로 깐다. 큰 `blur` 도 같은 위험이 있다고 본다(확인 안 됨).
- **앞 프레임에 따른 화소 차이** · Chrome 은 앞에 그린 프레임에 따라 기울어진 글자 가장자리와 필터 결과를 조금 다르게 그린다. `render.mjs --snap … --det` 로 쟀을 때 승인 영상에서 8 넘게 다른 화소가 수백~1,712개(콜라주 영상)였다. 필터가 없는 첫 작업 영상 도 쉼표 가장자리에서 998개가 나왔다. seek 밖 상태를 넣은 시험본은 9만~17만 개였다. 그래서 `--det` 는 화면의 0.1%(1080p 에서 2,074개)를 넘을 때 다름으로 본다. 22px 카운터 하나를 어긋나게 한 시험본은 147~1,163개로 이 오차와 화소 수로는 구별되지 않았다. 차이 지도(`det-t*.png`)에서는 숫자가 통째로 빨간 덩어리로 보였다.
- **큰 blur·흐린 그라데이션** · 화면 큰 영역에 쓰면 스크린샷이 느리다. 로드 때 canvas 에 한 번 그려 이미지로 움직인다.
- **이미지에서 무늬 뽑기** · 임계값을 정하기 전에 미리보기 이미지를 만들어 눈으로 확인한다. 글자·로고가 섞인 영역은 좌표로 잘라낸다.
- **CSS 의 `display:none` 을 seek 에서 켤 때** · `style.display = ''` 는 인라인 값만 지우므로 CSS 의 `display:none` 이 그대로 남아 요소가 나오지 않는다. `'block'` 처럼 값을 적는다. 채널 소개 영상의 정점 전환에서 화면을 덮는 점이 이 때문에 나오지 않았다.
- **주행 거리계(자리를 굴리는 숫자)** · 값을 빠르게 세면서 자리를 굴리면 반쯤 잘린 글자가 프레임마다 바뀌어 깨져 보였다(인서트 영상의 길이 표시 · 0.9초에 227 줄어듦, `am:32-dataviz-motion` 의 주행 거리계를 옮겼다). 초당 8 넘게 바뀔 때는 정수 칸만 보이고, 감속 끝에서만 굴린다. 끝값은 정수로 둔다. 소수 끝값이면 멈춘 화면에서 자리가 반쯤 굴러간 채로 남는다.
- **라틴 전용 글꼴 안의 한글** · 숫자용 글꼴(Archivo 등 라틴 글자만 든 글꼴) 요소 안에 "분"·"만" 같은 한글을 넣으면 한글이 시스템 글꼴로 대체된다. 채널 소개 3 영상(Windows)에서 막대 이름표 "31.6분"의 "분"이 대체 글꼴로 그려졌고, `--det` 차이 지도에서 그 글자만 통째로 덩어리가 됐다(t=8.9, 1,371화소). `font-family: "AR","PV",sans-serif` 처럼 뒤에 프로젝트의 한국어 글꼴을 함께 적으면 덩어리가 사라졌다. 라틴 전용 글꼴 클래스에는 늘 한국어 글꼴을 이어 적는다.
