#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ==========================================
# CodeAI backend (Flask) - auth + email OTP + account
# Chạy: python server.py
# ==========================================

import base64
import codecs
import hashlib
import hmac
import json
import os
import posixpath
import re
import secrets
import shutil
import smtplib
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
from flask_sock import Sock

import casio_api
import projects_api
from project_realtime import ProjectHub

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------- .env ----------
def load_env(path):
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_env(os.path.join(BASE_DIR, '.env'))

PORT = int(os.environ.get('PORT', '3000'))
SECRET = os.environ.get('JWT_SECRET', 'dev-secret-change-me')
GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')

USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]{3,20}$')
GMAIL_RE = re.compile(r'^[^\s@]+@gmail\.com$', re.IGNORECASE)
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

PBKDF2_ITERATIONS = 200000
SESSION_TTL = 30 * 24 * 3600      # 30 ngày
OTP_TOKEN_TTL = 15 * 60           # 15 phút
CODE_TTL = 5 * 60                 # mã sống 5 phút
RESEND_COOLDOWN = 60              # giãn cách gửi lại
MAX_ATTEMPTS = 5
MAX_AVATAR_LENGTH = 800000

app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 30 * 1024 * 1024
sock = Sock(app)
project_hub = ProjectHub()

# ---------- Python runner ----------
PYTHON_EXE = sys.executable or 'python'
RUN_MAX_OUTPUT = 5 * 1024 * 1024   # 5MB cảnh báo mềm (không cắt tiến trình)


# ---------- C++ runner ----------
def _resolve_exe(candidate):
    if not candidate:
        return None
    if os.path.isabs(candidate) or '/' in candidate or '\\' in candidate:
        return candidate if os.path.exists(candidate) else None
    return shutil.which(candidate)


def detect_cpp_compiler():
    """Dò trình biên dịch C++: env CODEAI_CXX -> PATH -> path MSYS2/MinGW (Windows)."""
    candidates = [os.environ.get('CODEAI_CXX'), 'g++', 'c++', 'clang++']
    if os.name == 'nt':
        candidates += [
            r'C:\msys64\ucrt64\bin\g++.exe',
            r'C:\msys64\mingw64\bin\g++.exe',
            r'C:\mingw64\bin\g++.exe',
            r'C:\MinGW\bin\g++.exe',
        ]
    for c in candidates:
        found = _resolve_exe(c)
        if found:
            return found
    return None


CPP_COMPILER = detect_cpp_compiler()


# ---------- Java runner ----------
def _find_java_tool(name):
    exe = name + ('.exe' if os.name == 'nt' else '')
    candidates = []
    for home in (os.environ.get('CODEAI_JAVA_HOME'), os.environ.get('JAVA_HOME')):
        if home:
            candidates.append(os.path.join(home, 'bin', exe))
    candidates.append(name)
    if os.name == 'nt':
        local = os.environ.get('LOCALAPPDATA', '')
        roots = [
            os.path.join(local, 'CodeAI', 'jdk') if local else '',
            os.path.join(local, 'Programs', 'Eclipse Adoptium') if local else '',
            r'C:\Program Files\Microsoft',
            r'C:\Program Files\Eclipse Adoptium',
            r'C:\Program Files\Java',
        ]
        for root in roots:
            if not root or not os.path.isdir(root):
                continue
            try:
                for d in sorted(os.listdir(root), reverse=True):
                    candidates.append(os.path.join(root, d, 'bin', exe))
            except Exception:
                pass
    for c in candidates:
        found = _resolve_exe(c)
        if found:
            return found
    return None


def detect_java():
    """Dò JDK: env CODEAI_JAVA_HOME/JAVA_HOME -> PATH -> thư mục cài phổ biến."""
    javac = _find_java_tool('javac')
    if not javac:
        return None, None
    java = os.path.join(os.path.dirname(javac), 'java.exe' if os.name == 'nt' else 'java')
    if not os.path.exists(java):
        java = _find_java_tool('java')
    return javac, java


JAVA_COMPILER, JAVA_RUNTIME = detect_java()


def java_class_name(code):
    """Tên class chính trong file (ưu tiên public class/interface/enum/record)."""
    text = code if isinstance(code, str) else ''
    m = re.search(
        r'\bpublic\s+(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*'
        r'(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)',
        text)
    if not m:
        m = re.search(r'\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)', text)
    return m.group(1) if m else None


# ==========================================
# User store (JSON file)
# ==========================================

DATA_DIR = os.path.join(BASE_DIR, 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
_store_lock = threading.Lock()


def _ensure_store():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            f.write('[]')


def get_users():
    _ensure_store()
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f) or []
    except Exception as e:
        print('Failed to read users file:', e)
        return []


def save_users(users):
    _ensure_store()
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def find_user(users, predicate):
    for u in users:
        if predicate(u):
            return u
    return None


def generate_id(users):
    while True:
        uid = 'C' + '{:06d}'.format(secrets.randbelow(1000000))
        if not find_user(users, lambda u: u.get('id') == uid):
            return uid


# ==========================================
# App config (email sender) - set via web
# ==========================================

CONFIG_FILE = os.path.join(DATA_DIR, 'config.json')
_config_lock = threading.Lock()


def get_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f) or {}
    except Exception as e:
        print('Failed to read config:', e)
    return {}


def save_config(cfg):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_smtp_config():
    """config.json (web setup) ưu tiên, fallback về .env"""
    cfg = get_config()
    user = cfg.get('gmailUser') or GMAIL_USER
    password = cfg.get('gmailAppPassword') or GMAIL_APP_PASSWORD
    return user, password


def get_mail_config():
    """Thông tin cấu hình gửi mail hiện tại (SMTP hoặc Brevo API)."""
    cfg = get_config()
    
    # Auto-detect from environment variables (for Render, Heroku, etc.)
    env_brevo_key = os.environ.get('BREVO_API_KEY', '')
    env_brevo_sender = os.environ.get('BREVO_SENDER_EMAIL', '')
    env_brevo_name = os.environ.get('BREVO_SENDER_NAME', 'CodeAI')
    
    # If Brevo env vars exist, use them with priority
    if env_brevo_key and env_brevo_sender:
        return {
            'provider': 'brevo',
            'configured': True,
            'apiKey': env_brevo_key,
            'senderEmail': env_brevo_sender,
            'senderName': env_brevo_name,
        }
    
    provider = cfg.get('provider') or 'smtp'

    if provider == 'brevo':
        api_key = cfg.get('brevoApiKey')
        sender = cfg.get('senderEmail')
        if not api_key or not sender:
            return {'provider': 'brevo', 'configured': False}
        return {
            'provider': 'brevo',
            'configured': True,
            'apiKey': api_key,
            'senderEmail': sender,
            'senderName': cfg.get('senderName') or 'CodeAI',
        }

    user, password = get_smtp_config()
    if not user or not password:
        return {'provider': 'smtp', 'configured': False}
    return {
        'provider': 'smtp',
        'configured': True,
        'gmailUser': user,
        'gmailAppPassword': password,
    }


def is_mail_configured():
    return bool(get_mail_config().get('configured'))


# ==========================================
# Password hashing (PBKDF2-SHA256)
# ==========================================

def hash_password(password):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return 'pbkdf2_sha256${}${}${}'.format(PBKDF2_ITERATIONS, salt.hex(), dk.hex())


def verify_password(password, stored):
    try:
        algo, iterations, salt_hex, hash_hex = stored.split('$')
        if algo != 'pbkdf2_sha256':
            return False
        dk = hashlib.pbkdf2_hmac(
            'sha256', password.encode('utf-8'), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ==========================================
# Signed tokens (HMAC)
# ==========================================

def make_token(payload, ttl_seconds):
    data = {'d': payload, 'exp': time.time() + ttl_seconds}
    body = base64.urlsafe_b64encode(
        json.dumps(data).encode('utf-8')
    ).decode('ascii').rstrip('=')
    sig = hmac.new(SECRET.encode('utf-8'), body.encode('ascii'), hashlib.sha256).hexdigest()
    return body + '.' + sig


def read_token(token):
    if not token or '.' not in token:
        return None
    body, sig = token.rsplit('.', 1)
    expected = hmac.new(SECRET.encode('utf-8'), body.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        padded = body + '=' * (-len(body) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')))
    except Exception:
        return None
    if data.get('exp', 0) < time.time():
        return None
    return data.get('d')


def safe_user(user):
    return {k: v for k, v in user.items() if k != 'passwordHash'}


def current_user():
    header = request.headers.get('Authorization', '')
    token = header[7:] if header.startswith('Bearer ') else None
    payload = read_token(token) if token else None
    if not payload or payload.get('scope') != 'session':
        return None
    return find_user(get_users(), lambda u: u.get('id') == payload.get('id'))


def user_by_id(user_id):
    return find_user(get_users(), lambda u: u.get('id') == user_id)


projects_api.init_projects(app, current_user, user_by_id, project_hub)
casio_api.init_casio(app, current_user)


@app.errorhandler(413)
def payload_too_large(err):
    if request.path.startswith('/api/'):
        return jsonify({
            'error': 'payload_too_large',
            'message': 'Tệp tải lên quá lớn.'
        }), 413
    return 'Payload too large', 413


# ==========================================
# OTP store (in memory)
# ==========================================

_otp_lock = threading.Lock()
OTP = {}


def otp_key(purpose, email):
    return purpose + ':' + email.lower()


def gen_code():
    return '{:06d}'.format(secrets.randbelow(1000000))


# ==========================================
# Email sender (Gmail SMTP hoặc Brevo API/HTTPS)
# ==========================================

def _open_smtp(user, password):
    """Thử STARTTLS 587 trước, nếu lỗi thì thử SSL 465."""
    errors = []

    try:
        server = smtplib.SMTP('smtp.gmail.com', 587, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(user, password)
        return server
    except Exception as e:
        errors.append('587: {}'.format(e))

    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=20)
        server.ehlo()
        server.login(user, password)
        return server
    except Exception as e:
        errors.append('465: {}'.format(e))

    error_msg = ' | '.join(errors)
    # Detect if running on Render or similar platforms that block SMTP ports
    if 'Network is unreachable' in error_msg or 'Connection refused' in error_msg:
        raise RuntimeError('SMTP ports (587/465) bị chặn trên hosting này. Vui lòng dùng Brevo API thay vì Gmail SMTP. Hướng dẫn: https://github.com/phamthiennhauyen-web/codeaiweb-#email-setup')
    raise RuntimeError(error_msg)


def test_smtp_login(user, password):
    server = _open_smtp(user, password)
    try:
        server.quit()
    except Exception:
        pass


def _otp_email_html(code):
    return """
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#0066ff;margin:0 0 8px;">CodeAI</h2>
        <p style="color:#333;font-size:15px;">Mã xác thực của bạn là:</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#0066ff;padding:16px 0;">{code}</div>
        <p style="color:#666;font-size:13px;">Mã có hiệu lực trong 5 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
    </div>
    """.format(code=code)


def _send_smtp(sender, password, to, code):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'CodeAI - Mã xác thực của bạn: {}'.format(code)
    msg['From'] = 'CodeAI <{}>'.format(sender)
    msg['To'] = to
    msg.attach(MIMEText(_otp_email_html(code), 'html', 'utf-8'))

    server = _open_smtp(sender, password)
    try:
        server.sendmail(sender, [to], msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass


# ---------- Brevo (HTTPS API, cổng 443) ----------

def _brevo_message(body, fallback):
    if isinstance(body, dict):
        return body.get('message') or body.get('error') or fallback
    return fallback


def brevo_request(method, path, payload, api_key):
    url = 'https://api.brevo.com' + path
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('api-key', api_key)
    req.add_header('accept', 'application/json')
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode('utf-8') or '{}'
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8') or '{}'
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'message': raw}


def brevo_validate(api_key, sender_email):
    status, body = brevo_request('GET', '/v3/account', None, api_key)
    if status != 200:
        raise RuntimeError(_brevo_message(body, 'API key không hợp lệ (HTTP {})'.format(status)))

    status, body = brevo_request('GET', '/v3/senders', None, api_key)
    if status != 200:
        raise RuntimeError(_brevo_message(body, 'Không đọc được danh sách sender (HTTP {})'.format(status)))

    senders = body.get('senders', []) if isinstance(body, dict) else []
    match = None
    for s in senders:
        if str(s.get('email', '')).lower() == sender_email.lower():
            match = s
            break
    if not match:
        raise RuntimeError('Email gửi "{}" chưa có trong Brevo → vào Brevo > Senders & IP để verify'.format(sender_email))
    if not match.get('active'):
        raise RuntimeError('Email gửi "{}" chưa được kích hoạt trong Brevo'.format(sender_email))


def _send_brevo(api_key, sender_email, sender_name, to, code):
    payload = {
        'sender': {'name': sender_name or 'CodeAI', 'email': sender_email},
        'to': [{'email': to}],
        'subject': 'CodeAI - Mã xác thực của bạn: {}'.format(code),
        'htmlContent': _otp_email_html(code),
    }
    status, body = brevo_request('POST', '/v3/smtp/email', payload, api_key)
    if status not in (200, 201, 202):
        raise RuntimeError(_brevo_message(body, 'Brevo gửi thất bại (HTTP {})'.format(status)))


def send_verification_email(to, code):
    cfg = get_mail_config()
    if not cfg.get('configured'):
        raise RuntimeError('Mail not configured')

    if cfg['provider'] == 'brevo':
        _send_brevo(cfg['apiKey'], cfg['senderEmail'], cfg['senderName'], to, code)
    else:
        _send_smtp(cfg['gmailUser'], cfg['gmailAppPassword'], to, code)


# ==========================================
# Routes: OTP
# ==========================================

@app.post('/api/otp/send')
def otp_send():
    data = request.get_json(silent=True) or {}
    email = data.get('email')
    purpose = data.get('purpose')

    if not email or not GMAIL_RE.match(email):
        return jsonify({'error': 'invalid_email'}), 400
    if purpose not in ('register', 'change-email'):
        return jsonify({'error': 'invalid_purpose'}), 400

    if not is_mail_configured():
        return jsonify({'error': 'smtp_not_configured'}), 503

    key = otp_key(purpose, email)
    now = time.time()

    with _otp_lock:
        rec = OTP.get(key)
        if rec and now - rec['lastSent'] < RESEND_COOLDOWN:
            wait = int(RESEND_COOLDOWN - (now - rec['lastSent'])) + 1
            return jsonify({'error': 'rate_limited', 'wait': wait}), 429
        code = gen_code()
        OTP[key] = {'code': code, 'expires': now + CODE_TTL, 'attempts': 0, 'lastSent': now}

    try:
        send_verification_email(email, code)
        return jsonify({'ok': True})
    except Exception as e:
        print('Send mail failed:', e)
        with _otp_lock:
            OTP.pop(key, None)
        return jsonify({'error': 'send_failed'}), 500


@app.post('/api/otp/verify')
def otp_verify():
    data = request.get_json(silent=True) or {}
    email = data.get('email')
    code = data.get('code')
    purpose = data.get('purpose')

    if not email or not code or not purpose:
        return jsonify({'error': 'missing'}), 400

    key = otp_key(purpose, email)

    with _otp_lock:
        rec = OTP.get(key)
        if not rec:
            return jsonify({'error': 'no_code'}), 400
        if time.time() > rec['expires']:
            OTP.pop(key, None)
            return jsonify({'error': 'expired'}), 400
        rec['attempts'] += 1
        if rec['attempts'] > MAX_ATTEMPTS:
            OTP.pop(key, None)
            return jsonify({'error': 'too_many'}), 429
        if rec['code'] != str(code):
            return jsonify({'error': 'invalid_code'}), 400
        OTP.pop(key, None)

    token = make_token(
        {'email': email.lower(), 'purpose': purpose, 'scope': 'otp'},
        OTP_TOKEN_TTL
    )
    return jsonify({'ok': True, 'verificationToken': token})


# ==========================================
# Routes: Auth
# ==========================================

@app.post('/api/auth/register')
def auth_register():
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    verification_token = data.get('verificationToken')

    if not username or not email or not password:
        return jsonify({'error': 'missing'}), 400
    if not USERNAME_RE.match(username):
        return jsonify({'error': 'invalid_username'}), 400
    if not GMAIL_RE.match(email):
        return jsonify({'error': 'invalid_email'}), 400
    if len(str(password)) < 6:
        return jsonify({'error': 'invalid_password'}), 400

    vt = read_token(verification_token)
    if (not vt or vt.get('scope') != 'otp' or vt.get('purpose') != 'register'
            or vt.get('email') != email.lower()):
        return jsonify({'error': 'not_verified'}), 400

    with _store_lock:
        users = get_users()
        if find_user(users, lambda u: u['username'].lower() == username.lower()):
            return jsonify({'error': 'username_taken'}), 409
        if find_user(users, lambda u: u['email'].lower() == email.lower()):
            return jsonify({'error': 'email_taken'}), 409

        user = {
            'id': generate_id(users),
            'username': username,
            'displayName': username,
            'email': email.lower(),
            'passwordHash': hash_password(password),
            'avatar': None,
            'bio': '',
            'language': 'vi',
            'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
        users.append(user)
        save_users(users)

    return jsonify({
        'ok': True,
        'token': make_token({'id': user['id'], 'scope': 'session'}, SESSION_TTL),
        'user': safe_user(user),
    })


@app.post('/api/auth/login')
def auth_login():
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'missing'}), 400

    users = get_users()
    user = find_user(
        users,
        lambda u: u['username'].lower() == username.lower() or u['email'].lower() == username.lower()
    )
    if not user or not verify_password(password, user.get('passwordHash', '')):
        return jsonify({'error': 'invalid_credentials'}), 401

    return jsonify({
        'ok': True,
        'token': make_token({'id': user['id'], 'scope': 'session'}, SESSION_TTL),
        'user': safe_user(user),
    })


@app.post('/api/auth/logout')
def auth_logout():
    return jsonify({'ok': True})


@app.get('/api/auth/me')
def auth_me():
    user = current_user()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    return jsonify({'ok': True, 'user': safe_user(user)})


# ==========================================
# Routes: Account
# ==========================================

@app.put('/api/account/profile')
def account_profile():
    user = current_user()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    patch = {}

    if 'username' in data and isinstance(data['username'], str):
        value = data['username'].strip()
        if not USERNAME_RE.match(value):
            return jsonify({'error': 'invalid_username'}), 400
        patch['username'] = value

    if 'displayName' in data and isinstance(data['displayName'], str):
        value = data['displayName'].strip()
        if len(value) < 1 or len(value) > 40:
            return jsonify({'error': 'invalid_displayname'}), 400
        patch['displayName'] = value

    if 'bio' in data and isinstance(data['bio'], str):
        if len(data['bio']) > 300:
            return jsonify({'error': 'invalid_bio'}), 400
        patch['bio'] = data['bio']

    if 'avatar' in data:
        avatar = data['avatar']
        if avatar is not None and not isinstance(avatar, str):
            return jsonify({'error': 'invalid_avatar'}), 400
        if isinstance(avatar, str) and len(avatar) > MAX_AVATAR_LENGTH:
            return jsonify({'error': 'avatar_too_large'}), 400
        patch['avatar'] = avatar

    with _store_lock:
        users = get_users()
        target = find_user(users, lambda u: u['id'] == user['id'])
        if not target:
            return jsonify({'error': 'unauthorized'}), 401

        if 'username' in patch:
            taken = find_user(
                users,
                lambda u: u['id'] != user['id']
                and u['username'].lower() == patch['username'].lower()
            )
            if taken:
                return jsonify({'error': 'username_taken'}), 409

        target.update(patch)
        save_users(users)

    return jsonify({'ok': True, 'user': safe_user(target)})


@app.post('/api/account/change-email')
def account_change_email():
    user = current_user()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    new_email = data.get('newEmail')
    verification_token = data.get('verificationToken')

    if not new_email or not GMAIL_RE.match(new_email):
        return jsonify({'error': 'invalid_email'}), 400

    vt = read_token(verification_token)
    if (not vt or vt.get('scope') != 'otp' or vt.get('purpose') != 'change-email'
            or vt.get('email') != new_email.lower()):
        return jsonify({'error': 'not_verified'}), 400

    with _store_lock:
        users = get_users()
        existing = find_user(users, lambda u: u['email'].lower() == new_email.lower())
        if existing and existing['id'] != user['id']:
            return jsonify({'error': 'email_taken'}), 409
        target = find_user(users, lambda u: u['id'] == user['id'])
        target['email'] = new_email.lower()
        save_users(users)

    return jsonify({'ok': True, 'user': safe_user(target)})


@app.post('/api/account/change-password')
def account_change_password():
    user = current_user()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')

    if not current_password or not new_password:
        return jsonify({'error': 'missing'}), 400
    if len(str(new_password)) < 6:
        return jsonify({'error': 'invalid_password'}), 400
    if not verify_password(current_password, user.get('passwordHash', '')):
        return jsonify({'error': 'wrong_password'}), 400

    with _store_lock:
        users = get_users()
        target = find_user(users, lambda u: u['id'] == user['id'])
        target['passwordHash'] = hash_password(new_password)
        save_users(users)

    return jsonify({'ok': True})


@app.put('/api/account/settings')
def account_settings():
    user = current_user()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    language = data.get('language')
    if language not in ('vi', 'en'):
        return jsonify({'error': 'invalid_language'}), 400

    with _store_lock:
        users = get_users()
        target = find_user(users, lambda u: u['id'] == user['id'])
        target['language'] = language
        save_users(users)

    return jsonify({'ok': True, 'user': safe_user(target)})


# ==========================================
# Routes: Setup (cấu hình gửi mail trên web)
# ==========================================

def _mask_email(email):
    name, sep, domain = email.partition('@')
    if not sep:
        return email
    shown = name[:2] if len(name) >= 2 else name[:1]
    return shown + '***@' + domain


@app.get('/api/setup/status')
def setup_status():
    mail = get_mail_config()
    cfg = get_config()

    identity = None
    if mail.get('configured'):
        identity = mail.get('senderEmail') or mail.get('gmailUser')

    return jsonify({
        'ok': True,
        'configured': bool(mail.get('configured')),
        'provider': mail.get('provider'),
        'email': _mask_email(identity) if identity else None,
        'hasAdmin': bool(cfg.get('adminHash')),
    })


@app.post('/api/setup/save')
def setup_save():
    data = request.get_json(silent=True) or {}
    provider = (data.get('provider') or 'smtp').lower()
    admin_password = data.get('adminPassword') or ''

    if provider not in ('smtp', 'brevo'):
        return jsonify({'error': 'invalid_provider'}), 400

    with _config_lock:
        cfg = get_config()

        if cfg.get('adminHash'):
            if not admin_password or not verify_password(admin_password, cfg['adminHash']):
                return jsonify({'error': 'wrong_admin'}), 401
        else:
            if len(admin_password) < 4:
                return jsonify({'error': 'weak_admin'}), 400

        if provider == 'smtp':
            gmail_user = (data.get('gmailUser') or '').strip()
            app_password = (data.get('gmailAppPassword') or '').strip().replace(' ', '')

            if not GMAIL_RE.match(gmail_user):
                return jsonify({'error': 'invalid_email'}), 400
            if not app_password:
                return jsonify({'error': 'missing'}), 400

            try:
                test_smtp_login(gmail_user, app_password)
            except Exception as e:
                return jsonify({'error': 'smtp_failed', 'message': str(e)}), 400

            cfg['provider'] = 'smtp'
            cfg['gmailUser'] = gmail_user
            cfg['gmailAppPassword'] = app_password
            cfg.pop('brevoApiKey', None)
            cfg.pop('senderEmail', None)
            cfg.pop('senderName', None)
            identity = gmail_user

        else:  # brevo
            api_key = (data.get('brevoApiKey') or '').strip()
            sender_email = (data.get('senderEmail') or '').strip()
            sender_name = (data.get('senderName') or '').strip() or 'CodeAI'

            if not api_key:
                return jsonify({'error': 'missing'}), 400
            if not EMAIL_RE.match(sender_email):
                return jsonify({'error': 'invalid_email'}), 400

            try:
                brevo_validate(api_key, sender_email)
            except Exception as e:
                return jsonify({'error': 'brevo_failed', 'message': str(e)}), 400

            cfg['provider'] = 'brevo'
            cfg['brevoApiKey'] = api_key
            cfg['senderEmail'] = sender_email
            cfg['senderName'] = sender_name
            cfg.pop('gmailUser', None)
            cfg.pop('gmailAppPassword', None)
            identity = sender_email

        if not cfg.get('adminHash'):
            cfg['adminHash'] = hash_password(admin_password)
        cfg['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        save_config(cfg)

    return jsonify({'ok': True, 'provider': provider, 'email': _mask_email(identity)})


# ==========================================
# Python runner (WebSocket console)
# ==========================================

def _kill_tree(proc):
    if proc is None:
        return
    try:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            proc.kill()
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


@sock.route('/ws/projects')
def ws_projects(ws):
    client = project_hub.add(ws)
    user = None
    share_project_id = None

    try:
        first = ws.receive(timeout=15)
        data = json.loads(first or '{}')
        session_token = data.get('sessionToken')
        share_token = data.get('shareToken')

        if session_token:
            payload = read_token(session_token)
            if not payload or payload.get('scope') != 'session':
                project_hub.send(client, {'type': 'error', 'message': 'unauthorized'})
                return
            user = find_user(get_users(), lambda u: u.get('id') == payload.get('id'))
            if not user:
                project_hub.send(client, {'type': 'error', 'message': 'unauthorized'})
                return
            project_hub.subscribe(ws, 'user:' + user['id'])
            project_hub.send(client, {
                'type': 'ready',
                'mode': 'session',
                'userId': user['id']
            })
        elif share_token:
            resolved = projects_api.resolve_share_for_ws(share_token)
            if not resolved:
                project_hub.send(client, {'type': 'error', 'message': 'unauthorized'})
                return
            share_project_id = resolved['projectId']
            project_hub.subscribe(ws, 'project:' + share_project_id)
            project_hub.send(client, {
                'type': 'ready',
                'mode': 'share',
                'projectId': share_project_id
            })
        else:
            project_hub.send(client, {'type': 'error', 'message': 'unauthorized'})
            return

        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                message = json.loads(raw)
            except Exception:
                project_hub.send(client, {'type': 'error', 'message': 'invalid_json'})
                continue

            kind = message.get('type')
            if kind == 'ping':
                project_hub.send(client, {'type': 'pong', 'at': int(time.time() * 1000)})
                continue

            if kind == 'subscribe':
                project_id = str(message.get('projectId') or '')
                if not project_id:
                    project_hub.send(client, {'type': 'error', 'message': 'project_required'})
                    continue
                allowed = False
                if share_project_id:
                    allowed = project_id == share_project_id
                elif user:
                    allowed = projects_api.can_view_project(project_id, user['id'])
                if not allowed:
                    project_hub.send(client, {'type': 'error', 'message': 'forbidden'})
                    continue
                project_hub.subscribe(ws, 'project:' + project_id)
                project_hub.send(client, {'type': 'subscribed', 'projectId': project_id})
                continue

            if kind == 'unsubscribe':
                project_id = str(message.get('projectId') or '')
                if project_id:
                    project_hub.unsubscribe(ws, 'project:' + project_id)
                continue
    except Exception:
        pass
    finally:
        project_hub.remove(ws)


@sock.route('/ws/run')
def ws_run(ws):
    token = request.args.get('token', '')
    payload = read_token(token) if token else None
    ok = bool(payload) and payload.get('scope') == 'session' and \
        find_user(get_users(), lambda u: u.get('id') == payload.get('id'))
    if not ok:
        try:
            ws.send(json.dumps({'type': 'error', 'message': 'unauthorized'}))
        except Exception:
            pass
        return

    send_lock = threading.Lock()
    lock = threading.Lock()
    st = {'proc': None, 'dir': None}

    def send(obj):
        with send_lock:
            try:
                ws.send(json.dumps(obj, ensure_ascii=False))
            except Exception:
                pass

    def stop_current():
        with lock:
            proc = st['proc']
            tmp = st['dir']
            st['proc'] = None
            st['dir'] = None
        _kill_tree(proc)
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    def read_stream(proc):
        """Đọc stdout (đã gộp stderr) của tiến trình và gửi ra WS, trả về mã thoát."""
        dec = codecs.getincrementaldecoder('utf-8')('replace')
        fd = proc.stdout.fileno()
        try:
            while True:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                text = dec.decode(chunk)
                if text:
                    send({'type': 'output', 'data': text})
        except Exception:
            pass
        tail = dec.decode(b'', True)
        if tail:
            send({'type': 'output', 'data': tail})
        return proc.wait()

    def reader(proc, tmp):
        code = read_stream(proc)
        with lock:
            if st['proc'] is proc:
                st['proc'] = None
                st['dir'] = None
                shutil.rmtree(tmp, ignore_errors=True)
                cleaned = True
            else:
                cleaned = False
        send({'type': 'exit', 'code': code, 'cleaned': cleaned})

    def _popen(cmd, tmp, **kw):
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        return subprocess.Popen(cmd, cwd=tmp, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, bufsize=0,
                                creationflags=creationflags, **kw)

    def start_python(code, tmp):
        try:
            with open(os.path.join(tmp, 'main.py'), 'w', encoding='utf-8') as f:
                f.write(code if isinstance(code, str) else '')
            env = dict(os.environ)
            env['PYTHONIOENCODING'] = 'utf-8'
            env['PYTHONUNBUFFERED'] = '1'
            proc = _popen([PYTHON_EXE, '-u', 'main.py'], tmp, env=env, stdin=subprocess.PIPE)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return
        with lock:
            st['proc'] = proc
            st['dir'] = tmp
        send({'type': 'started'})
        threading.Thread(target=reader, args=(proc, tmp), daemon=True).start()

    def runner_cpp(tmp):
        bin_name = 'main.exe' if os.name == 'nt' else 'main'
        if os.name == 'nt':
            flags = ['-static']
        else:
            flags = ['-static-libgcc', '-static-libstdc++']
        cmd = [CPP_COMPILER, '-O2', '-std=c++17'] + flags + ['-o', bin_name, 'main.cpp']
        # g++ cần thư mục chứa nó trong PATH để tìm cc1plus/ld và các DLL đi kèm
        cenv = dict(os.environ)
        cenv['PATH'] = os.path.dirname(CPP_COMPILER) + os.pathsep + cenv.get('PATH', '')
        try:
            comp = _popen(cmd, tmp, stdin=subprocess.DEVNULL, env=cenv)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return
        with lock:
            st['proc'] = comp
            st['dir'] = tmp

        code = read_stream(comp)
        with lock:
            stopped = st['proc'] is not comp
            if not stopped:
                st['proc'] = None
        if stopped:
            return
        if code != 0:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'exit', 'code': code, 'cleaned': True, 'compileFailed': True})
            return

        env = dict(os.environ)
        try:
            proc = _popen([os.path.join(tmp, bin_name)], tmp, env=env, stdin=subprocess.PIPE)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return
        with lock:
            st['proc'] = proc
            st['dir'] = tmp
        threading.Thread(target=reader, args=(proc, tmp), daemon=True).start()

    def start_java(code, tmp):
        if not JAVA_COMPILER or not JAVA_RUNTIME:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'java_not_found'})
            return
        class_name = java_class_name(code)
        if not class_name:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'java_no_class'})
            return
        src_name = class_name + '.java'
        try:
            with open(os.path.join(tmp, src_name), 'w', encoding='utf-8') as f:
                f.write(code if isinstance(code, str) else '')
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return

        env = dict(os.environ)
        comp_cmd = [JAVA_COMPILER, '-encoding', 'UTF-8', '-d', '.', src_name]
        try:
            comp = _popen(comp_cmd, tmp, stdin=subprocess.DEVNULL, env=env)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return
        with lock:
            st['proc'] = comp
            st['dir'] = tmp
        send({'type': 'started'})

        code_exit = read_stream(comp)
        with lock:
            stopped = st['proc'] is not comp
            if not stopped:
                st['proc'] = None
        if stopped:
            return
        if code_exit != 0:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'exit', 'code': code_exit, 'cleaned': True, 'compileFailed': True})
            return

        run_cmd = [JAVA_RUNTIME,
                   '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
                   '-cp', '.', class_name]
        try:
            proc = _popen(run_cmd, tmp, env=env, stdin=subprocess.PIPE)
        except Exception as e:
            shutil.rmtree(tmp, ignore_errors=True)
            send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
            return
        with lock:
            st['proc'] = proc
            st['dir'] = tmp
        threading.Thread(target=reader, args=(proc, tmp), daemon=True).start()

    def start(code, lang):
        stop_current()
        tmp = tempfile.mkdtemp(prefix='codeai_run_')
        if lang == 'java':
            start_java(code, tmp)
            return
        if lang == 'cpp':
            if not CPP_COMPILER:
                shutil.rmtree(tmp, ignore_errors=True)
                send({'type': 'error', 'message': 'compiler_not_found'})
                return
            try:
                with open(os.path.join(tmp, 'main.cpp'), 'w', encoding='utf-8') as f:
                    f.write(code if isinstance(code, str) else '')
            except Exception as e:
                shutil.rmtree(tmp, ignore_errors=True)
                send({'type': 'error', 'message': 'spawn_failed: ' + str(e)})
                return
            send({'type': 'started'})
            threading.Thread(target=runner_cpp, args=(tmp,), daemon=True).start()
            return
        start_python(code, tmp)

    try:
        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            mtype = msg.get('type')
            if mtype == 'start':
                start(msg.get('code', ''), msg.get('lang', 'python'))
            elif mtype == 'input':
                with lock:
                    proc = st['proc']
                if proc and proc.stdin and proc.poll() is None:
                    try:
                        proc.stdin.write((msg.get('data', '') + '\n').encode('utf-8'))
                        proc.stdin.flush()
                    except Exception:
                        pass
            elif mtype == 'stop':
                stop_current()
                send({'type': 'stopped'})
    finally:
        stop_current()


# ==========================================
# Chat AI proxy
# ==========================================

CHAT_IDLE_TIMEOUT = 900
CHAT_MODELS_TIMEOUT = 60
CHAT_TEST_TIMEOUT = 180
CHAT_PING_TIMEOUT = 15
CHAT_MAX_BYTES = 32 * 1024 * 1024
CHAT_MAX_MODELS_BYTES = 4 * 1024 * 1024


def chat_normalize_base(raw):
    raw = (raw or '').strip()
    if not raw:
        raise ValueError('missing_base_url')
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ValueError('invalid_base_url')
    if parsed.hostname in ('169.254.169.254', 'metadata.google.internal'):
        raise ValueError('invalid_base_url')
    return raw.rstrip('/')


def chat_completions_url(base):
    parsed = urllib.parse.urlsplit(base)
    path = parsed.path.rstrip('/')
    if path.lower().endswith('/chat/completions'):
        return base
    if not path:
        path = '/v1/chat/completions'
    else:
        path = path + '/chat/completions'
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ''))


def chat_models_url(base):
    parsed = urllib.parse.urlsplit(base)
    path = parsed.path.rstrip('/')
    low = path.lower()
    if low.endswith('/models'):
        return base
    if low.endswith('/chat/completions'):
        path = path[:-len('/chat/completions')]
    if not path:
        path = '/v1/models'
    else:
        path = path + '/models'
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ''))


def chat_set_header(headers, name, value):
    for existing in list(headers.keys()):
        if existing.lower() == name.lower():
            del headers[existing]
    headers[name] = value


def chat_headers(payload, accept):
    headers = {'Content-Type': 'application/json', 'Accept': accept}
    key = payload.get('apiKey')
    key = key.strip() if isinstance(key, str) else ''
    if key.lower().startswith('bearer '):
        key = key[7:].strip()
    mode = (payload.get('authMode') or 'bearer').lower()
    extra = payload.get('extraHeaders')
    if isinstance(extra, dict):
        for name, value in extra.items():
            if not isinstance(name, str) or not isinstance(value, str):
                continue
            if name.lower() in ('host', 'content-length', 'connection', 'transfer-encoding', 'content-type', 'accept'):
                continue
            headers[name] = value
    if key:
        for existing in list(headers.keys()):
            if existing.lower() in ('authorization', 'api-key', 'x-api-key'):
                del headers[existing]
        if mode == 'api-key':
            chat_set_header(headers, 'api-key', key)
        elif mode == 'x-api-key':
            chat_set_header(headers, 'x-api-key', key)
        elif mode != 'none':
            chat_set_header(headers, 'Authorization', 'Bearer ' + key)
    return headers


def chat_pick_error(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [chat_pick_error(item) for item in value]
        return '; '.join([part for part in parts if part])
    if isinstance(value, dict):
        detail = value.get('detail') or value.get('message') or value.get('reason')
        title = value.get('title') or value.get('type')
        if isinstance(detail, (dict, list)):
            detail = chat_pick_error(detail)
        if isinstance(title, (dict, list)):
            title = chat_pick_error(title)
        if detail:
            detail = str(detail).strip()
            title = str(title).strip() if title else ''
            if title and title.lower() not in detail.lower():
                return title + ': ' + detail
            return detail
        if value.get('error') is not None:
            return chat_pick_error(value.get('error'))
        code = value.get('code')
        if code is not None:
            return str(code)
    return ''


def chat_error_message(exc):
    try:
        raw = exc.read(16384)
        text = raw.decode('utf-8', 'replace').strip()
    except Exception:
        text = ''
    try:
        data = json.loads(text)
        message = chat_pick_error(data)
        if message:
            return message[:2000]
    except Exception:
        pass
    if text.startswith('<'):
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
    return text[:2000] or 'HTTP {}'.format(getattr(exc, 'code', ''))


def chat_json_error(message, status=502, code='upstream_error', extra=None):
    out_status = status if 400 <= status <= 599 else 502
    body = {'error': code, 'status': status, 'message': message}
    if isinstance(extra, dict):
        body.update(extra)
    return jsonify(body), out_status


@app.post('/api/chat/models')
def chat_models():
    if not current_user():
        return jsonify({'error': 'unauthorized'}), 401
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({'error': 'too_large'}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'invalid_request'}), 400
    try:
        url = chat_models_url(chat_normalize_base(payload.get('baseUrl')))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    req = urllib.request.Request(url, headers=chat_headers(payload, 'application/json'), method='GET')
    try:
        with urllib.request.urlopen(req, timeout=CHAT_MODELS_TIMEOUT) as resp:
            raw = resp.read(CHAT_MAX_MODELS_BYTES)
    except urllib.error.HTTPError as exc:
        return chat_json_error(chat_error_message(exc), exc.code)
    except Exception as exc:
        return chat_json_error(str(exc), 502, 'upstream_unreachable')

    try:
        data = json.loads(raw.decode('utf-8', 'replace'))
    except Exception:
        return chat_json_error('invalid_response')
    items = None
    if isinstance(data, dict):
        items = data.get('data')
        if items is None:
            items = data.get('models')
    if not isinstance(items, list):
        return chat_json_error('invalid_response')

    models = []
    seen = set()
    for item in items:
        if isinstance(item, str):
            model_id, name = item, item
        elif isinstance(item, dict):
            model_id = item.get('id') or item.get('name') or item.get('model')
            name = item.get('name') or item.get('display_name') or model_id
        else:
            continue
        if not isinstance(model_id, str) or not model_id or model_id in seen:
            continue
        seen.add(model_id)
        models.append({'id': model_id, 'name': name if isinstance(name, str) else model_id})
    models.sort(key=lambda item: item['id'].lower())
    return jsonify({'ok': True, 'models': models})


@app.post('/api/chat/test')
def chat_test():
    if not current_user():
        return jsonify({'error': 'unauthorized'}), 401
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({'error': 'too_large'}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'invalid_request'}), 400
    model_id = payload.get('modelId')
    model_id = model_id.strip() if isinstance(model_id, str) else ''
    if not model_id:
        return jsonify({'error': 'missing_model'}), 400
    try:
        url = chat_completions_url(chat_normalize_base(payload.get('baseUrl')))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    upstream = {
        'model': model_id,
        'messages': [{'role': 'user', 'content': 'Reply with exactly: OK'}],
        'stream': False
    }
    body = json.dumps(upstream, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=chat_headers(payload, 'application/json'), method='POST')
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=CHAT_TEST_TIMEOUT) as resp:
            raw = resp.read(4 * 1024 * 1024)
    except urllib.error.HTTPError as exc:
        latency = int((time.perf_counter() - started) * 1000)
        return chat_json_error(chat_error_message(exc), exc.code, 'upstream_error', {'latencyMs': latency})
    except Exception as exc:
        latency = int((time.perf_counter() - started) * 1000)
        return chat_json_error(str(exc), 502, 'upstream_unreachable', {'latencyMs': latency})

    latency = int((time.perf_counter() - started) * 1000)
    try:
        data = json.loads(raw.decode('utf-8', 'replace'))
    except Exception:
        return chat_json_error('invalid_response', 502, 'invalid_response', {'latencyMs': latency})
    choices = data.get('choices') if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        return chat_json_error('invalid_response', 502, 'invalid_response', {'latencyMs': latency})
    reply = ''
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get('message') if isinstance(first.get('message'), dict) else {}
    content = message.get('content')
    if content is None:
        content = first.get('text')
    if isinstance(content, list):
        reply = ''.join([part.get('text', '') for part in content if isinstance(part, dict)])
    elif isinstance(content, str):
        reply = content
    return jsonify({'ok': True, 'latencyMs': latency, 'reply': reply[:300], 'modelId': model_id})


@app.post('/api/chat/ping')
def chat_ping():
    if not current_user():
        return jsonify({'error': 'unauthorized'}), 401
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({'error': 'too_large'}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'invalid_request'}), 400
    try:
        url = chat_models_url(chat_normalize_base(payload.get('baseUrl')))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    req = urllib.request.Request(url, headers=chat_headers(payload, 'application/json'), method='GET')
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=CHAT_PING_TIMEOUT) as resp:
            resp.read(1024)
    except urllib.error.HTTPError as exc:
        latency = int((time.perf_counter() - started) * 1000)
        return chat_json_error(chat_error_message(exc), exc.code, 'upstream_error', {'latencyMs': latency})
    except Exception as exc:
        latency = int((time.perf_counter() - started) * 1000)
        return chat_json_error(str(exc), 502, 'upstream_unreachable', {'latencyMs': latency})

    latency = int((time.perf_counter() - started) * 1000)
    return jsonify({'ok': True, 'latencyMs': latency})


@app.post('/api/chat/stream')
def chat_stream():
    if not current_user():
        return jsonify({'error': 'unauthorized'}), 401
    if request.content_length and request.content_length > CHAT_MAX_BYTES:
        return jsonify({'error': 'too_large'}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'invalid_request'}), 400
    messages = payload.get('messages')
    if not isinstance(messages, list) or not messages:
        return jsonify({'error': 'missing_messages'}), 400
    model_id = payload.get('modelId')
    model_id = model_id.strip() if isinstance(model_id, str) else ''
    if not model_id:
        return jsonify({'error': 'missing_model'}), 400
    try:
        url = chat_completions_url(chat_normalize_base(payload.get('baseUrl')))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    upstream = {'model': model_id, 'messages': messages, 'stream': True}
    params = payload.get('params')
    if isinstance(params, dict):
        for name, value in params.items():
            if name not in upstream and name != 'stream':
                upstream[name] = value

    headers = chat_headers(payload, 'text/event-stream')
    body = json.dumps(upstream, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        resp = urllib.request.urlopen(req, timeout=CHAT_IDLE_TIMEOUT)
    except urllib.error.HTTPError as exc:
        return chat_json_error(chat_error_message(exc), exc.code)
    except Exception as exc:
        return chat_json_error(str(exc), 502, 'upstream_unreachable')

    content_type = (resp.headers.get('Content-Type') or '').lower()

    def generate():
        try:
            if 'json' in content_type and 'event-stream' not in content_type:
                raw = resp.read(8 * 1024 * 1024)
                text = raw.decode('utf-8', 'replace')
                try:
                    parsed = json.loads(text)
                except Exception:
                    parsed = None
                if isinstance(parsed, dict) and parsed.get('choices'):
                    chunk = json.dumps(parsed, ensure_ascii=False)
                else:
                    chunk = json.dumps({'error': 'invalid_response', 'message': text[:2000]})
                yield ('data: ' + chunk.replace('\n', ' ') + '\n\n').encode('utf-8')
                return
            while True:
                chunk = resp.read1(4096) if hasattr(resp, 'read1') else resp.read(4096)
                if not chunk:
                    break
                yield chunk
        except GeneratorExit:
            raise
        except Exception as exc:
            chunk = json.dumps({'error': 'stream_interrupted', 'message': str(exc)})
            yield ('data: ' + chunk + '\n\n').encode('utf-8')
        finally:
            try:
                resp.close()
            except Exception:
                pass

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


# ==========================================
# Static frontend
# ==========================================

BLOCKED_TOP = {'server', 'data', '__pycache__'}
BLOCKED_PREFIXES = ('hdcompiler_vn(banrwweb)', 'vendor/hdcompiler')
BLOCKED_SUFFIXES = ('.py', '.pyc', '.pyo')


def _is_blocked_path(path):
    normalized = posixpath.normpath('/' + path.replace('\\', '/')).lstrip('/')
    if not normalized or normalized.startswith('..'):
        return True
    if normalized.endswith(BLOCKED_SUFFIXES) or '/.' in '/' + normalized:
        return True
    for prefix in BLOCKED_PREFIXES:
        if normalized == prefix or normalized.startswith(prefix + '/'):
            return True
    return False


@app.get('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.get('/<path:path>')
def static_files(path):
    first = path.split('/')[0]
    if first in BLOCKED_TOP or _is_blocked_path(path):
        return 'Not found', 404
    full = os.path.join(BASE_DIR, path)
    if not os.path.isfile(full):
        return 'Not found', 404
    return send_from_directory(BASE_DIR, path)


if __name__ == '__main__':
    print('CodeAI server running at http://localhost:{}'.format(PORT))
    app.run(host='0.0.0.0', port=PORT, threaded=True)
