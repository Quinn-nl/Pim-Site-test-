#!/usr/bin/env node
'use strict';
/**
 * Writes payload/src/generated/site-fields.json from lib/fields.js, so the Payload admin shows exactly the
 * same editable texts (groups, labels, hints) as the website uses. Run after changing lib/fields.js:
 *   npm run payload:fields
 */
const fs = require('fs');
const path = require('path');
const { GROUPS, IMAGE_SLOTS } = require('../lib/fields');

const out = {
	groups: GROUPS.map((g) => ({ id: g.id, title: g.title, fields: g.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) })),
	imageSlots: IMAGE_SLOTS.map((s) => ({ slot: s.slot, label: s.label })),
};
const file = path.join(__dirname, '..', 'payload', 'src', 'generated', 'site-fields.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${file}: ${out.groups.reduce((n, g) => n + g.fields.length, 0)} fields in ${out.groups.length} groups, ${out.imageSlots.length} photo slots.`);
