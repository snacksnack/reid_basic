---
name: deploy-troubleshooting
description: >-
  Diagnose a failed or broken deploy of the reid_basic site (hihelloreid.com). Use
  when the user reports a deploy failure, a red CI run, a Heroku build error, the
  site being down after a deploy, or a partial breakage (chatbot not answering,
  downloads failing). Walks from identifying the failure stage through gathering
  evidence to the known fixes. The Heroku app is `hihelloreid`.
---

# Deploy troubleshooting (reid_basic)

The site deploys to Heroku (app `hihelloreid`) when CI passes on `main`. Work the
stages in order; stop at the first one that explains the symptom.

## 1. Identify the failure point

- **CI failed** (GitHub Actions): tests or type/lint checks did not pass.
- **Heroku build failed**: the app did not build on Heroku.
- **App crashes after deploy**: build succeeded but the site is down.
- **Site up, something specific broken**: partial breakage (chatbot, downloads).

## 2. Gather evidence

The Heroku app name is `hihelloreid`.

| Check | Command |
|---|---|
| CI status | `gh run list --limit 5` |
| CI failure details | `gh run view <run-id> --log-failed` |
| Heroku build logs | `heroku builds --app hihelloreid` |
| Heroku app logs | `heroku logs --tail --app hihelloreid` |
| Heroku app status | `heroku ps --app hihelloreid` |
| Heroku config vars | `heroku config --app hihelloreid` |
| Heroku buildpacks | `heroku buildpacks --app hihelloreid` |
| Local frontend tests | `npm test` |
| Local server tests | `pytest tests/test_server.py -v` |
| Local build | `npm run build` |

## 3. Common issues and fixes

### CI failures
- TypeScript errors: `npx tsc --noEmit` locally, fix the types.
- ESLint errors: `npx eslint .` locally, fix the lint.
- Frontend test failures: `npm test` locally, read the output.
- Server test failures: `pytest tests/test_server.py -v` locally, read the output.

### Heroku build failures
- Missing Python dependency: confirm `requirements.txt` has it.
- Missing Node dependency: a package in `devDependencies` but needed at build time
  must move to `dependencies` (or be used only in the build step).
- Build script error: the Node buildpack runs `npm run build` (`tsc -b && vite build`);
  run it locally to reproduce.
- Buildpack order: Node must run before Python. `heroku buildpacks --app hihelloreid`
  should list `heroku/nodejs` then `heroku/python`.
- Python version: `runtime.txt` must specify a supported version.

### App crashes after deploy
- Missing env var: compare `heroku config --app hihelloreid` against required vars.
  Required: `OPENAI_API_KEY`, `FLASK_ENV=production`. Optional: `DATABASE_URL`
  (auto-set by Heroku Postgres), `SENDGRID_USERNAME`, `SENDGRID_PASSWORD`,
  `DIGEST_EMAIL`, `SCHEDULING_URL`.
- Port binding: Gunicorn binds `$PORT` (Heroku sets it). Confirm with
  `heroku logs --app hihelloreid | grep "Listening"`.
- File not found: the Procfile runs `gunicorn app:app`; Flask serves static files
  from `dist/` in production. Confirm the build: `heroku run ls dist/ --app hihelloreid`.
- Import error: a package missing from `requirements.txt`; check the logs for
  `ModuleNotFoundError`.

### Site up, chatbot broken
- OpenAI key expired or invalid: `heroku config:get OPENAI_API_KEY --app hihelloreid`.
- Rate limited: check logs for "Too many requests".
- `resume-prompt.txt` missing: Flask loads `src/data/resume-prompt.txt` at startup;
  confirm it exists and is committed.

### Site up, downloads broken
- Files missing from `dist/`: confirm `public/docs/reidcollins.pdf` and
  `reidcollins.docx` are committed; Vite copies `public/` to `dist/` on build.

## 4. Verify the fix

- `npm test` and `pytest tests/test_server.py -v` locally.
- Push and confirm CI is green at https://github.com/snacksnack/reid_basic/actions.
- Check logs after deploy: `heroku logs --tail --app hihelloreid`.
