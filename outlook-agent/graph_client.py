"""Microsoft Graph API 클라이언트.

MSAL 디바이스 코드 흐름으로 로그인하고, Outlook 메일을 읽고/보내고/정리하는
얇은 래퍼를 제공한다. 토큰은 로컬 캐시 파일에 저장되어 재로그인을 줄인다.
"""

import os
import sys

import msal
import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
SCOPES = ["Mail.Read", "Mail.ReadWrite", "Mail.Send", "User.Read"]
TOKEN_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".token_cache.json")


class GraphClient:
    def __init__(self):
        client_id = os.environ.get("AZURE_CLIENT_ID")
        if not client_id:
            sys.exit(
                "AZURE_CLIENT_ID 환경 변수가 필요합니다. "
                "README.md의 Azure 앱 등록 안내를 참고하세요."
            )
        tenant = os.environ.get("AZURE_TENANT_ID", "common")

        self._cache = msal.SerializableTokenCache()
        if os.path.exists(TOKEN_CACHE_PATH):
            with open(TOKEN_CACHE_PATH, "r", encoding="utf-8") as f:
                self._cache.deserialize(f.read())

        self._app = msal.PublicClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant}",
            token_cache=self._cache,
        )

    # ---------- 인증 ----------

    def _save_cache(self):
        if self._cache.has_state_changed:
            with open(TOKEN_CACHE_PATH, "w", encoding="utf-8") as f:
                f.write(self._cache.serialize())
            os.chmod(TOKEN_CACHE_PATH, 0o600)

    def _get_token(self) -> str:
        accounts = self._app.get_accounts()
        if accounts:
            result = self._app.acquire_token_silent(SCOPES, account=accounts[0])
            if result and "access_token" in result:
                self._save_cache()
                return result["access_token"]

        flow = self._app.initiate_device_flow(scopes=SCOPES)
        if "user_code" not in flow:
            sys.exit(f"디바이스 코드 발급 실패: {flow.get('error_description', flow)}")
        print(f"\n[로그인 필요] {flow['message']}\n", flush=True)
        result = self._app.acquire_token_by_device_flow(flow)
        if "access_token" not in result:
            sys.exit(f"로그인 실패: {result.get('error_description', result)}")
        self._save_cache()
        return result["access_token"]

    def _request(self, method: str, path: str, *, params=None, json=None, headers=None):
        h = {"Authorization": f"Bearer {self._get_token()}"}
        if headers:
            h.update(headers)
        resp = requests.request(
            method, f"{GRAPH_BASE}{path}", params=params, json=json, headers=h, timeout=30
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Graph API 오류 {resp.status_code}: {resp.text[:500]}")
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    # ---------- 메일 조회 ----------

    LIST_FIELDS = "id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments"

    def list_messages(self, folder: str = "inbox", top: int = 10, unread_only: bool = False):
        params = {
            "$top": min(top, 50),
            "$select": self.LIST_FIELDS,
            "$orderby": "receivedDateTime desc",
        }
        if unread_only:
            params["$filter"] = "isRead eq false"
        data = self._request("GET", f"/me/mailFolders/{folder}/messages", params=params)
        return [self._slim(m) for m in data.get("value", [])]

    def search_messages(self, query: str, top: int = 10):
        # $search는 $orderby와 함께 쓸 수 없다
        params = {"$top": min(top, 50), "$select": self.LIST_FIELDS, "$search": f'"{query}"'}
        data = self._request("GET", "/me/messages", params=params)
        return [self._slim(m) for m in data.get("value", [])]

    def get_message(self, message_id: str):
        data = self._request(
            "GET",
            f"/me/messages/{message_id}",
            params={"$select": self.LIST_FIELDS + ",body,toRecipients,ccRecipients"},
            headers={"Prefer": 'outlook.body-content-type="text"'},
        )
        m = self._slim(data)
        m["to"] = [r["emailAddress"].get("address", "") for r in data.get("toRecipients", [])]
        m["cc"] = [r["emailAddress"].get("address", "") for r in data.get("ccRecipients", [])]
        body = data.get("body", {}).get("content", "")
        m["body"] = body[:20000] + ("\n...(잘림)" if len(body) > 20000 else "")
        return m

    @staticmethod
    def _slim(m: dict) -> dict:
        sender = m.get("from", {}).get("emailAddress", {})
        return {
            "id": m.get("id"),
            "subject": m.get("subject"),
            "from": f'{sender.get("name", "")} <{sender.get("address", "")}>',
            "received": m.get("receivedDateTime"),
            "is_read": m.get("isRead"),
            "has_attachments": m.get("hasAttachments"),
            "preview": (m.get("bodyPreview") or "")[:200],
        }

    # ---------- 메일 작성/전송 ----------

    @staticmethod
    def _recipients(addresses: list[str]):
        return [{"emailAddress": {"address": a}} for a in addresses]

    def send_mail(self, to: list[str], subject: str, body: str, cc: list[str] | None = None):
        message = {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": self._recipients(to),
        }
        if cc:
            message["ccRecipients"] = self._recipients(cc)
        self._request("POST", "/me/sendMail", json={"message": message})

    def reply_to_message(self, message_id: str, body: str, reply_all: bool = False):
        action = "replyAll" if reply_all else "reply"
        self._request("POST", f"/me/messages/{message_id}/{action}", json={"comment": body})

    def create_draft(self, to: list[str], subject: str, body: str):
        message = {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": self._recipients(to),
        }
        data = self._request("POST", "/me/messages", json=message)
        return data.get("id")

    def create_reply_draft(self, message_id: str, body: str, reply_all: bool = False):
        action = "createReplyAll" if reply_all else "createReply"
        draft = self._request("POST", f"/me/messages/{message_id}/{action}", json={"comment": body})
        return draft.get("id")

    # ---------- 메일 정리 ----------

    def list_folders(self):
        data = self._request(
            "GET", "/me/mailFolders", params={"$top": 100, "$select": "id,displayName,unreadItemCount,totalItemCount"}
        )
        return [
            {
                "id": f["id"],
                "name": f["displayName"],
                "unread": f.get("unreadItemCount"),
                "total": f.get("totalItemCount"),
            }
            for f in data.get("value", [])
        ]

    def move_message(self, message_id: str, destination_folder_id: str):
        self._request("POST", f"/me/messages/{message_id}/move", json={"destinationId": destination_folder_id})

    def set_read(self, message_id: str, is_read: bool = True):
        self._request("PATCH", f"/me/messages/{message_id}", json={"isRead": is_read})

    def delete_message(self, message_id: str):
        # 영구 삭제 대신 '지운 편지함'으로 이동해 복구 가능하게 한다
        self.move_message(message_id, "deleteditems")
