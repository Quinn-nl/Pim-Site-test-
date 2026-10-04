import type { Field, GlobalConfig } from 'payload'

import siteFields from '../generated/site-fields.json'
import { isEditor } from '../access'
import { refreshAfterChange, siteUrl } from '../hooks/refreshSite'

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

/** Where each text group lives on the website: dashboard group, label, page address. */
const PLACE: Record<string, { group: string; label: string; path: string; note: string }> = {
  hero: { group: 'Texts: Home', label: 'Home: top banner (hero)', path: '/', note: 'The first thing visitors see on the home page.' },
  home: { group: 'Texts: Home', label: 'Home: teasers and closing call to action', path: '/', note: 'Short lines on the home page and the closing block.' },
  steps: { group: 'Texts: How it works', label: 'How it works: three steps', path: '/how-it-works', note: 'Also shown as a summary on the home page.' },
  problem: { group: 'Texts: The problem', label: 'The problem: text, facts and sources', path: '/problem', note: 'Every figure needs a source. Do not add figures without one.' },
  apps: { group: 'Texts: Applications', label: 'Applications: overview', path: '/applications', note: 'Also shown as a summary on the home page.' },
  status: { group: 'Texts: Home', label: 'Home: status of the project', path: '/', note: 'Honest status of the prototype. No promises about results.' },
  about: { group: 'Texts: Home', label: 'Home: who is behind Aethra (optional)', path: '/', note: 'Only shown once it is filled in. Use real names only.' },
  contact: { group: 'Texts: Contact', label: 'Contact page', path: '/contact', note: 'Texts around the contact form. Messages arrive under Inbox.' },
  aud_municipalities: { group: 'Texts: Audience pages', label: 'For municipalities', path: '/for/municipalities', note: 'Landing page for cities and municipalities.' },
  aud_fleets: { group: 'Texts: Audience pages', label: 'For fleet operators', path: '/for/fleets', note: 'Landing page for fleet operators.' },
  aud_manufacturers: { group: 'Texts: Audience pages', label: 'For vehicle manufacturers', path: '/for/manufacturers', note: 'Landing page for vehicle manufacturers.' },
  aud_platforms: { group: 'Texts: Audience pages', label: 'For mobility platforms', path: '/for/platforms', note: 'Landing page for mobility platforms.' },
  aud_investors: { group: 'Texts: Audience pages', label: 'For investors', path: '/for/investors', note: 'No offers of shares or returns. Describe the stage honestly.' },
  today: { group: 'Texts: Extra pages', label: 'Page: eco mode today (hidden until switched on)', path: '/eco-mode-today', note: 'Stays hidden until the switch field is set. Check the sources first.' },
  seo: { group: 'Settings', label: 'Search engine titles per page', path: '/', note: 'About 50 characters per title. The site name is added automatically.' },
  site: { group: 'Settings', label: 'Site name, search description, footer', path: '/', note: 'Used on every page.' },
}

const ORDER = ['hero', 'home', 'status', 'about', 'problem', 'steps', 'apps', 'contact', 'aud_municipalities', 'aud_fleets', 'aud_manufacturers', 'aud_platforms', 'aud_investors', 'today', 'seo', 'site']
const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length)

export const SiteContent: GlobalConfig[] = [...(siteFields.groups as Group[])].sort((a, b) => rank(a.id) - rank(b.id)).map((g) => {
  const place = PLACE[g.id] || { group: 'Texts: Other', label: g.title, path: '/', note: '' }
  return {
    slug: siteGlobalSlug(g.id),
    label: place.label,
    admin: {
      group: place.group,
      description: `${place.note} Choose the language at the top right. A text left empty falls back to the default text of the website.`,
      preview: (_doc: unknown, { locale }: { locale?: string }) => siteUrl(place.path, locale),
    },
    versions: { max: 20 },
    hooks: { afterChange: [refreshAfterChange] },
    access: { read: () => true, update: isEditor },
    custom: { totp: { disableAccessWrapper: { read: true } } }, // public: the website reads it without logging in
    fields: g.fields.map(toField),
  }
})
