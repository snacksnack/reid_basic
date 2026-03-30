# Testing & CI/CD

## Overview

The project uses **Vitest** for testing and **GitHub Actions** for continuous integration. Heroku is configured for automatic deploys from the `main` branch, gated on CI checks passing.

**Pipeline:** Push to `main` → GitHub Actions runs tests → Heroku deploys (if tests pass)

---

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch
```

---

## Test Suites

### Server API tests (`tests/server.test.ts`)

Tests the Express API endpoints without requiring external services (no OpenAI key, no Postgres).

| Endpoint | What's tested |
|----------|--------------|
| `POST /api/pageview` | Returns 204 on valid request |
| `POST /api/contact` | Rejects empty body (400), rejects missing fields (400), accepts valid submission (200) |
| `POST /api/chat` | Rejects empty messages array (400), rejects missing messages field (400) |
| `GET /api/download/:format` | Returns 404 with error for invalid format, recognizes valid formats |

The server exports the Express `app` without starting the listener when `NODE_ENV=test`, allowing `supertest` to make requests directly.

### Frontend component tests (`tests/app.test.tsx`)

Tests the `Resume` component renders correctly using `@testing-library/react`.

| Test | What's verified |
|------|----------------|
| Renders name and title | Core header content appears |
| Renders all major sections | Summary, Technical Skills, Experience, Education, Certifications |
| Renders contact information | Location and email displayed |
| Renders experience entries | Company name, role, and achievements |
| Renders contact button | "Contact Reid" button appears when callback provided |
| Renders download links | PDF and DOCX download links present |

### Build verification tests (`tests/build.test.ts`)

| Test | What's verified |
|------|----------------|
| TypeScript compiles | `tsc --noEmit` exits cleanly (catches type errors) |
| ESLint passes | `eslint .` exits cleanly (catches lint regressions) |

---

## GitHub Actions CI

**Workflow file:** `.github/workflows/ci.yml`

**Triggers:**
- Every push to `main`
- Every pull request targeting `main`

**What it does:**
1. Checks out the code
2. Sets up Node.js 20 with npm caching
3. Runs `npm ci` (clean install)
4. Runs `npm test` (all test suites)

If any test fails, the workflow fails and Heroku will not deploy.

---

## Heroku Automatic Deploys

Automatic deploys are configured in the Heroku Dashboard under the **Deploy** tab:

1. **Deploy method:** GitHub (connected to `snacksnack/reid_basic`)
2. **Branch:** `main`
3. **"Wait for GitHub checks to pass before deploy"** is enabled

This means every push to `main` follows this flow:
1. GitHub Actions CI runs all tests
2. If CI passes, Heroku automatically builds and deploys
3. If CI fails, Heroku skips the deploy

### Manual deploy

You can still trigger a manual deploy from the Heroku Dashboard if needed (e.g., after changing Heroku config vars that don't require a code change).

---

## Adding New Tests

Test files go in the `tests/` directory:
- `*.test.ts` for server/Node.js tests (add `// @vitest-environment node` at the top)
- `*.test.tsx` for React component tests (uses `jsdom` environment by default)

The test setup file (`tests/setup.ts`) provides:
- `@testing-library/jest-dom` matchers (e.g., `toBeInTheDocument()`)
- A mock `IntersectionObserver` for components that use it

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner (integrates with Vite) |
| `@testing-library/react` | React component testing utilities |
| `@testing-library/jest-dom` | DOM assertion matchers |
| `jsdom` | Browser environment simulation for component tests |
| `supertest` | HTTP assertions for Express endpoints |
| `@types/supertest` | TypeScript types for supertest |

All testing dependencies are in `devDependencies` and are not included in the production build.
