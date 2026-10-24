// ==========================================
// Login / Register / OTP
// ==========================================

// ---------- DOM ----------
const flipCard = document.getElementById('flipCard');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');

const registerView = document.getElementById('registerView');
const verifyView = document.getElementById('verifyView');
const verifyEmailLabel = document.getElementById('verifyEmail');

const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginUsernameError = document.getElementById('loginUsernameError');
const loginPasswordError = document.getElementById('loginPasswordError');

const registerForm = document.getElementById('registerForm');
const registerUsername = document.getElementById('registerUsername');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConfirmPassword = document.getElementById('registerConfirmPassword');
const registerUsernameError = document.getElementById('registerUsernameError');
const registerEmailError = document.getElementById('registerEmailError');
const registerPasswordError = document.getElementById('registerPasswordError');
const registerConfirmPasswordError = document.getElementById('registerConfirmPasswordError');

const verifyForm = document.getElementById('verifyForm');
const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
const verifyCodeError = document.getElementById('verifyCodeError');
const resendCodeLink = document.getElementById('resendCode');
const backToRegisterLink = document.getElementById('backToRegister');

// ---------- State ----------
let pendingRegistration = null; // { username, email, password }

// ---------- Flip ----------
function flipTo(showBack) {
    flipCard.classList.toggle('flipped', showBack);
}

showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    showRegisterView();
    flipTo(true);
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    flipTo(false);
});

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

// ---------- Validation helpers ----------
function clearError(input, errorElement) {
    const formGroup = input.closest('.form-group');
    if (formGroup) formGroup.classList.remove('error', 'shake');
    errorElement.textContent = '';
}

function showError(input, errorElement, message) {
    const formGroup = input.closest('.form-group');
    if (formGroup) {
        formGroup.classList.add('error', 'shake');
        setTimeout(() => formGroup.classList.remove('shake'), 500);
    }
    errorElement.textContent = message;
}

function validateUsername(username) {
    if (!username) return { valid: false, message: t('err.username.required') };
    if (username.length < 3) return { valid: false, message: t('err.username.short') };
    if (username.length > 20) return { valid: false, message: t('err.username.long') };
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return { valid: false, message: t('err.username.invalid') };
    return { valid: true };
}

function validateGmail(email) {
    if (!email) return { valid: false, message: t('err.gmail.required') };
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) return { valid: false, message: t('err.gmail.only') };
    return { valid: true };
}

function validatePassword(password) {
    if (!password) return { valid: false, message: t('err.password.required') };
    if (password.length < 6) return { valid: false, message: t('err.password.short') };
    return { valid: true };
}

function validateConfirmPassword(password, confirmPassword) {
    if (!confirmPassword) return { valid: false, message: t('err.confirm.required') };
    if (password !== confirmPassword) return { valid: false, message: t('err.confirm.mismatch') };
    return { valid: true };
}

function setButtonLoading(button, key) {
    button.dataset.labelKey = button.dataset.labelKey || button.getAttribute('data-i18n') || key;
    button.classList.add('loading');
    button.textContent = t(key);
}

function resetButton(button, fallbackKey) {
    button.classList.remove('loading');
    const key = button.dataset.labelKey || fallbackKey;
    button.textContent = t(key);
}

// ---------- OTP boxes ----------
function getOtpValue() {
    return otpBoxes.map((b) => b.value).join('');
}

function resetOtp() {
    otpBoxes.forEach((b) => {
        b.value = '';
        b.classList.remove('filled');
    });
}

function fillOtp(code) {
    const digits = String(code).replace(/\D/g, '').slice(0, otpBoxes.length).split('');
    otpBoxes.forEach((box, i) => {
        box.value = digits[i] || '';
        box.classList.toggle('filled', !!digits[i]);
    });
    const next = Math.min(digits.length, otpBoxes.length - 1);
    otpBoxes[next].focus();
}

otpBoxes.forEach((box, index) => {
    box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(0, 1);
        box.classList.toggle('filled', box.value !== '');
        verifyCodeError.textContent = '';
        if (box.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
    });

    box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && index > 0) {
            otpBoxes[index - 1].focus();
            otpBoxes[index - 1].value = '';
            otpBoxes[index - 1].classList.remove('filled');
            e.preventDefault();
        } else if (e.key === 'ArrowLeft' && index > 0) {
            otpBoxes[index - 1].focus();
            e.preventDefault();
        } else if (e.key === 'ArrowRight' && index < otpBoxes.length - 1) {
            otpBoxes[index + 1].focus();
            e.preventDefault();
        }
    });

    box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        fillOtp(text);
    });

    box.addEventListener('focus', () => box.select());
});

// ---------- View switching ----------
function showVerifyView(email) {
    verifyEmailLabel.textContent = email;
    resetOtp();
    verifyCodeError.textContent = '';
    registerView.classList.add('hidden');
    verifyView.classList.remove('hidden');
    otpBoxes[0].focus();
}

function showRegisterView() {
    verifyView.classList.add('hidden');
    registerView.classList.remove('hidden');
}

// ---------- Login submit ----------
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginUsername, loginUsernameError);
    clearError(loginPassword, loginPasswordError);

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    let valid = true;
    const uCheck = validateUsername(username);
    if (!uCheck.valid) { showError(loginUsername, loginUsernameError, uCheck.message); valid = false; }
    const pCheck = validatePassword(password);
    if (!pCheck.valid) { showError(loginPassword, loginPasswordError, pCheck.message); valid = false; }
    if (!valid) return;

    const button = loginForm.querySelector('.btn-primary');
    setButtonLoading(button, 'btn.logging');

    try {
        await loginUser(username, password);
        loginForm.reset();
        resetButton(button, 'auth.login.btn');
        showHall();
    } catch (err) {
        resetButton(button, 'auth.login.btn');
        showError(loginUsername, loginUsernameError, translateError(err));
    }
});

// ---------- Register submit -> send OTP ----------
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(registerUsername, registerUsernameError);
    clearError(registerEmail, registerEmailError);
    clearError(registerPassword, registerPasswordError);
    clearError(registerConfirmPassword, registerConfirmPasswordError);

    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value;
    const confirmPassword = registerConfirmPassword.value;

    let valid = true;
    const uCheck = validateUsername(username);
    if (!uCheck.valid) { showError(registerUsername, registerUsernameError, uCheck.message); valid = false; }
    const gCheck = validateGmail(email);
    if (!gCheck.valid) { showError(registerEmail, registerEmailError, gCheck.message); valid = false; }
    const pCheck = validatePassword(password);
    if (!pCheck.valid) { showError(registerPassword, registerPasswordError, pCheck.message); valid = false; }
    const cCheck = validateConfirmPassword(password, confirmPassword);
    if (!cCheck.valid) { showError(registerConfirmPassword, registerConfirmPasswordError, cCheck.message); valid = false; }
    if (!valid) return;

    const button = registerForm.querySelector('.btn-primary');
    setButtonLoading(button, 'btn.sending');

    try {
        await ApiAuth.sendCode(email, 'register');
        pendingRegistration = { username, email, password };
        resetButton(button, 'auth.register.btn');
        showVerifyView(email);
    } catch (err) {
        resetButton(button, 'auth.register.btn');
        showError(registerEmail, registerEmailError, translateError(err));
    }
});

// ---------- Verify submit -> create account ----------
verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    verifyCodeError.textContent = '';

    if (!pendingRegistration) {
        verifyCodeError.textContent = t('err.session.expired');
        return;
    }

    const code = getOtpValue();
    if (!/^\d{6}$/.test(code)) {
        verifyCodeError.textContent = t('err.code.six');
        return;
    }

    const button = verifyForm.querySelector('.btn-primary');
    setButtonLoading(button, 'btn.verifying');

    try {
        const res = await ApiAuth.verifyCode(pendingRegistration.email, code, 'register');
        await registerUser({
            username: pendingRegistration.username,
            email: pendingRegistration.email,
            password: pendingRegistration.password,
            verificationToken: res.verificationToken
        });
        pendingRegistration = null;
        registerForm.reset();
        resetButton(button, 'auth.verify.btn');
        showHall();
    } catch (err) {
        resetButton(button, 'auth.verify.btn');
        verifyCodeError.textContent = translateError(err);
    }
});

// ---------- Resend / Back ----------
resendCodeLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!pendingRegistration) {
        verifyCodeError.textContent = t('err.session.expired');
        return;
    }

    resendCodeLink.textContent = t('btn.sending');
    try {
        await ApiAuth.sendCode(pendingRegistration.email, 'register');
        resetOtp();
        verifyCodeError.textContent = '';
    } catch (err) {
        verifyCodeError.textContent = translateError(err);
    }
    resendCodeLink.textContent = t('auth.verify.resend');
});

backToRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    pendingRegistration = null;
    showRegisterView();
});

// ---------- Live error clearing ----------
[
    [loginUsername, loginUsernameError],
    [loginPassword, loginPasswordError],
    [registerUsername, registerUsernameError],
    [registerEmail, registerEmailError],
    [registerPassword, registerPasswordError],
    [registerConfirmPassword, registerConfirmPasswordError]
].forEach(([input, error]) => {
    input.addEventListener('input', () => clearError(input, error));
});
