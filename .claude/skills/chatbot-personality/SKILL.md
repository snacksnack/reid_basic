---
name: chatbot-personality
description: >-
  Change the reid_basic site chatbot's tone, response style, or behavior. Use when
  the user wants the chatbot to act differently (more casual, a different greeting,
  add or remove a feature like /match, a new behavioral rule). Points at the right
  file so no app.py change is needed. Does NOT cover resume content the chatbot knows
  about (that is the update-resume skill).
---

# Chatbot personality (reid_basic)

The chatbot's system prompt is assembled by `app.py` at server startup from separate
text files. You change behavior by editing a text file, not `app.py`.

| File | Controls | How to change |
|---|---|---|
| `src/data/chatbot-instructions.txt` | Tone, response style, tool rules | Edit directly |
| `src/data/match-instructions.txt` | Role-fit (`/match`) accuracy and calibration; only sent on `/match` turns | Edit directly |
| `src/data/resume-prompt.txt` | Resume content the chatbot knows | Do NOT edit here; use the update-resume skill |

## To change chatbot behavior

1. Edit `src/data/chatbot-instructions.txt` (or `match-instructions.txt` for the
   `/match` feature).
2. Run `npm test` and `npm run test:server`.
3. Report what changed.

No code change is needed: `app.py` reloads these files into the system prompt on
restart (a Heroku deploy restarts the dyno).

Examples: "make the chatbot more casual", "remove the /match feature", "change the
greeting to ask about the visitor's role".
