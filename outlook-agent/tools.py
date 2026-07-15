"""Claude에게 노출되는 Outlook 도구 모음.

각 함수는 @beta_tool 데코레이터로 감싸져 SDK 도구 러너가 자동으로 스키마를
생성한다. 전송/삭제처럼 되돌리기 어려운 작업은 실행 전에 터미널에서 사용자
확인을 받는다.
"""

import json

from anthropic import beta_tool

from graph_client import GraphClient

_client: GraphClient | None = None


def graph() -> GraphClient:
    global _client
    if _client is None:
        _client = GraphClient()
    return _client


def _dump(data) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _confirm(prompt: str) -> bool:
    answer = input(f"\n⚠️  {prompt} (y/n): ").strip().lower()
    return answer in ("y", "yes")


@beta_tool
def list_emails(folder: str = "inbox", count: int = 10, unread_only: bool = False) -> str:
    """받은편지함 등 특정 폴더의 최근 이메일 목록을 조회합니다.

    Args:
        folder: 폴더 이름 또는 ID. 기본 폴더는 잘 알려진 이름 사용 가능
            (inbox, drafts, sentitems, deleteditems, junkemail, archive).
        count: 가져올 개수 (최대 50).
        unread_only: True이면 읽지 않은 메일만 조회.
    """
    return _dump(graph().list_messages(folder=folder, top=count, unread_only=unread_only))


@beta_tool
def search_emails(query: str, count: int = 10) -> str:
    """키워드로 전체 메일함을 검색합니다. 보낸사람, 제목, 본문이 검색 대상입니다.

    Args:
        query: 검색어 (예: "invoice", "from:kim@example.com").
        count: 가져올 개수 (최대 50).
    """
    return _dump(graph().search_messages(query, top=count))


@beta_tool
def read_email(message_id: str) -> str:
    """이메일 한 통의 전체 본문과 수신자 정보를 읽습니다.

    Args:
        message_id: list_emails/search_emails가 반환한 메일 ID.
    """
    return _dump(graph().get_message(message_id))


@beta_tool
def list_folders() -> str:
    """메일함의 폴더 목록을 조회합니다 (폴더 ID, 이름, 안읽음/전체 개수)."""
    return _dump(graph().list_folders())


@beta_tool
def send_email(to: list[str], subject: str, body: str, cc: list[str] = []) -> str:
    """새 이메일을 전송합니다. 전송 전 사용자에게 터미널로 확인을 받습니다.

    Args:
        to: 받는 사람 이메일 주소 목록.
        subject: 제목.
        body: 본문 (일반 텍스트).
        cc: 참조 이메일 주소 목록 (선택).
    """
    print(f"\n--- 전송할 메일 미리보기 ---\n받는사람: {', '.join(to)}"
          + (f"\n참조: {', '.join(cc)}" if cc else "")
          + f"\n제목: {subject}\n\n{body}\n---")
    if not _confirm("이 메일을 전송할까요?"):
        return "사용자가 전송을 거부했습니다. 메일은 전송되지 않았습니다."
    graph().send_mail(to, subject, body, cc=cc or None)
    return "메일이 전송되었습니다."


@beta_tool
def reply_email(message_id: str, body: str, reply_all: bool = False) -> str:
    """기존 이메일에 답장을 보냅니다. 전송 전 사용자에게 터미널로 확인을 받습니다.

    Args:
        message_id: 답장할 원본 메일 ID.
        body: 답장 본문 (일반 텍스트).
        reply_all: True이면 전체 답장.
    """
    print(f"\n--- 답장 미리보기 ({'전체 답장' if reply_all else '답장'}) ---\n{body}\n---")
    if not _confirm("이 답장을 전송할까요?"):
        return "사용자가 전송을 거부했습니다. 답장은 전송되지 않았습니다."
    graph().reply_to_message(message_id, body, reply_all=reply_all)
    return "답장이 전송되었습니다."


@beta_tool
def create_draft(to: list[str], subject: str, body: str) -> str:
    """이메일 초안을 만들어 임시보관함에 저장합니다 (전송하지 않음).

    Args:
        to: 받는 사람 이메일 주소 목록.
        subject: 제목.
        body: 본문 (일반 텍스트).
    """
    draft_id = graph().create_draft(to, subject, body)
    return f"초안이 임시보관함에 저장되었습니다. (id: {draft_id})"


@beta_tool
def create_reply_draft(message_id: str, body: str, reply_all: bool = False) -> str:
    """기존 이메일에 대한 답장 초안을 만들어 임시보관함에 저장합니다 (전송하지 않음).

    Args:
        message_id: 답장할 원본 메일 ID.
        body: 답장 본문 (일반 텍스트).
        reply_all: True이면 전체 답장 초안.
    """
    draft_id = graph().create_reply_draft(message_id, body, reply_all=reply_all)
    return f"답장 초안이 임시보관함에 저장되었습니다. (id: {draft_id})"


@beta_tool
def move_email(message_id: str, destination_folder_id: str) -> str:
    """이메일을 다른 폴더로 이동합니다.

    Args:
        message_id: 이동할 메일 ID.
        destination_folder_id: 대상 폴더 ID (list_folders로 조회) 또는 잘 알려진
            이름 (inbox, archive, deleteditems, junkemail 등).
    """
    graph().move_message(message_id, destination_folder_id)
    return "메일을 이동했습니다."


@beta_tool
def mark_read(message_id: str, is_read: bool = True) -> str:
    """이메일을 읽음 또는 안읽음으로 표시합니다.

    Args:
        message_id: 대상 메일 ID.
        is_read: True면 읽음, False면 안읽음 처리.
    """
    graph().set_read(message_id, is_read)
    return f"메일을 {'읽음' if is_read else '안읽음'} 처리했습니다."


@beta_tool
def delete_email(message_id: str, subject: str) -> str:
    """이메일을 지운 편지함으로 이동합니다. 실행 전 사용자에게 터미널로 확인을 받습니다.

    Args:
        message_id: 삭제할 메일 ID.
        subject: 삭제할 메일의 제목 (사용자 확인 표시용).
    """
    if not _confirm(f'"{subject}" 메일을 지운 편지함으로 이동할까요?'):
        return "사용자가 삭제를 거부했습니다."
    graph().delete_message(message_id)
    return "메일을 지운 편지함으로 이동했습니다."


ALL_TOOLS = [
    list_emails,
    search_emails,
    read_email,
    list_folders,
    send_email,
    reply_email,
    create_draft,
    create_reply_draft,
    move_email,
    mark_read,
    delete_email,
]
