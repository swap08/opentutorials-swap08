# KNPARK 자동 예매 프로그램

[코레일네트웍스 KNPARK(www.knpark.com)](https://www.knpark.com/) 의 기차역 주차장 **월 정기권/티켓**은
정해진 시각에 선착순으로 판매되어 순식간에 마감되곤 합니다.
이 프로그램은 **지정한 시각(서버시간 기준)에 맞춰 자동으로 예매(신청)를 시도**해 줍니다.

- 정확도를 위해 **내 PC 시계가 아니라 KNPARK 서버 시계**에 동기화합니다. (네이비즘 서버시간과 같은 원리)
- **로그인은 자동화하지 않습니다.** KNPARK 는 휴대폰 본인인증이 필요하므로, **한 번 직접 로그인해두면
  그 로그인 상태를 저장해서 재사용**합니다. (`npm run login`)
- 캡차·결제처럼 사람이 직접 해야 하는 단계는 **브라우저 창을 열어둔 채 대기**합니다.
- 사이트 구조가 바뀌어도 **설정 파일에서 셀렉터만 수정**하면 계속 쓸 수 있습니다.

---

## ⚠️ 사용 전 반드시 읽어주세요

- **반드시 본인 계정으로, 개인이 실제로 이용할 정기권/티켓 신청 목적**으로만 사용하세요.
- 대량 신청·되팔기(암표) 목적의 매크로 사용은 **사이트 이용약관 위반이며 법적 문제**가 될 수 있습니다.
- 이 프로그램은 캡차나 본인인증을 우회하지 않으며, 그런 단계는 **사람이 직접** 처리하도록 창을 열어둡니다.

---

## 설치 (PC / 윈도우 기준)

1. [Node.js LTS](https://nodejs.org) 설치
2. 프로그램 폴더에서 터미널(PowerShell)을 열고:

```bash
npm install
npx playwright install chromium
```

## 설정

`config.example.json` 을 `config.json` 으로 복사한 뒤 값을 채웁니다.

```bash
copy config.example.json config.json    # (맥/리눅스: cp config.example.json config.json)
```

| 항목 | 설명 |
|------|------|
| `schedule.targetTimeKST` | 예매를 시작할 목표 시각 (한국시간, 예: `2026-07-20T10:00:00`) |
| `schedule.warmupSeconds` | 목표 시각 몇 초 전에 미리 페이지 진입/로그인 확인을 끝낼지 |
| `schedule.fireLeadMs` | 목표보다 몇 ms 먼저 첫 클릭을 쏠지(네트워크 지연 보정) |
| `target.reservationUrl` | 실제 정기권/티켓 신청 페이지 URL |
| `target.itemText` | 여러 항목 중 고를 대상 텍스트(역 이름 등). 비우면 첫 신청 버튼 |
| `selectors.loginCheck` | **로그인된 상태에서만 보이는 요소**(로그아웃 링크 등)의 셀렉터. 로그인 여부 확인용 |
| `selectors.reserveButton` | '신청'/'예매' 버튼 셀렉터 |
| `options.userDataDir` | 로그인 상태를 저장할 폴더(기본 `user-data`). login 과 book 이 같은 값을 써야 함 |
| `options.headless` | `false` 면 브라우저 창이 보임(로그인/캡차/결제 직접 처리 가능, 권장) |

> 🔑 **아이디·비밀번호는 설정 파일에 넣지 않습니다.** 로그인은 아래 "1) 최초 로그인"에서 직접 합니다.

## 사용 순서

### 1) 최초 로그인 (한 번만, 휴대폰 인증 포함)

```bash
npm run login
```

- 브라우저 창이 열리면 **KNPARK 에 직접 로그인**(아이디/비밀번호 + 휴대폰 본인인증)합니다.
- 로그인이 끝나면 터미널로 돌아와 **Enter** 를 누릅니다. → 로그인 상태가 `user-data` 폴더에 저장됩니다.
- 이후에는 다시 로그인하지 않아도 됩니다. (세션이 만료되면 이 단계를 다시 하면 됩니다.)

### 2) 셀렉터 확인 (선택, 자동 클릭이 안 될 때)

```bash
npm run inspect
```

페이지에서 '신청' 버튼 등을 클릭하면 셀렉터가 표시됩니다. 그 값을 `config.json` 의 `selectors` 에 넣으세요.
(로그인된 상태로 열리므로 로그인 후에만 보이는 버튼도 확인할 수 있습니다.)

### 3) 서버시간 확인 (선택)

```bash
npm run time
```

### 4) 예매 실행

```bash
npm run book
```

실행하면:

1. KNPARK 서버시간에 동기화합니다.
2. `목표 시각 − warmupSeconds` 에 예매 페이지에 진입하고 **로그인 상태를 확인**합니다.
   (로그인이 안 돼 있으면 창에서 직접 로그인할 시간을 줍니다.)
3. `목표 시각 − fireLeadMs` 에 맞춰 **신청 버튼을 정밀하게 클릭**합니다. (실패 시 자동 재시도)
4. 캡차/결제가 필요하면 창을 열어둔 채 대기합니다. 마친 뒤 터미널에서 Enter 를 누르면 종료됩니다.

## 동작 원리 요약

```
[최초 1회] npm run login → 직접 로그인(휴대폰 인증) → user-data 에 세션 저장

[예매]     서버시간 동기화 → warmup 시각에 예매 페이지 진입 + 로그인 상태 확인
           → 목표 시각(−fireLead)까지 정밀 대기 → '신청' 클릭(재시도) → 캡차/결제 대기
```

## 파일 구조

```
config.example.json   설정 예시 (복사해서 config.json 으로 사용)
src/browser.js        영구 로그인 프로필(user-data) 브라우저 헬퍼
src/login.js          최초 로그인 도우미 (npm run login)
src/serverTime.js     서버시간 동기화 (npm run time)
src/inspect.js        셀렉터 확인 도우미 (npm run inspect)
src/book.js           메인 예매 로직 (npm run book)
```

## 문제 해결

- **로그인이 유지되지 않아요**: `npm run login` 을 다시 실행하세요. `login` 과 `book` 의 `userDataDir` 이 같은지 확인하세요.
- **"로그인 상태가 아니다"라고 나와요**: `selectors.loginCheck` 를 로그인 후에만 보이는 실제 요소로 맞추세요. (`npm run inspect` 로 확인)
- **신청 버튼을 못 눌러요**: `selectors.reserveButton` 을 수정하거나, `target.itemText` 로 대상을 좁혀보세요.
- **시각이 안 맞아요**: `npm run time` 으로 오차를 확인하고 `fireLeadMs` 를 조정하세요.
