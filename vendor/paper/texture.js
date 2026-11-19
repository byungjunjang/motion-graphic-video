// 종이 질감 · 필름 그레인 도우미. 콜라주 영상의 kit.js 에서 브랜드와 무관한 부분만 옮겼다 (2026-11-19).
// 쓰는 영상만 assets/ 로 복사하거나, index.html 의 <script> 안에 필요한 함수만 붙여 넣는다.
// 모든 난수는 rng(seed) 로만 만든다. 같은 seed 는 늘 같은 질감을 낸다 (seek 계약).
// 전역 stage(#stage)를 쓴다. 다른 부모에 붙이려면 grainLayer(parent) 처럼 넘긴다.
const stage = document.getElementById('stage');
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

// 종이 결 타일. 씨앗으로 한 번 만들고 data URL 을 캐시한다. o = { size, mottle, mc, dark, light, fibers, lf, specks }
const _tiles = {};
function texTile(seed = 1, o = {}) {
  const key = seed + JSON.stringify(o); if (_tiles[key]) return _tiles[key];
  const S = o.size || 640, r = rng(seed * 7 + 3);
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const m = document.createElement('canvas'), M = 10; m.width = m.height = M; const mx = m.getContext('2d');
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) { mx.fillStyle = `rgba(${o.mc || '120,95,60'},${(r() * (o.mottle ?? .05)).toFixed(3)})`; mx.fillRect(i, j, 1, 1); }
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(m, 0, 0, S, S);
  const id = x.getImageData(0, 0, S, S), d = id.data, dk = o.dark ?? .07, lt = o.light ?? .06;
  for (let i = 0; i < d.length; i += 4) {
    const v = r();
    if (v < .5) { const a = r() * dk; const A0 = d[i + 3] / 255; const na = a + A0 * (1 - a); d[i] = (70 * a + d[i] * A0 * (1 - a)) / na; d[i + 1] = (55 * a + d[i + 1] * A0 * (1 - a)) / na; d[i + 2] = (35 * a + d[i + 2] * A0 * (1 - a)) / na; d[i + 3] = na * 255; }
    else if (v < .75) { const a = r() * lt; const A0 = d[i + 3] / 255; const na = a + A0 * (1 - a); d[i] = (255 * a + d[i] * A0 * (1 - a)) / na; d[i + 1] = (252 * a + d[i + 1] * A0 * (1 - a)) / na; d[i + 2] = (244 * a + d[i + 2] * A0 * (1 - a)) / na; d[i + 3] = na * 255; }
  }
  x.putImageData(id, 0, 0);
  const F = o.fibers ?? 260;
  for (let i = 0; i < F; i++) {
    const px = r() * S, py = r() * S, L = 6 + r() * 34, a = r() * Math.PI * 2, bend = (r() - .5) * 14;
    const light = r() < (o.lf ?? .35);
    x.strokeStyle = light ? `rgba(255,253,246,${.25 + r() * .35})` : `rgba(95,75,48,${.05 + r() * .11})`;
    x.lineWidth = .5 + r() * .8;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * L / 2 - Math.sin(a) * bend, py + Math.sin(a) * L / 2 + Math.cos(a) * bend, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
  }
  for (let i = 0; i < (o.specks ?? 40); i++) { x.fillStyle = `rgba(60,48,30,${.12 + r() * .25})`; x.beginPath(); x.arc(r() * S, r() * S, .4 + r() * .9, 0, 7); x.fill(); }
  return (_tiles[key] = c.toDataURL());
}

// 필름 그레인(2px, 타일 4장) + 아주 약한 비네트. 반환 update(tv) 가 2프레임마다 rng(floor(tv*15)) 로 타일과 위치를 고른다
function grainLayer(parent = stage, seed = 99) {
  const N = 4, GW = 992, GH = 576;
  const wrap = document.createElement('div'); wrap.id = 'grain'; wrap.className = 'layer';
  wrap.style.cssText = 'left:0;top:0;width:1920px;height:1080px;overflow:hidden;pointer-events:none;mix-blend-mode:soft-light;opacity:.34';
  const tiles = [];
  for (let k = 0; k < N; k++) {
    const r = rng(seed * 31 + k * 977), c = document.createElement('canvas'); c.width = GW; c.height = GH;
    const x = c.getContext('2d'), id = x.createImageData(GW, GH), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 92; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    const im = new Image(GW, GH); im.src = c.toDataURL();   // <canvas> 대신 <img> (합성 층을 만들지 않게)
    im.style.cssText = `position:absolute;left:0;top:0;width:${GW * 2}px;height:${GH * 2}px;display:none`;
    wrap.appendChild(im); tiles.push(im);
  }
  parent.appendChild(wrap);
  const v = document.createElement('div'); v.className = 'layer'; v.id = 'vignette';
  v.style.cssText = 'left:0;top:0;width:1920px;height:1080px;pointer-events:none;mix-blend-mode:multiply;background:radial-gradient(ellipse 76% 72% at 50% 48%, rgba(0,0,0,0) 58%, rgba(70,50,25,.13) 100%)';
  parent.appendChild(v);
  let shown = -1;
  return tv => {
    const r = rng(Math.floor(tv * 15) * 7919 + seed), k = Math.floor(r() * N);
    if (k !== shown) { tiles.forEach((c, i) => { c.style.display = i === k ? '' : 'none'; }); shown = k; }
    tiles[k].style.transform = `translate(${-2 * Math.floor(r() * 28)}px,${-2 * Math.floor(r() * 30)}px)`;
  };
}

