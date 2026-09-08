// Probe: can the production service account read message headers from one
// mailbox with the gmail.metadata scope, limited to one label?
//
// Usage:
//   GMAIL_SENDER_LABEL="SAC/info" node --env-file=.env scripts/probe-gmail-senders.mjs [mailbox]
//
// The mailbox defaults to GOOGLE_REPORTS_ADMIN_EMAIL. The script prints counts
// and truncated headers. It never prints credentials or bodies.

import { JWT } from 'google-auth-library'

const SCOPE = 'https://www.googleapis.com/auth/gmail.metadata'
const API = 'https://gmail.googleapis.com/gmail/v1/users'
const mailbox = process.argv[2] || process.env.GOOGLE_REPORTS_ADMIN_EMAIL
const labelName = process.env.GMAIL_SENDER_LABEL

async function main() {
  console.log(`mailbox: ${mailbox || 'MISSING'}`)
  console.log(`label:   ${labelName || 'MISSING'}`)
  if (!mailbox || !labelName) process.exit(1)

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [SCOPE],
    subject: mailbox,
  })
  const user = encodeURIComponent(mailbox)

  let res
  try {
    res = await auth.request({ url: `${API}/${user}/labels` })
  } catch (err) {
    console.log(`\nRESULT: labels request failed (${err.response?.status ?? err.code})`)
    console.log(JSON.stringify(err.response?.data ?? err.message, null, 2).slice(0, 800))
    return
  }
  const labels = res.data.labels ?? []
  const label = labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase())
  console.log(`labels visible: ${labels.length}`)
  if (!label) {
    console.log(
      `RESULT: label not found. User labels: ${labels
        .filter((l) => l.type === 'user')
        .map((l) => l.name)
        .join(', ')}`
    )
    return
  }
  console.log(`label id: ${label.id}`)

  const list = await auth.request({
    url: `${API}/${user}/messages?labelIds=${encodeURIComponent(label.id)}&maxResults=20`,
  })
  const ids = (list.data.messages ?? []).map((m) => m.id)
  console.log(
    `messages in label (first page): ${ids.length}, estimate ${list.data.resultSizeEstimate}`
  )

  for (const id of ids.slice(0, 8)) {
    const msg = await auth.request({
      url: `${API}/${user}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=Date&metadataHeaders=X-Original-Sender&metadataHeaders=Reply-To`,
    })
    const h = Object.fromEntries((msg.data.payload?.headers ?? []).map((x) => [x.name, x.value]))
    console.log(
      JSON.stringify({
        date: new Date(Number(msg.data.internalDate)).toISOString(),
        from: (h.From ?? '').slice(0, 50),
        originalSender: (h['X-Original-Sender'] ?? '').slice(0, 50),
        replyTo: (h['Reply-To'] ?? '').slice(0, 50),
        messageId: (h['Message-ID'] ?? '').slice(0, 40),
        hasBody: Boolean(msg.data.payload?.body?.data || msg.data.payload?.parts),
      })
    )
  }
  console.log('\nRESULT: ok')
}

main().catch((e) => {
  console.error('unexpected error:', e.message)
  process.exit(1)
})
