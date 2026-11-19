# three.js 재질·후처리 키트 (looks.js)

- 무엇 · 내장 three.js 위에서 쓰는 재질 5종(서리 유리·액체 금속·클레이·망점 인쇄·홀로그램)과 후처리(HDR + bloom + 톤 매핑 + 그레인), 카메라 비행·빛 줄·환경맵 도우미다. 일반 `<script>` 로 읽으면 전역 `LOOKS` 가 생긴다.
- 출처 · Matt Penny 「Claude + Three.js = Premium 3D Motion Graphics」(https://www.youtube.com/watch?v=CCUSpJkAfgU, 2026-10-15 게시)를 2026-11-10 에 1초 간격 프레임과 1080p 확대 프레임으로 분석했다. 영상의 데모 5편과 화면에 나온 프롬프트 3편(유리·클레이·홀로그램)의 기법을 이 파이프라인의 seek(t) 계약에 맞춰 새로 짰다. 영상의 코드·문장·데모 주제는 옮기지 않았다. 외부 코드를 복사하지 않았다.
- 필요한 것 · `vendor/three/three.min.js`(three@0.186.1) 하나다. three 애드온(RoundedBoxGeometry·RoomEnvironment·EffectComposer·UnrealBloomPass)은 내장본에 없어서 같은 역할을 이 파일이 직접 한다.

## 쓰는 법

1. `cp vendor/three/three.min.js vendor/three-looks/looks.js videos/<id>/assets/` 로 복사한다.
2. `<script src="../assets/three.min.js"></script>` 다음 줄에 `<script src="../assets/looks.js"></script>` 로 읽는다.
3. 본보기는 `vendor/three-looks/demo/src/index.html` 이다. 재질 5종을 3초씩 보여 준다. `node scripts/render.mjs vendor/three-looks/demo --snap 1.2,4,7.6,10.2,13.4` 로 찍어 본다.

```js
const L = LOOKS;
const gl = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, preserveDrawingBuffer: true });  // 계단 제거는 post 의 MSAA 가 한다
gl.setPixelRatio(1); gl.setSize(1920, 1080, false);
const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 200), scene = new THREE.Scene();
scene.environment = L.env(gl, 'dome');                       // 로드 때 한 번 굽는다
const post = L.post(gl, { w: 1920, h: 1080, bloom: 0.7 });   // 로드 때 한 번 만든다
const card = L.panel(2.5, 3.0, { radius: 0.22 }); scene.add(card);
window.seek = function (t) {
  L.fly(cam, KEYS, t);                                       // 카메라
  card.draw((c, w, h) => { /* t 로 정한 UI 를 canvas 에 그린다 */ });
  post.render(scene, cam, t);                                // gl.render 대신 부른다
};
```

## 함수

| 함수 | 하는 일 |
|---|---|
| `env(gl, kind)` | 환경맵을 굽는다. `'studio'`(밝은 방) · `'strips'`(검은 방 + 주황·파랑·흰 빛 띠) · `'dome'`(보라·주황·파랑·분홍 빛 덩어리). `{ bg, blur, lights:[{pos,size,color,power}] }` 로 직접 줄 수도 있다 |
| `post(gl, o)` | 후처리 묶음. `p.render(scene, cam, t)`. `p.o` 의 값(`tone` `'neutral'·'aces'·'none'`, `exposure`, `bloom`, `threshold`, `radius`, `ca`, `vignette`, `grain`, `scan`)은 seek 에서 바꿔도 된다 |
| `fly(cam, keys, t)` | 카메라 비행. `keys = [{ at:[t0,t1], pos, look, drift, lookDrift }]`. 구간 안에서는 `drift` 만큼 천천히 흐르고, 구간 사이는 expo 로 빠르게 건너간다 |
| `pin(v, cam, w, h)` | 3D 점 → 화면 좌표 `{x, y, front}`. DOM 이름표를 3D 사물에 붙인다 |
| `trail(points, o)` | 그려지는 빛 줄. `tr.u.uP.value = 0~1`. `dash`·`uFlow` 로 흐르는 점선, `head` 로 머리 밝기 |
| `orbs(n, o)` | 부드러운 빛 점 무리. `positions` 를 주면 그 자리(별밭) |
| `dome(o)` | 배경 돔. `base:[아래색, 위색]`, `blobs:[{dir, color, size, power}]` |
| `floor(o)` | 그림자만 받는 바닥 + 멀어지면 사라지는 점 격자 |
| `mirror(objs, y)` | 바닥 아래 거울상. 사물을 움직인 뒤 `m.sync()` |
| `slab(w, h, d, r)` | 모서리가 둥근 판 geometry |
| `panel(w, h, o)` | 유리 판 + 앞면 canvas. `p.draw((ctx, W, H) => …)`. 흰 테두리와 옅은 흰 채움은 기본으로 그린다 |
| `glass(o)` · `clearGlass(o)` | 서리 유리(판) · 맑은 유리(구·고리·다면체, `dispersion` 색 번짐) |
| `liquidMetal(o)` | 꿀렁이는 검은 거울 금속. `m.u.uLmT.value = t`, `uLmAmp`, `uLmFreq` |
| `clay(color, o)` | 무광 + sheen + 가장자리 빛 + 녹아 나타나기. `m.u.uShow.value = 0~1`. `instanced:true` 면 개체마다 `aShow` |
| `halftone(o)` | 망점 인쇄. `ink`, `paper`(null 이면 점만), `cell`, `contour:{color, step, width}`, `m.u.uFade` |
| `fib(n, mask)` · `latLon(lat, lon, r)` · `arc(a, b, lift)` | 구 위의 고른 점 · 위경도 → 점 · 대권 호의 점들 |
| `holoPoints(positions, o)` · `ocean(o)` · `atmosphere(o)` | 빛나는 점 구(`uReveal` 로 경도를 쓸며 켜짐) · 격자 바다 구 · 가장자리만 빛나는 대기 |
| `rng(seed)` | 씨앗 난수 |

## 룩별 조합

| 룩 | 환경맵 | 재질·부품 | post | 영상에서 본 것 |
|---|---|---|---|---|
| 글래스모픽 | `dome` | `panel`(`glass`) + `clearGlass` 구·고리·다면체 + `dome` 배경 + `orbs` + `trail` | `tone:'neutral'`, `bloom` 0.7, `ca` 0.0014, `vignette` 0.3 | 장면 4개가 서로 다른 3D 위치에 있고 카메라가 건너간다. 빛 줄 하나가 모든 장면을 잇는다. 마지막에 뒤로 물러나 전체를 보여 준다 |
| 액체 금속 | `strips` | `liquidMetal` 구 + `mirror` + 반투명 어두운 바닥 + `trail` 호 | `tone:'neutral'`, `bloom` 0.8, `threshold` 1.1 | 덩어리 하나가 구 여러 개로 갈라진다. 구 사이를 연두색 빛 호가 잇는다. 세로 화면(9:16) |
| 클레이 | `studio` | `clay` (InstancedMesh) + `floor` + `dome` 흰 배경 + HemisphereLight + 그림자 DirectionalLight(VSM) | `tone:'neutral'`, `bloom` 0.5, `threshold` 1.25 (녹는 가장자리만 빛난다) | 문서 카드가 점으로 녹아 무리를 이룬다. 가까운 점 3개가 커지고 색이 바뀐다. 이름표는 3D 위치를 화면에 투영해 붙인다 |
| 망점 인쇄 | 없음 | `halftone` (종이색 `scene.background`) | `tone:'none'`, `bloom` 0, `ca` 0, `grain` 0.05 | 종이 바탕에 파랑·분홍 2색. 곡면에 등고선. 공이 곡면을 따라 내려간다. 프롬프트가 화면에 없어서 프레임만 보고 만들었다 |
| 홀로그램 | 없음 | `ocean` + `holoPoints(fib(…, mask))` + `atmosphere` + `trail(arc(…))` + `orbs` 별밭 | `tone:'aces'`, `bloom` 1.1, `threshold` 0.7, `scan` 0.1 | 점으로 된 대륙이 경도를 따라 켜진다. 도시 사이를 빛 호가 잇는다. 카메라가 지구본을 돈다 |

- 어두운 돔과 빛 점으로 만든 글래스모픽, 그리고 홀로그램은 `tone-catalog.md` 의 어두운 발광 계열로 센다.
- 유리 너머로 비치는 것은 불투명 목록의 사물뿐이다. `trail`·`orbs` 는 그래서 기본이 불투명 목록이다. 유리보다 앞에 둘 것만 `front:true` 를 준다.
- 판 위의 UI 글자는 `panel` 의 canvas 에 그린다. 판이 3D 로 기울기 때문이다. 제목·설명·조건 표기는 DOM 층에 둔다. canvas 글자도 `@font-face` 로 선언한 글꼴만 쓴다.

## 결정성 규칙

- `env`·`post`·재질·geometry 는 seek 밖에서 한 번만 만든다. seek 는 값만 넣는다.
- 시간은 uniform 으로만 넣는다(`uLmT`, `uP`, `uShow`, `uReveal`, `uFlow`). 키트는 `Date`·`Clock`·`Math.random` 을 쓰지 않는다.
- 그레인의 씨앗은 `round(t × fps)` 다. `post` 의 `fps` 를 `video.json` 과 맞춘다(기본 30).
- seek 마다 모든 사물의 위치·회전·크기·`visible`·uniform 을 t 로 다시 정한다. `post.o` 도 장면마다 전부 다시 넣는다.

## 영상이 말한 프롬프트 요령과 이 파이프라인의 자리

| 영상의 요령 | 이 파이프라인에서 |
|---|---|
| 장면마다 무엇이 언제 일어나는지 초 단위로 적는다 | 3단계 장면표 |
| three.js 와 셰이더를 쓰라고 적는다 | 3단계 `## 방향` 의 톤(입체 톤) + 이 키트 |
| 카메라가 장면 사이를 날고, 장면 안의 사물도 움직인다 | `fly` + `motion-rules.md` 의 시네마틱 3D 카메라 규칙 |
| 화면 글자는 3D 와 겹치지 않게 따로 얹는다 | DOM 글자 층 + `pin` |
| 밝은 곳만 bloom, 약한 색 번짐·비네트·그레인으로 마무리한다 | `post` |
| 전체 렌더 전에 장면마다 정지 프레임을 확인한다 | 6단계 `--snap`·`--det` |
| t 하나로 모든 애니메이션을 정한다 | seek 계약 |

## 잰 값 (2026-11-10, 이 Mac · Apple M4, ANGLE Metal, 1920×1080)

- `render.mjs --snap … --det` 로 시험 페이지의 10개 시각(룩마다 2개)을 쟀다. 8 넘게 다른 화소는 0개였다.
- 스냅 20장과 페이지 열기 2회가 17초였다.
- 시험 페이지 전체(15초, 450프레임)를 `render.mjs` 로 찍는 데 147초가 걸렸다(작업자 4개, 프레임당 약 0.33초). 후처리 없는 three.js 장면과 비교한 값은 재지 않았다.

## 아직 안 한 것

- 실제 영상에서는 아직 쓰지 않았다. 첫 영상의 6단계 검수 결과를 여기에 더한다.
- 액체 금속의 갈라짐은 구 여러 개를 겹쳤다 벌리는 방식이다. 구 사이가 이어진 채 늘어나는 모양(메타볼)은 없다.
- 육지 자료는 넣지 않았다. `fib(n, mask)` 의 `mask(lat, lon)` 는 영상 쪽에서 준다. 시험 페이지의 육지는 가짜 무늬다.
- `clay` 의 녹는 구멍은 그림자에 반영되지 않는다. 그림자는 녹기 전 모양으로 진다.
- 서리 유리 너머의 가는 빛 줄은 흐려질 때 계단 무늬가 조금 보인다(three 의 투과 버퍼 밉맵).
- Windows·소프트웨어 GL(SwiftShader)에서는 재지 않았다.
