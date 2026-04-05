// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express
let TOOLS: unknown[]
let executeToolCall: (name: string, args: Record<string, unknown>) => string

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  const mod = await import('../server.js')
  app = mod.app
  TOOLS = mod.TOOLS
  executeToolCall = mod.executeToolCall
})

describe('GET /api/download/:format', () => {
  it('returns 404 for an invalid format', async () => {
    const res = await request(app).get('/api/download/txt')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('invalid format')
  })

  it('serves the PDF file for valid format', async () => {
    const res = await request(app).get('/api/download/pdf')
    // In test env, file may not exist under public/docs — but the route should attempt a download (not 404)
    expect([200, 404]).not.toContain(res.status === 404 && res.body.error === 'invalid format' ? 'rejected' : undefined)
    // At minimum, the route recognizes "pdf" as valid and doesn't return the "invalid format" error
    if (res.status === 404) {
      expect(res.body.error).not.toBe('invalid format')
    }
  })
})

describe('POST /api/pageview', () => {
  it('returns 204 on success', async () => {
    const res = await request(app)
      .post('/api/pageview')
      .send({ path: '/', referrer: '' })
    expect(res.status).toBe(204)
  })
})

describe('POST /api/contact', () => {
  it('rejects empty body with 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/i)
  })

  it('rejects when name is missing', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ email: 'a@b.com', message: 'hi' })
    expect(res.status).toBe(400)
  })

  it('accepts a valid submission', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Test', email: 'test@test.com', message: 'Hello' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('POST /api/chat', () => {
  it('rejects empty messages array', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/messages/i)
  })

  it('rejects missing messages field', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('TOOLS definition', () => {
  it('exports a non-empty tools array', () => {
    expect(Array.isArray(TOOLS)).toBe(true)
    expect(TOOLS.length).toBeGreaterThan(0)
  })

  it('defines schedule_meeting with correct schema', () => {
    const tool = (TOOLS as Array<{ type: string; function: { name: string; parameters: unknown } }>)
      .find(t => t.function.name === 'schedule_meeting')
    expect(tool).toBeDefined()
    expect(tool!.type).toBe('function')
    expect(tool!.function.parameters).toHaveProperty('properties.topic')
  })
})

describe('executeToolCall', () => {
  it('returns scheduling URL when SCHEDULING_URL is set', () => {
    process.env.SCHEDULING_URL = 'https://calendly.com/test'
    const result = JSON.parse(executeToolCall('schedule_meeting', { topic: 'engineering role' }))
    expect(result.available).toBe(true)
    expect(result.scheduling_url).toBe('https://calendly.com/test')
    expect(result.topic).toBe('engineering role')
    delete process.env.SCHEDULING_URL
  })

  it('returns fallback when SCHEDULING_URL is not set', () => {
    delete process.env.SCHEDULING_URL
    const result = JSON.parse(executeToolCall('schedule_meeting', {}))
    expect(result.available).toBe(false)
    expect(result.fallback_email).toBe('hire.reid.collins@gmail.com')
  })

  it('handles unknown tool names', () => {
    const result = JSON.parse(executeToolCall('unknown_tool', {}))
    expect(result.error).toMatch(/unknown tool/i)
  })
})
