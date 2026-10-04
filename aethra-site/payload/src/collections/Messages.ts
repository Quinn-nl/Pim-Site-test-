import type { CollectionConfig } from 'payload'

import { isEditor, isSiteOrAdmin } from '../access'

export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Message', plural: 'Messages' },
  admin: { useAsTitle: 'name', defaultColumns: ['receivedAt', 'name', 'organisation', 'role', 'email', 'handled'], listSearchableFields: ['name', 'email', 'organisation', 'message'], group: 'Inbox', description: 'Messages sent through the contact form of the website. Tick Handled when you replied. Open a message and use the e-mail address to answer. Delete them on request or after the retention period in the privacy statement.' },
  defaultSort: '-receivedAt',
  access: {
    // The website's server account hands messages in (API key); only staff read them.
    create: isSiteOrAdmin,
    read: isEditor,
    update: isEditor,
    delete: ({ req: { user } }) => ['admin', 'editor', 'site'].includes((user as { role?: string } | null)?.role || ''),
  },
  fields: [
    { name: 'handled', type: 'checkbox', defaultValue: false, index: true, label: 'Handled', admin: { position: 'sidebar', description: 'Tick when you have replied.' } },
    { name: 'receivedAt', type: 'date', required: true, label: 'Received', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'name', type: 'text', required: true, label: 'Name', admin: { readOnly: true } },
    { name: 'email', type: 'email', required: true, label: 'E-mail', admin: { readOnly: true, description: 'Reply from your own mailbox to this address.' } },
    { name: 'organisation', type: 'text', label: 'Organisation', admin: { readOnly: true } },
    { name: 'role', type: 'text', label: 'Role', admin: { readOnly: true } },
    { name: 'message', type: 'textarea', required: true, label: 'Message', admin: { readOnly: true } },
    { name: 'language', type: 'text', label: 'Language', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'source', type: 'text', label: 'Source (campaign tag)', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'note', type: 'textarea', label: 'Internal note (not shown to anyone else)' },
    { name: 'externalId', type: 'text', index: true, admin: { hidden: true } },
  ],
}
