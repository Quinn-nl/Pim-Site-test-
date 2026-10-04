import type { Access } from 'payload'

type Role = 'admin' | 'editor' | 'site'
const roleOf = (user: unknown): Role | null => ((user as { role?: Role } | null)?.role ?? null)

/** Administrators only. */
export const isAdmin: Access = ({ req: { user } }) => roleOf(user) === 'admin'
/** Administrators and editors (the people who change the website). */
export const isEditor: Access = ({ req: { user } }) => ['admin', 'editor'].includes(roleOf(user) || '')
/** The website's own server account (API key), plus administrators. */
export const isSiteOrAdmin: Access = ({ req: { user } }) => ['admin', 'site'].includes(roleOf(user) || '')
/** Editors, administrators and the website account. */
export const isStaff: Access = ({ req: { user } }) => ['admin', 'editor', 'site'].includes(roleOf(user) || '')
