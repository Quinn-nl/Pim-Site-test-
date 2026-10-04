import { getPayload } from 'payload'
import config from '@payload-config'
import React from 'react'

/** Short guide and a counter of unhandled messages at the top of the dashboard. */
export default async function BeforeDashboard() {
  let open = 0
  try {
    const payload = await getPayload({ config })
    const res = await payload.count({ collection: 'messages', where: { handled: { equals: false } }, overrideAccess: true })
    open = res.totalDocs
  } catch {
    /* the counter is a nicety, never block the dashboard */
  }
  return (
    <div style={{ marginBottom: 32, lineHeight: 1.55, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>Welcome</h2>
      <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
        <li>
          <b>Messages</b>: {open > 0 ? <a href="/admin2/admin/collections/messages?where[handled][equals]=false">{open} unhandled message{open === 1 ? '' : 's'}</a> : 'no unhandled messages'}.
        </li>
        <li><b>Texts of the website</b> are grouped per page below. Choose the language at the top right, edit, and press Save. The website updates within seconds.</li>
        <li><b>Pages</b> are new extra pages. Save as draft until it is ready, then Publish.</li>
        <li><b>Photos</b>: upload real photos only, with a short description (for screen readers).</li>
        <li>Use <b>View on website</b> on a text group to see the live page. Do not state results or numbers that are not backed by test data.</li>
      </ul>
    </div>
  )
}
