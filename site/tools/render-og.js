#!/usr/bin/env node
/**
 * Renders site/og.png (1200 x 630, the link preview) from tools/og.html with Playwright.
 *   NODE_PATH=<folder with node_modules/playwright> node tools/render-og.js
 * Playwright is not a dependency of the site; use any install of it.
 */
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, 'og.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, '..', 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log('wrote og.png');
})().catch((e) => { console.error(e.message); process.exit(1); });
