"""Balance test: the computer plays every dynasty against every other, both starting sides,
on the same maps, and reports win rates and how each match was won.

    python3 tools/balance.py [minutes=35] [level=hard] [seeds=1] [civ ...]

Needs the game served at http://localhost:8123 (python3 -m http.server 8123 in the repo).
A match not over by the time limit is decided on score (as the in-game time limit is).
"""
import asyncio, itertools, json, sys, time
from playwright.async_api import async_playwright

MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 35
LVL = sys.argv[2] if len(sys.argv) > 2 else 'hard'
SEEDS = int(sys.argv[3]) if len(sys.argv) > 3 else 1
CIVS = sys.argv[4:] or ['britons', 'franks', 'byzantines', 'chinese', 'persians', 'incas', 'cholas']

MATCH = """async ([a, b, seed, mins, lvl]) => {
  G.newGame({ players: [{ civ: a }, { civ: b, ai: lvl }], seed, size: 'small', mode: 'conquest' });
  // player 1 is normally the human: give it a computer brain too
  G.players[1].ai = lvl; const ai = G.makeAI(); ai.level = lvl; ai.init(1); G.ais.push(ai);
  G.paused = false; const t0 = performance.now();
  while (G.time < mins * 60 && !G.over) G.step(0.034);
  const left = p => G.ents.filter(e => !e.dead && e.owner === p).length;
  const army = p => G.ents.filter(e => !e.dead && e.owner === p && e.kind === 'unit' && e.type !== 'villager').length;
  const kills = p => (G.players[p].stats || {}).kills || 0;
  let win = G.over ? (G.over === 'victory' ? 1 : 2) : (G.scoreOf(1) >= G.scoreOf(2) ? 1 : 2);
  const uniq = p => G.ents.filter(e => !e.dead && e.owner === p && e.type === G.CIVS[G.players[p].civ].unique.type).length;
  return { a, b, win, how: G.over ? 'conquest' : 'score', t: Math.round(G.time / 60), s: [G.scoreOf(1), G.scoreOf(2)],
           age: [G.ageOf(1), G.ageOf(2)], army: [army(1), army(2)], uniq: [uniq(1), uniq(2)], wall: Math.round((performance.now() - t0) / 1000) };
}"""

async def worker(q, out, br):
    pg = await br.new_page()
    await pg.add_init_script("localStorage.setItem('dod.prefs.v1', JSON.stringify({intro:'off',dynfilm:'off',tips:'off'}))")
    await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_timeout(2000)
    while not q.empty():
        a, b, seed = await q.get()
        try:
            r = await pg.evaluate(MATCH, [a, b, seed, MIN, LVL])
        except Exception as e:
            r = {'a': a, 'b': b, 'error': str(e)[:200]}
            await pg.reload(); await pg.wait_for_timeout(2000)
        out.append(r); print(json.dumps(r), flush=True)

async def main():
    q = asyncio.Queue()
    for s in range(SEEDS):
        for a, b in itertools.combinations(CIVS, 2):
            seed = 1000 + s * 7919 + hash((a, b)) % 997
            await q.put((a, b, seed)); await q.put((b, a, seed))   # same map, swapped sides
    out = []
    async with async_playwright() as p:
        br = await p.chromium.launch()
        await asyncio.gather(*[worker(q, out, br) for _ in range(int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5].isdigit() else 2)])
        await br.close()
    json.dump(out, open('build/balance.json', 'w'), indent=1)
    W = {c: [0, 0] for c in CIVS}
    for r in out:
        if 'win' not in r: continue
        w, l = (r['a'], r['b']) if r['win'] == 1 else (r['b'], r['a'])
        W[w][0] += 1; W[w][1] += 1; W[l][1] += 1
    print('\nwin rate')
    for c, (w, n) in sorted(W.items(), key=lambda x: -x[1][0] / max(1, x[1][1])):
        print(f'  {c:11s} {w:2d}/{n:2d}  {100 * w / max(1, n):5.1f}%')
asyncio.run(main())
