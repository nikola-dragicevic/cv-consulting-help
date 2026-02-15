For the **logic steps** (Categorization and Extraction), you need a **Generative local LLM** (like `llama3.2:3b`). You can run both on the same machine using **Ollama**.

Here is the complete **Granite Architecture Documentation** to complete your system.

---

# Documentation: The Granite Architecture

**A 4-Layer Hybrid System for High-Precision Job Matching**

This architecture is designed to be "granite-level" stable: it uses local LLMs for the heavy 50k job processing to keep costs at zero, and high-reasoning API models for the final "human-like" decision.

---

## Architecture Overview

| Layer | Step | Component | Model |
| --- | --- | --- | --- |
| **1. The Filter** | **Categorization** | Local Generative LLM | `llama3.2` (via Ollama) |
| **2. The Engine** | **Hybrid Search** | Postgres + pgvector | `nomic-embed-text` |
| **3. The Manager** | **Deep Matching** | Claude API (Haiku 3.5) | `claude-haiku-3.5` |
| **4. The Auditor** | **Gap Analysis** | Local Extraction | `llama3.2` (Auto-scraper) |

---

## Step 1: Intelligent CV Categorization (Local)

Instead of matching a CV to all 50,000 jobs, we first place the CV into the Arbetsförmedlingen taxonomy.

1. **Input:** Raw CV text.
2. **Action:** Send the CV text to your local Ollama instance.
3. **Prompt:** > "Using the Arbetsförmedlingen taxonomy(AllJobCategoriesAndSubCategories.md), identify the top 3-5 subcategory IDs that fit this CV. Return ONLY a JSON list of IDs. [Insert list from AllJobCategoriesAndSubcategories.md]"
4. **Result:** You get a clean list (e.g., `[123, 456]`). You will use these for "Boosting" in Step 2.

---

## Step 2: Weighted Hybrid Matching (SQL Logic)

Simple vector distance is often inaccurate because it ignores specific technical requirements. We will move from "Hard Filters" to **Weighted Scoring**.

**The Logic:**

* **Base Score:** Vector similarity (nomic-embed-text).
* **Keyword Bonus:** If a job description contains specific keywords from the CV (e.g., "React"), add points.
* **Category Bonus:** If the job’s `subcategory_id` matches the IDs from Step 1, add a **20% multiplier**.

**Why your distance matching is off:**
You likely have a `WHERE` clause that is too strict. If a category doesn't match perfectly, it returns 0.

* **Fix:** Use the categories to **Sort**, not to **Filter**.

---

## Step 3: The "Hiring Manager" Re-ranker (API)

This is where the system feels "smart" to the user. We only do this for the Top 20-50 results to save money.

1. **Action:** Take the Candidate Summary and the Job Description.
2. **Call:** Claude API (Haiku 3.5).
3. **Prompt:** > "Act as a Hiring Manager. On a scale of 1-10, how well does this candidate fit this specific job? Provide the score and a 1-sentence explanation of why."
4. **UI:** Display this "Manager's Opinion" on the job card. This provides instant value that vector search cannot.

---

## Step 4: Automated Skill Gap Analysis (The Scraper)

Since your jobs are scraped automatically, you need a "Worker" script(Check service.py in /scripts) that runs in the background to enrich the data.

1. **Background Worker:** As soon as a job is saved to the DB, send the description to Ollama.
2. **Extraction Prompt:**
> "Extract two JSON lists from this job description: 1. 'required_skills' (must-haves), 2. 'preferred_skills' (nice-to-haves). Output valid JSON only."


3. **Storage:** Save these into a `JSONB` column called `skills_data` in your `job_ads` table.
4. **Frontend Comparison:** When a user views a job, the frontend compares the `job.required_skills` against the `candidate.skills`.
* *Result:* "You are missing: **S7-PLC Programming** and **B-Körkort**."



---

## Implementation Checklist for the Developer

### 1. Data Enrichment (The Scraper)

* [ ] Add `skills_data` column (JSONB) to `job_ads`.
* [ ] Create a Python worker using `ollama` library.
* [ ] Run extraction on all 50k existing jobs (Estimated time: ~12-24 hours on a standard GPU).(Has to be done locally as server we run on does not have GPU, after that all upcoming jobs that are retrieved by API from arbetsförmedligen can be ran on servers CPU)

### 2. The Matching Query

* [ ] Rewrite the Supabase/Postgres function.
* [ ] **Change:** Remove `WHERE category = ANY(...)`.
* [ ] **Add:** `ORDER BY (vector_similarity * 0.8) + (category_match_bonus * 0.2)`.

### 3. The Frontend

* [ ] Add a "Match Insight" section to job results.
* [ ] Display the "Gap Analysis" by comparing the two JSON skill lists.

---

**Recommendation:**

1. Use `nomic-embed-text` for the **Vectors** (Layer 2).
2. Use `llama3.2:3b` for the **Categorization** and **Skill Extraction** (Layers 1 & 4).
3. Use **Claude API (Haiku 3.5)** for the **Final Decision** (Layer 3).

