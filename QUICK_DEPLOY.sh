#!/bin/bash
set -e

echo "🚀 Deploying Multiple Occupation Fields Update"
echo "=============================================="
echo ""

# Step 1: Rebuild web container with updated API code
echo "1️⃣ Rebuilding web container with updated API..."
docker-compose build web
echo "✅ Web container rebuilt"
echo ""

# Step 2: Restart all services
echo "2️⃣ Restarting services..."
docker-compose down
docker-compose up -d
echo "✅ Services restarted"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Step 3: Test the matching
echo "3️⃣ Testing matching for Lidia..."
docker exec cv-consulting_worker_1 sh -c 'export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbW1lZ3licXRxcWFoY2JkanZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjcxMTE5MywiZXhwIjoyMDY4Mjg3MTkzfQ.KpjUZuDDYewFpOcchD6EFH6_fFqbFQ1Q0q_aAnzWTr0"; python scripts/test_new_matching.py'
echo ""

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Clear your browser cache or open in incognito mode"
echo "  2. Log in as Lidia (dragiceviclidia218@gmail.com)"
echo "  3. Click 'Hitta matchningar'"
echo "  4. You should now see BOTH restaurant AND cleaning jobs!"
echo ""
echo "Expected results:"
echo "  ✅ Restaurant jobs: MR. BRONCK RUNNER, Köksbiträde, etc."
echo "  ✅ Cleaning jobs: Home cleaner, Lokalvård: Cleaner, etc."
