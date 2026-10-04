import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const logo = await readFile('public/icons/logo.svg', 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;background:linear-gradient(125deg,#064e49,#0f766e 70%,#14b8a6);font-family:Arial,sans-serif;color:white}.tile{height:100%;display:flex;align-items:center;gap:22px;padding:32px}.logo{width:128px;flex-shrink:0}.name{font-size:32px;letter-spacing:-1px;font-weight:750}.sub{font-size:16px;line-height:1.5;color:#ccfbf1;margin-top:10px}.line{width:44px;height:4px;background:#5eead4;margin-top:20px;border-radius:3px}</style></head><body><div class="tile"><div class="logo">${logo}</div><div><div class="name">easyApply</div><div class="sub">Your details.<br>Ready to apply.</div><div class="line"></div></div></div></body></html>`;
await mkdir('release/store-assets', {recursive:true});
await writeFile('release/store-assets/promo.html', html);
const browser = await chromium.launch({executablePath:process.env.APPLYEASE_CHROMIUM || path.resolve('.browser/chrome.exe'),headless:true});
try { const page=await browser.newPage({viewport:{width:440,height:280},deviceScaleFactor:1}); await page.setContent(html); await page.screenshot({path:'release/store-assets/promo-440x280.png'}); }
finally { await browser.close(); }
console.log('Generated 440x280 promotional tile from the existing logo.');
