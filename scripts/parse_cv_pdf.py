# scripts/parse_cv_pdf.py
import fitz  # PyMuPDF
import docx
from typing import Optional, Tuple

def extract_text_from_pdf(file_path: str) -> Tuple[str, bool]:
    """Extract raw text from a PDF CV and detect images."""
    text = ""
    has_picture = False
    try:
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text()
                if not has_picture:
                    images = page.get_images(full=True)
                    if images:
                        has_picture = True
    except Exception as e:
        print(f"❌ Error reading PDF: {e}")
    return text.strip(), has_picture

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from a DOCX file."""
    text = ""
    try:
        doc = docx.Document(file_path)
        # Join paragraphs with newlines
        text = "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"❌ Error reading DOCX: {e}")
    return text.strip()

def summarize_cv_text(cv_text: str) -> Optional[str]:
    """Cleans CV text and removes database-breaking characters."""
    if not cv_text:
        return None
    
    # ✅ CRITICAL FIX: Remove Null bytes that crash Postgres
    cv_text = cv_text.replace('\x00', '')
    
    lines = [line.strip() for line in cv_text.splitlines()]
    cleaned = "\n".join([line for line in lines if line])
    
    return cleaned