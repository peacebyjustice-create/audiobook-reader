#!/bin/sh
# 진단(/diag)용 톤 파일 생성: 매초 주파수가 400 + 20 × (초 mod 100) Hz로 바뀜.
# 사용: sh scripts/make-tone.sh [길이(초), 기본 7200]  → local-fixtures/tone-*.{mp3,m4a}
set -e
DUR=${1:-7200}
OUT="$(dirname "$0")/../local-fixtures"
mkdir -p "$OUT"
SRC="aevalsrc=0.4*sin(2*PI*(400+20*mod(floor(t)\,100))*t):s=44100:d=$DUR"
ffmpeg -v error -y -f lavfi -i "$SRC" -ac 1 -c:a libmp3lame -b:a 64k "$OUT/tone-cbr.mp3"
ffmpeg -v error -y -f lavfi -i "$SRC" -ac 1 -c:a libmp3lame -q:a 6 "$OUT/tone-vbr.mp3"
ffmpeg -v error -y -f lavfi -i "$SRC" -ac 1 -c:a aac -b:a 64k -movflags +faststart "$OUT/tone.m4a"
ls -la "$OUT"/tone-*
