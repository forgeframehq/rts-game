#!/bin/bash
# Copies the art the Godot edition shares with the web edition into godot/assets (not committed).
# Run from the repo root before opening or exporting the Godot project.
set -e
mkdir -p godot/assets
cp assets/manifest.json assets/stages.json godot/assets/
cp assets/*.png godot/assets/
for d in ground stages ui; do rm -rf godot/assets/$d; cp -r assets/$d godot/assets/$d; done
echo "godot/assets: $(find godot/assets -type f | wc -l) files, $(du -sh godot/assets | cut -f1)"
