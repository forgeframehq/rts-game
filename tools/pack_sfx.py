"""Pack every short sound effect into one file the game loads at once (assets/sound/sfx_pack.json).

The published web build is limited in file count, and one request beats 150 on a phone. Ambient
loops stay as their own files: they are streamed, not decoded. Run after changing any sound.
"""
import base64, glob, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pack = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'assets/sound/sfx/*.mp3'))):
    b = os.path.basename(f)
    if b.startswith('amb_'): continue
    pack['sfx/' + b] = base64.b64encode(open(f, 'rb').read()).decode()
json.dump(pack, open(os.path.join(ROOT, 'assets/sound/sfx_pack.json'), 'w'), separators=(',', ':'))
print(len(pack), 'sounds packed')
