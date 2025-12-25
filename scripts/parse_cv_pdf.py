# scripts/parse_cv_pdf.py

import fitz  # PyMuPDF
from typing import Optional, Tuple


def extract_text_from_pdf(file_path: str) -> Tuple[str, bool]:
    """
    Extract raw text from a PDF CV and detect if it contains images.
    Returns: (text, has_picture_bool)

    Notes:
    - page.get_text() ignores images automatically.
    - page.get_images(full=True) detects embedded images.
    """
    text = ""
    has_picture = False

    try:
        with fitz.open(file_path) as doc:
            for page in doc:
                # Extract text (images ignored)
                text += page.get_text()

                # Detect images
                if not has_picture:
                    images = page.get_images(full=True)
                    if images:
                        has_picture = True

    except Exception as e:
        print(f"❌ Error reading PDF: {e}")

    return text.strip(), has_picture


def summarize_cv_text(cv_text: str) -> Optional[str]:
    """
    Cleans the CV text but preserves structure (newlines).
    Returns the FULL text to ensure no skills or experiences are lost.
    """
    if not cv_text:
        return None

    lines = [line.strip() for line in cv_text.splitlines()]
    cleaned = "\n".join([line for line in lines if line])

    return cleaned


if __name__ == "__main__":
    path = "./sample_cv.pdf"  # replace with your test CV
    full_text, has_pic = extract_text_from_pdf(path)
    summary = summarize_cv_text(full_text)

    print("\n--- Raw CV Extract ---\n")
    print(full_text[:1000])

    print("\n--- Has picture? ---\n")
    print(has_pic)

    print("\n--- Cleaned Summary ---\n")
    print(summary)
