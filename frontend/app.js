'use strict';

const STORAGE_KEY = 'meeting-bingo-voice';

let card = [];
let matched = new Set();
let winningLine = null;
let finalTranscript = '';
let isListening = false;

const gridEl        = document.getElementById('grid');
const micBtn        = document.getElementById('mic-btn');
const micLabel      = document.getElementById('mic-label');
const statusEl      = document.getElementById('status');
const bingoBanner   = document.getElementById('bingo-banner');
const newCardBtn    = document.getElementById('new-card-btn');
const finalTextEl   = document.getElementById('final-text');
const interimTextEl = document.getElementById('interim-text');
const transcriptEl  = document.getElementById('transcript-display');
const clearBtn      = document.getElementById('clear-btn');

// ── Speech Recognition ────────────────────────────────────────────────────────

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SR) {
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    finalTextEl.textContent   = finalTranscript;
    interimTextEl.textContent = interim;
    transcriptEl.scrollTop    = transcriptEl.scrollHeight;

    // Instant match — runs on every interim update, no debounce
    matchPhrases(finalTranscript + ' ' + interim);
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech') return;
    if (event.error === 'not-allowed') {
      setStatus('Microphone access denied.', 'error');
      setListening(false);
    } else {
      setStatus('Mic error: ' + event.error, 'error');
    }
  };

  recognition.onend = () => {
    interimTextEl.textContent = '';
    if (isListening) {
      try { recognition.start(); } catch (_) {}
    }
  };
} else {
  micBtn.disabled = true;
  setStatus('Speech recognition not supported — try Chrome or Edge.', 'error');
}

// ── Instant phrase matching ───────────────────────────────────────────────────

function matchPhrases(text) {
  const lower = text.toLowerCase();
  const prevMatched = new Set(matched);

  card.forEach(phrase => {
    if (!matched.has(phrase) && lower.includes(phrase.toLowerCase())) {
      matched.add(phrase);
    }
  });

  const hasNew = matched.size > prevMatched.size;
  if (!hasNew) return;

  updateGrid(prevMatched);

  if (!winningLine) {
    winningLine = findWinningLine();
    if (winningLine) {
      bingoBanner.className = 'banner-visible';
      setStatus('BINGO!', 'bingo');
      updateGrid(prevMatched);
    }
  }

  saveState();
}

function findWinningLine() {
  const N = 5;
  const grid = Array.from({ length: N }, (_, r) => card.slice(r * N, (r + 1) * N));
  const lines = [
    ...grid,
    ...Array.from({ length: N }, (_, c) => grid.map(r => r[c])),
    grid.map((r, i) => r[i]),
    grid.map((r, i) => r[N - 1 - i]),
  ];
  return lines.find(line => line.every(p => matched.has(p))) || null;
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function buildGrid() {
  gridEl.innerHTML = '';
  card.forEach(phrase => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = phrase;
    gridEl.appendChild(cell);
  });
}

function updateGrid(prevMatched = null) {
  gridEl.querySelectorAll('.cell').forEach((cell, i) => {
    const phrase = card[i];
    const isMatched = matched.has(phrase);
    const isWinner  = winningLine && winningLine.includes(phrase);
    const isNew     = prevMatched && isMatched && !prevMatched.has(phrase);

    cell.classList.toggle('matched', isMatched);
    cell.classList.toggle('winner', isWinner);

    if (isNew) {
      cell.classList.remove('new-match');
      void cell.offsetWidth; // force reflow to restart animation
      cell.classList.add('new-match');
      setTimeout(() => cell.classList.remove('new-match'), 600);
    }
  });
}

// ── Listening control ─────────────────────────────────────────────────────────

function setListening(active) {
  isListening = active;
  micBtn.classList.toggle('listening', active);
  micLabel.textContent = active ? 'Stop Listening' : 'Start Listening';
  micBtn.setAttribute('aria-label', active ? 'Stop listening' : 'Start listening');

  if (active) {
    setStatus('Listening…', 'listening');
    try { recognition.start(); } catch (_) {}
  } else {
    try { recognition.stop(); } catch (_) {}
    if (!winningLine) setStatus('', '');
  }
}

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

// ── Card ──────────────────────────────────────────────────────────────────────

async function fetchCard() {
  setStatus('Loading…', '');
  try {
    const res = await fetch('/api/card');
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    card            = data.phrases;
    matched         = new Set();
    winningLine     = null;
    finalTranscript = '';
    finalTextEl.textContent   = '';
    interimTextEl.textContent = '';
    bingoBanner.className = 'banner-hidden';
    buildGrid();
    updateGrid();
    setStatus('', '');
    saveState();
  } catch (e) {
    setStatus('Failed to load card: ' + e.message, 'error');
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      card, matched: [...matched], winningLine, transcript: finalTranscript,
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.card) && s.card.length === 25) {
      card            = s.card;
      matched         = new Set(s.matched || []);
      winningLine     = s.winningLine || null;
      finalTranscript = s.transcript || '';
      finalTextEl.textContent = finalTranscript;
      buildGrid();
      updateGrid();
      if (winningLine) bingoBanner.className = 'banner-visible';
      return true;
    }
  } catch (_) {}
  return false;
}

// ── Events ────────────────────────────────────────────────────────────────────

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  setListening(!isListening);
});

newCardBtn.addEventListener('click', () => {
  if (isListening) setListening(false);
  sessionStorage.removeItem(STORAGE_KEY);
  fetchCard();
});

clearBtn.addEventListener('click', () => {
  finalTranscript = '';
  finalTextEl.textContent   = '';
  interimTextEl.textContent = '';
});

// ── Init ──────────────────────────────────────────────────────────────────────

if (!loadState()) fetchCard();
