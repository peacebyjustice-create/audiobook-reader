#!/bin/sh
# AC-3 메모리 시험용 1GB mp3와 짝 SRT 생성 → local-fixtures/big-1gb.{mp3,srt}
# 320kbps 모노 CBR로 약 6.9시간(=1GB). 톤 주파수는 make-tone.sh와 같은 규칙
set -e
OUT="$(dirname "$0")/../local-fixtures"
mkdir -p "$OUT"
DUR=25000
ffmpeg -v error -y -f lavfi -i "aevalsrc=0.3*sin(2*PI*(400+20*mod(floor(t)\,100))*t):s=44100:d=$DUR" -ac 1 -c:a libmp3lame -b:a 320k "$OUT/big-1gb.mp3"
python3 -I - "$OUT/big-1gb.srt" "$DUR" <<'PY'
import sys
path, dur = sys.argv[1], int(sys.argv[2])
def ts(ms):
    h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
with open(path, "w", encoding="utf-8") as f:
    for i, t in enumerate(range(0, dur * 1000 - 5000, 5000)):
        f.write(f"{i+1}\n{ts(t)} --> {ts(t+4500)}\nTone segment number {i+1} at second {t//1000}.\n\n")
PY
ls -la "$OUT"/big-1gb.*
