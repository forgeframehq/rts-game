"""Make the game's sound effects with ElevenLabs' sound generation.

Usage: ELEVEN_KEY=... python3 tools/eleven_sfx.py [key ...]

Writes assets/sound/sfx/<key>_<n>.mp3. The key is read from the environment only; it never goes
in the repo. Processing is gentle on purpose: only near-silence at the start is cut, the natural
tail and ring are kept, with a short fade at the end and loudness matched per category. (The first
version trimmed hard and left 0.1 s blips that sounded cheap.) Ambient beds are made as seamless loops.
"""
import json, os, re, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(HERE), 'assets/sound/sfx')
STYLE = ', high quality foley recording, realistic, close and dry, no music, no voices, no background ambience'
# loudness targets (LUFS) per category, so nothing jumps out of the mix
LOUD = {'ui': -20, 'work': -19, 'combat': -17, 'alert': -15, 'ambient': -26, 'voice': -18}
SFX = {  # key: (variants, seconds, category, prompt)
 # interface: wood and parchment, soft and satisfying
 'click':   (4, 0.5, 'ui', 'a single soft wooden button tap, small, warm, satisfying, like a carved wooden game piece placed on a table'),
 'open':    (3, 0.8, 'ui', 'a short parchment scroll unrolling quickly with a soft paper swish'),
 'back':    (3, 0.6, 'ui', 'a parchment page folded shut with a soft paper flap'),
 'toggle':  (3, 0.5, 'ui', 'a tiny crisp wooden latch click'),
 'error':   (2, 0.6, 'ui', 'a dull muted low wooden knock, two quick knocks, a gentle denied sound'),
 'coin':    (3, 0.8, 'ui', 'a small handful of gold coins clinking into a leather purse'),
 'select':  (5, 0.6, 'ui', 'a soldier shifting his weight, light leather and chainmail rustle'),
 'command': (5, 0.6, 'ui', 'boots stepping off with a light leather creak, ready to march'),
 # villagers at work
 'chop':    (6, 0.8, 'work', 'one solid axe chop biting into a thick tree trunk, wooden thunk with wood chips'),
 'mine':    (6, 0.8, 'work', 'one iron pickaxe strike on hard rock, a sharp ringing clink with a few small stones falling'),
 'farm':    (4, 1.0, 'work', 'a hoe digging into soft earth and scraping soil, one stroke'),
 'build':   (6, 0.7, 'work', 'one wooden mallet blow on a timber beam, carpentry knock'),
 'place':   (2, 1.0, 'work', 'a heavy wooden stake hammered into the ground, deep thud'),
 'complete':(2, 1.6, 'work', 'a building finished: a few final hammer knocks and a heavy wooden beam settling into place, satisfying'),
 'ack':     (6, 0.8, 'voice', 'a medieval peasant man answering an order with a short grunt "aye" or "hm", single word, natural, close'),
 # battle
 'sword':   (6, 0.7, 'combat', 'a steel sword slash hitting another steel blade, one sharp metallic clash with ring'),
 'slash':   (5, 0.6, 'combat', 'a sword slash cutting through cloth and leather armour, one hit'),
 'spear':   (5, 0.7, 'combat', 'a spear thrust striking a wooden shield, one thud with crack'),
 'armor':   (4, 0.6, 'combat', 'a heavy blow on plate armour, metallic clank'),
 'bow':     (6, 0.7, 'combat', 'a longbow string released, twang, and an arrow whooshing away'),
 'arrowhit':(5, 0.6, 'combat', 'an arrow thudding into a wooden shield, one impact'),
 'bolt':    (4, 0.7, 'combat', 'a crossbow trigger snap and a heavy bolt whooshing off'),
 'axethrow':(4, 0.7, 'combat', 'a throwing axe spinning through the air then thunking into wood'),
 'ram':     (3, 1.2, 'combat', 'a heavy wooden battering ram slamming into a wooden gate, deep boom with creak'),
 'trebuchet':(2, 2.0, 'combat', 'a large wooden trebuchet arm swinging and releasing, rope creak, wooden groan and a heavy whoosh'),
 'stonehit':(3, 1.4, 'combat', 'a huge boulder smashing into a stone wall, crunch and falling rubble'),
 'die':     (6, 0.9, 'combat', 'a medieval soldier falling to the ground with a short pained grunt and armour clatter'),
 'buildingdown':(3, 2.5, 'combat', 'a wooden building collapsing, timbers cracking and crashing down, dust'),
 'fire':    (2, 3.0, 'combat', 'a building on fire, crackling flames and burning wood, steady'),
 'horse':   (4, 1.2, 'combat', 'a warhorse whinny and snort'),
 'gallop':  (3, 1.5, 'combat', 'several horses galloping hard on grass, heavy hooves'),
 'charge':  (2, 2.0, 'combat', 'a cavalry charge: a battle cry and pounding hooves building up'),
 'march':   (3, 1.5, 'combat', 'a group of soldiers marching in step, boots on dirt and armour jingle'),
 'heal':    (2, 1.4, 'combat', 'a soft warm magical chime, a gentle healing shimmer'),
 'special': (4, 1.0, 'combat', 'a sword drawn fast from its scabbard with a bright ringing steel shimmer and a sharp whoosh, heroic and punchy'),
 # moments
 'train':   (3, 1.0, 'alert', 'a soldier steps forward and stamps to attention, armour rattle'),
 'research':(2, 1.6, 'alert', 'a heavy book page turning and a quill scratching, then a soft bright bell chime'),
 'ageup':   (1, 3.5, 'alert', 'a triumphant medieval brass fanfare by several heralds trumpets, regal and bright'),
 'bell':    (2, 2.5, 'alert', 'a large town bell ringing twice in alarm'),
 'attacked':(2, 2.0, 'alert', 'a deep war horn blowing a short urgent alarm'),
 'capture': (3, 2.5, 'alert', 'a heavy wooden castle gate slamming shut followed by one deep resonant bell toll, grand and final'),
 'kingdown':(1, 3.0, 'alert', 'a solemn low war drum roll and a long mournful horn'),
 'victory': (1, 5.0, 'alert', 'a medieval victory fanfare with trumpets and drums and a crowd cheering'),
 'defeat':  (1, 5.0, 'alert', 'a slow sad medieval horn lament with a single low drum'),
 'record':  (1, 2.0, 'alert', 'a bright short medieval fanfare flourish of two trumpets'),
 # ambient beds, one per kind of map (seamless loops)
 'amb_meadow': (1, 22, 'ambient', 'peaceful countryside meadow ambience, songbirds, gentle breeze in grass, distant cowbell, calm'),
 'amb_forest': (1, 22, 'ambient', 'deep forest ambience, rustling leaves, woodpecker, distant owl, birds, calm'),
 'amb_river':  (1, 22, 'ambient', 'riverside ambience, flowing water over stones, birds, light breeze'),
 'amb_desert': (1, 22, 'ambient', 'desert ambience, dry wind gusts and blowing sand, a distant hawk, sparse'),
 'amb_highland':(1, 22, 'ambient', 'windy highland ambience, wind over rocky hills, distant eagle cry'),
}


def gen(text, dur, cat, path):
    loop = cat == 'ambient'
    body = {'text': text + ('' if cat in ('voice', 'ambient') else STYLE), 'duration_seconds': dur, 'prompt_influence': 0.55}
    if loop: body['loop'] = True
    req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', data=json.dumps(body).encode(), method='POST',
        headers={'xi-api-key': os.environ['ELEVEN_KEY'], 'Content-Type': 'application/json'})
    raw = urllib.request.urlopen(req, timeout=180).read()
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as t: t.write(raw)
    if loop:   # keep the loop seamless: no trimming or fades
        af = f'loudnorm=I={LOUD[cat]}:TP=-2'
        br = '64k'
    else:
        fade = min(0.25, dur * 0.25)
        af = (f'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,'
              f'loudnorm=I={LOUD[cat]}:TP=-1.5,afade=t=out:st={max(0.05, dur - fade):.2f}:d={fade:.2f}')
        br = '96k'
    # loudness: measure first, then a plain gain change (ffmpeg's one-pass loudnorm can hang on some files)
    m = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', t.name, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True, timeout=60).stderr
    found = re.findall(r'I:\s+(-?[\d.]+) LUFS', m)
    gain = (LOUD[cat] - float(found[-1])) if found and float(found[-1]) > -70 else 0
    af = af.replace(f'loudnorm=I={LOUD[cat]}:TP=-1.5', f'volume={gain:.1f}dB,alimiter=limit=0.89').replace(f'loudnorm=I={LOUD[cat]}:TP=-2', f'volume={gain:.1f}dB,alimiter=limit=0.8')
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1' if not loop else '2', '-af', af, '-b:a', br, path], check=True, timeout=60)
    os.unlink(t.name)


if __name__ == '__main__':
    keys = sys.argv[1:] or list(SFX)
    for k in keys:
        n, dur, cat, p = SFX[k]
        for i in range(1, n + 1):
            out = os.path.join(OUT, f'{k}_{i}.mp3')
            if os.environ.get('SKIP_EXISTING') and os.path.exists(out): continue
            try: gen(p, dur, cat, out); print('done', k, i, flush=True)
            except Exception as e: print('FAIL', k, i, e, flush=True)
