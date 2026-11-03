"""Synthesize every game sound effect in code, as a stand-in while the AI sound service is down.

    python3 tools/synth_sfx.py          # writes build/sfx/<key>_<n>.mp3, then runs gen_sfx's prep

Each sound is built from simple pieces: decaying sine partials (wood knocks, bells, metal),
filtered noise (swishes, crumbles, dirt), plucked strings (bowstrings) and saw-wave brass
(horns, fanfares). Takes of the same sound differ in pitch and noise so repeats don't drone.
gen_sfx.py skips any take that already exists, so to replace these with recorded sounds,
delete build/sfx/<key>_*.mp3 and run gen_sfx.py.
"""
import os, subprocess, sys
import numpy as np
from scipy import signal

SR = 44100
RAW = 'build/sfx'
rng = np.random.default_rng(7)


def t_(d): return np.arange(int(SR * d)) / SR
def env(d, a=0.002, k=8.0):
    t = t_(d); e = np.exp(-k * t)
    na = max(1, int(SR * a)); e[:na] *= np.linspace(0, 1, na)
    return e
def tone(f, d, k=8.0, a=0.002, ph=0.0): return np.sin(2 * np.pi * f * t_(d) + ph) * env(d, a, k)
def noise(d): return rng.standard_normal(int(SR * d))
def band(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band'); return signal.lfilter(b, a, x)
def low(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'low'); return signal.lfilter(b, a, x)
def high(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'high'); return signal.lfilter(b, a, x)
def mix(*parts, at=None):
    at = at or [0] * len(parts)
    n = max(int(SR * o) + len(p) for p, o in zip(parts, at)); out = np.zeros(n)
    for p, o in zip(parts, at): s = int(SR * o); out[s:s + len(p)] += p
    return out
def sweep(f0, f1, d, k=3.0):
    t = t_(d); f = np.geomspace(f0, f1, len(t)); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, 0.005, k)
def pluck(f, d, damp=0.996):
    n = int(SR / f); buf = rng.uniform(-1, 1, n); out = np.zeros(int(SR * d))
    for i in range(len(out)):
        out[i] = buf[i % n]; buf[i % n] = damp * 0.5 * (buf[i % n] + buf[(i + 1) % n])
    return out
def metal(f, d, k=6.0, parts=(1, 1.47, 2.09, 2.76, 3.52)):
    return sum(tone(f * p * rng.uniform(0.99, 1.01), d, k * (1 + 0.4 * i)) / (1 + i * 0.6) for i, p in enumerate(parts))
def brass(f, d, a=0.04, rel=0.15, vib=5.0):
    t = t_(d); ph = 2 * np.pi * np.cumsum(f * (1 + 0.006 * np.sin(2 * np.pi * vib * t))) / SR
    w = signal.sawtooth(ph) * 0.6 + np.sin(ph) * 0.4
    e = np.minimum(1, t / a) * np.minimum(1, (d - t) / rel)
    return low(w * e, 1800 + f * 2)
def bell(f, d, k=1.6): return metal(f, d, k, (0.5, 1, 1.19, 1.5, 2.0, 2.74, 3.0))
def whoosh(d, lo=600, hi=3000):
    x = band(noise(d), lo, hi); t = t_(d); return x * np.sin(np.pi * t / d) ** 2
def thud(f, d, k=18): return tone(f, d, k) + 0.4 * low(noise(d), f * 3) * env(d, 0.001, k * 1.5)


def build(key, i):
    v = rng.uniform(0.92, 1.08)   # pitch variation per take
    if key == 'click': return mix(tone(2200 * v, 0.03, 160), 0.3 * high(noise(0.01), 3000))
    if key == 'select': return mix(tone(620 * v, 0.08, 45), tone(930 * v, 0.07, 55), at=[0, 0.03])
    if key == 'command': return mix(tone(340 * v, 0.09, 40), 0.4 * band(noise(0.03), 800, 2500), tone(510 * v, 0.06, 50), at=[0, 0, 0.05])
    if key == 'error': return mix(tone(190, 0.12, 25), tone(150, 0.14, 25), at=[0, 0.12])
    if key == 'chop': return mix(thud(110 * v, 0.18, 22), 0.8 * band(noise(0.05), 900, 3500) * env(0.05, 0.001, 60), tone(420 * v, 0.1, 40) * 0.4)
    if key == 'mine': return mix(0.6 * metal(1900 * v, 0.35, 9), 0.7 * high(noise(0.02), 2500) * env(0.02, 0.0005, 150), thud(140, 0.1) * 0.5)
    if key == 'farm': return mix(0.8 * band(noise(0.25), 1500 * v, 5000) * np.sin(np.pi * t_(0.25) / 0.25), thud(90, 0.12, 25) * 0.6, at=[0, 0.18])
    if key == 'build': return mix(tone(230 * v, 0.12, 35), tone(690 * v, 0.06, 70) * 0.5, 0.5 * band(noise(0.015), 1500, 5000))
    if key == 'place': return mix(thud(80, 0.3, 14), 0.4 * low(noise(0.25), 900) * env(0.25, 0.01, 12))
    if key == 'complete': return mix(*(bell(f, 1.2, 3) * 0.5 for f in (523, 659, 784)), at=[0, 0.14, 0.28])
    if key == 'sword': return mix(metal(2300 * v, 0.45, 9, (1, 1.37, 2.03, 2.71, 3.4, 4.1)), 1.2 * high(noise(0.03), 2000) * env(0.03, 0.0005, 90))
    if key == 'spear': return mix(0.6 * whoosh(0.18, 500, 2500), thud(160 * v, 0.18, 28), 0.5 * band(noise(0.04), 700, 2200), at=[0, 0.15, 0.15])
    if key == 'bow': return mix(0.7 * pluck(105 * v, 0.35, 0.993) * env(0.35, 0.001, 10), 0.5 * whoosh(0.3, 1500, 6000), at=[0, 0.03])
    if key == 'bolt': return mix(0.8 * tone(900 * v, 0.04, 80), thud(200, 0.08, 40), 0.45 * whoosh(0.22, 2000, 7000), at=[0, 0, 0.02])
    if key == 'axethrow':
        d = 0.5; w = band(noise(d), 500, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * t_(d))) * np.sin(np.pi * t_(d) / d)
        return mix(0.7 * w, thud(180 * v, 0.15, 30), at=[0, 0.45])
    if key == 'ram': return mix(thud(55 * v, 0.7, 6), 0.7 * band(noise(0.5), 200, 1400) * env(0.5, 0.002, 9), tone(110 * v, 0.4, 10) * 0.5)
    if key == 'trebuchet':
        creak = 0.25 * band(signal.sawtooth(2 * np.pi * np.cumsum(np.geomspace(60, 140, int(SR * 0.4))) / SR), 300, 2000)
        return mix(creak, 0.6 * whoosh(0.6, 200, 1200), thud(60, 0.5, 8), at=[0, 0.35, 0.9])
    if key == 'stonehit': return mix(thud(45 * v, 0.9, 5), 0.6 * band(noise(1.0), 300, 3000) * env(1.0, 0.002, 4.5), 0.3 * high(noise(0.6), 2500) * env(0.6, 0.05, 6), at=[0, 0, 0.1])
    if key == 'die': return mix(thud(95 * v, 0.35, 12), 0.35 * band(noise(0.2), 300, 1500) * env(0.2, 0.002, 18), 0.25 * metal(1500 * v, 0.25, 14), at=[0, 0, 0.02])
    if key == 'buildingdown':
        d = 1.9; rumble = low(noise(d), 180) * np.exp(-1.8 * t_(d)) * 2.5
        cracks = sum(0.5 * band(noise(0.08), 800, 4000) * env(0.08, 0.001, 40) for _ in range(1))
        return mix(rumble, thud(50, 1.0, 4), *[cracks * rng.uniform(0.4, 1) for _ in range(6)], at=[0, 0] + list(np.sort(rng.uniform(0, 1.2, 6))))
    if key == 'heal': return mix(*(0.35 * bell(f, 1.0, 3.5) for f in (880, 1175, 1320, 1760)), 0.08 * band(noise(1.0), 3000, 9000) * np.sin(np.pi * t_(1.0)), at=[0, 0.1, 0.2, 0.3, 0])
    if key == 'train': return mix(brass(392, 0.22), brass(523, 0.45), at=[0, 0.2])
    if key == 'research': return mix(0.4 * band(noise(0.3), 2000, 7000) * np.sin(np.pi * t_(0.3) / 0.3) ** 2, *(0.4 * bell(f, 0.9, 4) for f in (784, 988, 1175)), at=[0, 0.3, 0.42, 0.54])
    if key == 'ageup': return mix(brass(392, 0.25), brass(392, 0.18), brass(523, 0.25), brass(659, 0.3), brass(784, 1.4), brass(523, 1.4) * 0.6, brass(392, 1.4) * 0.5, at=[0, 0.28, 0.48, 0.75, 1.1, 1.1, 1.1])
    if key == 'bell': return mix(*(bell(330, 2.0, 1.4) for _ in range(3)), at=[0, 0.55, 1.1])
    if key == 'attacked': return mix(brass(147, 0.7, 0.12, 0.25, 3), brass(147 * 1.33, 0.9, 0.12, 0.35, 3), at=[0, 0.65])
    if key == 'kingdown': return mix(brass(196, 0.9, 0.15, 0.3, 3), brass(175, 0.9, 0.15, 0.3, 3), brass(147, 1.6, 0.15, 0.8, 3), bell(98, 2.5, 1.2) * 0.5, at=[0, 0.85, 1.7, 0])
    if key == 'victory':
        n = [(523, 0, .2), (523, .22, .2), (523, .44, .2), (659, .66, .5), (587, 1.2, .25), (659, 1.45, .25), (784, 1.7, 1.6)]
        return mix(*[brass(f, d) for f, o, d in n], brass(392, 1.6) * 0.5, brass(523, 1.6) * 0.5, at=[o for f, o, d in n] + [1.7, 1.7])
    if key == 'defeat':
        n = [(392, 0, .7), (349, .7, .7), (311, 1.4, .7), (262, 2.1, 1.8)]
        return mix(*[brass(f, d, 0.1, 0.4, 3) for f, o, d in n], brass(196, 1.8, 0.2, 0.9, 3) * 0.5, at=[o for f, o, d in n] + [2.1])
    raise KeyError(key)


if __name__ == '__main__':
    sys.path.insert(0, 'tools'); os.environ.setdefault('KIE_KEY', '-')
    import gen_sfx
    os.makedirs(RAW, exist_ok=True)
    for key, (sec, takes, _) in gen_sfx.SFX.items():
        for i in range(takes):
            f = f'{RAW}/{key}_{i + 1}.mp3'
            if os.path.exists(f) and '--redo' not in sys.argv: continue
            x = build(key, i); x = x / (np.abs(x).max() + 1e-9) * 0.9
            fade = int(SR * 0.01); x[-fade:] *= np.linspace(1, 0, fade)
            wav = f'{RAW}/_tmp.wav'
            from scipy.io import wavfile
            wavfile.write(wav, SR, (x * 32767).astype(np.int16))
            subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '128k', f], check=True)
            print('made', f)
    os.remove(f'{RAW}/_tmp.wav') if os.path.exists(f'{RAW}/_tmp.wav') else None
    gen_sfx.prep()
