from job_contact_extractor import extract_job_contact_data


def run_case(name: str, description_text: str, webpage_url: str | None = None, source_snapshot: dict | None = None):
    result = extract_job_contact_data(
        description_text=description_text,
        webpage_url=webpage_url,
        source_snapshot=source_snapshot or {},
    )
    print(f"\n[{name}]")
    print(result)


if __name__ == "__main__":
    run_case(
        "brogrillen_direct_email",
        description_text=(
            "Sista ansökningsdag: 6 april (om 3 dagar)\n"
            "Ange referens: Brogrillen Norr i din ansökan\n"
            "Ansök via mail:brogrillenibro@gmail.com"
        ),
        webpage_url="https://arbetsformedlingen.se/platsbanken/annonser/example",
    )

    run_case(
        "nested_snapshot_email",
        description_text="Kassa- & kökspersonal sökes",
        webpage_url="https://arbetsformedlingen.se/platsbanken/annonser/example",
        source_snapshot={
            "description": {"text": "Ansök via e-post till jobb@example.se"},
            "links": {"apply": "https://arbetsformedlingen.se/platsbanken/annonser/example"},
        },
    )

    run_case(
        "mailto_application_url",
        description_text="Skicka din ansökan idag.",
        webpage_url="mailto:apply@example.se",
        source_snapshot={},
    )

    run_case(
        "contact_block_email",
        description_text=(
            "Kontakt\n"
            "Rickard Linder, Plastchef\n"
            "richard.linder@ramudden.se\n"
            "070 378 62 88"
        ),
        webpage_url="https://arbetsformedlingen.se/platsbanken/annonser/example",
        source_snapshot={},
    )
