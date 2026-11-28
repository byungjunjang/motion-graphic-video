# 도구 점검과 설치

Claude Code 와 Codex 가 따르는 문서다. 영상 작업을 시작할 때(mv 0단계, motion-catalog 0단계) 필요한 도구가 있는지 확인하고, 없으면 설치한다.

## 원칙

- 사용자에게 먼저 묻지 않고 확인하고 설치한다. 설치 명령에 실행 승인 창이 뜨면 사용자가 허락한다.
- 비밀번호, 관리자 권한, 계정 로그인이 필요한 일만 사용자에게 맡긴다. 그때는 사용자가 실행할 명령을 코드 블록으로 하나씩 적고, 무엇을 위한 것인지 한 줄로 적는다.
- 패키지 관리자(macOS `brew`, Windows `winget`, Linux `apt`)와 공식 배포처만 쓴다. 인터넷에서 찾은 설치 스크립트나 실행 파일을 내려받지 않는다.
- 필수 도구는 매번 확인한다. 선택 도구는 그 기능을 쓰는 단계에 처음 들어갈 때 확인한다.
- 설치한 뒤에는 확인 명령을 다시 실행한다. 확인이 통과해야 다음 단계로 간다.
- 설치하지 못한 도구가 있으면 무엇이 없고 무엇을 못 하는지 사용자에게 알린다. 선택 도구가 없으면 그 기능을 빼고 진행한다.

## 1. 필수 도구

| 도구 | 확인 | macOS | Windows | Linux |
|---|---|---|---|---|
| Node.js 24 이상 | `node -v` (v24 이상) | `brew install node` | `winget install OpenJS.NodeJS.LTS` | `sudo apt install nodejs npm` (버전이 24 아래면 사용자에게 알린다) |
| Google Chrome | macOS `ls "/Applications/Google Chrome.app"` · Windows `Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"` · Linux `which google-chrome` | `brew install --cask google-chrome` | `winget install Google.Chrome` | `npx playwright-core install chrome` (관리자 비밀번호가 필요하면 사용자에게 맡긴다) |
| ffmpeg · ffprobe | `ffmpeg -version`, `ffprobe -version` | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `sudo apt install ffmpeg` |
| Python 3 | `python3 --version` (Windows 는 `python --version`) | `brew install python` | `winget install Python.Python.3.12` | `sudo apt install python3 python3-pip` |
| 프로젝트 의존성 | `node_modules/playwright-core` 폴더가 있는가 | 저장소 루트에서 `npm ci` | 같음 | 같음 |

- 렌더러(`scripts/render.mjs`)는 시스템에 설치한 Chrome 을 쓴다(`channel: 'chrome'`). Chrome 을 띄우지 못하면 경고를 내고 Edge(`channel: 'msedge'`)로 찍는다. Chromium 으로 대신하지 않는다. Chrome 이 없으면 Edge 가 있어도 위 표대로 Chrome 을 설치한다. 한 영상을 찍다가 브라우저가 바뀌면 프레임을 처음부터 다시 찍는다.
- macOS 에 `brew` 가 없으면 Homebrew 설치는 관리자 비밀번호가 필요하다. 사용자에게 https://brew.sh 의 설치 명령을 실행하게 한다. 끝났다고 하면 이어서 설치한다.
- Windows 에 `winget` 이 없으면 사용자에게 Microsoft Store 의 "앱 설치 관리자"를 설치하게 한다.
- `winget` 으로 설치한 뒤 명령을 찾지 못하면 새 터미널에서 다시 확인한다. 그래도 없으면 설치 경로를 찾아 전체 경로로 실행한다.

## 2. 선택 도구 (쓰는 단계에서 확인)

| 도구 | 쓰는 곳 | 확인 | 설치 |
|---|---|---|---|
| Python 패키지 `numpy` `pillow` `scipy` | 소리 방식 `합성`(`synth.py`), 음악 박자 분석(`audio-probe.py --onsets`), AI 이미지 배경 지우기(`key.py`) | `python3 -c "import numpy, PIL, scipy"` | `python3 -m pip install --user numpy pillow scipy` |
| `yt-dlp` | X 게시물 레퍼런스 영상, `refs.mjs verify` | `yt-dlp --version` | macOS `brew install yt-dlp` · Windows `winget install yt-dlp.yt-dlp` · Linux `python3 -m pip install --user yt-dlp` |
| `whisper` | 내레이션 단어 시각 측정(`audio-probe.py --words`) | `whisper --help` | macOS `brew install openai-whisper` · 그 밖 `python3 -m pip install --user openai-whisper` |
| Codex CLI | AI 일러스트(`codex-image` 스킬) | `codex --version` | `npm install -g @openai/codex` |

- pip 이 `externally-managed-environment` 오류를 내면 같은 명령에 `--break-system-packages` 를 붙여 다시 실행한다. `--user` 를 함께 쓰므로 사용자 폴더에만 설치된다.
- Codex CLI 는 ChatGPT 로그인이 필요하다. 설치한 뒤 `codex login status` 로 확인한다. 로그인되어 있지 않으면 사용자에게 `codex login` 을 실행하게 한다. 로그인 전에는 AI 이미지 단계를 시작하지 않는다.
- AI 이미지 생성은 사용자의 ChatGPT 요금제 한도에서 나간다. 설치는 묻지 않지만, 생성은 원래 절차(`references/ai-image.md`)를 따른다.

## 3. ElevenLabs 커넥터 (설치하지 않는다)

ElevenLabs 는 계정 로그인이 필요한 커넥터다. 에이전트가 대신 연결하지 않는다.

- 확인 · Claude Code 는 `ToolSearch` 로 `Elevenlabs creative` 를 찾는다. Codex 는 연결된 MCP 도구 목록에서 `creative_` 로 시작하는 도구를 찾는다.
- 없으면 · mv 0단계대로 소리 방식을 `직접 음원`·`합성`·`무음` 가운데에서 정하고 진행한다. 사용자에게 연결 방법(README 의 "ElevenLabs 연결" 절)을 한 줄로 알린다. 연결을 기다리며 멈추지 않는다.
- Codex 에서 사용자가 연결을 원하면 `codex mcp add elevenlabs --url https://api.elevenlabs.io/v1/mcp-creative` 를 실행한다. 로그인 창은 사용자가 승인한다.

## 4. 점검 기록

- 처음 설치한 도구가 있으면 8단계 보고의 "확인한 것"에 도구 이름과 확인 명령의 결과(버전)를 적는다.
- 설치하지 못한 도구는 "확인하지 못한 것"에 적고, 그 때문에 빠진 기능을 함께 적는다.
