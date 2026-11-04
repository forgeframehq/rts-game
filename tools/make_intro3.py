"""Assemble "The Villager" intro film from its five Kling clips, with battle_1 underneath.

    python3 tools/make_intro3.py <landscape_clips_dir> <portrait_clips_dir>

Five shots crossfaded (5, 5, 5, 5 and 10 s). The music falls almost silent while he picks up the
fallen knight's sword, then swells as he rises; the logo fades in over the last shot.
Writes assets/video/intro.mp4 (1280x720) and intro_p.mp4 (720x1280), plus poster frames.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_films import ff, ENC, MUS, OUT
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def logo_overlay(w, h, path):
    # low in the frame, so the hero's face and raised sword stay clear
    lg = Image.open(os.path.join(ROOT, 'assets/ui/logo.png')).convert('RGBA')
    lw = int(w * (0.4 if w > h else 0.8)); lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.paste(lg, ((w - lw) // 2, int(h * (0.66 if w > h else 0.7))), lg); c.save(path)

SHOTS = ['i1_peace', 'i2_clash', 'i3_run', 'i4_sword', 'i5_rise']
X = 0.6                                   # crossfade
OFFS = [4.4, 8.8, 13.2, 17.6]             # each shot's fade into the next
TOTAL = 17.6 + 10.0


def build(src, w, h, out):
    ov = os.path.join(src, '_logo.png'); logo_overlay(w, h, ov)
    v = ''.join(f'[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=30,setsar=1[v{i}];' for i in range(5))
    chain, last = '', 'v0'
    for i, o in enumerate(OFFS, 1):
        chain += f'[{last}][v{i}]xfade=transition=fade:duration={X}:offset={o}[x{i}];'; last = f'x{i}'
    logo_at = TOTAL - 4.2
    duck = "if(lt(t,13),1,if(lt(t,14.2),1-0.85*(t-13)/1.2,if(lt(t,18),0.15,if(lt(t,19.5),0.15+0.85*(t-18)/1.5,1))))"
    fc = (v + chain + f'[5:v]format=rgba,fade=t=in:st=0:d=1.6:alpha=1,setpts=PTS+{logo_at}/TB[lg];'
          f"[{last}][lg]overlay=0:0:enable='gte(t,{logo_at})':shortest=0,fade=t=in:st=0:d=0.8,fade=t=out:st={TOTAL - 0.8:.2f}:d=0.8[vout];"
          f"[6:a]volume='{duck}':eval=frame,afade=t=in:d=1.2,afade=t=out:st={TOTAL - 1.6:.2f}:d=1.6,loudnorm=I=-16:TP=-1.5[aout]")
    ins = []
    for s in SHOTS: ins += ['-i', os.path.join(src, s + '.mp4')]
    ins += ['-loop', '1', '-t', '5', '-i', ov, '-ss', '106', '-t', str(TOTAL), '-i', os.path.join(MUS, 'battle_1.mp3')]
    ff(ins + ['-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-t', str(TOTAL)] + ENC[:4] + ['-crf', '28'] + ENC[6:] + [out])
    ff(['-ss', '1.0', '-i', out, '-frames:v', '1', '-q:v', '4', out[:-4] + '.jpg'])


if __name__ == '__main__':
    build(sys.argv[1], 1280, 720, os.path.join(OUT, 'intro.mp4')); print('intro')
    build(sys.argv[2], 720, 1280, os.path.join(OUT, 'intro_p.mp4')); print('intro_p')
