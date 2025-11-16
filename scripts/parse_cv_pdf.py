# scripts/parse_cv_pdf.py

import fitz  # PyMuPDF
from typing import Optional


def extract_text_from_pdf(file_path: str) -> str:
    """Extract raw text from a PDF CV."""
    text = ""
    try:
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text()
    except Exception as e:
        print(f"❌ Error reading PDF: {e}")
    return text.strip()


def summarize_cv_text(cv_text: str) -> Optional[str]:
    """
    Use rules or AI later to summarize the CV.
    For now, return the first 1500 characters of cleaned text.
    """
    cleaned = " ".join(cv_text.split())  # Remove newlines, tabs
    if not cleaned:
        return None
    return cleaned[:1500]  # Limiting to keep input light for embedding


if __name__ == "__main__":
    path = "./sample_cv.pdf"  # replace with your test CV
    full_text = extract_text_from_pdf(path)
    summary = summarize_cv_text(full_text)

    print("\n--- Raw CV Extract ---\n")
    print(full_text[:1000])

    print("\n--- Cleaned Summary ---\n")
    print(summary)
