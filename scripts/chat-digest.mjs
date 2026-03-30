import pg from 'pg'
import { createTransport } from 'nodemailer'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const RECIPIENT = process.env.DIGEST_EMAIL || 'hire.reid.collins@gmail.com'

async function run() {
  const { rows: chatRows } = await pool.query(`
    SELECT session_id, ip_address, role, content, created_at
    FROM chat_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY session_id, created_at
  `)

  const { rows: downloadRows } = await pool.query(`
    SELECT format, ip_address, user_agent, created_at
    FROM download_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at
  `)

  const { rows: viewRows } = await pool.query(`
    SELECT ip_address, referrer, created_at
    FROM page_views
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at
  `)

  if (chatRows.length === 0 && downloadRows.length === 0 && viewRows.length === 0) {
    console.log('No activity in the last 24 hours — skipping email.')
    await pool.end()
    return
  }

  const uniqueVisitors = new Set(viewRows.map(v => v.ip_address)).size
  const referrers = {}
  for (const v of viewRows) {
    const ref = v.referrer || 'Direct'
    referrers[ref] = (referrers[ref] || 0) + 1
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let text = `Resume Site Digest — ${today}\n`
  text += '='.repeat(60) + '\n\n'

  if (viewRows.length > 0) {
    text += `PAGE VIEWS: ${viewRows.length} views, ${uniqueVisitors} unique visitor${uniqueVisitors === 1 ? '' : 's'}\n`
    text += '-'.repeat(40) + '\n'
    const sortedRefs = Object.entries(referrers).sort((a, b) => b[1] - a[1])
    for (const [ref, count] of sortedRefs) {
      text += `  ${ref} — ${count}\n`
    }
    text += '\n'
  }

  if (downloadRows.length > 0) {
    text += `DOWNLOADS (${downloadRows.length})\n`
    text += '-'.repeat(40) + '\n'
    for (const dl of downloadRows) {
      const time = new Date(dl.created_at).toLocaleTimeString('en-US')
      text += `  ${dl.format.toUpperCase()} — ${time} — IP: ${dl.ip_address}\n`
    }
    text += '\n'
  }

  const sessions = new Map()
  for (const row of chatRows) {
    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, { ip: row.ip_address, messages: [] })
    }
    sessions.get(row.session_id).messages.push(row)
  }

  const sessionCount = sessions.size

  if (sessionCount > 0) {
    text += `CHAT CONVERSATIONS (${sessionCount})\n`
    text += '-'.repeat(40) + '\n\n'

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
    subject: `Resume Digest: ${viewRows.length} view${viewRows.length === 1 ? '' : 's'}, ${downloadRows.length} download${downloadRows.length === 1 ? '' : 's'}, ${sessionCount} chat${sessionCount === 1 ? '' : 's'} — ${today}`,
    text,
  })

  console.log(`Digest sent to ${RECIPIENT} — ${viewRows.length} view(s), ${downloadRows.length} download(s), ${sessionCount} chat(s)`)
  await pool.end()
}

run().catch(err => {
  console.error('Digest failed:', err)
  process.exit(1)
})
