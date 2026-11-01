# 3D → sprite renderer
Renders a rigged Meshy GLB into 8-direction isometric sprite sheets (S SE E NE N NW W SW).
1. Put `render.html`, `drive_jobs.py`, jobs file, `lib/` (three.js r160 + GLTFLoader) and the GLBs in one folder.
2. `python3 drive_jobs.py villager_jobs.json out_dir` (female: `villager_jobs_f.json`, borrows the male clips via `clipsUrl`).
3. `python3 tools/process_render.py out_dir unit3d_britons_villager_m 150`
Tools/props are built in code (see TOOLS in render.html). Models (GLB) are not committed; keep them out of the repo.

Motions come from two Meshy files on the shared skeleton: `villager_m_anim.glb` (original 10) and `villager_m_anim2.glb` (Idle_02, Charged_Ground_Slam, …), merged via `clipsUrl` (a list).
Each sheet's real loop length is stored as `cycle` in the manifest; the game plays it at that speed (clamped 7–14 fps).
Re-download GLBs any time from Meshy task history (rigging / animations endpoints) at no credit cost.
