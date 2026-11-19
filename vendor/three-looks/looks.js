/* three-looks · three.js 재질·후처리 키트. 전역 LOOKS 를 만든다. three.min.js(전역 THREE) 뒤에 읽는다.
   모든 값은 호출하는 쪽이 seek(t) 에서 넣는다. 이 파일은 시간·난수 상태를 스스로 갖지 않는다. */
(function (root) {
  'use strict';
  const T = root.THREE;
  if (!T) throw new Error('looks.js · THREE 가 먼저 로드돼야 한다');
  const V3 = (a) => (a && a.isVector3 ? a : new T.Vector3(a[0], a[1], a[2]));
  const col = (c) => new T.Color(c);
  const hdr = (c, k) => col(c).multiplyScalar(k);

  // ── 공통 ────────────────────────────────────────────────────────────────
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // 환경맵. 반사·투과 재질은 이것이 없으면 검게 나온다. kind · 'studio' | 'strips' | 'dome', 또는 { bg, lights:[{pos,size,color,power}] }
  const ENVS = {
    studio: { bg: '#b9bcc4', blur: 0.05, lights: [
      { pos: [0, 9, 0], size: [9, 9], color: '#ffffff', power: 9 }, { pos: [-9, 3, 2], size: [5, 7], color: '#fff3e6', power: 5 },
      { pos: [9, 2, -1], size: [5, 6], color: '#e6efff', power: 4 }, { pos: [0, 2, 9], size: [8, 4], color: '#ffffff', power: 3 }] },
    strips: { bg: '#050506', blur: 0.02, lights: [
      { pos: [0, 9, 1], size: [7, 1.6], color: '#ffffff', power: 26 }, { pos: [-9, 1.5, 3], size: [0.9, 8], color: '#ff8a2a', power: 30 },
      { pos: [9, 2, 2], size: [0.9, 8], color: '#8fb4ff', power: 26 }, { pos: [2, 4, 9], size: [5, 0.7], color: '#ffffff', power: 12 },
      { pos: [0, -9, 0], size: [10, 2], color: '#8a8f99', power: 3 }] },
    dome: { bg: '#0b0714', blur: 0.14, lights: [
      { pos: [-7, 6, 5], size: [9, 9], color: '#8b5cf6', power: 7 }, { pos: [8, 2, 4], size: [7, 7], color: '#ff8a4c', power: 6 },
      { pos: [3, -6, 6], size: [9, 6], color: '#3b82f6', power: 6 }, { pos: [-3, 8, -6], size: [7, 7], color: '#ec4899', power: 5 },
      { pos: [0, 9, 2], size: [4, 4], color: '#ffffff', power: 8 }] },
  };
  function env(gl, kind) {
    const d = typeof kind === 'string' ? ENVS[kind] : kind;
    if (!d) throw new Error('looks.env · 모르는 종류 ' + kind);
    const s = new T.Scene();
    s.add(new T.Mesh(new T.BoxGeometry(24, 24, 24), new T.MeshBasicMaterial({ color: col(d.bg), side: T.BackSide })));
    for (const L of d.lights) {
      const m = new T.Mesh(new T.PlaneGeometry(L.size[0], L.size[1]), new T.MeshBasicMaterial({ color: hdr(L.color, L.power), side: T.DoubleSide }));
      m.position.set(L.pos[0], L.pos[1], L.pos[2]); m.lookAt(0, 0, 0); s.add(m);
    }
    const pm = new T.PMREMGenerator(gl), tex = pm.fromScene(s, d.blur == null ? 0.04 : d.blur).texture;
    pm.dispose(); s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return tex;
  }

  // 모서리가 둥근 판. 중심이 원점, 앞면이 +z. uv 는 앞면 기준 0~1
  function slab(w, h, d, r, seg) {
    r = Math.min(r, w / 2, h / 2); const b = Math.min(d * 0.35, r * 0.5), x = -w / 2 + b, y = -h / 2 + b, W = w - 2 * b, H = h - 2 * b, R = Math.max(r - b, 0.0001);
    const s = new T.Shape();
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.absarc(x + W - R, y + R, R, -Math.PI / 2, 0, false);
    s.lineTo(x + W, y + H - R); s.absarc(x + W - R, y + H - R, R, 0, Math.PI / 2, false);
    s.lineTo(x + R, y + H); s.absarc(x + R, y + H - R, R, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + R); s.absarc(x + R, y + R, R, Math.PI, Math.PI * 1.5, false);
    const g = new T.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: seg || 4, curveSegments: 12 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    g.computeVertexNormals();
    return g;
  }

  // 유리 판 + 앞면 canvas 그림. p.draw((ctx, W, H) => …) 를 seek 에서 부른다. 흰 테두리와 옅은 흰 채움은 기본으로 그린다(frame:false 로 끈다)
  function panel(w, h, o) {
    o = o || {}; const d = o.depth || 0.06, px = o.px || 512;
    const g = new T.Group(), cv = document.createElement('canvas');
    cv.width = Math.round(px * Math.max(1, w / h)); cv.height = Math.round(cv.width * h / w);
    const ctx = cv.getContext('2d'), tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    g.body = new T.Mesh(slab(w, h, d, o.radius == null ? 0.12 : o.radius), o.material || glass());
    g.face = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    g.face.position.z = d / 2 + 0.002; g.face.renderOrder = 2;
    g.add(g.body, g.face); g.canvas = cv; g.ctx = ctx; g.tex = tex;
    const rr = (o.radius == null ? 0.12 : o.radius) / w * cv.width, lw = Math.max(cv.width / 400, 1.5);
    g.draw = (fn) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if (o.frame !== false) { ctx.beginPath(); ctx.roundRect(lw, lw, cv.width - 2 * lw, cv.height - 2 * lw, Math.max(rr - lw, 0)); ctx.fillStyle = o.fill || 'rgba(255,255,255,.07)'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = o.stroke || 'rgba(255,255,255,.5)'; ctx.stroke(); }
      if (fn) fn(ctx, cv.width, cv.height); tex.needsUpdate = true;
    };
    return g;
  }

  // 카메라 비행. keys · [{ at:[t0,t1], pos, look, drift }] — 구간 안에서는 drift 만큼 천천히 흐르고, 구간 사이는 expo 로 빠르게 건너간다
  const expo = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2);
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3();
  function keyAt(k, u, pos, look) {
    pos.copy(V3(k.pos)); look.copy(V3(k.look));
    if (k.drift) pos.addScaledVector(V3(k.drift), u);
    if (k.lookDrift) look.addScaledVector(V3(k.lookDrift), u);
  }
  function fly(cam, keys, t) {
    let i = 0; while (i < keys.length - 1 && t >= keys[i + 1].at[0]) i++;
    const k = keys[i], n = keys[i + 1];
    if (t <= k.at[1] || !n) keyAt(k, Math.min(Math.max((t - k.at[0]) / (k.at[1] - k.at[0]), 0), 1), _a, _b);
    else { const e = expo((t - k.at[1]) / (n.at[0] - k.at[1])); keyAt(k, 1, _a, _b); keyAt(n, 0, _c, _d); _a.lerp(_c, e); _b.lerp(_d, e); }
    cam.position.copy(_a); cam.up.set(0, 1, 0); cam.lookAt(_b);
  }

  // 3D 점 → 화면 좌표. DOM 이름표를 3D 사물에 붙일 때 쓴다. cam 을 움직인 뒤에 부른다
  function pin(v, cam, w, h) {
    cam.updateMatrixWorld(); const p = _a.copy(V3(v)).project(cam);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, front: p.z < 1 && p.z > -1 };
  }

  // 그려지는 빛 줄. tr.u.uP.value = 0~1 (그려진 길이). head 는 머리의 밝기, dash 는 흐르는 점선 수(0 이면 실선)
  // 기본은 불투명 목록에 넣어 그린다. 그래야 유리 재질 너머로 비친다. 유리보다 앞에 둘 것은 front:true 를 준다 (orbs 도 같다)
  function trail(points, o) {
    o = o || {}; const curve = points.isCurve ? points : new T.CatmullRomCurve3(points.map(V3), false, 'catmullrom', 0.5);
    const u = { uP: { value: 1 }, uColor: { value: hdr(o.color || '#ffb070', o.power || 2.2) }, uHead: { value: o.head == null ? 6 : o.head }, uDash: { value: o.dash || 0 }, uFlow: { value: 0 }, uTail: { value: o.tail || 0 } };
    const m = new T.Mesh(new T.TubeGeometry(curve, o.segs || 240, o.radius || 0.02, 8, false), new T.ShaderMaterial({
      uniforms: u, transparent: !!o.front, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uP, uHead, uDash, uFlow, uTail; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = uP - vUv.x; if (d < 0.0) discard;
          float body = uTail > 0.0 ? exp(-d / uTail) : 1.0;
          if (uDash > 0.0) body *= step(0.5, fract(vUv.x * uDash - uFlow));
          float head = exp(-d * 90.0) * uHead;
          gl_FragColor = vec4(uColor * (body + head), 1.0); }` }));
    m.u = u; m.curve = curve; m.frustumCulled = false;
    return m;
  }

  // 부드러운 빛 점 무리(배경 깊이감·별밭). o.positions(Float32Array) 를 주면 그 자리, 없으면 seed 로 흩는다
  function orbs(n, o) {
    o = o || {}; let pos = o.positions;
    if (!pos) { const r = rng(o.seed || 1), s = o.spread || [10, 6, 10]; pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = (r() - 0.5) * s[i % 3]; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const r2 = rng((o.seed || 1) + 7), sz = new Float32Array(pos.length / 3); for (let i = 0; i < sz.length; i++) sz[i] = 0.4 + r2() * 1.0;
    g.setAttribute('aS', new T.BufferAttribute(sz, 1));
    const u = { uColor: { value: hdr(o.color || '#7fb8ff', o.power || 1.6) }, uSize: { value: o.size || 0.12 }, uH: { value: o.height || 1080 } };
    const m = new T.Points(g, new T.ShaderMaterial({ uniforms: u, transparent: !!o.front, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: 'attribute float aS; uniform float uSize, uH; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * aS * uH * projectionMatrix[1][1] / max(-mv.z, 0.001) * 0.5; }',
      fragmentShader: 'uniform vec3 uColor; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) - 0.018; if (a <= 0.0) discard; gl_FragColor = vec4(uColor * a, 1.0); }' }));
    m.u = u; m.frustumCulled = false; return m;
  }

  // 배경 돔. base · [아래색, 위색], blobs · [{ dir:[x,y,z], color, size(0~1), power }] 부드러운 색 덩어리
  function dome(o) {
    o = o || {}; const blobs = (o.blobs || []).slice(0, 6), N = Math.max(blobs.length, 1);
    const u = { uA: { value: col((o.base || ['#101014', '#101014'])[0]) }, uB: { value: col((o.base || ['#101014', '#101014'])[1]) },
      uDir: { value: Array.from({ length: N }, (_, i) => (blobs[i] ? V3(blobs[i].dir).clone().normalize() : new T.Vector3(0, 1, 0))) },
      uCol: { value: Array.from({ length: N }, (_, i) => (blobs[i] ? hdr(blobs[i].color, blobs[i].power || 1) : col('#000'))) },
      uSz: { value: Array.from({ length: N }, (_, i) => (blobs[i] ? blobs[i].size || 0.5 : 0.5)) } };
    const m = new T.Mesh(new T.SphereGeometry(o.radius || 60, 48, 32), new T.ShaderMaterial({ uniforms: u, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `#define N ${N}
        uniform vec3 uA, uB, uDir[N], uCol[N]; uniform float uSz[N]; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); vec3 c = mix(uA, uB, smoothstep(-0.6, 0.8, d.y));
          for (int i = 0; i < N; i++) { float k = max(dot(d, uDir[i]), 0.0); c += uCol[i] * pow(k, mix(24.0, 1.5, clamp(uSz[i], 0.0, 1.0))); }
          gl_FragColor = vec4(c, 1.0); }` }));
    m.u = u; m.renderOrder = -10; m.frustumCulled = false; return m;
  }

  // 스튜디오 바닥. 그림자만 받는 판 + 멀어지면 사라지는 점 격자. gl.shadowMap.enabled 와 광원의 castShadow 는 영상 쪽에서 켠다
  function floor(o) {
    o = o || {}; const size = o.size || 60, g = new T.Group();
    const sh = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShadowMaterial({ color: col(o.shadow || '#3a3f55'), opacity: o.opacity == null ? 0.28 : o.opacity }));
    sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; g.add(sh);
    const u = { uColor: { value: col(o.dot || '#9aa0b4') }, uGap: { value: o.gap || 0.5 }, uFade: { value: o.fade || 9 }, uR: { value: o.dotSize || 0.07 } };
    const gr = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uColor; uniform float uGap, uFade, uR; varying vec3 vW;
        void main(){ vec2 c = fract(vW.xz / uGap) - 0.5; float r = length(c); float aa = fwidth(r) * 1.2;
          float a = (1.0 - smoothstep(uR - aa, uR + aa, r)) * exp(-length(vW.xz - cameraPosition.xz) / uFade) * clamp(0.35 / max(aa, 0.0001) * 0.02, 0.0, 1.0);
          if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }` }));
    gr.rotation.x = -Math.PI / 2; gr.position.y = 0.002; g.add(gr); g.u = u; g.shadow = sh; g.grid = gr;
    return g;
  }

  // 바닥 아래 거울상. objs 를 움직인 뒤 m.sync() 를 부른다. 위에 반투명 바닥 판을 깔아 흐리게 한다
  function mirror(objs, y) {
    const g = new T.Group(), R = new T.Matrix4().makeScale(1, -1, 1).setPosition(0, 2 * (y || 0), 0);
    const pairs = objs.map((src) => { const m = new T.Mesh(src.geometry, src.material); m.matrixAutoUpdate = false; g.add(m); return [src, m]; });
    g.sync = () => { for (const [s, m] of pairs) { s.updateWorldMatrix(true, false); m.matrix.multiplyMatrices(R, s.matrixWorld); m.visible = s.visible; m.matrixWorldNeedsUpdate = true; } };
    return g;
  }

  // ── 재질 ────────────────────────────────────────────────────────────────
  // 서리 유리(글래스모픽 판). 뒤의 불투명 사물이 흐리게 비친다. scene.environment 가 있어야 한다. milk 는 판을 뿌옇게 밝히는 양
  function glass(o) {
    o = o || {};
    return new T.MeshPhysicalMaterial({ color: col(o.tint || '#ffffff'), transmission: 1, roughness: o.roughness == null ? 0.4 : o.roughness, thickness: o.thickness == null ? 0.6 : o.thickness,
      ior: o.ior || 1.45, metalness: 0, specularIntensity: 1, envMapIntensity: o.env == null ? 1 : o.env, attenuationColor: col(o.attenuation || o.tint || '#ffffff'), attenuationDistance: o.distance || 4, clearcoat: o.clearcoat || 0,
      emissive: col('#ffffff'), emissiveIntensity: o.milk == null ? 0.02 : o.milk });
  }
  // 맑은 유리(구·고리·다면체). dispersion 이 가장자리에 색 번짐을 만든다
  function clearGlass(o) {
    o = o || {};
    return new T.MeshPhysicalMaterial({ color: col(o.tint || '#ffffff'), transmission: 1, roughness: o.roughness == null ? 0.03 : o.roughness, thickness: o.thickness == null ? 1.2 : o.thickness,
      ior: o.ior || 1.5, dispersion: o.dispersion == null ? 4 : o.dispersion, envMapIntensity: o.env == null ? 1.2 : o.env, iridescence: o.iridescence || 0 });
  }

  const SIN_BLOB = `uniform float uLmT, uLmAmp, uLmFreq;
    float lmF(vec3 p){ p *= uLmFreq; float t = uLmT;
      return sin(p.x * 1.0 + t * 1.1) * sin(p.y * 1.3 - t * 0.9) * sin(p.z * 0.9 + t * 0.7) + 0.5 * sin(p.x * 2.1 - t * 1.3 + p.y * 1.7) * sin(p.z * 2.3 + t * 1.6); }
    vec3 lmD(vec3 p, vec3 n){ return p + n * uLmAmp * lmF(p); }`;
  // 액체 금속. 검은 거울 금속이 꿀렁인다. m.u.uLmT.value = t, uLmAmp(출렁임 크기), uLmFreq(주름 수). 환경맵은 'strips' 를 쓴다
  function liquidMetal(o) {
    o = o || {};
    const m = new T.MeshPhysicalMaterial({ color: col(o.color || '#0b0b0d'), metalness: 1, roughness: o.roughness == null ? 0.07 : o.roughness, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: o.env == null ? 1.4 : o.env });
    m.u = { uLmT: { value: 0 }, uLmAmp: { value: o.amp == null ? 0.12 : o.amp }, uLmFreq: { value: o.freq || 1.6 } };
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, m.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + SIN_BLOB)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          { vec3 n0 = normalize(normal); vec3 tx = normalize(abs(n0.y) < 0.99 ? cross(n0, vec3(0.0, 1.0, 0.0)) : cross(n0, vec3(1.0, 0.0, 0.0))); vec3 bx = cross(n0, tx); float e = 0.01;
            vec3 p0 = lmD(position, n0), p1 = lmD(position + tx * e, n0), p2 = lmD(position + bx * e, n0);
            objectNormal = normalize(cross(p2 - p0, p1 - p0)); if (dot(objectNormal, n0) < 0.0) objectNormal = -objectNormal; }`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = lmD(position, normalize(normal));');
    };
    m.customProgramCacheKey = () => 'looks-liquid-metal';
    return m;
  }

  const NOISE3 = `float lkH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float lkN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(lkH(i), lkH(i + vec3(1,0,0)), f.x), mix(lkH(i + vec3(0,1,0)), lkH(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(lkH(i + vec3(0,0,1)), lkH(i + vec3(1,0,1)), f.x), mix(lkH(i + vec3(0,1,1)), lkH(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
  // 클레이. 무광 + sheen + 가장자리 빛 + 노이즈로 녹아 나타나기. m.u.uShow.value = 0~1 (1 이면 다 보임)
  // o.instanced 면 InstancedMesh 의 geometry 에 InstancedBufferAttribute 'aShow'(개수만큼 float)를 달아 개체마다 준다
  function clay(color, o) {
    o = o || {};
    const m = new T.MeshPhysicalMaterial({ color: col(color || '#c9d6ff'), roughness: o.roughness == null ? 0.82 : o.roughness, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: col(o.sheen || '#ffffff'), envMapIntensity: o.env == null ? 0.55 : o.env });
    m.u = { uShow: { value: 1 }, uEdge: { value: hdr(o.edge || '#4f46e5', o.edgePower || 5) }, uRim: { value: hdr(o.rim || '#ffffff', o.rimPower == null ? 0.22 : o.rimPower) }, uGrain: { value: o.grain || 9 } };
    const inst = !!o.instanced;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, m.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n varying vec3 vLkP; varying float vLkS;${inst ? ' attribute float aShow;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n vLkP = position${inst ? ' + vec3(float(gl_InstanceID) * 1.37)' : ''}; vLkS = ${inst ? 'aShow' : '1.0'};`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n varying vec3 vLkP; varying float vLkS; uniform float uShow, uGrain; uniform vec3 uEdge, uRim;\n${NOISE3}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float a = clamp(uShow * vLkS, 0.0, 1.0); float cut = lkN(vLkP * uGrain) - (a * 1.24 - 0.12);
            if (cut > 0.0) discard;
            totalEmissiveRadiance += uEdge * smoothstep(-0.12, 0.0, cut) * step(a, 0.995); }`)
        .replace('#include <opaque_fragment>', `outgoingLight += uRim * pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);\n#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'looks-clay-' + (inst ? 'i' : 's');
    return m;
  }

  // 망점 인쇄. 밝기를 화면 좌표의 점 크기로 바꾼다. paper 를 주면 불투명(종이색 바탕), null 이면 점만 그린다
  // contour · { color, step, width } 를 주면 높이(y)마다 등고선을 긋는다. 후처리는 post 의 tone:'none' 과 함께 쓴다
  function halftone(o) {
    o = o || {}; const c = o.contour;
    const u = { uInk: { value: col(o.ink || '#2f7fb8') }, uPaper: { value: col(o.paper || '#e9e2d8') }, uL: { value: V3(o.light || [0.5, 0.8, 0.6]).clone().normalize() },
      uCell: { value: o.cell || 7 }, uAng: { value: o.angle == null ? 0.5 : o.angle }, uDark: { value: o.dark == null ? 1 : o.dark }, uFade: { value: 1 },
      uCC: { value: col(c ? c.color : '#d6337a') }, uCS: { value: c ? c.step : 0.2 }, uCW: { value: c ? c.width || 1.4 : 0 } };
    const opaque = o.paper !== null;
    const m = new T.ShaderMaterial({ uniforms: u, transparent: !opaque, depthWrite: opaque, side: o.side || T.FrontSide,
      vertexShader: 'varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uInk, uPaper, uL, uCC; uniform float uCell, uAng, uDark, uFade, uCS, uCW; varying vec3 vN, vW;
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          float dark = clamp((1.0 - (dot(n, uL) * 0.5 + 0.5)) * uDark + 0.12, 0.0, 1.0) * uFade;
          float cs = cos(uAng), sn = sin(uAng); vec2 q = mat2(cs, -sn, sn, cs) * gl_FragCoord.xy / uCell;
          float r = length(fract(q) - 0.5), R = sqrt(dark) * 0.72, aa = 1.0 / uCell;
          float dot_ = 1.0 - smoothstep(R - aa, R + aa, r);
          float line = 0.0;
          if (uCW > 0.0) { float hh = vW.y / uCS; float f = abs(fract(hh - 0.5) - 0.5) / max(fwidth(hh), 0.00001); line = (1.0 - smoothstep(uCW - 1.0, uCW, f)) * uFade; }
          ${opaque ? 'vec3 c = mix(uPaper, uInk, dot_); c = mix(c, uCC, line); gl_FragColor = vec4(c, 1.0);'
    : 'float a = max(dot_, line); if (a < 0.01) discard; gl_FragColor = vec4(mix(uInk, uCC, line), a);'} }` });
    m.u = u; return m;
  }

  // ── 홀로그램 지구본 부품 ──────────────────────────────────────────────────
  // 피보나치 구 위의 점. mask(lat, lon) 이 false 인 점은 뺀다(육지 마스크는 영상 쪽에서 준다). 반지름 1
  function fib(n, mask) {
    const out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) * 2 / n, r = Math.sqrt(1 - y * y), th = i * ga, x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!mask || mask(Math.asin(y) * 180 / Math.PI, Math.atan2(-z, x) * 180 / Math.PI)) out.push(x, y, z);
    }
    return new Float32Array(out);
  }
  // 위도·경도(도) → 반지름 r 의 점. fib 의 mask 와 같은 좌표계다
  const latLon = (lat, lon, r) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180, R = r || 1; return new T.Vector3(Math.cos(a) * Math.cos(b) * R, Math.sin(a) * R, -Math.cos(a) * Math.sin(b) * R); };
  // 두 지점 사이 대권 호의 점들. lift 는 거리에 비례해 띄우는 높이. trail() 에 넘긴다
  function arc(a, b, lift, n) {
    a = V3(a); b = V3(b); const R = a.length(), A = a.clone().normalize(), B = b.clone().normalize(), w = Math.acos(Math.min(Math.max(A.dot(B), -1), 1)), pts = [];
    n = n || 48; lift = lift == null ? 0.35 : lift;
    for (let i = 0; i <= n; i++) { const u = i / n, s = Math.sin(w) || 1;
      pts.push(A.clone().multiplyScalar(Math.sin((1 - u) * w) / s).addScaledVector(B, Math.sin(u * w) / s).normalize().multiplyScalar(R * (1 + lift * w / Math.PI * Math.sin(Math.PI * u)))); }
    return pts;
  }
  // 빛나는 점 구. 뒷면은 흐려지고, uReveal(0~1) 로 경도를 쓸며 켜진다
  function holoPoints(positions, o) {
    o = o || {}; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(positions, 3));
    const u = { uColor: { value: hdr(o.color || '#7fe3ff', o.power || 1.4) }, uSize: { value: o.size || 0.012 }, uH: { value: o.height || 1080 }, uReveal: { value: 1 } };
    const m = new T.Points(g, new T.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `uniform float uSize, uH, uReveal; varying float vA;
        void main(){ vec3 n = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vec3 wn = normalize(mat3(modelMatrix) * n);
          float facing = dot(wn, normalize(cameraPosition - w.xyz));
          float lon = atan(-n.z, n.x) / 6.2831853 + 0.5; float sweep = uReveal * 1.15 - lon;
          vA = smoothstep(-0.15, 0.35, facing) * smoothstep(0.0, 0.05, sweep) * (1.0 + 2.5 * exp(-max(sweep, 0.0) * 40.0));
          vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uH * projectionMatrix[1][1] / max(-mv.z, 0.001) * 0.5; }`,
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.55, 1.0, d)) * vA; if (a < 0.004) discard; gl_FragColor = vec4(uColor * a, 1.0); }' }));
    m.u = u; return m;
  }
  // 바다 구. 어두운 속 + 가장자리 빛 + 위도·경도 격자(grid 도 간격)
  function ocean(o) {
    o = o || {};
    const u = { uCore: { value: col(o.core || '#041423') }, uRim: { value: hdr(o.rim || '#49c6ff', o.power || 1.3) }, uGrid: { value: o.grid || 15 }, uLine: { value: o.line == null ? 0.35 : o.line } };
    const m = new T.Mesh(new T.SphereGeometry(o.radius || 0.995, 96, 64), new T.ShaderMaterial({ uniforms: u,
      vertexShader: 'varying vec3 vN, vW, vO; void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uCore, uRim; uniform float uGrid, uLine; varying vec3 vN, vW, vO;
        float ln(float v){ float f = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 0.00001); return 1.0 - smoothstep(0.0, 1.2, f); }
        void main(){ vec3 o = normalize(vO); float lat = degrees(asin(clamp(o.y, -1.0, 1.0))), lon = degrees(atan(-o.z, o.x));
          float g = max(ln(lat / uGrid), ln(lon / uGrid) * step(abs(lat), 86.0));
          float fr = pow(clamp(1.0 - dot(normalize(vN), normalize(cameraPosition - vW)), 0.0, 1.0), 2.6);
          gl_FragColor = vec4(uCore + uRim * (fr * 0.9 + g * uLine * (0.25 + fr)), 1.0); }` }));
    m.u = u; return m;
  }
  // 대기 껍질. 구보다 큰 뒷면 구가 가장자리에서만 빛난다
  function atmosphere(o) {
    o = o || {};
    const u = { uColor: { value: hdr(o.color || '#49c6ff', o.power || 1.2) }, uPow: { value: o.falloff || 4 } };
    const m = new T.Mesh(new T.SphereGeometry(o.radius || 1.16, 64, 48), new T.ShaderMaterial({ uniforms: u, side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uPow; varying vec3 vN, vW; void main(){ float k = clamp(dot(normalize(vN), normalize(vW - cameraPosition)), 0.0, 1.0); gl_FragColor = vec4(uColor * pow(k, uPow), 1.0); }' }));
    m.u = u; return m;
  }

  // ── 후처리 ──────────────────────────────────────────────────────────────
  // HDR(half-float) + MSAA 로 장면을 그리고 → 밝은 곳만 bloom → 톤 매핑 → 색 번짐·비네트·그레인·주사선.
  // p.o 의 값은 seek 에서 바꿔도 된다. p.render(scene, cam, t) 가 gl.render 를 대신한다
  const FS_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function post(gl, o) {
    const p = { o: Object.assign({ w: 1920, h: 1080, samples: 4, fps: 30, tone: 'neutral', exposure: 1, threshold: 1, knee: 0.5, bloom: 0.5, radius: 1, ca: 0.0012, vignette: 0.25, grain: 0.03, scan: 0, levels: 5 }, o || {}) };
    const { w, h } = p.o, rt = (W, H, extra) => new T.WebGLRenderTarget(W, H, Object.assign({ type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false }, extra || {}));
    const main = rt(w, h, { depthBuffer: true, samples: p.o.samples });
    const down = [], up = [];
    for (let i = 0, W = w >> 1, H = h >> 1; i < p.o.levels; i++, W = Math.max(W >> 1, 2), H = Math.max(H >> 1, 2)) { down.push(rt(W, H)); up.push(rt(W, H)); }
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2)), sc = new T.Scene(); sc.add(quad); quad.frustumCulled = false;
    const mat = (uniforms, fragmentShader) => new T.ShaderMaterial({ uniforms, vertexShader: FS_V, fragmentShader, depthTest: false, depthWrite: false });
    const bright = mat({ tA: { value: null }, uTh: { value: 1 }, uKnee: { value: 0.5 } },
      'uniform sampler2D tA; uniform float uTh, uKnee; varying vec2 vUv; void main(){ vec3 c = min(texture2D(tA, vUv).rgb, vec3(24.0)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uTh, uTh + uKnee, l), 1.0); }');
    const blur = mat({ tA: { value: null }, uPx: { value: new T.Vector2() }, uR: { value: 1 } },
      'uniform sampler2D tA; uniform vec2 uPx; uniform float uR; varying vec2 vUv; void main(){ vec2 d = uPx * uR; gl_FragColor = (texture2D(tA, vUv + d * vec2(-1.0, -1.0)) + texture2D(tA, vUv + d * vec2(1.0, -1.0)) + texture2D(tA, vUv + d * vec2(-1.0, 1.0)) + texture2D(tA, vUv + d * vec2(1.0, 1.0))) * 0.25; }');
    const add = mat({ tA: { value: null }, tB: { value: null }, uPx: { value: new T.Vector2() }, uR: { value: 1 } },
      'uniform sampler2D tA, tB; uniform vec2 uPx; uniform float uR; varying vec2 vUv; void main(){ vec2 d = uPx * uR; vec4 b = (texture2D(tB, vUv + d * vec2(-1.0, -1.0)) + texture2D(tB, vUv + d * vec2(1.0, -1.0)) + texture2D(tB, vUv + d * vec2(-1.0, 1.0)) + texture2D(tB, vUv + d * vec2(1.0, 1.0))) * 0.25; gl_FragColor = texture2D(tA, vUv) + b; }');
    const fin = mat({ tA: { value: null }, tB: { value: null }, uTone: { value: 1 }, uExp: { value: 1 }, uBloom: { value: 0.5 }, uCA: { value: 0 }, uVig: { value: 0 }, uGrain: { value: 0 }, uScan: { value: 0 }, uSeed: { value: 0 }, uT: { value: 0 }, uRes: { value: new T.Vector2(w, h) } },
      `uniform sampler2D tA, tB; uniform float uTone, uExp, uBloom, uCA, uVig, uGrain, uScan, uSeed, uT; uniform vec2 uRes; varying vec2 vUv;
       vec3 neutral(vec3 c){ float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off; float pk = max(c.r, max(c.g, c.b)); if (pk < 0.76) return c;
         float d = 0.24; float np = 1.0 - d * d / (pk + d - 0.76); c *= np / pk; float g = 1.0 - 1.0 / (0.15 * (pk - np) + 1.0); return mix(c, vec3(np), g); }
       vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
       vec3 enc(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0001)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
       vec3 src(vec2 uv){ return texture2D(tA, uv).rgb + texture2D(tB, uv).rgb * uBloom; }
       void main(){ vec2 c = vUv - 0.5; vec3 col;
         if (uCA > 0.0) { vec2 o = c * dot(c, c) * uCA * 4.0; col = vec3(src(vUv + o).r, src(vUv).g, src(vUv - o).b); } else col = src(vUv);
         col *= uExp;
         if (uScan > 0.0) { float y = gl_FragCoord.y; col *= 1.0 - uScan * (0.5 + 0.5 * sin(y * 3.14159 / 1.5)); col *= 1.0 + uScan * 1.6 * exp(-pow((fract(vUv.y + uT * 0.12) - 0.5) * 14.0, 2.0)); }
         col = uTone > 1.5 ? aces(col) : uTone > 0.5 ? neutral(col) : col;
         col = enc(col);
         col *= 1.0 - uVig * smoothstep(0.25, 0.95, length(c * vec2(1.0, uRes.y / uRes.x)) * 1.6);
         float n = fract(sin(dot(gl_FragCoord.xy + vec2(uSeed * 37.0, uSeed * 91.0), vec2(12.9898, 78.233))) * 43758.5453);
         col += (n - 0.5) * uGrain;
         gl_FragColor = vec4(col, 1.0); }`);
    const pass = (m, target) => { quad.material = m; gl.setRenderTarget(target); gl.render(sc, cam); };
    p.target = main;
    p.render = (scene, camera, t) => {
      const q = p.o, tm = gl.toneMapping; gl.toneMapping = T.NoToneMapping;
      gl.setRenderTarget(main); gl.clear(); gl.render(scene, camera);
      if (q.bloom > 0) {
        bright.uniforms.tA.value = main.texture; bright.uniforms.uTh.value = q.threshold; bright.uniforms.uKnee.value = q.knee; pass(bright, down[0]);
        for (let i = 1; i < down.length; i++) { blur.uniforms.tA.value = down[i - 1].texture; blur.uniforms.uPx.value.set(0.5 / down[i].width, 0.5 / down[i].height); blur.uniforms.uR.value = 1; pass(blur, down[i]); }
        let acc = down[down.length - 1];
        for (let i = down.length - 2; i >= 0; i--) { add.uniforms.tA.value = down[i].texture; add.uniforms.tB.value = acc.texture; add.uniforms.uPx.value.set(1 / acc.width, 1 / acc.height); add.uniforms.uR.value = q.radius; pass(add, up[i]); acc = up[i]; }
        fin.uniforms.tB.value = acc.texture;
      } else fin.uniforms.tB.value = down[0].texture;
      const f = fin.uniforms; f.tA.value = main.texture; f.uTone.value = q.tone === 'aces' ? 2 : q.tone === 'none' ? 0 : 1; f.uExp.value = q.exposure;
      f.uBloom.value = q.bloom > 0 ? q.bloom / down.length : 0; f.uCA.value = q.ca; f.uVig.value = q.vignette; f.uGrain.value = q.grain; f.uScan.value = q.scan; f.uT.value = t || 0; f.uSeed.value = Math.round((t || 0) * q.fps) % 997;
      pass(fin, null); gl.toneMapping = tm;
    };
    return p;
  }

  root.LOOKS = { rng, env, slab, panel, fly, pin, trail, orbs, dome, floor, mirror, glass, clearGlass, liquidMetal, clay, halftone, fib, latLon, arc, holoPoints, ocean, atmosphere, post };
})(typeof window !== 'undefined' ? window : globalThis);
