import argparse
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(REPO_ROOT))

load_dotenv(REPO_ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise SystemExit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or service key env vars")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

RETRIEVAL_POOL_LIMIT = int(os.getenv("PRECOMPUTE_MATCH_RETRIEVAL_LIMIT", "1000"))
SAVED_MATCH_LIMIT = int(os.getenv("PRECOMPUTE_MATCH_SAVE_LIMIT", "500"))
INCREMENTAL_INSERT_LIMIT = int(os.getenv("PRECOMPUTE_MATCH_INCREMENTAL_LIMIT", "300"))
PROFILE_BATCH_SIZE = int(os.getenv("PRECOMPUTE_MATCH_PROFILE_BATCH_SIZE", "100"))
UPSERT_BATCH_SIZE = int(os.getenv("PRECOMPUTE_MATCH_UPSERT_BATCH_SIZE", "100"))

KEYWORD_PATTERNS = [
    re.compile(r"\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Go|Rust)\b", re.I),
    re.compile(r"\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Laravel|Rails)\b", re.I),
    re.compile(r"\b(Docker|Kubernetes|AWS|Azure|GCP|Git|Jenkins|Terraform)\b", re.I),
    re.compile(r"\b(SQL|NoSQL|REST|GraphQL|API|Microservices|Agile|Scrum)\b", re.I),
    re.compile(r"\b(B-körkort|C-körkort|PLC|S7)\b", re.I),
]
CAPITALIZED_PATTERN = re.compile(r"\b[A-ZÅÄÖ][a-zA-ZÅÄÖåäö0-9.+#-]{2,}\b")
MAX_KEYWORDS = 12


def has_vector_value(value) -> bool:
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        stripped = value.strip()
        return bool(stripped and stripped != "[]")
    return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Precompute candidate job matches from semantic pool + worker-side scoring.")
    parser.add_argument("--mode", choices=["auto", "full", "incremental"], default="auto")
    parser.add_argument("--user-id", type=str, default=None, help="Only process one user")
    parser.add_argument("--limit-users", type=int, default=None, help="Stop after processing this many users")
    return parser


def to_string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def extract_keywords_from_text(cv_text: str) -> list[str]:
    if not isinstance(cv_text, str) or not cv_text.strip():
        return []

    keywords: list[str] = []
    seen: set[str] = set()

    for pattern in KEYWORD_PATTERNS:
        for match in pattern.findall(cv_text):
            keyword = match.strip()
            key = keyword.lower()
            if key and key not in seen:
                seen.add(key)
                keywords.append(keyword)
                if len(keywords) >= MAX_KEYWORDS:
                    return keywords

    for match in CAPITALIZED_PATTERN.findall(cv_text):
        keyword = match.strip()
        if len(keyword) < 3 or len(keyword) > 20:
            continue
        key = keyword.lower()
        if key in seen:
            continue
        seen.add(key)
        keywords.append(keyword)
        if len(keywords) >= MAX_KEYWORDS:
            break

    return keywords


def get_profile_keywords(profile: dict) -> list[str]:
    search_keywords = to_string_list(profile.get("search_keywords"))
    if search_keywords:
        return search_keywords[:MAX_KEYWORDS]
    return extract_keywords_from_text(profile.get("candidate_text_vector") or "")


def compute_profile_signature(profile: dict) -> str:
    payload = {
        "profile_vector": profile.get("profile_vector") or "",
        "candidate_text_vector": profile.get("candidate_text_vector") or "",
        "category_tags": sorted(to_string_list(profile.get("category_tags"))),
        "location_lat": profile.get("location_lat"),
        "location_lon": profile.get("location_lon"),
        "commute_radius_km": profile.get("commute_radius_km"),
    }
    return hashlib.sha1(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()


def calc_distance_m(lat1, lon1, lat2, lon2):
    if not all(isinstance(v, (int, float)) for v in [lat1, lon1, lat2, lon2]):
        return None

    radius = 6371000.0
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    delta_phi = math.radians(float(lat2) - float(lat1))
    delta_lambda = math.radians(float(lon2) - float(lon1))
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return float(radius * c)


def compute_keyword_hits(job_row: dict, keywords: list[str]) -> list[str]:
    if not keywords:
        return []
    haystack = f"{job_row.get('title') or ''}\n{job_row.get('description') or ''}".lower()
    hits: list[str] = []
    seen: set[str] = set()
    for keyword in keywords:
        lowered = keyword.lower()
        if lowered in seen:
            continue
        if lowered and lowered in haystack:
            seen.add(lowered)
            hits.append(keyword)
    return hits


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def score_job(profile: dict, job_row: dict, match_source: str) -> dict:
    keywords = get_profile_keywords(profile)
    keyword_hits = compute_keyword_hits(job_row, keywords)
    keyword_total = len(keywords)
    keyword_hit_count = len(keyword_hits)
    keyword_hit_rate = (keyword_hit_count / keyword_total) if keyword_total > 0 else 0.0
    keyword_miss_rate = (1.0 - keyword_hit_rate) if keyword_total > 0 else 1.0

    category_tags = {tag.lower() for tag in to_string_list(profile.get("category_tags"))}
    occupation_group = (job_row.get("occupation_group_label") or "").strip().lower()
    taxonomy_hit_count = 1 if occupation_group and occupation_group in category_tags else 0
    taxonomy_bonus = min(0.15 * taxonomy_hit_count, 0.45)

    vector_similarity = clamp(float(job_row.get("vector_similarity") or 0.0), 0.0, 1.0)
    base_score = (0.70 * vector_similarity) + (0.20 * keyword_hit_rate) - (0.10 * keyword_miss_rate)
    final_score = clamp(base_score + taxonomy_bonus, 0.0, 1.0)

    job_lat = job_row.get("location_lat")
    job_lon = job_row.get("location_lon")
    if job_lat is None or job_lon is None:
      job_lat = job_row.get("lat")
      job_lon = job_row.get("lon")

    distance_m = calc_distance_m(
        profile.get("location_lat"),
        profile.get("location_lon"),
        job_lat,
        job_lon,
    )

    return {
        "user_id": profile["user_id"],
        "job_id": str(job_row["id"]),
        "match_source": match_source,
        "vector_similarity": vector_similarity,
        "keyword_hits": keyword_hits,
        "keyword_hit_count": keyword_hit_count,
        "keyword_total_count": keyword_total,
        "keyword_hit_rate": keyword_hit_rate,
        "keyword_miss_rate": keyword_miss_rate,
        "taxonomy_hit_count": taxonomy_hit_count,
        "taxonomy_bonus": taxonomy_bonus,
        "base_score": clamp(base_score, 0.0, 1.0),
        "final_score": final_score,
        "distance_m": distance_m,
        "job_published_at": job_row.get("published_date"),
        "job_last_seen_at": job_row.get("last_seen_at"),
        "matched_at": datetime.now(timezone.utc).isoformat(),
    }


def upsert_match_rows(rows: list[dict]) -> None:
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[i:i + UPSERT_BATCH_SIZE]
        supabase.table("candidate_job_matches").upsert(
            batch,
            on_conflict="user_id,job_id",
        ).execute()


def delete_match_rows(user_id: str, job_ids: list[str]) -> None:
    if not job_ids:
        return
    for i in range(0, len(job_ids), UPSERT_BATCH_SIZE):
        batch = job_ids[i:i + UPSERT_BATCH_SIZE]
        (
            supabase.table("candidate_job_matches")
            .delete()
            .eq("user_id", user_id)
            .in_("job_id", batch)
            .execute()
        )


def update_match_state(user_id: str, payload: dict) -> None:
    state_payload = {
        "user_id": user_id,
        **payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("candidate_match_state").upsert(state_payload, on_conflict="user_id").execute()


def fetch_latest_job_seen_at():
    res = (
        supabase.table("job_ads")
        .select("last_seen_at")
        .not_.is_("last_seen_at", "null")
        .order("last_seen_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0]["last_seen_at"] if rows else None


def fetch_candidate_profiles(user_id: str | None = None, limit_users: int | None = None) -> list[dict]:
    profiles: list[dict] = []
    last_user_id = None

    while True:
        query = (
            supabase.table("candidate_profiles")
            .select("user_id,profile_vector,candidate_text_vector,search_keywords,category_tags,location_lat,location_lon,commute_radius_km")
            .not_.is_("user_id", "null")
            .order("user_id")
            .limit(PROFILE_BATCH_SIZE)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        elif last_user_id:
            query = query.gt("user_id", last_user_id)

        response = query.execute()
        rows = response.data or []
        if not rows:
            break

        profiles.extend(rows)
        if user_id:
            break
        if limit_users is not None and len(profiles) >= limit_users:
            profiles = profiles[:limit_users]
            break

        last_user_id = rows[-1]["user_id"]

    return profiles


def fetch_match_state_map(user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    response = (
        supabase.table("candidate_match_state")
        .select("*")
        .in_("user_id", user_ids)
        .execute()
    )
    return {row["user_id"]: row for row in (response.data or [])}


def fetch_existing_matches(user_id: str) -> list[dict]:
    response = (
        supabase.table("candidate_job_matches")
        .select("job_id,final_score")
        .eq("user_id", user_id)
        .execute()
    )
    return response.data or []


def run_full_refresh(profile: dict, latest_seen_at: str | None) -> tuple[int, str]:
    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "processing",
            "last_error": None,
            "last_pool_size": 0,
            "saved_job_count": 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )

    response = supabase.rpc(
        "fetch_candidate_semantic_pool",
        {
            "candidate_vector": profile["profile_vector"],
            "limit_count": RETRIEVAL_POOL_LIMIT,
        },
    ).execute()
    rows = response.data or []
    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "semantic_pool_ready",
            "last_error": None,
            "last_pool_size": len(rows),
            "saved_job_count": 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )

    scored = [score_job(profile, row, "full_refresh") for row in rows]
    scored.sort(key=lambda row: (row["final_score"], row["vector_similarity"]), reverse=True)
    top_rows = scored[:SAVED_MATCH_LIMIT]
    top_ids = [row["job_id"] for row in top_rows]

    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "saving_matches",
            "last_error": None,
            "last_pool_size": len(rows),
            "saved_job_count": 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )

    upsert_match_rows(top_rows)

    existing_ids = {str(row["job_id"]) for row in fetch_existing_matches(profile["user_id"])}
    stale_ids = sorted(existing_ids.difference(top_ids))
    delete_match_rows(profile["user_id"], stale_ids)

    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "success",
            "last_error": None,
            "last_full_refresh_at": datetime.now(timezone.utc).isoformat(),
            "last_job_ingest_seen_at": latest_seen_at,
            "last_pool_size": len(rows),
            "saved_job_count": len(top_rows),
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )
    return len(top_rows), "full"


def run_incremental_refresh(profile: dict, state: dict, latest_seen_at: str | None) -> tuple[int, str]:
    seen_after = state.get("last_job_ingest_seen_at")
    if not latest_seen_at or not seen_after or latest_seen_at <= seen_after:
        update_match_state(
            profile["user_id"],
            {
                "profile_signature": compute_profile_signature(profile),
                "match_ready": True,
                "status": "success",
                "last_error": None,
                "active_radius_km": profile.get("commute_radius_km"),
                "candidate_lat": profile.get("location_lat"),
                "candidate_lon": profile.get("location_lon"),
            },
        )
        return 0, "noop"

    response = supabase.rpc(
        "fetch_recent_candidate_semantic_pool",
        {
            "candidate_vector": profile["profile_vector"],
            "seen_after": seen_after,
            "limit_count": INCREMENTAL_INSERT_LIMIT,
        },
    ).execute()
    rows = response.data or []
    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "semantic_pool_ready",
            "last_error": None,
            "last_pool_size": len(rows),
            "saved_job_count": state.get("saved_job_count") if isinstance(state.get("saved_job_count"), int) else 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )
    scored = [score_job(profile, row, "incremental_refresh") for row in rows]
    scored.sort(key=lambda row: (row["final_score"], row["vector_similarity"]), reverse=True)
    top_incremental = scored[:INCREMENTAL_INSERT_LIMIT]

    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "saving_matches",
            "last_error": None,
            "last_pool_size": len(rows),
            "saved_job_count": state.get("saved_job_count") if isinstance(state.get("saved_job_count"), int) else 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )

    upsert_match_rows(top_incremental)

    all_rows = (
        supabase.table("candidate_job_matches")
        .select("job_id,final_score,vector_similarity")
        .eq("user_id", profile["user_id"])
        .execute()
    ).data or []
    all_rows.sort(
        key=lambda row: (
            float(row.get("final_score") or 0.0),
            float(row.get("vector_similarity") or 0.0),
        ),
        reverse=True,
    )
    stale_ids = [str(row["job_id"]) for row in all_rows[SAVED_MATCH_LIMIT:]]
    delete_match_rows(profile["user_id"], stale_ids)

    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "success",
            "last_error": None,
            "last_incremental_refresh_at": datetime.now(timezone.utc).isoformat(),
            "last_job_ingest_seen_at": latest_seen_at,
            "last_pool_size": len(rows),
            "saved_job_count": min(len(all_rows), SAVED_MATCH_LIMIT),
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )
    return len(top_incremental), "incremental"


def should_run_full_refresh(profile: dict, state: dict | None, mode: str) -> bool:
    if mode == "full":
        return True
    if mode == "incremental":
        return False
    if not state:
        return True
    if not state.get("last_full_refresh_at"):
        return True
    if state.get("profile_signature") != compute_profile_signature(profile):
        return True
    existing_matches = (
        supabase.table("candidate_job_matches")
        .select("job_id")
        .eq("user_id", profile["user_id"])
        .limit(1)
        .execute()
    ).data or []
    return len(existing_matches) == 0


def process_profile(profile: dict, state: dict | None, mode: str, latest_seen_at: str | None) -> tuple[int, str]:
    if not has_vector_value(profile.get("profile_vector")):
        update_match_state(
            profile["user_id"],
            {
                "profile_signature": state.get("profile_signature") if state else "",
                "match_ready": False,
                "status": "pending",
                "last_error": None,
                "last_pool_size": 0,
                "saved_job_count": 0,
                "active_radius_km": profile.get("commute_radius_km"),
                "candidate_lat": profile.get("location_lat"),
                "candidate_lon": profile.get("location_lon"),
            },
        )
        return 0, "pending"

    update_match_state(
        profile["user_id"],
        {
            "profile_signature": compute_profile_signature(profile),
            "match_ready": True,
            "status": "processing",
            "last_error": None,
            "last_pool_size": state.get("last_pool_size") if state and isinstance(state.get("last_pool_size"), int) else 0,
            "saved_job_count": state.get("saved_job_count") if state and isinstance(state.get("saved_job_count"), int) else 0,
            "active_radius_km": profile.get("commute_radius_km"),
            "candidate_lat": profile.get("location_lat"),
            "candidate_lon": profile.get("location_lon"),
        },
    )

    if should_run_full_refresh(profile, state, mode):
        return run_full_refresh(profile, latest_seen_at)
    return run_incremental_refresh(profile, state or {}, latest_seen_at)


def run_precomputed_match_refresh(mode: str = "auto", user_id: str | None = None, limit_users: int | None = None) -> None:
    print(f"🧠 [MATCH PRECOMPUTE] Starting refresh mode={mode} user_id={user_id or '-'}")
    profiles = fetch_candidate_profiles(user_id=user_id, limit_users=limit_users)
    if not profiles:
        print("ℹ️ [MATCH PRECOMPUTE] No candidate profiles found.")
        return

    user_ids = [profile["user_id"] for profile in profiles if profile.get("user_id")]
    state_map = fetch_match_state_map(user_ids)
    latest_seen_at = fetch_latest_job_seen_at()

    processed = 0
    full_runs = 0
    incremental_runs = 0
    skipped = 0

    for profile in profiles:
        profile_user_id = profile.get("user_id")
        if not profile_user_id:
            continue
        try:
            affected, run_kind = process_profile(profile, state_map.get(profile_user_id), mode, latest_seen_at)
            processed += 1
            if run_kind == "full":
                full_runs += 1
            elif run_kind == "incremental":
                incremental_runs += 1
            else:
                skipped += 1

            print(
                f"   user={profile_user_id} kind={run_kind} affected={affected}",
                flush=True,
            )
        except Exception as exc:
            update_match_state(
                profile_user_id,
                {
                    "profile_signature": compute_profile_signature(profile),
                    "match_ready": True,
                    "status": "failed",
                    "last_error": str(exc),
                    "active_radius_km": profile.get("commute_radius_km"),
                    "candidate_lat": profile.get("location_lat"),
                    "candidate_lon": profile.get("location_lon"),
                },
            )
            print(f"❌ [MATCH PRECOMPUTE] user={profile_user_id} failed: {exc}", flush=True)

    print(
        f"✅ [MATCH PRECOMPUTE] finished processed={processed} full={full_runs} incremental={incremental_runs} skipped={skipped}",
        flush=True,
    )


def main() -> None:
    args = build_parser().parse_args()
    run_precomputed_match_refresh(mode=args.mode, user_id=args.user_id, limit_users=args.limit_users)


if __name__ == "__main__":
    main()
