# meeting-bingo
workshop for agentic ai

A small agentic AI demo: paste a meeting transcript, and Claude reads it and marks off a bingo card of meeting cliches based on whether each phrase's *idea* was expressed (paraphrases count, not just literal string matches).

Under the hood this is intentionally the simplest building block: one structured-output call to Claude per check, no multi-step tool-use loop. It's a good first example to contrast against a true agentic loop in the rest of the workshop.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the design.

## Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

Open http://localhost:8000 in a browser.

## Cost note

Each "Check Bingo" click is one Claude API call (model: Opus 4.8) sized to your transcript length plus a fixed 25-phrase prompt. Budget a few cents per check if you plan to rehearse the demo many times before a workshop.
