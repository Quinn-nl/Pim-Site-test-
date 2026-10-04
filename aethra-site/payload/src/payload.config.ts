import { sqliteAdapter } from '@payloadcms/db-sqlite'
import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import { fr } from '@payloadcms/translations/languages/fr'
import { nl } from '@payloadcms/translations/languages/nl'
import path from 'path'
import { buildConfig } from 'payload'
import { payloadTotp } from 'payload-totp'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Media } from './collections/Media'
import { Messages } from './collections/Messages'
import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { Photos } from './globals/Photos'
import { Privacy } from './globals/Privacy'
import { SiteContent } from './globals/SiteContent'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' | Aethra admin' },
  },
  collections: [Pages, Messages, Media, Users],
  globals: [...SiteContent, Privacy, Photos],
  // Only what the website can render: headings, bold, italic, lists, quotes and links.
  editor: lexicalEditor({
    features: () => [
      ParagraphFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
      BoldFeature(),
      ItalicFeature(),
      UnorderedListFeature(),
      OrderedListFeature(),
      BlockquoteFeature(),
      LinkFeature({ enabledCollections: [] }),
      FixedToolbarFeature(),
    ],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./data/payload.db' } }),
  sharp,
  localization: { locales: ['en', 'nl', 'de', 'fr'], defaultLocale: 'en', fallback: false },
  i18n: { fallbackLanguage: 'en', supportedLanguages: { en, nl, de, fr } },
  // Two-step verification with an authenticator app. Must stay the last plugin.
  plugins: [payloadTotp({ collection: 'users', totp: { issuer: 'Aethra' } })],
})
