# 제3자 구성 요소

이 저장소의 `LICENSE`(MIT)는 이 저장소에서 직접 쓴 코드와 문서에만 적용된다.
아래 구성 요소는 각자의 라이선스를 따른다. 복사하거나 다시 배포할 때는 그 라이선스도 지켜야 한다.

| 구성 요소 | 위치 | 라이선스 | 원본 |
|---|---|---|---|
| three.js | `vendor/three/three.min.js` | MIT · `vendor/three/LICENSE` | https://threejs.org |
| animate (손그림 함수 일부, 박자 분석 일부) | `vendor/handdrawn/hand.js`, `scripts/audio-probe.py` | MIT · `vendor/handdrawn/LICENSE` | https://github.com/cth9191/animate |
| mg-styles-15 (cel boil 엔진 일부) | `vendor/handdrawn/hand.js` | MIT · `vendor/handdrawn/LICENSE` | https://github.com/Vincentwei1021/mg-styles-15 |
| motionmaxxing 스킬 | `.claude/skills/motionmaxxing/` | Apache-2.0 · 그 폴더의 `LICENSE`, `NOTICE` | https://github.com/Tejashmakwana/motionmaxxing |
| codex-image 스킬 | `.claude/skills/codex-image/` | MIT · 그 폴더의 `LICENSE` (Copyright (c) 2026 wjb127) | 원작자 wjb127 |
| Pretendard 글꼴 | `templates/starter/assets/fonts/` | SIL OFL 1.1 · `Pretendard-LICENSE.txt` | https://github.com/orioncactus/pretendard |

## motionmaxxing 안의 구성 요소

`motionmaxxing` 폴더는 원본을 그대로 넣었다. 저장소에 넣은 뒤 고치지 않았다.
그 안에는 GSAP, three.js, Inter 글꼴 등이 함께 들어 있다. 각 라이선스는 그 폴더의 `NOTICE` 에 적혀 있다.
GSAP 는 오픈소스 라이선스가 아니다(GreenSock Standard "No Charge" License). 다시 배포하기 전에 https://gsap.com/standard-license 를 읽는다.

## 레퍼런스 출처

레퍼런스 색인(`references/ref-index.json`)은 저장소에 넣지 않는다. `node scripts/refs.mjs index` 가 아래 공개 출처에서 제목·링크·짧은 발췌를 받아 사용자 컴퓨터에 만든다.
레퍼런스 영상과 프롬프트의 권리는 각 작성자에게 있다. 이 도구는 구조·박자·전환·타이포 처리만 참고하고, 문장과 브랜드 이름은 옮기지 않는다.

- prompt-motion.com (`pm:`)
- yihui-dev/awesome-opus5-5-videos (`gh:`)
- claudevideo.org (`cv:`)
- lemomo-ai/lemo-opuscar (`lo:`)
- Vincentwei1021/mg-styles-15 (`ms:`)
- ItsssssJack/claude-video-2 (`c2:` · MIT)
- Pinterest 의 손제작 영상 (`pn:` · `references/pinterest-refs.json` 에는 핀 번호와 링크만 있다)
- Futurepedia 의 AI Style Atlas (`fa:` · `references/atlas-refs.json` 에는 원본 사이트의 영상 링크만 있다. 원본의 프롬프트와 코드는 옮기지 않았다)
- kstost/cokacmotion 의 aimotion 표현 기법 (`am:` · MIT). 기법 코드를 영상에 옮겨 쓰면 출처를 주석으로 적는다

`references/notes/`, `references/pinterest/`, `references/atlas/` 의 분석 노트와 `references/tone-*.json` 의 판정은 이 저장소에서 직접 쓴 글이다.
