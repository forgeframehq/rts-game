# Overnight work plan (3 Nov) — progress is kept here so work can resume after a limit

Status: [x] done, [~] in progress, [ ] not started. Keys live only in the session scratchpad.

## Dynasty art
- [x] Concepts: Franks/Byzantine/Chinese swordsman, spearman, archer, knight, king, queen (build/art/dynasty_units) + villagers
- [x] 23 Meshy models built and rigged, backed up on the `models` branch
- [~] Render all units per dynasty: `python3 tools/render_dynasty.py <dynasty>` (skips finished stems)
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
- [ ] Siege Workshop sits on its square; Battering Ram grounded with shadow and turning wheels
- [ ] Cavalier idle calm (job files done; needs re-render)

## Other
- [~] Sound effects via ElevenLabs on Kie: `python3 tools/gen_sfx.py` (resumable; Kie queue was timing out)
- [ ] Construction stages from Kie (pilot House + Barracks, then all), farm under construction = empty field
- [ ] Farming and mining animations
- [x] Formations (line, staggered, box) + Formation button; garrison portrait row (royals crowned), tap to send one out
- [ ] Horses: try a Meshy horse, else improve code horse
- [ ] Morning summary with screenshots
