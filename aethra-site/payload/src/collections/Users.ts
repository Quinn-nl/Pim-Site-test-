import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access'

const production = process.env.NODE_ENV === 'production'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'role', 'updatedAt'], group: 'Admin' },
  auth: {
    tokenExpiration: 8 * 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    useAPIKey: true, // used by the website's server to hand in contact messages
    cookies: { sameSite: 'Strict', secure: production },
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: ({ req: { user } }) => {
      if (!user) return false
      return (user as { role?: string }).role === 'admin' ? true : { id: { equals: user.id } }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      return (user as { role?: string }).role === 'admin' ? true : { id: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      options: [
        { label: 'Administrator (everything, users, messages)', value: 'admin' },
        { label: 'Editor (texts, pages, photos, messages)', value: 'editor' },
        { label: 'Website (API key for the contact form only)', value: 'site' },
      ],
      access: { create: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin', update: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin' },
    },
  ],
  hooks: {
    // The very first account (created on the first-run screen) is always an administrator.
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === 'create' && !req.user) data.role = 'admin'
        return data
      },
    ],
  },
}
