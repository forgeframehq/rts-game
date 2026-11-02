# 3D → sprite renderer
Renders a rigged Meshy GLB into 8-direction isometric sprite sheets (S SE E NE N NW W SW).
1. Put `render.html`, `drive_jobs.py`, jobs file, `lib/` (three.js r160 + GLTFLoader) and the GLBs in one folder.
2. `python3 drive_jobs.py villager_jobs.json out_dir` (female: `villager_jobs_f.json`, borrows the male clips via `clipsUrl`).
3. `python3 tools/process_render.py out_dir unit3d_britons_villager_m 150`
Tools/props are built in code (see TOOLS in render.html). Models (GLB) are not committed; keep them out of the repo.

Motions come from two Meshy files on the shared skeleton: `villager_m_anim.glb` (original 10) and `villager_m_anim2.glb` (Idle_02, Charged_Ground_Slam, …), merged via `clipsUrl` (a list).
Each sheet's real loop length is stored as `cycle` in the manifest; the game plays it at that speed (clamped 7–14 fps).
Re-download GLBs any time from Meshy task history (rigging / animations endpoints) at no credit cost.

## Soldiers (Western European set, shared by Britons + Franks)
Jobs: `j_sword.json` (swordsman = militia), `j_spear.json`, `j_arch.json`. Clip sources: villager_m_anim.glb, villager_m_anim2.glb, combat_anim.glb
(Combat_Stance, Thrust_Slash, Archery_Shot, Spear_Walk, Run_02, falls). Props in render.html: sword, shield, spear, longbow, quiver.
Sheets are keyed `unit3d_<region>_<type>_m_<anim>`; the game picks civ → region (G.REGION) → western.
Meshy tasks: swordsman rig 01a19992-1133-71cc-949b-c03879b6b74a, spearman rig 01a19991-50c5-7199-ab91-5075d788442c,
archer rig 01a19991-e26f-71e4-ba0f-8027471760c5, villager rig 01a198d6-99b7-7528-9e92-210d14997b34.

## Cavalry
The horse is built and animated in code (`buildHorse` / `poseHorse` in render.html: idle, walk, gallop, attack rear-up, death topple),
so it is free and shared by every mounted unit. Set `"mount": true` in a jobs file; each anim gives `gait`, the rider's lower-body
clip (`Chair_Sit_Idle_M` from sit_anim.glb) and an `upper` clip for the arms (e.g. `Right_Hand_Sword_Slash`). `stride` = tiles per walk cycle.
Rigged models and motion files are backed up on the `models` branch (Meshy deletes tasks after ~3 days).

## Walk cycles and combat (v2)
Walk clips are in-place and some hold several step cycles (Casual_Walk = 3). Render ONE cycle (`end` = period / duration)
and set `stride` = tiles per cycle, so feet don't slide. `gait.html` measures the period (foot-height autocorrelation).
Measured: Casual_Walk 1.395 s ≈ 1.10 tiles, Carry_Heavy_Object_Walk 2.178 s ≈ 1.17, Spear_Walk 1.07 s ≈ 1.45.
Soldiers have `attack` + `attack2` (alternated), `ready` (combat stance between swings), `hit`, and `block` (shield units).
The game times each swing so the blow lands on the real hit (IMPACT table in js/art.js). Extra motions: combat2_anim.glb.
