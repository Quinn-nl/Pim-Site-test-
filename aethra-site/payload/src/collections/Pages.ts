import type { CollectionConfig } from 'payload'
import { totpAccess } from 'payload-totp'

import { isEditor } from '../access'

const RESERVED = ['problem', 'how-it-works', 'applications', 'contact', 'privacy', 'for', 'eco-mode-today', 'admin', 'admin2', 'css', 'js', 'img', 'fonts', 'uploads', 'deck', 'healthz', 'robots', 'sitemap', 'llms', 'favicon']

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'], group: 'Website', description: 'New pages for the website. A published page appears at /<language>/<address>. Fill in a language only if the page exists in that language.' },
  versions: { drafts: true, maxPerDoc: 20 },
  access: {
    // Visitors (the website) only ever see published pages; staff see everything.
    read: (args) => (args.req.user ? totpAccess(() => true)(args) : { _status: { equals: 'published' } }),
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  custom: { totp: { disableAccessWrapper: { read: true } } }, // visitors read published pages; staff reads are checked with the authenticator
  fields: [
    { name: 'title', type: 'text', required: true, localized: true, label: 'Heading (H1)' },
    {
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      label: 'Address',
      admin: { description: 'Lowercase letters, digits and single dashes, for example about-us. The page appears at /<language>/<address>.' },
      validate: (value: unknown) => {
        const v = String(value || '')
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) return 'Use lowercase letters, digits and single dashes only (for example about-us).'
        if (RESERVED.includes(v)) return 'This address is used by the website itself. Choose another one.'
        return true
      },
    },
    { name: 'lead', type: 'textarea', localized: true, label: 'Introduction (optional)', maxLength: 600 },
    { name: 'body', type: 'richText', localized: true, label: 'Text' },
    { name: 'seoTitle', type: 'text', localized: true, label: 'Title in search results (optional, about 50 characters; the site name is added)', maxLength: 120 },
    { name: 'seoDescription', type: 'textarea', localized: true, label: 'Description in search results (optional, about 150 characters)', maxLength: 300 },
    { name: 'showInFooter', type: 'checkbox', defaultValue: false, label: 'Show a link to this page in the footer' },
  ],
}
