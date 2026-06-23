const gridEl = document.getElementById("grid");
const transcriptEl = document.getElementById("transcript");
const checkBtn = document.getElementById("check-btn");
const statusEl = document.getElementById("status");
const bannerEl = document.getElementById("bingo-banner");
const evidenceEl = document.getElementById("evidence");
const newCardBtn = document.getElementById("new-card-btn");

let currentPhrases = [];

const STORAGE_KEY = "meeting-bingo-state";

function saveState() {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ phrases: currentPhrases, transcript: transcriptEl.value })
  );
}

function loadStoredState() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function renderGrid(phrases, matchedSet = new Set(), evidenceMap = new Map()) {
  gridEl.innerHTML = "";
  phrases.forEach((phrase) => {
    const square = document.createElement("div");
    const matched = matchedSet.has(phrase);
    square.className = "square" + (matched ? " matched" : "");
    square.textContent = matched ? `✓ ${phrase}` : phrase;
    if (matched && evidenceMap.has(phrase)) {
      square.tabIndex = 0;
      square.setAttribute("role", "button");
      square.setAttribute("aria-label", `${phrase}, matched. Press to view evidence.`);
      const evidence = evidenceMap.get(phrase);
      const showEvidence = () => {
        evidenceEl.textContent = evidence;
        evidenceEl.classList.remove("hidden");
      };
      square.addEventListener("click", showEvidence);
      square.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showEvidence();
        }
      });
    }
    gridEl.appendChild(square);
  });
}

async function loadCard({ forceNew = false } = {}) {
  if (!forceNew) {
    const stored = loadStoredState();
    if (stored?.phrases?.length) {
      currentPhrases = stored.phrases;
      transcriptEl.value = stored.transcript || "";
      renderGrid(currentPhrases);
      statusEl.textContent = "";
      return;
    }
  }

  statusEl.textContent = "Loading card...";
  try {
    const res = await fetch("/api/card");
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    const data = await res.json();
    currentPhrases = data.phrases;
    renderGrid(currentPhrases);
    statusEl.textContent = "";
    saveState();
  } catch (err) {
    statusEl.textContent = `Couldn't load the card: ${err.message}. Refresh to retry.`;
  }
}

async function checkBingo() {
  const transcript = transcriptEl.value.trim();
  if (!transcript) {
    statusEl.textContent = "Paste a transcript first.";
    return;
  }

  checkBtn.disabled = true;
  statusEl.textContent = "Checking transcript...";
  statusEl.classList.add("loading");
  bannerEl.classList.add("banner-hidden");
  evidenceEl.classList.add("hidden");

  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, phrases: currentPhrases }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.detail || `Request failed: ${res.status}`);
    }

    const data = await res.json();
    const matchedSet = new Set(
      data.results.filter((r) => r.matched).map((r) => r.phrase)
    );
    const evidenceMap = new Map(
      data.results.filter((r) => r.matched && r.evidence).map((r) => [r.phrase, r.evidence])
    );

    renderGrid(currentPhrases, matchedSet, evidenceMap);
    saveState();

    const matchedCount = matchedSet.size;
    statusEl.textContent = `${matchedCount} of ${currentPhrases.length} phrases matched.`;

    if (data.bingo) {
      bannerEl.classList.remove("banner-hidden");
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    checkBtn.disabled = false;
    statusEl.classList.remove("loading");
  }
}

checkBtn.addEventListener("click", checkBingo);
newCardBtn.addEventListener("click", () => {
  bannerEl.classList.add("banner-hidden");
  evidenceEl.classList.add("hidden");
  statusEl.textContent = "";
  sessionStorage.removeItem(STORAGE_KEY);
  loadCard({ forceNew: true });
});
loadCard();
