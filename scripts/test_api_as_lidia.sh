#!/bin/bash
# Test the API as if Lidia is logged in

echo "=============================================="
echo "Testing /api/match/init as Lidia"
echo "=============================================="
echo ""

# Get Lidia's auth token from Supabase
echo "1️⃣ Getting Lidia's session token..."

# Note: In production, you'd get a real JWT token
# For now, let's test with service role key directly

echo ""
echo "2️⃣ Testing authenticated API call..."

# Make request to API with Lidia's user in the session
# Since we can't easily get a session token, let's check what the API receives

curl -s http://localhost:3000/api/match/init \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Stockholm",
    "radius_km": 40
  }' | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'error' in data:
    print(f\"❌ Error: {data['error']}\")
else:
    jobs = data.get('jobs', [])
    print(f\"✅ Got {len(jobs)} jobs\")
    print(\"\\nTop 10 jobs:\")
    for i, job in enumerate(jobs[:10], 1):
        headline = job.get('headline', 'Unknown')
        score = job.get('s_profile', 0)
        print(f\"{i}. {headline} ({score*100:.0f}%)\")

    # Check if we have diverse jobs
    restaurant_count = sum(1 for j in jobs if any(word in j.get('headline', '').lower()
        for word in ['restaurang', 'kök', 'bronck', 'servic']))
    cleaning_count = sum(1 for j in jobs if any(word in j.get('headline', '').lower()
        for word in ['clean', 'städ', 'lokalvård']))

    print(f\"\\n📊 Analysis:\")
    print(f\"  Restaurant jobs: {restaurant_count}\")
    print(f\"  Cleaning jobs: {cleaning_count}\")

    if restaurant_count > 0 and cleaning_count > 0:
        print(f\"\\n✅ SUCCESS: Getting BOTH restaurant and cleaning jobs!\")
    else:
        print(f\"\\n⚠️  WARNING: Not getting diverse job types\")
"

echo ""
echo "=============================================="
echo "NOTE: This is an anonymous request."
echo "To test as logged-in user, you need to:"
echo "1. Log in via browser"
echo "2. Copy session cookies"
echo "3. Include cookies in the curl request"
echo "=============================================="
