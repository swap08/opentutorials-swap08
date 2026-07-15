# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요 (Overview)

이 저장소는 [생활코딩 opentutorials.org JavaScript 강의](http://opentutorials.org/course/49)를 따라가는 학습용 저장소입니다. 정적 HTML 페이지(`index.html`) 하나로 구성되어 있으며, 빌드 시스템, 패키지 매니저, 테스트, 외부 의존성이 없습니다.

This is a learning repository following the opentutorials.org (생활코딩) JavaScript course. It contains a single static HTML page with no build system, package manager, tests, or dependencies.

## 구조 (Structure)

- `index.html` — 유일한 소스 파일. 다음 요소로 구성된 정적 페이지입니다:
  - `<header>` — 페이지 제목 (JavaScript)
  - `#toolbar` — black/white 버튼 두 개. 아직 이벤트 핸들러가 연결되어 있지 않습니다. 강의 후반부에서 JavaScript로 `document.body`의 배경색/글자색을 전환하는 주간/야간 모드 기능을 구현하게 됩니다.
  - `<nav>` — 강의 목차 링크 (JavaScript, 변수와 상수, 연산자, 함수, 이벤트, 객체)
  - `<article>` — 현재 학습 중인 단원의 노트 (현재: 변수와 상수)

## 개발 방법 (Development)

빌드, 린트, 테스트 명령이 없습니다. 변경 사항을 확인하려면:

- `index.html`을 브라우저에서 직접 열거나
- 로컬 서버로 서빙합니다: `python3 -m http.server`

## 규칙 (Conventions)

- 콘텐츠(제목, 학습 노트)는 한국어로 작성합니다. 새로운 튜토리얼 콘텐츠도 한국어로 일관성을 유지하세요.
- 커밋은 생활코딩 강의 진도를 따라가며 HTML/JavaScript를 단계적으로 추가하는 방식입니다.
- 사용자와의 대화는 한국어로 진행합니다.
- 학습 목적의 저장소이므로, 강의에서 다루는 수준의 단순한 코드를 유지하세요. 프레임워크나 빌드 도구를 도입하지 마세요.

## 강의 진도 (Course Progress)

`<article>`의 내용이 현재 학습 중인 단원을 나타냅니다. 새 단원을 추가할 때는 `<nav>`의 목차 순서(변수와 상수 → 연산자 → 함수 → 이벤트 → 객체)를 따르세요.
