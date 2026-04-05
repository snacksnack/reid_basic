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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tool_usage (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      ip_address TEXT,
      tool_name TEXT NOT NULL,
      tool_args JSONB,
      tool_result TEXT,
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

async function logToolUsage(sessionId, ip, toolName, toolArgs, toolResult) {
  if (!pool) return
  try {
    await pool.query(
      'INSERT INTO tool_usage (session_id, ip_address, tool_name, tool_args, tool_result) VALUES ($1, $2, $3, $4, $5)',
      [sessionId, ip, toolName, JSON.stringify(toolArgs), toolResult]
    )
  } catch (err) {
    console.error('Failed to log tool usage:', err.message)
  }
}

initDb().catch(err => console.error('DB init error:', err.message))

const chatbotInstructions = readFileSync(join(__dirname, 'src', 'data', 'chatbot-instructions.txt'), 'utf-8')
const resumeText = readFileSync(join(__dirname, 'src', 'data', 'resume-prompt.txt'), 'utf-8')
const SYSTEM_PROMPT = `${chatbotInstructions}\n\n---\n\n${resumeText}`

const MAX_CONVERSATION_MESSAGES = 20
const MAX_TOOL_ROUNDS = 3

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'schedule_meeting',
      description:
        'Get a scheduling link for the visitor to book a meeting with Reid Collins. ' +
        'Use when someone wants to schedule a call, meeting, or interview with Reid.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description:
              'What the visitor wants to discuss (e.g., "engineering role at Acme Corp", "contract opportunity")',
          },
        },
      },
    },
  },
]

function executeToolCall(name, args) {
  if (name === 'schedule_meeting') {
    const schedulingUrl = process.env.SCHEDULING_URL
    if (!schedulingUrl) {
      return JSON.stringify({
        available: false,
        fallback_email: 'hire.reid.collins@gmail.com',
        message:
          'Online scheduling is not currently configured. Suggest the visitor email Reid directly.',
      })
    }
    return JSON.stringify({
      available: true,
      scheduling_url: schedulingUrl,
      topic: args.topic || null,
    })
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` })
}

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

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmed,
    ]

    let reply = null
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        tools: TOOLS,
        max_tokens: 500,
        temperature: 0.7,
      })

      const choice = completion.choices[0]

      if (choice.message.tool_calls?.length) {
        apiMessages.push(choice.message)

        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          const result = executeToolCall(toolCall.function.name, args)

          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          })

          await logToolUsage(sid, ip, toolCall.function.name, args, result)
        }
        continue
      }

      reply = choice.message.content || "Sorry, I couldn't generate a response."
      break
    }

    if (!reply) {
      reply = "Sorry, I couldn't generate a response."
    }

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

export { app, TOOLS, executeToolCall }
