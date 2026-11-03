"""Make the game's sound effects with ElevenLabs Sound Effects on Kie, and fit them in.

    KIE_KEY=... python3 tools/gen_sfx.py            # generate what is missing, then prepare
    python3 tools/gen_sfx.py --prep                 # only re-trim / re-level what is there

Each key in js/sound.js gets one or more takes (several takes of a frequent sound are picked
at random so it never wears out). Raw takes go to build/sfx/, finished files to
assets/sound/sfx/: trimmed of silence, faded, levelled to the same loudness, mono 44.1 kHz
mp3. assets/sound/manifest.json is updated with every file that exists; music is untouched.
"""
import json, os, subprocess, sys, time, urllib.request
SFX = {
 # key: (seconds, takes, prompt)
 'click':    (0.5, 1, "A short soft wooden click of a medieval game menu button, dry, no reverb"),
 'select':   (0.5, 2, "A brief soft leather and cloth rustle with a faint wooden tap, like a medieval villager turning to attention, very short"),
 'command':  (0.6, 2, "A short crisp leather creak and a soft footstep on earth, acknowledging an order, very short, dry"),
 'error':    (0.6, 1, "A dull low wooden knock, two quick soft thuds, a gentle 'not allowed' sound for a medieval game interface"),
 'chop':     (0.7, 3, "A single axe blow biting into a tree trunk, sharp wooden thock, outdoors, short"),
 'mine':     (0.7, 3, "A single iron pickaxe striking hard rock, a bright clink with small stones falling, outdoors, short"),
 'farm':     (0.9, 2, "A hoe scraping and chopping into soft farm soil, a short rustle of wheat, outdoors"),
 'build':    (0.6, 3, "A single wooden mallet striking a timber peg on a building frame, solid wooden knock, outdoors, short"),
 'place':    (0.7, 1, "A wooden stake driven into the ground with one firm thump and a little earth scatter"),
 'complete': (1.6, 1, "A building finished in a medieval village: a last hammer blow, a creak of settling timber, and a short warm horn note"),
 'sword':    (0.6, 3, "A single steel sword clash against a shield, medieval melee, short sharp ring, no voices"),
 'spear':    (0.6, 2, "A spear thrust striking a wooden shield, a hard thud with a short wooden crack, no voices"),
 'bow':      (0.7, 3, "A single arrow loosed from a longbow: the string twang and the whoosh of the arrow, short"),
 'bolt':     (0.6, 2, "A crossbow firing: a hard mechanical clack and a short bolt whoosh"),
 'axethrow': (0.8, 2, "A throwing axe spinning through the air with a fast whirr and striking wood with a thunk"),
 'ram':      (1.0, 2, "A heavy wooden battering ram slamming into a timber gate, deep boom with splintering wood"),
 'trebuchet':(1.6, 1, "A trebuchet releasing: creaking timber, a rope snap and a heavy whoosh of a thrown stone"),
 'stonehit': (1.2, 2, "A large boulder crashing into a stone wall, heavy impact with rubble falling"),
 'die':      (0.8, 3, "A soldier falling in battle: a short pained grunt and the thud of a body and armour on the ground, no words"),
 'buildingdown': (2.0, 2, "A wooden building collapsing: timber cracking, a roof caving in, and dust settling"),
 'heal':     (1.2, 1, "A soft gentle chime with a breath of wind, a calm healing blessing, subtle"),
 'train':    (1.0, 1, "A short confident medieval trumpet note announcing a new unit is ready, small and bright"),
 'research': (1.4, 1, "Pages of an old book turning and a quill scratch, ending on a soft bell, a discovery made"),
 'ageup':    (3.0, 1, "A triumphant medieval brass fanfare with a drum roll, a new age has begun, short and grand"),
 'bell':     (2.5, 1, "A medieval town bell ringing an alarm, three urgent clangs"),
 'attacked': (1.6, 1, "A distant medieval war horn sounding an alarm, two short urgent blasts"),
 'kingdown': (3.0, 1, "A low mournful medieval horn and a single deep bell toll, the king has fallen"),
 'victory':  (4.0, 1, "A rousing medieval victory fanfare of trumpets and drums, a short triumphant flourish"),
 'defeat':   (4.0, 1, "A slow sad medieval horn lament with a muffled drum, a short defeat theme"),
}
RAW, OUT = 'build/sfx', 'assets/sound/sfx'

def kie(path, body=None):
    key = os.environ['KIE_KEY']
    req = urllib.request.Request('https://api.kie.ai/api/v1/jobs' + path, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)

def generate(batch=3):
    """A few at a time: a full queue at once made the sound service time out every request."""
    os.makedirs(RAW, exist_ok=True)
    todo = [(f'{RAW}/{k}_{i + 1}.mp3', prompt, sec) for k, (sec, n, prompt) in SFX.items()
            for i in range(n) if not os.path.exists(f'{RAW}/{k}_{i + 1}.mp3')]
    print('to make', len(todo), flush=True)
    for s0 in range(0, len(todo), batch):
        q = []
        for f, prompt, sec in todo[s0:s0 + batch]:
            r = kie('/createTask', {'model': 'elevenlabs/sound-effect-v2', 'input': {
                'text': prompt, 'duration_seconds': max(0.5, sec), 'prompt_influence': 0.55, 'output_format': 'mp3_44100_128'}})
            if r.get('code') == 200: q.append((f, r['data']['taskId']))
            else: print('QUEUE FAIL', f, r, flush=True)
        for f, tid in q:
            for _ in range(150):
                time.sleep(4)
                d = (kie('/recordInfo?taskId=' + tid) or {}).get('data') or {}
                st = (d.get('state') or '').lower()
                if st == 'success':
                    res = json.loads(d['resultJson']) if isinstance(d.get('resultJson'), str) else d.get('resultJson')
                    urllib.request.urlretrieve((res.get('resultUrls') or [None])[0], f); print('done', f, flush=True); break
                if st in ('fail', 'failed'): print('FAILED', f, d.get('failMsg'), flush=True); break

def prep():
    os.makedirs(OUT, exist_ok=True)
    files = {}
    for k in SFX:
        for i in range(1, 10):
            src = f'{RAW}/{k}_{i}.mp3'
            if not os.path.exists(src): break
            dst = f'{OUT}/{k}_{i}.mp3'
            # trim leading/trailing silence, short fades, level every take to the same loudness
            af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,'
                  'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
                  'afade=t=in:d=0.005,loudnorm=I=-18:TP=-2:LRA=11')
            subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', dst], check=True)
            files.setdefault(k, []).append('sfx/' + os.path.basename(dst))
    m = json.load(open('assets/sound/manifest.json'))
    m.update(files)
    json.dump(m, open('assets/sound/manifest.json', 'w'), indent=1)
    print('prepared', sum(len(v) for v in files.values()), 'files for', len(files), 'sounds')

if __name__ == '__main__':
    if '--prep' not in sys.argv: generate()
    prep()
