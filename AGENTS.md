# Codex에서 모션그래픽 영상 만들기

이 저장소 루트에서 명령을 실행한다. 공통 제작 규칙은 `CLAUDE.md`를 읽고, 요청에 따라 아래 원본 스킬을 끝까지 읽는다.

| 요청 | 제작 절차 |
|---|---|
| URL·문서·설명으로 영상 만들기, 기존 영상 수정·재렌더 | `.claude/skills/motion-video/SKILL.md` |
| 카탈로그에서 스타일 먼저 고르기, 공개 카탈로그 선택 결과로 만들기 | `.claude/skills/motion-catalog/SKILL.md`와 그 문서가 참조하는 motion-video 단계 |

카탈로그에서 복사한 선택 결과가 있으면 해당 레퍼런스와 소개 대상을 사용한다. 일반 제작은 후보 비교 화면에서 사용자의 선택을 받는다. 두 경로 모두 스토리보드 승인을 받은 뒤 소리와 화면을 제작한다. 결과 경로는 `videos/<id>/renders/video.mp4`다.

## Codex에서 실행할 때

- 스킬 내부의 참조 문서는 원본 스킬 폴더를 기준으로 찾는다. 프로젝트 스크립트와 템플릿은 저장소 루트를 기준으로 찾는다.
- Bash 예시는 현재 셸에 맞게 실행한다. Windows PowerShell에서는 폴더와 파일에 `New-Item`, `Copy-Item`을 쓰고 Python 3 실행 파일이 `python`이면 그 이름으로 호출한다.
- 원본의 `run_in_background`는 확인 화면 서버를 유지하라는 뜻이다. Codex에서 실행 세션을 유지하고 출력된 로컬 URL을 사용자에게 전달한다. 로컬 화면을 열 수 없으면 원본의 `--no-open` 절차로 생성한 HTML과 채팅 응답을 사용한다.
- `ToolSearch` 지시가 나오면 현재 환경의 연결 도구 목록에서 ElevenLabs를 확인한다. 사용할 수 없으면 제공받은 음원 또는 무음으로 진행하고 스토리보드에 표시한다.
- `.claude/skills/motionmaxxing/`과 `.claude/skills/codex-image/`는 원본 제작 절차에서 지정한 단계에서 사용한다.
