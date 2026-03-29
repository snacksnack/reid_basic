import pg from 'pg'
import { createTransport } from 'nodemailer'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const RECIPIENT = process.env.DIGEST_EMAIL || 'hire.reid.collins@gmail.com'

async function run() {
  const { rows } = await pool.query(`
    SELECT session_id, ip_address, role, content, created_at
    FROM chat_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY session_id, created_at
  `)

  if (rows.length === 0) {
    console.log('No chats in the last 24 hours — skipping email.')
    await pool.end()
    return
  }

  const sessions = new Map()
  for (const row of rows) {
    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, { ip: row.ip_address, messages: [] })
    }
    sessions.get(row.session_id).messages.push(row)
  }

  const sessionCount = sessions.size
  const messageCount = rows.length
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let text = `Resume Chatbot Digest — ${today}\n`
  text += `${sessionCount} conversation${sessionCount === 1 ? '' : 's'}, ${messageCount} total messages\n`
  text += '='.repeat(60) + '\n\n'

  for (const [sid, session] of sessions) {
    const started = new Date(session.messages[0].created_at).toLocaleTimeString('en-US')
    text += `Session: ${sid}\n`
    text += `IP: ${session.ip}\n`
    text += `Started: ${started}\n`
    text += '-'.repeat(40) + '\n'

    for (const msg of session.messages) {
      const label = msg.role === 'user' ? 'USER' : 'BOT'
      text += `  [${label}] ${msg.content}\n\n`
    }

    text += '\n'
  }

  const transporter = createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: process.env.SENDGRID_USERNAME,
      pass: process.env.SENDGRID_PASSWORD,
    },
  })

  await transporter.sendMail({
    from: `Resume Chatbot <hire.reid.collins@gmail.com>`,
    to: RECIPIENT,
    subject: `Chatbot Digest: ${sessionCount} conversation${sessionCount === 1 ? '' : 's'} — ${today}`,
    text,
  })

  console.log(`Digest sent to ${RECIPIENT} — ${sessionCount} session(s), ${messageCount} message(s)`)
  await pool.end()
}

run().catch(err => {
  console.error('Digest failed:', err)
  process.exit(1)
})
