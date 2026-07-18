#!/usr/bin/env node
// 셀렉터 확인 도우미 (npm run inspect)
// 저장된 로그인 프로필로 페이지를 열어, 실제 입력창·버튼의 셀렉터를 눈으로 확인합니다.
// Playwright Inspector(page.pause) 가 함께 떠서 요소를 클릭하면 셀렉터를 알려줍니다.
//
// 사용법: npm run inspect  (또는  node src/inspect.js https://www.knpark.com/...)

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openPersistentContext, firstPage, ROOT } from './browser.js';

function loadConfig() {
  const path = join(ROOT, 'config.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  return { selectors: { loginUrl: 'https://www.knpark.com/' } };
}

const cfg = loadConfig();
const url = process.argv[2] || cfg.target?.reservationUrl || cfg.selectors?.loginUrl || 'https://www.knpark.com/';

// 로그인된 상태의 페이지도 확인할 수 있도록 영구 프로필 사용(창은 반드시 보이게)
const context = await openPersistentContext(cfg, { headless: false });
const page = firstPage(context);

// 구매 관련 네트워크 요청을 reserve-requests.log 에 기록(구매하기 클릭 시 오가는 실제 주소 확보용)
const logFile = join(ROOT, 'reserve-requests.log');
page.on('request', (req) => {
  try {
    const u = req.url();
    if (!/season|buy|reserv|apply|purchase|정기/i.test(u) && req.method() !== 'POST') return;
    appendFileSync(logFile, JSON.stringify({
      time: new Date().toISOString(),
      method: req.method(),
      url: u,
      contentType: req.headers()['content-type'] || null,
      postData: req.postData() || null,
    }) + '\n', 'utf-8');
    if (/season|buy|reserv|purchase/i.test(u)) console.log(`[기록] ${req.method()} ${u}`);
  } catch { /* 무시 */ }
});

console.log(`페이지 열기: ${url}`);
console.log('구매하기 등을 클릭하면 오가는 주소가 화면과 reserve-requests.log 에 기록됩니다.');
console.log('(요소 셀렉터는 Playwright Inspector 에서 클릭으로 확인 가능)');
console.log('확인이 끝나면 Inspector 의 Resume 또는 이 창에서 Ctrl+C 로 종료하세요.');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.warn(`[안내] 자동 이동 실패(${e.message.split('\n')[0]}). 창에서 직접 이동하셔도 됩니다.`);
}
await page.pause(); // Playwright Inspector 실행

await context.close();
