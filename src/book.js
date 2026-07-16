#!/usr/bin/env node
// knpark.com 자동 예매 프로그램
// 지정한 시각(서버시간 기준)에 맞춰 로그인 → 예매 페이지 진입 → '신청' 클릭까지 자동화합니다.
// 캡차/결제처럼 사람이 직접 해야 하는 단계는 창을 열어둔 채 대기합니다.
//
// 사용법:
//   1) config.example.json 을 config.json 으로 복사하고 값을 채웁니다.
//   2) npm install
//   3) npm run book
//
// 주의:
//   - 반드시 본인 계정으로, 사이트 이용약관이 허용하는 범위(개인 정기권 신청 등)에서만 사용하세요.
//   - 대량 신청/재판매 목적의 매크로 사용은 약관 위반 및 법적 문제가 될 수 있습니다.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { getServerTimeOffset } from './serverTime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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
  // 이미 오프셋이 붙어 있으면 그대로, 아니면 +09:00(KST) 를 붙여 해석
  const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(kstString);
  const iso = hasTz ? kstString : `${kstString}+09:00`;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`schedule.targetTimeKST 형식이 잘못되었습니다: ${kstString} (예: 2026-07-20T10:00:00)`);
  }
  return ms;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 여러 후보 셀렉터(콤마 구분) 중 먼저 나타나는 것을 클릭
async function clickAny(page, selector, { timeout = 5000 } = {}) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
}

async function fillAny(page, selector, value, { timeout = 5000 } = {}) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.fill(value);
}

async function login(page, cfg) {
  const { selectors, credentials } = cfg;
  console.log('[로그인] 로그인 페이지로 이동합니다...');
  await gotoWithRetry(page, selectors.loginUrl);
  await shot(page, cfg, 'login-page');

  try {
    await fillAny(page, selectors.idInput, credentials.id);
    await fillAny(page, selectors.passwordInput, credentials.password);
    await clickAny(page, selectors.loginButton);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('[로그인] 로그인 시도 완료.');
  } catch (e) {
    console.warn(`[로그인] 자동 로그인 실패: ${e.message}`);
    console.warn('[로그인] 브라우저 창에서 직접 로그인해 주세요. 로그인 후 자동으로 계속됩니다.');
  }
  await shot(page, cfg, 'after-login');
}

// 목표 시각(서버시간)까지 정밀 대기. 남은 시간에 따라 sleep 간격을 좁혀 정확도를 높인다.
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
      // 마지막 500ms 는 바쁜 대기(busy-wait)로 최대한 정밀하게
      while (serverNow().getTime() < targetEpochMs) { /* spin */ }
      return;
    }
  }
}

// 예매 대상 항목 선택(itemText 가 지정된 경우 해당 행/카드 안의 신청 버튼을 우선)
async function clickReserve(page, cfg) {
  const { selectors, target, options } = cfg;
  const retries = options?.clickRetries ?? 40;
  const interval = options?.clickIntervalMs ?? 250;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let scope = page;
      if (target.itemText && target.itemText.trim()) {
        // itemText 를 포함하는 가장 가까운 행/카드로 범위를 좁힌다
        const row = page
          .locator(`tr:has-text("${target.itemText}"), li:has-text("${target.itemText}"), div:has-text("${target.itemText}")`)
          .first();
        if (await row.count()) scope = row;
      }
      const btn = scope.locator(selectors.reserveButton).first();
      await btn.waitFor({ state: 'visible', timeout: interval });
      await btn.click({ timeout: 2000 });
      console.log(`[신청] 신청 버튼 클릭 성공 (시도 ${attempt}회)`);
      return true;
    } catch {
      if (attempt % 8 === 0) {
        console.log(`[신청] 재시도 중... (${attempt}/${retries}) — 페이지를 새로고침합니다.`);
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      await sleep(interval);
    }
  }
  console.warn('[신청] 자동 클릭에 실패했습니다. 창에서 직접 신청을 진행해 주세요.');
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

  // 2) 브라우저 실행 + 로그인 (목표 시각 warmup 이전에 미리 준비)
  const execPath = process.env.KNPARK_BROWSER_PATH || cfg.options?.browserExecutablePath || undefined;
  const proxyServer = process.env.KNPARK_PROXY || cfg.options?.proxyServer || undefined;
  const browser = await chromium.launch({
    headless: cfg.options?.headless ?? false,
    executablePath: execPath,
    proxy: proxyServer ? { server: proxyServer } : undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    // 목표 - warmup 시각까지 여유가 있으면 그때까지 기다렸다가 로그인
    const warmupAt = targetEpochMs - warmupMs;
    if (serverNow().getTime() < warmupAt) {
      await waitUntilServerTime(warmupAt, serverNow, '준비(warmup)');
    }

    await login(page, cfg);

    // 3) 예매 페이지 진입
    console.log('[진입] 예매 페이지로 이동합니다...');
    await gotoWithRetry(page, cfg.target.reservationUrl);
    await shot(page, cfg, 'reservation-page');

    // 4) 목표 시각(- fireLead)까지 정밀 대기 후 신청
    await waitUntilServerTime(targetEpochMs - fireLeadMs, serverNow, '예매 시작');
    console.log(`[발사] ${fmt(serverNow().getTime())} — 신청을 시작합니다!`);

    const ok = await clickReserve(page, cfg);
    await shot(page, cfg, 'after-reserve');

    // 확인/결제 버튼이 있으면 한 번 눌러줌(있을 때만)
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
      console.log('[대기] 창을 열어둔 채 대기합니다. 결제/캡차를 마친 뒤 Ctrl+C 로 종료하세요.');
      await new Promise(() => {}); // 무한 대기
    }
  } catch (e) {
    console.error('[오류]', e);
    await shot(page, cfg, 'error');
  } finally {
    // keepOpenSeconds 가 설정된 경우에만 정상 종료로 브라우저를 닫음
    if ((cfg.options?.keepOpenSeconds ?? 0) > 0) {
      await browser.close();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
