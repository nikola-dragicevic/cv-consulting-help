-- Fix occupation fields for Control Room Operator / Process Specialist
-- Run this AFTER applying the match function migration

-- Based on your profile: Control Room Operator, Process Specialist at DHL/Postnord
-- Skills: WCS, WMS, SQL, Python (for automation), incident management, transport flow
-- This should be Transport + Automation, NOT Data/IT

-- Find your user_id first (replace with your actual user_id)
-- SELECT user_id, full_name, persona_current_text FROM candidate_profiles WHERE full_name LIKE '%your_name%';

-- Update occupation fields for Nikola (example - adjust user_id)
UPDATE candidate_profiles
SET
  -- PRIMARY FIELDS: Transport and Installation/maintenance
  occupation_field_candidates = ARRAY[
    'Transport',
    'Installation, drift, underhåll',
    'Tekniskt arbete'
  ],

  -- OCCUPATION GROUPS (more specific)
  occupation_group_candidates = ARRAY[
    'Lager och terminal',
    'Maskin- och processdrift',
    'Drift, övervakning och underhåll',
    'Transport och logistik'
  ],

  -- PRIMARY FIELD (single, for filtering)
  primary_occupation_field = 'Transport',

  -- CATEGORY TAGS (keep for reference, but not used in matching)
  category_tags = ARRAY[
    'Transport/Logistics',
    'Automation/Industrial',
    'Engineering/Tech',
    'Operations/Process'
  ]

WHERE user_id = 'YOUR_USER_ID_HERE';  -- Replace with your actual user_id

-- To find your user_id, run this first:
-- SELECT user_id, full_name, city FROM candidate_profiles ORDER BY updated_at DESC LIMIT 5;

-- Verify the update:
SELECT
  full_name,
  primary_occupation_field,
  occupation_field_candidates,
  occupation_group_candidates,
  category_tags
FROM candidate_profiles
WHERE user_id = 'YOUR_USER_ID_HERE';

-- EXPLANATION:
-- ============
--
-- Why these fields?
-- -----------------
-- 1. Transport: You work in logistics, control rooms for transport operations
-- 2. Installation, drift, underhåll: Your role involves automation systems (WCS/WMS), monitoring, incident management
-- 3. Tekniskt arbete: Technical work with automation tools, SQL, Python for system integration
--
-- Why NOT Data/IT?
-- -----------------
-- - Data/IT is for software engineers, developers, data analysts
-- - You USE software tools (WCS, WMS, SQL) but you're not developing them
-- - Your primary role is operations, process control, and logistics - not software development
--
-- What jobs will you see now?
-- ---------------------------
-- ✅ Lagerchef (Warehouse Manager)
-- ✅ Driftledare (Operations Manager)
-- ✅ Processoperatör (Process Operator)
-- ✅ Automationstekniker (Automation Technician)
-- ✅ Transportkoordinator (Transport Coordinator)
-- ✅ Supply Chain Specialist
-- ❌ Senior Software Engineer (correctly filtered out!)
-- ❌ Game Developer (correctly filtered out!)
