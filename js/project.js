(function () {
    'use strict';

    const params = new URLSearchParams(location.search);
    const projectId = params.get('id') || '';

    const view = {
        user: null,
        project: null,
        files: [],
        currentFile: null,
        content: '',
        editing: false,
        projectStale: false,
        fileStale: false,
        loadingFile: false,
        savingFile: false,
        socket: null
    };

    const els = {
        title: document.getElementById('projectTitle'),
        description: document.getElementById('projectDescription'),
        badge: document.getElementById('projectBadge'),
        fileCount: document.getElementById('projectFileCount'),
        size: document.getElementById('projectSize'),
        owner: document.getElementById('projectOwner'),
        editProjectBtn: document.getElementById('editProjectBtn'),
        deleteProjectBtn: document.getElementById('deleteProjectBtn'),
        shareBtn: document.getElementById('shareBtn'),
        zipBtn: document.getElementById('zipBtn'),
        sync: document.getElementById('syncStatus'),
        avatar: document.getElementById('userAvatar'),
        userName: document.getElementById('userName'),
        projectStaleBanner: document.getElementById('projectStaleBanner'),
        reloadProjectBtn: document.getElementById('reloadProjectBtn'),
        layout: document.querySelector('.pd-layout'),
        fileList: document.getElementById('fileList'),
        emptyFiles: document.getElementById('emptyFiles'),
        addFileBtn: document.getElementById('addFileBtn'),
        dropzone: document.getElementById('dropzone'),
        addSnippetBtn: document.getElementById('addSnippetBtn'),
        fileInput: document.getElementById('fileInput'),
        viewerEmpty: document.getElementById('viewerEmpty'),
        viewerContent: document.getElementById('viewerContent'),
        fileLabel: document.getElementById('currentFileLabel'),
        fileLanguage: document.getElementById('currentFileLanguage'),
        copyFileBtn: document.getElementById('copyFileBtn'),
        downloadFileBtn: document.getElementById('downloadFileBtn'),
        renameFileBtn: document.getElementById('renameFileBtn'),
        editFileBtn: document.getElementById('editFileBtn'),
        deleteFileBtn: document.getElementById('deleteFileBtn'),
        fileLines: document.getElementById('currentFileLines'),
        fileSize: document.getElementById('currentFileSize'),
        fileUpdated: document.getElementById('currentFileUpdated'),
        fileStaleBanner: document.getElementById('fileStaleBanner'),
        reloadFileBtn: document.getElementById('reloadFileBtn'),
        codeScroll: document.getElementById('codeScroll'),
        lineNumbers: document.getElementById('lineNumbers'),
        codeBlock: document.getElementById('codeBlock'),
        editArea: document.getElementById('editArea'),
        editor: document.getElementById('fileEditor'),
        cancelEditFileBtn: document.getElementById('cancelEditFileBtn'),
        saveFileBtn: document.getElementById('saveFileBtn'),
        editModal: document.getElementById('editProjectModal'),
        editForm: document.getElementById('editProjectForm'),
        editName: document.getElementById('editProjectName'),
        editDescription: document.getElementById('editProjectDescription'),
        editClose: document.getElementById('editProjectClose'),
        editCancel: document.getElementById('editProjectCancel'),
        snippetModal: document.getElementById('snippetModal'),
        snippetRows: document.getElementById('snippetRows'),
        snippetClose: document.getElementById('snippetClose'),
        snippetCancel: document.getElementById('snippetCancel'),
        addSnippetFrame: document.getElementById('addSnippetFrame'),
        saveSnippetsBtn: document.getElementById('saveSnippetsBtn')
    };

    const LANGUAGES = [
        'auto', 'javascript', 'typescript', 'css', 'html', 'json', 'python',
        'java', 'cpp', 'c', 'csharp', 'go', 'rust', 'php', 'ruby', 'bash',
        'sql', 'markdown', 'yaml', 'xml', 'plaintext'
    ];

    function setUser() {
        if (!view.user) return;
        const name = view.user.displayName || view.user.username || view.user.id;
        els.userName.textContent = name;
        els.avatar.textContent = PC.initials(name);
        if (view.user.avatar) {
            els.avatar.style.backgroundImage = 'url("' + view.user.avatar + '")';
            els.avatar.textContent = '';
        }
    }

    function setSync(status) {
        els.sync.className = 'pc-sync ' + status;
        const label = status === 'online'
            ? t('proj.sync.online')
            : status === 'connecting'
                ? t('proj.sync.connecting')
                : t('proj.sync.offline');
        els.sync.querySelector('span:last-child').textContent = label;
    }

    function canEdit() {
        return !!(view.project && view.project.canEdit);
    }

    function renderHeader() {
        if (!view.project) return;
        const project = view.project;
        document.title = project.name + ' - CodeAI';
        els.title.textContent = project.name;
        els.description.textContent = project.description || t('project.noDescription');
        els.badge.textContent = PC.statusLabel(project);
        els.badge.className = 'pc-badge ' + PC.statusClass(project);
        els.fileCount.textContent = t('proj.files', { count: project.fileCount });
        els.size.textContent = PC.formatBytes(project.totalBytes);
        els.owner.textContent = t('project.owner') + ': ' + (project.ownerName || project.id);
        els.editProjectBtn.classList.toggle('hidden', !canEdit());
        els.deleteProjectBtn.classList.toggle('hidden', !canEdit());
        els.shareBtn.classList.toggle('hidden', !canEdit() || !!project.archived);
        els.addFileBtn.classList.toggle('hidden', !canEdit());
        els.dropzone.classList.toggle('hidden', !canEdit());
        els.addSnippetBtn.classList.toggle('hidden', !canEdit());
        els.renameFileBtn.classList.toggle('hidden', !canEdit());
        els.editFileBtn.classList.toggle('hidden', !canEdit());
        els.deleteFileBtn.classList.toggle('hidden', !canEdit());
    }

    function renderFiles() {
        els.fileList.innerHTML = view.files.map((file) => `
            <button type="button" class="pd-file-item ${view.currentFile && view.currentFile.id === file.id ? 'active' : ''}" data-file="${PC.esc(file.id)}">
                <span class="pd-file-name">${PC.esc(file.label)}</span>
                <span class="pd-file-lang">${PC.esc(file.language)}</span>
            </button>
        `).join('');
        els.emptyFiles.classList.toggle('hidden', view.files.length > 0);
        els.viewerEmpty.classList.toggle('hidden', !!view.currentFile);
        els.viewerContent.classList.toggle('hidden', !view.currentFile);
        els.layout.classList.toggle('has-file', !!view.currentFile);

        els.fileList.querySelectorAll('[data-file]').forEach((button) => {
            button.addEventListener('click', () => selectFile(button.getAttribute('data-file')));
        });
    }

    function renderCode() {
        if (!view.currentFile) return;
        const content = view.content || '';
        const language = view.currentFile.language || 'plaintext';
        els.fileLabel.textContent = view.currentFile.label;
        els.fileLanguage.textContent = language;
        els.codeBlock.className = 'hljs' + (language !== 'plaintext' ? ' language-' + language : '');
        els.codeBlock.textContent = content;
        if (window.hljs) {
            try { hljs.highlightElement(els.codeBlock); } catch (e) { /* ignore */ }
        }
        const lines = PC.lineCount(content);
        els.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        els.fileLines.textContent = t('project.file.lines', { count: lines });
        els.fileSize.textContent = PC.formatBytes(new Blob([content]).size);
        els.fileUpdated.textContent = t('proj.updated', { time: PC.relativeTime(view.currentFile.updatedAt) });
        els.fileStaleBanner.classList.toggle('hidden', !view.fileStale);
        els.codeScroll.classList.toggle('hidden', view.editing);
        els.editArea.classList.toggle('hidden', !view.editing);
    }

    function mergeFile(file) {
        const index = view.files.findIndex((item) => item.id === file.id);
        if (index >= 0) view.files[index] = Object.assign({}, view.files[index], file);
        else view.files.push(file);
    }

    function resetEditor() {
        view.editing = false;
        view.fileStale = false;
        els.editor.value = '';
        els.editArea.classList.add('hidden');
        els.codeScroll.classList.remove('hidden');
    }

    function clearCurrentFile() {
        view.currentFile = null;
        view.content = '';
        view.fileStale = false;
        resetEditor();
        renderFiles();
    }

    async function selectFile(fileId) {
        if (!fileId || view.loadingFile) return;
        const sameFile = view.currentFile && view.currentFile.id === fileId;
        if (view.editing) {
            const ok = await PC.openConfirm({
                title: t('project.file.discard.title'),
                description: t('project.file.discard.desc'),
                confirmText: t('project.file.discard.confirm'),
                danger: true
            });
            if (!ok) return;
        }
        if (sameFile) {
            clearCurrentFile();
            return;
        }
        await loadFile(fileId);
    }

    async function loadFile(fileId) {
        if (view.loadingFile) return;
        view.loadingFile = true;
        const changed = !view.currentFile || view.currentFile.id !== fileId;
        try {
            const res = await ApiProjects.file(projectId, fileId);
            view.currentFile = res.file;
            mergeFile(res.file);
            view.content = res.file.content || '';
            view.fileStale = false;
            resetEditor();
            renderFiles();
            renderCode();
            if (changed) {
                els.codeScroll.scrollTop = 0;
                els.codeScroll.scrollLeft = 0;
            }
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.fileLoad'), 'error');
        } finally {
            view.loadingFile = false;
        }
    }

    async function loadProject() {
        try {
            const res = await ApiProjects.get(projectId);
            view.project = res.project;
            view.files = res.files || [];
            if (view.currentFile) {
                const next = view.files.find((file) => file.id === view.currentFile.id);
                if (next) view.currentFile = Object.assign({}, view.currentFile, next);
                else {
                    view.currentFile = null;
                    view.content = '';
                    view.editing = false;
                    view.fileStale = false;
                }
            }
            renderHeader();
            renderFiles();
            if (view.currentFile) renderCode();
            view.projectStale = false;
            els.projectStaleBanner.classList.add('hidden');
        } catch (err) {
            if (err.status === 404 || err.status === 403) {
                els.title.textContent = t('project.notFound');
                els.viewerEmpty.innerHTML = `<p>${PC.esc(t('project.notFound'))}</p>`;
            } else {
                PC.toast(PC.apiMessage(err, 'project.error.load'), 'error');
            }
        }
    }

    function openProjectEdit() {
        if (!canEdit()) return;
        els.editName.value = view.project.name;
        els.editDescription.value = view.project.description || '';
        const radio = els.editForm.querySelector(`input[name="editVisibility"][value="${view.project.visibility}"]`);
        if (radio) radio.checked = true;
        els.editModal.classList.add('open');
        setTimeout(() => els.editName.focus(), 80);
    }

    function closeProjectEdit() {
        els.editModal.classList.remove('open');
    }

    async function submitProjectEdit(event) {
        event.preventDefault();
        if (!canEdit()) return;
        const name = els.editName.value.trim();
        if (!name) return;
        try {
            const res = await ApiProjects.update(projectId, {
                name,
                description: els.editDescription.value.trim(),
                visibility: els.editForm.querySelector('input[name="editVisibility"]:checked').value,
                version: view.project.version
            });
            view.project = res.project;
            closeProjectEdit();
            renderHeader();
            PC.toast(t('proj.toast.updated'));
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'proj.error.save'), 'error');
            if (err.code === 'version_conflict') loadProject();
        }
    }

    async function deleteProject() {
        if (!canEdit()) return;
        const ok = await PC.openConfirm({
            title: t('project.delete.title'),
            description: t('project.delete.desc'),
            confirmText: t('proj.action.delete'),
            danger: true
        });
        if (!ok) return;
        try {
            await ApiProjects.remove(projectId);
            location.href = 'projects.html';
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'proj.error.save'), 'error');
        }
    }

    function toggleFileEdit() {
        if (!view.currentFile) return;
        view.editing = !view.editing;
        if (view.editing) {
            els.editor.value = view.content;
            els.codeScroll.classList.add('hidden');
            els.editArea.classList.remove('hidden');
            setTimeout(() => els.editor.focus(), 60);
        } else {
            resetEditor();
            renderCode();
        }
    }

    async function saveFileEdit() {
        if (!view.currentFile) return;
        els.saveFileBtn.disabled = true;
        view.savingFile = true;
        try {
            const res = await ApiProjects.updateFile(projectId, view.currentFile.id, {
                content: els.editor.value,
                version: view.currentFile.version
            });
            view.currentFile = res.file;
            mergeFile(res.file);
            view.content = res.file.content;
            view.project = res.project;
            view.editing = false;
            renderHeader();
            renderFiles();
            renderCode();
            PC.toast(t('project.toast.fileUpdated'));
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
            if (err.code === 'version_conflict') {
                view.fileStale = true;
                renderCode();
            }
        } finally {
            els.saveFileBtn.disabled = false;
            view.savingFile = false;
        }
    }

    async function renameFile() {
        if (!view.currentFile || !canEdit()) return;
        const label = await PC.openPrompt({
            title: t('project.file.rename.title'),
            label: t('project.file.rename.label'),
            value: view.currentFile.label,
            confirmText: t('proj.action.save')
        });
        if (!label || label === view.currentFile.label) return;
        view.savingFile = true;
        try {
            const res = await ApiProjects.updateFile(projectId, view.currentFile.id, {
                label,
                version: view.currentFile.version
            });
            view.currentFile = res.file;
            mergeFile(res.file);
            view.content = res.file.content;
            view.project = res.project;
            renderHeader();
            renderFiles();
            renderCode();
            PC.toast(t('project.toast.fileUpdated'));
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        } finally {
            view.savingFile = false;
        }
    }

    async function deleteFile() {
        if (!view.currentFile || !canEdit()) return;
        const fileId = view.currentFile.id;
        const ok = await PC.openConfirm({
            title: t('project.file.delete.title'),
            description: t('project.file.delete.desc'),
            confirmText: t('proj.action.delete'),
            danger: true
        });
        if (!ok) return;
        try {
            await ApiProjects.removeFile(projectId, fileId);
            view.currentFile = null;
            view.content = '';
            view.editing = false;
            await loadProject();
            PC.toast(t('project.toast.fileDeleted'));
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        }
    }

    async function uploadFiles(files) {
        if (!files.length || !canEdit()) return;
        const form = new FormData();
        Array.from(files).forEach((file) => form.append('files', file));
        try {
            await ApiProjects.uploadFiles(projectId, form);
            PC.toast(t('project.toast.fileUploaded'));
            await loadProject();
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.upload'), 'error');
        } finally {
            els.fileInput.value = '';
        }
    }

    function snippetRow() {
        const row = document.createElement('div');
        row.className = 'pc-snippet-row';
        row.innerHTML = `
            <div class="pc-snippet-grid">
                <label class="pc-field">
                    <span>${PC.esc(t('project.snippet.label'))}</span>
                    <input class="pc-input snippet-label" placeholder="index.js" required>
                </label>
                <label class="pc-field">
                    <span>${PC.esc(t('project.snippet.language'))}</span>
                    <select class="pc-select snippet-language">
                        ${LANGUAGES.map((lang) => `<option value="${lang}">${lang === 'auto' ? PC.esc(t('project.snippet.auto')) : PC.esc(lang)}</option>`).join('')}
                    </select>
                </label>
            </div>
            <label class="pc-field">
                <span>${PC.esc(t('project.snippet.content'))}</span>
                <textarea class="pc-code-editor snippet-content" spellcheck="false" placeholder="${PC.esc(t('project.snippet.placeholder'))}"></textarea>
            </label>
            <button type="button" class="pc-btn pc-btn-ghost pc-btn-small snippet-remove">${PC.esc(t('project.snippet.remove'))}</button>
        `;
        row.querySelector('.snippet-remove').addEventListener('click', () => {
            if (els.snippetRows.children.length > 1) row.remove();
        });
        return row;
    }

    function addSnippetRow() {
        els.snippetRows.appendChild(snippetRow());
    }

    function openSnippetModal() {
        if (!canEdit()) return;
        els.snippetRows.innerHTML = '';
        addSnippetRow();
        els.snippetModal.classList.add('open');
        setTimeout(() => {
            const first = els.snippetRows.querySelector('.snippet-label');
            if (first) first.focus();
        }, 80);
    }

    function closeSnippetModal() {
        els.snippetModal.classList.remove('open');
    }

    async function saveSnippets() {
        const snippets = [];
        els.snippetRows.querySelectorAll('.pc-snippet-row').forEach((row) => {
            const label = row.querySelector('.snippet-label').value.trim();
            const content = row.querySelector('.snippet-content').value;
            const language = row.querySelector('.snippet-language').value;
            if (!content.trim()) return;
            snippets.push({
                label: label || 'snippet.txt',
                content,
                language: language === 'auto' ? undefined : language
            });
        });
        if (!snippets.length) {
            PC.toast(t('project.error.snippet'), 'error');
            return;
        }
        els.saveSnippetsBtn.disabled = true;
        try {
            await ApiProjects.createSnippets(projectId, snippets);
            closeSnippetModal();
            PC.toast(t('project.toast.snippetsSaved'));
            await loadProject();
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.snippet'), 'error');
        } finally {
            els.saveSnippetsBtn.disabled = false;
        }
    }

    async function downloadZip() {
        if (!view.project) return;
        PC.toast(t('project.zipPreparing'));
        try {
            await PC.download(
                '/api/projects/' + encodeURIComponent(projectId) + '/download.zip',
                view.project.name + '.zip'
            );
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        }
    }

    async function downloadCurrentFile() {
        if (!view.currentFile) return;
        try {
            await PC.download(
                '/api/projects/' + encodeURIComponent(projectId) +
                '/files/' + encodeURIComponent(view.currentFile.id) + '/raw',
                view.currentFile.label
            );
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'project.error.save'), 'error');
        }
    }

    function bindRealtime() {
        view.socket = new ProjectSocket({
            onStatus: setSync,
            onEvent: (event) => {
                if (!event || event.projectId !== projectId) return;
                if (event.type === 'project.deleted') {
                    PC.toast(t('proj.toast.deleted'), 'error');
                    setTimeout(() => { location.href = 'projects.html'; }, 900);
                    return;
                }
                if (event.type === 'share.revoked') return;
                if (view.savingFile && event.type.startsWith('file.')) return;
                if (event.version && view.project && event.version <= view.project.version) return;
                view.projectStale = true;
                els.projectStaleBanner.classList.remove('hidden');
                if (event.type === 'file.updated' && view.currentFile && event.fileId === view.currentFile.id) {
                    view.fileStale = true;
                    els.fileStaleBanner.classList.remove('hidden');
                }
                if (!view.editing) loadProject();
            }
        });
        view.socket.subscribe(projectId);
        view.socket.connect();
    }

    function bindEvents() {
        document.querySelectorAll('.pc-theme-toggle').forEach((button) => {
            button.addEventListener('click', () => CodeTheme.toggle());
        });

        els.editProjectBtn.addEventListener('click', openProjectEdit);
        els.editClose.addEventListener('click', closeProjectEdit);
        els.editCancel.addEventListener('click', closeProjectEdit);
        els.editModal.addEventListener('click', (event) => {
            if (event.target === els.editModal) closeProjectEdit();
        });
        els.editForm.addEventListener('submit', submitProjectEdit);
        els.deleteProjectBtn.addEventListener('click', deleteProject);
        els.shareBtn.addEventListener('click', () => {
            if (view.project) PC.openShareDialog(view.project, () => loadProject());
        });
        els.zipBtn.addEventListener('click', downloadZip);
        els.reloadProjectBtn.addEventListener('click', () => {
            loadProject();
        });

        els.addFileBtn.addEventListener('click', () => els.fileInput.click());
        els.dropzone.addEventListener('click', () => els.fileInput.click());
        els.fileInput.addEventListener('change', () => uploadFiles(els.fileInput.files));

        ['dragenter', 'dragover'].forEach((name) => {
            els.dropzone.addEventListener(name, (event) => {
                event.preventDefault();
                els.dropzone.classList.add('drag');
            });
        });
        ['dragleave', 'drop'].forEach((name) => {
            els.dropzone.addEventListener(name, (event) => {
                event.preventDefault();
                els.dropzone.classList.remove('drag');
            });
        });
        els.dropzone.addEventListener('drop', (event) => {
            if (event.dataTransfer && event.dataTransfer.files.length) {
                uploadFiles(event.dataTransfer.files);
            }
        });

        els.addSnippetBtn.addEventListener('click', openSnippetModal);
        els.snippetClose.addEventListener('click', closeSnippetModal);
        els.snippetCancel.addEventListener('click', closeSnippetModal);
        els.snippetModal.addEventListener('click', (event) => {
            if (event.target === els.snippetModal) closeSnippetModal();
        });
        els.addSnippetFrame.addEventListener('click', addSnippetRow);
        els.saveSnippetsBtn.addEventListener('click', saveSnippets);

        els.copyFileBtn.addEventListener('click', async () => {
            if (!view.content) return;
            if (await PC.copyText(view.content)) {
                els.copyFileBtn.textContent = t('project.file.copied');
                setTimeout(() => { els.copyFileBtn.textContent = t('project.file.copy'); }, 1400);
            }
        });
        els.downloadFileBtn.addEventListener('click', downloadCurrentFile);
        els.renameFileBtn.addEventListener('click', renameFile);
        els.editFileBtn.addEventListener('click', toggleFileEdit);
        els.deleteFileBtn.addEventListener('click', deleteFile);
        els.saveFileBtn.addEventListener('click', saveFileEdit);
        els.cancelEditFileBtn.addEventListener('click', () => {
            view.editing = false;
            resetEditor();
            renderCode();
        });
        els.reloadFileBtn.addEventListener('click', () => {
            if (view.currentFile) loadFile(view.currentFile.id);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (els.editModal.classList.contains('open')) closeProjectEdit();
                if (els.snippetModal.classList.contains('open')) closeSnippetModal();
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && view.editing) {
                event.preventDefault();
                saveFileEdit();
            }
        });
    }

    async function init() {
        applyI18n();
        view.user = await requireAuth();
        if (!view.user) return;
        setUser();
        bindEvents();
        if (!projectId) {
            els.title.textContent = t('project.notFound');
            return;
        }
        bindRealtime();
        await loadProject();
    }

    init();
})();

