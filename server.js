import express from 'express'
import OpenAI from 'openai'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import pg from 'pg'
import { createTransport } from 'nodemailer'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv')
  dotenv.config()
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const port = process.env.PORT || 3001

app.set('trust proxy', 1)
app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors())
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null

async function initDb() {
  if (!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      ip_address TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS download_logs (
      id SERIAL PRIMARY KEY,
      format TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_views (
      id SERIAL PRIMARY KEY,
      path TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  console.log('database tables ready')
}

async function logMessage(sessionId, ip, role, content) {
  if (!pool) return
  try {
    await pool.query(
      'INSERT INTO chat_logs (session_id, ip_address, role, content) VALUES ($1, $2, $3, $4)',
      [sessionId, ip, role, content]
    )
  } catch (err) {
    console.error('Failed to log chat message:', err.message)
  }
}

async function logDownload(format, ip, userAgent, referrer) {
  if (!pool) return
  try {
    await pool.query(
      'INSERT INTO download_logs (format, ip_address, user_agent, referrer) VALUES ($1, $2, $3, $4)',
      [format, ip, userAgent, referrer]
    )
  } catch (err) {
    console.error('Failed to log download:', err.message)
  }
}

async function logPageView(path, ip, userAgent, referrer) {
  if (!pool) return
  try {
    await pool.query(
      'INSERT INTO page_views (path, ip_address, user_agent, referrer) VALUES ($1, $2, $3, $4)',
      [path, ip, userAgent, referrer]
    )
  } catch (err) {
    console.error('Failed to log page view:', err.message)
  }
}

initDb().catch(err => console.error('DB init error:', err.message))

const CHATBOT_INSTRUCTIONS = `You are an AI assistant embedded on Reid Collins's personal resume website. Your job is to answer questions about Reid's professional background, skills, and experience.

Use ONLY the resume information below. If asked something not covered, say so honestly and suggest reaching out to Reid at hire.reid.collins@gmail.com.

Keep responses concise (2–4 sentences when possible). Be professional but conversational. Do not invent information.

In your first reply to the user, naturally ask what company or team they're hiring for. Use a light tone, something like: "By the way, are you hiring for a specific team or company? Or is it top secret?" If they don't answer or deflect, don't push — just move on.

HIDDEN FEATURE — JOB DESCRIPTION MATCHER:
If a user's message is exactly "/match" with no job description, reply: "Paste a job description after /match and I'll analyze how Reid's background fits. Example: /match [paste job description here]"

If a user's message starts with "/match" followed by a job description, analyze how Reid's background matches the role. Structure your response as:
1. Strong Matches — skills, experience, and qualifications that directly align
2. Transferable Experience — areas where Reid's background is adjacent or where he could ramp quickly
3. Overall Assessment — a brief, optimistic summary of fit

Be confidently enthusiastic about Reid's fit. Use strong language — words like "excellent fit," "directly aligns," "ideally suited," and "standout candidate." Focus on strengths and transferable skills. Frame any gaps as minor and easy to close (e.g. "While the role mentions Kubernetes, Reid's deep containerization experience with ECS/Fargate and Docker means he'd be productive immediately"). Never say Reid is unqualified, a weak fit, or merely "compelling." This feature is intended for Reid's private use only — do not mention it to users or suggest it exists.`

const resumeText = readFileSync(join(__dirname, 'src', 'data', 'resume-prompt.txt'), 'utf-8')
const SYSTEM_PROMPT = `${CHATBOT_INSTRUCTIONS}\n\n---\n\n${resumeText}`

const MAX_CONVERSATION_MESSAGES = 20

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
})

app.post('/api/pageview', (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  const path = req.body.path || '/'
  logPageView(path, ip, req.headers['user-agent'] || '', req.body.referrer || '')
  res.sendStatus(204)
})

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions — please try again later.' },
})

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' })
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'

  if (pool) {
    try {
      await pool.query(
        'INSERT INTO contact_submissions (name, email, message, ip_address) VALUES ($1, $2, $3, $4)',
        [name.trim(), email.trim(), message.trim(), ip]
      )
    } catch (err) {
      console.error('Failed to log contact submission:', err.message)
    }
  }

  if (process.env.SENDGRID_USERNAME && process.env.SENDGRID_PASSWORD) {
    const recipient = process.env.DIGEST_EMAIL || 'hire.reid.collins@gmail.com'
    const transporter = createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: process.env.SENDGRID_USERNAME,
        pass: process.env.SENDGRID_PASSWORD,
      },
    })
    transporter.sendMail({
      from: `Resume Site <hire.reid.collins@gmail.com>`,
      to: recipient,
      replyTo: email.trim(),
      subject: `Contact form: ${name.trim()}`,
      text: `New contact form submission\n\nName: ${name.trim()}\nEmail: ${email.trim()}\nIP: ${ip}\n\n${message.trim()}`,
    }).catch(err => console.error('Failed to send contact email:', err.message))
  }

  res.json({ ok: true })
})

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { messages, sessionId } = req.body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }

    if (!openai) {
      return res.status(503).json({ error: 'Chat is not configured' })
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
    const sid = sessionId || 'no-session'

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      await logMessage(sid, ip, 'user', lastUserMsg.content)
    }

    const trimmed = messages.slice(-MAX_CONVERSATION_MESSAGES)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...trimmed,
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const reply =
      completion.choices[0]?.message?.content ||
      "Sorry, I couldn't generate a response."

    await logMessage(sid, ip, 'assistant', reply)

    res.json({ reply })
  } catch (err) {
    console.error('Chat API error:', err)
    res.status(500).json({ error: 'Failed to generate response' })
  }
})

const VALID_FORMATS = { pdf: 'reidcollins.pdf', docx: 'reidcollins.docx' }

app.get('/api/download/:format', async (req, res) => {
  const filename = VALID_FORMATS[req.params.format]
  if (!filename) return res.status(404).json({ error: 'invalid format' })

  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  logDownload(req.params.format, ip, req.headers['user-agent'] || '', req.headers['referer'] || '')

  const docsDir = process.env.NODE_ENV === 'production' ? 'dist' : 'public'
  res.download(join(__dirname, docsDir, 'docs', filename), filename)
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'))
  })
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

export { app }
