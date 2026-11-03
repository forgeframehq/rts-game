"""Make the game's sound effects with ElevenLabs' sound generation.

Usage: ELEVEN_KEY=... python3 tools/eleven_sfx.py [key ...]
Writes assets/sound/sfx/<key>_<n>.mp3 (mono, trimmed, loudness matched). The key is read
from the environment only; it never goes in the repo.
"""
import json, os, subprocess, sys, urllib.request, tempfile

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(HERE), 'assets/sound/sfx')
STYLE = ', clean recording, no music, no voices, no background ambience'
SFX = {  # key: (variants, seconds, prompt)
 'click': (1, 0.5, 'soft wooden button click, small parchment tap, medieval game menu'),
 'select': (2, 0.6, 'short soft leather and chainmail rustle, a unit being selected in a strategy game'),
 'command': (2, 0.6, 'short crisp leather strap creak and boots shuffle, acknowledging an order'),
 'error': (1, 0.6, 'dull low wooden knock twice, denied action in a game menu'),
 'open': (1, 0.8, 'parchment scroll unrolling quickly, soft paper rustle'),
 'back': (1, 0.5, 'soft paper fold and a small wooden tap'),
 'toggle': (2, 0.5, 'small wooden toggle switch click, crisp and tiny'),
 'coin': (1, 0.7, 'a few gold coins dropping into a leather pouch'),
 'chop': (3, 0.7, 'single axe chop into a tree trunk, solid wood thunk, close'),
 'mine': (3, 0.7, 'single iron pickaxe strike on rock, sharp clink with small stones falling'),
 'farm': (2, 0.8, 'hoe scraping and digging into soft soil, single stroke'),
 'build': (3, 0.6, 'single hammer blow on a wooden beam, carpentry knock'),
 'place': (1, 0.8, 'heavy wooden stake driven into the ground, thud with dirt'),
 'complete': (1, 1.5, 'a small cheerful construction finished, last hammer knocks and a bright wooden thump'),
 'sword': (3, 0.6, 'two steel swords clash, single sharp metallic hit'),
 'spear': (2, 0.6, 'spear thrust hitting a wooden shield, single impact'),
 'bow': (3, 0.6, 'bow string released, arrow whoosh'),
 'bolt': (2, 0.6, 'crossbow trigger snap and bolt whoosh'),
 'axethrow': (2, 0.6, 'throwing axe spinning whoosh then thunk'),
 'ram': (2, 1.0, 'heavy wooden battering ram slamming into a wooden gate, deep boom'),
 'trebuchet': (1, 1.6, 'large wooden trebuchet arm swinging and releasing, creak and whoosh'),
 'stonehit': (2, 1.2, 'heavy boulder smashing into a stone wall, crunch and rubble'),
 'die': (3, 0.8, 'medieval soldier falling down with armor clatter, short grunt'),
 'buildingdown': (2, 2.2, 'wooden building collapsing, timber cracking and crashing down, dust'),
 'heal': (1, 1.2, 'soft gentle magical chime, monk healing, warm shimmer'),
 'train': (1, 1.0, 'short marching boots and a soldier ready, medieval barracks'),
 'research': (1, 1.4, 'page turning and a quill scratch followed by a soft bright chime'),
 'ageup': (1, 3.0, 'triumphant medieval brass fanfare, short, heralds trumpets'),
 'bell': (1, 2.0, 'large town church bell ringing twice, alarm'),
 'attacked': (1, 1.6, 'war horn blowing a short urgent alarm'),
 'kingdown': (1, 2.5, 'a solemn low war drum roll and a mournful horn'),
 'victory': (1, 4.0, 'medieval victory fanfare, trumpets and drums, crowd cheering'),
 'defeat': (1, 4.0, 'slow sad medieval horn lament with a low drum'),
}

def gen(text, dur, path):
    body = json.dumps({'text': text + STYLE, 'duration_seconds': dur, 'prompt_influence': 0.6}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', data=body, method='POST',
        headers={'xi-api-key': os.environ['ELEVEN_KEY'], 'Content-Type': 'application/json'})
    raw = urllib.request.urlopen(req, timeout=120).read()
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as t: t.write(raw)
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1',
        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5,afade=t=out:st=%.2f:d=0.08' % max(0.05, dur - 0.1),
        '-b:a', '96k', path], check=True)
    os.unlink(t.name)

if __name__ == '__main__':
    keys = sys.argv[1:] or list(SFX)
    for k in keys:
        n, dur, p = SFX[k]
        for i in range(1, n + 1):
            try: gen(p, dur, os.path.join(OUT, f'{k}_{i}.mp3')); print('done', k, i, flush=True)
            except Exception as e: print('FAIL', k, i, e, flush=True)
