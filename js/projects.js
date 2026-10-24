(function () {
    'use strict';

    const state = {
        user: null,
        projects: [],
        quota: { max: 10, used: 0, remaining: 10 },
        search: '',
        scope: 'mine',
        filter: 'active',
        sort: 'updated',
        editingId: null,
        loading: false
    };

    const els = {
        stats: document.getElementById('projectStats'),
        quota: document.getElementById('quotaBadge'),
        grid: document.getElementById('projectsGrid'),
        empty: document.getElementById('emptyState'),
        search: document.getElementById('projectSearch'),
        sort: document.getElementById('projectSort'),
        scope: document.getElementById('projectScope'),
        tabs: document.getElementById('filterTabs'),
        newBtn: document.getElementById('newProjectBtn'),
        emptyCreate: document.getElementById('emptyCreateBtn'),
        emptyTitle: document.getElementById('emptyTitle'),
        emptyDesc: document.getElementById('emptyDesc'),
        modal: document.getElementById('projectModal'),
        form: document.getElementById('projectForm'),
        modalTitle: document.getElementById('projectModalTitle'),
        modalClose: document.getElementById('projectModalClose'),
        modalCancel: document.getElementById('projectModalCancel'),
        fieldName: document.getElementById('projectName'),
        fieldDescription: document.getElementById('projectDescription'),
        quotaHint: document.getElementById('quotaHint'),
        submit: document.getElementById('projectSubmitBtn'),
        avatar: document.getElementById('userAvatar'),
        userName: document.getElementById('userName')
    };

    const reload = PC.debounce(() => load(), 350);

    function bindTheme() {
        document.querySelectorAll('.pc-theme-toggle').forEach((button) => {
            button.addEventListener('click', () => {
                CodeTheme.toggle();
            });
        });
    }

    function setTopbarUser() {
        if (!state.user) return;
        const name = state.user.displayName || state.user.username || state.user.id;
        els.userName.textContent = name;
        els.avatar.textContent = PC.initials(name);
        if (state.user.avatar) {
            els.avatar.style.backgroundImage = 'url("' + state.user.avatar + '")';
            els.avatar.textContent = '';
        }
    }

    function counts() {
        const all = state.projects;
        return {
            total: all.length,
            public: all.filter((item) => item.state === 'public').length,
            private: all.filter((item) => item.state === 'private').length,
            archived: all.filter((item) => item.state === 'archived').length
        };
    }

    function updateHeader() {
        const c = counts();
        els.stats.textContent = state.scope === 'public'
            ? t('proj.subtitle.public', { count: state.projects.length })
            : t('proj.subtitle', {
                count: c.total,
                public: c.public,
                private: c.private,
                archived: c.archived
            });
        els.quota.textContent = t('proj.quota', {
            used: state.quota.used,
            max: state.quota.max
        });
        const full = state.quota.remaining <= 0;
        els.newBtn.disabled = full;
        els.emptyCreate.disabled = full;
        els.newBtn.title = full ? t('proj.limitHint') : '';
        els.quota.classList.toggle('is-full', full);
    }

    function filteredProjects() {
        const q = state.search.trim().toLocaleLowerCase();
        let list = state.scope === 'public'
            ? state.projects.slice()
            : state.projects.filter((project) => {
                if (state.filter === 'active') return project.state !== 'archived';
                return project.state === state.filter;
            });
        if (q) {
            list = list.filter((project) => project.name.toLocaleLowerCase().includes(q));
        }
        list.sort((a, b) => {
            if (state.sort === 'name') return a.name.localeCompare(b.name);
            if (state.sort === 'created') return b.createdAt - a.createdAt;
            return b.updatedAt - a.updatedAt;
        });
        return list;
    }

    function renderCard(project) {
        const description = project.description
            ? project.description
            : t('proj.noDescription');
        const menu = project.canEdit ? `
            <div class="pc-card-menu-wrap">
                <button type="button" class="pc-icon-btn pc-card-menu-btn" data-menu aria-label="Menu">...</button>
                <div class="pc-card-menu">
                    <button type="button" data-action="open">${PC.esc(t('proj.menu.open'))}</button>
                    <button type="button" data-action="edit">${PC.esc(t('proj.menu.edit'))}</button>
                    ${project.archived ? '' : `<button type="button" data-action="share">${PC.esc(t('proj.menu.share'))}</button>`}
                    <button type="button" data-action="${project.archived ? 'unarchive' : 'archive'}">${PC.esc(t(project.archived ? 'proj.menu.unarchive' : 'proj.menu.archive'))}</button>
                    <button type="button" class="danger" data-action="delete">${PC.esc(t('proj.menu.delete'))}</button>
                </div>
            </div>
        ` : '';
        return `
            <article class="pc-project-card ${PC.statusClass(project)}" data-id="${PC.esc(project.id)}">
                <div class="pc-card-top">
                    <span class="pc-badge ${PC.statusClass(project)}">${PC.esc(PC.statusLabel(project))}</span>
                    ${menu}
                </div>
                <h2>${PC.esc(project.name)}</h2>
                <p class="pc-card-desc">${PC.esc(description)}</p>
                <div class="pc-card-meta">
                    <span>${PC.esc(t('proj.files', { count: project.fileCount }))}</span>
                    <span>${PC.esc(PC.formatBytes(project.totalBytes))}</span>
                </div>
                <div class="pc-card-foot">
                    <span>${PC.esc(t('proj.updated', { time: PC.relativeTime(project.updatedAt) }))}</span>
                    <span class="pc-card-arrow">→</span>
                </div>
            </article>
        `;
    }

    function render() {
        const list = filteredProjects();
        const publicScope = state.scope === 'public';
        els.grid.innerHTML = list.map(renderCard).join('');
        els.empty.classList.toggle('hidden', list.length > 0);
        els.tabs.classList.toggle('hidden', publicScope);
        els.emptyTitle.textContent = t(publicScope ? 'proj.empty.public.title' : 'proj.empty.title');
        els.emptyDesc.textContent = t(publicScope ? 'proj.empty.public.desc' : 'proj.empty.desc');
        updateHeader();

        els.grid.querySelectorAll('.pc-project-card').forEach((card) => {
            const id = card.getAttribute('data-id');
            const project = state.projects.find((item) => item.id === id);
            if (!project) return;

            card.addEventListener('click', (event) => {
                if (event.target.closest('.pc-card-menu-wrap')) return;
                location.href = 'project.html?id=' + encodeURIComponent(id);
            });

            const menu = card.querySelector('.pc-card-menu');
            const menuBtn = card.querySelector('[data-menu]');
            if (!menu || !menuBtn) return;

            menuBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                document.querySelectorAll('.pc-card-menu.open').forEach((other) => {
                    if (other !== menu) other.classList.remove('open');
                });
                menu.classList.toggle('open');
            });

            menu.querySelectorAll('[data-action]').forEach((button) => {
                button.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    menu.classList.remove('open');
                    await handleAction(project, button.getAttribute('data-action'));
                });
            });
        });
    }

    async function handleAction(project, action) {
        if (!project.canEdit && action !== 'open') return;
        if (action === 'open') {
            location.href = 'project.html?id=' + encodeURIComponent(project.id);
            return;
        }
        if (action === 'edit') {
            openProjectModal(project);
            return;
        }
        if (action === 'share') {
            PC.openShareDialog(project, load);
            return;
        }
        if (action === 'archive' || action === 'unarchive') {
            const archived = action === 'archive';
            const ok = await PC.openConfirm({
                title: t(archived ? 'proj.confirm.archive.title' : 'proj.confirm.unarchive.title'),
                description: t(archived ? 'proj.confirm.archive.desc' : 'proj.confirm.unarchive.desc'),
                confirmText: t(archived ? 'proj.menu.archive' : 'proj.menu.unarchive'),
                danger: archived
            });
            if (!ok) return;
            try {
                if (archived) await ApiProjects.archive(project.id, { version: project.version });
                else await ApiProjects.unarchive(project.id, { version: project.version });
                PC.toast(t(archived ? 'proj.toast.archived' : 'proj.toast.unarchived'));
                load();
            } catch (err) {
                PC.toast(PC.apiMessage(err, 'proj.error.save'), 'error');
                load();
            }
            return;
        }
        if (action === 'delete') {
            const ok = await PC.openConfirm({
                title: t('proj.confirm.delete.title'),
                description: t('proj.confirm.delete.desc'),
                confirmText: t('proj.action.delete'),
                danger: true
            });
            if (!ok) return;
            try {
                await ApiProjects.remove(project.id);
                PC.toast(t('proj.toast.deleted'));
                load();
            } catch (err) {
                PC.toast(PC.apiMessage(err, 'proj.error.save'), 'error');
            }
        }
    }

    function openProjectModal(project) {
        state.editingId = project ? project.id : null;
        els.form.reset();
        els.modalTitle.textContent = t(project ? 'proj.modal.edit.title' : 'proj.modal.new.title');
        els.submit.textContent = t(project ? 'proj.action.save' : 'proj.action.create');
        els.fieldName.value = project ? project.name : '';
        els.fieldDescription.value = project ? project.description : '';
        const visibility = project ? project.visibility : 'private';
        const radio = els.form.querySelector(`input[name="visibility"][value="${visibility}"]`);
        if (radio) radio.checked = true;
        els.quotaHint.textContent = state.quota.remaining > 0
            ? t('proj.quotaRemaining', { remaining: state.quota.remaining, max: state.quota.max })
            : t('proj.limitHint');
        els.modal.classList.add('open');
        setTimeout(() => els.fieldName.focus(), 80);
    }

    function closeProjectModal() {
        els.modal.classList.remove('open');
        state.editingId = null;
    }

    async function submitProject(event) {
        event.preventDefault();
        const name = els.fieldName.value.trim();
        if (!name) {
            els.fieldName.focus();
            return;
        }
        const payload = {
            name,
            description: els.fieldDescription.value.trim(),
            visibility: els.form.querySelector('input[name="visibility"]:checked').value
        };
        els.submit.disabled = true;
        try {
            if (state.editingId) {
                const current = state.projects.find((item) => item.id === state.editingId);
                payload.version = current ? current.version : undefined;
                await ApiProjects.update(state.editingId, payload);
                PC.toast(t('proj.toast.updated'));
            } else {
                await ApiProjects.create(payload);
                PC.toast(t('proj.toast.created'));
            }
            closeProjectModal();
            await load();
        } catch (err) {
            if (err.code === 'project_limit_reached') {
                PC.toast(t('proj.error.limit'), 'error');
            } else {
                PC.toast(PC.apiMessage(err, 'proj.error.save'), 'error');
            }
        } finally {
            els.submit.disabled = false;
        }
    }

    async function load() {
        if (state.loading) return;
        state.loading = true;
        try {
            const res = await ApiProjects.list({ state: 'all', scope: state.scope, limit: 100 });
            state.projects = res.projects || [];
            state.quota = res.quota || { max: 10, used: state.projects.length, remaining: 0 };
            render();
        } catch (err) {
            PC.toast(PC.apiMessage(err, 'proj.error.load'), 'error');
        } finally {
            state.loading = false;
        }
    }

    function bindFilters() {
        els.search.addEventListener('input', PC.debounce(() => {
            state.search = els.search.value;
            render();
        }, 160));

        els.sort.addEventListener('change', () => {
            state.sort = els.sort.value;
            render();
        });

        els.scope.addEventListener('change', () => {
            state.scope = els.scope.value;
            state.filter = 'active';
            els.tabs.querySelectorAll('button').forEach((item) => {
                item.classList.toggle('active', item.getAttribute('data-state') === 'active');
            });
            load();
        });

        els.tabs.querySelectorAll('button').forEach((button) => {
            button.addEventListener('click', () => {
                els.tabs.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                state.filter = button.getAttribute('data-state');
                render();
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.pc-card-menu.open').forEach((menu) => menu.classList.remove('open'));
        });
    }

    function bindModal() {
        els.newBtn.addEventListener('click', () => openProjectModal(null));
        els.emptyCreate.addEventListener('click', () => openProjectModal(null));
        els.modalClose.addEventListener('click', closeProjectModal);
        els.modalCancel.addEventListener('click', closeProjectModal);
        els.modal.addEventListener('click', (event) => {
            if (event.target === els.modal) closeProjectModal();
        });
        els.form.addEventListener('submit', submitProject);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && els.modal.classList.contains('open')) closeProjectModal();
        });
    }

    function bindRealtime() {
        if (!getToken()) return;
        const socket = new ProjectSocket({
            onEvent: (event) => {
                const type = String(event.type || '');
                if (type.startsWith('project.') || type.startsWith('file.')) reload();
            }
        });
        socket.connect();
    }

    async function init() {
        applyI18n();
        bindTheme();
        state.user = await requireAuth();
        if (!state.user) return;
        setTopbarUser();
        bindFilters();
        bindModal();
        bindRealtime();
        await load();
    }

    init();
})();
