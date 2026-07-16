// 서버시간 동기화 유틸리티
// knpark.com 은 정해진 '초' 단위 시각에 선착순으로 판매하므로,
// 내 PC 시계가 아니라 '서버 시계'에 맞춰 예매를 시도해야 합니다.
// HTTP 응답의 Date 헤더(RFC 7231)로 서버시간을 읽어 내 시계와의 오차(offset)를 계산합니다.
// 참고: 네이비즘 서버시간(https://time.navyism.com/?host=www.knpark.com)과 같은 원리입니다.

const DEFAULT_HOST = 'https://www.knpark.com/';

/**
 * 서버시간과 로컬시간의 오프셋(ms)을 구한다.
 * offset > 0 이면 서버가 내 시계보다 빠르다는 뜻.
 * 왕복 지연(RTT)의 절반을 보정해 정확도를 높인다.
 * @param {string} url  기준으로 삼을 서버 URL
 * @param {number} samples  측정 횟수(최소 RTT 표본 선택)
 * @returns {Promise<{offsetMs:number, rttMs:number, serverNow:()=>Date}>}
 */
export async function getServerTimeOffset(url = DEFAULT_HOST, samples = 5) {
  let best = null; // { offsetMs, rttMs }

  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    } catch {
      // HEAD 를 막는 서버가 있으므로 GET 으로 재시도
      res = await fetch(url, { method: 'GET', cache: 'no-store' });
    }
    const t1 = Date.now();

    const dateHeader = res.headers.get('date');
    if (!dateHeader) continue;

    const serverMs = new Date(dateHeader).getTime();
    const rtt = t1 - t0;
    // 응답을 받은 시점(t1)의 로컬시간과, 그 시점의 추정 서버시간을 비교.
    // 서버가 Date 를 생성한 시점 ≈ t0 + rtt/2 라고 가정.
    const localMidpoint = t0 + rtt / 2;
    const offsetMs = serverMs - localMidpoint;

    if (!best || rtt < best.rttMs) {
      best = { offsetMs, rttMs: rtt };
    }
  }

  if (!best) {
    // Date 헤더를 못 읽으면 오프셋 0 으로 폴백(로컬시계 사용)
    console.warn('[serverTime] Date 헤더를 읽지 못해 로컬시계를 사용합니다.');
    best = { offsetMs: 0, rttMs: 0 };
  }

  const serverNow = () => new Date(Date.now() + best.offsetMs);
  return { offsetMs: best.offsetMs, rttMs: best.rttMs, serverNow };
}

// 단독 실행 시 현재 서버시간 출력: `npm run time`
if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.argv[2] || DEFAULT_HOST;
  const { offsetMs, rttMs, serverNow } = await getServerTimeOffset(host);
  console.log(`대상 서버 : ${host}`);
  console.log(`RTT       : ${rttMs} ms`);
  console.log(`시계 오차 : ${offsetMs.toFixed(0)} ms (양수=서버가 내 시계보다 빠름)`);
  console.log(`서버 시간 : ${serverNow().toISOString()}`);
  console.log(`로컬 시간 : ${new Date().toISOString()}`);
}
