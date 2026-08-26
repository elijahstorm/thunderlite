#!/usr/bin/env bash
#
# Write a SILENT placeholder track, in both formats the audio bank ships.
#
# Some slots in the manifest are wired up and deliberately empty: the code path,
# the timing window and the mix behaviour around them are all worth keeping, but
# the track that used to fill them was worse than nothing. `game/intro` is the
# live example — the match-start fanfare was cut, and the director still holds
# the bed back for its window, which opens the match softly on its own.
#
# A silent file, rather than deleting the asset, keeps the slot honest: nothing
# 404s, nothing needs a null check, and dropping a real recording over the two
# files restores the sting with no code change.
#
# Usage:
#   scripts/audio/gen-silent-track.sh <path-without-extension> [seconds]
#
# Example (regenerate the match-start placeholder):
#   scripts/audio/gen-silent-track.sh static/game/sounds/music/game/intro 3.5
#
# Note: this ffmpeg build has no libvorbis, so the ogg uses the native (nominally
# experimental) vorbis encoder. For silence that is fine — both outputs measure
# at the 16-bit noise floor, -91 dBFS.

set -euo pipefail

if [ $# -lt 1 ]; then
	echo "usage: $0 <path-without-extension> [seconds]" >&2
	exit 1
fi

base="$1"
seconds="${2:-3.5}"

mkdir -p "$(dirname "$base")"

# 44.1 kHz stereo matches the rest of the bank, so nothing has to resample.
ffmpeg -v error -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t "$seconds" \
	-strict -2 -c:a vorbis -b:a 64k "${base}.ogg"
ffmpeg -v error -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t "$seconds" \
	-c:a libmp3lame -b:a 64k "${base}.mp3"

echo "wrote ${seconds}s of silence:"
for f in "${base}.ogg" "${base}.mp3"; do
	printf '  %s (%s bytes)\n' "$f" "$(wc -c <"$f" | tr -d ' ')"
done
