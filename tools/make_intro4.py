"""Assemble the POV intro: a soldier runs through a forest, bursts out of the bushes above a great
battle, sighs, and runs down into it. No music: only his breathing, the forest, and the war.

    python3 tools/make_intro4.py <landscape_clips_dir> <portrait_clips_dir> <sounds_dir>

Shots p1_forest (5 s), p2_bushes (5 s), p3_war (10 s), crossfaded. Sounds (ElevenLabs): breath,
foliage, burst, war, sigh. Writes assets/video/intro.mp4, intro_p.mp4 and their posters.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_films import ff, MUS, OUT
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
X, O1, O2 = 0.4, 4.6, 9.2          # crossfade, and when shots 2 and 3 begin
TOTAL = O2 + 10.0
ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']


def logo(w, h, path):
    lg = Image.open(os.path.join(ROOT, 'assets/ui/logo.png')).convert('RGBA')
    lw = int(w * (0.34 if w > h else 0.66)); lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.paste(lg, ((w - lw) // 2, int(h * (0.08 if w > h else 0.1))), lg); c.save(path)


def build(src, snd, w, h, out):
    ov = os.path.join(src, '_logo.png'); logo(w, h, ov)
    s = lambda n: os.path.join(snd, n + '.mp3')
    v = ''.join(f'[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=30,setsar=1[v{i}];' for i in range(3))
    la = TOTAL - 3.2
    fc = (v + f'[v0][v1]xfade=transition=fade:duration={X}:offset={O1}[x1];[x1][v2]xfade=transition=fade:duration={X}:offset={O2}[x2];'
          f'[3:v]format=rgba,fade=t=in:st=0:d=1.4:alpha=1,setpts=PTS+{la}/TB[lg];'
          f"[x2][lg]overlay=0:0:enable='gte(t,{la})':shortest=0,fade=t=in:st=0:d=0.5,fade=t=out:st={TOTAL - 0.7:.2f}:d=0.7[vout];"
          # his breathing, close, running out of breath as he reaches the hill
          f'[4:a]atrim=0:11,afade=t=out:st=9.8:d=1.2,volume=1.0[br];'
          # feet and branches in the forest, then quieter steps as he runs down the slope
          f'[5:a]atrim=0:9.8,afade=t=out:st=9.0:d=0.8,volume=0.9[fo];'
          f'[5:a]atrim=2:8,asetpts=PTS-STARTPTS,afade=t=in:d=0.6,volume=0.35,adelay={int((O2 + 4.8) * 1000)}|{int((O2 + 4.8) * 1000)}[fo2];'
          # bursting out of the bushes
          f'[6:a]volume=1.1,adelay={int((O1 + 2.6) * 1000)}|{int((O1 + 2.6) * 1000)}[bu];'
          # the war: a far murmur in the forest, then the whole valley as he comes out
          f"[7:a]aloop=loop=1:size=2e6,atrim=0:{TOTAL},volume='if(lt(t,{O2 - 0.6}),0.12,min(1,0.12+(t-{O2 - 0.6})*0.9))':eval=frame,afade=t=out:st={TOTAL - 1.4:.2f}:d=1.4[war];"
          # the sigh as he stops at the edge
          f'[8:a]volume=1.2,adelay={int((O2 + 1.6) * 1000)}|{int((O2 + 1.6) * 1000)}[si];'
          f'[br][fo][fo2][bu][war][si]amix=inputs=6:normalize=0:duration=longest,atrim=0:{TOTAL},loudnorm=I=-17:TP=-1.5[aout]')
    ins = []
    for k in ['p1_forest', 'p2_bushes', 'p3_war']: ins += ['-i', os.path.join(src, k + '.mp4')]
    ins += ['-loop', '1', '-t', '4', '-i', ov]
    for n in ['breath', 'foliage', 'burst', 'war', 'sigh']: ins += ['-i', s(n)]
    ff(ins + ['-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-t', str(TOTAL)] + ENC + [out])
    ff(['-ss', '1.5', '-i', out, '-frames:v', '1', '-q:v', '4', out[:-4] + '.jpg'])


if __name__ == '__main__':
    land, port, snd = sys.argv[1:4]
    build(land, snd, 1280, 720, os.path.join(OUT, 'intro.mp4')); print('intro')
    build(port, snd, 720, 1280, os.path.join(OUT, 'intro_p.mp4')); print('intro_p')
