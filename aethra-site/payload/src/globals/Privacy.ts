import type { GlobalConfig } from 'payload'

import { isEditor } from '../access'

export const Privacy: GlobalConfig = {
  slug: 'privacy',
  label: 'Privacy statement',
  admin: { group: 'Website texts', description: 'Blank line = new paragraph. A line starting with "# " is a heading. Have this text checked by a lawyer.' },
  versions: { max: 20 },
  access: { read: () => true, update: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  fields: [{ name: 'text', type: 'textarea', localized: true, label: 'Privacy statement', maxLength: 20000, admin: { rows: 24 } }],
}
