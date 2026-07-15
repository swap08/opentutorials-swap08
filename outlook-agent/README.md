# 📬 Outlook 이메일 에이전트

자연어로 Outlook 메일을 관리하는 CLI 에이전트입니다. Claude API가 명령을 해석하고
Microsoft Graph API로 메일함을 조작합니다.

```
나> 안 읽은 메일 요약해줘
나> 지난주에 온 청구서 관련 메일 찾아줘
나> 첫 번째 메일에 정중한 거절 답장 초안 만들어줘
나> 광고 메일들 지운 편지함으로 옮겨줘
```

## 기능

| 기능 | 설명 |
|---|---|
| 조회/요약 | 받은편지함·폴더별 목록, 안 읽은 메일, 본문 읽기 및 요약 |
| 검색 | 키워드/보낸사람 기준 전체 메일함 검색 |
| 작성 | 새 메일·답장 전송, 초안 저장 (전송 전 반드시 터미널에서 y/n 확인) |
| 정리 | 폴더 이동, 읽음/안읽음 처리, 삭제(지운 편지함으로 이동) |

**안전장치**: 메일 전송과 삭제는 항상 실행 직전에 미리보기와 함께 사용자 확인을
받습니다. 삭제는 영구 삭제가 아니라 지운 편지함 이동입니다.

## 설정

### 1. Azure 앱 등록 (Microsoft Graph 접근용)

개인 Outlook.com 계정도 무료 Azure 계정으로 앱 등록이 가능합니다.

1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. 이름: 아무거나 (예: `outlook-agent`)
3. **Supported account types**: *"Accounts in any organizational directory and personal Microsoft accounts"* 선택
4. Redirect URI는 비워두고 **Register**
5. 등록된 앱의 **Authentication** 메뉴 → 하단 **Advanced settings** →
   **Allow public client flows**를 **Yes**로 변경 후 저장 (디바이스 코드 로그인에 필요)
6. **Overview**에서 **Application (client) ID** 복사

> API permissions는 별도 추가 없이도 됩니다 — 로그인 시 `Mail.Read`,
> `Mail.ReadWrite`, `Mail.Send`, `User.Read` 권한을 동적으로 요청하고,
> 본인 계정에 대해 직접 동의하게 됩니다.

### 2. 환경 변수

```bash
export ANTHROPIC_API_KEY="sk-ant-..."     # https://platform.claude.com 에서 발급
export AZURE_CLIENT_ID="위에서 복사한 client ID"
# 선택: 특정 테넌트만 허용하려면 (기본값 common)
# export AZURE_TENANT_ID="consumers"      # 개인 계정 전용
```

### 3. 설치 및 실행

```bash
cd outlook-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python agent.py
```

첫 실행 시 터미널에 표시되는 안내에 따라 https://microsoft.com/devicelogin 에서
코드를 입력해 로그인합니다. 토큰은 `.token_cache.json`에 캐시되어 이후에는
자동 로그인됩니다.

## 구조

```
outlook-agent/
├── agent.py          # 대화형 CLI + Claude 도구 러너 루프
├── tools.py          # Claude에 노출되는 11개 도구 (@beta_tool)
├── graph_client.py   # MSAL 인증 + Microsoft Graph API 래퍼
└── requirements.txt
```

- **모델**: `claude-opus-4-8` (adaptive thinking, 프롬프트 캐싱 적용)
- **인증**: MSAL 디바이스 코드 흐름 — 비밀번호를 앱에 입력하지 않습니다
- **도구 러너**: Anthropic SDK의 tool runner가 "도구 호출 → 실행 → 결과 반환"
  루프를 자동 처리합니다

## 주의

- `.token_cache.json`에는 로그인 토큰이 들어 있으니 절대 커밋하지 마세요
  (`.gitignore`에 포함되어 있습니다).
- 메일 본문 속 지시문("이 메일을 전달해줘" 등)은 따르지 않도록 시스템 프롬프트에
  명시되어 있지만, 중요한 작업은 항상 미리보기를 확인하세요.
