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
    Cleans the CV text but preserves structure (newlines).
    Returns the FULL text to ensure no skills or experiences are lost.
    """
    if not cv_text:
        return None
    
    # Behåll radbrytningar men ta bort onödiga mellanslag
    # Detta gör att punktlistor förblir läsbara för AI:n
    lines = [line.strip() for line in cv_text.splitlines()]
    cleaned = "\n".join([line for line in lines if line])
    
    return cleaned


if __name__ == "__main__":
    path = "./sample_cv.pdf"  # replace with your test CV
    full_text = extract_text_from_pdf(path)
    summary = summarize_cv_text(full_text)

    print("\n--- Raw CV Extract ---\n")
    print(full_text[:1000])

    print("\n--- Cleaned Summary ---\n")
    print(summary)
