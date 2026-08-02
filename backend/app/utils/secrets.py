"""오류 메시지에서 API 키를 가린다.

외부 API 클라이언트는 요청 URL이 포함된 예외를 그대로 올리는 경우가 많아,
사용자에게 보이는 오류 메시지에 인증키가 노출될 수 있다.
모든 외부 서비스의 오류 문자열은 이 함수를 통과시킨다.
"""

from __future__ import annotations

import re

# authKey=xxx, serviceKey=xxx, key=xxx, consumer_secret=xxx, accessToken=xxx ...
_QUERY_KEY = re.compile(
    r"((?:auth|service|api|access|consumer_|app)?"
    r"(?:key|token|secret)\s*=\s*)([^&\s\"'>]+)",
    re.IGNORECASE,
)

# 경로에 키가 들어가는 형태:
#   http://openapi.seoul.go.kr:8088/{KEY}/json/...
#   https://api.vworld.kr/req/wmts/1.0.0/{KEY}/Base/...
_PATH_KEYS = (
    re.compile(r"(openapi\.seoul\.go\.kr(?::\d+)?/)([^/\s]+)(/)", re.IGNORECASE),
    re.compile(r"(api\.vworld\.kr/req/wmts/[\d.]+/)([^/\s]+)(/)", re.IGNORECASE),
)


def mask_secrets(value: object) -> str:
    """문자열(또는 예외)에서 인증키로 보이는 값을 ***로 치환한다."""
    text = _QUERY_KEY.sub(lambda m: f"{m.group(1)}***", str(value))
    for pattern in _PATH_KEYS:
        text = pattern.sub(lambda m: f"{m.group(1)}***{m.group(3)}", text)
    return text
