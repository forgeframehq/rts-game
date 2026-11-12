# Dawn of Dynasties, Godot edition

A separate edition of the game in Godot 4.4 (GL Compatibility, portrait). The web edition in the repo root is untouched.

- `sim/`: the rules, ported line for line from `js/` (d = data, m = map and pathfinding, e = entities, g = match and step, maps = map types). No drawing code.
- `view/`: the match on screen. Painted buildings, trees and mines from `assets/manifest.json` stand as sprites in a 3D scene under a fixed 30° orthographic camera; units are rigged 3D models (`models/`) playing clips from `anims/`.
- `data/gamedata.json` is written from `js/data.js` by `node tools/export_godot_data.mjs`; `data/unit_anims.json` comes from the `tools/render3d` job files.
- `assets/` is not committed: run `tools/godot_sync_assets.sh` from the repo root, then `godot --headless --path godot --import`.

Checks:
- `godot --headless --path godot res://tests/sim_test.tscn` must print the same numbers as `node tools/godot_parity.js`.
- `DOD_SHOT=out.png DOD_DEMO=1 DOD_RUN=14 DOD_ZOOM=3 godot --path godot --rendering-driver opengl3 --resolution 720x1280` saves a screenshot (use `xvfb-run` on a server).

Models: `node tools/godot_models/shrink.mjs <rig.glb> godot/models/<civ or region>_<unit>[_m|_f].glb 5000` (needs `npm i @gltf-transform/core @gltf-transform/functions meshoptimizer sharp`). Rigs are on the `models` branch.
