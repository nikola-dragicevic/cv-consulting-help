require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const cvs = [
  {
    full_name: 'Nikola Dragicevic',
    email: 'dragicevic.nikola9898@yahoo.com',
    city: 'Stockholm',
    location_city: 'Bålsta',
    phone: '+46761723473',
    entry_mode: 'manual_entry',
    intent: 'show_multiple_tracks',
    seniority_level: 'mid',
    primary_occupation_field: ['Data/IT', 'Installation, drift, underhåll'],
    occupation_field_candidates: ['Data/IT', 'Installation, drift, underhåll', 'Industriell tillverkning'],
    occupation_group_candidates: [
      'Mjukvaru- och systemutvecklare m.fl.',
      'Systemanalytiker och IT-arkitekter m.fl.',
      'Underhållsmekaniker och maskinreparatörer',
      'Drifttekniker vid värme- och vattenverk'
    ],
    category_tags: [
      'Mjukvaru- och systemutvecklare m.fl.',
      'Systemanalytiker och IT-arkitekter m.fl.',
      'Underhållsmekaniker och maskinreparatörer',
      'Drifttekniker vid värme- och vattenverk'
    ],
    occupation_targets: ['Mjukvaru- och systemutvecklare m.fl.', 'Systemanalytiker och IT-arkitekter m.fl.'],
    persona_past_1_text: 'Airplane technician at Norwegian Air (2019-2020), safety inspections, fault detection, compliance with regulations at Arlanda.',
    persona_past_2_text: 'Automation technician at CEVA Logistics (2020-2023), repair, maintenance, troubleshooting, calibration of parcel and pocket sorting systems.',
    persona_past_3_text: 'Control Room Operator at Witron (2023-present), incident handling, production flow control, warehouse inbound control, reporting and statistics.',
    persona_current_text: 'Control room operator and automation technician with logistics and industrial systems background. Operates and troubleshoots advanced warehouse automation, coordinates teams during incidents, and manages operational data.',
    persona_target_text: 'Java system developer / backend developer working with Java, SQL, distributed systems, APIs, and enterprise applications.',
    skills_text: 'Java, Oracle JDK, Eclipse IDE, object-oriented programming, concurrency, Java sockets, JDBC, SQL, data modeling, Swing, JavaFX, client-server architecture, Waterfall, Kanban, Scrum, SOA, Java EE, Jakarta EE, EJB, JPA/JTA, Dynamic Web Application modules, JAX-WS, JAX-RS, WebSockets, troubleshooting, automation systems, operations control, reporting, statistical analysis.',
    education_certifications_text: 'Yrkeshögskola: Systemutvecklare Java, Yrkes Akademin, Sundsvall (distans), 2022-2024. Gymnasium: Flygplanstekniker, Arlandagymnasiet, 2016-2019.',
    must_have_constraints: { test_profile: true, source: 'manual_seed_cv_2026_02_27' },
    candidate_text_vector: 'Nikola Dragicevic. Stockholm/Bålsta. Java systemutvecklare med erfarenhet av Java enterprise, SQL, distribuerade system, samt automation/logistik. Yrkeserfarenhet: Witron kontrollrum, CEVA automationstekniker, Norwegian Air flygtekniker. Utbildning: YH Systemutvecklare Java.'
  },
  {
    full_name: 'Rickard Granudd',
    email: 'granuddr@gmail.com',
    city: 'Sundbyberg',
    location_city: 'Sundbyberg',
    phone: '+46706662279',
    entry_mode: 'manual_entry',
    intent: 'match_current_role',
    seniority_level: 'senior',
    primary_occupation_field: ['Installation, drift, underhåll'],
    occupation_field_candidates: ['Installation, drift, underhåll', 'Bygg och anläggning'],
    occupation_group_candidates: [
      'Installations- och serviceelektriker',
      'Distributionselektriker',
      'Industrielektriker',
      'Elektronikreparatörer och kommunikationselektriker m.fl.'
    ],
    category_tags: [
      'Installations- och serviceelektriker',
      'Distributionselektriker',
      'Industrielektriker',
      'Elektronikreparatörer och kommunikationselektriker m.fl.'
    ],
    occupation_targets: ['Installations- och serviceelektriker'],
    persona_past_1_text: 'Electrician apprentice/early role at Vanadis EL (1985-1990), practical wiring, schematic reading, troubleshooting support, safety procedures.',
    persona_past_2_text: 'Electrician across multiple employers (1990-2024), installations, maintenance, fault diagnostics, upgrades in residential and commercial properties.',
    persona_past_3_text: 'Senior electrician at eLinked (2024-present), installation, service and troubleshooting with full responsibility for quality, safety and documentation.',
    persona_current_text: 'Senior electrician with 35+ years of experience in installation, service, maintenance and troubleshooting for homes and commercial properties. Strong compliance with safety regulations and electrical standards.',
    persona_target_text: 'Continue in senior electrician / service electrician roles with high safety responsibility and complex troubleshooting assignments.',
    skills_text: 'Electrical installations, troubleshooting, maintenance, service, upgrades, electrical drawings and schematics, technical documentation, Elsäkerhetsverket compliance, risk assessment, collaboration with contractors and customers, quality assurance, independent field work, safety protocols, communication.',
    education_certifications_text: 'Gymnasium: El och Tele, Märsta (1985). Allmän behörighet (1992). Certifications/permits: Liftkort, Första Hjälpen/HLR, ID06, Körkort B.',
    must_have_constraints: { test_profile: true, source: 'manual_seed_cv_2026_02_27' },
    candidate_text_vector: 'Rickard Granudd. Sundbyberg. Senior elektriker med 35+ års erfarenhet av elinstallation, service, felsökning och underhåll i bostäder och kommersiella fastigheter. Behörigheter: Allmän behörighet, ID06, HLR, liftkort.'
  }
];

async function upsertByEmail(profile) {
  const { data: existing, error: selErr } = await supabase
    .from('candidate_profiles')
    .select('id,email,created_at')
    .eq('email', profile.email)
    .limit(1)
    .maybeSingle();

  if (selErr) {
    throw new Error(`Select failed for ${profile.email}: ${selErr.message}`);
  }

  const payload = {
    ...profile,
    profile_vector: null,
    persona_current_vector: null,
    persona_target_vector: null,
    persona_past_1_vector: null,
    persona_past_2_vector: null,
    persona_past_3_vector: null,
    wish_vector: null,
    last_match_time: null
  };

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('candidate_profiles')
      .update(payload)
      .eq('id', existing.id);

    if (updErr) {
      throw new Error(`Update failed for ${profile.email}: ${updErr.message}`);
    }

    return { action: 'updated', email: profile.email, id: existing.id };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('candidate_profiles')
    .insert(payload)
    .select('id,email')
    .single();

  if (insErr) {
    throw new Error(`Insert failed for ${profile.email}: ${insErr.message}`);
  }

  return { action: 'inserted', email: profile.email, id: inserted.id };
}

(async () => {
  try {
    const results = [];
    for (const profile of cvs) {
      results.push(await upsertByEmail(profile));
    }

    const emails = cvs.map((c) => c.email);
    const { data: verify, error: verifyErr } = await supabase
      .from('candidate_profiles')
      .select('id,full_name,email,city,entry_mode,intent,seniority_level,primary_occupation_field,occupation_group_candidates')
      .in('email', emails)
      .order('email', { ascending: true });

    if (verifyErr) {
      throw new Error(`Verification failed: ${verifyErr.message}`);
    }

    console.log(JSON.stringify({ ok: true, results, verify }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
