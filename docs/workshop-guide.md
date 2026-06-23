# Workshop Guide — Meeting Bingo Demo

A presenter's playbook for running this demo in a live workshop on agentic AI.

---

## What this demo shows

A single structured-output call to Claude that does semantic matching — not keyword search. Claude reads the meeting transcript and decides whether the *idea* behind each cliché was expressed, even if different words were used. That's the point worth emphasising: the model is reasoning about meaning, not scanning for strings.

This intentionally is NOT a multi-step agentic loop. It's the simplest interesting building block — one prompt, one structured response — which makes it a good contrast to introduce before showing more complex agent patterns.

---

## Setup checklist (do before the workshop)

- [ ] `ANTHROPIC_API_KEY` is set in `backend/.env`.
- [ ] Server is running: `cd backend && uvicorn main:app --reload`.
- [ ] Browser tab open at `http://localhost:8000`.
- [ ] Run the rehearsal checklist in `README.md` against the actual transcript you'll use live.
- [ ] Note roughly how long the Claude call takes on your connection (typically 5–15 s for a short transcript).

---

## Suggested demo script

### 1. Show the blank card (30 s)
Open the app. Point out the 5×5 grid of meeting clichés. Mention the card reshuffles every time — the phrases are fixed but the layout isn't.

### 2. Paste a paraphrased transcript (1 min)
Use a transcript that contains the *ideas* without the exact words. Good examples:

| Cliché on the card | Paraphrase to read aloud |
|--------------------|--------------------------|
| "circle back" | "Let's pick this up again after the standup." |
| "move the needle" | "We need to make some real progress here." |
| "bandwidth" | "I don't have capacity to take that on right now." |
| "low-hanging fruit" | "What's the easiest thing we can ship first?" |
| "on the same page" | "I want to make sure we're all aligned." |

Emphasise before clicking: *"I didn't use any of the exact phrases — let's see if Claude figures it out."*

### 3. Click "Check Bingo" (or Ctrl/Cmd+Enter)
While the spinner is running, explain what's happening: one API call, a prompt listing all 25 phrases, Claude returning a JSON object with matched/evidence for each.

### 4. Walk through the results
- Click a matched (green) square to show the evidence quote.
- Point to an unmatched square and explain why — the idea wasn't there, not just the word.
- If bingo fires, show the highlighted winning line.

### 5. Show the raw API response (optional, 1 min)
Open browser DevTools → Network → the `/api/check` request. Show the JSON. Paste the `output_config` field in `bingo.py` (`CHECK_RESULT_SCHEMA`) alongside it — this is what drove that shape.

---

## Talking points

**"Why not just use regex or string search?"**
String search would miss "let's pick this up later" as "circle back". The value is that the model understands language, not patterns.

**"Is this actually agentic?"**
Not in the full sense — no tool calls, no multi-step loop, no memory. It's a single reasoning call. That's intentional: it's the foundation. A true agentic version might search the transcript in steps, look up context from past meetings, or take action.

**"How does the JSON schema work?"**
`output_config.format` with a JSON schema constrains Claude's output to a specific structure. The model still reasons freely; it just has to express its answer in that shape. This is how you make LLM output machine-readable without fragile parsing.

**"What if Claude gets it wrong?"**
It will sometimes. That's part of the demo — semantic matching is probabilistic. You can show a disagreement and discuss how you'd improve the prompt, add examples, or add a confidence field.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "ANTHROPIC_API_KEY is not set" on startup | Missing `.env` | `cp .env.example .env` and add your key |
| 502 on check | API key invalid or network issue | Check key and connectivity |
| 429 on check | >10 requests in a minute from your IP | Wait 60 s |
| Squares don't light up after check | JS error or network fail | Open DevTools console |
| Card reshuffled on refresh | `sessionStorage` cleared (private window?) | Normal in private/incognito mode |
