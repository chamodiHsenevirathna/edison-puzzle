#!/bin/sh
# Turns the numbered PNG frames written by capture-screenshots.mjs into a small looping GIF.
# Usage: sh scripts/make-explorer-gif.sh <framesDir> <output.gif>
set -eu
frames="${1:?frames directory}"
out="${2:?output gif}"
ffmpeg -y -loglevel error -framerate 6 -i "$frames/f%03d.png" \
  -vf "scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none" \
  -loop 0 "$out"
