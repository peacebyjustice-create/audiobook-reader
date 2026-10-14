# 오디오북리더

텍스트(md/txt, epub/pdf는 변환) + 낭독 mp3 + Whisper 전사 srt를 받아, 책 원문 위에서 재생 중인 문장을 강조·자동 스크롤하고 문장 단위 이동·구간반복을 하는 리더 앱(PWA).

## 현재 상태 (2026-10-14)
- **PRD 확정: `PRD.md`가 정본.** Q1=C(처음부터 책 정렬), 영어+한국어, 나머지 ★추천값.
- M-1 환경 준비 완료(Vite+React+TS, Vitest, fast-check, Playwright 패키지 설치. 브라우저 바이너리는 E2E 시작할 때 설치). 다음은 **M0 골격**.
- 저장소: `~/dev/audiobook-reader`(이 폴더). `samples` → 외장 샘플 폴더 심볼릭 링크(.gitignore). 테스트 `npm test`(Vitest+fast-check), 빌드 `npm run build`.
- 배경 자료: `PRD_질문지.md`(질문·답변 기록, 0-3 샘플 분석, 3장 메모리, 4장 리스크 R1~R7), `docs/리서치_원자료.json`(출처 URL).
- 샘플: `외장 디스크의 샘플 폴더` (영어 Shortform 가이드 1,415세트, ElevenLabs TTS, CBR mp3, 원문 거의 그대로 낭독). 읽기 전용으로만 사용.
- Mac 개발 환경: node 25, git, ffmpeg/ffprobe 7, Homebrew, python3.12. pandoc 없음.

## 확정 사항 요약
- 대상: Android 휴대폰 + PC 브라우저(Windows/Mac). iOS 제외. PC 먼저 완성.
- 책 정렬 모드가 기본. 퍼지 정렬(자막에 없는 본문은 건너뛰고, 약간의 오타는 무시). SRT 본문 모드는 정렬 실패 시 폴백.
- 한국어는 한국어 책 + 한국어 오디오 세트로 별도 사용(번역 병렬 보기 아님). 한국어 샘플은 아직 없음.
- 사용자는 구현 용이성을 위해 포맷·기능을 양보할 수 있음. 트레이드오프는 질문으로 확인.

## 구현 시 금지 규칙 (1GB 오디오 대비)
- 오디오는 `<audio src=URL.createObjectURL(file)>`로만 재생.
- `file.arrayBuffer()`, `FileReader.readAsArrayBuffer`, 전체 `decodeAudioData`, peaks 없는 파형 라이브러리, 오디오 파일 해시 계산 금지.
- 앱 내부 보관은 `file.stream().pipeTo(OPFS)` 스트리밍으로만.
- 정렬은 Web Worker에서, 입력 크기 상한을 두고 실행.
- `samples/`의 사용자 파일은 커밋하지 않음(.gitignore). 저장소에는 기대값 숫자만.
- core 로직은 DOM 없는 순수 TypeScript + Vitest. 마일스톤 범위 밖 기능 먼저 만들지 않음.
