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

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
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

// 로그인 확인: 저장된 세션이면 통과, 아니면 '직접 로그인 후 Enter' 로 확인한다.
// (자동 감지가 실패해도 사용자가 Enter 로 확정하므로 확실하다)
async function ensureLoggedIn(page, cfg) {
  const check = cfg.selectors?.loginCheck?.trim();
  const isLoggedIn = async () => {
    if (!check) return null;
    return (await page.locator(check).count()) > 0;
  };

  if ((await isLoggedIn()) === true) {
    console.log('[로그인] 이미 로그인된 상태입니다. ✔');
    return;
  }

  if (cfg.options?.headless) {
    throw new Error('로그인이 필요하지만 headless 모드입니다. options.headless 를 false 로 두고 다시 실행하세요.');
  }

  console.log('\n============================================================');
  console.log(' 브라우저 창에서 로그인하세요.');
  console.log('  1) (로그인 화면이 아니면) 주소창에 www.knpark.com 입력');
  console.log('  2) 로그인 + 휴대폰 본인인증 완료');
  console.log('  ※ 반드시 "이 프로그램이 연 브라우저 창" 에서 로그인하세요.');
  console.log('     (평소 쓰던 다른 크롬 창에서 로그인하면 인식되지 않습니다)');
  console.log('============================================================');
  await ask('\n>>> 로그인을 완료했으면 여기서 Enter 를 누르세요... ');

  const after = await isLoggedIn();
  if (after === false) {
    console.warn('[로그인] 로그아웃 표시를 아직 못 찾았습니다. 브라우저에 "로그아웃/이현섭님" 이 보이면 정상입니다.');
    console.warn('[로그인] 그대로 계속 진행합니다.');
  } else {
    console.log('[로그인] 확인되었습니다. ✔');
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

// 목록 3페이지 HTML(문자열)에서 특정 주차장 행의 getSeasonBuyDetail('pluNo','code') 를 뽑는다.
// 셀 경계('>이름<')로 매칭해 '서대전역 선상' 같은 유사 이름 오탐을 방지한다.
function extractBuyCall(html, itemText) {
  if (!html || !itemText) return null;
  const idx = html.indexOf('>' + itemText + '<');
  if (idx < 0) return null;
  const after = html.slice(idx, idx + 4000);
  const nextRow = after.search(/<tr[\s>]/i);
  const seg = nextRow > 0 ? after.slice(0, nextRow) : after; // 같은 행 안으로 한정
  const m = seg.match(/getSeasonBuyDetail\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
  return m ? { fn: 'getSeasonBuyDetail', args: [m[1], m[2]] } : null;
}

// "getSeasonBuyDetail('180443','FT...')" 같은 문자열에서 함수명과 인자를 뽑아낸다.
function parseJsCall(code) {
  if (!code) return null;
  const s = code.replace(/^javascript:/i, '').trim();
  const m = s.match(/([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (!m) return null;
  const fn = m[1];
  const args = m[2].trim()
    ? m[2].split(',').map((a) => a.trim().replace(/^['"]|['"]$/g, ''))
    : [];
  return { fn, args };
}

// 구매하기 버튼을 '실행'한다. 버튼 안의 함수(getSeasonBuyDetail 등)를 직접 호출(가장 빠르고 안정적),
// 안 되면 일반 클릭으로 폴백.
async function fireBuy(page, btn) {
  const code = await btn.evaluate((el) => el.getAttribute('onclick') || el.getAttribute('href') || '').catch(() => '');
  const call = parseJsCall(code);
  if (call) {
    const ran = await page.evaluate(({ fn, args }) => {
      if (typeof window[fn] === 'function') { window[fn](...args); return true; }
      return false;
    }, call).catch(() => false);
    if (ran) return `함수 ${call.fn}(${call.args.join(', ')}) 직접 호출`;
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 3000 });
  return '버튼 클릭';
}

// '구매하기' 버튼이 처음 나타난 순간, 그 실제 주소(href/onclick)를 화면과 파일에 기록한다.
// → 다음 실행부터 target.buyUrl 에 그 주소를 넣으면 '직행 모드' 로 훨씬 빠르게 예매할 수 있다.
async function captureBuyTarget(btn) {
  try {
    const info = await btn.evaluate((n) => ({
      href: n.getAttribute('href'),
      onclick: n.getAttribute('onclick'),
      html: n.outerHTML,
    }));
    console.log('\n★★★ 구매 버튼 정보(포착) ★★★');
    console.log(' href   :', info.href || '(없음)');
    console.log(' onclick:', info.onclick || '(없음)');
    console.log(' html   :', (info.html || '').slice(0, 300));
    console.log('  → 이 정보를 알려주시면 다음엔 "직행 모드" 로 더 빠르게 만들 수 있습니다.\n');
    writeFileSync(join(ROOT, 'buy-target.txt'), JSON.stringify(info, null, 2), 'utf-8');
  } catch { /* 포착 실패는 무시 */ }
}

// 구매 관련 네트워크 요청(주소/방식/POST 데이터)을 파일에 기록한다.
// → 실제 0시에 오가는 '구매 요청' 을 확보해, 다음엔 '직접 요청 발사(가장 빠름)' 로 만들 수 있다.
function attachNetworkCapture(page, cfg) {
  if (cfg.options?.captureNetwork === false) return;
  const file = join(ROOT, 'reserve-requests.log');
  page.on('request', (req) => {
    try {
      const u = req.url();
      const isBuyish = /season|buy|reserv|apply|purchase|정기/i.test(u);
      if (!isBuyish && req.method() !== 'POST') return;
      appendFileSync(file, JSON.stringify({
        time: new Date().toISOString(),
        method: req.method(),
        url: u,
        contentType: req.headers()['content-type'] || null,
        postData: req.postData() || null,
      }) + '\n', 'utf-8');
    } catch { /* 기록 실패 무시 */ }
  });
}

// 페이지가 '유효한 구매 페이지' 인지 대략 판별(에러/접수전 문구가 없고 구매/결제 요소가 있으면 성공)
async function looksLikeBuyPage(page, cfg) {
  const bad = await page.locator("text=/접수\\s*전|없는\\s*페이지|4[0-9]4|오류|권한/").count().catch(() => 0);
  if (bad) return false;
  const sel = cfg.selectors.confirmButton?.trim() || cfg.selectors.reserveButton;
  return (await page.locator(sel).first().count().catch(() => 0)) > 0;
}

// 대상 항목의 '구매하기' 실행.
// - target.buyUrl 이 있으면: 그 주소로 '직행'(가장 빠름)
// - 없으면: 목록을 새로고침하며 대상 행의 '구매하기' 를 클릭
// 정상일 땐 짧은 간격으로 촘촘히, 서버가 실제로 오류를 내면 백오프로 물러선다.
// ── 고속 모드 ──
// 목록 페이지를 통째로 새로고침하지 않고, 3페이지 데이터만 POST(getSeasonTicketList.do)로 받아
// 대상 행의 구매코드를 뽑아 즉시 getSeasonBuyDetail 을 호출한다. (한 번의 가벼운 요청 = 훨씬 빠름)
// 전제: page 가 knpark.com 도메인에 있고(같은 출처 fetch + 세션 쿠키), getSeasonBuyDetail 이 정의돼 있어야 함.
async function fastReserve(page, cfg, control = {}, tag = '') {
  const { target, options } = cfg;
  const pfx = tag ? `[고속${tag}] ` : '[고속] ';
  const maxSeconds = options?.maxTrySeconds ?? 180;
  const baseInterval = options?.clickIntervalMs ?? 200;
  const maxBackoff = (options?.maxBackoffSeconds ?? 6) * 1000;
  const listPath = target.listApi || '/season/getSeasonTicketList.do';
  const body = `pageNo=${Number(target.pageNo) || 1}&selector=1&selectornm=`;
  const deadline = Date.now() + maxSeconds * 1000;
  let backoff = 0, cycle = 0, captured = false;

  while (!control.done && Date.now() < deadline) {
    cycle++;
    try {
      // 1) 3페이지 데이터만 POST로 가져오기 (page 컨텍스트 = 로그인 세션 그대로 사용)
      const html = await page.evaluate(async ({ path, body }) => {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body, cache: 'no-store',
        });
        return await res.text();
      }, { path: listPath, body });

      // 2) 대상 행의 구매코드 찾기
      const call = extractBuyCall(html, target.itemText);
      if (call) {
        if (!captured && !control.captured) {
          captured = control.captured = true;
          console.log(`${pfx}구매코드 확보: getSeasonBuyDetail('${call.args[0]}','${call.args[1]}')`);
          try { writeFileSync(join(ROOT, 'buy-target.txt'), JSON.stringify(call, null, 2), 'utf-8'); } catch { /* */ }
        }
        if (control.done) return false;
        // 3) 그 함수를 즉시 호출 → 구매 페이지로 이동
        const ran = await page.evaluate(({ fn, args }) => {
          if (typeof window[fn] === 'function') { window[fn](...args); return true; }
          return false;
        }, call).catch(() => false);
        if (ran) {
          control.done = true; control.winner = page;
          console.log(`${pfx}구매 실행! (${cycle}회, getSeasonBuyDetail 직접 호출)`);
          return true;
        }
      }
      backoff = 0;
    } catch (e) {
      backoff = Math.min(backoff ? backoff * 2 : 1000, maxBackoff);
      console.warn(`${pfx}지연/오류 — ${(backoff / 1000).toFixed(1)}초 후 재시도 (${String(e.message || e).split('\n')[0]})`);
    }
    if (cycle % 20 === 0) console.log(`${pfx}고속 시도 중... (${cycle}회, 남은 ${Math.max(0, Math.round((deadline - Date.now()) / 1000))}초)`);
    await sleep(backoff || baseInterval);
  }
  return false;
}

async function clickReserve(page, cfg, control = {}, tag = '') {
  const { selectors, target, options } = cfg;
  const maxSeconds = options?.maxTrySeconds ?? 180;
  const baseInterval = options?.clickIntervalMs ?? 250;   // 정상일 때 촘촘한 간격
  const maxBackoff = (options?.maxBackoffSeconds ?? 6) * 1000;
  const directUrl = target.buyUrl && target.buyUrl.trim();
  const pfx = tag ? `[신청${tag}] ` : '[신청] ';

  const deadline = Date.now() + maxSeconds * 1000;
  let backoff = 0, cycle = 0, captured = false;

  while (!control.done && Date.now() < deadline) {
    cycle++;
    try {
      if (directUrl) {
        // ── 직행 모드: 구매 URL 로 바로 이동 ──
        await gotoWithRetry(page, target.buyUrl, { retries: 1 });
        if (await looksLikeBuyPage(page, cfg)) {
          if (control.done) return false;
          control.done = true; control.winner = page;
          console.log(`${pfx}구매 페이지 직행 성공! (${cycle}회)`);
          return true;
        }
      } else {
        // ── 목록 모드: 새로고침 → 대상 페이지 → 대상 행의 구매하기 클릭 ──
        await goToItemPage(page, cfg);
        const row = itemRow(page, target.itemText);
        if (await row.count()) {
          const btn = row.locator(selectors.reserveButton).first();
          if (await btn.count()) {
            if (!captured && !control.captured) { captured = control.captured = true; await captureBuyTarget(btn); }
            if (control.done) return false;
            const how = await fireBuy(page, btn);
            control.done = true; control.winner = page;
            console.log(`${pfx}구매 실행 성공! (${cycle}회, ${how})`);
            return true;
          }
          // 행은 있으나 구매버튼 없음 = 접수 시작 전 → 정상, 계속 시도
        }
      }
      backoff = 0; // 페이지를 정상적으로 받았으면 백오프 없음(촘촘히 재시도)
    } catch (e) {
      // 접속 실패/타임아웃 = 서버 과부하 신호 → 대기시간을 늘려 서버를 덜 두들긴다
      backoff = Math.min(backoff ? backoff * 2 : 1000, maxBackoff);
      console.warn(`${pfx}접속 지연/오류 — ${(backoff / 1000).toFixed(1)}초 후 재시도 (${String(e.message || e).split('\n')[0]})`);
    }

    if (cycle % 10 === 0) {
      const remain = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      console.log(`${pfx}계속 시도 중... (${cycle}회, 남은 ${remain}초)`);
    }
    await sleep(backoff || baseInterval);
  }
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
    // 3) 프로그램 시작 즉시 예매 페이지로 이동 + 로그인 확인(Enter 로 확정)
    //    창을 계속 열어두므로 세션 방식 로그인도 예매 시각까지 유지됩니다.
    console.log('[진입] 예매 페이지로 이동합니다...');
    await gotoWithRetry(page, cfg.target.reservationUrl);
    await shot(page, cfg, 'reservation-page');

    await ensureLoggedIn(page, cfg);

    // 로그인 후 대상 페이지(예: 3페이지)로 이동해 잘 보이는지 미리 확인
    console.log('[확인] 대상 목록 페이지로 이동해 봅니다...');
    await goToItemPage(page, cfg);
    if (await itemRow(page, cfg.target.itemText).count()) {
      console.log(`[확인] '${cfg.target.itemText}' 행을 찾았습니다. ✔ (지금은 접수전이라 구매 버튼은 0시에 생깁니다)`);
    } else {
      console.warn(`[확인] '${cfg.target.itemText}' 행을 아직 못 찾았습니다. 위 진단 정보를 확인하세요.`);
    }

    // 4) 목표 시각 직전(warmup)까지 대기 — 그동안 주기적으로 새로고침해 세션 유지
    const warmupAt = targetEpochMs - warmupMs;
    await waitWithKeepAlive(page, cfg, warmupAt, serverNow);

    // 병렬 탭 준비: parallelTabs 개수만큼 페이지를 만들어 모두 대상 페이지로 미리 이동
    const nTabs = Math.max(1, Math.min(Number(cfg.options?.parallelTabs) || 1, 6));
    const pages = [page];
    for (let i = 1; i < nTabs; i++) pages.push(await context.newPage());
    if (nTabs > 1) console.log(`[병렬] ${nTabs}개 탭으로 동시에 시도합니다.`);
    pages.forEach((p) => attachNetworkCapture(p, cfg)); // 구매 요청 기록 시작
    await Promise.all(pages.map((p) => goToItemPage(p, cfg).catch(() => {})));

    // 5) 목표 시각(- fireLead)까지 정밀 대기 후, 모든 탭이 동시에 신청(먼저 성공한 탭이 승리)
    await waitUntilServerTime(targetEpochMs - fireLeadMs, serverNow, '예매 시작');
    console.log(`[발사] ${fmt(serverNow().getTime())} — 신청을 시작합니다!`);

    const worker = cfg.options?.fastMode ? fastReserve : clickReserve;
    if (cfg.options?.fastMode) console.log('[모드] 고속 모드(POST 직접 폴링)로 실행합니다.');
    const control = { done: false };
    const results = await Promise.all(
      pages.map((p, i) => worker(p, cfg, control, nTabs > 1 ? `#${i + 1}` : '')),
    );
    const ok = results.some(Boolean);
    const winner = control.winner || page;
    if (!ok) console.warn('[신청] 제한 시간 내 자동 신청에 실패했습니다. 열려 있는 창에서 직접 진행해 주세요.');
    await winner.bringToFront().catch(() => {});
    await shot(winner, cfg, 'after-reserve');

    if (ok && cfg.selectors.confirmButton) {
      try {
        await clickAny(winner, cfg.selectors.confirmButton, { timeout: 3000 });
        console.log('[확인] 확인/결제 버튼을 눌렀습니다.');
        await shot(winner, cfg, 'after-confirm');
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
