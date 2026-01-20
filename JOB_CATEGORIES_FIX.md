# Job Categories Section - Fix for Accurate Counts

## Problem Identified

The frontend was showing incorrect job counts per category:
- **Total Jobs**: 50,322 ✅ (correct)
- **Sum of all category counts**: ~809 ❌ (incorrect)
- **Jobs with null `occupation_field_label`**: 10,786

The issue was that the API was fetching all 50k+ rows and counting them in JavaScript, which is:
1. **Inefficient** - transferring 50k rows over the network
2. **Slow** - client-side aggregation is slower than database aggregation
3. **Limited** - Supabase may have row limits that truncate results

## Solution

Created a PostgreSQL function to perform server-side aggregation:

### Step 1: Create the SQL Function

Run the following SQL in your **Supabase SQL Editor**:

```sql
CREATE OR REPLACE FUNCTION get_occupation_field_counts()
RETURNS TABLE (
  occupation_field_label TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    occupation_field_label,
    COUNT(*) as count
  FROM job_ads
  WHERE occupation_field_label IS NOT NULL
  GROUP BY occupation_field_label
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_occupation_field_counts() TO anon, authenticated, service_role;
```

**Location**: This SQL is also saved in `scripts/create_occupation_field_counts_function.sql`

### Step 2: API Updated

The API endpoint `/api/job-categories/route.ts` has been updated to:
- Call the new RPC function `get_occupation_field_counts()`
- Handle errors gracefully with a fallback
- Return properly aggregated data

### Step 3: Verify the Fix

1. **Run the SQL** in Supabase SQL Editor
2. **Test the function** directly in Supabase:
   ```sql
   SELECT * FROM get_occupation_field_counts();
   ```
3. **Restart your dev server**:
   ```bash
   npm run dev
   ```
4. **Check the API**:
   ```bash
   curl http://localhost:3000/api/job-categories
   ```
5. **View the frontend** and verify the counts now add up correctly

## Expected Results After Fix

The sum of all category counts should be close to (50,322 - 10,786) = **39,536 jobs** (accounting for the 10,786 jobs with null labels).

Each category should show accurate counts based on the database aggregation.

## Database Optimization Notes

### Current Approach
- ✅ Total count: Uses `count: 'exact'` with `head: true` (efficient)
- ✅ Category counts: Uses PostgreSQL aggregation (efficient)

### Handling Null Values

**10,786 jobs have null `occupation_field_label`**. Options:

1. **Current approach**: Exclude them from category counts (implemented)
2. **Alternative**: Add an "Övrigt" (Other) category for null values
3. **Best long-term**: Run a data enrichment script to populate missing labels

### Future Improvements

1. **Add caching**: Cache results for 1 hour to reduce database load
2. **Add subcategory counts**: Create a similar function for `occupation_group_label`
3. **Materialized view**: For even faster queries, create a materialized view that refreshes daily

## Files Modified

1. ✅ `src/app/api/job-categories/route.ts` - Updated to use RPC function
2. ✅ `scripts/create_occupation_field_counts_function.sql` - New SQL migration

## Files Created Earlier

1. `src/components/ui/JobCategoriesSection.tsx` - Frontend component
2. `src/app/api/job-categories/route.ts` - API endpoint

## Next Steps

1. **Run the SQL migration** in Supabase (required)
2. **Test the API** to verify counts
3. **Restart the dev server**
4. **Consider adding caching** for production performance
