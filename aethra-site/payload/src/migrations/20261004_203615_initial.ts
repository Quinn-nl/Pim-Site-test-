import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`pages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`show_in_footer\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft'
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_updated_at_idx\` ON \`pages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`pages_created_at_idx\` ON \`pages\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`pages__status_idx\` ON \`pages\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`pages_locales\` (
  	\`title\` text,
  	\`slug\` text,
  	\`lead\` text,
  	\`body\` text,
  	\`seo_title\` text,
  	\`seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_locales_locale_parent_id_unique\` ON \`pages_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_pages_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_show_in_footer\` integer DEFAULT false,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_pages_v_parent_idx\` ON \`_pages_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_updated_at_idx\` ON \`_pages_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_created_at_idx\` ON \`_pages_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version__status_idx\` ON \`_pages_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_created_at_idx\` ON \`_pages_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_updated_at_idx\` ON \`_pages_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_snapshot_idx\` ON \`_pages_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_published_locale_idx\` ON \`_pages_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_latest_idx\` ON \`_pages_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_pages_v_locales\` (
  	\`version_title\` text,
  	\`version_slug\` text,
  	\`version_lead\` text,
  	\`version_body\` text,
  	\`version_seo_title\` text,
  	\`version_seo_description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_pages_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_pages_v_locales_locale_parent_id_unique\` ON \`_pages_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`messages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`handled\` integer DEFAULT false,
  	\`received_at\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`email\` text NOT NULL,
  	\`organisation\` text,
  	\`role\` text,
  	\`message\` text NOT NULL,
  	\`language\` text,
  	\`source\` text,
  	\`note\` text,
  	\`external_id\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`messages_external_id_idx\` ON \`messages\` (\`external_id\`);`)
  await db.run(sql`CREATE INDEX \`messages_updated_at_idx\` ON \`messages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`messages_created_at_idx\` ON \`messages\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`role\` text DEFAULT 'editor' NOT NULL,
  	\`totp_secret\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`enable_a_p_i_key\` integer,
  	\`api_key\` text,
  	\`api_key_index\` text,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`totp_attempts\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`attempts\` numeric DEFAULT 0 NOT NULL,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`messages_id\` integer,
  	\`media_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`messages_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_site\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_site_locales\` (
  	\`site_name\` text,
  	\`meta_description\` text,
  	\`company_line\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_site_locales_locale_parent_id_unique\` ON \`site_site_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_site_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_site_v_created_at_idx\` ON \`_site_site_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_site_v_updated_at_idx\` ON \`_site_site_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_site_v_locales\` (
  	\`version_site_name\` text,
  	\`version_meta_description\` text,
  	\`version_company_line\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_site_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_site_v_locales_locale_parent_id_unique\` ON \`_site_site_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_home\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_home_locales\` (
  	\`home_problem_line\` text,
  	\`status_short\` text,
  	\`cta_title\` text,
  	\`cta_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_home\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_home_locales_locale_parent_id_unique\` ON \`site_home_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_home_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_home_v_created_at_idx\` ON \`_site_home_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_home_v_updated_at_idx\` ON \`_site_home_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_home_v_locales\` (
  	\`version_home_problem_line\` text,
  	\`version_status_short\` text,
  	\`version_cta_title\` text,
  	\`version_cta_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_home_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_home_v_locales_locale_parent_id_unique\` ON \`_site_home_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_seo\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_seo_locales\` (
  	\`seo_home\` text,
  	\`seo_problem\` text,
  	\`seo_how\` text,
  	\`seo_apps\` text,
  	\`seo_contact\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_seo\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_seo_locales_locale_parent_id_unique\` ON \`site_seo_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_seo_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_seo_v_created_at_idx\` ON \`_site_seo_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_seo_v_updated_at_idx\` ON \`_site_seo_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_seo_v_locales\` (
  	\`version_seo_home\` text,
  	\`version_seo_problem\` text,
  	\`version_seo_how\` text,
  	\`version_seo_apps\` text,
  	\`version_seo_contact\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_seo_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_seo_v_locales_locale_parent_id_unique\` ON \`_site_seo_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_hero\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_hero_locales\` (
  	\`hero_eyebrow\` text,
  	\`hero_title\` text,
  	\`hero_text\` text,
  	\`hero_cta\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_hero\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_hero_locales_locale_parent_id_unique\` ON \`site_hero_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_hero_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_hero_v_created_at_idx\` ON \`_site_hero_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_hero_v_updated_at_idx\` ON \`_site_hero_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_hero_v_locales\` (
  	\`version_hero_eyebrow\` text,
  	\`version_hero_title\` text,
  	\`version_hero_text\` text,
  	\`version_hero_cta\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_hero_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_hero_v_locales_locale_parent_id_unique\` ON \`_site_hero_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_problem\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_problem_locales\` (
  	\`problem_title\` text,
  	\`problem_text\` text,
  	\`fact1_value\` text,
  	\`fact1_label\` text,
  	\`fact1_source\` text,
  	\`fact1_url\` text,
  	\`fact2_value\` text,
  	\`fact2_label\` text,
  	\`fact2_source\` text,
  	\`fact2_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_problem\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_problem_locales_locale_parent_id_unique\` ON \`site_problem_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_problem_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_problem_v_created_at_idx\` ON \`_site_problem_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_problem_v_updated_at_idx\` ON \`_site_problem_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_problem_v_locales\` (
  	\`version_problem_title\` text,
  	\`version_problem_text\` text,
  	\`version_fact1_value\` text,
  	\`version_fact1_label\` text,
  	\`version_fact1_source\` text,
  	\`version_fact1_url\` text,
  	\`version_fact2_value\` text,
  	\`version_fact2_label\` text,
  	\`version_fact2_source\` text,
  	\`version_fact2_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_problem_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_problem_v_locales_locale_parent_id_unique\` ON \`_site_problem_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_steps\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_steps_locales\` (
  	\`steps_title\` text,
  	\`step1_title\` text,
  	\`step1_text\` text,
  	\`step2_title\` text,
  	\`step2_text\` text,
  	\`step3_title\` text,
  	\`step3_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_steps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_steps_locales_locale_parent_id_unique\` ON \`site_steps_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_steps_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_steps_v_created_at_idx\` ON \`_site_steps_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_steps_v_updated_at_idx\` ON \`_site_steps_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_steps_v_locales\` (
  	\`version_steps_title\` text,
  	\`version_step1_title\` text,
  	\`version_step1_text\` text,
  	\`version_step2_title\` text,
  	\`version_step2_text\` text,
  	\`version_step3_title\` text,
  	\`version_step3_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_steps_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_steps_v_locales_locale_parent_id_unique\` ON \`_site_steps_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_apps\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_apps_locales\` (
  	\`apps_title\` text,
  	\`app1_title\` text,
  	\`app1_text\` text,
  	\`app2_title\` text,
  	\`app2_text\` text,
  	\`app3_title\` text,
  	\`app3_text\` text,
  	\`app4_title\` text,
  	\`app4_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_apps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_apps_locales_locale_parent_id_unique\` ON \`site_apps_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_apps_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_apps_v_created_at_idx\` ON \`_site_apps_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_apps_v_updated_at_idx\` ON \`_site_apps_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_apps_v_locales\` (
  	\`version_apps_title\` text,
  	\`version_app1_title\` text,
  	\`version_app1_text\` text,
  	\`version_app2_title\` text,
  	\`version_app2_text\` text,
  	\`version_app3_title\` text,
  	\`version_app3_text\` text,
  	\`version_app4_title\` text,
  	\`version_app4_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_apps_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_apps_v_locales_locale_parent_id_unique\` ON \`_site_apps_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_status\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_status_locales\` (
  	\`status_title\` text,
  	\`status_text\` text,
  	\`status_note\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_status\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_status_locales_locale_parent_id_unique\` ON \`site_status_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_status_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_status_v_created_at_idx\` ON \`_site_status_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_status_v_updated_at_idx\` ON \`_site_status_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_status_v_locales\` (
  	\`version_status_title\` text,
  	\`version_status_text\` text,
  	\`version_status_note\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_status_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_status_v_locales_locale_parent_id_unique\` ON \`_site_status_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_today\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_today_locales\` (
  	\`today_enabled\` text,
  	\`seo_today\` text,
  	\`today_title\` text,
  	\`today_lead\` text,
  	\`today_exists_title\` text,
  	\`today_item1\` text,
  	\`today_item2\` text,
  	\`today_item3\` text,
  	\`today_gap_title\` text,
  	\`today_gap_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_today\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_today_locales_locale_parent_id_unique\` ON \`site_today_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_today_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_today_v_created_at_idx\` ON \`_site_today_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_today_v_updated_at_idx\` ON \`_site_today_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_today_v_locales\` (
  	\`version_today_enabled\` text,
  	\`version_seo_today\` text,
  	\`version_today_title\` text,
  	\`version_today_lead\` text,
  	\`version_today_exists_title\` text,
  	\`version_today_item1\` text,
  	\`version_today_item2\` text,
  	\`version_today_item3\` text,
  	\`version_today_gap_title\` text,
  	\`version_today_gap_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_today_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_today_v_locales_locale_parent_id_unique\` ON \`_site_today_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_about\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_about_locales\` (
  	\`about_title\` text,
  	\`about_text\` text,
  	\`p1_name\` text,
  	\`p1_role\` text,
  	\`p1_bio\` text,
  	\`p1_link\` text,
  	\`p2_name\` text,
  	\`p2_role\` text,
  	\`p2_bio\` text,
  	\`p2_link\` text,
  	\`company_details\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_about\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_about_locales_locale_parent_id_unique\` ON \`site_about_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_about_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_about_v_created_at_idx\` ON \`_site_about_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_about_v_updated_at_idx\` ON \`_site_about_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_about_v_locales\` (
  	\`version_about_title\` text,
  	\`version_about_text\` text,
  	\`version_p1_name\` text,
  	\`version_p1_role\` text,
  	\`version_p1_bio\` text,
  	\`version_p1_link\` text,
  	\`version_p2_name\` text,
  	\`version_p2_role\` text,
  	\`version_p2_bio\` text,
  	\`version_p2_link\` text,
  	\`version_company_details\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_about_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_about_v_locales_locale_parent_id_unique\` ON \`_site_about_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_contact\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_contact_locales\` (
  	\`contact_title\` text,
  	\`contact_text\` text,
  	\`contact_reply\` text,
  	\`linkedin_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_contact\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_contact_locales_locale_parent_id_unique\` ON \`site_contact_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_contact_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_contact_v_created_at_idx\` ON \`_site_contact_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_contact_v_updated_at_idx\` ON \`_site_contact_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_contact_v_locales\` (
  	\`version_contact_title\` text,
  	\`version_contact_text\` text,
  	\`version_contact_reply\` text,
  	\`version_linkedin_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_contact_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_contact_v_locales_locale_parent_id_unique\` ON \`_site_contact_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_aud_municipalities\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_aud_municipalities_locales\` (
  	\`aud_municipalities_seo\` text,
  	\`aud_municipalities_title\` text,
  	\`aud_municipalities_lead\` text,
  	\`aud_municipalities_p1\` text,
  	\`aud_municipalities_p2\` text,
  	\`aud_municipalities_p3\` text,
  	\`aud_municipalities_q1\` text,
  	\`aud_municipalities_a1\` text,
  	\`aud_municipalities_q2\` text,
  	\`aud_municipalities_a2\` text,
  	\`aud_municipalities_q3\` text,
  	\`aud_municipalities_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_aud_municipalities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_aud_municipalities_locales_locale_parent_id_unique\` ON \`site_aud_municipalities_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_municipalities_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_aud_municipalities_v_created_at_idx\` ON \`_site_aud_municipalities_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_aud_municipalities_v_updated_at_idx\` ON \`_site_aud_municipalities_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_municipalities_v_locales\` (
  	\`version_aud_municipalities_seo\` text,
  	\`version_aud_municipalities_title\` text,
  	\`version_aud_municipalities_lead\` text,
  	\`version_aud_municipalities_p1\` text,
  	\`version_aud_municipalities_p2\` text,
  	\`version_aud_municipalities_p3\` text,
  	\`version_aud_municipalities_q1\` text,
  	\`version_aud_municipalities_a1\` text,
  	\`version_aud_municipalities_q2\` text,
  	\`version_aud_municipalities_a2\` text,
  	\`version_aud_municipalities_q3\` text,
  	\`version_aud_municipalities_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_aud_municipalities_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_aud_municipalities_v_locales_locale_parent_id_unique\` ON \`_site_aud_municipalities_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_aud_fleets\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_aud_fleets_locales\` (
  	\`aud_fleets_seo\` text,
  	\`aud_fleets_title\` text,
  	\`aud_fleets_lead\` text,
  	\`aud_fleets_p1\` text,
  	\`aud_fleets_p2\` text,
  	\`aud_fleets_p3\` text,
  	\`aud_fleets_q1\` text,
  	\`aud_fleets_a1\` text,
  	\`aud_fleets_q2\` text,
  	\`aud_fleets_a2\` text,
  	\`aud_fleets_q3\` text,
  	\`aud_fleets_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_aud_fleets\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_aud_fleets_locales_locale_parent_id_unique\` ON \`site_aud_fleets_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_fleets_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_aud_fleets_v_created_at_idx\` ON \`_site_aud_fleets_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_aud_fleets_v_updated_at_idx\` ON \`_site_aud_fleets_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_fleets_v_locales\` (
  	\`version_aud_fleets_seo\` text,
  	\`version_aud_fleets_title\` text,
  	\`version_aud_fleets_lead\` text,
  	\`version_aud_fleets_p1\` text,
  	\`version_aud_fleets_p2\` text,
  	\`version_aud_fleets_p3\` text,
  	\`version_aud_fleets_q1\` text,
  	\`version_aud_fleets_a1\` text,
  	\`version_aud_fleets_q2\` text,
  	\`version_aud_fleets_a2\` text,
  	\`version_aud_fleets_q3\` text,
  	\`version_aud_fleets_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_aud_fleets_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_aud_fleets_v_locales_locale_parent_id_unique\` ON \`_site_aud_fleets_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_aud_manufacturers\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_aud_manufacturers_locales\` (
  	\`aud_manufacturers_seo\` text,
  	\`aud_manufacturers_title\` text,
  	\`aud_manufacturers_lead\` text,
  	\`aud_manufacturers_p1\` text,
  	\`aud_manufacturers_p2\` text,
  	\`aud_manufacturers_p3\` text,
  	\`aud_manufacturers_q1\` text,
  	\`aud_manufacturers_a1\` text,
  	\`aud_manufacturers_q2\` text,
  	\`aud_manufacturers_a2\` text,
  	\`aud_manufacturers_q3\` text,
  	\`aud_manufacturers_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_aud_manufacturers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_aud_manufacturers_locales_locale_parent_id_unique\` ON \`site_aud_manufacturers_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_manufacturers_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_aud_manufacturers_v_created_at_idx\` ON \`_site_aud_manufacturers_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_aud_manufacturers_v_updated_at_idx\` ON \`_site_aud_manufacturers_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_manufacturers_v_locales\` (
  	\`version_aud_manufacturers_seo\` text,
  	\`version_aud_manufacturers_title\` text,
  	\`version_aud_manufacturers_lead\` text,
  	\`version_aud_manufacturers_p1\` text,
  	\`version_aud_manufacturers_p2\` text,
  	\`version_aud_manufacturers_p3\` text,
  	\`version_aud_manufacturers_q1\` text,
  	\`version_aud_manufacturers_a1\` text,
  	\`version_aud_manufacturers_q2\` text,
  	\`version_aud_manufacturers_a2\` text,
  	\`version_aud_manufacturers_q3\` text,
  	\`version_aud_manufacturers_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_aud_manufacturers_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_aud_manufacturers_v_locales_locale_parent_id_unique\` ON \`_site_aud_manufacturers_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_aud_platforms\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_aud_platforms_locales\` (
  	\`aud_platforms_seo\` text,
  	\`aud_platforms_title\` text,
  	\`aud_platforms_lead\` text,
  	\`aud_platforms_p1\` text,
  	\`aud_platforms_p2\` text,
  	\`aud_platforms_p3\` text,
  	\`aud_platforms_q1\` text,
  	\`aud_platforms_a1\` text,
  	\`aud_platforms_q2\` text,
  	\`aud_platforms_a2\` text,
  	\`aud_platforms_q3\` text,
  	\`aud_platforms_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_aud_platforms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_aud_platforms_locales_locale_parent_id_unique\` ON \`site_aud_platforms_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_platforms_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_aud_platforms_v_created_at_idx\` ON \`_site_aud_platforms_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_aud_platforms_v_updated_at_idx\` ON \`_site_aud_platforms_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_platforms_v_locales\` (
  	\`version_aud_platforms_seo\` text,
  	\`version_aud_platforms_title\` text,
  	\`version_aud_platforms_lead\` text,
  	\`version_aud_platforms_p1\` text,
  	\`version_aud_platforms_p2\` text,
  	\`version_aud_platforms_p3\` text,
  	\`version_aud_platforms_q1\` text,
  	\`version_aud_platforms_a1\` text,
  	\`version_aud_platforms_q2\` text,
  	\`version_aud_platforms_a2\` text,
  	\`version_aud_platforms_q3\` text,
  	\`version_aud_platforms_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_aud_platforms_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_aud_platforms_v_locales_locale_parent_id_unique\` ON \`_site_aud_platforms_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_aud_investors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`site_aud_investors_locales\` (
  	\`aud_investors_seo\` text,
  	\`aud_investors_title\` text,
  	\`aud_investors_lead\` text,
  	\`aud_investors_p1\` text,
  	\`aud_investors_p2\` text,
  	\`aud_investors_p3\` text,
  	\`aud_investors_q1\` text,
  	\`aud_investors_a1\` text,
  	\`aud_investors_q2\` text,
  	\`aud_investors_a2\` text,
  	\`aud_investors_q3\` text,
  	\`aud_investors_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_aud_investors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_aud_investors_locales_locale_parent_id_unique\` ON \`site_aud_investors_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_investors_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_site_aud_investors_v_created_at_idx\` ON \`_site_aud_investors_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_site_aud_investors_v_updated_at_idx\` ON \`_site_aud_investors_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_site_aud_investors_v_locales\` (
  	\`version_aud_investors_seo\` text,
  	\`version_aud_investors_title\` text,
  	\`version_aud_investors_lead\` text,
  	\`version_aud_investors_p1\` text,
  	\`version_aud_investors_p2\` text,
  	\`version_aud_investors_p3\` text,
  	\`version_aud_investors_q1\` text,
  	\`version_aud_investors_a1\` text,
  	\`version_aud_investors_q2\` text,
  	\`version_aud_investors_a2\` text,
  	\`version_aud_investors_q3\` text,
  	\`version_aud_investors_a3\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_site_aud_investors_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_site_aud_investors_v_locales_locale_parent_id_unique\` ON \`_site_aud_investors_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`privacy\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`privacy_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`privacy\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`privacy_locales_locale_parent_id_unique\` ON \`privacy_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_privacy_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_privacy_v_created_at_idx\` ON \`_privacy_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_privacy_v_updated_at_idx\` ON \`_privacy_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_privacy_v_locales\` (
  	\`version_text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_privacy_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_privacy_v_locales_locale_parent_id_unique\` ON \`_privacy_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`photos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`hero_id\` integer,
  	\`problem_id\` integer,
  	\`status_id\` integer,
  	\`social_id\` integer,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`hero_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`problem_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`status_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`social_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`photos_hero_idx\` ON \`photos\` (\`hero_id\`);`)
  await db.run(sql`CREATE INDEX \`photos_problem_idx\` ON \`photos\` (\`problem_id\`);`)
  await db.run(sql`CREATE INDEX \`photos_status_idx\` ON \`photos\` (\`status_id\`);`)
  await db.run(sql`CREATE INDEX \`photos_social_idx\` ON \`photos\` (\`social_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`pages\`;`)
  await db.run(sql`DROP TABLE \`pages_locales\`;`)
  await db.run(sql`DROP TABLE \`_pages_v\`;`)
  await db.run(sql`DROP TABLE \`_pages_v_locales\`;`)
  await db.run(sql`DROP TABLE \`messages\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`totp_attempts\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`site_site\`;`)
  await db.run(sql`DROP TABLE \`site_site_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_site_v\`;`)
  await db.run(sql`DROP TABLE \`_site_site_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_home\`;`)
  await db.run(sql`DROP TABLE \`site_home_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_home_v\`;`)
  await db.run(sql`DROP TABLE \`_site_home_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_seo\`;`)
  await db.run(sql`DROP TABLE \`site_seo_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_seo_v\`;`)
  await db.run(sql`DROP TABLE \`_site_seo_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_hero\`;`)
  await db.run(sql`DROP TABLE \`site_hero_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_hero_v\`;`)
  await db.run(sql`DROP TABLE \`_site_hero_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_problem\`;`)
  await db.run(sql`DROP TABLE \`site_problem_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_problem_v\`;`)
  await db.run(sql`DROP TABLE \`_site_problem_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_steps\`;`)
  await db.run(sql`DROP TABLE \`site_steps_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_steps_v\`;`)
  await db.run(sql`DROP TABLE \`_site_steps_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_apps\`;`)
  await db.run(sql`DROP TABLE \`site_apps_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_apps_v\`;`)
  await db.run(sql`DROP TABLE \`_site_apps_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_status\`;`)
  await db.run(sql`DROP TABLE \`site_status_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_status_v\`;`)
  await db.run(sql`DROP TABLE \`_site_status_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_today\`;`)
  await db.run(sql`DROP TABLE \`site_today_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_today_v\`;`)
  await db.run(sql`DROP TABLE \`_site_today_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_about\`;`)
  await db.run(sql`DROP TABLE \`site_about_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_about_v\`;`)
  await db.run(sql`DROP TABLE \`_site_about_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_contact\`;`)
  await db.run(sql`DROP TABLE \`site_contact_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_contact_v\`;`)
  await db.run(sql`DROP TABLE \`_site_contact_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_aud_municipalities\`;`)
  await db.run(sql`DROP TABLE \`site_aud_municipalities_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_municipalities_v\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_municipalities_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_aud_fleets\`;`)
  await db.run(sql`DROP TABLE \`site_aud_fleets_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_fleets_v\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_fleets_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_aud_manufacturers\`;`)
  await db.run(sql`DROP TABLE \`site_aud_manufacturers_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_manufacturers_v\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_manufacturers_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_aud_platforms\`;`)
  await db.run(sql`DROP TABLE \`site_aud_platforms_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_platforms_v\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_platforms_v_locales\`;`)
  await db.run(sql`DROP TABLE \`site_aud_investors\`;`)
  await db.run(sql`DROP TABLE \`site_aud_investors_locales\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_investors_v\`;`)
  await db.run(sql`DROP TABLE \`_site_aud_investors_v_locales\`;`)
  await db.run(sql`DROP TABLE \`privacy\`;`)
  await db.run(sql`DROP TABLE \`privacy_locales\`;`)
  await db.run(sql`DROP TABLE \`_privacy_v\`;`)
  await db.run(sql`DROP TABLE \`_privacy_v_locales\`;`)
  await db.run(sql`DROP TABLE \`photos\`;`)
}
