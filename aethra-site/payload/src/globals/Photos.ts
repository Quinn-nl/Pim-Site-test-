import type { Field, GlobalConfig } from 'payload'

import siteFields from '../generated/site-fields.json'
import { isEditor } from '../access'

export const Photos: GlobalConfig = {
  slug: 'photos',
  label: 'Photos',
  admin: { group: 'Website', description: 'Photos of the website. Upload real photos only. The sharing image is shown when the site is shared (1200 x 630).' },
  access: { read: () => true, update: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  fields: (siteFields.imageSlots as { slot: string; label: string }[]).map((s): Field => ({ name: s.slot, type: 'upload', relationTo: 'media', label: s.label })),
}
