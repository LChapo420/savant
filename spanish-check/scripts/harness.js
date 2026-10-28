#!/usr/bin/env node
'use strict';
/**
 * Throwaway Express host for testing routes/spanish-check.js and the page without starting the real app
 * (the real app is never started or touched). Uses the app's own security-header middleware so a CSP problem
 * shows up here. The signed-in user is faked from FAKE_USER (default 6689). Results go to SPANISH_CHECK_RESULTS_DIR.
 *   SPANISH_CHECK_RESULTS_DIR=... PORT=6899 node spanish-check/scripts/harness.js
 */
const path = require('path');
const express = require(path.join(__dirname, '..', '..', 'node_modules', 'express'));
const { securityHeaders } = require('../../middleware/security');

const app = express();
const PORT = Number(process.env.PORT || 6899);
const USER = Number(process.env.FAKE_USER || 6689);
app.use(securityHeaders);
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => { const h = req.get('x-fake-user'); const id = h !== undefined ? Number(h) : USER; req.user = process.env.NO_USER || id === 0 ? null : { id, email: 'test@example.com', display_name: 'Test' }; next(); });
app.get('/api/auth/me', (req, res) => res.json({ user: req.user && { id: req.user.id, email: req.user.email, display_name: 'Test', xp: 0, streak: 0, ux: {}, can_browse: false, retention: false, is_admin: false, onboarded: true, under_13: false } }));
app.use('/api/spanish-check', require('../../routes/spanish-check'));
app.use(express.static(path.join(__dirname, '..', '..', 'public'), { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));
app.listen(PORT, '127.0.0.1', () => console.log(`harness on http://127.0.0.1:${PORT} (user ${USER}, results ${process.env.SPANISH_CHECK_RESULTS_DIR || 'default'})`));
