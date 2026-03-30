// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('Build', () => {
  it('TypeScript compiles without errors', () => {
    expect(() => {
      execSync('npx tsc --noEmit', { stdio: 'pipe' })
    }).not.toThrow()
  }, 30_000)

  it('ESLint passes', () => {
    expect(() => {
      execSync('npx eslint .', { stdio: 'pipe' })
    }).not.toThrow()
  }, 30_000)
})
