# motion-graphic-video

HyperFrames 없이 모션그래픽 영상을 만드는 프로젝트다. HTML 한 파일이 시간 t 의 화면을 계산하고, Chrome 이 프레임을 찍고, ffmpeg 가 소리와 합친다.

영상 요청을 받으면 **반드시** `.claude/skills/motion-video/SKILL.md` 를 먼저 읽고 그 단계대로 진행한다. 단계를 건너뛰거나 순서를 바꾸지 않는다.
카탈로그에서 스타일을 먼저 고르겠다는 요청이면 `.claude/skills/motion-catalog/SKILL.md` 를 읽고 진행한다. 고른 뒤의 제작은 motion-video 의 단계를 그대로 쓴다.

## 구조

```
scripts/refs.mjs         레퍼런스 색인·검색·전문 읽기·후보 비교 화면(화면에서 선택)
scripts/catalog.mjs      스타일 레퍼런스를 톤별 장으로 묶은 카탈로그(브로셔) 화면 → references/catalog.html, 답은 videos/.catalog-choice.json. 표현 기법(am:)은 싣지 않는다. --site 는 배포용 폴더 catalog-site/ 를 만든다
scripts/storyboard.mjs   STORYBOARD.md → 확인 화면(화면에서 의견·승인). --keyframes 는 뼈대 index.html 의 장면 가운데 화면을 카드에 넣는다
scripts/lint-storyboard.mjs  STORYBOARD.md·candidates.json 이 2·3단계 규칙을 지켰는지 검사한다(고치지 않는다). --table 은 여러 영상의 규칙별 위반 수
scripts/review-server.mjs  두 확인 화면을 로컬에서 띄우고 답을 파일로 받는다
scripts/run-log.mjs      영상마다 실행 기록 run-log.json (단계 시각·후보·선택·스토리보드 회차·결함 수·렌더·수정 요청). board·storyboard·render 가 스스로 덧붙이고, 나머지는 stage·defects·revision 명령으로 적는다. check 는 빈 곳을 낸다
scripts/render.mjs       seek(t) 프레임 촬영, --snap 검수 시트, --det 결정성 비교, 글꼴 로드 검사
scripts/synth.py         ElevenLabs 가 없을 때 배경음악(분위기 5종, 마디 격자를 정점에 맞춤 → beats)과 효과음 10종을 코드로 합성한다. 내레이션은 만들지 않는다
scripts/mix.py           video.json 시간표대로 소리를 섞어 mp4 생성 (sfx 4번째 칸은 동기점 peak·onset·초)
scripts/key.py           AI 이미지(codex-image)의 마젠타 바탕을 지워 투명 PNG 로 만든다. --split 은 한 장에 그린 여러 그림을 따로 자른다
scripts/audio-probe.py   길이·무음 구간·음량 곡선 측정, --onsets --write 로 타격음·BPM·마디 첫 박·킥 → beats (영상 시각), --fit 으로 전환과 박의 오차, --peak 로 효과음 동기점
.claude/skills/motionmaxxing/scripts/look.py  7단계 렌더 측정 (G0·끝 정지·LUFS·true peak 만 읽는다)
references/ref-index.json  (git 에 넣지 않는다 · 없으면 refs.mjs index 로 만든다) 아홉 출처 레퍼런스 색인 (pm·gh·cv 세 사이트 + lo: lemo-opuscar, ms: mg-styles-15, c2: claude-video-2 스타일 명세, pn: Pinterest 의 손제작 영상, fa: AI Style Atlas 의 스타일 영상, am: aimotion 표현 기법 데모 · 발췌만, 전문 없음). tone-labels.json 에 판정이 없는 항목은 검토 대기로 보고 검색·카탈로그에서 뺀다
                           am: 은 스타일 레퍼런스가 아니라 표현 기법이다(kind: technique). 카탈로그 화면에 싣지 않고 제작 단계에서만 쓴다. 톤별 수에 세지 않고, search 는 --tech 를 줄 때만 낸다. show am:<id> 는 구현 노트를 낸다. refs.mjs index --only am 으로 am: 만 다시 받는다
catalog-site/            배포용 카탈로그 폴더 (index.html + 글꼴 2개 · git 에 넣지 않는다). catalog.mjs --site 가 만든다
references/pinterest-refs.json  pn: 항목 목록 (핀 번호·영상 주소·잰 값). 프롬프트가 없어서 영상 프레임을 보고 쓴 분석 노트 references/pinterest/<slug>.md 가 전문 자리에 온다
references/atlas-refs.json     fa: 항목 목록 (원본 사이트의 영상 주소·잰 값). pn: 과 같은 방식이다. 원본의 프롬프트와 코드는 옮기지 않고 분석 노트 references/atlas/<slug>.md 가 전문 자리에 온다
                           한 출처만 다시 받을 때는 refs.mjs index --only <lo|c2|pn|fa|am> 을 쓴다. 다른 출처 항목은 그대로 둔다
references/notes/<출처>-<slug>.md  pm:·gh:·cv: 항목의 분석 노트 (파일 이름은 id 의 쌍점을 하이픈으로 바꾼 것). 작성자의 프롬프트에 화면 지시가 없는 항목을 영상 프레임을 보고 보완한 글이다
                           show 는 노트를 먼저 내고 작성자의 프롬프트를 뒤에 붙인다. 노트를 쓰거나 고친 뒤 refs.mjs index --only notes 를 실행한다. 쓰는 법은 tone-catalog.md 의 분석 노트 줄에 있다
references/tone-keywords.json  톤 id 별 검색 단어표. refs.mjs index 가 항목마다 tones 를 붙인다
references/tone-labels.json    영상 프레임을 보고 붙인 톤 판정. 색인을 다시 만들어도 남는다. 단어표 판정보다 우선
references/ref-videos.json     항목별 영상 확인 결과 (source / x / excluded). excluded 는 색인 사용에서 빠진다. refs.mjs verify 가 채운다
vendor/three/            내장 three.js (IIFE 판, 전역 THREE). three.js 로 만드는 영상만 assets/ 로 복사해 쓴다
vendor/handdrawn/        canvas 손그림·수채 키트 hand.js (전역 HAND). 손그림·수묵·판화 톤 영상만 assets/ 로 복사해 쓴다
vendor/three-looks/      three.js 재질·후처리 키트 looks.js (전역 LOOKS). 유리·액체 금속·클레이·망점·홀로그램 + bloom. 쓰는 영상만 assets/ 로 복사한다. demo/ 는 시험 페이지
vendor/paper/texture.js  종이 결 타일 texTile · 필름 그레인 grainLayer. 콜라주·손그림 톤에서 필요한 함수만 복사해 쓴다
templates/starter/       새 영상의 본보기 (가상 앱 소개 14초). src/index.html 뼈대, video.json(무음), video.audio-example.json(소리 형식), Pretendard 글꼴 + OFL
.claude/skills/codex-image/  AI 이미지 생성 스킬 (MIT, 원작자 wjb127). Codex CLI 로그인이 필요하다
videos/<id>/             영상 한 편 (git 에 넣지 않는다 · 고객 자료와 생성 음원이 들어 있다)
  FACTS.md  STORYBOARD.md  video.json
  refs/candidates.json  refs/board.html  refs/choice.json
  storyboard.html  storyboard-feedback.json
  src/index.html         화면 (window.seek)
  src/beats.js           음악 타격음 시각 (audio-probe --onsets --write 가 만듦)
  assets/{fonts,voice,bgm,sfx,...}
  renders/video.mp4      결과물
```

## 고정 규칙

- 사람이 확인하는 지점은 두 곳이다. **레퍼런스 선택**(motion-video 는 후보 6개 중 1개, motion-catalog 는 카탈로그 전체 중 1개)과 **스토리보드 승인**. 두 곳 모두 확인 화면을 띄워 화면에서 답을 받는다. 답을 받기 전에는 다음 단계로 가지 않는다.
- 스토리보드 승인 전에는 ElevenLabs 생성을 부르지 않는다. 생성은 크레딧을 쓴다.
- 소리 생성은 ElevenLabs MCP 의 `creative_*` 도구만 쓴다(도구 이름 앞부분은 PC 마다 다르다). 다른 음성·음악 생성 도구로 대신하지 않는다. 커넥터는 선택이다. 없으면 사용자가 준 음원 파일을 쓰거나 `scripts/synth.py` 로 음악·효과음을 합성한다(motion-video 0단계). 내레이션은 ElevenLabs 로만 만든다. 외부 무료 음원을 찾아 내려받지 않는다.
- 화면에 쓰는 사실(숫자·조건·이름)은 원문에서 직접 확인한 것만 쓴다. 요약 모델의 답만 믿고 쓰지 않는다.
- 스토리보드에서 승인받은 대사·문구·길이를 바꿔야 하면, 바꾸기 전에 사용자에게 알린다.
- 실존 브랜드의 로고·제품 이미지는 사용자가 허락한 파일만 쓴다. 흉내 내어 그리지 않는다.
- 일러스트는 AI 이미지(`codex-image`)로 그릴 수 있다. 그림 안에 글자·로고를 넣지 않는다. 레퍼런스의 작가·작품·캐릭터 이름을 프롬프트에 넣거나 레퍼런스 영상의 프레임을 참조 이미지로 붙이지 않는다. 쓰는 법은 `.claude/skills/motion-video/references/ai-image.md` 에 있다.
- 레퍼런스의 문장과 브랜드 이름은 베끼지 않는다. 구조·박자·전환·타이포 처리만 가져온다.
- 표현 기법(`am:`)은 에이전트가 찾아서 쓴다. 사용자에게 기법을 고르게 하거나 묻지 않는다. 효과를 만드는 방법만 가져온다. 데모의 소재·장면·구도·문구·색·세로 형식은 옮기지 않는다. 기법 코드를 옮겨 쓰면 출처(aimotion · MIT)를 주석으로 적는다. 쓰는 법은 `.claude/skills/motion-video/references/technique-refs.md` 에 있다.
- 프롬프트 전문을 저장소에 저장하지 않는다. 색인에는 발췌만 둔다. 분석 노트(`references/notes/`, `references/pinterest/`, `references/atlas/`)는 우리가 쓴 글이라 저장소에 둔다. 노트에는 작성자의 프롬프트, 화면에 나온 문장, 실존 이름을 옮기지 않는다.
- 이 저장소는 공개 저장소다. `videos/` 와 `references/ref-index.json` 은 git 에 넣지 않는다. 문서·스크립트·커밋 메시지에 고객사·기관 이름을 쓰지 않는다. 예시는 "첫 작업 영상", "콜라주 영상"처럼 일반 표현으로 적는다.
- 결과 보고에는 확인한 것과 확인하지 못한 것을 나눠 적는다. 소리는 들을 수 없으므로 측정값으로 확인했다고 적는다.

## 카탈로그 배포

- 주소 · https://motion-reference-catalog.vercel.app (Vercel 프로젝트 `motion-reference-catalog`). 공개 주소다. 검색 엔진에는 `noindex` 로 막았다.
- 올라가는 것은 카탈로그 한 장(`index.html`)과 글꼴 2개뿐이다. 저장소의 다른 파일은 올리지 않는다.
- 갱신 · 색인·톤 판정·`scripts/catalog.mjs` 를 바꾼 뒤 `node scripts/catalog.mjs --site` → `vercel deploy catalog-site --prod`. 배포는 사용자가 요청할 때만 한다.
- 배포한 화면에는 답을 받을 서버가 없다. "만들기"를 누르면 답이 클립보드에 복사된다. 사용자가 채팅에 붙여 넣은 답을 쓴다.
- `vercel link` 는 `catalog-site/.env.local`(토큰)을 만든다. 배포 전에 지운다.
- 화면에 `<meta name="referrer" content="no-referrer">` 를 넣지 않는다. Referer 가 없으면 prompt-motion 이 포스터·영상 대신 안내 그림을 낸다. `references/catalog.html` 을 파일로 직접 열 때도 같은 이유로 `pm:` 카드에 안내 그림이 나온다.

## 환경

- Node 24, Chrome(시스템 설치), ffmpeg, python3. 의존성은 `npm i` (playwright-core 하나). AI 이미지는 Codex CLI 가 필요하다.
- 도구가 없으면 `.claude/skills/motion-video/references/setup.md` 대로 확인하고 설치한다. 사용자에게 먼저 묻지 않는다. 비밀번호·관리자 권한·로그인이 필요한 일만 사용자에게 맡긴다.
- Mac · zsh 에서 `echo ====` 는 오류가 난다. 구분선은 `echo "--"` 로 쓴다.
- Mac · `timeout` 명령이 없다.
- Windows · 명령은 Git Bash(Bash 도구)로 돌린다. 여기서는 `echo ====` 와 `timeout` 이 그대로 된다.
- Windows · PowerShell 5.1 에서는 `&&` 가 안 된다. `A; if ($?) { B }` 로 잇는다. PowerShell 의 `timeout` 은 초 단위 대기 명령이라 시간 제한으로 쓰지 않는다.
