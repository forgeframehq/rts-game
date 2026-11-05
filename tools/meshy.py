"""Meshy: picture -> textured 3D model -> rigged character, for the 3D sprite pipeline.

    MESHY_KEY=... python3 tools/meshy.py model  <image.png> <out_dir>   # image-to-3D, then rig
    MESHY_KEY=... python3 tools/meshy.py status <out_dir>

Writes <out_dir>/<stem>.json with the task ids and downloads <stem>_rig.glb. The key is read
from the environment and never stored. Rigged GLBs go on the `models` branch, not main.
Rigging reuses the shared humanoid skeleton, so a new character borrows every animation the
villager already has (tools/render3d, clipsUrl) at no further cost.
"""
import base64, json, os, sys, time, urllib.request
KEY = os.environ["MESHY_KEY"]; API = "https://api.meshy.ai/openapi/v1"

def call(method, path, body=None):
    req = urllib.request.Request(("https://api.meshy.ai/openapi" + path[1:]) if path.startswith("!") else API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())

def wait(kind, tid):
    while True:
        t = call("GET", f"!/{kind[1:]}/{tid}" if kind.startswith("!") else f"/{kind}/{tid}")
        if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"): return t
        time.sleep(15)

def text_model(stem, prompt, out):
    """Text -> 3D (preview, then textured refine) -> rig, for when a concept picture isn't wanted.
    Same output as model(): <out>/<stem>_rig.glb on the shared humanoid skeleton."""
    os.makedirs(out, exist_ok=True)
    rec_p = os.path.join(out, stem + ".json")
    rec = json.load(open(rec_p)) if os.path.exists(rec_p) else {}
    V2 = "!/v2/text-to-3d"
    if not rec.get("preview"):
        rec["preview"] = call("POST", V2, {"mode": "preview", "prompt": prompt[:600], "art_style": "realistic", "should_remesh": True,
                              "topology": "triangle", "target_polycount": 30000, "pose_mode": "a-pose", "ai_model": os.environ.get("MESHY_MODEL", "latest")})["result"]
        json.dump(rec, open(rec_p, "w"))
    t = wait("!v2/text-to-3d", rec["preview"])
    if t["status"] != "SUCCEEDED": sys.exit(f"{stem}: preview {t['status']} {t.get('task_error')}")
    if not rec.get("refine"):
        rec["refine"] = call("POST", V2, {"mode": "refine", "preview_task_id": rec["preview"], "enable_pbr": False,
                             "texture_prompt": prompt[:600]})["result"]
        json.dump(rec, open(rec_p, "w"))
    r = wait("!v2/text-to-3d", rec["refine"])
    if r["status"] != "SUCCEEDED": sys.exit(f"{stem}: refine {r['status']} {r.get('task_error')}")
    if not rec.get("rig"):
        rec["rig"] = call("POST", "/rigging", {"model_url": r["model_urls"]["glb"], "height_meters": 1.75})["result"]
        json.dump(rec, open(rec_p, "w"))
    g = wait("rigging", rec["rig"])
    if g["status"] != "SUCCEEDED": sys.exit(f"{stem}: rig {g['status']} {g.get('task_error')}")
    urllib.request.urlretrieve(g["result"]["rigged_character_glb_url"], os.path.join(out, stem + "_rig.glb"))
    urllib.request.urlretrieve(r["thumbnail_url"], os.path.join(out, stem + "_thumb.png"))
    print(stem, "rigged", flush=True)


def model(img, out):
    os.makedirs(out, exist_ok=True)
    stem = os.path.splitext(os.path.basename(img))[0]
    rec_p = os.path.join(out, stem + ".json")
    rec = json.load(open(rec_p)) if os.path.exists(rec_p) else {}
    if not rec.get("model"):
        uri = "data:image/png;base64," + base64.b64encode(open(img, "rb").read()).decode()
        rec["model"] = call("POST", "/image-to-3d", {"image_url": uri, "ai_model": os.environ.get("MESHY_MODEL", "latest"), "should_texture": True,
                            "enable_pbr": False, "pose_mode": "a-pose", "should_remesh": True, "topology": "triangle", "target_polycount": 30000})["result"]
        rec["light"] = True          # simplified by Meshy as it was built: rigs as it is
        json.dump(rec, open(rec_p, "w"))
    t = wait("image-to-3d", rec["model"])
    if t["status"] != "SUCCEEDED": sys.exit(f"{stem}: model {t['status']} {t.get('task_error')}")
    # rigging refuses anything over 380k triangles: simplify first if the model came out heavier
    src = rec["model"]
    if (not rec.get("rig") and not rec.get("light")) or rec.get("remesh"):
        if not rec.get("remesh"):
            rec["remesh"] = call("POST", "/remesh", {"input_task_id": rec["model"], "target_polycount": 30000,
                                 "topology": "triangle", "target_formats": ["glb"]})["result"]
            json.dump(rec, open(rec_p, "w"))
        rm = wait("remesh", rec["remesh"])
        if rm["status"] != "SUCCEEDED": sys.exit(f"{stem}: remesh {rm['status']} {rm.get('task_error')}")
        src = rec["remesh"]
    if not rec.get("rig"):
        # Rig from the model FILE, not the task: rigging a Meshy 6 Lite task by its id returns a
        # skeleton with no body attached, while the same model handed over as a file rigs fine.
        kind = "remesh" if src == rec.get("remesh") else "image-to-3d"
        url = call("GET", f"/{kind}/{src}")["model_urls"]["glb"]
        rec["rig"] = call("POST", "/rigging", {"model_url": url, "height_meters": 1.75})["result"]
        json.dump(rec, open(rec_p, "w"))
    r = wait("rigging", rec["rig"])
    if r["status"] != "SUCCEEDED": sys.exit(f"{stem}: rig {r['status']} {r.get('task_error')}")
    url = r["result"]["rigged_character_glb_url"]
    urllib.request.urlretrieve(url, os.path.join(out, stem + "_rig.glb"))
    urllib.request.urlretrieve(t["thumbnail_url"], os.path.join(out, stem + "_thumb.png"))
    print(stem, "rigged")

if __name__ == "__main__":
    if sys.argv[1] == "model": model(sys.argv[2], sys.argv[3])
    if sys.argv[1] == "static":   # image -> textured model only, no rig (animals animated in code)
        img, out = sys.argv[2], sys.argv[3]; os.makedirs(out, exist_ok=True); stem = os.path.splitext(os.path.basename(img))[0]
        uri = "data:image/png;base64," + base64.b64encode(open(img, "rb").read()).decode()
        tid = call("POST", "/image-to-3d", {"image_url": uri, "ai_model": os.environ.get("MESHY_MODEL", "latest"), "should_texture": True, "enable_pbr": False,
                   "should_remesh": True, "topology": "triangle", "target_polycount": 30000})["result"]
        t = wait("image-to-3d", tid)
        if t["status"] != "SUCCEEDED": sys.exit(f"{stem}: {t['status']}")
        urllib.request.urlretrieve(t["model_urls"]["glb"], os.path.join(out, stem + ".glb")); print(stem, "done", flush=True)
    if sys.argv[1] == "text": text_model(sys.argv[2], open(sys.argv[3]).read().strip(), sys.argv[4])   # stem prompt_file out_dir
