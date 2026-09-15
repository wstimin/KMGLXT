# -*- coding: utf-8 -*-
"""十夜卡密 · Python 对接客户端(仅标准库,Python 3.8+)"""
import hashlib
import hmac
import json
import time
import secrets
import urllib.request

ENDPOINT = 'https://api.your-domain.com'  # 你的十夜卡密服务地址
APP_KEY = 'XXXXXXXXXXXXXXXXXXXXXXXX'
APP_SECRET = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'


def request(path, body):
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(8)
    body_hash = hashlib.sha256(raw).hexdigest()
    message = f"{APP_KEY}\n{timestamp}\n{nonce}\n{body_hash}".encode('utf-8')
    sign = hmac.new(APP_SECRET.encode('utf-8'), message, hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        ENDPOINT + path,
        data=raw,
        headers={
            'Content-Type': 'application/json',
            'X-App-Key': APP_KEY,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Sign': sign,
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def verify(card): return request('/api/v1/card/verify', {'card': card})
def activate(card): return request('/api/v1/card/activate', {'card': card})
def consume(card, times=1): return request('/api/v1/card/consume', {'card': card, 'times': times})
def query(card): return request('/api/v1/card/query', {'card': card})
def freeze(card): return request('/api/v1/card/freeze', {'card': card})
def unfreeze(card): return request('/api/v1/card/unfreeze', {'card': card})


if __name__ == '__main__':
    print(activate('SY2026XXXX'))