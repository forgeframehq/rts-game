"""Prepare a music track to sit under the game without overpowering it.

Usage: python3 tools/prep_music.py <out-name> <in.mp3> [more.mp3 ...]
       python3 tools/prep_music.py --check          (measure what is already in the game)

Music arrives mastered for listening — these two came in at about -16 LUFS, which is
streaming loudness and sits on top of the game rather than under it. Background music
wants to be ten decibels quieter than that, and all of it at the same level, so a track
change does not jump.

What this does to each file:
  - throws away the embedded cover art, which is dead weight in a download
  - measures the track, then normalises it to TARGET LUFS with a true-peak ceiling,
    in two passes so the result lands where it is meant to rather than near it
  - fades the first and last seconds, so tracks can follow one another without a click
    and the loop back to the start is gentle
  - re-encodes at a bitrate that suits an ambient bed on a phone

The game plays music on its own gain, so the player can still turn it down or off; this
sets the level everything starts from. See js/sound.js.
"""
import json, os, re, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'assets', 'sound', 'music')
TARGET = -24.0        # LUFS integrated: a clear step under the -16 these arrive at
PEAK = -2.0           # dBTP ceiling
BITRATE = '112k'
FADE_IN, FADE_OUT = 2.0, 4.0


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def measure(path):
    r = run(['ffmpeg', '-nostats', '-hide_banner', '-i', path,
             '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'])
    out = r.stderr
    def grab(label):
        m = re.search(label + r':\s*(-?\d+\.?\d*)', out)
        return float(m.group(1)) if m else None
    return {'lufs': grab(r'I'), 'lra': grab('LRA')}


def duration(path):
    r = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=nw=1:nk=1', path])
    return float(r.stdout.strip())


def prep(src, name):
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, name + '.mp3')
    dur = duration(src)
    before = measure(src)
    # pass one: ask loudnorm what it measured, so pass two can be exact
    r = run(['ffmpeg', '-nostats', '-hide_banner', '-i', src, '-vn',
             '-af', f'loudnorm=I={TARGET}:TP={PEAK}:LRA=11:print_format=json',
             '-f', 'null', '-'])
    m = re.search(r'\{[^{]*"input_i"[\s\S]*?\}', r.stderr)
    if not m:
        print('  ! could not measure', src); return None
    s = json.loads(m.group(0))
    norm = (f'loudnorm=I={TARGET}:TP={PEAK}:LRA=11:'
            f'measured_I={s["input_i"]}:measured_TP={s["input_tp"]}:'
            f'measured_LRA={s["input_lra"]}:measured_thresh={s["input_thresh"]}:'
            f'offset={s["target_offset"]}:linear=true:print_format=summary')
    af = f'{norm},afade=t=in:st=0:d={FADE_IN},afade=t=out:st={max(0, dur - FADE_OUT):.2f}:d={FADE_OUT}'
    r = run(['ffmpeg', '-y', '-nostats', '-hide_banner', '-i', src, '-vn', '-af', af,
             '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100', '-ac', '2',
             '-map_metadata', '-1', dst])
    if r.returncode != 0:
        print('  ! ffmpeg failed:', r.stderr.strip()[-200:]); return None
    after = measure(dst)
    print(f'  {name}: {before["lufs"]:.1f} -> {after["lufs"]:.1f} LUFS   '
          f'{os.path.getsize(src)/1e6:.1f} -> {os.path.getsize(dst)/1e6:.1f} MB   '
          f'{dur:.0f}s')
    return name + '.mp3'


def check():
    if not os.path.isdir(OUT):
        print('no music yet'); return
    for f in sorted(os.listdir(OUT)):
        if f.endswith(('.mp3', '.ogg', '.m4a')):
            p = os.path.join(OUT, f)
            print(f'  {f}: {measure(p)["lufs"]:.1f} LUFS, {os.path.getsize(p)/1e6:.1f} MB, {duration(p):.0f}s')


if __name__ == '__main__':
    if '--check' in sys.argv:
        check(); sys.exit()
    name, srcs = sys.argv[1], sys.argv[2:]
    done = []
    for i, s in enumerate(srcs):
        n = name if len(srcs) == 1 else f'{name}_{i + 1}'
        got = prep(s, n)
        if got: done.append(got)
    print('\nadd to assets/sound/manifest.json as:')
    print('  ' + json.dumps({'music': done}))
