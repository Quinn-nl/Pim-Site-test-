import type { GlobalConfig } from 'payload'

import { isEditor } from '../access'
import { refreshAfterChange, siteUrl } from '../hooks/refreshSite'

export const Privacy: GlobalConfig = {
  slug: 'privacy',
  label: 'Privacy statement',
  admin: { group: 'Texts: Extra pages', preview: (_doc: unknown, { locale }: { locale?: string }) => siteUrl('/privacy', locale), description: 'Blank line = new paragraph. A line starting with "# " is a heading. Have this text checked by a lawyer.' },
  versions: { max: 20 },
  hooks: { afterChange: [refreshAfterChange] },
  access: { read: () => true, update: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  fields: [{ name: 'text', type: 'textarea', localized: true, label: 'Privacy statement', maxLength: 20000, admin: { rows: 24 } }],
}
