import os
import glob
import subprocess

theory_dir = "/Users/sangwoo/Desktop/HCI/이론/"
script_path = "extract_pdf_to_db.py"

pdf_files = glob.glob(os.path.join(theory_dir, "*.pdf"))
print(f"Found {len(pdf_files)} PDF files to process.\\n")

for pdf in pdf_files:
    print(f"========== Starting extraction for: {os.path.basename(pdf)} ==========")
    # Using subprocess to run the extraction script for each file
    try:
        subprocess.run(
            ["/Users/sangwoo/Desktop/HCI/SceneLens/.venv/bin/python", script_path, pdf],
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"Error processing {pdf}. Moving to next file.")
    print(f"========== Finished: {os.path.basename(pdf)} ==========\\n")

print("ALL PDF EXTRACTIONS COMPLETED!")
