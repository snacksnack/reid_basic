// Writes src/data/projects-prompt.txt from the project TS data files
// (RC1-478). Run via `npm run extract:projects` whenever a project file
// changes; tests/projectsPrompt.test.ts fails when the committed text is
// stale, so CI catches a forgotten regeneration.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderProjectsPrompt } from '../src/data/projectsPrompt'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'projects-prompt.txt')
writeFileSync(out, renderProjectsPrompt())
console.log(`wrote ${out}`)
