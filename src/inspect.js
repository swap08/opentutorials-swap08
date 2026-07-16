#!/usr/bin/env node
// 셀렉터 확인 도우미
// 로그인/예매 페이지를 브라우저로 열어, 실제 입력창·버튼의 셀렉터를 눈으로 확인할 수 있게 합니다.
// Playwright Inspector(page.pause) 가 함께 떠서 요소를 클릭하면 셀렉터를 알려줍니다.
//
// 사용법: npm run inspect  (또는  node src/inspect.js https://www.knpark.com/login.html)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadConfig() {
  const path = join(ROOT, 'config.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  return { selectors: { loginUrl: 'https://www.knpark.com/' } };
}

const cfg = loadConfig();
const url = process.argv[2] || cfg.selectors?.loginUrl || 'https://www.knpark.com/';

const execPath = process.env.KNPARK_BROWSER_PATH || cfg.options?.browserExecutablePath || undefined;
const browser = await chromium.launch({ headless: false, executablePath: execPath });
const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();

console.log(`페이지 열기: ${url}`);
console.log('요소를 클릭하면 Playwright Inspector 가 셀렉터를 보여줍니다.');
console.log('확인이 끝나면 Inspector 의 Resume 또는 이 창에서 Ctrl+C 로 종료하세요.');

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.pause(); // Playwright Inspector 실행

await browser.close();
