import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { isEditor } from '../access'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Website' },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  upload: {
    staticDir: path.resolve(dirname, '../../data/media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [],
  },
  fields: [{ name: 'alt', type: 'text', label: 'Description of the photo (for screen readers and search engines)' }],
}
