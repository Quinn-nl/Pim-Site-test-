import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { migrations } from './migrations'
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
    meta: { titleSuffix: ' | Aethra admin', description: 'Edit the Aethra website' },
    dateFormat: 'dd-MM-yyyy HH:mm',
    components: { beforeDashboard: ['/components/BeforeDashboard'] },
  },
  collections: [Messages, Pages, Media, Users],
  graphQL: { disable: true }, // not used; one less door
  upload: { limits: { fileSize: 8 * 1024 * 1024 } },
  cors: [process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'],
  csrf: [process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://127.0.0.1:3000'],
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
  // Tables are created by the migrations in src/migrations (run automatically on start, also in production)
  db: sqliteAdapter({ prodMigrations: migrations, client: { url: process.env.DATABASE_URL || 'file:./data/payload.db' } }),
  sharp,
  localization: { locales: ['en', 'nl', 'de', 'fr'], defaultLocale: 'en', fallback: false },
  i18n: { fallbackLanguage: 'en', supportedLanguages: { en, nl, de, fr } },
  // Two-step verification with an authenticator app. Must stay the last plugin.
  plugins: [payloadTotp({ collection: 'users', totp: { issuer: 'Aethra' } })],
})
