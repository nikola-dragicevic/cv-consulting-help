#!/bin/bash

# This script applies the SQL migration to create the match_jobs_with_occupation_filter function
# You need to run this via Supabase Dashboard SQL Editor

echo "📋 To apply the SQL migration:"
echo ""
echo "1. Go to: https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql/new"
echo ""
echo "2. Copy and paste the SQL below:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "3. Click 'Run' in the Supabase SQL Editor"
echo ""
echo "OR copy the migration to clipboard and paste it in Supabase:"
echo ""
echo "cat /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql | xclip -selection clipboard"
echo ""
