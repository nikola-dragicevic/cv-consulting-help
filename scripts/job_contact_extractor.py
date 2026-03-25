import re
from typing import Optional

import requests

EMAIL_REGEX = re.compile(r"(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?![\w.-])", re.IGNORECASE)

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
    email = (raw or "").strip().strip(".,;:()[]<>\"'")
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
        if candidate.startswith(("http://", "https://")):
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


def score_application_url(url: str, source_path: str) -> int:
    lowered = url.lower()
    score = 0

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
    if direct_url.startswith(("http://", "https://")):
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
    for match in EMAIL_REGEX.finditer(text or ""):
        email = normalize_email(match.group(1))
        if email:
            candidates.append(email)
    return list(dict.fromkeys(candidates))


def score_email_candidate(email: str, context: str) -> int:
    score = 0
    lower_context = (context or "").lower()

    if not looks_like_disposable_or_system_email(email):
        score += 3

    if any(keyword in lower_context for keyword in PREFERRED_CONTEXT_KEYWORDS):
        score += 5

    if "@" in email and email.split("@", 1)[-1].count(".") >= 1:
        score += 1

    return score


def pick_best_email(*texts: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    ranked: list[tuple[int, str, str]] = []

    for text in texts:
        source = text or ""
        for match in EMAIL_REGEX.finditer(source):
            raw_email = match.group(1)
            email = normalize_email(raw_email)
            if not email:
                continue
            start = max(0, match.start() - 180)
            end = min(len(source), match.end() + 180)
            context = source[start:end]
            ranked.append((score_email_candidate(email, context), email, context))

    if not ranked:
        return None, None

    ranked.sort(key=lambda item: item[0], reverse=True)
    _, email, context = ranked[0]
    return email, context


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
    snapshot_text = ""
    if isinstance(source_snapshot, dict):
        snapshot_text = " ".join(
            str(value)
            for value in source_snapshot.values()
            if isinstance(value, (str, int, float))
        )

    application_url, application_url_source = pick_application_url(webpage_url, source_snapshot)
    email, context = pick_best_email(description, snapshot_text)
    email_source = "description_text" if email else None

    fetch_error = None
    if not email and webpage_url:
        html, fetch_error = fetch_page_html(webpage_url)
        if html:
            email, context = pick_best_email(html)
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
