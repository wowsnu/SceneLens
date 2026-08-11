"""처음 열어 본 사용자가 되어 끝까지 걸어 본다.

각 서비스가 따로 도는 것과 사람이 순서대로 쓰는 것은 다르다. 앞 단계의
답이 뒤 단계의 입력이 되므로, 따로 볼 때는 멀쩡하던 값이 이어 붙이면
무너진다 — 예를 들어 미장센이 인물 이름을 "등대지기 노인"으로 답했는데
컷 플랜이 "노인"이라고만 쓰면, 레퍼런스 그림이 그 컷에 붙지 않는다.

그래서 여기서는 화면이 부르는 순서를 그대로 따라간다:

  이야기 한 줄 → 씬·Beat 나누기 → 대본 다듬기 → 인물·공간 읽기
  → 배치 제안 → 컷 나누기 → 샷 정하기 → 이음새 → 레퍼런스 → 패널

무엇을 보는가: 단계 사이에서 값이 끊기는가. 이름이 어긋나는가.
앞 단계가 준 것을 뒤 단계가 실제로 쓰는가.

쓰는 법:
    python backend/tools/test_walkthrough.py            # 그림 없이 (빠름)
    python backend/tools/test_walkthrough.py --images   # 패널까지 (느림)
"""

import argparse
import asyncio
import base64
import pathlib
import sys
import time

import httpx

BASE = "http://localhost:8000/api"
OUT = pathlib.Path(__file__).parent / "walkthrough"

# 사용자가 처음 입력하는 것. 대본이 아니라 한 줄짜리 생각이다.
STORY = (
    "폐업한 동네 서점에서 주인 할머니가 마지막 정리를 하는데, "
    "예전에 자주 오던 손님이 찾아와 두고 간 책을 돌려받으려 한다."
)

problems = []
notes = []


def fail(step, message):
    problems.append(f"{step}: {message}")
    print(f"    !! {message}")


def note(step, message):
    notes.append(f"{step}: {message}")
    print(f"    · {message}")


async def post(client, path, body, timeout=300):
    response = await client.post(f"{BASE}/{path}", json=body, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"{path} → {response.status_code}: {response.text[:200]}")
    return response.json()


async def main(with_images: bool):
    OUT.mkdir(exist_ok=True)
    started = time.time()

    async with httpx.AsyncClient() as client:
        # 1 ─ 이야기를 씬과 Beat로 나눈다 ────────────────────────────────
        print("\n[1] 씬·Beat로 나누기")
        story = await post(client, "story/structure", {"story": STORY})
        scenes = story.get("scenes", [])
        if not scenes:
            fail("1/구조", "씬이 하나도 없다")
            return _report(started)

        print(f"    씬 {len(scenes)}개")
        scene = scenes[0]
        heading = scene["heading"]
        # 화면은 Beat에 번호를 매겨 쓴다. 응답은 순서대로 오므로 여기서 붙인다.
        beats = [
            {
                "beat": index,
                "lines": [line["text"] for line in beat["lines"]],
                "filled": [line.get("filled", False) for line in beat["lines"]],
            }
            for index, beat in enumerate(scene.get("beats", []))
        ]
        print(f"    씬: {heading}  · Beat {len(beats)}개")
        for beat in beats:
            for line, filled in zip(beat["lines"], beat["filled"]):
                print(f"      B{beat['beat']} {'[AI]' if filled else '    '} {line}")

        if len(beats) < 2:
            fail("1/구조", f"Beat가 {len(beats)}개뿐 — 컷으로 나눌 것이 없다")
        empty = [b["beat"] for b in beats if not b["lines"]]
        if empty:
            fail("1/구조", f"줄이 없는 Beat {empty}")
        for beat in beats:
            for line in beat["lines"]:
                if any(mark in line for mark in ('"', "“", "”")):
                    fail("1/구조", f"대사가 들어갔다 · {line[:40]}")

        script = "\n".join(line for beat in beats for line in beat["lines"])

        # 2 ─ 미장센: 대본에서 인물·공간 읽기 ───────────────────────────
        print("\n[2] 대본에서 인물·공간 읽기")
        state = await post(client, "scene-state", {"heading": heading, "script": script})
        cast = [c["name"] for c in state["characters"]]
        print(f"    인물: {cast}")
        for character in state["characters"]:
            settled = [f"{f['label']}={f['value']}" for f in character["facts"] if f["value"]]
            print(f"      {character['name']} · {character['summary']} · {', '.join(settled) or '(전부 미정)'}")
        location_facts = ", ".join(
            f["value"] for f in state["location"]["facts"] if f["value"] and not f["open"]
        )
        print(f"    공간: {state['location']['name']} · {location_facts}")

        if not cast:
            fail("2/미장센", "인물을 하나도 못 읽었다")
        # 컷 플랜은 이 목록을 받아 쓴다. 여기서 빠진 인물은 레퍼런스도
        # 없고, 그 인물이 나오는 컷은 매번 다른 얼굴로 그려진다.
        for word in ("할머니", "손님", "노인", "소년", "아이"):
            if word in script and not any(word in name for name in cast):
                fail("2/미장센", f"대본에 '{word}'가 있는데 인물로 안 읽혔다")
        # 대본에 나온 인물이 빠지면 그 인물은 레퍼런스도 없이 그려진다.
        for character in cast:
            if character not in script:
                note("2/미장센", f"'{character}'가 대본 문장에 그대로는 없다 (줄임말일 수 있음)")

        # 3 ─ 미장센: 공간 배치 제안 ────────────────────────────────────
        print("\n[3] 공간 배치 제안받기")
        layout = await post(client, "space-layout", {
            "heading": heading, "script": script, "location_facts": location_facts,
        })
        for element in layout["elements"]:
            print(f"      [사물] {element['label']:12} x={element['x']:4} y={element['y']:4}")
        for person in layout.get("people", []):
            overlap = [
                e["label"] for e in layout["elements"]
                if e["x"] <= person["x"] <= e["x"] + e["w"]
                and e["y"] <= person["y"] <= e["y"] + e["h"]
            ]
            print(f"      [인물] {person['name']:12} x={person['x']:4} y={person['y']:4}"
                  f"{'  겹침: ' + str(overlap) if overlap else ''}")
            if overlap:
                fail("3/구조도", f"{person['name']}이 {overlap} 위에 겹침")

        if not layout["elements"]:
            fail("3/구조도", "사물을 하나도 못 놓았다")
        # 같은 이름이 둘이면 도면에서 어느 쪽을 말하는지 알 수 없다.
        labels = [e["label"] for e in layout["elements"]]
        dupes = {label for label in labels if labels.count(label) > 1}
        if dupes:
            fail("3/구조도", f"이름이 겹치는 사물 {sorted(dupes)}")
        # 거의 같은 자리에 두 사물이 있으면 하나를 두 번 놓은 것이다.
        for i, a in enumerate(layout["elements"]):
            for b in layout["elements"][i + 1:]:
                if abs(a["x"] - b["x"]) < 60 and abs(a["y"] - b["y"]) < 60:
                    fail("3/구조도", f"'{a['label']}'와 '{b['label']}'가 같은 자리")
        # 구조도의 인물 이름이 미장센과 다르면 도면과 레퍼런스가 어긋난다.
        for person in layout.get("people", []):
            if not any(person["name"] in c or c in person["name"] for c in cast):
                fail("3/구조도", f"미장센에 없는 인물 '{person['name']}'")

        # 4 ─ 줄콘티: Beat를 컷으로 ─────────────────────────────────────
        print("\n[4] 컷으로 나누기")
        plan = await post(client, "cut-plan", {
            "heading": heading,
            "beats": [{"beat": b["beat"], "lines": b["lines"]} for b in beats],
            "cast": cast,
        })
        cuts = plan["cuts"]
        for cut in cuts:
            print(f"      B{cut['beat']} · {cut['purpose']:8} · {cut['characters'] or '—':14} · {cut['content'][:42]}")

        if len(cuts) < len(beats):
            fail("4/컷", f"컷 {len(cuts)}개 < Beat {len(beats)}개")
        covered = {cut["beat"] for cut in cuts}
        missing = [b["beat"] for b in beats if b["beat"] not in covered]
        if missing:
            fail("4/컷", f"컷이 없는 Beat {missing}")
        # 컷의 인물 이름이 미장센과 어긋나면 레퍼런스가 그 컷에 안 붙는다.
        for cut in cuts:
            for name in [n.strip() for n in (cut["characters"] or "").split(",") if n.strip()]:
                if not any(name in c or c in name for c in cast):
                    fail("4/컷", f"미장센에 없는 인물 '{name}' · {cut['content'][:30]}")

        # 5 ─ 촬영: 샷 정하기 ──────────────────────────────────────────
        print("\n[5] 샷 정하기")
        design = await post(client, "shot-design", {
            "heading": heading, "script": script,
            "cuts": [{"beat": c["beat"], "content": c["content"],
                      "purpose": c["purpose"], "characters": c["characters"]} for c in cuts],
        })
        shots = {s["cut_index"]: s for s in design["shots"]}
        for index, cut in enumerate(cuts):
            shot = shots.get(index)
            if not shot:
                fail("5/촬영", f"컷 {index}에 샷이 없다")
                continue
            print(f"      [{index}] {shot['shot_size']:10} {shot['angle']:18} {shot.get('dominant', '')}")

        coverage = design.get("coverage") or {}
        if coverage:
            print(f"    흐름: {coverage.get('arc', '')[:70]}")
        sizes = [s["shot_size"] for s in design["shots"]]
        if len(set(sizes)) == 1 and len(sizes) > 2:
            fail("5/촬영", f"모든 컷이 {sizes[0]}")

        # 6 ─ 편집: 이음새 ─────────────────────────────────────────────
        print("\n[6] 이음새 제안받기")
        seams = await post(client, "seam-design", {
            "heading": heading, "script": script,
            "cuts": [{"beat": c["beat"], "content": c["content"], "purpose": c["purpose"]}
                     for c in cuts],
        })
        if seams["seams"]:
            for seam in seams["seams"]:
                print(f"      컷 {seam['after_cut']} 뒤 · {seam['join']} · {seam['elapsed']}"
                      f"{' · 생략: ' + seam['elision'] if seam['elision'] else ''}")
                if not 0 <= seam["after_cut"] < len(cuts) - 1:
                    fail("6/이음새", f"범위 밖 컷 {seam['after_cut']}")
        else:
            note("6/이음새", "전부 기본값 (컷·연속) — 표시할 것이 없다")

        if not with_images:
            return _report(started)

        # 7 ─ 레퍼런스 그림 ────────────────────────────────────────────
        print("\n[7] 레퍼런스 그리기")
        references = {}
        for character in state["characters"]:
            settled = [f["value"] for f in character["facts"] if f["value"] and not f["open"]]
            prompt = ". ".join(
                [character["name"]]
                + ([character["summary"]] if character["summary"] != character["name"] else [])
                + settled
            )
            data = await post(client, "reference-image", {"kind": "character", "prompt": prompt})
            references[character["name"]] = data["image"]
            (OUT / f"ref-{character['name']}.png").write_bytes(base64.b64decode(data["image"]))
            print(f"      {character['name']} ✓  ({prompt[:56]})")

        # 8 ─ 패널 ────────────────────────────────────────────────────
        print("\n[8] 패널 그리기")
        layout_line = _layout_sentence(layout)
        previous = ""
        for index, cut in enumerate(cuts[:4]):
            shot = shots.get(index, {})
            names = [n.strip() for n in (cut["characters"] or "").split(",") if n.strip()]
            attached = [
                {"name": name, "kind": "character", "image": references[key]}
                for name in names
                for key in references
                if name in key or key in name
            ][:2]
            prompt = (
                f"{state['location']['name']}. {shot.get('shot_size', '')} 샷. "
                f"{cut['content']}"
                + (f" {shot['dominant']}에 시선이 먼저 가도록 잡는다." if shot.get("dominant") else "")
            )
            body = {
                "prompt": prompt,
                "shared": _shared_line(state, names),
                "previous": previous,
                "layout": layout_line,
                "references": attached,
            }
            data = await post(client, "panel-image", body)
            (OUT / f"cut{index + 1}.png").write_bytes(base64.b64decode(data["image"]))
            print(f"      컷 {index + 1} ✓  레퍼런스 {len(attached)}장  · {prompt[:48]}")
            if names and not attached:
                fail("8/패널", f"컷 {index + 1}의 인물 {names}에 레퍼런스가 안 붙었다")
            previous = prompt

    return _report(started)


def _layout_sentence(layout):
    parts = [f"{e['label']}({e['x']},{e['y']})" for e in layout["elements"]]
    return ", ".join(parts)


def _shared_line(state, names):
    people = []
    for character in state["characters"]:
        if not any(n in character["name"] or character["name"] in n for n in names):
            continue
        settled = [f["value"] for f in character["facts"] if f["value"] and not f["open"]]
        if settled:
            people.append(f"{character['name']}: {', '.join(settled)}")
    location = ", ".join(
        f["value"] for f in state["location"]["facts"] if f["value"] and not f["open"]
    )
    environment = ", ".join(
        f["value"] for f in state["environment"]["facts"] if f["value"] and not f["open"]
    )
    return " · ".join(filter(None, [
        f"공간 기준: {location}" if location else "",
        " / ".join(people),
        f"환경: {environment}" if environment else "",
    ]))


def _report(started):
    print(f"\n{'=' * 62}")
    print(f"{time.time() - started:.0f}초")
    if notes:
        print(f"\n짚어둘 것 {len(notes)}건")
        for item in notes:
            print(f"  · {item}")
    if problems:
        print(f"\n문제 {len(problems)}건")
        for item in problems:
            print(f"  · {item}")
    else:
        print("\n문제 없음")
    return len(problems)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", action="store_true", help="레퍼런스와 패널까지 그린다")
    args = parser.parse_args()
    try:
        sys.exit(1 if asyncio.run(main(args.images)) else 0)
    except Exception as error:
        print(f"\n중단: {error}", file=sys.stderr)
        sys.exit(2)
