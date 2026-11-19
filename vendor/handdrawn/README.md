# 손그림·수채 매체 키트 (hand.js)

- 무엇 · canvas 2D 에 손그림 선과 수채 판을 그리는 함수 묶음이다. 일반 `<script>` 로 읽으면 전역 `HAND` 가 생긴다. WebGL 은 쓰지 않는다.
- 출처 · animate `kit/core.js` 와 mg-styles-15 `demos/05-cel-boil/js/engine.js` 를 옮겨 고쳤다 (MIT, `LICENSE`). 원본은 전역 `ctx`·`B` 를 썼다. 이 판은 둘 다 인자로 받는다.

| 함수 | 하는 일 |
|---|---|
| `rngKey(...keys)` | 문자열·숫자 키 → 씨앗 난수 `f()`. `f.r(a, b)` 범위, `f.n(amt)` ±amt |
| `wobble(P, closed, amt, key, B)` | 점 배열에 손 떨림을 더한 새 점 배열 |
| `ink(ctx, P, {frac, w, color, key, B, closed, amt, double})` | 떨리는 선. `frac` 으로 그려지는 등장 |
| `paint(ctx, P, {fill, tex, key, B, line, w})` | 떨리는 면 + 질감(`tex: [{k:'hatch'\|'pencil'\|'stipple', ...}]`) + 외곽선 |
| `hatch` · `pencil` · `stipple` `(ctx, P, {...})` | P 안쪽에 빗금 · 색연필 · 점묘. 질감은 보통 `paint` 의 `tex` 로 그린다. 직접 부르면 떨지 않은 P 를 넘긴다(떨린 P 를 넘기면 칸마다 줄 수가 바뀐다) |
| `ribbon(ctx, P, wfn, {color})` | 굵기가 변하는 붓 선. `wfn(u)` 가 굵기(px) |
| `washPlate(w, h, shapeP, {seed, layers, alpha, color, edge})` | 수채 판 canvas 를 돌려준다 |
| `trace(ctx, P, closed)` · `subPath(P, frac)` | 경로 만들기(clip·마스크용) · 앞부분 자르기 |

## 쓰는 법

1. `cp vendor/handdrawn/hand.js videos/<id>/assets/` 로 복사한다. `vendor/three` 와 같은 방식이다.
2. `<script src="../assets/hand.js"></script>` 로 읽는다.

```js
const { ink, paint, ribbon, washPlate } = HAND;
const plates = [0, 1, 2].map(v => washPlate(320, 320, SHAPE, { seed: v, color: '#5f9c5c' }));  // 로드 때 3장 굽는다
window.seek = function (t) {
  const B = boilN(t);                         // 떨림 칸. 떨지 않는 요소는 B = 0
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(paper, 0, 0);                 // 로드 때 구운 종이
  ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(plates[B], x, y); ctx.globalCompositeOperation = 'source-over';
  paint(ctx, FACE, { key: 'face', B, fill: '#f0c55a', tex: [{ k: 'hatch', angle: 0.3, gap: 9 }] });
  ink(ctx, LINE, { key: 'l1', B, frac: hand(pr(t, 1, 0.8)) });
};
```

## 결정성 규칙

- 프레임마다 `clearRect` 뒤 전부 다시 그린다. 앞 프레임의 그림에 덧그리지 않는다.
- 떨림 칸 번호 `B` 는 `boilN(t)` 처럼 t 에서만 만든다. `key` 는 요소마다 다르게 준다. 같은 `key` 는 같은 모양이 된다.
- 떨지 않는 층(종이·바탕 그림)은 로드 때 오프스크린 canvas 에 한 번 그리고 seek 에서는 `drawImage` 만 한다.
- 수채 판은 로드 때 `washPlate` 로 굽는다. seek 는 `plates[B]` 를 고르고 놓기만 한다. 사물마다 seed 를 달리한 3장을 쓴다.
- "칠해지는" 등장은 판을 다시 칠하지 않고 마스크(`trace` 로 만든 경로에 `clip`)로 공개한다.

## 글자

- 글자는 canvas 에 그리지 않는다. canvas 위에 DOM 층을 올려 쓴다. 글꼴 규칙(`motion-rules.md` 의 `## 글자`)과 `render.mjs` 의 글꼴 검사가 그대로 적용된다.

## 잰 값 (2026-10-24, 이 PC · Intel Arc, 1920×1080)

- 시험 페이지(해칭 면 3, 떨리는 선 10, 연필 채움, 점묘, ribbon 2, 수채 사물 3)의 seek 는 1.4~2.1ms 였다(중앙값).
- seek + 스크린샷은 중앙값 141~153ms 였다. 대부분 PNG 스크린샷 시간이다. 종이 그레인을 뺀 판은 112~118ms, 같은 조건의 첫 작업 영상은 170~199ms 였다.
- `render.mjs --snap … --det` 에서 8 넘게 다른 화소는 0개였다.
- 실제 영상에서는 아직 쓰지 않았다. 수묵 판(먹색 `washPlate`·먹선 `ribbon`)과 마스크 공개는 시험하지 않았다. 첫 영상의 6단계 검수 결과를 여기에 더한다.
