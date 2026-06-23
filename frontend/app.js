'use strict';

const STORAGE_KEY = 'meeting-bingo-voice';
const DEBOUNCE_MS = 3000;
const PERIODIC_MS = 20000;

let card = [];
let matched = new Set();
let evidenceMap = {};
let winningLine = null;
let finalTranscript = '';
let lastCheckedLength = 0;
let isListening = false;
let isChecking = false;
let debounceTimer = null;
let periodicTimer = null;

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
    finalTextEl.textContent = finalTranscript;
    interimTextEl.textContent = interim;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    scheduleCheck();
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

// ── Check logic ───────────────────────────────────────────────────────────────

function scheduleCheck() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runCheck, DEBOUNCE_MS);
}

async function runCheck() {
  if (isChecking || winningLine) return;
  if (finalTranscript.length <= lastCheckedLength || !finalTranscript.trim()) return;

  isChecking = true;
  setStatus('Checking…', 'checking');

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: finalTranscript, phrases: card }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: 'Request failed' }));
      setStatus(body.detail || 'Check failed', 'error');
      return;
    }

    const data = await res.json();
    lastCheckedLength = finalTranscript.length;

    const prevMatched = new Set(matched);
    data.results.forEach(r => {
      if (r.matched) {
        matched.add(r.phrase);
        if (r.evidence) evidenceMap[r.phrase] = r.evidence;
      }
    });

    if (data.bingo && data.winning_line) {
      winningLine = data.winning_line;
      bingoBanner.className = 'banner-visible';
      setStatus('BINGO!', 'bingo');
      clearInterval(periodicTimer);
    } else {
      setStatus(isListening ? 'Listening…' : '', isListening ? 'listening' : '');
    }

    updateGrid(prevMatched);
    saveState();
  } catch (e) {
    setStatus('Error: ' + e.message, 'error');
  } finally {
    isChecking = false;
  }
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
  const cells = gridEl.querySelectorAll('.cell');
  cells.forEach((cell, i) => {
    const phrase = card[i];
    const isMatched = matched.has(phrase);
    const isWinner  = winningLine && winningLine.includes(phrase);
    const isNew     = prevMatched && isMatched && !prevMatched.has(phrase);

    cell.classList.toggle('matched', isMatched);
    cell.classList.toggle('winner',  isWinner);
    cell.title = evidenceMap[phrase] || '';

    if (isNew) {
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
    periodicTimer = setInterval(runCheck, PERIODIC_MS);
    try { recognition.start(); } catch (_) {}
  } else {
    clearInterval(periodicTimer);
    clearTimeout(debounceTimer);
    try { recognition.stop(); } catch (_) {}
    if (finalTranscript.length > lastCheckedLength) runCheck();
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
    if (!res.ok) throw new Error('Failed to fetch card');
    const data = await res.json();
    card         = data.phrases;
    matched      = new Set();
    evidenceMap  = {};
    winningLine  = null;
    finalTranscript   = '';
    lastCheckedLength = 0;
    finalTextEl.textContent   = '';
    interimTextEl.textContent = '';
    bingoBanner.className = 'banner-hidden';
    buildGrid();
    updateGrid();
    setStatus('', '');
    saveState();
  } catch (e) {
    setStatus('Failed to load card.', 'error');
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      card, matched: [...matched], evidenceMap, winningLine,
      transcript: finalTranscript,
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.card) && s.card.length === 25) {
      card         = s.card;
      matched      = new Set(s.matched || []);
      evidenceMap  = s.evidenceMap || {};
      winningLine  = s.winningLine || null;
      finalTranscript   = s.transcript || '';
      lastCheckedLength = finalTranscript.length;
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
  finalTranscript   = '';
  lastCheckedLength = 0;
  finalTextEl.textContent   = '';
  interimTextEl.textContent = '';
});

// ── Init ──────────────────────────────────────────────────────────────────────

if (!loadState()) fetchCard();
