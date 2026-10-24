(async function init() {
    const user = await requireAuth();
    if (!user) return;

    applyI18n();

    const userName = document.getElementById('userName');
    if (userName) userName.textContent = user.displayName || user.username || user.id;

    const themeBtn = document.querySelector('.casio-theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            if (window.CodeTheme) window.CodeTheme.toggle();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logoutUser();
            window.location.href = 'index.html';
        });
    }

    let toastTimer = null;
    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    document.querySelectorAll('[data-soon]').forEach((button) => {
        button.addEventListener('click', () => showToast(t('casio.soonToast')));
    });

    const main = document.querySelector('.casio-main');
    if (main && window.slideIn) window.slideIn(main, 'right');
})();
