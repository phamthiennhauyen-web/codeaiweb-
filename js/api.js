// ==========================================
// API client
// ==========================================

const API_BASE = '/api';
const TOKEN_KEY = 'codeai_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(method, path, body, extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    const isForm = body instanceof FormData;
    if (!isForm) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let res;
    try {
        res = await fetch(API_BASE + path, {
            method,
            headers,
            body: body !== undefined ? (isForm ? body : JSON.stringify(body)) : undefined
        });
    } catch (e) {
        const err = new Error('network');
        err.code = 'network';
        throw err;
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
        const err = new Error((data && data.message) || (data && data.error) || 'request_failed');
        err.code = (data && data.error) || 'request_failed';
        err.status = res.status;
        err.data = data;
        throw err;
    }

    return data;
}

const api = {
    get: (path, headers) => apiRequest('GET', path, undefined, headers),
    post: (path, body, headers) => apiRequest('POST', path, body, headers),
    put: (path, body, headers) => apiRequest('PUT', path, body, headers),
    patch: (path, body, headers) => apiRequest('PATCH', path, body, headers),
    del: (path, body, headers) => apiRequest('DELETE', path, body, headers),
    upload: (path, formData) => apiRequest('POST', path, formData)
};

// ---------- Endpoints ----------
const ApiAuth = {
    sendCode: (email, purpose) => api.post('/otp/send', { email, purpose }),
    verifyCode: (email, code, purpose) => api.post('/otp/verify', { email, code, purpose }),
    register: (payload) => api.post('/auth/register', payload),
    login: (username, password) => api.post('/auth/login', { username, password }),
    logout: () => api.post('/auth/logout', {}),
    me: () => api.get('/auth/me')
};

const ApiAccount = {
    updateProfile: (patch) => api.put('/account/profile', patch),
    changeEmail: (newEmail, verificationToken) =>
        api.post('/account/change-email', { newEmail, verificationToken }),
    changePassword: (currentPassword, newPassword) =>
        api.post('/account/change-password', { currentPassword, newPassword }),
    updateSettings: (patch) => api.put('/account/settings', patch)
};

const ApiProjects = {
    list: (params) => {
        const query = new URLSearchParams();
        Object.keys(params || {}).forEach((key) => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                query.set(key, params[key]);
            }
        });
        return api.get('/projects?' + query.toString());
    },
    create: (payload) => api.post('/projects', payload),
    get: (id) => api.get('/projects/' + encodeURIComponent(id)),
    update: (id, payload) => api.patch('/projects/' + encodeURIComponent(id), payload),
    remove: (id) => api.del('/projects/' + encodeURIComponent(id)),
    archive: (id, payload) => api.post('/projects/' + encodeURIComponent(id) + '/archive', payload || {}),
    unarchive: (id, payload) => api.post('/projects/' + encodeURIComponent(id) + '/unarchive', payload || {}),
    files: (id) => api.get('/projects/' + encodeURIComponent(id) + '/files'),
    file: (id, fileId) => api.get('/projects/' + encodeURIComponent(id) + '/files/' + encodeURIComponent(fileId)),
    uploadFiles: (id, formData) => api.upload('/projects/' + encodeURIComponent(id) + '/files', formData),
    createSnippets: (id, snippets) =>
        api.post('/projects/' + encodeURIComponent(id) + '/snippets', { snippets }),
    updateFile: (id, fileId, payload) =>
        api.patch('/projects/' + encodeURIComponent(id) + '/files/' + encodeURIComponent(fileId), payload),
    removeFile: (id, fileId) =>
        api.del('/projects/' + encodeURIComponent(id) + '/files/' + encodeURIComponent(fileId)),
    shares: (id) => api.get('/projects/' + encodeURIComponent(id) + '/shares'),
    createShare: (id, payload) =>
        api.post('/projects/' + encodeURIComponent(id) + '/shares', payload),
    revokeShare: (id, shareId) =>
        api.del('/projects/' + encodeURIComponent(id) + '/shares/' + encodeURIComponent(shareId))
};

const ApiCasio = {
    compile: (payload) => api.post('/casio/compile', payload),
    labels: (model) => api.get('/casio/labels?model=' + encodeURIComponent(model))
};

const ApiShare = {
    get: (token) => api.get('/share', { 'X-Share-Token': token }),
    file: (token, fileId) => api.get('/share/files/' + encodeURIComponent(fileId), { 'X-Share-Token': token })
};
