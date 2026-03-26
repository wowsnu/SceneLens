"""
Generate test storyboard sketches for Beat 0-3 at 3 quality levels:
  - rough: extremely crude stick-figure doodle
  - medium: hand-drawn amateur sketch
  - standard: clean storyboard sketch

Usage:
  cd SceneLens/v2
  source .venv/bin/activate
  python backend/app/tools/generate_test_sketches.py
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "public" / "test_sketches"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BEATS = {
    0: {
        "description": "INT. RURAL GAS STATION - DAY. An old, dusty gas station. The PROPRIETOR (60s) stands behind the counter. ANTON CHIGURH (40s), a terrifyingly calm man, finishes a bag of cashews. Chigurh asks 'What's the most you ever lost on a coin toss?' The Proprietor looks uneasy and confused.",
        "cir": {
            "shotSize": "MS/MCU",
            "cameraAngle": "3/4 View",
            "cameraLevel": "Eye",
            "relation": "Two-shot/Group",
            "blockingDistance": "Far",
            "eyeline": "Face-to-face",
            "occlusion": "None",
            "motionHint": "Static",
        }
    },
    1: {
        "description": "INT. RURAL GAS STATION - DAY. Anton Chigurh pulls a quarter from his pocket, flips it, catches it, and slaps it firmly on the counter in front of the Proprietor. Chigurh stares at the Proprietor with dead, unblinking eyes. The coin sits between them on the counter. Chigurh says 'Call it.'",
        "cir": {
            "shotSize": "MS/MCU",
            "cameraAngle": "Frontal",
            "cameraLevel": "Eye",
            "relation": "Two-shot/Group",
            "blockingDistance": "Near",
            "eyeline": "Face-to-face",
            "occlusion": "None",
            "motionHint": "Subject Motion",
        }
    },
    2: {
        "description": "INT. RURAL GAS STATION - DAY. The Proprietor (60s) stands behind the counter, confused and anxious. He looks at the coin on the counter then up at Chigurh. He grips the counter edge nervously. Chigurh watches him with calm, dead-eyed intensity. Proprietor says 'For what?'",
        "cir": {
            "shotSize": "MS/MCU",
            "cameraAngle": "3/4 View",
            "cameraLevel": "Eye",
            "relation": "Two-shot/Group",
            "blockingDistance": "Near",
            "eyeline": "Averted",
            "occlusion": "None",
            "motionHint": "Static",
        }
    },
    3: {
        "description": "INT. RURAL GAS STATION - DAY. Chigurh leans in slightly over the counter toward the Proprietor. His eyes are dead and unblinking. The Proprietor is pressed slightly back against the shelves. Extreme power imbalance — Chigurh dominates the space. He asks 'You know what date is on this coin?'",
        "cir": {
            "shotSize": "CU/ECU",
            "cameraAngle": "3/4 View",
            "cameraLevel": "Low",
            "relation": "OTS",
            "blockingDistance": "Intimate",
            "eyeline": "Face-to-face",
            "occlusion": "Partial",
            "motionHint": "Static",
        }
    },
}

LEVELS = {
    "rough": """CRITICAL STYLE REQUIREMENT - THIS IS THE MOST IMPORTANT INSTRUCTION:
You MUST draw an EXTREMELY CRUDE, UGLY, HASTY stick-figure doodle. This must look like a 5-year-old drew it in 3 seconds.
- Heads are just circles or ovals. Bodies are single straight lines. Arms and legs are single lines.
- NO faces, NO expressions, NO clothing details, NO hair — just primitive shapes
- Lines MUST be wobbly, shaky, uneven — like drawn trembling or in a rush
- NO shading, NO depth, NO perspective whatsoever — completely flat
- Background: either totally empty white OR just a few rough scratchy lines to suggest walls
- The counter can be just a horizontal line
- If your output looks like a real storyboard or has ANY artistic quality, you have FAILED
- It must look like a napkin scrawl, a quick whiteboard doodle, or a child's drawing
- Think: the roughest possible thumbnail you'd make to just indicate where people stand
Black-and-white only, 16:9 landscape (1024x576 pixels). NO text, NO labels.""",

    "medium": """STYLE REQUIREMENT:
Draw this like a real film director or production designer quickly sketching in their notebook during prep.
- Recognizable human figures but clearly imperfect — wrong proportions are fine
- Visible pencil pressure changes, sketch lines, construction lines left in
- Some facial indication (just simple marks for eyes/mouth)
- Loose, gestural background elements — suggested rather than detailed
- A few quick hatching marks for shadow areas
- Feels spontaneous and personal, like a real sketchbook page
- NOT clean, NOT polished — deliberately rough and human-made looking
Black-and-white pencil sketch, 16:9 landscape (1024x576 pixels). NO text, NO labels.""",

    "standard": """STYLE REQUIREMENT:
Professional storyboard sketch in standard film production style.
- Clean, confident ink lines with clear character silhouettes and body language
- Readable facial expressions and poses
- Cross-hatching for shadows and depth
- Clear background indicating the gas station counter and shelves
- Looks like a professional storyboard artist's panel
- Standard cinematic storyboard quality
Black-and-white ink/pencil, 16:9 landscape (1024x576 pixels). NO text, NO labels.""",
}


def generate_image(prompt: str) -> bytes:
    response = client.models.generate_content(
        model='gemini-2.5-flash-image',
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return part.inline_data.data
    raise ValueError("No image returned")


def main():
    manifest = []

    for beat_num, beat_data in BEATS.items():
        for level_name, level_prompt in LEVELS.items():
            filename = f"beat{beat_num}_{level_name}.png"
            filepath = OUTPUT_DIR / filename

            if filepath.exists():
                print(f"[SKIP] {filename} already exists")
                manifest.append({
                    "beat": beat_num,
                    "level": level_name,
                    "file": f"/test_sketches/{filename}",
                    "cir": beat_data["cir"],
                    "description": beat_data["description"],
                })
                continue

            print(f"[GEN] Beat {beat_num} / {level_name}...")
            cir_desc = "\n".join(f"  - {k}: {v}" for k, v in beat_data["cir"].items())
            prompt = f"""{level_prompt}

[Scene Description]
{beat_data['description']}

[Composition (CIR)]
{cir_desc}

Draw the storyboard panel now.
"""
            try:
                img_bytes = generate_image(prompt)
                filepath.write_bytes(img_bytes)
                print(f"  -> Saved: {filename}")
                manifest.append({
                    "beat": beat_num,
                    "level": level_name,
                    "file": f"/test_sketches/{filename}",
                    "cir": beat_data["cir"],
                    "description": beat_data["description"],
                })
            except Exception as e:
                print(f"  -> ERROR: {e}")

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nDone! {len(manifest)} images saved.")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
