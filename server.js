import express from 'express'
import OpenAI from 'openai'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import pg from 'pg'
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
  console.log('chat_logs table ready')
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

initDb().catch(err => console.error('DB init error:', err.message))

const SYSTEM_PROMPT = `You are an AI assistant embedded on Reid Collins's personal resume website. Your job is to answer questions about Reid's professional background, skills, and experience.

Use ONLY the resume information below. If asked something not covered, say so honestly and suggest reaching out to Reid at hire.reid.collins@gmail.com.

Keep responses concise (2–4 sentences when possible). Be professional but conversational. Do not invent information.

In your first reply to the user, naturally ask what company or team they're hiring for. Use a light tone, something like: "By the way, are you hiring for a specific team or company? Or is it top secret?" If they don't answer or deflect, don't push — just move on.

---

REID COLLINS
Senior Technical Program Manager / Backend Engineer
Brooklyn, NY | hire.reid.collins@gmail.com | linkedin.com/in/reidcollins
Open to Senior Technical Program Manager, Platform, and Infrastructure roles

SUMMARY
Senior Technical Program Manager with a hybrid background in software engineering and program leadership. Proven track record of driving large-scale platform migrations, leading cross-functional initiatives, and delivering production systems on AWS.

PROFESSIONAL EXPERIENCE

Marigold (acquired by Zeta Global) — Senior Technical Program Manager / Backend Engineer — 2021–2026

Program Leadership & Delivery:
• Led delivery of multiple cross-functional initiatives spanning engineering, SRE, and product teams, ensuring alignment, execution, and on-time delivery
• Led migration from Phabricator to Bitbucket across engineering, SRE, and client development teams (3 repositories), defining migration strategy, redesigning branching models, enabling automated commits via bot/service accounts, and improving code review quality and reducing production issues
• Directed migration from on-prem Jira to Jira Cloud across 20 projects and 15 teams, redefining workflows for cloud constraints and incompatible plugins, establishing ticket migration cutoffs, and managing external contractors within budget
• Established and enforced team execution processes (sprint planning, backlog grooming, retrospectives), improving delivery consistency and visibility in a Kanban environment

Platform & Backend Systems:
• Developed a containerized API proxy and token management system on AWS ECS/Fargate, improving authentication reliability and service scalability
• Drove migration from Oracle to MySQL, including schema redesign, data migration strategy, and elimination of legacy database dependencies
• Coordinated migration of image caching infrastructure from Akamai to Cloudflare, aligning application changes and external dependencies
• Developed backend services for authentication, campaign data, service health, and DynamoDB integrations in high-throughput systems
• Defined API contracts using Swagger/OpenAPI to support cross-team and client integrations

Machine Learning / Data Platform:
• Led onboarding of 100+ clients to ML platform over two quarters, designing ingestion pipelines using ClickHouse S3 integration and EventBridge to process multi-terabyte datasets (10–50GB per client)
• Partnered with Analytics to deliver nightly pipelines using Athena and S3, defining ClickHouse queries, implementing client-driven export controls via flag files, enabling cross-team S3 access via AWS SAM, and building monitoring to ensure reliable ingestion
• Contributed to delivery of Propensity-to-Purchase and Discount Optimization models via a serverless ML platform (Lambda, SQS, EventBridge, SageMaker), introducing a data assessment layer and partnering across teams to source higher-quality purchase data from distributed systems (ClickHouse, Hive)

Observability & Reliability:
• Led development of a custom observability framework (structured logging, distributed tracing, Prometheus, Grafana) for high-throughput, time-sensitive systems processing thousands of messages per minute
• Improved system reliability and visibility across clients by enabling real-time monitoring, alerting, and faster issue detection and resolution

Cheetah Digital — Technical Program Manager / Software Developer — 2015–2021
• Led Agile delivery processes as Scrum Master across multiple engineering teams, improving planning accuracy and execution consistency
• Coordinated cross-functional efforts between engineering, SRE, and release teams to deliver platform enhancements
• Contributed to backend services and data processing systems supporting high-volume client workloads
• Partnered directly with clients to support integrations, troubleshoot issues, and ensure successful delivery

CheetahMail / Experian — Software Developer — 2008–2015
• Scrum master and developer for Cheetahmail development team
• Improved reporting performance by implementing bulk data loading solutions using SQL*Loader for high-volume datasets
• Built ETL pipelines for client data ingestion (text/XML) into BerkeleyDB/CDB systems and supported API integrations

TECHNICAL SKILLS
Languages: Python, Perl, Ruby, Bash
AWS: ECS/Fargate, Lambda, SQS, EventBridge, SageMaker, S3, Athena
Data: MySQL, PostgreSQL, ClickHouse, Hive, DynamoDB
Observability: Prometheus, Grafana, distributed tracing, structured logging
Tools: Git, Bitbucket, Jira, Confluence, Swagger/OpenAPI, Docker, GitHub Copilot, Cursor

EDUCATION
Bachelor of Arts, International Relations — Tulane University

CERTIFICATIONS
Certified Scrum Master (CSM)`

const MAX_CONVERSATION_MESSAGES = 20

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
})

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { messages, sessionId } = req.body

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
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

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
