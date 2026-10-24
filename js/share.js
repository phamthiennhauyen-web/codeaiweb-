(function () {
    'use strict';

    const token = (location.hash.match(/[#&]t=([^&]+)/) || [])[1] || '';
    const view = {
        project: null,
        files: [],
        currentFile: null,
        content: '',
        socket: null
    };

    const els = {
        loading: document.getElementById('shareLoading'),
        error: document.getElementById('shareError'),
        content: document.getElementById('shareContent'),
        title: document.getElementById('sharedTitle'),
        description: document.getElementById('sharedDescription'),
        badge: document.getElementById('sharedBadge'),
        owner: document.getElementById('sharedOwner'),
        fileCount: document.getElementById('sharedFileCount'),
        size: document.getElementById('sharedSize'),
        fileTabs: document.getElementById('sharedFileTabs'),
        viewerEmpty: document.getElementById('sharedViewerEmpty'),
        viewerContent: document.getElementById('sharedViewerContent'),
        zipBtn: document.getElementById('shareZipBtn'),
        fileLabel: document.getElementById('sharedFileLabel'),
        fileLanguage: document.getElementById('sharedFileLanguage'),
        copyBtn: document.getElementById('sharedCopyBtn'),
        downloadBtn: document.getElementById('sharedDownloadBtn'),
        fileLines: document.getElementById('sharedFileLines'),
        fileSize: document.getElementById('sharedFileSize'),
        updated: document.getElementById('sharedUpdated'),
        lineNumbers: document.getElementById('sharedLineNumbers'),
        code: document.getElementById('sharedCode'),
        loginBtn: document.getElementById('shareLoginBtn')
    };

    function showError() {
        els.loading.classList.add('hidden');
        els.content.classList.add('hidden');
        els.error.classList.remove('hidden');
    }

    function renderHeader() {
        const project = view.project;
        document.title = project.name + ' - CodeAI';
        els.title.textContent = project.name;
        els.description.textContent = project.description || t('project.noDescription');
        els.badge.textContent = PC.statusLabel(project).toUpperCase();
        els.badge.className = 'pc-badge ' + PC.statusClass(project);
        els.owner.textContent = t('share.by', { name: project.ownerName || project.id });
        els.fileCount.textContent = t('share.files', { count: project.fileCount });
        els.size.textContent = PC.formatBytes(project.totalBytes);
        els.updated.textContent = t('proj.updated', { time: PC.relativeTime(project.updatedAt) });
    }

    function renderTabs() {
        els.fileTabs.innerHTML = view.files.map((file) => `
            <button type="button" class="ps-file-tab ${view.currentFile && view.currentFile.id === file.id ? 'active' : ''}" data-file="${PC.esc(file.id)}">
                ${PC.esc(file.label)}
            </button>
        `).join('');
        els.fileTabs.querySelectorAll('[data-file]').forEach((button) => {
            button.addEventListener('click', () => loadFile(button.getAttribute('data-file')));
        });
    }

    function renderEmptyViewer() {
        view.currentFile = null;
        view.content = '';
        els.fileLabel.textContent = '';
        els.fileLanguage.textContent = '';
        els.code.textContent = '';
        els.lineNumbers.textContent = '';
        els.fileLines.textContent = '';
        els.fileSize.textContent = '';
        els.viewerEmpty.classList.remove('hidden');
        els.viewerContent.classList.add('hidden');
    }

    function renderCode() {
        if (!view.currentFile) return;
        els.viewerEmpty.classList.add('hidden');
        els.viewerContent.classList.remove('hidden');
        const content = view.content || '';
        const language = view.currentFile.language || 'plaintext';
        els.fileLabel.textContent = view.currentFile.label;
        els.fileLanguage.textContent = language;
        els.code.className = 'hljs' + (language !== 'plaintext' ? ' language-' + language : '');
        els.code.textContent = content;
        if (window.hljs) {
            try { hljs.highlightElement(els.code); } catch (e) { /* ignore */ }
        }
        const lines = PC.lineCount(content);
        els.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        els.fileLines.textContent = t('project.file.lines', { count: lines });
        els.fileSize.textContent = PC.formatBytes(new Blob([content]).size);
    }

    async function loadFile(fileId) {
        try {
            const res = await ApiShare.file(token, fileId);
            view.currentFile = res.file;
            view.content = res.file.content || '';
            renderTabs();
            renderCode();
        } catch (err) {
            if (err.status === 410) showError();
            else PC.toast(PC.apiMessage(err, 'project.error.fileLoad'), 'error');
        }
    }

    async function loadShare() {
        if (!token) {
            showError();
            return;
        }
        try {
            const res = await ApiShare.get(token);
            view.project = res.project;
            view.files = res.files || [];
            els.loading.classList.add('hidden');
            els.error.classList.add('hidden');
            els.content.classList.remove('hidden');
            renderHeader();
            renderTabs();
            if (view.files.length) await loadFile(view.files[0].id);
            else renderEmptyViewer();
            bindRealtime();
        } catch (err) {
            showError();
        }
    }

    async function downloadZip() {
        if (!view.project) return;
        PC.toast(t('project.zipPreparing'));
        try {
            await PC.download(
                '/api/share/download.zip',
                view.project.name + '.zip',
                { 'X-Share-Token': token }
            );
        } catch (err) {
            if (err.status === 410) showError();
            else PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        }
    }

    async function downloadFile() {
        if (!view.currentFile) return;
        try {
            await PC.download(
                '/api/share/files/' + encodeURIComponent(view.currentFile.id) + '/raw',
                view.currentFile.label,
                { 'X-Share-Token': token }
            );
        } catch (err) {
            if (err.status === 410) showError();
            else PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        }
    }

    function bindRealtime() {
        view.socket = new ProjectSocket({
            shareToken: token,
            onEvent: async (event) => {
                if (event.type === 'share.revoked' || event.type === 'project.deleted') {
                    showError();
                    return;
                }
                if (event.type === 'project.updated' || event.type === 'project.archived' || event.type === 'project.unarchived') {
                    try {
                        const res = await ApiShare.get(token);
                        view.project = res.project;
                        view.files = res.files || [];
                        renderHeader();
                        renderTabs();
                        if (view.currentFile) {
                            const next = view.files.find((file) => file.id === view.currentFile.id);
                            if (next) await loadFile(next.id);
                            else if (view.files.length) await loadFile(view.files[0].id);
                            else renderEmptyViewer();
                        } else if (view.files.length) {
                            await loadFile(view.files[0].id);
                        } else {
                            renderEmptyViewer();
                        }
                    } catch (err) {
                        showError();
                    }
                    return;
                }
                if (event.type && event.type.startsWith('file.')) {
                    try {
                        const res = await ApiShare.get(token);
                        view.files = res.files || [];
                        renderHeader();
                        if (!view.currentFile) {
                            renderTabs();
                            if (view.files.length) await loadFile(view.files[0].id);
                            else renderEmptyViewer();
                            return;
                        }
                        const current = view.files.find((file) => file.id === view.currentFile.id);
                        if (!current) {
                            renderTabs();
                            if (view.files.length) await loadFile(view.files[0].id);
                            else renderEmptyViewer();
                            return;
                        }
                        renderTabs();
                        if (event.fileId === current.id) {
                            await loadFile(current.id);
                            PC.toast(t('share.updated'));
                        }
                    } catch (err) {
                        showError();
                    }
                }
            }
        });
        view.socket.connect();
    }

    async function init() {
        applyI18n();
        document.querySelectorAll('.pc-theme-toggle').forEach((button) => {
            button.addEventListener('click', () => CodeTheme.toggle());
        });
        const user = await loadCurrentUser();
        if (user) {
            els.loginBtn.textContent = t('share.openApp');
            els.loginBtn.href = 'projects.html';
        }
        els.zipBtn.addEventListener('click', downloadZip);
        els.downloadBtn.addEventListener('click', downloadFile);
        els.copyBtn.addEventListener('click', async () => {
            if (!view.content) return;
            if (await PC.copyText(view.content)) {
                els.copyBtn.textContent = t('share.copied');
                setTimeout(() => { els.copyBtn.textContent = t('share.copy'); }, 1400);
            }
        });
        await loadShare();
    }

    init();
})();
