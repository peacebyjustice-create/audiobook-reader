# 오디오북리더

텍스트(md/txt, epub/pdf는 변환) + 낭독 mp3 + Whisper 전사 srt를 받아, 책 원문 위에서 재생 중인 문장을 강조·자동 스크롤하고 문장 단위 이동·구간반복을 하는 리더 앱(PWA).

## 현재 상태 (2026-10-14)
- **PRD 확정: `PRD.md`가 정본.** Q1=C(처음부터 책 정렬), 영어+한국어, 나머지 ★추천값.
- **M0~M3 완료(PC)**. 배포: https://peacebyjustice-create.github.io/audiobook-reader/ (공개 저장소 peacebyjustice-create/audiobook-reader, main에 push하면 Actions가 테스트 후 Pages 배포). 남은 것: **실기기(Android) 확인(AC-7)** → 사용자가 #diag 결과 JSON을 붙여 주면 반영, 그다음 1~2주 사용 후 M4.
- 저장소: `~/dev/audiobook-reader`. 커밋 작성자는 GitHub noreply 주소(저장소 로컬 git config). 개인 이메일을 커밋에 넣지 말 것.
- 공개 저장소이므로 개인 계획 문서(`PRD_질문지.md`, `docs/`)는 .gitignore로 로컬에만 둠. 로컬 경로·개인 자료 설명을 커밋하지 말 것.
- 샘플: 외장 디스크의 샘플 폴더(실제 경로는 `readlink samples`). 영어 요약 가이드 1,415세트(md+TTS mp3+Whisper srt). 읽기 전용.
- 실행: `npm run dev` 후 `/?fixture=<샘플 파일명(확장자 제외)>[&ext=m4a]`(개발 전용, `local-fixtures/`를 samples보다 먼저 찾음). 테스트 `npm test`, E2E `npm run e2e`(Playwright, 1GB 픽스처는 `sh scripts/make-big-fixture.sh`), 정렬 리포트 `npm run report -- --all`.
- 구조: `src/core`(순수 TS: srt, markdown/plaintext→book, sentences, normalize+spokenEn, align(+수동 앵커), alignEval, timeline, paragraphs(자막 보기 묶음), chapters, repeat, player, mp3scan, bookPackage), `src/audio`(HtmlAudioEngine), `src/io`(decodeText, probeAudio, store=IndexedDB, download), `src/workers`(정렬 Worker), `src/reader`(openBook·Reader·BookView·useMediaSession), `src/library`, `src/diag`.
- 실측(PC Chrome): 정렬 1,415권 본문 큐 99.64% 올바른 위치·최대 145ms. 이동 오차 CBR 31ms·m4a 13ms·VBR 1.96초(→VBR 감지·30분 이상 잠금). 반복 끝점 초과 6ms. 최장 책 열기 0.22초·강조 12ms. 1GB 이동 50회 메모리 +231~239MB(AC-3 통과), 500회는 +373MB에서 평평(빈 <audio>도 +234MB에서 평평 = Chrome 미디어 캐시 상한).
- 알려진 한계: 표를 낭독기가 재구성해 읽으면 그 부분은 오디오 전용. md에 없는 연습문제는 오디오 전용이 정답. 한국어는 실제 데이터 미검증. 앱 안 브라우저 패널은 서비스워커를 막아서 PWA는 Playwright로 확인.
- Mac 개발 환경: node 25, git, gh(로그인됨), ffmpeg/ffprobe 7, Homebrew, python3.12, Playwright Chromium. pandoc 없음.

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
