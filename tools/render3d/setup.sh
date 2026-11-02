#!/bin/bash
# Put everything drive_jobs.py needs next to it: three.js in lib/, and the rigged models
# and motion files from the `models` branch.
#
#   bash tools/render3d/setup.sh
#
# Rendering is local and free. Meshy credits are spent only on rigging a model and on
# generating a motion; once the GLB is on the `models` branch, every render from it
# costs nothing, for ever. That is why this script exists: without it the pipeline has
# to be rebuilt by hand, and rebuilding it by hand is how you end up paying twice.
#
# MESHY DELETES TASKS AFTER ABOUT THREE DAYS. Anything newly rigged or animated must be
# pushed to the `models` branch inside that window or it is gone and must be bought again.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

THREE=0.160.0        # render.html is written against r160; a newer three.js moves things

if [ ! -f lib/three.module.js ]; then
  echo "installing three@$THREE"
  npm install --silent --no-save "three@$THREE"
  mkdir -p lib/loaders lib/utils
  cp node_modules/three/build/three.module.js lib/
  cp node_modules/three/examples/jsm/loaders/GLTFLoader.js lib/loaders/
  cp node_modules/three/examples/jsm/utils/BufferGeometryUtils.js lib/utils/
  # the examples import the bare name "three", which a plain <script type=module> cannot
  # resolve without an import map; point them at the copy sitting next to them instead
  sed -i "s|} from 'three';|} from '../three.module.js';|" lib/loaders/GLTFLoader.js
  sed -i "s|from 'three';|from '../three.module.js';|" lib/utils/BufferGeometryUtils.js
fi

# rigged models and motion clips live on the models branch, not on main
git -C "$HERE/../.." fetch -q origin models 2>/dev/null || true
for f in villager_m_rig.glb villager_f_rig.glb swordsman_rig.glb spearman_rig.glb \
         archer_rig.glb longbowman_rig.glb knight_rig.glb \
         villager_m_anim.glb villager_m_anim2.glb combat_anim.glb combat2_anim.glb sit_anim.glb; do
  if [ ! -f "$f" ] && git -C "$HERE/../.." cat-file -e "origin/models:$f" 2>/dev/null; then
    git -C "$HERE/../.." show "origin/models:$f" > "$f"
    echo "fetched $f"
  fi
done

echo
echo "ready. render an animation with, for example:"
echo "  python3 tools/render3d/drive_jobs.py tools/render3d/j_cata.json out_cata"
echo "  python3 tools/process_render.py out_cata unit3d_byzantines_cataphract_m 110"
