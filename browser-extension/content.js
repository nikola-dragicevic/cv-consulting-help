function normalize(value) {
  return (value || "").toString().trim().toLowerCase();
}

function textAroundElement(element) {
  const attrs = [
    element.name,
    element.id,
    element.placeholder,
    element.getAttribute("aria-label"),
    element.getAttribute("autocomplete"),
  ]
    .filter(Boolean)
    .join(" ");

  const label = element.id
    ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent || ""
    : "";

  const wrapperText = element.closest("label, div, section, form")?.textContent || "";
  return normalize([attrs, label, wrapperText].join(" "));
}

function setFieldValue(element, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(element.__proto__, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function pickBestField(elements, keywords) {
  const scored = elements
    .map((element) => {
      const haystack = textAroundElement(element);
      const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
      return { element, score, haystack };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.element || null;
}

function getInputs() {
  return Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => !el.disabled && el.type !== "hidden");
}

function getFillTargets() {
  const elements = getInputs();
  return {
    firstName: pickBestField(elements, ["first name", "firstname", "förnamn", "given-name"]),
    lastName: pickBestField(elements, ["last name", "lastname", "surname", "efternamn", "family-name"]),
    fullName: pickBestField(elements, ["full name", "name", "namn"]),
    email: pickBestField(elements, ["email", "e-post", "mail"]),
    phone: pickBestField(elements, ["phone", "telefon", "mobile", "tel"]),
    city: pickBestField(elements, ["city", "stad", "ort", "location"]),
    subject: pickBestField(elements, ["subject", "ämne", "rubrik"]),
    coverLetter: pickBestField(elements, ["cover letter", "personligt brev", "message", "motivation", "summary", "varför", "brev"]),
    cvUpload: pickBestField(elements, ["upload cv", "resume", "cv", "curriculum vitae", "ladda upp", "upload"]),
  };
}

async function fillFileInput(input, cv) {
  if (!input || !cv?.signedUrl) {
    return { ok: false, reason: "no_cv" };
  }

  try {
    const res = await fetch(cv.signedUrl, { credentials: "omit" });
    const blob = await res.blob();
    const filename = cv.filename || "cv.pdf";
    const file = new File([blob], filename, { type: blob.type || "application/pdf" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "upload_failed" };
  }
}

async function fillForm(profile) {
  const targets = getFillTargets();
  let filledCount = 0;

  if (targets.firstName && profile.firstName) {
    setFieldValue(targets.firstName, profile.firstName);
    filledCount += 1;
  }
  if (targets.lastName && profile.lastName) {
    setFieldValue(targets.lastName, profile.lastName);
    filledCount += 1;
  }
  if (targets.fullName && profile.fullName) {
    setFieldValue(targets.fullName, profile.fullName);
    filledCount += 1;
  }
  if (targets.email && profile.email) {
    setFieldValue(targets.email, profile.email);
    filledCount += 1;
  }
  if (targets.phone && profile.phone) {
    setFieldValue(targets.phone, profile.phone);
    filledCount += 1;
  }
  if (targets.city && profile.city) {
    setFieldValue(targets.city, profile.city);
    filledCount += 1;
  }
  if (targets.subject && profile.generatedApplicationSubject) {
    setFieldValue(targets.subject, profile.generatedApplicationSubject);
    filledCount += 1;
  }
  const applicationText = profile.generatedApplicationText || profile.generatedEmailText || "";
  if (targets.coverLetter && applicationText) {
    setFieldValue(targets.coverLetter, applicationText);
    filledCount += 1;
  }

  const uploadResult = await fillFileInput(targets.cvUpload, profile.cv);
  const uploadMessage = uploadResult.ok
    ? "CV uppladdat."
    : uploadResult.reason === "no_cv"
      ? "Inget CV hittades att ladda upp."
      : "CV kunde inte laddas upp automatiskt på denna sida.";

  return {
    ok: true,
    summary: `Fyllde ${filledCount} fält. ${uploadMessage}`,
  };
}

function scanForm() {
  const targets = getFillTargets();
  const found = Object.entries(targets)
    .filter(([, element]) => Boolean(element))
    .map(([key]) => key);

  return {
    ok: true,
    summary: found.length > 0
      ? `Hittade möjliga fält för: ${found.join(", ")}`
      : "Hittade inga tydliga ansökningsfält på sidan ännu.",
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JOBBNU_SCAN_FORM") {
    sendResponse(scanForm());
    return;
  }

  if (message?.type === "JOBBNU_FILL_FORM") {
    void fillForm(message.payload.profile)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "unknown_error" }));
    return true;
  }
});
