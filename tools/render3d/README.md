# 3D → sprite renderer
Renders a rigged Meshy GLB into 8-direction isometric sprite sheets (S SE E NE N NW W SW).
1. Put `render.html`, `drive_jobs.py`, jobs file, `lib/` (three.js r160 + GLTFLoader) and the GLBs in one folder.
2. `python3 drive_jobs.py villager_jobs.json out_dir` (female: `villager_jobs_f.json`, borrows the male clips via `clipsUrl`).
3. `python3 tools/process_render.py out_dir unit3d_britons_villager_m 150`
Tools/props are built in code (see TOOLS in render.html). Models (GLB) are not committed; keep them out of the repo.
