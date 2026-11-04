"""Voice the Learn to Play narrator with ElevenLabs text-to-speech.

Usage: ELEVEN_KEY=... python3 tools/tutorial_voice.py [voice_id]
Reads each step's text from js/tutorial.js (the same words shown as subtitles) and writes
assets/sound/voice/tut_<n>.mp3. Default voice: George, a warm British storyteller.
"""
import json, os, re, subprocess, sys, tempfile, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'JBFqnCBsd6RMkjVDRZzb'
src = open(os.path.join(ROOT, 'js/tutorial.js'), encoding='utf-8').read()
block = src[src.index('const STEPS = ['):src.index('T.LINES')]
lines = [re.sub(r'<[^>]+>', '', t).replace('⭐ ', '') for t in re.findall(r"text: '((?:[^'\\]|\\.)*)'", block)]
out = os.path.join(ROOT, 'assets/sound/voice'); os.makedirs(out, exist_ok=True)
for i, text in enumerate(lines, 1):
    body = {'text': text, 'model_id': 'eleven_multilingual_v2', 'voice_settings': {'stability': 0.55, 'similarity_boost': 0.8, 'style': 0.25}}
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}', data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': os.environ['ELEVEN_KEY'], 'Content-Type': 'application/json'})
    raw = urllib.request.urlopen(req, timeout=120).read()
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as t: t.write(raw)
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1', '-af', 'loudnorm=I=-17:TP=-1.5', '-b:a', '64k', os.path.join(out, f'tut_{i}.mp3')], check=True)
    os.unlink(t.name); print('voiced', i, text[:50], flush=True)
