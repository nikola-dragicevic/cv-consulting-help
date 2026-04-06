import json
import re
from typing import Optional
from urllib.parse import unquote

import requests

EMAIL_REGEX = re.compile(r"(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?![\w.-])", re.IGNORECASE)
DIRECT_APPLY_EMAIL_REGEX = re.compile(
    r"(?:ans[öo]k(?:an)?\s*(?:via|med)?\s*(?:e-?post|mail)|skicka\s+(?:din\s+)?ans[öo]kan(?:\s+till)?)"
    r"[\s:>\-]{0,20}"
    r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})",
    re.IGNORECASE,
)

PREFERRED_CONTEXT_KEYWORDS = [
    "ansokan",
    "ansökan",
    "apply",
    "application",
    "kontakt",
    "contact",
    "rekryter",
    "recruit",
    "hiring",
    "talent",
    "hr",
    "jobb",
    "tjanst",
    "tjänst",
    "referens",
]

PREFERRED_SOURCE_PATH_KEYWORDS = [
    "description",
    "headline",
    "application",
    "apply",
    "email",
    "mail",
    "contact",
    "ansok",
    "ansökan",
    "kontakt",
    "recruit",
    "rekry",
    "hr",
    "employer",
]

DEPRIORITIZED_EMAIL_KEYWORDS = [
    "privacy",
    "gdpr",
    "cookie",
    "cookies",
    "support",
    "kundservice",
    "customer service",
    "helpdesk",
    "noreply",
    "do-not-reply",
    "donotreply",
]

ATS_HOST_HINTS = [
    "teamtailor",
    "greenhouse",
    "lever",
    "workday",
    "smartrecruiters",
    "recruitee",
    "varbi",
    "reachmee",
    "jobylon",
    "workbuster",
    "talentech",
]

DEPRIORITIZED_HOST_HINTS = [
    "arbetsformedlingen.se",
    "jobsearch.api.jobtechdev.se",
]


def normalize_email(raw: str) -> Optional[str]:
    email = unquote((raw or "")).strip().strip(".,;:()[]<>\"'")
    email = email.replace("mailto:", "").strip()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return None
    return email.lower()


def looks_like_disposable_or_system_email(email: str) -> bool:
    lower = email.lower()
    return lower.startswith(("noreply@", "no-reply@", "donotreply@", "do-not-reply@", "privacy@"))


def classify_application_channel(webpage_url: Optional[str], contact_email: Optional[str]) -> tuple[str, str]:
    if contact_email:
        return "direct_email", "email_found"

    url = (webpage_url or "").lower()
    if any(hint in url for hint in ATS_HOST_HINTS):
        return "external_apply", "ats_detected"
    if url:
        return "external_apply", "external_url_without_email"
    return "unknown", "no_url_and_no_email"


def collect_urls(value, path: str = "source_snapshot") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    if isinstance(value, str):
        candidate = value.strip()
        if candidate.startswith(("http://", "https://", "mailto:")):
            found.append((candidate, path))
        return found

    if isinstance(value, dict):
        for key, nested in value.items():
            found.extend(collect_urls(nested, f"{path}.{key}"))
        return found

    if isinstance(value, list):
        for index, nested in enumerate(value):
            found.extend(collect_urls(nested, f"{path}[{index}]"))
        return found

    return found


def collect_texts(value, path: str = "source_snapshot") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    if isinstance(value, str):
        text = value.strip()
        if text:
            found.append((text, path))
        return found

    if isinstance(value, (int, float)):
        found.append((str(value), path))
        return found

    if isinstance(value, dict):
        for key, nested in value.items():
            found.extend(collect_texts(nested, f"{path}.{key}"))
        return found

    if isinstance(value, list):
        for index, nested in enumerate(value):
            found.extend(collect_texts(nested, f"{path}[{index}]"))
        return found

    return found


def score_application_url(url: str, source_path: str) -> int:
    lowered = url.lower()
    score = 0

    if lowered.startswith("mailto:"):
        score += 20
    if any(hint in lowered for hint in ATS_HOST_HINTS):
        score += 10
    if any(keyword in lowered for keyword in ("apply", "application", "careers", "jobs", "ansok", "ansökan")):
        score += 6
    if source_path.endswith((".webpage_url", ".application_url", ".external_url")):
        score += 4
    if any(host in lowered for host in DEPRIORITIZED_HOST_HINTS):
        score -= 8

    return score


def pick_application_url(webpage_url: Optional[str], source_snapshot: Optional[dict]) -> tuple[Optional[str], Optional[str]]:
    candidates: list[tuple[int, str, str]] = []

    direct_url = (webpage_url or "").strip()
    if direct_url.startswith(("http://", "https://", "mailto:")):
        candidates.append((score_application_url(direct_url, "webpage_url"), direct_url, "webpage_url"))

    if isinstance(source_snapshot, dict):
        for candidate_url, source_path in collect_urls(source_snapshot):
            candidates.append((score_application_url(candidate_url, source_path), candidate_url, source_path))

    if not candidates:
        return None, None

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, best_url, best_source = candidates[0]
    return best_url, best_source


def extract_email_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    for match in DIRECT_APPLY_EMAIL_REGEX.finditer(text or ""):
        email = normalize_email(match.group(1))
        if email:
            candidates.append(email)
    for match in EMAIL_REGEX.finditer(text or ""):
        email = normalize_email(match.group(1))
        if email:
            candidates.append(email)
    return list(dict.fromkeys(candidates))


def score_email_candidate(email: str, context: str, source_path: str) -> int:
    score = 0
    lower_context = (context or "").lower()
    lower_path = (source_path or "").lower()
    lower_email = (email or "").lower()

    if not looks_like_disposable_or_system_email(email):
        score += 3

    if DIRECT_APPLY_EMAIL_REGEX.search(context or ""):
        score += 8

    if any(keyword in lower_context for keyword in PREFERRED_CONTEXT_KEYWORDS):
        score += 5

    if any(keyword in lower_path for keyword in PREFERRED_SOURCE_PATH_KEYWORDS):
        score += 4

    if any(keyword in lower_path for keyword in ("contact", "kontakt", "email", "mail")):
        score += 6

    if any(keyword in lower_context for keyword in DEPRIORITIZED_EMAIL_KEYWORDS):
        score -= 6

    if any(keyword in lower_email for keyword in ("jobb", "job", "career", "rekry", "hr")):
        score += 2

    if "@" in email and email.split("@", 1)[-1].count(".") >= 1:
        score += 1

    return score


def pick_best_email_from_sources(sources: list[tuple[str, str]]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    ranked: list[tuple[int, str, str, str]] = []

    for source_text, source_path in sources:
        text = source_text or ""
        for email in extract_email_candidates(text):
            pattern = re.escape(email)
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                start = max(0, match.start() - 180)
                end = min(len(text), match.end() + 180)
                context = text[start:end]
            else:
                context = text[:360]
            ranked.append((score_email_candidate(email, context, source_path), email, context, source_path))

    if not ranked:
        return None, None, None

    ranked.sort(key=lambda item: item[0], reverse=True)
    _, email, context, source_path = ranked[0]
    return email, context, source_path


def fetch_page_html(url: str, timeout: int = 8) -> tuple[Optional[str], Optional[str]]:
    try:
        response = requests.get(
            url,
            timeout=timeout,
            allow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; JobbNuBot/1.0; +https://jobbnu.se)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        if not response.ok:
            return None, f"http_{response.status_code}"
        return response.text, None
    except Exception as exc:
        return None, str(exc)


def extract_job_contact_data(description_text: Optional[str], webpage_url: Optional[str], source_snapshot: Optional[dict]) -> dict:
    description = description_text or ""
    sources: list[tuple[str, str]] = []
    if description:
        sources.append((description, "description_text"))
    if isinstance(source_snapshot, dict):
        sources.extend(collect_texts(source_snapshot))
        try:
            sources.append((json.dumps(source_snapshot, ensure_ascii=False), "source_snapshot.json"))
        except Exception:
            pass

    application_url, application_url_source = pick_application_url(webpage_url, source_snapshot)
    email = None
    context = None
    email_source = None

    if application_url and application_url.lower().startswith("mailto:"):
        email = normalize_email(application_url)
        context = application_url
        email_source = application_url_source or "application_url"
    else:
        email, context, email_source = pick_best_email_from_sources(sources)

    fetch_error = None
    if not email and webpage_url:
        html, fetch_error = fetch_page_html(webpage_url)
        if html:
            email, context, _ = pick_best_email_from_sources([(html, "webpage_html")])
            if email:
                email_source = "webpage_html"

    application_channel, reason = classify_application_channel(application_url, email)
    if fetch_error and not email:
        reason = f"{reason}|fetch_error"

    return {
        "contact_email": email,
        "has_contact_email": bool(email),
        "contact_email_source": email_source,
        "application_url": application_url,
        "application_url_source": application_url_source,
        "application_channel": application_channel,
        "application_channel_reason": reason,
        "contact_email_context": context,
    }
