// ==========================================
// Setup page - cấu hình gửi mail trên web
// ==========================================

const setupForm = document.getElementById('setupForm');
const setupStatus = document.getElementById('setupStatus');
const setupSaveBtn = document.getElementById('setupSaveBtn');

const providerTabs = document.getElementById('providerTabs');
const providerTabButtons = Array.from(providerTabs.querySelectorAll('.provider-tab'));

const smtpFields = document.getElementById('smtpFields');
const brevoFields = document.getElementById('brevoFields');

const setupGmail = document.getElementById('setupGmail');
const setupGmailError = document.getElementById('setupGmailError');
const setupAppPassword = document.getElementById('setupAppPassword');
const setupAppPasswordError = document.getElementById('setupAppPasswordError');

const setupBrevoKey = document.getElementById('setupBrevoKey');
const setupBrevoKeyError = document.getElementById('setupBrevoKeyError');
const setupSenderEmail = document.getElementById('setupSenderEmail');
const setupSenderEmailError = document.getElementById('setupSenderEmailError');
const setupSenderName = document.getElementById('setupSenderName');

const setupAdmin = document.getElementById('setupAdmin');
const setupAdminError = document.getElementById('setupAdminError');
const setupAdminHint = document.getElementById('setupAdminHint');

let provider = 'smtp';

applyI18n();

// ---------- Helpers ----------
function hasKey(key) {
    const dict = I18N[getLang()] || I18N.vi;
    return dict[key] !== undefined;
}

function tErr(code) {
    const key = 'err.' + code;
    return hasKey(key) ? t(key) : t('err.request_failed');
}

function clearErr(input, el) {
    const group = input.closest('.form-group');
    if (group) group.classList.remove('error', 'shake');
    el.textContent = '';
}

function showErr(input, el, msg) {
    const group = input.closest('.form-group');
    if (group) {
        group.classList.add('error', 'shake');
        setTimeout(() => group.classList.remove('shake'), 500);
    }
    el.textContent = msg;
}

function showSuccess(msg) {
    let box = setupForm.querySelector('.setup-success');
    if (!box) {
        box = document.createElement('div');
        box.className = 'setup-success';
        setupForm.appendChild(box);
    }
    box.textContent = msg;
    setTimeout(() => { if (box) box.remove(); }, 5000);
}

function clearAllErrors() {
    clearErr(setupGmail, setupGmailError);
    clearErr(setupAppPassword, setupAppPasswordError);
    clearErr(setupBrevoKey, setupBrevoKeyError);
    clearErr(setupSenderEmail, setupSenderEmailError);
    clearErr(setupAdmin, setupAdminError);
}

// ---------- Password toggle ----------
document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.getAttribute('data-target'));
        if (!input) return;
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        button.classList.toggle('revealed', reveal);
        input.focus();
    });
});

// ---------- Provider tabs ----------
function setProvider(next) {
    provider = next;
    providerTabButtons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-provider') === next));
    smtpFields.classList.toggle('hidden', next !== 'smtp');
    brevoFields.classList.toggle('hidden', next !== 'brevo');
}

providerTabButtons.forEach((button) => {
    button.addEventListener('click', () => setProvider(button.getAttribute('data-provider')));
});

// ---------- Status ----------
async function loadStatus() {
    try {
        const res = await fetch('/api/setup/status');
        const data = await res.json();
        renderStatus(data);
    } catch (e) {
        setupStatus.innerHTML = '<span class="dot"></span>' + t('err.network');
    }
}

function renderStatus(data) {
    if (data.provider === 'smtp' || data.provider === 'brevo') {
        setProvider(data.provider);
    }

    if (data.configured) {
        setupStatus.classList.add('ok');
        setupStatus.innerHTML = '<span class="dot"></span>' +
            t('setup.configured', { email: data.email || '' });
    } else {
        setupStatus.classList.remove('ok');
        setupStatus.innerHTML = '<span class="dot"></span>' + t('setup.notConfigured');
    }
    setupAdminHint.textContent = data.hasAdmin ? t('setup.adminHintExisting') : t('setup.adminHintFirst');
}

// ---------- Save ----------
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const adminPassword = setupAdmin.value;
    const body = { provider, adminPassword };
    let valid = true;

    if (provider === 'smtp') {
        const gmail = setupGmail.value.trim();
        const appPassword = setupAppPassword.value.trim();
        if (!/^[^\s@]+@gmail\.com$/i.test(gmail)) {
            showErr(setupGmail, setupGmailError, t('err.gmail.only'));
            valid = false;
        }
        if (!appPassword) {
            showErr(setupAppPassword, setupAppPasswordError, t('err.missing'));
            valid = false;
        }
        body.gmailUser = gmail;
        body.gmailAppPassword = appPassword;
    } else {
        const key = setupBrevoKey.value.trim();
        const senderEmail = setupSenderEmail.value.trim();
        if (!key) {
            showErr(setupBrevoKey, setupBrevoKeyError, t('err.missing'));
            valid = false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
            showErr(setupSenderEmail, setupSenderEmailError, t('err.invalid_email'));
            valid = false;
        }
        body.brevoApiKey = key;
        body.senderEmail = senderEmail;
        body.senderName = setupSenderName.value.trim();
    }

    if (!adminPassword) {
        showErr(setupAdmin, setupAdminError, t('err.missing'));
        valid = false;
    }
    if (!valid) return;

    setupSaveBtn.classList.add('loading');
    setupSaveBtn.textContent = t('setup.saving');

    try {
        const res = await fetch('/api/setup/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            const code = data.error || 'request_failed';
            let msg = tErr(code);
            if (data.message) msg += ' — ' + data.message;

            if (code === 'invalid_email') {
                if (provider === 'brevo') showErr(setupSenderEmail, setupSenderEmailError, msg);
                else showErr(setupGmail, setupGmailError, msg);
            } else if (code === 'wrong_admin' || code === 'weak_admin') {
                showErr(setupAdmin, setupAdminError, msg);
            } else if (code === 'brevo_failed') {
                showErr(setupBrevoKey, setupBrevoKeyError, msg);
            } else {
                showErr(setupAppPassword, setupAppPasswordError, msg);
            }
            return;
        }

        showSuccess(t('setup.saved'));
        setupAppPassword.value = '';
        setupBrevoKey.value = '';
        setupAdmin.value = '';
        loadStatus();
    } catch (err) {
        showErr(setupAdmin, setupAdminError, t('err.network'));
    } finally {
        setupSaveBtn.classList.remove('loading');
        setupSaveBtn.textContent = t('setup.save');
    }
});

// ---------- Live error clearing ----------
[
    [setupGmail, setupGmailError],
    [setupAppPassword, setupAppPasswordError],
    [setupBrevoKey, setupBrevoKeyError],
    [setupSenderEmail, setupSenderEmailError],
    [setupAdmin, setupAdminError]
].forEach(([input, error]) => {
    input.addEventListener('input', () => clearErr(input, error));
});

// ---------- Init ----------
loadStatus();
