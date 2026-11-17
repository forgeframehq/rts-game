#!/bin/bash
# Copies the art the Godot edition shares with the web edition into godot/assets (not committed).
# Run from the repo root before opening or exporting the Godot project.
set -e
mkdir -p godot/assets
cp assets/manifest.json assets/stages.json godot/assets/
cp assets/*.png godot/assets/
for d in ground stages ui sound; do rm -rf godot/assets/$d; cp -r assets/$d godot/assets/$d; done
# the pre-battle films: Godot plays Ogg Theora, so the portrait mp4s are converted here
mkdir -p godot/assets/video
for f in assets/video/dyn_*_p.mp4; do
  n=$(basename "$f" _p.mp4)
  [ -f "godot/assets/video/$n.ogv" ] || ffmpeg -hide_banner -loglevel error -y -i "$f" -vf "scale=540:-2" -c:v libtheora -q:v 6 -c:a libvorbis -q:a 4 "godot/assets/video/$n.ogv"
done
echo "godot/assets: $(find godot/assets -type f | wc -l) files, $(du -sh godot/assets | cut -f1)"
