"""Sort art made by tools/gen_art.py into the stems process_art.py expects, and process it.

Usage: python3 tools/ingest_art.py <folder of generated PNGs>

Generated names are short and prefixed by region (med_town_center, ea_mill, w_siege_workshop);
process_art.py wants the plain source stem (town_center, mill, siege_workshop) in a folder of
its own per region. This moves them across and runs it, so the sprites land as
assets/<region>_<key>.png with their anchors in the manifest, and the originals are kept
under assets/source/<region>/.

Only the files that exist are processed, so this can be run again after filling a gap.
"""
import os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# prefix in the generated name -> region (None = the shared western set, no prefix in the game)
REGIONS = {"w": None, "med": "mediterranean", "ea": "eastasian", "me": "middleeast", "am": "americas", "in": "indian"}

# generated stem -> the source stem process_art.py knows
STEMS = {
    "house": "house", "town_center": "town_center", "barracks": "barracks",
    "range": "archery_range", "stable": "stable", "mill": "mill",
    "lumbercamp": "lumber_camp", "miningcamp": "mining_camp", "farm": "farm",
    "farm_spent": "farm_spent", "tower": "watch_tower", "blacksmith": "blacksmith",
    "castle": "castle", "university": "university", "siege_workshop": "siege_workshop", "monastery": "monastery",
    "lumber_camp": "lumber_camp", "mining_camp": "mining_camp", "infirmary": "infirmary",
}


TIERS = ["dark", "feudal", "castle", "imp"]   # Age tiers; a plain name is the default look


def main(src):
    stage = os.path.join(src, "_stage")
    shutil.rmtree(stage, ignore_errors=True)
    for tier in [None] + TIERS:
        for pre, region in REGIONS.items():
            d = os.path.join(stage, (region or "western") + ("_" + tier if tier else ""))
            os.makedirs(d, exist_ok=True)
            n = 0
            for gen, stem in STEMS.items():
                f = os.path.join(src, f"{pre}_{gen}" + (f"_{tier}" if tier else "") + ".png")
                if os.path.exists(f):
                    shutil.copy(f, os.path.join(d, stem + ".png")); n += 1
            if not n:
                continue
            print(f"{region or 'western'}{'/' + tier if tier else ''}: {n} file(s)")
            cmd = [sys.executable, os.path.join(HERE, "process_art.py"), d, region or "-"] + ([tier] if tier else [])
            subprocess.run(cmd, cwd=REPO, check=True)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
