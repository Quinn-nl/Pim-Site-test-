import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { isEditor } from '../access'
import { refreshAfterChange, refreshAfterDelete } from '../hooks/refreshSite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Photo file', plural: 'Photo files' },
  admin: { group: 'Media', useAsTitle: 'alt', defaultColumns: ['filename', 'alt', 'updatedAt'], description: 'Upload photos here, then pick them under Media > Photos. JPEG, PNG or WebP, at most 8 MB.' },
  hooks: { afterChange: [refreshAfterChange], afterDelete: [refreshAfterDelete] },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  custom: { totp: { disableAccessWrapper: { read: true } } },
  upload: {
    staticDir: path.resolve(dirname, '../../data/media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [],
  },
  fields: [{ name: 'alt', type: 'text', required: true, label: 'Description of the photo (for screen readers and search engines)', admin: { description: 'Describe what is in the photo, for example "CubeSat model on a workbench". Do not stuff keywords.' } }],
}
