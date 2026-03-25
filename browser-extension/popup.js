const STATUS = document.getElementById("status");
const FILL_BUTTON = document.getElementById("fill-button");
const SCAN_BUTTON = document.getElementById("scan-button");

function setStatus(message) {
  STATUS.textContent = message;
}

function getAppBaseUrl() {
  return "https://jobbnu.se";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Ingen aktiv flik hittades.");
  }
  return tab;
}

async function fetchProfilePayload(pageUrl) {
  const query = pageUrl ? `?pageUrl=${encodeURIComponent(pageUrl)}` : "";
  const res = await fetch(`${getAppBaseUrl()}/api/apply/extension/profile${query}`, {
    method: "GET",
    credentials: "include",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) {
    throw new Error(json?.error || "Kunde inte hämta profil från JobbNu. Kontrollera att du är inloggad.");
  }

  return json.data;
}

async function sendMessageToTab(tabId, type, payload = {}) {
  return chrome.tabs.sendMessage(tabId, { type, payload });
}

async function scanPage() {
  const tab = await getActiveTab();
  const response = await sendMessageToTab(tab.id, "JOBBNU_SCAN_FORM");
  const summary = response?.summary || "Inga fält kunde identifieras ännu.";
  setStatus(summary);
}

async function fillPage() {
  try {
    setStatus("Hämtar profil från JobbNu...");
    const tab = await getActiveTab();
    const profile = await fetchProfilePayload(tab.url || "");
    if (profile?.matchedJob?.headline) {
      setStatus(`Matchade jobbet "${profile.matchedJob.headline}". Fyller formuläret...`);
    } else {
      setStatus("Ingen exakt jobbmatch hittades. Fyller basuppgifter och CV...");
    }
    const response = await sendMessageToTab(tab.id, "JOBBNU_FILL_FORM", { profile });
    if (response?.ok) {
      setStatus(response.summary || "Formuläret fylldes.");
      return;
    }
    throw new Error(response?.error || "Kunde inte fylla formuläret.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Okänt fel.");
  }
}

FILL_BUTTON.addEventListener("click", () => {
  void fillPage();
});

SCAN_BUTTON.addEventListener("click", () => {
  void scanPage();
});
