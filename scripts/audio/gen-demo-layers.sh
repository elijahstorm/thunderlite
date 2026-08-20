#!/usr/bin/env bash
#
# Build a DEMO set of adaptive bed layers from a single finished track.
#
# This is scaffolding, not a soundtrack. Real layers come from a composer or an
# adaptive pack, where each layer is its own performance. Here we only have
# finished stereo mixes, and you cannot un-mix a stereo file back into
# instruments. So instead we split one track by FREQUENCY BAND and hand the
# bands to the engine as layers:
#
#   bed    0 - 400 Hz      muffled low foundation
#   pulse  400 - 1200 Hz   low-mid body
#   bass   1200 - 3500 Hz  upper-mid presence
#   melody 3500 Hz +       air and detail
#
# Because the stack is cumulative, intensity 1 sounds like the track heard
# through a wall and intensity 4 reconstructs the full mix. That happens to be a
# genuine production technique (filter automation), so it demos the mechanic
# honestly: you really do hear the bed open up and close down with the game.
#
# The two color layers are derived from the same source so they stay in key:
#   accent   6 kHz + shimmer, attenuated
#   texture  reverb wash, heavily filtered, attenuated
#
# Known demo compromises, all fixed by real layers:
#  - the loop point is a soft fade, not a seamless join, so there is a gentle
#    dip once per loop
#  - every layer dips together, since they share one source
#  - the color layers double-count spectrum the stack already covers
#
# Usage:
#   scripts/audio/gen-demo-layers.sh [-i SOURCE] [-s SECONDS] [-o START] [-f PHRASE]
#
#   -i  source audio (default: static/game/sounds/music/game/player.ogg)
#   -s  loop length in seconds, rounded down to a whole number of phrases
#   -o  offset into the source to start from
#   -f  phrase length in seconds; must match MusicDirector's phraseSeconds
set -euo pipefail

SRC="static/game/sounds/music/game/player.ogg"
SECONDS_TARGET=96
OFFSET=30
PHRASE=8
OUT_DIR="static/game/sounds/music/layers"

while getopts "i:s:o:f:h" opt; do
	case "$opt" in
		i) SRC="$OPTARG" ;;
		s) SECONDS_TARGET="$OPTARG" ;;
		o) OFFSET="$OPTARG" ;;
		f) PHRASE="$OPTARG" ;;
		h) sed -n '2,40p' "$0"; exit 0 ;;
		*) exit 2 ;;
	esac
done

command -v ffmpeg >/dev/null || { echo "error: ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
[ -f "$SRC" ] || { echo "error: source not found: $SRC" >&2; exit 1; }

# Snap the loop to a whole number of phrases, so a phrase edge always coincides
# with the loop point and re-arrangements stay on the grid across a wrap.
PHRASES=$(( SECONDS_TARGET / PHRASE ))
[ "$PHRASES" -ge 2 ] || { echo "error: need at least 2 phrases (-s must be >= 2*-f)" >&2; exit 1; }
LEN=$(( PHRASES * PHRASE ))
FADE=1.5

echo "source     : $SRC"
echo "loop       : ${LEN}s (${PHRASES} phrases of ${PHRASE}s) from +${OFFSET}s"
echo "output     : $OUT_DIR"
echo

mkdir -p "$OUT_DIR"

# Fade both ends so the loop point does not click. `atrim` + `asetpts` rebases
# timestamps, which vorbis needs to report a correct duration.
loop_window="atrim=start=${OFFSET}:duration=${LEN},asetpts=N/SR/TB,afade=t=in:st=0:d=${FADE},afade=t=out:st=$(echo "$LEN - $FADE" | bc):d=${FADE}"

# layer_name | band / character filter
render() {
	local name="$1" chain="$2"
	printf '  %-8s ' "$name"
	for fmt in ogg mp3; do
		local args=()
		# Opus rather than Vorbis: this ffmpeg ships libopus but not libvorbis, and
		# opus is the better codec anyway. Browsers that answer canPlayType('audio/ogg')
		# all decode opus-in-ogg; Safari answers '' and falls through to the mp3.
		# Opus only accepts 48k, so the sample rate is per-format.
		if [ "$fmt" = "ogg" ]; then args=(-c:a libopus -b:a 112k -ar 48000)
		else args=(-c:a libmp3lame -b:a 112k -ar 44100); fi
		ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
			-af "${loop_window},${chain}" \
			-ac 2 "${args[@]}" "$OUT_DIR/${name}.${fmt}"
	done
	# Both formats must carry the SAME audio — the engine picks one per browser via
	# canPlayType, and a mismatch means players hear different music on different
	# browsers. (That bug shipped in the old bank; asserting here so it cannot again.)
	local d_ogg d_mp3
	d_ogg=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/${name}.ogg")
	d_mp3=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/${name}.mp3")
	if [ "$(printf '%.0f' "$d_ogg")" != "$(printf '%.0f' "$d_mp3")" ]; then
		echo "MISMATCH ogg=${d_ogg}s mp3=${d_mp3}s" >&2; exit 1
	fi
	echo "ok  ${d_ogg%.*}s  ogg $(du -h "$OUT_DIR/${name}.ogg" | cut -f1)  mp3 $(du -h "$OUT_DIR/${name}.mp3" | cut -f1)"
}

echo "rendering layers:"
# Cumulative stack: ascending bands, so a prefix reads as a filter opening up.
render bed     "lowpass=f=400"
render pulse   "highpass=f=400,lowpass=f=1200"
render bass    "highpass=f=1200,lowpass=f=3500"
render melody  "highpass=f=3500"
# Color: attenuated so they tint the bed instead of competing with it.
render accent  "highpass=f=6000,volume=-9dB"
render texture "lowpass=f=2000,aecho=0.8:0.9:120|250|480:0.5|0.35|0.2,volume=-12dB"

echo
echo "total: $(du -sh "$OUT_DIR" | cut -f1)"
echo
echo "Set MusicDirector phraseSeconds=${PHRASE} to match this render."
echo "Audition at /dev/audio."
