"""Assemble the game's films from raw generated clips, with our own battle music underneath.

    python3 tools/make_films.py <landscape_clips_dir> <portrait_clips_dir>
    python3 tools/make_films.py --one <civ> <clip.mp4>        one portrait dynasty film from a clip

Writes assets/video/intro.mp4, dyn_<civ>.mp4 (16:9, 1280x720) and the same names with _p
(9:16, 720x1280). The clips' own audio is dropped: only the music plays (no narration).
The intro is four 5 s shots crossfaded, with the logo fading in over the last; it ends on the
finale of battle_1. Each dynasty film takes a different climactic stretch of battle_2.
"""
import os, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/video')
MUS = os.path.join(ROOT, 'assets/sound/music')
INTRO_MUSIC = ('battle_1.mp3', 114)   # file, start second: its last 20 s, ending on the finale
DYN_MUSIC = {'britons': 68, 'franks': 104, 'byzantines': 128, 'chinese': 152, 'persians': 138, 'incas': 114, 'cholas': 86}   # starts in battle_2
ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']


def ff(args):
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y'] + args, check=True, timeout=600)


def logo_overlay(w, h, path):
    lg = Image.open(os.path.join(ROOT, 'assets/ui/logo.png')).convert('RGBA')
    lw = int(w * (0.48 if w > h else 0.86)); lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.paste(lg, ((w - lw) // 2, int(h * (0.08 if w > h else 0.2))), lg); c.save(path)


def intro(src, w, h, out):
    ov = os.path.join(src, '_logo.png'); logo_overlay(w, h, ov)
    v = ''.join(f'[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=30,setsar=1{",tpad=stop_mode=clone:stop_duration=1.8" if i == 3 else ""}[v{i}];' for i in range(4))
    fc = (v + '[v0][v1]xfade=transition=fade:duration=0.6:offset=4.4[x1];[x1][v2]xfade=transition=fade:duration=0.6:offset=8.8[x2];'
          '[x2][v3]xfade=transition=fade:duration=0.6:offset=13.2[x3];[4:v]format=rgba,fade=t=in:st=0.8:d=1.6:alpha=1[lg];'
          "[x3][lg]overlay=0:0:enable='gte(t,13.2)':shortest=0,fade=t=in:st=0:d=0.8,fade=t=out:st=19.2:d=0.8[vout];"
          '[5:a]afade=t=in:d=1.0,afade=t=out:st=18.6:d=1.4,loudnorm=I=-16:TP=-1.5[aout]')
    ins = []
    for i in range(1, 5): ins += ['-i', os.path.join(src, f'intro_{i}.mp4')]
    ins += ['-loop', '1', '-t', '6', '-i', ov, '-ss', str(INTRO_MUSIC[1]), '-t', '20', '-i', os.path.join(MUS, INTRO_MUSIC[0])]
    ff(ins + ['-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-t', '20'] + ENC + [out])


def dyn(src, civ, w, h, out):
    clip = os.path.join(src, f'dyn_{civ}.mp4')
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip], capture_output=True, text=True).stdout)
    end = min(dur, 10.0)
    ff(['-i', clip, '-ss', str(DYN_MUSIC[civ]), '-t', str(end), '-i', os.path.join(MUS, 'battle_2.mp3'),
        '-filter_complex', f'[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fade=t=in:st=0:d=0.5,fade=t=out:st={end - 0.6:.2f}:d=0.6[v];'
        f'[1:a]afade=t=in:d=0.6,afade=t=out:st={end - 1.2:.2f}:d=1.2,loudnorm=I=-16:TP=-1.5[a]',
        '-map', '[v]', '-map', '[a]', '-t', str(end)] + ENC + [out])


def poster(video, out):
    ff(['-ss', '0.6', '-i', video, '-frames:v', '1', '-q:v', '3', out])


if __name__ == '__main__':
    if sys.argv[1] == '--one':
        # a single portrait dynasty film (the newer dynasties are made one at a time from Grok clips)
        civ, clip = sys.argv[2], sys.argv[3]
        import shutil, tempfile
        tmp = tempfile.mkdtemp(); shutil.copy(clip, os.path.join(tmp, f'dyn_{civ}.mp4'))
        out = os.path.join(OUT, f'dyn_{civ}_p.mp4'); dyn(tmp, civ, 720, 1280, out); poster(out, out[:-4] + '.jpg')
        print('wrote', out, 'and its poster'); sys.exit()
    land, port = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    for src, w, h, suf in ((land, 1280, 720, ''), (port, 720, 1280, '_p')):
        if not os.path.exists(os.path.join(src, 'intro_4.mp4')): print('skip', src); continue
        intro(src, w, h, os.path.join(OUT, f'intro{suf}.mp4')); print('intro' + suf, flush=True)
        for civ in DYN_MUSIC:
            if os.path.exists(os.path.join(src, f'dyn_{civ}.mp4')): dyn(src, civ, w, h, os.path.join(OUT, f'dyn_{civ}{suf}.mp4')); print('dyn', civ + suf, flush=True)
