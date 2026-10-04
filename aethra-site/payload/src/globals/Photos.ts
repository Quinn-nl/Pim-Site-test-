import type { Field, GlobalConfig } from 'payload'

import siteFields from '../generated/site-fields.json'
import { isEditor } from '../access'
import { refreshAfterChange, siteUrl } from '../hooks/refreshSite'

export const Photos: GlobalConfig = {
  slug: 'photos',
  label: 'Photos',
  admin: { group: 'Media', preview: (_doc: unknown, { locale }: { locale?: string }) => siteUrl('/', locale), description: 'Photos of the website. Upload real photos only. The sharing image is shown when the site is shared (1200 x 630).' },
  hooks: { afterChange: [refreshAfterChange] },
  access: { read: () => true, update: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  fields: (siteFields.imageSlots as { slot: string; label: string }[]).map((s): Field => ({ name: s.slot, type: 'upload', relationTo: 'media', label: s.label })),
}
