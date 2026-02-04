# Profile Page Redesign Summary

## Overview
The profile page has been redesigned to support the Career Intent Graph architecture from CURRENTPLANOFMOTION.md. Users can now choose between uploading a CV or manually filling in structured fields.

## Changes Made

### 1. Database Schema (`/supabase/migrations/20260204_add_persona_fields.sql`)
Added new columns to `candidate_profiles` table:

#### Core Fields
- `entry_mode` - Tracks whether user chose CV upload or manual entry ('cv_upload' | 'manual_entry')
- `intent` - User's job search intent (4 options)
  - 'match_current_role' - Jobs similar to current role
  - 'transition_to_target' - Jobs matching target role
  - 'pick_categories' - Manual category selection
  - 'show_multiple_tracks' - Show multiple career paths (recommended)

#### Persona Fields (Text + Vector)
- **Past personas** (1-3 previous jobs):
  - `persona_past_1_text` + `persona_past_1_vector` (768 dims)
  - `persona_past_2_text` + `persona_past_2_vector` (768 dims)
  - `persona_past_3_text` + `persona_past_3_vector` (768 dims)

- **Current persona**:
  - `persona_current_text` + `persona_current_vector` (768 dims)

- **Target persona**:
  - `persona_target_text` + `persona_target_vector` (768 dims)

#### Additional Fields
- `skills_text` - Skills and tools
- `education_certifications_text` - Education and certifications
- `seniority_level` - Experience level ('junior' | 'mid' | 'senior')
- `occupation_field_candidates[]` - Array of candidate occupation fields
- `occupation_group_candidates[]` - Array of candidate occupation groups
- `occupation_targets[]` - Array of target occupations
- `must_have_constraints` - JSONB for location, schedule, licenses, etc.

### 2. Profile Page UI (`/src/app/profile/page.tsx`)
New layout with:
- **Entry mode toggle**: Choose between "Ladda upp CV" or "Fyll i manuellt"
- **Manual entry layout**:
  - **Left section (50%)**: Past personas (3), Current persona, Target persona
  - **Right section (20%)**: Intent selection + Seniority level
  - **Bottom section**: Skills and Education/Certifications (side by side)
- Clean separation lines between sections

### 3. Profile API (`/src/app/api/profile/route.ts`)
Updated POST endpoint to:
- Accept all new persona fields from form data
- Store entry mode preference
- Clear vectors when updating (to trigger regeneration)
- Maintain backward compatibility with CV upload flow

## SQL Migration to Run

Run this migration on your Supabase database:

```bash
psql $DATABASE_URL -f /opt/cv-consulting/supabase/migrations/20260204_add_persona_fields.sql
```

Or via Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `/opt/cv-consulting/supabase/migrations/20260204_add_persona_fields.sql`
3. Execute the migration

## Next Steps

### 1. Vector Generation Pipeline
Update your Python worker to generate vectors for the new persona fields:
- When `entry_mode = 'manual_entry'`, generate vectors from:
  - `persona_current_text` → `persona_current_vector`
  - `persona_target_text` → `persona_target_vector`
  - `persona_past_1_text` → `persona_past_1_vector` (if present)
  - etc.

### 2. Matching Logic Updates
Implement the intent-based matching from CURRENTPLANOFMOTION.md:
- **match_current_role**: Use `persona_current_vector` for matching
- **transition_to_target**: Use `persona_target_vector` for matching
- **show_multiple_tracks**: Use both vectors, show results in separate tabs
- **pick_categories**: Let user filter by occupation fields

### 3. Testing
Test both flows:
- [ ] CV upload flow (existing functionality)
- [ ] Manual entry flow (new functionality)
- [ ] Profile updates with existing data
- [ ] Vector regeneration triggers correctly

## Benefits

1. **Privacy**: Users can control exactly what information they share
2. **Intent-driven**: Matches are based on what users want, not just their history
3. **Multi-track career**: Supports career transitions, promotions, and switches
4. **Better matching**: Separate vectors for current vs target roles = more accurate results

## UI Layout Reference

```
┌─────────────────────────────────────────────────────────┐
│ Entry Mode Toggle: [CV Upload] [Manual Entry]          │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐  ┌───────────────────┐   │
│ │ Past Roles (50%)         │  │ Intent (20%)      │   │
│ │ - Past 1                 │  │ - Choose intent   │   │
│ │ - Past 2                 │  │ - Seniority       │   │
│ │ - Past 3                 │  │                   │   │
│ │ ─────────────────        │  └───────────────────┘   │
│ │ Current Role             │                           │
│ │ ─────────────────        │                           │
│ │ Target Role              │                           │
│ └──────────────────────────┘                           │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐  ┌────────────────────────┐   │
│ │ Skills              │  │ Education/Certs        │   │
│ │                     │  │                        │   │
│ └─────────────────────┘  └────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Files Modified
- ✅ `/supabase/migrations/20260204_add_persona_fields.sql` (NEW)
- ✅ `/src/app/profile/page.tsx` (MODIFIED)
- ✅ `/src/app/api/profile/route.ts` (MODIFIED)
