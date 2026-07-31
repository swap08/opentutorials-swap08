# datalaw.kr 블로그 분석 및 개선방안

**분석 대상**: https://datalaw.kr — 스타트업 IT·개인정보 법률노트 (이현섭 변호사, 법무법인 세움)
**분석일**: 2026-07-31
**분석 방법**: 사이트맵 기준 전체 28편의 HTML·JSON-LD·링크 구조·응답 성능 전수 크롤링, robots.txt·llms.txt·sitemap.xml·index.json 직접 확인, 브랜드 검색 노출 검증

---

## 요약

기술적으로는 이미 상위 1% 수준으로 잘 만들어진 사이트다. 문제는 "사이트를 어떻게 만드느냐"가 아니라 **"만든 다음 무엇을 안 하고 있느냐"**에 몰려 있다.

핵심 진단 한 줄: **잘 만든 콘텐츠 자산 28편을 아무도 계측하지 않고, 아무도 회수하지 않는 상태다.**

---

## 1. 현재 강점 (건드리지 말 것)

측정치 기준으로 이미 매우 높은 수준이다.

| 항목 | 상태 |
|---|---|
| JSON-LD | Person·WebSite·Blog·WebPage·BlogPosting·FAQPage·BreadcrumbList **28/28편 완비** |
| `datePublished` / `image` | **28/28편** 누락 없음 |
| OG 이미지 | **28편 전부 고유 이미지** (공유 시 전부 다르게 노출) |
| `llms.txt` / `llms-full.txt` | 있음 (전문판 435KB). 인용 표기 권장 문구까지 포함 |
| robots.txt | GPTBot·ClaudeBot·OAI-SearchBot·Yeti 명시 허용 |
| 성능 | HTML 7~12KB(압축), CSS 4.7KB, TTFB 0.24s, Cloudflare |
| 본문 밀도 | 중앙값 1,140단어. 조문·의결번호(제2026-213-267호)·판결번호(2017다6108) 단위 인용 |
| FAQ | 전 글에 3문항씩 FAQPage 구조화 |

AEO(AI 검색 인용) 목표를 명시적으로 세우고 거기에 맞춰 지은 사이트라는 것이 코드에서 그대로 읽힌다.

---

## 2. 치명적 문제 3가지

### 2.1 측정 장치가 하나도 없다 — 최우선

전 페이지를 확인했으나 **애널리틱스가 0개**다. GA4·Plausible·Umami·네이버 wcslog 어느 것도 없고, **구글 서치콘솔·네이버 서치어드바이저 소유확인 메타태그도 없다.**

이것이 치명적인 이유: 이 블로그의 목표는 robots.txt에 직접 명시된 대로 "AI 검색 인용 노출"이다. 그런데 AI 검색이 글을 인용했는지 확인하는 **유일한 실증 경로가 레퍼러 로그**(chatgpt.com, perplexity.ai, claude.ai 유입)인데 그것을 보고 있지 않다. 현 상태로는 llms.txt가 효과가 있는지 없는지 영원히 알 수 없다.

**조치**: Cloudflare Web Analytics(무료·쿠키리스·1줄) 또는 Plausible 설치. 구글 서치콘솔·네이버 서치어드바이저에 사이트맵 등록. 작업 시간 30분, 이 문서에서 ROI가 가장 높은 항목.

### 2.2 독자가 남길 수 있는 흔적이 하나도 없다

구독 폼, 뉴스레터, 상담 신청, 공유 버튼, 댓글 — **전부 0개**. 푸터에 이메일과 전화번호가 있으나 Cloudflare 이메일 난독화라 클릭 전에는 주소가 보이지도 않는다.

「위탁계약이 끝났는데 수탁사 서버에 데이터가 남아 있었습니다」를 읽고 "우리 회사 얘기다"라고 느낀 스타트업 법무 담당자가 글 끝에서 할 수 있는 일이 **아무것도 없다.** 28편 분량의 신뢰를 쌓아놓고 회수 장치를 달지 않은 상태.

**조치**
- 글 하단 고정 박스: "이 글과 같은 상황이라면 30분 검토 문의" + 메일 링크
- 이메일 구독 폼(Buttondown·Stibee 무료 티어). **9월 11일 개정법 시행이 6주 앞이므로 "개정법 시행 전까지 매주 정리해 보냅니다"가 지금 가장 강력한 구독 명분**
- RSS 링크를 헤더 메뉴에 노출 (현재 `<link rel=alternate>` 태그에만 있어 사람 눈에 보이지 않음)

### 2.3 브랜드 검색에서 잡히지 않고 유사 도메인에 밀린다

"datalaw.kr 이현섭 변호사"로 검색 시 **이 사이트가 결과에 나오지 않는다.** 대신 [법률사무소 데이터로(datalaw.co.kr)](https://www.datalaw.co.kr/)가 상단을 차지한다. AI 상담 서비스를 하는 곳이라 성격도 겹친다.

llms.txt에 "이름이 비슷한 다른 도메인의 법률서비스와는 관련이 없습니다"라는 방어 문구가 이미 들어가 있는 것으로 보아 인지하고 있는 문제이나, **AI에게 설명하는 것만으로는 부족하고 검색엔진 색인이 먼저 되어야 한다.**

**조치**: 서치콘솔 색인 요청, 네이버 서치어드바이저 등록(한국 법무 담당자 상당수가 네이버 사용), **세움 프로필 페이지·링크드인에서 datalaw.kr로 거는 링크**. 신규 도메인에 권위를 옮기는 가장 확실한 경로.

---

## 3. 중요하나 덜 급한 문제

### 3.1 `lastmod` 일괄 갱신이 역효과를 낼 수 있다

사이트맵상 **글 다수의 lastmod가 `2026-07-31T01:00:00`으로 동일**하다. 실제로 그 시각에 20편을 동시에 수정한 것이 아니라면 빌드 과정에서 일괄 터치된 것으로 보인다.

법령 해설 콘텐츠에서 `dateModified`는 가장 값비싼 신뢰 신호다. 이를 일괄로 올리면 **"실제 개정 없이 날짜만 바꾸는 사이트"** 신호가 되어 신호 자체가 무력화된다. 시행령이 확정되는 9월 이후 진짜 개정 이력이 쌓일 때 그 가치를 쓸 수 없게 된다.

**조치**: Hugo front matter의 `lastmod`를 Git 커밋 시각(`enableGitInfo`) 기준으로 전환하거나, 실제 내용 수정 시에만 수동 갱신.

### 3.2 최신 5편에 1차 출처 링크가 0개

| 글 | 외부 링크 수 |
|---|---|
| pipc-2026-h1-sanctions-stats | **0** |
| uk-korea-transfer-basis-gap | **0** |
| foreign-subsidiary-cpo-designation | **0** |
| employee-data-exfiltration-dual-duty | **0** |
| vendor-data-after-contract-ends | **0** |
| (전체 28편 중앙값) | 3 |

「2026년 상반기 제재 정리」는 **보도자료 149건을 전수 대조했다**는 것이 최대 자산인데 그중 단 한 건도 링크되어 있지 않다. 독자도 AI도 검증할 방법이 없다.

**조치**
- 조문은 law.go.kr, 의결·보도자료는 pipc.go.kr, 판결은 casenote/대법원으로 링크
- 특히 **통계 글에서는 원자료 링크가 곧 인용 가능성**
- JSON-LD `citation` 필드(현재 비어 있음)에 근거 법령·의결번호 추가 → AI 검색이 근거를 잡기 쉬워짐

### 3.3 허브(필러) 페이지 부재로 대표 키워드를 잡지 못한다

28편이 평평하게 나열되어 있고 태그는 8개뿐이다. 그것도 개인정보보호법·과징금제재·유출대응·스타트업실무가 **정확히 10편씩** — 기계적으로 배분된 흔적이다.

현 구조로는 "퇴사자 데이터 반출 신고 의무" 같은 롱테일은 확보하나, **"개인정보 유출 대응", "개정 개인정보보호법 2026"** 같은 대표 검색어를 받을 페이지가 없다.

**조치**: 허브 3개 신설

| 허브 | 묶을 글 | 비고 |
|---|---|---|
| 개인정보 유출 사고 대응 종합 가이드 | 72시간·인적과실·랜섬웨어·수탁사 사고·글로벌 플레이북 등 8편 | 사고 발생 시간순으로 배열 |
| 2026년 9월 11일 개정법 전면 대비 | 신구조문 대조표 + CPO 지정·과징금 상한·유출등 정의 확대 | **6주 뒤 시행, 검색 수요 급증 구간** |
| 위탁·수탁 책임 지도 | 계약 종료·구상·감독의무 5편 | |

허브가 생기면 내부링크가 자연히 두터워진다(현재 중앙값 3개, `misinformation-platform-duties`와 `processor-indemnity-recourse-ratio`는 1개뿐).

---

## 4. 사소하지만 손쉬운 개선

| 문제 | 조치 | 난이도 |
|---|---|---|
| 본문에 최종수정일 미노출 (JSON-LD에만 존재) | 발행일 옆에 "최종 수정: YYYY-MM-DD" 표시. 법령 주제에서 최신성은 신뢰의 핵심 | 낮음 |
| **h3 헤딩이 전 글 0개** (h2만 5~12개) | 2,000단어 이상 글에 h3 추가. AI 인용은 잘게 쪼개진 섹션을 선호 | 중간 |
| 표가 글당 1개 이하 | 통계·비교·기한을 다루는 글은 표가 인용 확률을 크게 높임 | 중간 |
| 검색 index.json **425KB** | 100편 도달 시 1.5MB. 본문 대신 요약만 색인하도록 축소 | 낮음 |
| HSTS·CSP·X-Frame-Options 헤더 없음 | Cloudflare 설정 몇 줄. 변호사 사이트 신뢰 요소이자 도메인 사칭 방어 | 낮음 |
| 관련글 위젯 없음 | PaperMod 내장 기능 활성화(태그 기반) | 낮음 |

---

## 5. 실행 순서

### 오늘 (약 1시간)
1. 애널리틱스 설치 (Cloudflare Web Analytics 또는 Plausible)
2. 구글 서치콘솔 · 네이버 서치어드바이저 등록 + 사이트맵 제출
3. 글 하단 문의 CTA 추가

> 현재는 성과를 볼 수 없는 상태이며, 이 세 가지가 그것을 끝낸다.

### 이번 주
4. 최신 5편에 1차 출처(law.go.kr·pipc.go.kr) 링크 삽입
5. 본문에 최종수정일 노출
6. `lastmod` 일괄 갱신 중단 (`enableGitInfo` 전환)
7. 세움 프로필 · 링크드인에서 datalaw.kr 백링크

### 3주 안 (9월 11일 시행 전)
8. 개정법 허브 페이지 신설
9. 이메일 구독 폼 + "시행 전까지 매주 정리" 구독 명분
10. 유출 대응 허브 · 위탁수탁 허브 신설

---

## 6. 부록: 전체 28편 측정 데이터

| slug | 본문 단어 | 내부링크 | 외부링크 | 태그 | h2 |
|---|---:|---:|---:|---:|---:|
| pipc-2026-h1-sanctions-stats | 1,097 | 3 | 0 | 3 | 7 |
| uk-korea-transfer-basis-gap | 890 | 3 | 0 | 3 | 7 |
| foreign-subsidiary-cpo-designation | 874 | 3 | 0 | 3 | 7 |
| employee-data-exfiltration-dual-duty | 1,034 | 3 | 0 | 2 | 8 |
| vendor-data-after-contract-ends | 932 | 5 | 0 | 4 | 7 |
| reps-warranties-damage-calculation | 798 | 2 | 2 | 3 | 7 |
| who-controls-devices-at-customer-sites | 842 | 2 | 1 | 2 | 8 |
| processor-indemnity-recourse-ratio | 816 | 1 | 5 | 3 | 8 |
| pipa-2026-amendment-comparison | 1,088 | 5 | 4 | 3 | 9 |
| api-response-unrequested-personal-data | 899 | 3 | 2 | 4 | 9 |
| ma-reps-warranties-privacy-claims | 967 | 3 | 4 | 3 | 8 |
| ransomware-corruption-breach-notification | 766 | 2 | 1 | 2 | 7 |
| mydata-transfer-right-who-and-when | 1,887 | 3 | 6 | 2 | 7 |
| processor-breach-consignor-liability | 731 | 4 | 2 | 4 | 6 |
| global-breach-playbook-korea-gap | 1,476 | 4 | 1 | 3 | 9 |
| human-error-breach-sanctions | 1,183 | 3 | 1 | 4 | 8 |
| data-breach-72-hours | 2,260 | 5 | 5 | 3 | 12 |
| eu-korea-adequacy-first-review | 2,529 | 3 | 6 | 3 | 9 |
| misinformation-platform-duties | 2,349 | 1 | 3 | 2 | 9 |
| ai-training-data-copyright | 1,876 | 3 | 4 | 2 | 12 |
| ai-basic-law-business-duties | 2,259 | 3 | 3 | 2 | 12 |
| privacy-policy-checklist-2026 | 2,372 | 5 | 5 | 5 | 12 |
| retention-vs-destruction | 1,077 | 3 | 6 | 2 | 8 |
| privacy-policy-two-documents | 1,391 | 4 | 5 | 3 | 8 |
| under-14-signup-consent | 1,772 | 2 | 4 | 3 | 8 |
| breach-response-calculus-shift | 1,950 | 3 | 4 | 4 | 7 |
| ai-basic-law-procurement | 1,547 | 2 | 3 | 2 | 9 |
| tiktok-pixel-behavioral-data | 1,317 | 3 | 2 | 5 | 5 |

**공통 사항**: 28편 전부 FAQPage·datePublished·image 보유, h3 0개, 고유 OG 이미지 보유.

### 태그 분포

| 태그 | 글 수 |
|---|---:|
| 개인정보보호법 | 10 |
| 과징금제재 | 10 |
| 유출대응 | 10 |
| 스타트업실무 | 10 |
| 국외이전 | 6 |
| 위탁수탁 | 5 |
| ai규제 | 4 |
| 개인정보처리방침 | 3 |

---

*본 문서는 2026-07-31 기준 공개된 datalaw.kr 페이지를 외부에서 크롤링해 작성했다. 서버 로그·검색 콘솔 등 비공개 데이터는 포함하지 않았다.*
