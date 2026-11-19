# motion-graphic-video

Claude Code 로 모션그래픽 소개 영상을 만드는 작업 폴더입니다.
HTML 한 파일이 시간 t 의 화면을 계산하고, Chrome 이 프레임을 찍고, ffmpeg 가 소리와 합쳐 mp4 를 만듭니다. 영상 편집 프로그램은 쓰지 않습니다.

![30초 홍보 영상](docs/media/promo.gif)

위 홍보 영상도 이 저장소로 만들었습니다. 영상 속 클립 벽과 회전 목마의 클립은 이 저장소로 만든 실제 영상입니다.
[mp4 로 보기](docs/media/promo.mp4) · 30초 · 1920×1080 · 소리 없음

## 이렇게 동작합니다

```
소개할 대상(URL·문서·설명)
  → 사실 확인 (FACTS.md)
  → 레퍼런스 후보 6개 비교 화면 → 사람이 1개 고름        ← 확인 지점 1
  → 스토리보드 확인 화면 → 사람이 승인                   ← 확인 지점 2
  → 소리 (ElevenLabs · 선택)
  → 화면 코드 (src/index.html 의 window.seek(t))
  → 검수 시트·결정성 검사 → 렌더 → mp4
```

- 사람이 고르는 곳은 두 곳뿐입니다. 나머지는 Claude Code 가 진행합니다.
- 같은 t 에는 항상 같은 화면이 나옵니다. 그래서 프레임을 순서 없이 나눠 찍어도 결과가 같습니다.
- 레퍼런스는 공개된 모션그래픽 예시와 표현 기법 데모를 모은 색인(약 1,000건)에서 찾습니다. 영상을 보고 톤을 판정한 항목만 후보로 나옵니다. 문장과 브랜드 이름은 옮기지 않고 구조·박자·전환·타이포 처리만 참고합니다.
- 레퍼런스를 톤별로 묶은 카탈로그는 웹에서 바로 볼 수 있습니다 → [모션그래픽 레퍼런스 카탈로그](https://motion-reference-catalog.vercel.app/)

## 필요한 것

| 구분 | 항목 | 용도 |
|---|---|---|
| 필수 | [Claude Code](https://claude.com/claude-code) | 전체 진행 (스킬이 `.claude/skills/` 에 들어 있습니다) |
| 필수 | Node.js 24 이상 | 렌더러, 확인 화면 |
| 필수 | Google Chrome (시스템 설치) | 프레임 촬영 |
| 필수 | ffmpeg | 영상·소리 합성 |
| 필수 | Python 3 | 소리 합성 (`scripts/mix.py`) |
| 선택 | Python 패키지 `numpy` `pillow` `scipy` | 음악 박자 분석, AI 이미지 배경 지우기 |
| 선택 | ElevenLabs 커넥터 (claude.ai) | 내레이션·음악·효과음 생성. **크레딧이 듭니다** |
| 선택 | [Codex CLI](https://github.com/openai/codex) + ChatGPT 로그인 | AI 일러스트 생성. **ChatGPT 요금제 한도에서 나갑니다** |
| 선택 | `whisper` 명령 (`brew install openai-whisper`) | 내레이션 단어 시각 측정 |

ElevenLabs 커넥터가 없어도 영상을 만들 수 있습니다. 가진 음원 파일을 넣거나, 소리 없이 만듭니다.

macOS (Apple Silicon) 에서 확인했습니다. 스크립트에 Windows 대응 코드가 있지만 이 공개본으로는 시험하지 않았습니다.

## 설치

```bash
git clone https://github.com/byungjunjang/motion-graphic-video.git
```

```bash
cd motion-graphic-video && npm i
```

선택 기능을 쓰려면 Python 패키지를 설치합니다.

```bash
python3 -m pip install numpy pillow scipy
```

## 비용이 드는 곳

- **ElevenLabs** · 스토리보드를 승인한 뒤에만 생성합니다. 같은 생성을 재시도하지 않게 스킬에 적혀 있습니다.
- **Codex 이미지** · 일러스트가 필요한 톤에서만 씁니다. 처음에는 디자인 시트 1장과 장면 그림 3~6장만 만듭니다.
- 렌더와 합성은 로컬에서 하므로 비용이 없습니다.

## 폴더 구조

```
.claude/skills/
  motion-video/        영상 제작 단계 (0~8단계) 와 레퍼런스 문서
  motion-catalog/      카탈로그에서 스타일을 먼저 고르는 흐름
  motionmaxxing/       렌더 측정 도구를 빌려 쓰는 외부 스킬 (Apache-2.0)
  codex-image/         AI 이미지 생성 스킬 (MIT)
scripts/
  refs.mjs             레퍼런스 색인·검색·후보 비교 화면
  catalog.mjs          톤별 카탈로그 화면
  storyboard.mjs       스토리보드 확인 화면
  render.mjs           프레임 촬영, 검수 시트, 결정성 비교
  mix.py               소리 합성 → mp4
  audio-probe.py       길이·무음·박자 측정
  key.py               AI 이미지의 마젠타 바탕 지우기
references/            분석 노트, 톤 판정 (색인 파일은 처음 실행할 때 만들어집니다)
templates/starter/     새 영상의 본보기
vendor/                three.js, 손그림 키트, 3D 재질 키트, 종이 질감
videos/<id>/           영상 한 편 (git 에 올라가지 않습니다)
```

자세한 규칙은 `CLAUDE.md` 와 `.claude/skills/motion-video/SKILL.md` 에 있습니다. 두 파일은 Claude Code 가 읽는 지시문입니다.

## 지켜야 할 것

- 실존 브랜드의 로고·제품 이미지는 권리자가 허락한 파일만 씁니다.
- 레퍼런스 영상의 문장과 브랜드 이름을 옮기지 않습니다.
- 화면에 쓰는 숫자·조건·이름은 원문에서 확인한 것만 씁니다.
- ElevenLabs 로 만든 음원의 사용 조건은 가입한 요금제를 따릅니다.

## 라이선스

이 저장소에서 직접 쓴 코드와 문서는 [MIT](LICENSE) 입니다.
함께 들어 있는 외부 구성 요소와 레퍼런스 출처는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 를 보세요.
