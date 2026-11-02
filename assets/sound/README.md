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

## Music
Tracks live in `assets/sound/music/` and are listed under `"music"` in `manifest.json`:

```json
{ "music": ["peaceful_1.mp3", "peaceful_2.mp3"] }
```

There are three sets:

| Key | When it plays |
|---|---|
| `menuMusic` | The title screen, the setup screens and the end-of-game screen |
| `music` | In a game, while the town works |
| `battleMusic` | In a game, when **the player** is in a fight |

A fight means a blow struck by or against the player. Two AIs scrapping on the far side
of the map does not turn it. Twelve seconds after the last blow it drifts back to the
peaceful set; leaving for the title screen forgets the battle at once. Every handover is a
3.5-second crossfade on a second audio element rather than a cut.

```json
{
 "menuMusic": ["menu_1.mp3", "menu_2.mp3"],
 "music": ["peaceful_1.mp3", "peaceful_2.mp3"],
 "battleMusic": ["battle_1.mp3"]
}
```

A set left empty falls back to the peaceful one, so a half-filled pack still plays.

Each set plays in a shuffled order, one after another, for ever, fading in and out so
tracks run together without a click. Music is streamed from an `<audio>` element rather than
decoded into the audio graph, because decoding a three-minute track into a buffer costs
about 60 MB of memory, which is not a thing to spend on a phone. It pauses when the tab
is hidden.

Keep both sets at the same measured loudness, or the switch jumps.

Prepare a new track with:

```
python3 tools/prep_music.py peaceful path/to/track.mp3
python3 tools/prep_music.py --check          # what is in the game now, and how loud
```

That strips the cover art, normalises to **-24 LUFS** with a -2 dBTP ceiling, fades the
first two and last four seconds, and re-encodes at 112k. Music arrives mastered for
listening — around -16 LUFS — which sits on top of the game rather than under it; -24 is
the step down, and the in-game volume takes another, so Normal plays at about -26.9 LUFS
and Soft at -31.3. If that is still too present, lower `S.musicVolume` in `js/sound.js`.

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
