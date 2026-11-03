#!/bin/bash
# Re-render the farming and mining motions for every dynasty's villagers.
cd "$(dirname "$0")/.."
for civ in britons franks byzantines chinese; do for sx in m f; do
  python3 - "$civ" "$sx" <<'PY'
import json, sys
civ, sx = sys.argv[1], sys.argv[2]
d = json.load(open('tools/render3d/villager_jobs_f.json'))
d['model'] = f'{civ}_villager_{sx}_rig.glb'
d['anims'] = [a for a in d['anims'] if a['name'] in ('farm', 'mine')]
json.dump(d, open('tools/render3d/_work.json', 'w'))
PY
  (cd tools/render3d && python3 drive_jobs.py _work.json "$PWD/../../build/render/work_${civ}_${sx}" >/dev/null 2>&1)
  python3 tools/process_render.py build/render/work_${civ}_${sx} unit3d_${civ}_villager_${sx} 150 farm,mine >/dev/null && echo "done $civ $sx"
done; done
rm -f tools/render3d/_work.json
