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
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())

def wait(kind, tid):
    while True:
        t = call("GET", f"/{kind}/{tid}")
        if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"): return t
        time.sleep(15)

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
