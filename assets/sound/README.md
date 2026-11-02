# Sound

Drop audio files in this folder, list them in `manifest.json`, and the game plays them.
With no `manifest.json` here the game is silent and plays exactly as it did before, so an
empty folder is a valid state and a missing or broken file is simply never heard.

## How to add a pack
1. Put the files here. Any name is fine — `manifest.json` maps names to sounds.
2. Copy `manifest.example.json` to `manifest.json` and fill in the files you have.
   You do not need all of them; leave out what you don't have.
3. A key may list several files, and one is picked at random each time, which is the
   cheapest way to stop a sound wearing out:
   `"sword": ["sword_1.ogg", "sword_2.ogg", "sword_3.ogg"]`

## Format
`.ogg` is smallest and plays everywhere that matters; `.mp3` and `.wav` also work. Keep
them short — most of these are under a second — and mono is fine. The game plays each at a
slightly random pitch, so identical repeats don't sound stamped out.

## What each sound is for
| Key | When it plays |
|---|---|
| `click`, `select`, `command` | Interface: a button, picking units, ordering them |
| `error` | A refused order |
| `chop`, `mine`, `farm` | A villager working wood, ore or food |
| `build` | A villager hammering at a building site |
| `place`, `complete` | A foundation laid; a building finished |
| `sword`, `spear` | A melee blow lands |
| `bow`, `bolt`, `axethrow` | An arrow, a crossbow bolt, a thrown axe |
| `ram` | A battering ram strikes |
| `trebuchet`, `stonehit` | A trebuchet looses; its stone lands |
| `die` | A soldier falls |
| `buildingdown` | A building collapses |
| `heal` | A Monk or Queen tending the wounded |
| `train` | A unit comes out of a building |
| `research`, `ageup` | An upgrade finishes; a new Age |
| `bell` | The town bell |
| `attacked` | Something of yours is attacked off-screen |
| `kingdown` | A King falls (Regicide) |
| `victory`, `defeat` | The end |

Volume, throttling and which bus each sound sits on are set in `js/sound.js`; sounds are
quieter off-screen and silent in the fog.
