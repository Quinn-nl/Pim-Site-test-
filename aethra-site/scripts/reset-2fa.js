#!/usr/bin/env node
'use strict';
/** Usage: npm run reset-2fa  (run on the server). Turns two-step verification off, for when the phone and recovery codes are lost. */
const auth = require('../lib/auth');
auth.disableTwoFactor();
console.log('Two-step verification is off. Log in with the password and set it up again.');
