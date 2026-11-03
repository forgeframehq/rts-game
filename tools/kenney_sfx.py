"""Real recorded sound effects from Kenney's CC0 audio packs (public domain, free for commercial use).

    python3 tools/kenney_sfx.py <path to "Audio (295 files)">

Source: Kenney Asset Pack 1 (CC0 1.0), mirrored at github.com/iwenzhou/kenney. Each game sound
gets a few takes cut from the recordings, pitched slightly apart so repeats don't sound identical,
faded and levelled. Sounds not listed here (bells, horns, fanfares) keep their synthesized takes.
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/sound/sfx')
# key -> list of (source file, pitch, start s, length s, gain dB)
MAP = {
    'click':   [('UI/click3', 1.0, 0, 0.15, -4)],
    'select':  [('RPG/cloth1', 1.05, 0, 0.35, -6), ('RPG/cloth3', 1.0, 0, 0.35, -6)],
    'command': [('RPG/clothBelt', 1.0, 0, 0.4, -5), ('RPG/beltHandle1', 1.0, 0, 0.35, -5)],
    'error':   [('RPG/metalLatch', 0.8, 0, 0.35, -6)],
    'chop':    [('RPG/chop', 1.0, 0, 0.24, 0), ('RPG/chop', 0.9, 0, 0.26, 0), ('RPG/chop', 1.1, 0, 0.22, 0)],
    'mine':    [('RPG/metalClick', 0.75, 0, 0.3, -2), ('RPG/metalPot1', 1.25, 0, 0.28, -6), ('RPG/metalClick', 0.65, 0, 0.32, -2)],
    'farm':    [('RPG/footstep03', 0.85, 0, 0.25, -3), ('RPG/footstep06', 0.8, 0, 0.25, -3)],
    'build':   [('RPG/bookPlace1', 0.75, 0, 0.25, 0), ('RPG/bookPlace2', 0.7, 0, 0.25, 0), ('RPG/bookPlace3', 0.8, 0, 0.25, 0)],
    'place':   [('RPG/doorClose_2', 0.85, 0, 0.5, -2)],
    'sword':   [('RPG/metalPot2', 1.35, 0, 0.35, -6), ('RPG/drawKnife2', 1.0, 0, 0.35, -3), ('RPG/metalPot3', 1.2, 0, 0.35, -6)],
    'spear':   [('RPG/knifeSlice', 0.9, 0, 0.45, -3), ('RPG/knifeSlice2', 0.85, 0, 0.45, -3)],
    'die':     [('RPG/dropLeather', 0.8, 0, 0.5, 0), ('RPG/dropLeather', 0.7, 0, 0.5, 0), ('RPG/cloth4', 0.7, 0, 0.45, 0)],
    'train':   [('RPG/handleCoins', 1.0, 0, 0.7, -4)],
    'research': [('RPG/bookFlip2', 1.0, 0, 0.6, -3)],
}
DIRS = {'RPG': 'RPG sounds (50 sounds)', 'UI': 'UI sounds (50 sounds)'}


def main(src):
    man_p = os.path.join(ROOT, 'assets/sound/manifest.json'); man = json.load(open(man_p))
    for key, takes in MAP.items():
        for f in os.listdir(OUT):
            if f.startswith(key + '_') and f[len(key) + 1:-4].isdigit(): os.remove(os.path.join(OUT, f))
        files = []
        for i, (name, pitch, ss, dur, gain) in enumerate(takes, 1):
            d, n = name.split('/'); path = os.path.join(src, DIRS[d], n + '.ogg')
            out = os.path.join(OUT, f'{key}_{i}.mp3')
            af = (f'asetrate=44100*{pitch},aresample=44100,atrim=start={ss}:duration={dur / pitch * 1.0:.3f},'
                  f'afade=t=in:d=0.004,afade=t=out:st={max(0.01, dur / pitch - 0.06):.3f}:d=0.06,volume={gain}dB')
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', path, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', out], check=True, timeout=60)
            files.append('sfx/' + os.path.basename(out))
        man[key] = files
        print(key, len(files))
    json.dump(man, open(man_p, 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
