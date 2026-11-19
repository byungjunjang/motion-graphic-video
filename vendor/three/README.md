# three.js (내장본)

- 버전 · three@0.186.1 (MIT, `LICENSE`)
- 파일 · `three.min.js` — ES 모듈을 esbuild 로 묶은 IIFE 판. 전역 `THREE` 를 만든다.
- 이유 · 화면은 `file://` 로 열린다. Chrome 은 `file://` 에서 ES 모듈 import 를 막으므로 일반 `<script>` 로 읽히는 판을 둔다. CDN 은 쓰지 않는다.
- 쓰는 법 · 3D 톤 영상만 `cp vendor/three/three.min.js videos/<id>/assets/` 로 복사하고 `<script src="../assets/three.min.js"></script>` 로 읽는다.

다시 만들 때:

```bash
mkdir /tmp/tb && cd /tmp/tb && npm init -y && npm i three@<버전> esbuild
echo "export * from 'three';" > entry.js
npx esbuild entry.js --bundle --minify --format=iife --global-name=THREE --outfile=three.min.js
```
