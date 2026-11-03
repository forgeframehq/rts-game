"""Generate game art with Kie, image-to-image from the art already in this repo.

Usage:  KIE_KEY=... python3 tools/gen_art.py tools/art_jobs/<jobs>.json
        KIE_KEY=... python3 tools/gen_art.py tools/art_jobs/<jobs>.json only_stem,other_stem

The key is read from the environment and never stored here.

Why image-to-image: every sprite in the game is already in `assets/source/`, reachable
raw from GitHub. Feeding the matching sprite in as the reference carries over the camera
angle, the footprint width and the painted style, so a prompt only has to say what
changes — the architecture, the gear, the man. Prompting a building from nothing gets you
something that looks close but sits wrong on the grid.

A jobs file is {"out": "<folder>", "jobs": [[stem, ref, prompt, keep?], ...]}:
  stem    the output file name, <out>/<stem>.png. An existing file is skipped, so a run
          can be repeated to fill in whatever failed without paying for the rest again.
  ref     "" for text-to-image (no reference art exists yet — siege engines, say),
          "house" or "mediterranean/barracks.jpg" for something in assets/source/,
          "repo:assets/ui/icons/knight.png" for anything else in the repo.
  prompt  what changes.
  keep    optional; replaces KEEP below when the job is not a building (icons, units).

THE KEY'S MODELS: this account's key is restricted to the GPT Image models. Kie validates
the input before it checks authorisation, so an unauthorised model answers 422 about some
missing field and looks available — only a request with every field right returns the 401
that tells you the truth. Don't trust a 422 as proof a model works.

Cost, measured: about 6 Kie credits an image at the settings below.

Afterwards: tools/ingest_art.py sorts regional buildings into the game;
tools/process_unit.py takes single sprites; both write assets/manifest.json.
"""
import json, os, sys, time, urllib.request

KEY = os.environ["KIE_KEY"]
API = "https://api.kie.ai/api/v1/jobs"
MODEL = os.environ.get("KIE_MODEL", "gpt-image-2-5-flare-image-to-image")
T2I = os.environ.get("KIE_MODEL_T2I", "gpt-image-2-5-flare-text-to-image")
ROOT = "https://raw.githubusercontent.com/forgeframehq/rts-game/main"
RAW = ROOT + "/assets/source"

# Appended to every building prompt. It is most of what makes the result drop straight
# onto the tile grid, so change it with care.
KEEP = (
    "Keep the camera and the geometry of the reference exactly: the same true 2:1 isometric "
    "view, the same corner-on angle, the same overall height and the same ground footprint "
    "width, so it drops straight into the same tile. Keep the hand-painted semi-realistic "
    "Age of Empires 2 style and the lighting from the upper left. Replace only the "
    "architecture and materials, as described. Plain pure white background, no ground tile, "
    "no grass, no cast shadow on the background, no people, no text, no labels, no border. "
    "Any flag, banner, awning or cloth trim must be pure magenta #FF00FF, and nothing else "
    "in the image may be magenta or pink."
)


def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + KEY,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def get(path):
    req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def credits():
    """Credits left on the key — the balance reads fine even for a model the key cannot use."""
    req = urllib.request.Request("https://api.kie.ai/api/v1/chat/credit",
                                 headers={"Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("data")


def ref_url(ref):
    if ref.startswith("http"):
        return ref
    if ref.startswith("repo:"):
        return ROOT + "/" + ref[5:]
    return RAW + "/" + (ref if ref.endswith((".png", ".jpg")) else ref + ".png")


def create(prompt, ref):
    inp = {"prompt": prompt, "aspect_ratio": "1:1", "output_format": "png", "quality": "high"}
    if ref:
        inp["image_urls"] = [ref_url(ref)]
    r = post("/createTask", {"model": MODEL if ref else T2I, "input": inp})
    if r.get("code") != 200:
        raise RuntimeError(r)
    return r["data"]["taskId"]


def wait(tid, timeout=1200):
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(10)
        d = (get("/recordInfo?taskId=" + tid) or {}).get("data") or {}
        st = (d.get("state") or d.get("status") or "").lower()
        if st in ("success", "succeeded"):
            res = d.get("resultJson") or d.get("result")
            if isinstance(res, str):
                res = json.loads(res)
            return res.get("resultUrls") or res.get("result_urls") or res.get("urls")
        if st in ("fail", "failed", "generate_fail"):
            raise RuntimeError(str(d.get("failMsg") or d)[:200])
    raise TimeoutError(tid)


def run(jobs, out_dir, only=None):
    """Queue every job first, then collect them: they generate in parallel server side."""
    os.makedirs(out_dir, exist_ok=True)
    queued = []
    for job in jobs:
        stem, ref, body = job[0], job[1], job[2]
        keep = job[3] if len(job) > 3 else KEEP
        if only and stem not in only:
            continue
        if os.path.exists(os.path.join(out_dir, stem + ".png")):
            print("skip (have)", stem, flush=True); continue
        try:
            queued.append((stem, create(body + " " + keep, ref)))
            print("queued", stem, flush=True)
        except Exception as e:
            print("QUEUE FAIL", stem, repr(e)[:200], flush=True)
        time.sleep(1)
    ok = 0
    for stem, tid in queued:
        try:
            urls = wait(tid)
            with urllib.request.urlopen(urls[0], timeout=300) as r, \
                    open(os.path.join(out_dir, stem + ".png"), "wb") as f:
                f.write(r.read())
            ok += 1; print("done", stem, flush=True)
        except Exception as e:
            # a server-side error happens now and then; re-run the same jobs file to retry
            print("FAILED", stem, repr(e)[:200], flush=True)
    print(f"{ok}/{len(queued)} generated")


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
    run(spec["jobs"], spec["out"], only)
