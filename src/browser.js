// 공용 브라우저 헬퍼
// 로그인 상태(쿠키/세션)를 디스크에 저장·재사용하기 위해 '영구 프로필'을 사용합니다.
// launchPersistentContext 는 user-data 폴더에 프로필을 저장하므로,
// 한 번 로그인해두면(휴대폰 본인인증 포함) 다음 실행 때 로그인된 상태로 시작합니다.

import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

// config 의 userDataDir(기본 "user-data")를 절대경로로 변환
export function resolveUserDataDir(cfg) {
  const dir = cfg?.options?.userDataDir || 'user-data';
  return isAbsolute(dir) ? dir : resolve(ROOT, dir);
}

/**
 * 로그인 상태가 저장되는 영구 브라우저 컨텍스트를 연다.
 * @param {object} cfg  config.json 내용
 * @param {object} [override]  { headless } 등 옵션 덮어쓰기
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function openPersistentContext(cfg, override = {}) {
  const userDataDir = resolveUserDataDir(cfg);
  const execPath = process.env.KNPARK_BROWSER_PATH || cfg?.options?.browserExecutablePath || undefined;
  const proxyServer = process.env.KNPARK_PROXY || cfg?.options?.proxyServer || undefined;

  return chromium.launchPersistentContext(userDataDir, {
    headless: override.headless ?? cfg?.options?.headless ?? false,
    executablePath: execPath,
    proxy: proxyServer ? { server: proxyServer } : undefined,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

// 영구 컨텍스트에는 기본 페이지가 하나 열려 있다. 그것을 재사용하거나 새로 만든다.
export function firstPage(context) {
  const pages = context.pages();
  return pages.length ? pages[0] : context.newPage();
}
