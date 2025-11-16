# scripts/create_candidate_profile.py

"""
This script is NOT used for embedding.
Its job is to convert quiz + CV text into a descriptive paragraph,
which is then sent to the embedding script later.
"""

from typing import Dict

def create_candidate_prompt(data: Dict) -> str:
    out = []

    # Intro block
    out.append(f"Full Name: {data.get('full_name')}\nEmail: {data.get('email')}")
    out.append("---")

    # Quiz answers
    quiz = data.get("quiz_answers", {})
    for section, answer in quiz.items():
        if isinstance(answer, list):
            formatted = ", ".join(answer)
        else:
            formatted = str(answer)
        out.append(f"{section}: {formatted}")

    # Optional extra info
    if data.get("additional_info"):
        out.append("---")
        out.append("Extra info:")
        out.append(data["additional_info"])

    return "\n".join(out)

# Example usage:
if __name__ == "__main__":
    dummy = {
        "full_name": "Nikola Dragicevic",
        "email": "nikola@example.com",
        "quiz_answers": {
            "Job Archetypes": ["The Analyst & Thinker", "The Organizer & Planner"],
            "Pace": "Fast-Paced & Dynamic",
            "Structure": "Flexible & Spontaneous",
            "Values": ["Learning & Growth", "Work-Life Balance"]
        },
        "additional_info": "Looking for jobs in logistics or AI. Prefer remote work."
    }

    text = create_candidate_prompt(dummy)
    print(text)
