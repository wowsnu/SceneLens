"""
SceneLens Theory DB Builder (Automated PDF Extraction Pipeline)

Usage:
  1. Set GEMINI_API_KEY environment variable.
  2. Run: python extract_pdf_to_db.py /path/to/book.pdf

This script will chunk the PDF into 15-page segments, feed them to Gemini, and 
extract structured JSON records (Theory Units, Operations) to populate the SceneLens Engine 1 DB.
"""

import os
import sys
import json
import time

from dotenv import load_dotenv
# Load .env from SceneLens/v2 root
env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(env_path)

import google.generativeai as genai

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Please install PyMuPDF: pip install pymupdf")
    sys.exit(1)

# Configure Gemini
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY environment variable not set.")
    sys.exit(1)

genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.5-flash") # Using gemini-2.5-flash as authorized by the new API key

SYSTEM_PROMPT = """You are an expert cinematic theory extractor.
I will provide you with a chunk of a filmmaking textbook.
Your job is to read carefully and extract ANY explicit directing rules, shot composition advice, or camera movement strategies into the SceneLens JSON Schema.

If the text contains actionable directing knowledge, extract it exactly into this JSON format:
{
  "theory_units": [
    {
      "id": "t_book_pgXX_01",
      "book_id": "b_unknown",
      "title": "Short descriptive title of the theory",
      "summary": "1-2 sentence core mechanism",
      "soft_tags": ["tag1", "tag2"],
      "level": "shot" or "scene",
      "applies_when": "When should the director use this?",
      "expected_effect": "Psychological or visual effect on the audience",
      "caution": "Any warnings or common mistakes (can be empty)"
    }
  ],
  "operations": [
    {
      "id": "o_book_pgXX_01",
      "theory_unit_id": "t_book_pgXX_01",
      "suggested_change": {"Shot Size": "Medium Close", "Camera Angle": "Low", "...etc": "..."},
      "related_dimensions": ["Shot Size", "Camera Angle"],
      "explanation_template": "Explanation of how moving to this state achieves the expected effect."
    }
  ],
  "clusters": [
    {
      "id": "c_book_pgXX_01",
      "cluster_name": "Name of a specific sequence or strategy mentioned in text",
      "intention_tags": ["tag1", "tag2"]
    }
  ],
  "cluster_theory_mapping": [
    {
      "cluster_id": "c_book_pgXX_01",
      "theory_unit_id": "t_book_pgXX_01",
      "sequence_order": 1
    }
  ]
}

If no actionable rules exist in this text chunk, return an empty structure: {"theory_units": [], "operations": [], "clusters": [], "cluster_theory_mapping": []}.
Return ONLY valid JSON.
"""

def extract_from_pdf(pdf_path, chunk_size=15):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"Error opening {pdf_path}: {e}")
        sys.exit(1)

    total_pages = len(doc)
    print(f"Loaded '{os.path.basename(pdf_path)}' ({total_pages} pages)")

    master_db = {
        "books": [{"id": "b_auto_gen", "title": os.path.basename(pdf_path)}],
        "theory_units": [],
        "operations": []
    }

    # Iterate through PDF in chunks
    for i in range(0, total_pages, chunk_size):
        end_idx = min(i + chunk_size, total_pages)
        print(f"\\nProcessing pages {i+1} to {end_idx}...")
        
        chunk_text = ""
        for page_num in range(i, end_idx):
            page_text = doc.load_page(page_num).get_text()
            chunk_text += f"\\n--- Page {page_num+1} ---\\n" + page_text

        # Call Gemini API
        prompt = f"{SYSTEM_PROMPT}\\n\\n[TEXT CHUNK START]\\n{chunk_text}\\n[TEXT CHUNK END]"
        
        try:
            print("  -> Sending to Gemini API...")
            response = model.generate_content(prompt)
            json_str = response.text.replace('```json', '').replace('```', '').strip()
            
            # Parse and merge
            chunk_data = json.loads(json_str)
            print(f"  -> Extracted {len(chunk_data.get('theory_units', []))} units.")
            
            master_db['theory_units'].extend(chunk_data.get('theory_units', []))
            master_db['operations'].extend(chunk_data.get('operations', []))
            
            # Rate limiting sleep (3 seconds is enough for a good key)
            print("  -> Sleeping for 3 seconds...")
            time.sleep(3) 

        except Exception as e:
            print(f"  -> Failed to process chunk {i+1}-{end_idx}. Error: {e}")
            print(f"Raw output (if any): {response.text if 'response' in locals() else 'None'}")
            continue

    # Final Save
    out_file = f"extracted_{os.path.basename(pdf_path).split('.')[0]}.json"
    print(f"\\nFinished processing. Saving to {out_file}...")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(master_db, f, indent=2, ensure_ascii=False)
    
    print("Done!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf_to_db.py <path-to-pdf>")
        sys.exit(1)
    
    extract_from_pdf(sys.argv[1])
