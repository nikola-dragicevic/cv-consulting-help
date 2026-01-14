# Deployment Instructions: Multiple Occupation Fields

## Overview
This update adds support for multiple occupation fields per candidate, improving job matching for candidates with diverse experience (e.g., cleaning AND restaurant work).

## Steps to Deploy

### 1. Database Schema Migration
Run the SQL migration in Supabase SQL Editor:
```bash
https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql
```

Execute: `scripts/migrate_occupation_fields.sql`

This will:
- Rename `primary_occupation_field` to `primary_occupation_field_old`
- Create new `primary_occupation_field TEXT[]` column
- Migrate existing data from TEXT to TEXT[]

### 2. Update SQL Functions
In Supabase SQL Editor, execute: `scripts/match_jobs.sql`

This updates:
- `match_jobs_initial()` - now accepts `filter_occupation_fields TEXT[]`
- `match_jobs_profile_wish()` - now accepts `filter_occupation_fields TEXT[]`

Both functions now support matching against multiple occupation fields using `j.occupation_field_label = ANY(filter_occupation_fields)`.

### 3. Regenerate Candidate Vectors
Run the enrichment script to recompute occupation fields with the new logic:

```bash
docker exec cv-consulting-worker-1 sh -c 'export SUPABASE_SERVICE_ROLE_KEY="<key>"; export FORCE_REBUILD_TAGS=1; python scripts/generate_candidate_vector.py'
```

Or for a specific candidate:
```bash
docker exec cv-consulting-worker-1 sh -c 'export SUPABASE_SERVICE_ROLE_KEY="<key>"; export FORCE_REBUILD_TAGS=1; python scripts/generate_candidate_vector.py --email user@example.com'
```

### 4. Restart Services
```bash
docker-compose down
docker-compose up -d --build
```

## How It Works

### Occupation Field Relations
File: `config/occupation_field_relations.json`

Defines:
- **Multi-field categories**: Categories that map to multiple occupation fields
  - Example: "Service / Hospitality" → ["Hotell, restaurang, storhushåll", "Sanering och renhållning"]
- **Related fields**: Occupation fields that are related to each other
  - Example: "Hotell, restaurang, storhushåll" is related to "Sanering och renhållning"

### Candidate Processing
When a candidate's CV is analyzed:

1. Extract category tags (e.g., "Service / Hospitality")
2. Check if category has multiple occupation fields defined
3. If yes, assign all fields (e.g., both hotel/restaurant AND cleaning)
4. Optionally expand to include related fields

Example: Lidia's profile
- **CV mentions**: "cleaning", "kitchen", "restaurant"
- **Category tags**: ["Service / Hospitality"]
- **Occupation fields**: ["Hotell, restaurang, storhushåll", "Sanering och renhållning"]
- **Result**: Matches both restaurant jobs AND cleaning jobs

### Job Matching
SQL functions now use array matching:

```sql
-- Before (single field)
WHERE j.occupation_field_label = 'Hotell, restaurang, storhushåll'

-- After (multiple fields)
WHERE j.occupation_field_label = ANY(ARRAY['Hotell, restaurang, storhushåll', 'Sanering och renhållning'])
```

## Configuration

### Adding Multi-Field Categories
Edit `config/occupation_field_relations.json`:

```json
{
  "multi_field_categories": {
    "Your Category Name": ["Field 1", "Field 2"]
  }
}
```

### Adding Related Fields
```json
{
  "relations": {
    "Field 1": {
      "related": ["Field 2", "Field 3"],
      "reason": "Explanation of relationship"
    }
  }
}
```

### Include Related Fields
In `scripts/generate_candidate_vector.py`, line 856:
```python
# Only direct mappings
occupation_fields = compute_occupation_fields(tags, include_related=False)

# Include related fields (broader matching)
occupation_fields = compute_occupation_fields(tags, include_related=True)
```

## Testing
Use the test script to verify matching:

```bash
docker cp scripts/test_matching.py cv-consulting-worker-1:/app/scripts/
docker exec cv-consulting-worker-1 sh -c 'export SUPABASE_SERVICE_ROLE_KEY="<key>"; python scripts/test_matching.py'
```

## Rollback
If issues occur:

1. Revert database: `ALTER TABLE candidate_profiles RENAME COLUMN primary_occupation_field TO primary_occupation_field_new; ALTER TABLE candidate_profiles RENAME COLUMN primary_occupation_field_old TO primary_occupation_field;`
2. Restore old SQL functions from git history
3. Restart services

## Benefits
- Better matches for candidates with diverse experience
- Reduced false negatives (missing relevant jobs)
- More flexible occupation field system
- Configurable relationships between fields
