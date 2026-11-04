"""Hand Kie a reference picture without needing a public link to it.

The repo is private, so raw.githubusercontent.com links no longer work. This uploads a local
file (or one from the `models` branch, fetched with git) to Kie's own file store and returns
the temporary URL it gives back (valid for a few days, which is plenty for one job).
Uploads are cached per file content in tools/.kie_upload_cache.json (not committed).
"""
import base64, hashlib, json, os, subprocess, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.kie_upload_cache.json')
API = 'https://kieai.redpandaai.co/api/file-base64-upload'


def _bytes(ref):
    """ref: a path in the working tree, 'repo:<path>', or 'models:<path>' on the models branch."""
    if ref.startswith('repo:'): ref = ref[5:]
    if ref.startswith('models:'):
        return subprocess.run(['git', '-C', ROOT, 'show', 'origin/models:' + ref[7:]], capture_output=True, check=True).stdout, os.path.basename(ref)
    p = ref if os.path.isabs(ref) else os.path.join(ROOT, ref)
    return open(p, 'rb').read(), os.path.basename(p)


def upload(ref, key):
    data, name = _bytes(ref)
    h = hashlib.sha1(data).hexdigest()
    try: cache = json.load(open(CACHE))
    except Exception: cache = {}
    if h in cache: return cache[h]
    mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
    body = {'base64Data': f'data:{mime};base64,' + base64.b64encode(data).decode(), 'uploadPath': 'dod-refs', 'fileName': h[:12] + '_' + name}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), method='POST', headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=120))
    url = (r.get('data') or {}).get('downloadUrl') or (r.get('data') or {}).get('fileUrl')
    if not url: raise RuntimeError('upload failed: ' + json.dumps(r)[:300])
    cache[h] = url; json.dump(cache, open(CACHE, 'w'), indent=1)
    return url
