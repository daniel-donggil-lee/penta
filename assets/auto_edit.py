#!/usr/bin/env python3
"""
펜타 보드 수정요청 자동 처리 스크립트
매 시간 crontab으로 실행됨
"""

import os, sys, json, re, subprocess, urllib.parse, urllib.request

# === 설정 ===
SPREADSHEET_ID = "1pdW8Xif8ZA75UbkAAbnn02wosNbO5kNnmuJ462E-nqw"
SERVICE_ACCOUNT_KEY = os.path.expanduser("~/Downloads/elem-writing-d09737ee13d7.json")
BOARD_DIR = "/Users/daniel/Desktop/0.NEWBIZ_MASTER/7.펜타/board"
TELEGRAM_BOT = "8429836920:AAF669WBcEtWcCUC7ND1WS6GiFmlyRXSvkw"
TELEGRAM_CHAT = "8007176661"

def get_api_key():
    """~/.secrets에서 ANTHROPIC_API_KEY 읽기"""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    secrets = os.path.expanduser("~/.secrets")
    if os.path.exists(secrets):
        with open(secrets) as f:
            for line in f:
                m = re.match(r'export\s+ANTHROPIC_API_KEY=["\']?([^"\';\s]+)', line)
                if m:
                    return m.group(1)
    return ""

def get_sheets_service():
    """Google Sheets API 서비스 객체 반환"""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_KEY, scopes=scopes
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)

def read_sheet(service, sheet_name, range_notation="A:Z"):
    """시트 읽기"""
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{range_notation}"
    ).execute()
    return result.get("values", [])

def write_cell(service, sheet_name, cell, value):
    """단일 셀 쓰기"""
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!{cell}",
        valueInputOption="RAW",
        body={"values": [[value]]}
    ).execute()

def send_telegram(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": TELEGRAM_CHAT, "text": text}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=10)
    except Exception as e:
        print(f"텔레그램 실패: {e}")

def url_to_path(url):
    url = url.split("?")[0]
    m = re.search(r'/penta/(.+)$', url)
    if not m:
        return None
    return os.path.join(BOARD_DIR, m.group(1))

def simple_replace(html, instruction):
    """A → B 패턴 단순 치환"""
    patterns = [
        r'^(.+?)\s*(?:->|→|->)\s*(.+?)(?:\s*로\s*수정)?$',
        r'^(.+?)\s*(?:을|를)\s*(.+?)\s*(?:로|으로)\s*수정$',
    ]
    for p in patterns:
        m = re.match(p, instruction.strip())
        if m:
            old, new = m.group(1).strip(), m.group(2).strip()
            if old in html:
                return html.replace(old, new, 1), f'"{old}" → "{new}"'
    return None, None

def claude_edit(html, instruction, api_key):
    """Claude API로 복잡한 수정"""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        preview = html[:4000]
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5000,
            messages=[{"role": "user", "content":
                f"HTML 파일에 아래 수정을 적용해주세요.\n\n"
                f"수정 지시: {instruction}\n\n"
                f"HTML (일부):\n{preview}\n\n"
                f"수정된 HTML 전체만 출력. 수정 없으면 NO_CHANGE 출력."}]
        )
        result = msg.content[0].text.strip()
        if result == "NO_CHANGE":
            return None, "수정 대상 없음"
        return result, "Claude 처리"
    except Exception as e:
        return None, f"Claude 오류: {e}"

def git_push():
    try:
        subprocess.run(["git", "add", "-A"], cwd=BOARD_DIR, check=True, capture_output=True)
        r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=BOARD_DIR)
        if r.returncode == 0:
            return False
        subprocess.run(
            ["git", "commit", "-m", "Auto-edit: 수정요청 자동 반영"],
            cwd=BOARD_DIR, check=True, capture_output=True
        )
        subprocess.run(["git", "push", "origin", "main"], cwd=BOARD_DIR, check=True, capture_output=True)
        return True
    except Exception as e:
        print(f"Git push 실패: {e}")
        return False

def main():
    print("=== 펜타 auto_edit 실행 ===")
    api_key = get_api_key()

    # 1. Sheets API로 수정요청 시트 읽기
    try:
        service = get_sheets_service()
        rows = read_sheet(service, "수정요청")
        print(f"수정요청 시트: {len(rows)}행")
    except Exception as e:
        print(f"시트 읽기 실패: {e}")
        return

    # 2. 미처리 항목 필터 (G열 비어있음 + URL 있음)
    todo = []
    for i, row in enumerate(rows[1:], start=2):
        url    = row[5] if len(row) > 5 else ""
        status = row[6] if len(row) > 6 else ""
        if url and not status:
            todo.append({
                "row": i,
                "section": row[1] if len(row) > 1 else "",
                "content": row[3] if len(row) > 3 else "",
                "url": url,
            })

    if not todo:
        print("미처리 없음. 종료.")
        return

    print(f"미처리 {len(todo)}개 처리 시작")
    results = []

    # 3. 처리
    for item in todo:
        row, section, instruction, url = item["row"], item["section"], item["content"], item["url"]
        path = url_to_path(url)
        fname = os.path.basename(path) if path else "unknown"

        if not path or not os.path.exists(path):
            write_cell(service, "수정요청", f"G{row}", "파일없음")
            results.append({"section": section, "content": instruction, "result": "❌ 파일없음", "file": fname})
            continue

        with open(path, "r", encoding="utf-8") as f:
            html = f.read()

        # 단순 치환 먼저
        new_html, applied = simple_replace(html, instruction)

        # 실패 시 Claude API
        if new_html is None and api_key:
            new_html, applied = claude_edit(html, instruction, api_key)

        if new_html and new_html != html:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_html)
            write_cell(service, "수정요청", f"G{row}", "처리완료")
            results.append({"section": section, "content": instruction, "result": "✅ 반영 완료", "file": fname})
            print(f"✅ row{row}: {applied}")
        else:
            write_cell(service, "수정요청", f"G{row}", "오류")
            results.append({"section": section, "content": instruction, "result": "❌ 처리 실패", "file": fname})
            print(f"❌ row{row}: 매칭 실패")

    # 4. Git push
    if any("반영 완료" in r["result"] for r in results):
        git_push()

    # 5. 텔레그램
    lines = ["📋 펜타 보드 수정 완료\n"]
    for r in results:
        lines.append(f"{r['result']} {r['section']}")
        lines.append(f"   요청: {r['content']}")
        lines.append(f"   페이지: {r['file']}\n")
    lines.append("🔗 https://daniel-donggil-lee.github.io/penta/")
    send_telegram("\n".join(lines))
    print("완료")

if __name__ == "__main__":
    main()
