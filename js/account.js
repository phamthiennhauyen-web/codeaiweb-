// ==========================================
// Account screen logic
// ==========================================

// ---------- DOM ----------
const accBack = document.getElementById('accBack');
const accTabs = Array.from(document.querySelectorAll('.acc-tab'));
const accPanels = Array.from(document.querySelectorAll('.acc-panel'));

const avatarPreview = document.getElementById('avatarPreview');
const avatarInput = document.getElementById('avatarInput');
const changePhotoBtn = document.getElementById('changePhotoBtn');
const removePhotoBtn = document.getElementById('removePhotoBtn');

const accUsername = document.getElementById('accUsername');
const accUsernameError = document.getElementById('accUsernameError');
const accDisplayName = document.getElementById('accDisplayName');
const accDisplayNameError = document.getElementById('accDisplayNameError');
const accBio = document.getElementById('accBio');
const accBioError = document.getElementById('accBioError');
const saveProfileBtn = document.getElementById('saveProfileBtn');

const accNewEmail = document.getElementById('accNewEmail');
const accNewEmailError = document.getElementById('accNewEmailError');
const sendEmailCodeBtn = document.getElementById('sendEmailCodeBtn');
const accEmailCode = document.getElementById('accEmailCode');
const accEmailCodeError = document.getElementById('accEmailCodeError');
const confirmEmailBtn = document.getElementById('confirmEmailBtn');

const accCurrentPassword = document.getElementById('accCurrentPassword');
const accCurrentPasswordError = document.getElementById('accCurrentPasswordError');
const accNewPassword = document.getElementById('accNewPassword');
const accNewPasswordError = document.getElementById('accNewPasswordError');
const accConfirmNewPassword = document.getElementById('accConfirmNewPassword');
const accConfirmNewPasswordError = document.getElementById('accConfirmNewPasswordError');
const updatePasswordBtn = document.getElementById('updatePasswordBtn');

const langRadios = Array.from(document.querySelectorAll('input[name="lang"]'));
const accLogoutBtn = document.getElementById('accLogoutBtn');

// ---------- State ----------
let pendingAvatar = undefined; // undefined = unchanged, null = removed, string = new base64

// ---------- Helpers ----------
function accClearError(input, errorEl) {
    const group = input.closest('.form-group');
    if (group) group.classList.remove('error', 'shake');
    if (errorEl) errorEl.textContent = '';
}

function accShowError(input, errorEl, message) {
    const group = input.closest('.form-group');
    if (group) {
        group.classList.add('error', 'shake');
        setTimeout(() => group.classList.remove('shake'), 500);
    }
    if (errorEl) errorEl.textContent = message;
}

function setBtnLoading(button, label) {
    button.classList.add('loading');
    button.textContent = label;
}

function resetBtn(button, key) {
    button.classList.remove('loading');
    button.textContent = t(key);
}

// ---------- Avatar ----------
function renderAvatar() {
    const user = getCurrentUser();
    const avatar = pendingAvatar !== undefined ? pendingAvatar : (user ? user.avatar : null);

    if (avatar) {
        avatarPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = 'avatar';
        avatarPreview.appendChild(img);
    } else {
        const initial = user ? (user.displayName || user.username || '?').charAt(0).toUpperCase() : '?';
        avatarPreview.textContent = initial;
    }
}

function downscaleImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const max = 256;
                let { width, height } = image;
                if (width > height && width > max) {
                    height = Math.round((height * max) / width);
                    width = max;
                } else if (height > max) {
                    width = Math.round((width * max) / height);
                    height = max;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            image.onerror = () => reject(new Error('image'));
            image.src = reader.result;
        };
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
    });
}

changePhotoBtn.addEventListener('click', () => avatarInput.click());

avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;
    try {
        pendingAvatar = await downscaleImage(file);
        renderAvatar();
    } catch (e) {
        showToast(t('msg.imageTooLarge'));
    }
    avatarInput.value = '';
});

removePhotoBtn.addEventListener('click', () => {
    pendingAvatar = null;
    renderAvatar();
});

// ---------- Populate ----------
function populateAccount() {
    const user = getCurrentUser();
    if (!user) return;

    pendingAvatar = undefined;

    accUsername.value = user.username || '';
    accDisplayName.value = user.displayName || user.username || '';
    accBio.value = user.bio || '';
    renderAvatar();

    accNewEmail.value = '';
    accEmailCode.value = '';
    accCurrentPassword.value = '';
    accNewPassword.value = '';
    accConfirmNewPassword.value = '';

    [accUsernameError, accDisplayNameError, accNewEmailError, accEmailCodeError,
        accCurrentPasswordError, accNewPasswordError, accConfirmNewPasswordError]
        .forEach((el) => { if (el) el.textContent = ''; });

    langRadios.forEach((radio) => {
        radio.checked = radio.value === getLang();
    });
}

// ---------- Tabs / screen ----------
function setTab(tab) {
    accTabs.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tab') === tab));
    accPanels.forEach((panel) => panel.classList.toggle('active', panel.id === 'panel-' + tab));
}

function openAccount(tab) {
    populateAccount();
    setTab(tab || 'profile');
    hallScreen.classList.add('hidden');
    authScreen.classList.add('hidden');
    accountScreen.classList.remove('hidden');
    slideIn(accountScreen, 'right');
    window.scrollTo(0, 0);
}

function closeAccount() {
    accountScreen.classList.add('hidden');
    showHall();
}

accBack.addEventListener('click', closeAccount);

accTabs.forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
});

// ---------- Save profile ----------
saveProfileBtn.addEventListener('click', async () => {
    accClearError(accUsername, accUsernameError);
    accClearError(accDisplayName, accDisplayNameError);
    accClearError(accBio, accBioError);

    const username = accUsername.value.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        accShowError(accUsername, accUsernameError, t('err.username.invalid'));
        return;
    }

    const displayName = accDisplayName.value.trim();
    if (displayName.length < 1 || displayName.length > 40) {
        accShowError(accDisplayName, accDisplayNameError, t('err.invalid_displayname'));
        return;
    }

    const patch = { username, displayName, bio: accBio.value };
    if (pendingAvatar !== undefined) patch.avatar = pendingAvatar;

    setBtnLoading(saveProfileBtn, '...');
    try {
        const res = await ApiAccount.updateProfile(patch);
        setCurrentUser(res.user);
        pendingAvatar = undefined;
        renderAvatar();
        if (accountSlot) accountSlot.textContent = res.user.displayName || res.user.username;
        showToast(t('msg.profileSaved'));
    } catch (err) {
        if (err.code === 'username_taken' || err.code === 'invalid_username') {
            accShowError(accUsername, accUsernameError, translateError(err));
        } else {
            accShowError(accDisplayName, accDisplayNameError, translateError(err));
        }
    }
    resetBtn(saveProfileBtn, 'acc.profile.save');
});

// ---------- Change Gmail ----------
sendEmailCodeBtn.addEventListener('click', async () => {
    accClearError(accNewEmail, accNewEmailError);

    const email = accNewEmail.value.trim();
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
        accShowError(accNewEmail, accNewEmailError, t('err.gmail.only'));
        return;
    }

    setBtnLoading(sendEmailCodeBtn, '...');
    try {
        await ApiAuth.sendCode(email, 'change-email');
        showToast(t('msg.codeSent', { email }));
    } catch (err) {
        accShowError(accNewEmail, accNewEmailError, translateError(err));
    }
    resetBtn(sendEmailCodeBtn, 'acc.security.sendCode');
});

confirmEmailBtn.addEventListener('click', async () => {
    accClearError(accNewEmail, accNewEmailError);
    accClearError(accEmailCode, accEmailCodeError);

    const email = accNewEmail.value.trim();
    const code = accEmailCode.value.trim();

    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
        accShowError(accNewEmail, accNewEmailError, t('err.gmail.only'));
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        accShowError(accEmailCode, accEmailCodeError, t('err.code.six'));
        return;
    }

    setBtnLoading(confirmEmailBtn, '...');
    try {
        const verify = await ApiAuth.verifyCode(email, code, 'change-email');
        const res = await ApiAccount.changeEmail(email, verify.verificationToken);
        setCurrentUser(res.user);
        accNewEmail.value = '';
        accEmailCode.value = '';
        showToast(t('msg.emailChanged'));
    } catch (err) {
        accShowError(accEmailCode, accEmailCodeError, translateError(err));
    }
    resetBtn(confirmEmailBtn, 'acc.security.confirmChange');
});

// ---------- Change password ----------
updatePasswordBtn.addEventListener('click', async () => {
    accClearError(accCurrentPassword, accCurrentPasswordError);
    accClearError(accNewPassword, accNewPasswordError);
    accClearError(accConfirmNewPassword, accConfirmNewPasswordError);

    const current = accCurrentPassword.value;
    const next = accNewPassword.value;
    const confirm = accConfirmNewPassword.value;

    let valid = true;
    if (!current) { accShowError(accCurrentPassword, accCurrentPasswordError, t('err.required')); valid = false; }
    if (next.length < 6) { accShowError(accNewPassword, accNewPasswordError, t('err.newpassword.short')); valid = false; }
    if (next !== confirm) { accShowError(accConfirmNewPassword, accConfirmNewPasswordError, t('err.confirm.mismatch')); valid = false; }
    if (!valid) return;

    setBtnLoading(updatePasswordBtn, '...');
    try {
        await ApiAccount.changePassword(current, next);
        accCurrentPassword.value = '';
        accNewPassword.value = '';
        accConfirmNewPassword.value = '';
        showToast(t('msg.passwordChanged'));
    } catch (err) {
        accShowError(accCurrentPassword, accCurrentPasswordError, translateError(err));
    }
    resetBtn(updatePasswordBtn, 'acc.security.updatePassword');
});

// ---------- Language ----------
langRadios.forEach((radio) => {
    radio.addEventListener('change', async () => {
        if (!radio.checked) return;
        const lang = radio.value;
        setLang(lang);

        try {
            const res = await ApiAccount.updateSettings({ language: lang });
            setCurrentUser(res.user);
        } catch (e) { /* offline change still applied locally */ }

        refreshTools();
        if (accountSlot) {
            const user = getCurrentUser();
            if (user) accountSlot.textContent = user.displayName || user.username;
        }
        showToast(t('msg.langChanged'));
    });
});

// ---------- Logout ----------
accLogoutBtn.addEventListener('click', () => {
    doLogout();
});

// ---------- Live error clearing ----------
[
    [accUsername, accUsernameError],
    [accDisplayName, accDisplayNameError],
    [accBio, accBioError],
    [accNewEmail, accNewEmailError],
    [accEmailCode, accEmailCodeError],
    [accCurrentPassword, accCurrentPasswordError],
    [accNewPassword, accNewPasswordError],
    [accConfirmNewPassword, accConfirmNewPasswordError]
].forEach(([input, error]) => {
    if (input) input.addEventListener('input', () => accClearError(input, error));
});
