// ==========================================
// Hall (Sảnh) Logic
// ==========================================

// ---------- Icons ----------
const ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    calculator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="8" y2="19"/><line x1="12" y1="19" x2="12" y2="19"/><line x1="16" y1="19" x2="16" y2="19"/></svg>'
};

// ---------- Tools config ----------
// nameKey/descKey trỏ tới i18n.
const TOOLS = [
    { id: 'editor', nameKey: 'tool.editor.name', descKey: 'tool.editor.desc', href: 'editor.html', icon: ICONS.code },
    { id: 'projects', nameKey: 'tool.projects.name', descKey: 'tool.projects.desc', href: 'projects.html', icon: ICONS.folder },
    { id: 'chat', nameKey: 'tool.chat.name', descKey: 'tool.chat.desc', href: 'chat.html', icon: ICONS.chat },
    { id: 'profile', nameKey: 'tool.profile.name', descKey: 'tool.profile.desc', tab: 'profile', icon: ICONS.user },
    { id: 'casio', nameKey: 'tool.casio.name', descKey: 'tool.casio.desc', href: 'casio.html', icon: ICONS.calculator }
];

// ---------- DOM ----------
const authScreen = document.getElementById('authScreen');
const hallScreen = document.getElementById('hallScreen');
const accountScreen = document.getElementById('accountScreen');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarNav = document.getElementById('sidebarNav');
const sidebarAccount = document.getElementById('sidebarAccount');
const toolsGrid = document.getElementById('toolsGrid');
const logoutBtn = document.getElementById('logoutBtn');
const accountSlot = document.getElementById('accountSlot');
const accountDropdown = document.getElementById('accountDropdown');
const menuAccountSettings = document.getElementById('menuAccountSettings');
const menuLogout = document.getElementById('menuLogout');

// ---------- Render tools ----------
function renderTools() {
    const sidebarHTML = TOOLS.map((tool) => `
        <button type="button" class="sidebar-item" data-tool="${tool.id}">
            ${tool.icon}
            <span>${t(tool.nameKey)}</span>
            ${tool.available === false ? `<span class="coming">${t('hall.soon_badge')}</span>` : ''}
        </button>
    `).join('');

    sidebarNav.innerHTML = sidebarHTML;

    const gridHTML = TOOLS.map((tool, i) => `
        <button type="button" class="tool-card" data-tool="${tool.id}" style="animation-delay:${i * 60}ms">
            ${tool.available === false ? `<span class="tool-badge">${t('hall.soon')}</span>` : ''}
            <span class="tool-icon">${tool.icon}</span>
            <span class="tool-name">${t(tool.nameKey)}</span>
            <span class="tool-desc">${t(tool.descKey)}</span>
        </button>
    `).join('');

    toolsGrid.innerHTML = gridHTML;

    document.querySelectorAll('[data-tool]').forEach((el) => {
        el.addEventListener('click', () => openTool(el.getAttribute('data-tool')));
    });
}

function openTool(toolId) {
    const tool = TOOLS.find((item) => item.id === toolId);
    if (!tool) return;

    closeSidebar();

    if (tool.href) {
        slideOut(hallScreen, 'left', () => {
            window.location.href = tool.href;
        });
    } else if (tool.tab) {
        openAccount(tool.tab);
    } else {
        showToast(t(tool.nameKey) + ' — ' + t('hall.soon'));
    }
}

// ---------- Sidebar ----------
function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('show');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('show');
}

sidebarToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
});

sidebarBackdrop.addEventListener('click', closeSidebar);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSidebar();
        closeDropdown();
    }
});

// ---------- Account dropdown ----------
function openDropdown() {
    accountDropdown.classList.remove('hidden');
}

function closeDropdown() {
    accountDropdown.classList.add('hidden');
}

accountSlot.addEventListener('click', (e) => {
    e.stopPropagation();
    if (accountDropdown.classList.contains('hidden')) {
        openDropdown();
    } else {
        closeDropdown();
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.account-menu')) closeDropdown();
});

menuAccountSettings.addEventListener('click', () => {
    closeDropdown();
    openAccount('profile');
});

menuLogout.addEventListener('click', () => {
    closeDropdown();
    doLogout();
});

// ---------- Toast ----------
let toastTimer = null;

function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    requestAnimationFrame(() => toast.classList.add('show'));

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---------- Logout ----------
async function doLogout() {
    await logoutUser();
    slideOut(hallScreen, 'left', () => showAuth());
}

logoutBtn.addEventListener('click', doLogout);
sidebarAccount.addEventListener('click', () => {
    closeSidebar();
    openAccount('profile');
});

// ---------- Screen switching ----------
let toolsRendered = false;

function showHall() {
    const user = getCurrentUser();
    if (accountSlot && user) {
        accountSlot.textContent = user.displayName || user.username;
    }

    authScreen.classList.add('hidden');
    accountScreen.classList.add('hidden');
    hallScreen.classList.remove('hidden');
    slideIn(hallScreen, 'right');

    if (!toolsRendered) {
        renderTools();
        toolsRendered = true;
    }

    closeSidebar();
    closeDropdown();
}

function showAuth() {
    hallScreen.classList.add('hidden');
    accountScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    slideIn(authScreen, 'left');

    const card = document.getElementById('flipCard');
    if (card) card.classList.remove('flipped');
}

function refreshTools() {
    if (toolsRendered) renderTools();
}

// ---------- Theme ----------
document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => CodeTheme.toggle());
});

// ---------- Init ----------
(async function init() {
    applyI18n();

    // Hiển thị ngay theo token (không chờ API) để tránh nháy màn đăng nhập
    if (getToken()) {
        showHall();
    } else {
        showAuth();
    }

    const user = await loadCurrentUser();
    if (user) {
        if (hallScreen.classList.contains('hidden')) showHall();
    } else {
        if (authScreen.classList.contains('hidden')) showAuth();
    }
})();
