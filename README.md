# KNPARK 자동 예매 프로그램

[코레일네트웍스 KNPARK(www.knpark.com)](https://www.knpark.com/) 의 기차역 주차장 **월 정기권/티켓**은
정해진 시각에 선착순으로 판매되어 순식간에 마감되곤 합니다.
이 프로그램은 **지정한 시각(서버시간 기준)에 맞춰 자동으로 로그인하고 예매(신청)를 시도**해 줍니다.

- 정확도를 위해 **내 PC 시계가 아니라 KNPARK 서버 시계**에 동기화합니다. (네이비즘 서버시간과 같은 원리)
- 캡차·결제처럼 사람이 직접 해야 하는 단계는 **브라우저 창을 열어둔 채 대기**합니다.
- 사이트 구조가 바뀌어도 **설정 파일에서 셀렉터만 수정**하면 계속 쓸 수 있습니다.

---

## ⚠️ 사용 전 반드시 읽어주세요

- **반드시 본인 계정으로, 개인이 실제로 이용할 정기권/티켓 신청 목적**으로만 사용하세요.
- 대량 신청·되팔기(암표) 목적의 매크로 사용은 **사이트 이용약관 위반이며 법적 문제**가 될 수 있습니다.
- 사이트가 자동화(봇)를 금지하는 경우 이용약관을 따르세요. 이 프로그램은 캡차를 우회하지 않으며,
  캡차가 나오면 **사람이 직접 풀도록** 창을 열어둡니다.

---

## 설치

```bash
npm install
```

> 이 저장소가 실행되는 환경에는 Chromium 이 이미 설치되어 있습니다.
> 별도 환경에서 브라우저가 없다면 `npx playwright install chromium` 을 한 번 실행하세요.

## 설정

`config.example.json` 을 `config.json` 으로 복사한 뒤 값을 채웁니다.

```bash
cp config.example.json config.json
```

| 항목 | 설명 |
|------|------|
| `credentials.id` / `password` | KNPARK 로그인 정보 (config.json 은 git 에 올라가지 않습니다) |
| `schedule.targetTimeKST` | 예매를 시작할 목표 시각 (한국시간, 예: `2026-07-20T10:00:00`) |
| `schedule.warmupSeconds` | 목표 시각 몇 초 전에 미리 로그인/페이지 진입을 끝낼지 |
| `schedule.fireLeadMs` | 목표보다 몇 ms 먼저 첫 클릭을 쏠지(네트워크 지연 보정) |
| `target.reservationUrl` | 실제 정기권/티켓 신청 페이지 URL |
| `target.itemText` | 여러 항목 중 고를 대상 텍스트(역 이름 등). 비우면 첫 신청 버튼 |
| `selectors.*` | 로그인/신청 버튼 등의 CSS 셀렉터 (사이트에 맞게 수정) |
| `options.headless` | `false` 면 브라우저 창이 보임(캡차/결제 직접 처리 가능, 권장) |

### 셀렉터를 모를 때

로그인·신청 페이지의 실제 입력창/버튼 셀렉터는 사이트마다 다릅니다.
아래 명령으로 페이지를 열고, 요소를 클릭하면 셀렉터를 확인할 수 있습니다.

```bash
npm run inspect                              # config 의 loginUrl 을 엶
npm run inspect https://www.knpark.com/...   # 특정 페이지를 엶
```

확인한 값을 `config.json` 의 `selectors` 에 넣으세요.

## 서버시간 확인

목표 시각을 정확히 맞추려면 먼저 서버시간과 내 시계의 오차를 확인해 보세요.

```bash
npm run time
```

## 실행

```bash
npm run book
```

실행하면:

1. KNPARK 서버시간에 동기화합니다.
2. `목표 시각 − warmupSeconds` 에 맞춰 미리 로그인하고 예매 페이지에 진입합니다.
3. `목표 시각 − fireLeadMs` 에 맞춰 **신청 버튼을 정밀하게 클릭**합니다. (실패 시 자동 재시도)
4. 캡차/결제가 필요하면 창을 열어둔 채 대기합니다. 마친 뒤 `Ctrl+C` 로 종료하세요.

## 동작 원리 요약

```
서버시간 동기화 ──► warmup 시각까지 대기 ──► 자동 로그인 ──► 예매 페이지 진입
      ──► 목표 시각(−fireLead)까지 정밀 대기 ──► '신청' 클릭(재시도) ──► 캡차/결제 대기
```

## 파일 구조

```
config.example.json   설정 예시 (복사해서 config.json 으로 사용)
src/serverTime.js     서버시간 동기화 (npm run time)
src/inspect.js        셀렉터 확인 도우미 (npm run inspect)
src/book.js           메인 예매 로직 (npm run book)
```

## 문제 해결

- **자동 로그인이 안 돼요**: `selectors.idInput/passwordInput/loginButton` 을 실제 값으로 수정하세요.
  실패해도 창에서 직접 로그인하면 이후 단계는 계속 진행됩니다.
- **신청 버튼을 못 눌러요**: `selectors.reserveButton` 을 수정하거나, `target.itemText` 로 대상을 좁혀보세요.
- **시각이 안 맞아요**: `npm run time` 으로 오차를 확인하고 `fireLeadMs` 를 조정하세요.
