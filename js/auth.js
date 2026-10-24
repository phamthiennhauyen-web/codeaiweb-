// ==========================================
// App auth state (backed by API)
// ==========================================

let __currentUser = null;

function getCurrentUser() {
    return __currentUser;
}

function setCurrentUser(user) {
    __currentUser = user || null;
    if (user && user.language) {
        setLang(user.language);
    }
}

/**
 * Translate an API error into a localized message.
 */
function translateError(err) {
    if (!err) return t('err.request_failed');
    if (err.code === 'rate_limited' && err.data && err.data.wait) {
        return t('err.rate_limited', { wait: err.data.wait });
    }
    const key = 'err.' + (err.code || 'request_failed');
    const dict = I18N[getLang()] || I18N.vi;
    if (dict[key] !== undefined) return t(key);
    return t('err.request_failed');
}

// ---------- Auth actions ----------

async function loginUser(username, password) {
    const res = await ApiAuth.login(username, password);
    setToken(res.token);
    setCurrentUser(res.user);
    return res.user;
}

async function registerUser(payload) {
    const res = await ApiAuth.register(payload);
    setToken(res.token);
    setCurrentUser(res.user);
    return res.user;
}

async function logoutUser() {
    try { await ApiAuth.logout(); } catch (e) { /* ignore */ }
    clearToken();
    __currentUser = null;
}

async function loadCurrentUser() {
    if (!getToken()) return null;
    try {
        const res = await ApiAuth.me();
        setCurrentUser(res.user);
        return res.user;
    } catch (e) {
        clearToken();
        return null;
    }
}

async function isAuthenticated() {
    if (!getToken()) return false;
    if (__currentUser) return true;
    const user = await loadCurrentUser();
    return !!user;
}

/**
 * On a protected page: ensure a valid session, else go to index.html
 */
async function requireAuth() {
    const user = await loadCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    return user;
}
