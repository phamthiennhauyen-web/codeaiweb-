import os
import re
import subprocess
import sys
import threading
import time

from flask import Blueprint, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COMPILER_ROOT = os.path.join(BASE_DIR, 'vendor', 'hdcompiler')
MAX_CODE_BYTES = 64 * 1024
MAX_OUTPUT_CHARS = 512 * 1024
COMPILE_TIMEOUT = 30

MODELS = {
    '580': {
        'dir': '580vnx',
        'name': 'fx-580VN X',
    },
    '880': {
        'dir': '880btg',
        'name': 'fx-880BTG',
    },
}
FORMATS = {'hex', 'key'}

ANSI_RE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
LABEL_RE = re.compile(r'^(?P<address>[0-9A-Fa-f]{5}|d_[0-9A-Fa-f]+)[ \t]+(?P<label>\S+)')

bp = Blueprint('casio_api', __name__, url_prefix='/api/casio')
_get_current_user = None
_label_cache = {}
_label_cache_lock = threading.Lock()


class CasioError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@bp.errorhandler(CasioError)
def handle_casio_error(err):
    return jsonify({'error': err.code, 'message': err.message}), err.status


def init_casio(app, get_current_user):
    global _get_current_user
    _get_current_user = get_current_user
    if 'casio_api' not in app.blueprints:
        app.register_blueprint(bp)


def require_user():
    user = _get_current_user() if _get_current_user else None
    if not user:
        raise CasioError(401, 'unauthorized', 'Bạn cần đăng nhập.')
    return user


def strip_traceback(text):
    marker = 'Traceback (most recent call last):'
    if marker not in text:
        return text
    before, _, trace = text.partition(marker)
    lines = [line.strip() for line in trace.splitlines() if line.strip()]
    if not lines:
        return before.rstrip()
    return (before.rstrip() + '\n' + lines[-1]).strip() + '\n'


def clean_output(data):
    text = data.decode('utf-8', errors='replace') if isinstance(data, bytes) else str(data or '')
    text = ANSI_RE.sub('', text)
    text = text.replace(COMPILER_ROOT + os.sep, '').replace(COMPILER_ROOT, '')
    text = strip_traceback(text)
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[:MAX_OUTPUT_CHARS] + '\n...[output truncated]'
    return text


def get_model(value):
    model = str(value or '')
    if model not in MODELS:
        raise CasioError(400, 'invalid_model', 'Model máy không hợp lệ.')
    return model


def get_format(value):
    fmt = str(value or '')
    if fmt not in FORMATS:
        raise CasioError(400, 'invalid_format', 'Định dạng output không hợp lệ.')
    return fmt


@bp.post('/compile')
def compile_program():
    require_user()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise CasioError(400, 'invalid_payload', 'Dữ liệu gửi lên không hợp lệ.')
    model = get_model(payload.get('model'))
    fmt = get_format(payload.get('format'))
    code = payload.get('code')

    if not isinstance(code, str) or not code.strip():
        raise CasioError(400, 'empty_code', 'Code không được để trống.')
    if len(code.encode('utf-8')) > MAX_CODE_BYTES:
        raise CasioError(413, 'code_too_large', 'Code vượt quá giới hạn 64 KB.')

    model_dir = os.path.join(COMPILER_ROOT, MODELS[model]['dir'])
    compiler = os.path.join(model_dir, 'compiler_.py')
    if not os.path.isfile(compiler):
        raise CasioError(500, 'compiler_missing', 'Không tìm thấy compiler.')

    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'
    env['NO_COLOR'] = '1'
    env['HDCOMPILER_QUIET'] = '1'

    started = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, '-B', compiler, '-f', fmt],
            cwd=model_dir,
            input=code.encode('utf-8'),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=COMPILE_TIMEOUT,
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise CasioError(504, 'compile_timeout', 'Dịch quá thời gian cho phép (30 giây).')
    except OSError:
        raise CasioError(500, 'compiler_failed', 'Không thể chạy compiler.')
    finally:
        elapsed_ms = round((time.perf_counter() - started) * 1000)

    stdout = clean_output(proc.stdout)
    stderr = clean_output(proc.stderr)
    if not stdout and not stderr:
        stderr = 'Không có output.'

    return jsonify({
        'ok': proc.returncode == 0,
        'model': model,
        'format': fmt,
        'stdout': stdout,
        'stderr': stderr,
        'elapsedMs': elapsed_ms,
    })


def load_labels(model):
    path = os.path.join(COMPILER_ROOT, MODELS[model]['dir'], 'labels')
    try:
        mtime = os.stat(path).st_mtime_ns
    except OSError:
        raise CasioError(500, 'labels_missing', 'Không tìm thấy file label.')

    with _label_cache_lock:
        cached = _label_cache.get(model)
        if cached and cached[0] == mtime:
            return cached[1]

    rows = []
    with open(path, 'r', encoding='utf-8') as fh:
        for line in fh:
            match = LABEL_RE.match(line.strip())
            if not match:
                continue
            rows.append({
                'address': match.group('address'),
                'label': match.group('label'),
            })

    with _label_cache_lock:
        _label_cache[model] = (mtime, rows)
    return rows


@bp.get('/labels')
def get_labels():
    require_user()
    model = get_model(request.args.get('model'))
    rows = load_labels(model)
    return jsonify({
        'model': model,
        'modelName': MODELS[model]['name'],
        'count': len(rows),
        'labels': rows,
    })
