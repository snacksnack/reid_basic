// RC1-478: the committed projects-prompt.txt must stay current with the
// project TS data files it is rendered from — the chatbot indexes the txt,
// the site renders the TS, and they must never tell different stories.
// On failure: `npm run extract:projects` and commit the result.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_SLUG, PROJECTS, renderProjectsPrompt } from '../src/data/projectsPrompt'

const committed = readFileSync(join(__dirname, '..', 'src', 'data', 'projects-prompt.txt'), 'utf8')

describe('projects-prompt.txt freshness', () => {
  it('matches a fresh render of the project data files', () => {
    expect(committed).toBe(renderProjectsPrompt())
  })

  it('covers every project with an overview paragraph', () => {
    for (const { slug, content } of PROJECTS) {
      expect(committed).toContain(`Project: ${content.name} [${slug}]`)
    }
  })

  it('keeps every paragraph self-contained under a Project header', () => {
    const paragraphs = committed.split('\n\n').filter((p) => p.trim())
    for (const p of paragraphs) {
      expect(p.split('\n')[0]).toMatch(/^Project: .+ \[[a-z0-9-]+\]$/)
    }
  })

  it('opens with a catalog paragraph naming every project (RC1-479)', () => {
    const catalog = committed.split('\n\n')[0]
    expect(catalog.split('\n')[0]).toContain(`[${CATALOG_SLUG}]`)
    for (const { content } of PROJECTS) {
      expect(catalog).toContain(String(content.name))
    }
  })

  it('reserves the catalog slug — no project may claim it', () => {
    for (const { slug } of PROJECTS) {
      expect(slug).not.toBe(CATALOG_SLUG)
    }
  })
})
