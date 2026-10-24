#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import hashlib
import io
import os
import re
import secrets
import sqlite3
import time
import uuid
import zipfile
from contextlib import closing

from flask import Blueprint, jsonify, request, send_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'projects.db')

MAX_PROJECTS = 10
MAX_FILE_BYTES = 1024 * 1024
MAX_PROJECT_BYTES = 15 * 1024 * 1024
MAX_FILES_PER_REQUEST = 20
MAX_SHARES = 20
LANG_RE = re.compile(r'^[A-Za-z0-9_+.\-]{1,40}$')

bp = Blueprint('projects_api', __name__, url_prefix='/api')

_get_current_user = None
_get_user_by_id = None
_hub = None


class ApiError(Exception):
    def __init__(self, status, code, message, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


@bp.errorhandler(ApiError)
def _handle_api_error(err):
    payload = {'error': err.code, 'message': err.message}
    payload.update(err.extra)
    return jsonify(payload), err.status


@bp.errorhandler(413)
def _handle_413(err):
    return jsonify({
        'error': 'payload_too_large',
        'message': 'Tệp tải lên quá lớn.'
    }), 413


def _now():
    return int(time.time() * 1000)


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=5, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA busy_timeout = 5000')
    return conn


def _init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with closing(_connect()) as conn:
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('PRAGMA synchronous = NORMAL')
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                visibility TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private', 'public')),
                archived_at INTEGER NULL,
                version INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
                ON projects(owner_id, archived_at, updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_projects_public_updated
                ON projects(visibility, archived_at, updated_at DESC);

            CREATE TABLE IF NOT EXISTS project_files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                label TEXT NOT NULL COLLATE NOCASE,
                language TEXT NOT NULL DEFAULT 'plaintext',
                content TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'snippet'
                    CHECK (source IN ('snippet', 'upload')),
                size_bytes INTEGER NOT NULL,
                checksum TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                UNIQUE (project_id, label)
            );

            CREATE INDEX IF NOT EXISTS idx_project_files_project
                ON project_files(project_id, sort_order, created_at);

            CREATE TABLE IF NOT EXISTS project_shares (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_by TEXT NOT NULL,
                expires_at INTEGER NULL,
                revoked_at INTEGER NULL,
                last_used_at INTEGER NULL,
                access_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_project_shares_project
                ON project_shares(project_id, revoked_at, expires_at);

            CREATE TRIGGER IF NOT EXISTS trg_projects_owner_limit
            BEFORE INSERT ON projects
            WHEN (
                SELECT COUNT(*) FROM projects
                WHERE owner_id = NEW.owner_id
            ) >= 10
            BEGIN
                SELECT RAISE(ABORT, 'project_limit_reached');
            END;
        ''')


def init_projects(app, get_current_user, get_user_by_id, hub):
    global _get_current_user, _get_user_by_id, _hub
    _get_current_user = get_current_user
    _get_user_by_id = get_user_by_id
    _hub = hub
    _init_db()
    if 'projects_api' not in app.blueprints:
        app.register_blueprint(bp)


def _require_user():
    user = _get_current_user() if _get_current_user else None
    if not user:
        raise ApiError(401, 'unauthorized', 'Bạn cần đăng nhập.')
    return user


def _owner_name(owner_id):
    if not _get_user_by_id:
        return owner_id
    user = _get_user_by_id(owner_id)
    if not user:
        return owner_id
    return user.get('displayName') or user.get('username') or owner_id


def _clean_name(value):
    name = str(value or '').strip()
    if not name:
        raise ApiError(400, 'validation_error', 'Tên dự án không được để trống.', field='name')
    if len(name) > 120:
        raise ApiError(400, 'validation_error', 'Tên dự án tối đa 120 ký tự.', field='name')
    return name


def _clean_description(value):
    desc = str(value or '').strip()
    if len(desc) > 5000:
        raise ApiError(400, 'validation_error', 'Mô tả tối đa 5.000 ký tự.', field='description')
    return desc


def _clean_visibility(value, fallback='private'):
    value = str(value or fallback).strip().lower()
    if value not in ('private', 'public'):
        raise ApiError(400, 'validation_error', 'Trạng thái hiển thị không hợp lệ.', field='visibility')
    return value


def _clean_label(value):
    raw = str(value or '').replace('\\', '/').rsplit('/', 1)[-1]
    raw = ''.join(ch for ch in raw if ord(ch) >= 32 and ord(ch) != 127).strip()
    if not raw:
        raw = 'untitled'
    return raw[:255]


def _clean_language(value):
    value = str(value or '').strip().lower()
    if not value or not LANG_RE.match(value):
        return 'plaintext'
    return value


def _language_for(label):
    name = label.lower()
    exact = {
        'dockerfile': 'dockerfile',
        'makefile': 'makefile'
    }
    if name in exact:
        return exact[name]
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    return {
        'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
        'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
        'css': 'css', 'scss': 'scss', 'less': 'less',
        'html': 'html', 'htm': 'html', 'xml': 'xml', 'svg': 'xml',
        'json': 'json', 'py': 'python', 'java': 'java',
        'c': 'c', 'h': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp',
        'hpp': 'cpp', 'cs': 'csharp', 'go': 'go', 'rs': 'rust',
        'php': 'php', 'rb': 'ruby', 'sh': 'bash', 'bash': 'bash',
        'sql': 'sql', 'md': 'markdown', 'markdown': 'markdown',
        'yml': 'yaml', 'yaml': 'yaml', 'toml': 'ini', 'ini': 'ini',
        'kt': 'kotlin', 'swift': 'swift', 'dart': 'dart', 'r': 'r',
        'lua': 'lua', 'pl': 'perl', 'vue': 'xml', 'svelte': 'xml'
    }.get(ext, 'plaintext')


def _payload_project(row, user=None, owner_name=None):
    owner = bool(user and row['owner_id'] == user.get('id'))
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'visibility': row['visibility'],
        'archived': row['archived_at'] is not None,
        'state': 'archived' if row['archived_at'] is not None else row['visibility'],
        'version': row['version'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        'fileCount': row['file_count'] if 'file_count' in row.keys() else 0,
        'totalBytes': row['total_bytes'] if 'total_bytes' in row.keys() else 0,
        'ownerName': owner_name or _owner_name(row['owner_id']),
        'canEdit': owner,
        'canDelete': owner
    }


def _payload_file(row, include_content=False):
    data = {
        'id': row['id'],
        'label': row['label'],
        'language': row['language'],
        'source': row['source'],
        'sizeBytes': row['size_bytes'],
        'version': row['version'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at']
    }
    if include_content:
        data['content'] = row['content']
    return data


def _project_select():
    return '''
        SELECT p.*,
            (SELECT COUNT(*) FROM project_files f WHERE f.project_id = p.id) AS file_count,
            (SELECT COALESCE(SUM(f.size_bytes), 0) FROM project_files f WHERE f.project_id = p.id) AS total_bytes
        FROM projects p
    '''


def _fetch_project(conn, project_id):
    return conn.execute(_project_select() + ' WHERE p.id = ?', (project_id,)).fetchone()


def _project_or_404(conn, project_id):
    row = _fetch_project(conn, project_id)
    if not row:
        raise ApiError(404, 'project_not_found', 'Không tìm thấy dự án.')
    return row


def _require_owner(row, user):
    if row['owner_id'] != user.get('id'):
        raise ApiError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này.')


def _can_view(row, user):
    if row['owner_id'] == user.get('id'):
        return True
    return row['visibility'] == 'public' and row['archived_at'] is None


def _require_view(row, user):
    if not _can_view(row, user):
        raise ApiError(404, 'project_not_found', 'Không tìm thấy dự án.')


def _file_or_404(conn, project_id, file_id):
    row = conn.execute(
        'SELECT * FROM project_files WHERE id = ? AND project_id = ?',
        (file_id, project_id)
    ).fetchone()
    if not row:
        raise ApiError(404, 'file_not_found', 'Không tìm thấy file.')
    return row


def _event(project_id, event_type, version=None, file_id=None, **extra):
    data = {
        'type': event_type,
        'projectId': project_id,
        'eventId': uuid.uuid4().hex,
        'at': _now()
    }
    if version is not None:
        data['version'] = version
    if file_id:
        data['fileId'] = file_id
    data.update(extra)
    return data


def _broadcast(owner_id, project_id, event_type, version=None, file_id=None, **extra):
    if not _hub:
        return
    event = _event(project_id, event_type, version, file_id, **extra)
    _hub.broadcast('user:' + owner_id, event)
    _hub.broadcast('project:' + project_id, event)


def _update_project_version(conn, project_id, now):
    conn.execute(
        'UPDATE projects SET version = version + 1, updated_at = ? WHERE id = ?',
        (now, project_id)
    )


def _labels_in_use(conn, project_id, exclude_id=None):
    if exclude_id:
        rows = conn.execute(
            'SELECT label FROM project_files WHERE project_id = ? AND id != ?',
            (project_id, exclude_id)
        ).fetchall()
    else:
        rows = conn.execute(
            'SELECT label FROM project_files WHERE project_id = ?',
            (project_id,)
        ).fetchall()
    return {row['label'].casefold() for row in rows}


def _unique_label(label, used):
    if label.casefold() not in used:
        used.add(label.casefold())
        return label
    if '.' in label:
        base, ext = label.rsplit('.', 1)
        ext = '.' + ext
    else:
        base, ext = label, ''
    i = 2
    while True:
        candidate = '{} ({}){}'.format(base, i, ext)
        if candidate.casefold() not in used:
            used.add(candidate.casefold())
            return candidate
        i += 1


def _decode_upload(file_storage, label):
    raw = file_storage.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise ApiError(413, 'file_too_large', 'Mỗi file tối đa 1 MB.', label=label)
    if b'\x00' in raw:
        raise ApiError(415, 'unsupported_file', 'Chỉ hỗ trợ file văn bản UTF-8.', label=label)
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise ApiError(415, 'unsupported_file', 'File phải là UTF-8.', label=label)
    return content


def _insert_files(conn, project, items):
    used = _labels_in_use(conn, project['id'])
    total = conn.execute(
        'SELECT COALESCE(SUM(size_bytes), 0) AS n FROM project_files WHERE project_id = ?',
        (project['id'],)
    ).fetchone()['n']
    next_order = conn.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM project_files WHERE project_id = ?',
        (project['id'],)
    ).fetchone()['n']
    now = _now()
    inserted = []

    for item in items:
        label = _unique_label(_clean_label(item.get('label')), used)
        content = item.get('content')
        if not isinstance(content, str):
            raise ApiError(400, 'validation_error', 'Nội dung file không hợp lệ.', label=label)
        if '\x00' in content:
            raise ApiError(415, 'unsupported_file', 'Nội dung chứa ký tự không hợp lệ.', label=label)
        size = len(content.encode('utf-8'))
        if size > MAX_FILE_BYTES:
            raise ApiError(413, 'file_too_large', 'Mỗi file tối đa 1 MB.', label=label)
        total += size
        if total > MAX_PROJECT_BYTES:
            raise ApiError(413, 'project_too_large', 'Tổng dung lượng dự án tối đa 15 MB.')

        language = _clean_language(item.get('language')) if item.get('language') else _language_for(label)
        file_id = 'f_' + uuid.uuid4().hex
        conn.execute(
            '''INSERT INTO project_files
               (id, project_id, label, language, content, source, size_bytes, checksum,
                sort_order, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)''',
            (
                file_id, project['id'], label, language, content,
                item.get('source', 'snippet'), size,
                hashlib.sha256(content.encode('utf-8')).hexdigest(),
                next_order, now, now
            )
        )
        next_order += 1
        inserted.append(file_id)

    _update_project_version(conn, project['id'], now)
    rows = [
        conn.execute('SELECT * FROM project_files WHERE id = ?', (file_id,)).fetchone()
        for file_id in inserted
    ]
    return rows


def _safe_filename(name, fallback='download'):
    name = ''.join(ch for ch in str(name or '') if ch not in '<>:"/\\|?*' and ord(ch) >= 32)
    name = name.strip().strip('.')
    return name[:120] or fallback


def _zip_bytes(project, files):
    used = set()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for row in files:
            name = _safe_filename(_clean_label(row['label']), 'file.txt')
            if name.casefold() in used:
                name = _unique_label(name, used)
            else:
                used.add(name.casefold())
            zf.writestr(name, row['content'])
    buf.seek(0)
    return buf


def _download_file(row):
    resp = send_file(
        io.BytesIO(row['content'].encode('utf-8')),
        mimetype='text/plain',
        as_attachment=True,
        download_name=_safe_filename(row['label'], 'file.txt'),
        max_age=0
    )
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Cache-Control'] = 'no-store'
    return resp


def _download_zip(project, files):
    buf = _zip_bytes(project, files)
    resp = send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=_safe_filename(project['name'], 'project') + '.zip',
        max_age=0
    )
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Cache-Control'] = 'no-store'
    return resp


def _share_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _resolve_share(token, touch=False):
    if not token:
        raise ApiError(404, 'share_invalid', 'Link chia sẻ không hợp lệ.')
    h = _share_hash(token)
    with closing(_connect()) as conn:
        row = conn.execute(
            '''SELECT s.id AS share_id, s.project_id, s.expires_at, s.revoked_at,
                      s.created_at AS share_created_at, s.last_used_at, s.access_count,
                      p.*,
                      (SELECT COUNT(*) FROM project_files f WHERE f.project_id = p.id) AS file_count,
                      (SELECT COALESCE(SUM(f.size_bytes), 0) FROM project_files f WHERE f.project_id = p.id) AS total_bytes
               FROM project_shares s
               JOIN projects p ON p.id = s.project_id
               WHERE s.token_hash = ?''',
            (h,)
        ).fetchone()
        if not row:
            raise ApiError(404, 'share_invalid', 'Link chia sẻ không hợp lệ.')
        now = _now()
        if row['revoked_at'] is not None or (row['expires_at'] is not None and row['expires_at'] <= now):
            raise ApiError(410, 'share_expired', 'Link chia sẻ đã hết hiệu lực.')
        if row['archived_at'] is not None:
            raise ApiError(410, 'share_expired', 'Dự án đã được lưu trữ.')
        if touch:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute(
                '''UPDATE project_shares
                   SET last_used_at = ?, access_count = access_count + 1
                   WHERE id = ?''',
                (now, row['share_id'])
            )
            conn.execute('COMMIT')
        return row


def _share_payload(row):
    return {
        'id': row['share_id'],
        'createdAt': row['share_created_at'],
        'expiresAt': row['expires_at'],
        'revokedAt': row['revoked_at'],
        'lastUsedAt': row['last_used_at'],
        'accessCount': row['access_count']
    }


def resolve_share_for_ws(token):
    try:
        row = _resolve_share(token)
        return {'projectId': row['id'], 'ownerId': row['owner_id']}
    except ApiError:
        return None


def can_view_project(project_id, user_id):
    with closing(_connect()) as conn:
        row = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,)).fetchone()
    if not row:
        return False
    return row['owner_id'] == user_id or (row['visibility'] == 'public' and row['archived_at'] is None)


@bp.get('/projects')
def list_projects():
    user = _require_user()
    q = str(request.args.get('q', '')).strip()[:120]
    state = str(request.args.get('state', 'active')).lower()
    scope = str(request.args.get('scope', 'mine')).lower()
    sort = str(request.args.get('sort', 'updated')).lower()
    try:
        page = max(1, int(request.args.get('page', '1')))
        limit = min(100, max(1, int(request.args.get('limit', '24'))))
    except ValueError:
        raise ApiError(400, 'validation_error', 'Tham số phân trang không hợp lệ.')

    where = []
    params = []
    if scope == 'public':
        where.append("p.archived_at IS NULL AND p.visibility = 'public'")
    else:
        where.append('p.owner_id = ?')
        params.append(user['id'])
        if state == 'active':
            where.append('p.archived_at IS NULL')
        elif state == 'archived':
            where.append('p.archived_at IS NOT NULL')
        elif state == 'public':
            where.append("p.archived_at IS NULL AND p.visibility = 'public'")
        elif state == 'private':
            where.append("p.archived_at IS NULL AND p.visibility = 'private'")
        elif state != 'all':
            raise ApiError(400, 'validation_error', 'Bộ lọc trạng thái không hợp lệ.')

    if q:
        where.append('p.name LIKE ? COLLATE NOCASE')
        params.append('%' + q + '%')

    clause = ' WHERE ' + ' AND '.join(where)
    order = {
        'updated': 'p.updated_at DESC',
        'created': 'p.created_at DESC',
        'name': 'p.name COLLATE NOCASE ASC'
    }.get(sort, 'p.updated_at DESC')

    with closing(_connect()) as conn:
        total = conn.execute('SELECT COUNT(*) AS n FROM projects p' + clause, params).fetchone()['n']
        rows = conn.execute(
            _project_select() + clause + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?',
            params + [limit, (page - 1) * limit]
        ).fetchall()
        used = conn.execute(
            'SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?',
            (user['id'],)
        ).fetchone()['n']

    return jsonify({
        'projects': [_payload_project(row, user) for row in rows],
        'total': total,
        'page': page,
        'limit': limit,
        'quota': {
            'max': MAX_PROJECTS,
            'used': used,
            'remaining': max(0, MAX_PROJECTS - used)
        }
    })


@bp.post('/projects')
def create_project():
    user = _require_user()
    data = request.get_json(silent=True) or {}
    name = _clean_name(data.get('name'))
    description = _clean_description(data.get('description'))
    visibility = _clean_visibility(data.get('visibility'))
    now = _now()
    project_id = 'p_' + uuid.uuid4().hex

    with closing(_connect()) as conn:
        try:
            conn.execute('BEGIN IMMEDIATE')
            used = conn.execute(
                'SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?',
                (user['id'],)
            ).fetchone()['n']
            if used >= MAX_PROJECTS:
                raise ApiError(
                    409, 'project_limit_reached',
                    'Bạn đã đạt giới hạn 10 dự án. Xóa bớt dự án để tạo mới.',
                    limit=MAX_PROJECTS, used=used
                )
            conn.execute(
                '''INSERT INTO projects
                   (id, owner_id, name, description, visibility, archived_at,
                    version, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)''',
                (project_id, user['id'], name, description, visibility, now, now)
            )
            conn.execute('COMMIT')
        except sqlite3.IntegrityError as err:
            conn.execute('ROLLBACK')
            if 'project_limit_reached' in str(err):
                raise ApiError(
                    409, 'project_limit_reached',
                    'Bạn đã đạt giới hạn 10 dự án. Xóa bớt dự án để tạo mới.',
                    limit=MAX_PROJECTS, used=MAX_PROJECTS
                )
            raise
        except Exception:
            conn.execute('ROLLBACK')
            raise
        row = _fetch_project(conn, project_id)

    _broadcast(user['id'], project_id, 'project.created', row['version'])
    return jsonify({'project': _payload_project(row, user)}), 201


@bp.get('/projects/<project_id>')
def get_project(project_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_view(project, user)
        files = conn.execute(
            '''SELECT * FROM project_files
               WHERE project_id = ? ORDER BY sort_order, created_at''',
            (project_id,)
        ).fetchall()
    return jsonify({
        'project': _payload_project(project, user),
        'files': [_payload_file(row) for row in files]
    })


@bp.patch('/projects/<project_id>')
def update_project(project_id):
    user = _require_user()
    data = request.get_json(silent=True) or {}
    fields = []
    params = []

    if 'name' in data:
        fields.append('name = ?')
        params.append(_clean_name(data.get('name')))
    if 'description' in data:
        fields.append('description = ?')
        params.append(_clean_description(data.get('description')))
    if 'visibility' in data:
        fields.append('visibility = ?')
        params.append(_clean_visibility(data.get('visibility')))
    if not fields:
        raise ApiError(400, 'validation_error', 'Không có dữ liệu cần cập nhật.')

    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        if data.get('version') is not None and int(data.get('version')) != project['version']:
            conn.execute('ROLLBACK')
            raise ApiError(
                409, 'version_conflict',
                'Dự án đã được cập nhật ở nơi khác.',
                current=_payload_project(project, user)
            )
        now = _now()
        params.extend([now, project_id])
        conn.execute(
            'UPDATE projects SET ' + ', '.join(fields) +
            ', version = version + 1, updated_at = ? WHERE id = ?',
            params
        )
        conn.execute('COMMIT')
        row = _fetch_project(conn, project_id)

    _broadcast(user['id'], project_id, 'project.updated', row['version'])
    return jsonify({'project': _payload_project(row, user)})


@bp.delete('/projects/<project_id>')
def delete_project(project_id):
    user = _require_user()
    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        conn.execute('DELETE FROM projects WHERE id = ?', (project_id,))
        conn.execute('COMMIT')
    _broadcast(user['id'], project_id, 'project.deleted')
    return jsonify({'ok': True})


def _set_archive(project_id, archived):
    user = _require_user()
    data = request.get_json(silent=True) or {}
    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        if data.get('version') is not None and int(data.get('version')) != project['version']:
            conn.execute('ROLLBACK')
            raise ApiError(409, 'version_conflict', 'Dự án đã được cập nhật ở nơi khác.')
        now = _now()
        conn.execute(
            '''UPDATE projects
               SET archived_at = ?, version = version + 1, updated_at = ?
               WHERE id = ?''',
            (now if archived else None, now, project_id)
        )
        conn.execute('COMMIT')
        row = _fetch_project(conn, project_id)
    _broadcast(
        user['id'], project_id,
        'project.archived' if archived else 'project.unarchived',
        row['version']
    )
    return jsonify({'project': _payload_project(row, user)})


@bp.post('/projects/<project_id>/archive')
def archive_project(project_id):
    return _set_archive(project_id, True)


@bp.post('/projects/<project_id>/unarchive')
def unarchive_project(project_id):
    return _set_archive(project_id, False)


@bp.get('/projects/<project_id>/files')
def list_files(project_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_view(project, user)
        files = conn.execute(
            'SELECT * FROM project_files WHERE project_id = ? ORDER BY sort_order, created_at',
            (project_id,)
        ).fetchall()
    return jsonify({'files': [_payload_file(row) for row in files]})


@bp.get('/projects/<project_id>/files/<file_id>')
def get_file(project_id, file_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_view(project, user)
        row = _file_or_404(conn, project_id, file_id)
    return jsonify({'file': _payload_file(row, include_content=True)})


@bp.post('/projects/<project_id>/files')
def upload_files(project_id):
    user = _require_user()
    uploads = request.files.getlist('files')
    if not uploads and request.files.get('file'):
        uploads = [request.files.get('file')]
    if not uploads:
        raise ApiError(400, 'validation_error', 'Chưa chọn file để tải lên.')
    if len(uploads) > MAX_FILES_PER_REQUEST:
        raise ApiError(400, 'validation_error', 'Tối đa 20 file mỗi lần tải lên.')

    items = []
    for item in uploads:
        label = _clean_label(item.filename)
        items.append({
            'label': label,
            'content': _decode_upload(item, label),
            'source': 'upload',
            'language': _language_for(label)
        })

    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        rows = _insert_files(conn, project, items)
        conn.execute('COMMIT')
        current = _fetch_project(conn, project_id)

    for row in rows:
        _broadcast(user['id'], project_id, 'file.created', current['version'], row['id'])
    return jsonify({
        'files': [_payload_file(row) for row in rows],
        'project': _payload_project(current, user)
    }), 201


@bp.post('/projects/<project_id>/snippets')
def create_snippets(project_id):
    user = _require_user()
    data = request.get_json(silent=True) or {}
    snippets = data.get('snippets')
    if not isinstance(snippets, list) or not snippets:
        raise ApiError(400, 'validation_error', 'Chưa có snippet để lưu.')
    if len(snippets) > MAX_FILES_PER_REQUEST:
        raise ApiError(400, 'validation_error', 'Tối đa 20 snippet mỗi lần lưu.')

    items = []
    for snippet in snippets:
        if not isinstance(snippet, dict):
            raise ApiError(400, 'validation_error', 'Snippet không hợp lệ.')
        label = _clean_label(snippet.get('label'))
        content = snippet.get('content')
        if not isinstance(content, str) or not content.strip():
            raise ApiError(400, 'validation_error', 'Nội dung snippet không được để trống.', label=label)
        items.append({
            'label': label,
            'content': content,
            'source': 'snippet',
            'language': _clean_language(snippet.get('language')) if snippet.get('language') else _language_for(label)
        })

    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        rows = _insert_files(conn, project, items)
        conn.execute('COMMIT')
        current = _fetch_project(conn, project_id)

    for row in rows:
        _broadcast(user['id'], project_id, 'file.created', current['version'], row['id'])
    return jsonify({
        'files': [_payload_file(row) for row in rows],
        'project': _payload_project(current, user)
    }), 201


@bp.patch('/projects/<project_id>/files/<file_id>')
def update_file(project_id, file_id):
    user = _require_user()
    data = request.get_json(silent=True) or {}
    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        row = _file_or_404(conn, project_id, file_id)
        if data.get('version') is not None and int(data.get('version')) != row['version']:
            conn.execute('ROLLBACK')
            raise ApiError(
                409, 'version_conflict',
                'File đã được cập nhật ở nơi khác.',
                current=_payload_file(row, include_content=True)
            )

        fields = []
        params = []
        if 'label' in data:
            label = _clean_label(data.get('label'))
            used = _labels_in_use(conn, project_id, file_id)
            if label.casefold() in used:
                conn.execute('ROLLBACK')
                raise ApiError(409, 'label_conflict', 'Nhãn file đã tồn tại trong dự án.', label=label)
            fields.append('label = ?')
            params.append(label)
        if 'content' in data:
            content = data.get('content')
            if not isinstance(content, str):
                conn.execute('ROLLBACK')
                raise ApiError(400, 'validation_error', 'Nội dung file không hợp lệ.')
            size = len(content.encode('utf-8'))
            if size > MAX_FILE_BYTES:
                conn.execute('ROLLBACK')
                raise ApiError(413, 'file_too_large', 'Mỗi file tối đa 1 MB.')
            total = conn.execute(
                '''SELECT COALESCE(SUM(size_bytes), 0) AS n
                   FROM project_files WHERE project_id = ? AND id != ?''',
                (project_id, file_id)
            ).fetchone()['n']
            if total + size > MAX_PROJECT_BYTES:
                conn.execute('ROLLBACK')
                raise ApiError(413, 'project_too_large', 'Tổng dung lượng dự án tối đa 15 MB.')
            fields.extend(['content = ?', 'size_bytes = ?', 'checksum = ?'])
            params.extend([content, size, hashlib.sha256(content.encode('utf-8')).hexdigest()])
        if 'language' in data:
            fields.append('language = ?')
            params.append(_clean_language(data.get('language')))
        if not fields:
            conn.execute('ROLLBACK')
            raise ApiError(400, 'validation_error', 'Không có dữ liệu cần cập nhật.')

        now = _now()
        params.extend([now, file_id])
        conn.execute(
            'UPDATE project_files SET ' + ', '.join(fields) +
            ', version = version + 1, updated_at = ? WHERE id = ?',
            params
        )
        _update_project_version(conn, project_id, now)
        conn.execute('COMMIT')
        updated = _file_or_404(conn, project_id, file_id)
        current = _fetch_project(conn, project_id)

    _broadcast(user['id'], project_id, 'file.updated', current['version'], file_id)
    return jsonify({
        'file': _payload_file(updated, include_content=True),
        'project': _payload_project(current, user)
    })


@bp.delete('/projects/<project_id>/files/<file_id>')
def delete_file(project_id, file_id):
    user = _require_user()
    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        _file_or_404(conn, project_id, file_id)
        conn.execute('DELETE FROM project_files WHERE id = ?', (file_id,))
        _update_project_version(conn, project_id, _now())
        conn.execute('COMMIT')
        current = _fetch_project(conn, project_id)
    _broadcast(user['id'], project_id, 'file.deleted', current['version'], file_id)
    return jsonify({'ok': True, 'project': _payload_project(current, user)})


@bp.get('/projects/<project_id>/files/<file_id>/raw')
def download_raw(project_id, file_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_view(project, user)
        row = _file_or_404(conn, project_id, file_id)
    return _download_file(row)


@bp.get('/projects/<project_id>/download.zip')
def download_project_zip(project_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_view(project, user)
        files = conn.execute(
            'SELECT * FROM project_files WHERE project_id = ? ORDER BY sort_order, created_at',
            (project_id,)
        ).fetchall()
    return _download_zip(project, files)


@bp.post('/projects/<project_id>/shares')
def create_share(project_id):
    user = _require_user()
    data = request.get_json(silent=True) or {}
    days = data.get('expiresInDays')
    if days in (None, '', 0, '0'):
        expires_at = None
    else:
        try:
            days = int(days)
        except (TypeError, ValueError):
            raise ApiError(400, 'validation_error', 'Thời hạn link không hợp lệ.')
        if days < 1 or days > 3650:
            raise ApiError(400, 'validation_error', 'Thời hạn link từ 1 đến 3650 ngày.')
        expires_at = _now() + days * 24 * 3600 * 1000

    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        if project['archived_at'] is not None:
            conn.execute('ROLLBACK')
            raise ApiError(409, 'project_archived', 'Dự án đang được lưu trữ, hãy bỏ lưu trữ trước khi chia sẻ.')
        active = conn.execute(
            '''SELECT COUNT(*) AS n FROM project_shares
               WHERE project_id = ? AND revoked_at IS NULL
                 AND (expires_at IS NULL OR expires_at > ?)''',
            (project_id, _now())
        ).fetchone()['n']
        if active >= MAX_SHARES:
            conn.execute('ROLLBACK')
            raise ApiError(409, 'share_limit_reached', 'Dự án đã có quá nhiều link chia sẻ.')
        raw_token = secrets.token_urlsafe(32)
        share_id = 's_' + uuid.uuid4().hex
        now = _now()
        conn.execute(
            '''INSERT INTO project_shares
               (id, project_id, token_hash, created_by, expires_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (share_id, project_id, _share_hash(raw_token), user['id'], expires_at, now)
        )
        conn.execute('COMMIT')
        row = conn.execute(
            '''SELECT id AS share_id, project_id, expires_at, revoked_at,
                      created_at AS share_created_at, last_used_at, access_count
               FROM project_shares WHERE id = ?''',
            (share_id,)
        ).fetchone()

    base = os.environ.get('PUBLIC_BASE_URL', '').strip() or request.host_url.rstrip('/')
    url = base.rstrip('/') + '/share.html#t=' + raw_token
    _broadcast(user['id'], project_id, 'share.created', project['version'])
    return jsonify({
        'share': _share_payload(row),
        'url': url,
        'token': raw_token
    }), 201


@bp.get('/projects/<project_id>/shares')
def list_shares(project_id):
    user = _require_user()
    with closing(_connect()) as conn:
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        rows = conn.execute(
            '''SELECT id AS share_id, project_id, expires_at, revoked_at,
                      created_at AS share_created_at, last_used_at, access_count
               FROM project_shares
               WHERE project_id = ?
               ORDER BY created_at DESC''',
            (project_id,)
        ).fetchall()
    now = _now()
    shares = []
    for row in rows:
        item = _share_payload(row)
        item['active'] = (
            row['revoked_at'] is None and
            (row['expires_at'] is None or row['expires_at'] > now)
        )
        shares.append(item)
    return jsonify({'shares': shares})


@bp.delete('/projects/<project_id>/shares/<share_id>')
def revoke_share(project_id, share_id):
    user = _require_user()
    now = _now()
    with closing(_connect()) as conn:
        conn.execute('BEGIN IMMEDIATE')
        project = _project_or_404(conn, project_id)
        _require_owner(project, user)
        row = conn.execute(
            'SELECT * FROM project_shares WHERE id = ? AND project_id = ?',
            (share_id, project_id)
        ).fetchone()
        if not row:
            conn.execute('ROLLBACK')
            raise ApiError(404, 'share_not_found', 'Không tìm thấy link chia sẻ.')
        conn.execute(
            'UPDATE project_shares SET revoked_at = ? WHERE id = ?',
            (now, share_id)
        )
        conn.execute('COMMIT')
    _broadcast(user['id'], project_id, 'share.revoked', project['version'], shareId=share_id)
    return jsonify({'ok': True})


def _share_from_request(touch=False):
    token = request.headers.get('X-Share-Token', '').strip()
    return _resolve_share(token, touch=touch)


@bp.get('/share')
def get_shared_project():
    row = _share_from_request(touch=True)
    with closing(_connect()) as conn:
        files = conn.execute(
            'SELECT * FROM project_files WHERE project_id = ? ORDER BY sort_order, created_at',
            (row['id'],)
        ).fetchall()
    project = _payload_project(row, None)
    return jsonify({
        'project': project,
        'files': [_payload_file(item) for item in files],
        'share': _share_payload(row),
        'readonly': True
    })


@bp.get('/share/files/<file_id>')
def get_shared_file(file_id):
    row = _share_from_request()
    with closing(_connect()) as conn:
        file_row = _file_or_404(conn, row['id'], file_id)
    return jsonify({'file': _payload_file(file_row, include_content=True)})


@bp.get('/share/files/<file_id>/raw')
def download_shared_raw(file_id):
    row = _share_from_request()
    with closing(_connect()) as conn:
        file_row = _file_or_404(conn, row['id'], file_id)
    return _download_file(file_row)


@bp.get('/share/download.zip')
def download_shared_zip():
    row = _share_from_request()
    with closing(_connect()) as conn:
        files = conn.execute(
            'SELECT * FROM project_files WHERE project_id = ? ORDER BY sort_order, created_at',
            (row['id'],)
        ).fetchall()
    return _download_zip(row, files)
