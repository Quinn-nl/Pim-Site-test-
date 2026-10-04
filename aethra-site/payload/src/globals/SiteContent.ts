import type { Field, GlobalConfig } from 'payload'

import siteFields from '../generated/site-fields.json'
import { isEditor } from '../access'

type Def = { key: string; label: string; type: string }
type Group = { id: string; title: string; fields: Def[] }

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.length > max ? `At most ${max} characters.` : true)

const toField = (f: Def): Field =>
  f.type === 'textarea'
    ? { name: f.key, type: 'textarea', label: f.label, localized: true, validate: (v: unknown) => clean(v, 2000) }
    : {
        name: f.key,
        type: 'text',
        label: f.label,
        localized: true,
        validate: (v: unknown) => {
          const c = clean(v, 300)
          if (c !== true) return c
          if (f.type === 'url' && typeof v === 'string' && v.trim() && !/^https?:\/\//i.test(v.trim())) return 'Enter a link that starts with http:// or https://'
          return true
        },
      }

/**
 * One global per group of texts (Hero, Problem, Contact, ...). SQLite cannot read one table with more than
 * about 127 columns in a single query, and separate sections are easier to find in the admin anyway.
 */
export const siteGlobalSlug = (groupId: string) => `site-${groupId.replace(/_/g, '-')}`

export const SiteContent: GlobalConfig[] = (siteFields.groups as Group[]).map((g) => ({
  slug: siteGlobalSlug(g.id),
  label: g.title,
  admin: { group: 'Website texts', description: 'Switch the language at the top of the page. A required text left empty falls back to the default text of the website.' },
  versions: { max: 20 },
  access: { read: () => true, update: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } }, // public: the website reads it without logging in
  fields: g.fields.map(toField),
}))
