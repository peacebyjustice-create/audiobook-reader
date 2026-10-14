# 오디오북리더

책 원문(md·txt·epub) + 낭독 오디오(mp3·m4a) + 음성 전사 자막(srt)을 넣으면, **책 원문 위에서 지금 들리는 문장을 강조하고 따라 스크롤**하는 웹앱입니다. 문장 단위로 앞뒤 이동하고, 한 문장이나 여러 문장을 구간반복할 수 있습니다.

- 자막은 Whisper 같은 음성 인식으로 만든 것이어도 됩니다. 책과 자막의 글자가 조금 달라도(오타, 숫자 읽기, 띄어쓰기) 퍼지 정렬로 맞춥니다.
- 파일은 기기 밖으로 나가지 않습니다. 정렬도 브라우저 안(Web Worker)에서 합니다. 서버·AI를 쓰지 않습니다.
- 1GB 오디오도 통째로 읽지 않고 스트리밍으로 재생합니다.
- 대상: Android Chrome, PC Chrome/Edge.

## 쓰는 법
1. `책 추가`를 누르고 오디오 + 자막(.srt/.vtt) + 책 원문(.md/.txt/.epub, 선택)을 칸에 담은 뒤 `열기`. 여러 번 나눠 고르거나 화면에 끌어다 놓아도 됩니다.
   - EPUB은 그대로 넣으면 됩니다(DRM·고정 레이아웃 EPUB은 불가). PDF는 아직 txt로 바꿔 넣어야 합니다.
2. 문장을 누르면 거기서부터 재생합니다. 길게 누르면 반복·북마크 메뉴가 뜹니다.
3. 하단 `반복` 버튼: 누를 때마다 시작 → 끝 → 해제, 길게 누르면 지금 문장만 반복.
4. 추가한 오디오는 앱 안에 보관되어, 다음부터는 서재에서 책을 누르면 마지막 위치에서 바로 열립니다.

가변 비트레이트(VBR) mp3는 위치 이동이 수 초씩 어긋나므로 m4a로 바꿔 쓰기를 권합니다:
`ffmpeg -i 입력.mp3 -map 0:a -c:a aac -b:a 64k -ac 1 -movflags +faststart 출력.m4a`

## 개발
```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest (+fast-check)
npm run build
```
- `src/core`: DOM 없는 순수 TypeScript(자막 파서, 책 파서, 정렬 엔진, 구간반복 상태 기계 등)
- 정렬 리포트: `npm run report -- --all` (로컬 `samples/` 폴더가 있을 때)
- 설계 문서: [PRD.md](PRD.md), 작업 규칙: [CLAUDE.md](CLAUDE.md)
- `main`에 올리면 GitHub Actions가 테스트 후 GitHub Pages로 배포합니다(`.github/workflows/deploy.yml`).
