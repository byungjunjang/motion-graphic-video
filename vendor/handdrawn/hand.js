// hand.js · canvas 손그림·수채 매체 키트. 전역 window.HAND 를 만든다.
// 모든 함수는 ctx 와 B(떨림 칸 번호)를 인자로 받는다. B 는 호출하는 쪽이 boilN(t) 처럼 정한다. 떨지 않는 요소는 B = 0 으로 둔다.
// 구조 씨앗(key)은 선의 자리·개수를 정하고, 떨림 씨앗(key + B)은 칸마다 바뀌는 흔들림만 정한다. 그래서 paint 로 그리면 칸이 바뀌어도 해칭 줄 수는 그대로다. 질감 함수를 직접 부를 때는 떨지 않은 P 를 넘긴다.
// 점 배열은 P = [[x, y], ...] 다.
(() => {
  const TAU = Math.PI * 2, INK = '#3a2417';
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  // from animate plugins/animate/skills/animate/kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // rngKey · 문자열·숫자 키를 FNV 로 섞어 mulberry32 씨앗으로 쓴다. 같은 키는 늘 같은 수열을 낸다. r(a, b) 는 범위, n(amt) 는 ±amt
  function rngKey(...keys) {
    let h = 2166136261 >>> 0;
    for (const k of keys) {
      const s = String(k);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 124; h = Math.imul(h, 16777619);
    }
    let a = h >>> 0;
    const f = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.r = (lo, hi) => lo + (hi - lo) * f();
    f.n = amt => (f() * 2 - 1) * amt;
    return f;
  }

  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191) · 변을 step px 이하로 나눈다
  function resample(P, closed, step) {
    const out = [], n = P.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = P[i], b = P[(i + 1) % n], k = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    if (!closed) out.push(P[n - 1]);
    return out;
  }
  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191) · 열린 선의 앞 frac 만큼을 자른다
  function subPath(P, frac) {
    let L = 0; for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]);
    let want = L * Math.max(0, Math.min(1, frac));
    const out = [P[0]];
    for (let i = 1; i < P.length; i++) {
      const d = dist(P[i - 1], P[i]);
      if (want >= d) { out.push(P[i]); want -= d; }
      else { const k = want / (d || 1); out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k]); break; }
    }
    return out;
  }
  function bbox(P, pad = 0) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of P) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // wobble · 법선 방향으로 느린 사인 두 개를 더해 손 떨림을 만든다. 씨앗은 (key, B) 라 칸이 바뀔 때만 모양이 바뀐다
  function wobble(P, closed, amt, key, B = 0, step = 7) {
    const Q = resample(P, closed, step), n = Q.length, R = rngKey('wob', key, B);
    const f1 = R.r(0.012, 0.03), f2 = R.r(0.05, 0.1), p1 = R.r(0, TAU), p2 = R.r(0, TAU), sx = R.n(amt * 0.5), sy = R.n(amt * 0.5);
    const out = new Array(n); let s = 0;
    for (let i = 0; i < n; i++) {
      const a = Q[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = Q[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const nx = a[1] - b[1], ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
      if (i) s += dist(Q[i - 1], Q[i]);
      const o = amt * (0.75 * Math.sin(s * f1 + p1) + 0.35 * Math.sin(s * f2 + p2));
      out[i] = [Q[i][0] + nx / l * o + sx, Q[i][1] + ny / l * o + sy];
    }
    return out;
  }
  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191) · 점 사이를 2차 곡선으로 이어 경로를 만든다. 칠하거나 clip 할 때 쓴다
  function trace(ctx, P, closed) {
    ctx.beginPath();
    const n = P.length; if (n < 2) return;
    if (closed) {
      ctx.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
      for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.closePath();
    } else {
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < n - 1; i++) { const p = P[i], q = P[i + 1]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.lineTo(P[n - 1][0], P[n - 1][1]);
    }
  }

  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // ink · 떨리는 선. o: closed, color, w, amt(떨림 px), key, B, alpha, frac(그려진 비율), double(옅은 둘째 선)
  function ink(ctx, P, o = {}) {
    const closed = !!o.closed, key = o.key ?? 'ink', B = o.B ?? 0, amt = o.amt ?? 1.8;
    let Q = wobble(P, closed, amt, key, B), cl = closed;
    if (o.frac != null && o.frac < 1) { if (o.frac <= 0) return Q; Q = subPath(closed ? [...Q, Q[0]] : Q, o.frac); cl = false; }
    ctx.save();
    ctx.strokeStyle = o.color ?? INK; ctx.lineWidth = o.w ?? 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = o.alpha ?? 1;
    trace(ctx, Q, cl); ctx.stroke();
    if (o.double) {
      let Q2 = wobble(P, closed, amt * 1.6 + 0.8, key + '~', B);
      if (o.frac != null && o.frac < 1) Q2 = subPath(closed ? [...Q2, Q2[0]] : Q2, o.frac);   // 둘째 선도 같은 비율만 그린다
      ctx.lineWidth = (o.w ?? 3) * 0.4; ctx.globalAlpha = (o.alpha ?? 1) * 0.55; trace(ctx, Q2, cl); ctx.stroke();
    }
    ctx.restore();
    return Q;
  }

  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // paint · 떨리는 닫힌 모양을 칠하고 질감을 얹고 외곽선을 긋는다. 질감은 떨린 모양으로 자르지만 자리·개수는 떨기 전 모양의 상자로 정한다(칸이 바뀌어도 줄 수가 같다)
  // o: fill, fillAl, tex([{k:'hatch'|'pencil'|'stipple', ...그 함수의 o}]), line(색, false 면 안 그음), w, lineAl, amt, key, B
  function paint(ctx, P, o = {}) {
    const key = o.key ?? 'paint', B = o.B ?? 0, amt = o.amt ?? 1.6, Q = wobble(P, true, amt, key, B), box = bbox(P, 6 + 2 * amt);
    if (o.fill) { ctx.save(); trace(ctx, Q, true); ctx.globalAlpha = o.fillAl ?? 1; ctx.fillStyle = o.fill; ctx.fill(); ctx.restore(); }
    (o.tex ?? []).forEach((t, i) => TEX[t.k](ctx, Q, { B, box, ...t, key: key + ':' + i }));
    if (o.line !== false) {
      ctx.save(); ctx.strokeStyle = o.line ?? INK; ctx.lineWidth = o.w ?? 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = o.lineAl ?? 1;
      trace(ctx, Q, true); ctx.stroke(); ctx.restore();
    }
    return Q;
  }

  // 질감 셋은 P 안쪽으로 clip 해서 그린다. 자리는 key 로, 칸마다 흔들림은 key + B 로 정한다. o.box 가 있으면 자리·개수를 그 상자로 정한다
  const clipTo = (ctx, P, box) => { ctx.save(); trace(ctx, P, true); ctx.clip(); return box ?? bbox(P, 6); };

  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // hatch · 평행 빗금. o: angle(rad), gap, w, color, alpha, jit, dash([최소, 최대] 길이), skip([최소, 최대] 틈), dens((x, y) => 0~1), key, B
  function hatch(ctx, P, o = {}) {
    const bb = clipTo(ctx, P, o.box), key = o.key ?? 'hatch', a = o.angle ?? 0.7, gap = o.gap ?? 7, S = rngKey('hs', key), R = rngKey('hj', key, o.B ?? 0);
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, rad = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + 4;
    const ca = Math.cos(a), sa = Math.sin(a), dens = o.dens, jit = o.jit ?? 0.9, dash = o.dash;
    ctx.beginPath();
    for (let d = -rad; d <= rad; d += gap) {
      const dd = d + S.n(gap * 0.3);
      let u = -rad + (dash ? S.r(0, dash[1]) : 0);
      while (u < rad) {
        const len = dash ? S.r(dash[0], dash[1]) : rad * 2, u2 = Math.min(rad, u + len);
        const mu = (u + u2) / 2, mx = cx + ca * mu - sa * dd, my = cy + sa * mu + ca * dd, p = S();
        if (!dens || p < dens(mx, my)) {
          const e1 = R.n(jit), e2 = R.n(jit);
          ctx.moveTo(cx + ca * u - sa * (dd + e1), cy + sa * u + ca * (dd + e1));
          ctx.lineTo(cx + ca * u2 - sa * (dd + e2), cy + sa * u2 + ca * (dd + e2));
        }
        u = u2 + (dash ? S.r(o.skip?.[0] ?? 3, o.skip?.[1] ?? 12) : 0);
      }
    }
    ctx.strokeStyle = o.color ?? INK; ctx.lineWidth = o.w ?? 1.2; ctx.globalAlpha = o.alpha ?? 0.5; ctx.lineCap = 'round';
    ctx.stroke(); ctx.restore();
  }
  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // pencil · 색연필 짧은 빗금 채움. o: color, w, alpha, angle, len, per(빗금 하나당 넓이 px²), n, max, dens, key, B
  function pencil(ctx, P, o = {}) {
    const bb = clipTo(ctx, P, o.box), key = o.key ?? 'pencil', S = rngKey('ps', key), R = rngKey('pj', key, o.B ?? 0);
    const n = Math.min(o.max ?? 6000, o.n ?? Math.floor((bb.x1 - bb.x0) * (bb.y1 - bb.y0) / (o.per ?? 700)));
    const a = o.angle ?? -0.95, L = o.len ?? 14, dens = o.dens;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = S.r(bb.x0, bb.x1), y = S.r(bb.y0, bb.y1), p = S(), aa = a + S.n(0.22), l = L * (0.5 + S() * 0.7);
      if (dens && p > dens(x, y)) continue;
      const jx = R.n(1.1), jy = R.n(1.1), dx = Math.cos(aa) * l / 2, dy = Math.sin(aa) * l / 2;
      ctx.moveTo(x - dx + jx, y - dy + jy); ctx.lineTo(x + dx + jx, y + dy + jy);
    }
    ctx.strokeStyle = o.color ?? INK; ctx.lineWidth = o.w ?? 1.4; ctx.globalAlpha = o.alpha ?? 0.45; ctx.lineCap = 'round';
    ctx.stroke(); ctx.restore();
  }
  // from animate kit/core.js (MIT, Copyright (c) 2026 cth9191)
  // stipple · 네모 점묘. o: color, alpha, n, size, jit, dens, key, B
  function stipple(ctx, P, o = {}) {
    const bb = clipTo(ctx, P, o.box), key = o.key ?? 'stipple', S = rngKey('ss', key), R = rngKey('sj', key, o.B ?? 0);
    const n = o.n ?? 400, sz = o.size ?? 2.2, dens = o.dens, jit = o.jit ?? 0.8;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = S.r(bb.x0, bb.x1), y = S.r(bb.y0, bb.y1), p = S(), s = sz * (0.6 + S() * 0.8);
      if (dens && p > dens(x, y)) continue;
      ctx.rect(x + R.n(jit), y + R.n(jit), s, s);
    }
    ctx.fillStyle = o.color ?? INK; ctx.globalAlpha = o.alpha ?? 1; ctx.fill(); ctx.restore();
  }
  const TEX = { hatch, pencil, stipple };

  // from mg-styles-15 demos/05-cel-boil/js/engine.js outline·fillPoly (MIT, Copyright (c) 2026 Vincentwei1021)
  // ribbon · 굵기가 변하는 붓 선. wfn(u, s, i, tx, ty) 가 굵기(px)를 돌려준다. u 는 0~1 진행, s 는 시작부터 길이(px)
  // 떨게 하려면 P 를 wobble(P, false, amt, key, B) 로 넘긴다. o: color, alpha, step(재표본 px)
  function ribbon(ctx, P, wfn, o = {}) {
    const pts = resample(P, false, o.step ?? 3), n = pts.length; if (n < 2) return;
    const L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
    const tot = L[n - 1] || 1, Lp = [], Rp = [], ws = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = Math.max(0, wfn(L[i] / tot, L[i], i, tx, ty)) / 2; ws.push(w);
      Lp.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); Rp.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    const poly = [...Lp];
    const cap = (c, a0, w) => { if (w < 0.6) return; for (let k = 1; k < 8; k++) { const a = a0 - Math.PI * k / 8; poly.push([c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w]); } };
    cap(pts[n - 1], Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]) + Math.PI / 2, ws[n - 1]);  // 끝 둥근 마개
    for (let i = n - 1; i >= 0; i--) poly.push(Rp[i]);
    cap(pts[0], Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) - Math.PI / 2, ws[0]);  // 시작 둥근 마개
    ctx.save(); ctx.beginPath(); poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = o.color ?? INK; ctx.globalAlpha = o.alpha ?? 1; ctx.fill(); ctx.restore();
  }

  // washPlate · 수채 판. 낮은 불투명도의 떨리는 채움을 layers 겹 쌓고, 몇 겹마다 옅은 테두리를 그어 번진 가장자리를 흉내 낸다
  // 겹마다 모양 안에 둥근 얼룩(blot 개)을 더 칠해 안쪽 농도를 고르지 않게 한다
  // 로드 때 한 번 굽고 seek 는 drawImage 만 한다. 같은 사물의 변형 3장은 seed 만 달리해 만든다. 종이 위에는 multiply 로 놓으면 종이 결이 비친다
  // shapeP 는 판 좌표(0~w, 0~h)다. o: seed, layers(20~40), alpha(겹마다), color, edge(테두리 불투명도), spread(번짐 px), rough(가장자리 거칠기 px), blot
  function washPlate(w, h, shapeP, o = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), seed = o.seed ?? 1, n = o.layers ?? 30, a = o.alpha ?? 0.04, amt = o.spread ?? 6, rough = o.rough ?? amt * 0.15;
    const R = rngKey('wash', seed), bb = bbox(shapeP), sz = Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0);
    const cx = shapeP.reduce((s, p) => s + p[0], 0) / shapeP.length, cy = shapeP.reduce((s, p) => s + p[1], 0) / shapeP.length;
    x.fillStyle = x.strokeStyle = o.color ?? '#5b8fb9'; x.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const k = 1 + R.n(0.03), dx = R.n(amt * 0.5), dy = R.n(amt * 0.5);
      const Q = wobble(shapeP.map(([px, py]) => [cx + (px - cx) * k + dx, cy + (py - cy) * k + dy]), true, amt, 'wash' + seed + ':' + i, 0, 5)
        .map(([px, py]) => [px + R.n(rough), py + R.n(rough)]);
      x.save(); trace(x, Q, true); x.globalAlpha = a * 0.5; x.fill(); x.clip();
      x.globalAlpha = a; x.beginPath();
      for (let j = 0; j < (o.blot ?? 24); j++) { const r = R.r(0.08, 0.25) * sz, px = R.r(bb.x0, bb.x1), py = R.r(bb.y0, bb.y1); x.moveTo(px + r, py); x.arc(px, py, r, 0, TAU); }
      x.fill(); x.restore();
      if (i % 3 === 0) { x.globalAlpha = o.edge ?? 0.2; x.lineWidth = 0.8 + R() * 1.4; trace(x, Q, true); x.stroke(); }
    }
    return c;
  }

  window.HAND = { rngKey, wobble, trace, subPath, ink, paint, hatch, pencil, stipple, ribbon, washPlate };
})();
