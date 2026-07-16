#!/usr/bin/env node
// 로그인 도우미 (npm run login)
// 브라우저를 띄워 사용자가 '직접' 로그인(휴대폰 본인인증 포함)하도록 합니다.
// 로그인이 끝난 뒤 이 터미널에서 Enter 를 누르면, 로그인 상태가 user-data 프로필에 저장되어
// 이후 `npm run book` 실행 시 로그인된 상태로 시작합니다.

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { openPersistentContext, firstPage, resolveUserDataDir, ROOT } from './browser.js';
import { join } from 'node:path';

function loadConfig() {
  const path = join(ROOT, 'config.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  return { selectors: { loginUrl: 'https://www.knpark.com/' } };
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

const cfg = loadConfig();
const loginUrl = cfg.selectors?.loginUrl || 'https://www.knpark.com/';

// 로그인은 반드시 창을 보면서 해야 하므로 headless 를 강제로 끈다.
const context = await openPersistentContext(cfg, { headless: false });
const page = firstPage(context);

console.log('===== KNPARK 로그인 도우미 =====');
console.log(`프로필 저장 위치: ${resolveUserDataDir(cfg)}`);
console.log(`로그인 페이지로 이동합니다: ${loginUrl}`);

try {
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.warn(`[안내] 페이지 자동 이동 실패(${e.message.split('\n')[0]}). 창에서 직접 주소로 이동하셔도 됩니다.`);
}

console.log('\n브라우저 창에서 로그인(아이디/비밀번호 + 휴대폰 본인인증)을 완료하세요.');
console.log('로그인이 끝나면 이 터미널로 돌아와 Enter 를 누르면 로그인 상태가 저장됩니다.\n');

await ask('로그인을 마쳤으면 Enter 를 누르세요... ');

console.log('로그인 상태를 저장하고 창을 닫습니다.');
await context.close();
console.log('완료! 이제 `npm run book` 을 실행하면 로그인된 상태로 시작합니다.');
