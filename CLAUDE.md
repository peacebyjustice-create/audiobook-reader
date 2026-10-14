# 오디오북리더

텍스트(md/txt, epub/pdf는 변환) + 낭독 mp3 + Whisper 전사 srt를 받아, 책 원문 위에서 재생 중인 문장을 강조·자동 스크롤하고 문장 단위 이동·구간반복을 하는 리더 앱(PWA).

## 현재 상태 (2026-10-14)
- **PRD 확정: `PRD.md`가 정본.** Q1=C(처음부터 책 정렬), 영어+한국어, 나머지 ★추천값.
- M-1 환경 준비 완료(Vite+React+TS, Vitest, fast-check, Playwright 패키지 설치. 브라우저 바이너리는 E2E 시작할 때 설치). M0·M1 완료(정렬: 샘플 1,415권 본문 큐 99.64% 올바른 위치). **M2 리더 완료(PC)**: 서재→리더, 책 원문 강조, 구간반복, 진도·북마크 저장, 오프셋, 속도, 가사형 보기, #diag. 다음은 **M3**(수동 앵커, 허용치, 폴백 자막 문장 재구성, 챕터, Media Session, PWA 배포, 패키지, VBR 감지).
- M2 실측(PC Chrome): 이동 오차 CBR mp3 최대 31ms, AAC m4a 최대 13ms, **VBR mp3 최대 1.96초(20곳 중 18곳 초 단위 어긋남, 20분 파일)** → M3 VBR 감지·변환 안내(F23) 중요. 2초 구간 반복 끝점 초과 최대 6ms(화면 켜짐). 최장 책(문장 2,382개) 프로덕션 열기 0.22초, 이동 후 강조 10~12ms.
- 아직 실기기(Android) 미검증: 화면 꺼짐 재생·반복, 터치 길게 누르기, 블루투스 지연. 사용자가 #diag 결과 JSON을 붙여 주면 반영.
- 정렬 결과 캐시(NFR-03)는 넣지 않음: 정렬이 최대 0.15초라 필요 없음. 느려지면 추가.
- 저장소: `~/dev/audiobook-reader`(이 폴더). `samples` → 외장 샘플 폴더 심볼릭 링크(.gitignore). 테스트 `npm test`(Vitest+fast-check), 빌드 `npm run build`.
- 개발 서버 `npm run dev` 후 `/?fixture=<샘플 파일명(확장자 제외)>[&ext=m4a]`로 오디오+srt를 바로 엶(개발 전용, Range 서빙은 vite.config.ts의 samplesPlugin). `local-fixtures/`(gitignore, 직접 변환한 시험 파일)를 samples보다 먼저 찾음. 샘플 테스트 `src/core/samples.test.ts`는 samples가 있을 때만 실행.
- 구조: `src/core`(순수 TS: srt 파서, navigation, player, timeline, repeat(구간반복 상태 기계), AudioEngine+Fake, markdown/plaintext → book, sentences, normalize+spokenEn, align, alignEval), `src/audio`(HtmlAudioEngine), `src/io`(텍스트 디코딩), `src/workers`(정렬 Web Worker + 클라이언트), `src/io/store.ts`(IndexedDB: 진도 meta와 원문 text를 키 분리, 쓰기는 한 줄로 직렬화), `src/reader`(openBook·Reader·BookView), `src/library`, `src/diag`(#diag, 톤 파일은 `sh scripts/make-tone.sh [초]` → local-fixtures/).
- 정렬 리포트: `npx tsx scripts/align-report.ts [--all | --n 30 | 파일명…]`, 한 권 디버그: `scripts/align-debug.ts`(샘플 글이 출력되므로 결과를 커밋하지 말 것).
- 정렬 알려진 한계: 표를 낭독기가 다른 순서로 재구성해 읽으면 그 부분은 오디오 전용으로 빠짐. md에 없는 연습문제(Exercise) 질문은 오디오 전용이 정답. 낭독기 안내 문구는 `align.ts`의 DEFAULT_AUDIO_ONLY(_PHRASES). 한국어 경로는 실제 데이터로 아직 검증 안 됨.
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
