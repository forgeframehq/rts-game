# Overnight work plan (3 Nov) — progress is kept here so work can resume after a limit

Status: [x] done, [~] in progress, [ ] not started. Keys live only in the session scratchpad.

## Dynasty art
- [x] Concepts: Franks/Byzantine/Chinese swordsman, spearman, archer, knight, king, queen (build/art/dynasty_units) + villagers
- [x] 23 Meshy models built and rigged, backed up on the `models` branch
- [x] Render all units per dynasty: `python3 tools/render_dynasty.py <dynasty>` (skips finished stems)
- [ ] Re-render Western knight/scout idle (calmer idle in j_knight*/j_scout/j_cata) after dynasty renders
- [ ] Check every dynasty in game, commit, publish

## Research
- [x] Techs + effects (data.js G.TECHS, entities.js techEff hooks), University building, dynasty techs
- [x] Train / Research pages in the building panel; research + university icons cut
- [ ] Ingest University art (build/art/university: w_/med_/ea_university) — after renders (manifest)
- [ ] Add 'research', 'university' to ICONS in ui.js; test research end to end; AI uses new techs

## Fixes from play
- [x] Units under attack orders turn on whoever hits them; the group follows
- [x] Easy AI: smaller economy and army, first attack at 12 min
- [~] Siege Workshop re-fitted; Battering Ram rebuilt in code (render.html buildRam, j_ram.json), needs process_render into manifest
- [ ] Cavalier idle calm (job files done; needs re-render)

## Other
- [ ] BLOCKED Sound effects: Kie's ElevenLabs timed out all night; retry tools/gen_sfx.py: `python3 tools/gen_sfx.py` (resumable; Kie queue was timing out)
- [x] Construction stages from Kie for every building (assets/stages.json); farm under construction = empty field
- [~] Farming = Reaping_Swing, mining = Heavy_Hammer_Swing + pickaxe (jobs updated); run tools/rerender_work.sh
- [x] Formations (line, staggered, box) + Formation button; garrison portrait row (royals crowned), tap to send one out
- [ ] Horses: try a Meshy horse, else improve code horse
- [ ] Morning summary with screenshots

- [~] Unique units re-rendered on dynasty bodies (axe/cata/repeater --redo) + Western knight calmer idle

## Status (morning, Nov 3)
Done and live: dynasty units for all 4 dynasties, research pages + University + dynasty techs, formations, garrison row with eject, AI retaliation + softer Easy AI, painted construction stages, wheeled ram, reaping/pickaxe motions, calmer knight idle, siege workshop fit, unit art packed (540 sheets -> 94 images).
Blocked: sound effects (Kie ElevenLabs timed out all night; rerun tools/gen_sfx.py).
Open: proper horse (Meshy static + code legs), Chinese royal team colour, Chinese University banners/size, AI using University.
