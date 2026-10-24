(function () {
    'use strict';

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.0', '') + ' KB';
        return (n / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
    }

    function relativeTime(ms) {
        const diff = Number(ms) - Date.now();
        const abs = Math.abs(diff);
        if (abs < 45000) return getLang() === 'en' ? 'just now' : 'vừa xong';
        const units = [
            ['year', 365 * 24 * 3600 * 1000],
            ['month', 30 * 24 * 3600 * 1000],
            ['day', 24 * 3600 * 1000],
            ['hour', 3600 * 1000],
            ['minute', 60 * 1000]
        ];
        try {
            const rtf = new Intl.RelativeTimeFormat(getLang() === 'en' ? 'en' : 'vi', { numeric: 'auto' });
            for (let i = 0; i < units.length; i++) {
                const unit = units[i][0];
                const size = units[i][1];
                if (abs >= size || unit === 'minute') {
                    return rtf.format(Math.round(diff / size), unit);
                }
            }
        } catch (e) { /* ignore */ }
        return new Date(ms).toLocaleString();
    }

    function formatDate(ms) {
        if (!ms) return '';
        try {
            return new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'vi-VN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(new Date(ms));
        } catch (e) {
            return new Date(ms).toLocaleString();
        }
    }

    function statusLabel(project) {
        return t('proj.status.' + (project.state || project.visibility || 'private'));
    }

    function statusClass(project) {
        return 'is-' + (project.state || project.visibility || 'private');
    }

    function initials(name) {
        const parts = String(name || '?').trim().split(/\s+/);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function toast(message, type) {
        let el = document.getElementById('pcToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'pcToast';
            el.className = 'pc-toast';
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.className = 'pc-toast show' + (type ? ' ' + type : '');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => el.classList.remove('show'), 3400);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
            area.remove();
            return ok;
        }
    }

    function closeModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 180);
    }

    function openConfirm(options) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'pc-modal-backdrop open';
            overlay.innerHTML = `
                <div class="pc-modal pc-confirm" role="dialog" aria-modal="true">
                    <div class="pc-modal-head">
                        <h2>${esc(options.title || '')}</h2>
                        <button type="button" class="pc-icon-btn pc-modal-close" aria-label="Close">×</button>
                    </div>
                    <div class="pc-modal-body">
                        <p class="pc-confirm-text">${esc(options.description || '')}</p>
                    </div>
                    <div class="pc-modal-foot">
                        <button type="button" class="pc-btn pc-btn-ghost pc-cancel">${esc(options.cancelText || t('proj.action.cancel'))}</button>
                        <button type="button" class="pc-btn ${options.danger ? 'pc-btn-danger' : 'pc-btn-primary'} pc-confirm-ok">${esc(options.confirmText || t('proj.action.delete'))}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const finish = (value) => {
                closeModal(overlay);
                resolve(value);
            };
            overlay.querySelector('.pc-modal-close').addEventListener('click', () => finish(false));
            overlay.querySelector('.pc-cancel').addEventListener('click', () => finish(false));
            overlay.querySelector('.pc-confirm-ok').addEventListener('click', () => finish(true));
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) finish(false);
            });
        });
    }

    function openPrompt(options) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'pc-modal-backdrop open';
            overlay.innerHTML = `
                <div class="pc-modal pc-prompt" role="dialog" aria-modal="true">
                    <div class="pc-modal-head">
                        <h2>${esc(options.title || '')}</h2>
                        <button type="button" class="pc-icon-btn pc-modal-close" aria-label="Close">×</button>
                    </div>
                    <div class="pc-modal-body">
                        <label class="pc-field">
                            <span>${esc(options.label || '')}</span>
                            <input class="pc-input pc-prompt-input" value="${esc(options.value || '')}" maxlength="${options.maxlength || 255}">
                        </label>
                    </div>
                    <div class="pc-modal-foot">
                        <button type="button" class="pc-btn pc-btn-ghost pc-cancel">${esc(options.cancelText || t('proj.action.cancel'))}</button>
                        <button type="button" class="pc-btn pc-btn-primary pc-confirm-ok">${esc(options.confirmText || t('proj.action.save'))}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('.pc-prompt-input');
            const finish = (value) => {
                closeModal(overlay);
                resolve(value);
            };
            overlay.querySelector('.pc-modal-close').addEventListener('click', () => finish(null));
            overlay.querySelector('.pc-cancel').addEventListener('click', () => finish(null));
            overlay.querySelector('.pc-confirm-ok').addEventListener('click', () => finish(input.value.trim()));
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) finish(null);
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(input.value.trim());
                }
            });
            setTimeout(() => {
                input.focus();
                input.select();
            }, 60);
        });
    }

    function authHeaders() {
        const token = getToken();
        return token ? { Authorization: 'Bearer ' + token } : {};
    }

    async function download(url, filename, headers) {
        const res = await fetch(url, { headers: headers || authHeaders() });
        if (!res.ok) {
            let data = null;
            try { data = await res.json(); } catch (e) { /* ignore */ }
            const err = new Error((data && data.message) || 'download_failed');
            err.code = (data && data.error) || 'download_failed';
            err.status = res.status;
            throw err;
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
    }

    function apiMessage(err, fallbackKey) {
        if (err && err.data && err.data.message) return err.data.message;
        if (err && err.code === 'project_limit_reached') return t('proj.error.limit');
        if (err && err.code === 'network') return t('proj.error.network');
        return t(fallbackKey || 'proj.error.save');
    }

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            const args = arguments;
            const self = this;
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(self, args), wait);
        };
    }

    function lineCount(text) {
        if (!text) return 0;
        return String(text).split('\n').length;
    }

    function openShareDialog(project, onChanged) {
        const overlay = document.createElement('div');
        overlay.className = 'pc-modal-backdrop open';
        overlay.innerHTML = `
            <div class="pc-modal pc-share-modal" role="dialog" aria-modal="true">
                <div class="pc-modal-head">
                    <div>
                        <h2>${esc(t('proj.share.title'))}</h2>
                        <p class="pc-modal-sub">${esc(t('proj.share.desc'))}</p>
                    </div>
                    <button type="button" class="pc-icon-btn pc-modal-close" aria-label="Close">×</button>
                </div>
                <div class="pc-modal-body">
                    <div class="pc-share-create">
                        <label>
                            <span>${esc(t('proj.share.expires'))}</span>
                            <select class="pc-select share-expiry">
                                <option value="7">${esc(t('proj.share.expire7'))}</option>
                                <option value="30" selected>${esc(t('proj.share.expire30'))}</option>
                                <option value="90">${esc(t('proj.share.expire90'))}</option>
                                <option value="0">${esc(t('proj.share.never'))}</option>
                            </select>
                        </label>
                        <button type="button" class="pc-btn pc-btn-primary share-create">${esc(t('proj.share.create'))}</button>
                    </div>
                    <div class="pc-share-result hidden">
                        <p class="pc-share-hint">${esc(t('proj.share.linkHint'))}</p>
                        <div class="pc-copy-row">
                            <input class="pc-input share-url" readonly>
                            <button type="button" class="pc-btn pc-btn-ghost share-copy">${esc(t('proj.share.copy'))}</button>
                        </div>
                    </div>
                    <div class="pc-share-list-wrap">
                        <h3>${esc(t('proj.share.title'))}</h3>
                        <div class="pc-share-list"><p class="pc-muted">${esc(t('proj.share.loading'))}</p></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => closeModal(overlay);
        overlay.querySelector('.pc-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });

        async function load() {
            const list = overlay.querySelector('.pc-share-list');
            try {
                const res = await ApiProjects.shares(project.id);
                if (!res.shares.length) {
                    list.innerHTML = `<p class="pc-muted">${esc(t('proj.share.noLinks'))}</p>`;
                    return;
                }
                list.innerHTML = res.shares.map((item) => {
                    const status = item.active ? t('proj.share.active') : (item.revokedAt ? t('proj.share.revoked') : t('proj.share.expired'));
                    return `
                        <div class="pc-share-item">
                            <div>
                                <span class="pc-share-status ${item.active ? 'active' : 'inactive'}">${esc(status)}</span>
                                <p>${esc(t('proj.share.createdAt', { time: formatDate(item.createdAt) }))}</p>
                                <p>${item.expiresAt ? esc(t('proj.share.expiresAt', { time: formatDate(item.expiresAt) })) : esc(t('proj.share.never'))}</p>
                                <p>${esc(t('proj.share.access', { count: item.accessCount || 0 }))}</p>
                            </div>
                            ${item.active ? `<button type="button" class="pc-btn pc-btn-ghost pc-btn-small" data-revoke="${esc(item.id)}">${esc(t('proj.share.revoke'))}</button>` : ''}
                        </div>
                    `;
                }).join('');
                list.querySelectorAll('[data-revoke]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const ok = await openConfirm({
                            title: t('proj.share.revoke'),
                            description: t('proj.share.desc'),
                            confirmText: t('proj.share.revoke'),
                            danger: true
                        });
                        if (!ok) return;
                        try {
                            await ApiProjects.revokeShare(project.id, btn.getAttribute('data-revoke'));
                            toast(t('proj.toast.updated'));
                            load();
                            if (onChanged) onChanged();
                        } catch (err) {
                            toast(apiMessage(err, 'proj.error.save'), 'error');
                        }
                    });
                });
            } catch (err) {
                list.innerHTML = `<p class="pc-error-text">${esc(apiMessage(err, 'proj.error.load'))}</p>`;
            }
        }

        overlay.querySelector('.share-create').addEventListener('click', async () => {
            const btn = overlay.querySelector('.share-create');
            const days = Number(overlay.querySelector('.share-expiry').value);
            btn.disabled = true;
            try {
                const res = await ApiProjects.createShare(project.id, { expiresInDays: days });
                const result = overlay.querySelector('.pc-share-result');
                result.classList.remove('hidden');
                result.querySelector('.share-url').value = res.url;
                toast(t('proj.share.createdAt', { time: formatDate(res.share.createdAt) }));
                load();
                if (onChanged) onChanged();
            } catch (err) {
                toast(apiMessage(err, 'proj.error.save'), 'error');
            } finally {
                btn.disabled = false;
            }
        });

        overlay.querySelector('.share-copy').addEventListener('click', async () => {
            const value = overlay.querySelector('.share-url').value;
            if (await copyText(value)) toast(t('proj.toast.linkCopied'));
        });

        load();
    }

    window.PC = {
        esc,
        formatBytes,
        relativeTime,
        formatDate,
        statusLabel,
        statusClass,
        initials,
        toast,
        copyText,
        openConfirm,
        openPrompt,
        closeModal,
        openShareDialog,
        authHeaders,
        download,
        apiMessage,
        debounce,
        lineCount
    };
})();
