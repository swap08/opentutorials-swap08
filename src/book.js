#!/usr/bin/env node
// knpark.com 자동 예매 프로그램
// 지정한 시각(서버시간 기준)에 맞춰 예매 페이지 진입 → '신청' 클릭까지 자동화합니다.
//
// 로그인 방식:
//   휴대폰 본인인증이 필요하므로 자동 로그인은 하지 않습니다.
//   먼저 `npm run login` 으로 한 번 직접 로그인해두면, 그 로그인 상태(세션)가
//   user-data 프로필에 저장되어 이 프로그램이 로그인된 상태로 시작합니다.
//
// 사용법:
//   1) config.example.json 을 config.json 으로 복사하고 값을 채웁니다.
//   2) npm install
//   3) npm run login   (한 번 직접 로그인 — 휴대폰 인증 포함)
//   4) npm run book
//
// 주의:
//   - 반드시 본인 계정으로, 사이트 이용약관이 허용하는 범위(개인 정기권 신청 등)에서만 사용하세요.
//   - 대량 신청/재판매 목적의 매크로 사용은 약관 위반 및 법적 문제가 될 수 있습니다.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { openPersistentContext, firstPage, ROOT } from './browser.js';
import { getServerTimeOffset } from './serverTime.js';

function loadConfig() {
  const path = join(ROOT, 'config.json');
  if (!existsSync(path)) {
    console.error('config.json 이 없습니다. config.example.json 을 복사해 config.json 을 만들고 값을 채우세요.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// "2026-07-20T10:00:00" (KST) → epoch ms
function kstToEpochMs(kstString) {
  const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(kstString);
  const iso = hasTz ? kstString : `${kstString}+09:00`;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`schedule.targetTimeKST 형식이 잘못되었습니다: ${kstString} (예: 2026-07-20T10:00:00)`);
  }
  return ms;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

// 네트워크 오류/서버 과부하 시 페이지 이동을 몇 번 재시도한다.
async function gotoWithRetry(page, url, { retries = 3, waitUntil = 'domcontentloaded' } = {}) {
  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil, timeout: 20000 });
      return true;
    } catch (e) {
      lastErr = e;
      console.warn(`[이동] ${url} 접속 실패(${i}/${retries}): ${e.message.split('\n')[0]}`);
      await sleep(500);
    }
  }
  throw lastErr;
}

function fmt(ms) {
  return new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

async function shot(page, cfg, name) {
  if (!cfg.options?.screenshots) return;
  const dir = join(ROOT, 'screenshots');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: join(dir, `${Date.now()}-${name}.png`), fullPage: true });
  } catch { /* 스크린샷 실패는 무시 */ }
}

async function clickAny(page, selector, { timeout = 5000 } = {}) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
}

// 저장된 세션으로 로그인 상태인지 확인. 아니면(가능하면) 창에서 직접 로그인하도록 대기.
async function ensureLoggedIn(page, cfg, serverNow, deadlineMs) {
  const check = cfg.selectors?.loginCheck?.trim();
  const isLoggedIn = async () => {
    if (!check) return null; // 확인용 셀렉터가 없으면 판별 불가
    return (await page.locator(check).count()) > 0;
  };

  const logged = await isLoggedIn();
  if (logged === null) {
    console.warn('[로그인] selectors.loginCheck 가 설정되지 않아 로그인 상태를 자동 확인할 수 없습니다.');
    console.warn('[로그인] 창이 로그인된 상태인지 눈으로 확인하세요. (권장: loginCheck 설정)');
    return;
  }
  if (logged) {
    console.log('[로그인] 저장된 세션으로 로그인된 상태입니다. ✔');
    return;
  }

  // 로그인 안 됨
  console.warn('[로그인] 로그인 상태가 아닙니다.');
  if (cfg.options?.headless) {
    throw new Error('로그인 상태가 아니며 headless 모드라 직접 로그인할 수 없습니다. headless 를 false 로 두고 다시 실행하세요.');
  }

  // 창이 보이는 모드면, 목표 시각 직전까지 직접 로그인할 기회를 준다.
  console.log('\n>>> 지금 브라우저 창에서 로그인하세요! <<<');
  console.log('    (주소창에 www.knpark.com 입력 → 로그인 → 휴대폰 본인인증)');
  console.log('    로그인이 확인되면 자동으로 예매 시각까지 대기합니다.\n');
  for (;;) {
    if (await isLoggedIn()) {
      console.log('[로그인] 로그인 확인됨. ✔');
      return;
    }
    if (deadlineMs && serverNow().getTime() > deadlineMs) {
      console.warn('[로그인] 예매 시각이 지나도록 로그인이 확인되지 않았습니다.');
      console.warn('[로그인] (로그인이 안 되면 목록/구매 페이지가 안 보여 예매가 실패합니다. 다음엔 더 일찍 실행해 로그인하세요.)');
      return;
    }
    await sleep(1000);
  }
}

// 목표 시각까지 대기하면서, 로그인 세션이 풀리지 않도록 주기적으로 새로고침한다.
async function waitWithKeepAlive(page, cfg, untilMs, serverNow) {
  const keepAliveMs = (cfg.options?.keepAliveSeconds ?? 120) * 1000;
  if (serverNow().getTime() >= untilMs) return;
  console.log(`[대기] 예매 준비 시각까지 대기합니다: ${fmt(untilMs)}`);
  let lastReload = serverNow().getTime();
  for (;;) {
    const now = serverNow().getTime();
    const remaining = untilMs - now;
    if (remaining <= 0) return;
    // 준비 시각까지 5초 이상 남았고, 마지막 새로고침 후 keepAlive 간격이 지났으면 새로고침
    if (keepAliveMs > 0 && remaining > 5000 && now - lastReload >= keepAliveMs) {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      lastReload = now;
      console.log(`[유지] 세션 유지용 새로고침 (남은 ${(remaining / 1000).toFixed(0)}초)`);
    }
    if (Math.floor(remaining / 1000) % 30 === 0 && remaining > 5000) {
      console.log(`[대기] 남은 시간 약 ${(remaining / 1000).toFixed(0)}초...`);
    }
    await sleep(1000);
  }
}

// 목표 시각(서버시간)까지 정밀 대기.
async function waitUntilServerTime(targetEpochMs, serverNow, label) {
  console.log(`[대기] ${label} 목표 서버시각: ${fmt(targetEpochMs)}`);
  for (;;) {
    const remaining = targetEpochMs - serverNow().getTime();
    if (remaining <= 0) return;
    if (remaining > 5000) {
      if (Math.floor(remaining / 1000) % 10 === 0) {
        console.log(`[대기] 남은 시간 ${(remaining / 1000).toFixed(0)}초...`);
      }
      await sleep(1000);
    } else if (remaining > 500) {
      await sleep(100);
    } else {
      while (serverNow().getTime() < targetEpochMs) { /* spin */ }
      return;
    }
  }
}

// 페이지네이션에서 지정한 번호 링크를 여러 방식으로 시도해 클릭한다.
async function clickPageLink(page, pageNo) {
  const re = new RegExp(`^\\s*${pageNo}\\s*$`);
  const candidates = [
    page.getByRole('link', { name: String(pageNo), exact: true }),
    page.locator('a').filter({ hasText: re }),
    page.locator('[class*=pag] a, [id*=pag] a, .paginate a, .pagination a, .paging a').filter({ hasText: re }),
    page.locator('a[href*="age"]').filter({ hasText: re }), // page/Page/pageIndex 등
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if (await el.count()) {
      await el.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return true;
    }
  }
  return false;
}

// 진단용: 대상 페이지/행을 못 찾을 때 현재 상태를 화면에 출력한다.
async function dumpDiagnostics(page, cfg) {
  try {
    console.warn('----- 진단 정보 -----');
    console.warn('현재 주소:', page.url());
    const check = cfg.selectors?.loginCheck?.trim();
    if (check) {
      const loggedIn = (await page.locator(check).count()) > 0;
      console.warn('로그인 상태:', loggedIn ? '로그인됨' : '로그인 안 됨(← 목록/페이지가 안 보이는 원인일 수 있음)');
    }
    const links = await page.locator('a').filter({ hasText: /^\s*\d+\s*$/ }).allInnerTexts().catch(() => []);
    console.warn('숫자 링크(페이지네이션 후보):', links.map((s) => s.trim()).filter(Boolean).join(' ') || '(없음)');
    const hasItem = (await page.getByText(cfg.target.itemText, { exact: true }).count()) > 0;
    console.warn(`대상 행 '${cfg.target.itemText}' 존재:`, hasItem ? '있음' : '없음');
    console.warn('---------------------');
  } catch { /* 진단 실패는 무시 */ }
}

// 대상 항목이 있는 목록 페이지로 이동한다.
// - target.pageUrl 이 있으면 그 주소로 바로 이동(가장 확실)
// - 없으면 reservationUrl 로 간 뒤, 페이지 번호(target.pageNo)를 클릭해 이동
async function goToItemPage(page, cfg) {
  const t = cfg.target;
  if (t.pageUrl && t.pageUrl.trim()) {
    await gotoWithRetry(page, t.pageUrl);
  } else {
    await gotoWithRetry(page, t.reservationUrl);
    const pageNo = Number(t.pageNo) || 1;
    if (pageNo > 1) {
      const clicked = await clickPageLink(page, pageNo);
      if (!clicked) console.warn(`[이동] ${pageNo}페이지 링크를 찾지 못했습니다.`);
    }
  }
  // 대상 항목 행이 나타날 때까지 잠깐 대기 (정확히 일치하는 텍스트로)
  if (t.itemText && t.itemText.trim()) {
    const appeared = await page
      .getByText(t.itemText, { exact: true })
      .first()
      .waitFor({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) await dumpDiagnostics(page, cfg);
  }
}

// itemText 와 '정확히 일치'하는 셀을 가진 행을 반환 (예: '대전역 선상' 이 '서대전역 선상' 을 잘못 잡지 않도록)
function itemRow(page, itemText) {
  return page.locator('tr').filter({ has: page.getByText(itemText, { exact: true }) }).first();
}

// 대상 항목의 '구매하기' 버튼 클릭 (0시에 버튼이 생기므로 새로고침하며 재시도)
async function clickReserve(page, cfg) {
  const { selectors, target, options } = cfg;
  const retries = options?.clickRetries ?? 60;
  const interval = options?.clickIntervalMs ?? 250;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 8회마다(또는 첫 시도) 새로고침+페이지 이동으로 최신 접수상태를 가져온다
      if (attempt === 1 || attempt % 8 === 0) {
        if (attempt > 1) console.log(`[신청] 재시도 중... (${attempt}/${retries}) — 새로고침 후 대상 페이지로 이동`);
        await goToItemPage(page, cfg);
      }

      // 대상 주차장 행으로 범위를 좁힘 (정확 일치)
      let scope = page;
      if (target.itemText && target.itemText.trim()) {
        const row = itemRow(page, target.itemText);
        if (await row.count()) scope = row;
        else { await sleep(interval); continue; } // 아직 행이 없으면 다음 시도
      }

      const btn = scope.locator(selectors.reserveButton).first();
      await btn.waitFor({ state: 'visible', timeout: interval });
      await btn.click({ timeout: 2000 });
      console.log(`[신청] '구매하기' 클릭 성공 (시도 ${attempt}회)`);
      return true;
    } catch {
      await sleep(interval);
    }
  }
  console.warn('[신청] 자동 클릭에 실패했습니다. 창에서 직접 대전 선상주차장 구매를 진행해 주세요.');
  return false;
}

async function main() {
  const cfg = loadConfig();
  const targetEpochMs = kstToEpochMs(cfg.schedule.targetTimeKST);
  const warmupMs = (cfg.schedule.warmupSeconds ?? 60) * 1000;
  const fireLeadMs = cfg.schedule.fireLeadMs ?? 200;

  console.log('===== KNPARK 자동 예매 =====');
  console.log(`목표 시각(KST): ${fmt(targetEpochMs)}`);

  // 1) 서버시간 동기화
  console.log('[동기화] 서버시간을 확인합니다...');
  const { offsetMs, rttMs, serverNow } = await getServerTimeOffset(cfg.target.reservationUrl || undefined);
  console.log(`[동기화] 시계 오차 ${offsetMs.toFixed(0)}ms, RTT ${rttMs}ms`);
  console.log(`[동기화] 현재 서버시간: ${fmt(serverNow().getTime())}`);

  if (serverNow().getTime() > targetEpochMs) {
    console.warn('[경고] 이미 목표 시각이 지났습니다. 즉시 예매를 시도합니다.');
  }

  // 2) 저장된 로그인 세션으로 영구 프로필 브라우저 실행
  const context = await openPersistentContext(cfg);
  const page = firstPage(context);

  try {
    // 3) 프로그램 시작 즉시 예매 페이지로 이동 + 로그인 확인
    //    로그인이 안 돼 있으면 지금 창에서 직접 로그인하도록 기다립니다.
    //    (창을 계속 열어두므로 세션 방식 로그인도 예매 시각까지 유지됩니다)
    console.log('[진입] 예매 페이지로 이동합니다...');
    await gotoWithRetry(page, cfg.target.reservationUrl);
    await shot(page, cfg, 'reservation-page');

    await ensureLoggedIn(page, cfg, serverNow, targetEpochMs - fireLeadMs);

    // 4) 목표 시각 직전(warmup)까지 대기 — 그동안 주기적으로 새로고침해 세션 유지
    const warmupAt = targetEpochMs - warmupMs;
    await waitWithKeepAlive(page, cfg, warmupAt, serverNow);

    // 대상 항목이 있는 페이지(예: 3페이지)로 미리 이동해 대기
    await goToItemPage(page, cfg);

    // 5) 목표 시각(- fireLead)까지 정밀 대기 후 신청
    await waitUntilServerTime(targetEpochMs - fireLeadMs, serverNow, '예매 시작');
    console.log(`[발사] ${fmt(serverNow().getTime())} — 신청을 시작합니다!`);

    const ok = await clickReserve(page, cfg);
    await shot(page, cfg, 'after-reserve');

    if (ok && cfg.selectors.confirmButton) {
      try {
        await clickAny(page, cfg.selectors.confirmButton, { timeout: 3000 });
        console.log('[확인] 확인/결제 버튼을 눌렀습니다.');
        await shot(page, cfg, 'after-confirm');
      } catch { /* 없으면 통과 */ }
    }

    // 5) 캡차/결제를 위해 창을 열어둠
    const keep = cfg.options?.keepOpenSeconds ?? 0;
    if (keep > 0) {
      console.log(`[대기] ${keep}초 동안 창을 열어둡니다. 필요한 경우 결제/캡차를 진행하세요.`);
      await sleep(keep * 1000);
    } else {
      console.log('[대기] 창을 열어둔 채 대기합니다. 결제/캡차를 마친 뒤 이 터미널에서 Enter 를 누르면 종료됩니다.');
      await ask('');
    }
  } catch (e) {
    console.error('[오류]', e.message || e);
    await shot(page, cfg, 'error');
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
