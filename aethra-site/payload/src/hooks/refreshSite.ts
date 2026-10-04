import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload'

/**
 * Tells the website to fetch the new content right away, so an edit shows up within a second instead of
 * waiting for the background refresh. Failures are ignored: the website refreshes on its own anyway.
 */
const ping = async () => {
  const key = process.env.SITE_REFRESH_TOKEN
  if (!key) return
  const site = (process.env.SITE_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
  try {
    await fetch(`${site}/api/cms-refresh`, { method: 'POST', headers: { 'x-refresh-token': key }, signal: AbortSignal.timeout(3000) })
  } catch {
    /* the website is not running or not reachable: it will catch up by itself */
  }
}

export const refreshAfterChange: CollectionAfterChangeHook & GlobalAfterChangeHook = async ({ doc }) => {
  void ping()
  return doc
}
export const refreshAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  void ping()
  return doc
}

/** Address of a page on the public website, for the "View on website" button. */
export const siteUrl = (path: string, locale?: string | null) => {
  const base = (process.env.SITE_PUBLIC_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const l = locale && ['en', 'nl', 'de', 'fr'].includes(locale) ? locale : 'en'
  return `${base}/${l}${path === '/' ? '/' : path}`
}
