#!/bin/bash
# Test webhook connectivity

echo "🧪 Testing webhook connectivity..."
echo ""

# Test 1: Health check
echo "1. Testing worker health endpoint..."
curl -s http://worker:8000/health | jq . || echo "❌ Health check failed"
echo ""

# Test 2: Get a user_id from database
echo "2. Getting test user_id from database..."
USER_ID=$(psql $DATABASE_URL -t -c "SELECT user_id FROM candidate_profiles LIMIT 1;" 2>/dev/null | tr -d ' ')

if [ -z "$USER_ID" ]; then
    echo "❌ No users found in database. Please create a profile first."
    exit 1
fi

echo "✅ Found user: $USER_ID"
echo ""

# Test 3: Test webhook directly
echo "3. Testing webhook endpoint directly..."
curl -X POST http://worker:8000/webhook/update-profile \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"$USER_ID\", \"cv_text\": \"\"}" \
  | jq .

echo ""
echo "✅ Test complete! Check logs above for webhook output."
