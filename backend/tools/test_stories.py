"""여러 이야기로 전체 파이프라인을 시험한다.

예제 대본(관제실) 하나로만 확인하면 그 이야기에 맞춰진 것을 못 본다.
배경·인물 수·분위기가 다른 이야기를 여럿 태워, 어디서 무너지는지 찾는다.

무엇을 보는가:
  - 프롬프트 예시의 이름·장소가 답에 새어 나오는가
  - 값이 규칙(길이·항목·좌표)을 지키는가
  - 대본에 없는 것을 지어내는가

쓰는 법:
    python backend/tools/test_stories.py            # 전부
    python backend/tools/test_stories.py --story 등대
"""

import argparse
import asyncio
import re
import sys

import httpx

BASE = "http://localhost:8000/api"

# 프롬프트 예시에 쓰인 낱말. 답에 나오면 지시문이 새어 나온 것이다.
LEAK_WORDS = ["재인", "민호", "관제실", "승강장", "출입카드", "리모컨", "콘솔"]

# 기준은 생김새여야 한다. 행동을 적으면 컷이 담을 것을 씬 기준이 가로챈다.
ACTION_WORDS = ["한다", "하며", "하는", "든 모습", "바라보", "확인", "전달",
                "앉아 ", "서서", "숙임", "기울임", "고정", "관찰", "움직"]

STORIES = [
    {
        "name": "등대",
        "heading": "바닷가 등대, 새벽",
        "cast": ["등대지기 노인", "소년"],
        "lines": [
            "낡은 등대 꼭대기 방. 둥근 유리창 너머로 회색 바다가 보인다.",
            "한쪽 벽에 나선 계단이 아래로 이어지고, 그 옆에 낡은 무전기가 놓인 탁자가 있다.",
            "등대지기 노인이 창가에 서서 바다를 본다.",
            "소년이 계단을 올라와 숨을 고른다. 손에는 젖은 편지 한 장이 들려 있다.",
            "노인이 천천히 돌아본다.",
        ],
    },
    {
        "name": "빨래방",
        "heading": "24시 빨래방, 새벽 3시",
        "cast": ["수아"],
        "lines": [
            "형광등이 환한 빨래방. 세탁기 여덟 대가 벽을 따라 늘어서 있다.",
            "창가에 낡은 플라스틱 의자 몇 개와 잡지가 쌓인 탁자가 있다.",
            "수아가 혼자 앉아 돌아가는 세탁기를 본다. 무릎 위에 빈 세탁 바구니가 있다.",
            "출입문이 열리고 찬 바람이 들어온다.",
            "수아가 고개를 들지 않는다.",
        ],
    },
    {
        "name": "수술실",
        "heading": "대학병원 수술실, 낮",
        "cast": ["집도의", "간호사", "마취과 의사"],
        "lines": [
            "무영등이 수술대를 비춘다. 벽면에 모니터 두 대가 붙어 있고, 옆에 기구대가 놓여 있다.",
            "집도의가 수술대 앞에 선다. 마스크 위로 눈만 보인다.",
            "간호사가 기구대에서 메스를 집어 건넨다.",
            "마취과 의사가 환자 머리맡에서 계기판을 확인한다.",
            "모니터의 선이 한 번 크게 튄다.",
        ],
    },
    {
        "name": "옥탑",
        "heading": "옥탑방 옥상, 여름 저녁",
        "cast": ["형", "동생"],
        "lines": [
            "낡은 옥상. 한쪽에 물탱크가 있고 빨랫줄이 가로질러 걸려 있다.",
            "평상 위에 수박이 반쯤 잘린 채 놓여 있다.",
            "형이 평상에 걸터앉아 담배를 문다.",
            "동생이 계단 입구에 서서 형을 본다. 손에 봉투를 들고 있다.",
            "형이 담배를 비벼 끈다.",
        ],
    },
]


async def post(client, path, body):
    response = await client.post(f"{BASE}/{path}", json=body, timeout=120)
    if response.status_code != 200:
        raise RuntimeError(f"{path} → {response.status_code}: {response.text[:160]}")
    return response.json()


def leaks(text: str) -> list:
    return [word for word in LEAK_WORDS if word in str(text)]


async def run_story(client, story, problems):
    """한 이야기를 미장센 → 구조도 → 컷 플랜까지 태운다."""
    print(f"\n{'=' * 62}\n{story['name']} · {story['heading']}\n{'=' * 62}")
    script = "\n".join(story["lines"])
    tag = story["name"]

    # --- 미장센 ---------------------------------------------------------
    state = await post(client, "scene-state", {"heading": story["heading"], "script": script})
    names = [c["name"] for c in state["characters"]]
    print(f"[미장센] 인물: {names}")

    extra = [n for n in names if not any(c in n or n in c for c in story["cast"])]
    if extra:
        problems.append(f"{tag}/미장센: 대본에 없는 인물 {extra}")
    for character in state["characters"]:
        if len(character["summary"]) > 22:
            problems.append(f"{tag}/미장센: summary {len(character['summary'])}자 · {character['summary']}")
        # summary에 나이가 들어가면 "성별·나이" 항목과 중복된다.
        # '세탁기'의 '세'처럼 낱말 안에 든 글자에 걸리지 않게 숫자를 함께 본다.
        if re.search(r"\d+대|\d+\s*세\b", character["summary"]):
            problems.append(f"{tag}/미장센: summary에 나이 중복 · {character['summary']}")
        # summary는 역할이다. 행동이 들어가면 컷이 담을 것을 가로챈다.
        summary_action = [w for w in ACTION_WORDS if w in character["summary"]]
        if summary_action:
            problems.append(
                f"{tag}/미장센: summary에 행동 {summary_action} · {character['summary']}")
        for fact in character["facts"]:
            if len(fact["value"]) > 26:
                problems.append(f"{tag}/미장센: {fact['label']} {len(fact['value'])}자")
            if fact["value"] and leaks(fact["value"]):
                problems.append(f"{tag}/미장센: 예시 누출 {fact['value']}")
            # 기준은 생김새다. 행동·위치가 들어가면 컷이 담을 것을 가로챈다.
            if fact["label"] in ("기본 태도", "외형 기준") and fact["value"]:
                hits = [w for w in ACTION_WORDS if w in fact["value"]]
                if hits:
                    problems.append(
                        f"{tag}/미장센: {fact['label']}에 행동 {hits} · {fact['value']}")
        print(f"   {character['name']:12} {character['summary']}")
        for fact in character["facts"]:
            print(f"      {fact['label']:8} {fact['value'] or '(미정)'}")

    location_facts = ", ".join(
        f["value"] for f in state["location"]["facts"] if f["value"] and not f["open"]
    )
    print(f"   [{state['location']['name']}] {location_facts}")
    if leaks(state["location"]["name"] + location_facts):
        problems.append(f"{tag}/미장센: 공간에 예시 누출")

    # --- 구조도 ---------------------------------------------------------
    layout = await post(client, "space-layout", {
        "heading": story["heading"], "script": script, "location_facts": location_facts,
    })
    print("[구조도]")
    for element in layout["elements"]:
        print(f"   [사물] {element['label']:12} x={element['x']:4} y={element['y']:4} "
              f"w={element['w']:4} h={element['h']:4}")
        if len(element["label"]) > 9:
            problems.append(f"{tag}/구조도: label {len(element['label'])}자 · {element['label']}")
        if leaks(element["label"]):
            problems.append(f"{tag}/구조도: 예시 누출 {element['label']}")

    for person in layout.get("people", []):
        overlap = [
            e["label"] for e in layout["elements"]
            if e["x"] <= person["x"] <= e["x"] + e["w"]
            and e["y"] <= person["y"] <= e["y"] + e["h"]
        ]
        print(f"   [인물] {person['name']:12} x={person['x']:4} y={person['y']:4}"
              f"{'  겹침: ' + str(overlap) if overlap else ''}")
        if overlap:
            problems.append(f"{tag}/구조도: {person['name']}이 {overlap} 위에 겹침")
        if not any(c in person["name"] or person["name"] in c for c in story["cast"]):
            problems.append(f"{tag}/구조도: 대본에 없는 인물 {person['name']}")

    # --- 컷 플랜 --------------------------------------------------------
    beats = [
        {"beat": 0, "lines": story["lines"][:2]},
        {"beat": 1, "lines": story["lines"][2:]},
    ]
    plan = await post(client, "cut-plan", {
        "heading": story["heading"], "beats": beats, "cast": story["cast"],
    })
    print("[컷 플랜]")
    for cut in plan["cuts"]:
        print(f"   B{cut['beat']} · {cut['purpose']:8} · {cut['characters'] or '—':16} · {cut['content'][:44]}")
        if len(cut["purpose"]) > 8:
            problems.append(f"{tag}/컷: purpose가 김 · {cut['purpose']}")
        if leaks(cut["content"] + cut["characters"]):
            problems.append(f"{tag}/컷: 예시 누출 · {cut['content'][:40]}")

    # --- 촬영 -----------------------------------------------------------
    shots = await post(client, "shot-design", {
        "heading": story["heading"], "script": script,
        "cuts": [
            {"beat": c["beat"], "content": c["content"],
             "purpose": c["purpose"], "characters": c["characters"]}
            for c in plan["cuts"]
        ],
    })
    print("[촬영]")
    sizes = []
    for shot in shots["shots"]:
        sizes.append(shot["shot_size"])
        print(f"   [{shot['cut_index']}] {shot['shot_size']:10} {shot['angle']:18} "
              f"dominant: {shot.get('dominant', '')}")
        if leaks(shot.get("dominant", "") + shot.get("reason", "")):
            problems.append(f"{tag}/촬영: 예시 누출 · {shot.get('dominant')}")
    if len(set(sizes)) == 1 and len(sizes) > 2:
        problems.append(f"{tag}/촬영: 모든 컷이 {sizes[0]}")


async def main(only: str):
    problems = []
    async with httpx.AsyncClient() as client:
        for story in STORIES:
            if only and only not in story["name"]:
                continue
            try:
                await run_story(client, story, problems)
            except Exception as error:
                problems.append(f"{story['name']}: 실패 · {error}")
                print(f"   실패: {error}")

    print(f"\n{'=' * 62}")
    if problems:
        print(f"문제 {len(problems)}건")
        for problem in problems:
            print(f"  · {problem}")
    else:
        print("문제 없음")
    return len(problems)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--story", default="", help="이 이야기만 시험")
    args = parser.parse_args()
    sys.exit(1 if asyncio.run(main(args.story)) else 0)
