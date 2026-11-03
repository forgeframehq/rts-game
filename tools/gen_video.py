"""Make the game's cinematic clips with Kie (image + prompt -> video with sound).

Models: "kling-2.6/image-to-video" (default: 1080p, with sound, 5 or 10 s) or "veo3". In late 2026
Veo's image-to-video failed on Kie for every image, while Kling 2.6 worked; Kling is the default.

    KIE_KEY=... python3 tools/gen_video.py tools/video_jobs.json <out_dir> [only,stems]

A jobs file is {"model": "...", "jobs": [[stem, image_url, prompt, seconds?], ...]}. image_url must be
public (the stills live on the `models` branch, served raw by GitHub). Existing <stem>.mp4 files
are skipped, so a run can be repeated to fill in failures. Task ids are kept in <out>/tasks.json
so a run that is stopped can pick up the same tasks without paying twice.
"""
import json, os, sys, time, urllib.request

KEY = os.environ["KIE_KEY"]
API = "https://api.kie.ai/api/v1/veo"


def call(path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def market(path, body=None):
    req = urllib.request.Request("https://api.kie.ai/api/v1/jobs" + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main(jobs_file, out, only=None):
    J = json.load(open(jobs_file)); os.makedirs(out, exist_ok=True)
    tp = os.path.join(out, 'tasks.json'); tasks = json.load(open(tp)) if os.path.exists(tp) else {}
    todo = [j for j in J['jobs'] if (not only or j[0] in only) and not os.path.exists(os.path.join(out, j[0] + '.mp4'))]
    model = J.get('model', 'kling-2.6/image-to-video'); kling = not model.startswith('veo')
    for job in todo:
        stem, img, prompt = job[:3]; secs = str(job[3]) if len(job) > 3 else '5'
        if stem in tasks: continue
        r = market('/createTask', {"model": model, "input": {"prompt": prompt, "image_urls": [img], "sound": J.get("sound", True), "duration": secs}}) if kling \
            else call('/generate', {"prompt": prompt, "imageUrls": [img], "model": model, "aspectRatio": "16:9"})
        if r.get('code') != 200: print('QUEUE FAIL', stem, r, flush=True); continue
        tasks[stem] = r['data']['taskId']; json.dump(tasks, open(tp, 'w')); print('queued', stem, flush=True)
    left = {j[0]: tasks[j[0]] for j in todo if j[0] in tasks}
    t0 = time.time()
    while left and time.time() - t0 < 1800:
        time.sleep(20)
        for stem, tid in list(left.items()):
            if kling:
                d = (market('/recordInfo?taskId=' + tid) or {}).get('data') or {}
                st = {'success': 1, 'fail': 2, 'failed': 2}.get(d.get('state'), 0)
                if st == 1: d = {'resultUrls': json.loads(d['resultJson'])['resultUrls']}
                elif st: d['errorMessage'] = d.get('failMsg')
            else:
                d = (call('/record-info?taskId=' + tid) or {}).get('data') or {}
                st = d.get('successFlag', d.get('status'))
            if st == 1:
                info = d.get('response') or d.get('info') or d
                urls = info.get('resultUrls') or d.get('resultUrls')
                if isinstance(urls, str): urls = json.loads(urls)
                urllib.request.urlretrieve(urls[0], os.path.join(out, stem + '.mp4'))
                print('done', stem, flush=True); del left[stem]
            elif st in (2, 3):
                print('FAILED', stem, d.get('errorMessage') or d.get('msg'), flush=True); del left[stem]; tasks.pop(stem, None); json.dump(tasks, open(tp, 'w'))
    if left: print('still running:', ', '.join(left))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None)
