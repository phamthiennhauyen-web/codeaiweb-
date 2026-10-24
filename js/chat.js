(function () {
    'use strict';

    const STORAGE_PREFIX = 'codeai_chat_';
    const THEME_KEY = 'codeai_chat_theme';
    const SHOW_THINKING_KEY = 'codeai_chat_show_thinking';
    const MAX_ATTACHMENTS = 6;
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_TEXT_BYTES = 200 * 1024;
    const MAX_CONTEXT_MESSAGES = 30;
    const MAX_STORE_CHARS = 3800000;

    const SVG = {
        assistant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };

    const SLASH_COMMANDS = [
        { command: '/clear', label: 'chat.cmd.clear', description: 'chat.cmd.clear.desc' },
        { command: '/token', label: 'chat.cmd.token', description: 'chat.cmd.token.desc' },
        { command: '/ping', label: 'chat.cmd.ping', description: 'chat.cmd.ping.desc' }
    ];

    const $ = function (id) { return document.getElementById(id); };

    const dom = {
        app: $('chatApp'),
        messages: $('chatMessages'),
        messageList: $('messageList'),
        empty: $('chatEmpty'),
        tabList: $('chatTabList'),
        newChatBtn: $('newChatBtn'),
        modelManagerBtn: $('modelManagerBtn'),
        sidebarModelName: $('sidebarModelName'),
        sidebar: $('chatSidebar'),
        sidebarBackdrop: $('sidebarBackdrop'),
        sidebarToggle: $('sidebarToggle'),
        backBtn: $('backBtn'),
        logoutBtn: $('logoutBtn'),
        settingsBtn: $('settingsBtn'),
        settingsModal: $('settingsModal'),
        settingsTheme: $('settingsTheme'),
        showThinkingToggle: $('showThinkingToggle'),
        themeToggle: $('themeToggle'),
        userName: $('chatUserName'),
        userAvatar: $('chatUserAvatar'),
        input: $('promptInput'),
        slashMenu: $('slashMenu'),
        attachBtn: $('attachBtn'),
        attachInput: $('attachInput'),
        attachmentList: $('attachmentList'),
        modelBtn: $('modelBtn'),
        modelBtnLabel: $('modelBtnLabel'),
        modelDot: document.querySelector('.chat-model-dot'),
        sendBtn: $('sendBtn'),
        composerModelHint: $('composerModelHint'),
        scrollBottomBtn: $('scrollBottomBtn'),
        suggestions: $('chatSuggestions'),
        picker: $('modelPicker'),
        pickerList: $('pickerList'),
        pickerManage: $('pickerManage'),
        modelModal: $('modelModal'),
        modelTabs: $('modelTabs'),
        singleList: $('singleList'),
        groupList: $('groupList'),
        addSingleBtn: $('addSingleBtn'),
        addGroupBtn: $('addGroupBtn'),
        modelEditModal: $('modelEditModal'),
        modelForm: $('modelForm'),
        modelEditTitle: $('modelEditTitle'),
        modelEditKind: $('modelEditKind'),
        modelEditId: $('modelEditId'),
        modelEditGroupId: $('modelEditGroupId'),
        modelName: $('modelName'),
        modelBaseUrl: $('modelBaseUrl'),
        modelApiKey: $('modelApiKey'),
        toggleKey: $('toggleKey'),
        modelModelId: $('modelModelId'),
        modelIdOptions: $('modelIdOptions'),
        fetchModelsBtn: $('fetchModelsBtn'),
        modelAuthMode: $('modelAuthMode'),
        modelExtraHeaders: $('modelExtraHeaders'),
        modelFormError: $('modelFormError'),
        modelSubmitBtn: $('modelSubmitBtn'),
        confirmModal: $('confirmModal'),
        confirmTitle: $('confirmTitle'),
        confirmText: $('confirmText'),
        confirmCancel: $('confirmCancel'),
        confirmOk: $('confirmOk'),
        toast: $('chatToast')
    };

    let state = null;
    let userId = null;
    let storeKey = '';
    let saveTimer = null;
    let toastTimer = null;
    let streaming = false;
    let abortController = null;
    let streamTab = null;
    let streamMessage = null;
    let streamPaintTimer = null;
    let lastPaintAt = 0;
    let pendingAttachments = [];
    let confirmAction = null;
    let pickerOpen = false;
    let showThinking = false;
    let slashIndex = 0;
    let slashItems = [];
    const testResults = {};

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function initials(name) {
        const text = String(name || '?').trim();
        const parts = text.split(/\s+/).filter(Boolean);
        if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return text.slice(0, 2).toUpperCase() || '?';
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function makeTitle(text) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return t('chat.new');
        return clean.length > 44 ? clean.slice(0, 44) + '…' : clean;
    }

    function numberLabel(value) {
        const number = Math.max(0, Math.round(Number(value) || 0));
        try {
            return number.toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-US');
        } catch (e) {
            return String(number);
        }
    }

    function estimateTokens(value) {
        const text = String(value || '');
        if (!text) return 0;
        const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
        const ascii = text.length - nonAscii;
        return Math.ceil(ascii / 4 + nonAscii / 1.5);
    }

    function estimateMessageTokens(messages) {
        let total = 0;
        (messages || []).forEach(function (message) {
            if (!message || typeof message !== 'object') return;
            if (typeof message.content === 'string') {
                total += estimateTokens(message.content);
            } else if (Array.isArray(message.content)) {
                message.content.forEach(function (part) {
                    if (!part || typeof part !== 'object') return;
                    if (part.type === 'image_url') total += 85;
                    else total += estimateTokens(part.text || '');
                });
            }
        });
        return total;
    }

    function emptyUsage() {
        return { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0, estimated: false };
    }

    function normalizeUsage(raw) {
        const usage = raw && typeof raw === 'object' ? raw : {};
        const promptTokens = Math.max(0, Number(usage.promptTokens ?? usage.prompt_tokens) || 0);
        const completionTokens = Math.max(0, Number(usage.completionTokens ?? usage.completion_tokens) || 0);
        let totalTokens = Math.max(0, Number(usage.totalTokens ?? usage.total_tokens) || 0);
        if (!totalTokens) totalTokens = promptTokens + completionTokens;
        return {
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: totalTokens,
            requests: Math.max(0, Number(usage.requests) || 0),
            estimated: !!usage.estimated
        };
    }

    function usageFromApi(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const promptTokens = Number(raw.prompt_tokens ?? raw.input_tokens ?? raw.promptTokens) || 0;
        const completionTokens = Number(raw.completion_tokens ?? raw.output_tokens ?? raw.completionTokens) || 0;
        let totalTokens = Number(raw.total_tokens ?? raw.totalTokens) || 0;
        if (!totalTokens) totalTokens = promptTokens + completionTokens;
        if (!promptTokens && !completionTokens && !totalTokens) return null;
        return { promptTokens: promptTokens, completionTokens: completionTokens, totalTokens: totalTokens };
    }

    function recordUsage(tab, usage, estimated) {
        if (!tab || !usage) return;
        const current = tab.usage || emptyUsage();
        current.promptTokens += Math.max(0, Number(usage.promptTokens) || 0);
        current.completionTokens += Math.max(0, Number(usage.completionTokens) || 0);
        current.totalTokens += Math.max(0, Number(usage.totalTokens) || 0);
        current.requests += Math.max(1, Number(usage.requests) || 1);
        current.estimated = current.estimated || !!estimated;
        tab.usage = current;
    }

    function estimateTabUsage(tab) {
        const usage = emptyUsage();
        usage.estimated = true;
        (tab.messages || []).forEach(function (message) {
            if (!message) return;
            if (message.role === 'user') {
                usage.promptTokens += estimateTokens(message.content);
                (message.attachments || []).forEach(function (attachment) {
                    if (attachment.kind === 'text') usage.promptTokens += estimateTokens(attachment.text);
                    else if (attachment.kind === 'image') usage.promptTokens += 85;
                });
            } else {
                usage.completionTokens += estimateTokens(message.content) + estimateTokens(message.thinking);
                usage.requests += 1;
            }
        });
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
        return usage;
    }

    function activeTab() {
        if (!state) return null;
        return state.tabs.find(function (tab) { return tab.id === state.activeTabId; }) || state.tabs[0] || null;
    }

    function findSingle(id) {
        return state.models.singles.find(function (model) { return model.id === id; }) || null;
    }

    function findGroup(id) {
        return state.models.groups.find(function (group) { return group.id === id; }) || null;
    }

    function isRef(ref) {
        if (!ref || typeof ref !== 'object') return false;
        if (ref.kind === 'single') return typeof ref.id === 'string' && !!ref.id;
        if (ref.kind === 'group') return typeof ref.groupId === 'string' && typeof ref.id === 'string' && !!ref.id && !!ref.groupId;
        return false;
    }

    function refKey(ref) {
        if (!isRef(ref)) return '';
        return ref.kind === 'single' ? 's:' + ref.id : 'g:' + ref.groupId + ':' + ref.id;
    }

    function resolveRef(ref) {
        if (!isRef(ref)) return null;
        if (ref.kind === 'single') {
            const model = findSingle(ref.id);
            if (!model) return null;
            return {
                kind: 'single',
                id: model.id,
                name: model.name,
                baseUrl: model.baseUrl,
                apiKey: model.apiKey,
                authMode: model.authMode,
                extraHeaders: model.extraHeaders,
                modelId: model.modelId
            };
        }
        const group = findGroup(ref.groupId);
        if (!group) return null;
        const child = group.models.find(function (model) { return model.id === ref.id; });
        if (!child) return null;
        return {
            kind: 'group',
            groupId: group.id,
            id: child.id,
            name: child.name,
            baseUrl: group.baseUrl,
            apiKey: group.apiKey,
            authMode: group.authMode,
            extraHeaders: group.extraHeaders,
            modelId: child.modelId
        };
    }

    function modelName(ref) {
        const model = resolveRef(ref);
        return model ? model.name : '';
    }

    function currentModelRef() {
        const tab = activeTab();
        if (tab && isRef(tab.model) && resolveRef(tab.model)) return tab.model;
        if (state && isRef(state.activeModel) && resolveRef(state.activeModel)) return state.activeModel;
        return null;
    }

    function toast(message) {
        if (!message) return;
        dom.toast.textContent = message;
        dom.toast.classList.remove('hidden');
        dom.toast.style.animation = 'none';
        void dom.toast.offsetWidth;
        dom.toast.style.animation = '';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { dom.toast.classList.add('hidden'); }, 3400);
    }

    function openModal(id) {
        const el = $(id);
        if (el) el.classList.remove('hidden');
    }

    function closeModal(id) {
        const el = $(id);
        if (el) el.classList.add('hidden');
    }

    function showFormError(message) {
        dom.modelFormError.textContent = message || '';
        dom.modelFormError.classList.toggle('hidden', !message);
    }

    function askConfirm(title, text, onConfirm) {
        dom.confirmTitle.textContent = title;
        dom.confirmText.textContent = text;
        confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
        openModal('confirmModal');
    }

    function syncThemeSettings() {
        if (!dom.settingsTheme) return;
        const light = document.documentElement.classList.contains('chat-light');
        dom.settingsTheme.querySelectorAll('[data-chat-theme]').forEach(function (button) {
            button.classList.toggle('active', button.getAttribute('data-chat-theme') === (light ? 'light' : 'dark'));
        });
    }

    function applyChatTheme(theme) {
        const light = theme === 'light';
        document.documentElement.classList.toggle('chat-light', light);
        document.documentElement.classList.toggle('chat-dark', !light);
        syncThemeSettings();
    }

    function setChatTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { }
        applyChatTheme(next);
    }

    function toggleChatTheme() {
        const light = document.documentElement.classList.contains('chat-light');
        setChatTheme(light ? 'dark' : 'light');
    }

    function syncThinkingSetting() {
        if (dom.showThinkingToggle) dom.showThinkingToggle.checked = showThinking;
    }

    function setShowThinking(value) {
        showThinking = !!value;
        try { localStorage.setItem(SHOW_THINKING_KEY, showThinking ? '1' : '0'); } catch (e) { }
        syncThinkingSetting();
        if (streaming) paintStreaming();
        else renderMessages('bottom');
    }

    function openSettings() {
        syncThemeSettings();
        syncThinkingSetting();
        openModal('settingsModal');
    }

    function makeTab(title) {
        return {
            id: uid(),
            title: title || t('chat.new'),
            autoTitle: !title,
            pinned: false,
            pinnedAt: 0,
            model: currentModelRef(),
            draft: '',
            messages: [],
            usage: emptyUsage(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            scrollTop: 0
        };
    }

    function newTabTitle() {
        const base = t('chat.new');
        if (!state) return base;
        const count = state.tabs.filter(function (tab) {
            return tab.title === base || tab.title.indexOf(base + ' ') === 0;
        }).length;
        return count ? base + ' ' + (count + 1) : base;
    }

    function normalizeAttachment(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const kind = raw.kind === 'image' || raw.kind === 'text' ? raw.kind : 'file';
        return {
            id: typeof raw.id === 'string' ? raw.id : uid(),
            kind: kind,
            name: typeof raw.name === 'string' ? raw.name : 'file',
            type: typeof raw.type === 'string' ? raw.type : '',
            size: Number(raw.size) || 0,
            ts: Number(raw.ts) || Date.now(),
            dataUrl: typeof raw.dataUrl === 'string' ? raw.dataUrl : '',
            text: typeof raw.text === 'string' ? raw.text : '',
            expired: !!raw.expired
        };
    }

    function normalizeMessage(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            id: typeof raw.id === 'string' ? raw.id : uid(),
            role: raw.role === 'assistant' ? 'assistant' : 'user',
            content: typeof raw.content === 'string' ? raw.content : '',
            thinking: typeof raw.thinking === 'string' ? raw.thinking : '',
            ts: Number(raw.ts) || Date.now(),
            attachments: Array.isArray(raw.attachments)
                ? raw.attachments.map(normalizeAttachment).filter(Boolean)
                : [],
            stopped: !!raw.stopped,
            error: !!raw.error
        };
    }

    function normalizeTab(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            id: typeof raw.id === 'string' ? raw.id : uid(),
            title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : t('chat.new'),
            autoTitle: raw.autoTitle !== false,
            pinned: !!raw.pinned,
            pinnedAt: Number(raw.pinnedAt) || 0,
            model: isRef(raw.model) ? { kind: raw.model.kind, id: raw.model.id, groupId: raw.model.groupId } : null,
            draft: typeof raw.draft === 'string' ? raw.draft : '',
            messages: Array.isArray(raw.messages)
                ? raw.messages.map(normalizeMessage).filter(Boolean).slice(-200)
                : [],
            usage: normalizeUsage(raw.usage),
            createdAt: Number(raw.createdAt) || Date.now(),
            updatedAt: Number(raw.updatedAt) || Date.now(),
            scrollTop: Number(raw.scrollTop) || 0
        };
    }

    function normalizeModel(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const modelId = typeof raw.modelId === 'string' ? raw.modelId.trim() : '';
        return {
            id: typeof raw.id === 'string' ? raw.id : uid(),
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : (modelId || 'Model'),
            baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
            apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
            authMode: ['bearer', 'api-key', 'x-api-key', 'none'].indexOf(raw.authMode) >= 0 ? raw.authMode : 'bearer',
            extraHeaders: raw.extraHeaders && typeof raw.extraHeaders === 'object' && !Array.isArray(raw.extraHeaders) ? raw.extraHeaders : {},
            modelId: modelId
        };
    }

    function normalizeGroup(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            id: typeof raw.id === 'string' ? raw.id : uid(),
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : t('chat.models.group'),
            baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
            apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
            authMode: ['bearer', 'api-key', 'x-api-key', 'none'].indexOf(raw.authMode) >= 0 ? raw.authMode : 'bearer',
            extraHeaders: raw.extraHeaders && typeof raw.extraHeaders === 'object' && !Array.isArray(raw.extraHeaders) ? raw.extraHeaders : {},
            models: Array.isArray(raw.models)
                ? raw.models.map(function (item) {
                    if (!item || typeof item !== 'object') return null;
                    const modelId = typeof item.modelId === 'string' ? item.modelId.trim() : '';
                    return {
                        id: typeof item.id === 'string' ? item.id : uid(),
                        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : (modelId || 'Model'),
                        modelId: modelId
                    };
                }).filter(Boolean)
                : []
        };
    }

    function normalizeState(raw) {
        const data = raw && typeof raw === 'object' ? raw : {};
        const models = data.models && typeof data.models === 'object' ? data.models : {};
        let tabs = Array.isArray(data.tabs) ? data.tabs.map(normalizeTab).filter(Boolean) : [];
        if (!tabs.length) tabs = [makeTab()];
        const active = tabs.some(function (tab) { return tab.id === data.activeTabId; }) ? data.activeTabId : tabs[0].id;
        return {
            version: 1,
            activeTabId: active,
            activeModel: isRef(data.activeModel) ? data.activeModel : null,
            tabs: tabs,
            models: {
                singles: Array.isArray(models.singles) ? models.singles.map(normalizeModel).filter(Boolean) : [],
                groups: Array.isArray(models.groups) ? models.groups.map(normalizeGroup).filter(Boolean) : []
            }
        };
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(storeKey);
            if (raw) return normalizeState(JSON.parse(raw));
        } catch (e) { }
        return normalizeState(null);
    }

    function saveState() {
        if (!state) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 320);
    }

    function stripLargeAttachments(data) {
        const entries = [];
        data.tabs.forEach(function (tab) {
            tab.messages.forEach(function (message) {
                (message.attachments || []).forEach(function (attachment) {
                    if (attachment.dataUrl || attachment.text) entries.push({ attachment: attachment, ts: message.ts || 0 });
                });
            });
        });
        entries.sort(function (a, b) { return a.ts - b.ts; });
        for (let i = 0; i < entries.length; i++) {
            const attachment = entries[i].attachment;
            if (attachment.dataUrl) {
                delete attachment.dataUrl;
                attachment.expired = true;
            } else if (attachment.text) {
                delete attachment.text;
                attachment.expired = true;
            }
            if (JSON.stringify(data).length <= MAX_STORE_CHARS) break;
        }
    }

    function buildStoreData() {
        const data = JSON.parse(JSON.stringify(state));
        data.tabs.forEach(function (tab) {
            tab.messages.forEach(function (message) { delete message.streaming; });
            if (tab.messages.length > 200) tab.messages = tab.messages.slice(-200);
        });
        if (JSON.stringify(data).length > MAX_STORE_CHARS) stripLargeAttachments(data);
        if (JSON.stringify(data).length > MAX_STORE_CHARS) {
            data.tabs.forEach(function (tab) {
                if (tab.messages.length > 20) tab.messages = tab.messages.slice(-20);
                tab.messages.forEach(function (message) {
                    (message.attachments || []).forEach(function (attachment) {
                        if (attachment.dataUrl || attachment.text) {
                            delete attachment.dataUrl;
                            delete attachment.text;
                            attachment.expired = true;
                        }
                    });
                });
            });
        }
        return data;
    }

    function flushSave() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (!state || !storeKey) return;
        try {
            localStorage.setItem(storeKey, JSON.stringify(buildStoreData()));
        } catch (e) {
            try {
                const data = buildStoreData();
                data.tabs.forEach(function (tab) {
                    tab.messages.forEach(function (message) {
                        (message.attachments || []).forEach(function (attachment) {
                            if (attachment.dataUrl || attachment.text) {
                                delete attachment.dataUrl;
                                delete attachment.text;
                                attachment.expired = true;
                            }
                        });
                    });
                });
                localStorage.setItem(storeKey, JSON.stringify(data));
                toast(t('chat.error.storage'));
            } catch (err) {
                toast(t('chat.error.storage'));
            }
        }
    }

    function renderTabList() {
        if (!state) return;
        const tabs = state.tabs.slice().sort(function (a, b) {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
        dom.tabList.innerHTML = tabs.map(function (tab) {
            const label = modelName(tab.model) || t('chat.noModel');
            const active = tab.id === state.activeTabId;
            return '<div class="chat-tab-item' + (active ? ' active' : '') + (tab.pinned ? ' pinned' : '') + '" data-tab-id="' + escapeAttr(tab.id) + '">' +
                '<button type="button" class="chat-tab-main" data-action="activate">' +
                '<span class="chat-tab-title">' + escapeHtml(tab.title) + '</span>' +
                '<span class="chat-tab-meta">' + escapeHtml(label) + '</span>' +
                '</button>' +
                '<div class="chat-tab-actions">' +
                '<button type="button" class="chat-tab-action" data-action="rename" title="' + escapeAttr(t('chat.rename')) + '">' + SVG.edit + '</button>' +
                '<button type="button" class="chat-tab-action' + (tab.pinned ? ' pinned' : '') + '" data-action="pin" title="' + escapeAttr(t('chat.pin')) + '">' + SVG.pin + '</button>' +
                '<button type="button" class="chat-tab-action" data-action="close" title="' + escapeAttr(t('chat.closeTab')) + '">' + SVG.close + '</button>' +
                '</div></div>';
        }).join('');
    }

    function renderModelUi() {
        const model = resolveRef(currentModelRef());
        dom.modelBtnLabel.textContent = model ? model.name : t('chat.noModel');
        dom.modelDot.classList.toggle('on', !!model);
        dom.sidebarModelName.textContent = model ? model.name + ' · ' + model.modelId : '';
        dom.composerModelHint.textContent = model ? model.modelId : '';
    }

    function slashQuery() {
        const value = dom.input.value;
        if (value.charAt(0) !== '/') return null;
        if (/\s/.test(value.slice(1))) return null;
        return value.toLowerCase();
    }

    function closeSlashMenu() {
        slashItems = [];
        slashIndex = 0;
        if (!dom.slashMenu) return;
        dom.slashMenu.innerHTML = '';
        dom.slashMenu.classList.add('hidden');
    }

    function renderSlashMenu() {
        if (!dom.slashMenu) return;
        const query = slashQuery();
        if (query === null) {
            closeSlashMenu();
            return;
        }
        const items = SLASH_COMMANDS.filter(function (item) {
            return item.command.indexOf(query) === 0;
        });
        if (!items.length) {
            closeSlashMenu();
            return;
        }
        slashItems = items;
        if (slashIndex >= items.length) slashIndex = 0;
        dom.slashMenu.innerHTML = items.map(function (item, index) {
            return '<button type="button" class="chat-slash-item' + (index === slashIndex ? ' active' : '') + '" data-command="' + escapeAttr(item.command) + '" role="option" aria-selected="' + (index === slashIndex ? 'true' : 'false') + '">' +
                '<span class="chat-slash-cmd">' + escapeHtml(item.command) + '</span>' +
                '<span class="chat-slash-text"><strong>' + escapeHtml(t(item.label)) + '</strong><span>' + escapeHtml(t(item.description)) + '</span></span>' +
                '</button>';
        }).join('');
        dom.slashMenu.classList.remove('hidden');
    }

    function moveSlashSelection(delta) {
        if (!slashItems.length) return;
        slashIndex = (slashIndex + delta + slashItems.length) % slashItems.length;
        renderSlashMenu();
    }

    function applySlashSelection() {
        const item = slashItems[slashIndex];
        if (!item) return;
        dom.input.value = item.command;
        const tab = activeTab();
        if (tab) tab.draft = item.command;
        closeSlashMenu();
        autoResize();
        saveState();
        dom.input.focus();
    }

    function exactSlashCommand() {
        const value = dom.input.value.trim().toLowerCase();
        if (!/^\/[a-z]+$/.test(value)) return null;
        return SLASH_COMMANDS.some(function (item) { return item.command === value; }) ? value : null;
    }

    function clearComposerInput() {
        dom.input.value = '';
        const tab = activeTab();
        if (tab) tab.draft = '';
        autoResize();
        saveState();
    }

    function clearCurrentChat() {
        const tab = activeTab();
        if (!tab) return;
        if (streaming) stopStream();
        tab.messages = [];
        tab.draft = '';
        tab.title = t('chat.new');
        tab.autoTitle = true;
        tab.scrollTop = 0;
        tab.usage = emptyUsage();
        tab.updatedAt = Date.now();
        pendingAttachments = [];
        updatePendingAttachments();
        renderTabList();
        renderMessages('bottom');
        renderModelUi();
        saveState();
        toast(t('chat.cmd.cleared'));
    }

    function showTokenUsage() {
        const tab = activeTab();
        if (!tab) return;
        if (!tab.messages.length && (!tab.usage || !tab.usage.requests)) {
            toast(t('chat.cmd.tokenEmpty'));
            return;
        }
        const usage = tab.usage && tab.usage.requests ? tab.usage : estimateTabUsage(tab);
        if (!usage.totalTokens) {
            toast(t('chat.cmd.tokenEmpty'));
            return;
        }
        const vars = {
            total: numberLabel(usage.totalTokens),
            prompt: numberLabel(usage.promptTokens),
            completion: numberLabel(usage.completionTokens),
            requests: numberLabel(usage.requests)
        };
        toast(t(usage.estimated ? 'chat.cmd.tokenResultApprox' : 'chat.cmd.tokenResult', vars));
    }

    async function pingApi() {
        const model = resolveRef(currentModelRef());
        if (!model) {
            toast(t('chat.error.noModel'));
            if (state.models.singles.length || state.models.groups.some(function (group) { return group.models.length; })) {
                openPicker();
            } else {
                openModelManager();
            }
            return;
        }
        toast(t('chat.cmd.pinging'));
        try {
            const data = await apiRequest('POST', '/chat/ping', {
                baseUrl: model.baseUrl,
                apiKey: model.apiKey,
                authMode: model.authMode,
                extraHeaders: model.extraHeaders || {}
            });
            toast(t('chat.cmd.pingResult', { ms: numberLabel(data && data.latencyMs) }));
        } catch (error) {
            const data = error && error.data ? error.data : {};
            const status = data.status || (error && error.status) || 0;
            const latency = Number(data.latencyMs) || 0;
            const detail = data.message || data.detail || data.title || (error && error.message) || t('chat.test.failed');
            const label = (status ? 'HTTP ' + status + ' · ' : '') + (latency ? numberLabel(latency) + ' ms · ' : '') + detail;
            toast(t('chat.cmd.pingFailed', { detail: label }));
        }
    }

    function executeSlashCommand(command) {
        const cmd = String(command || '').trim().toLowerCase();
        if (!SLASH_COMMANDS.some(function (item) { return item.command === cmd; })) return false;
        closeSlashMenu();
        if (cmd === '/clear') {
            clearComposerInput();
            clearCurrentChat();
        } else {
            clearComposerInput();
            if (cmd === '/token') showTokenUsage();
            else if (cmd === '/ping') pingApi();
        }
        return true;
    }

    function handleSendAction() {
        if (streaming) {
            stopStream();
            return;
        }
        if (dom.slashMenu && !dom.slashMenu.classList.contains('hidden') && slashItems[slashIndex]) {
            executeSlashCommand(slashItems[slashIndex].command);
            return;
        }
        const command = exactSlashCommand();
        if (command) {
            executeSlashCommand(command);
            return;
        }
        sendMessage();
    }

    function updateScrollButton() {
        const nearBottom = dom.messages.scrollHeight - dom.messages.scrollTop - dom.messages.clientHeight < 90;
        dom.scrollBottomBtn.classList.toggle('hidden', nearBottom);
    }

    function scrollToBottom(smooth) {
        dom.messages.scrollTo({ top: dom.messages.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        requestAnimationFrame(updateScrollButton);
    }

    function openSidebar() {
        dom.sidebar.classList.add('open');
        dom.sidebarBackdrop.classList.add('open');
    }

    function closeSidebar() {
        dom.sidebar.classList.remove('open');
        dom.sidebarBackdrop.classList.remove('open');
    }

    function activateTab(id) {
        if (!state) return;
        if (streaming && streamTab && streamTab.id !== id) stopStream();
        if (state.activeTabId === id) {
            closeSidebar();
            return;
        }
        const previous = activeTab();
        if (previous) {
            previous.draft = dom.input.value;
            previous.scrollTop = dom.messages.scrollTop;
        }
        const tab = state.tabs.find(function (item) { return item.id === id; });
        if (!tab) return;
        state.activeTabId = tab.id;
        dom.input.value = tab.draft || '';
        autoResize();
        renderSlashMenu();
        renderTabList();
        renderModelUi();
        renderMessages(tab.scrollTop ? tab.scrollTop : 'bottom');
        closeSidebar();
        dom.input.focus();
        saveState();
    }

    function closeTab(id) {
        const index = state.tabs.findIndex(function (tab) { return tab.id === id; });
        if (index < 0) return;
        if (streaming && streamTab && streamTab.id === id) stopStream();
        if (state.tabs.length === 1) {
            const tab = state.tabs[0];
            tab.messages = [];
            tab.draft = '';
            tab.autoTitle = true;
            tab.title = t('chat.new');
            tab.model = state.activeModel;
            dom.input.value = '';
            pendingAttachments = [];
            updatePendingAttachments();
            closeSlashMenu();
            autoResize();
            renderTabList();
            renderMessages('bottom');
            renderModelUi();
            saveState();
            return;
        }
        const wasActive = state.activeTabId === id;
        state.tabs.splice(index, 1);
        if (wasActive) {
            const next = state.tabs[Math.min(index, state.tabs.length - 1)];
            state.activeTabId = next.id;
            dom.input.value = next.draft || '';
            autoResize();
            renderSlashMenu();
            renderMessages('bottom');
        }
        renderTabList();
        renderModelUi();
        saveState();
    }

    function pinTab(id) {
        const tab = state.tabs.find(function (item) { return item.id === id; });
        if (!tab) return;
        tab.pinned = !tab.pinned;
        tab.pinnedAt = tab.pinned ? Date.now() : 0;
        renderTabList();
        saveState();
    }

    function startRename(id) {
        const item = dom.tabList.querySelector('[data-tab-id="' + id + '"]');
        const tab = state.tabs.find(function (entry) { return entry.id === id; });
        if (!item || !tab) return;
        const main = item.querySelector('.chat-tab-main');
        if (!main) return;
        main.innerHTML = '<input type="text" class="chat-tab-rename" maxlength="80" value="' + escapeAttr(tab.title) + '">';
        const input = main.querySelector('input');
        let done = false;
        function finish(save) {
            if (done) return;
            done = true;
            const value = input.value.trim();
            if (save && value) {
                tab.title = value;
                tab.autoTitle = false;
            }
            renderTabList();
            saveState();
        }
        input.focus();
        input.select();
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                finish(true);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            }
        });
        input.addEventListener('blur', function () { finish(true); });
    }

    function updatePendingAttachments() {
        dom.attachmentList.classList.toggle('hidden', pendingAttachments.length === 0);
        dom.attachmentList.innerHTML = pendingAttachments.map(function (attachment) {
            const thumb = attachment.kind === 'image' && attachment.dataUrl
                ? '<img class="chat-attachment-thumb" src="' + escapeAttr(attachment.dataUrl) + '" alt="' + escapeAttr(attachment.name) + '">'
                : '<span class="chat-attachment-icon">' + SVG.file + '</span>';
            return '<div class="chat-attachment" data-attachment-id="' + escapeAttr(attachment.id) + '">' +
                thumb +
                '<div class="chat-attachment-info"><span class="chat-attachment-name">' + escapeHtml(attachment.name) + '</span>' +
                '<span class="chat-attachment-size">' + escapeHtml(formatBytes(attachment.size)) + '</span></div>' +
                '<button type="button" class="chat-attachment-remove" data-remove-attachment="' + escapeAttr(attachment.id) + '" aria-label="Remove">×</button>' +
                '</div>';
        }).join('');
    }

    function attachmentsHistoryHtml(attachments) {
        if (!attachments || !attachments.length) return '';
        const items = attachments.map(function (attachment) {
            if (attachment.kind === 'image' && attachment.dataUrl) {
                return '<a class="chat-msg-image" href="' + escapeAttr(attachment.dataUrl) + '" target="_blank" rel="noopener noreferrer">' +
                    '<img src="' + escapeAttr(attachment.dataUrl) + '" alt="' + escapeAttr(attachment.name) + '"></a>';
            }
            const note = attachment.expired ? ' <em>(' + escapeHtml(t('chat.expired')) + ')</em>' : '';
            return '<span class="chat-msg-file">' + SVG.file + '<span>' + escapeHtml(attachment.name) + note + '</span></span>';
        });
        return '<div class="chat-msg-files">' + items.join('') + '</div>';
    }

    function safeUrl(raw) {
        const value = String(raw || '').replace(/&amp;/g, '&').trim();
        if (!/^(https?:\/\/|mailto:)/i.test(value)) return '';
        return value.replace(/&/g, '&amp;').replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
    }

    function inlineMarkdown(escaped) {
        const codes = [];
        let text = escaped.replace(/`([^`\n]+)`/g, function (match, code) {
            codes.push(code);
            return '\u0001' + (codes.length - 1) + '\u0001';
        });
        text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, url) {
            const safe = safeUrl(url);
            if (!safe) return match;
            return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
        });
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        text = text.replace(/\u0001(\d+)\u0001/g, function (match, index) {
            return '<code>' + codes[Number(index)] + '</code>';
        });
        return text;
    }

    function codeBlockHtml(block) {
        const lang = String(block.lang || '').toLowerCase().replace(/[^\w+#.-]/g, '');
        const langClass = lang ? ' class="language-' + escapeAttr(lang) + '"' : '';
        return '<div class="chat-code">' +
            '<div class="chat-code-head"><span class="chat-code-lang">' + escapeHtml(lang || t('chat.code')) + '</span>' +
            '<button type="button" class="chat-copy-code" data-code-copy>' + SVG.copy + '<span>' + escapeHtml(t('chat.copyCode')) + '</span></button></div>' +
            '<pre><code' + langClass + '>' + escapeHtml(block.code) + '</code></pre></div>';
    }

    function splitTableRow(row) {
        return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (cell) { return cell.trim(); });
    }

    function markdownToHtml(source) {
        const text = String(source || '').replace(/\r\n?/g, '\n');
        const lines = text.split('\n');
        const blocks = [];
        let html = '';
        let paragraph = [];
        let listType = null;

        function closeList() {
            if (listType) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                listType = null;
            }
        }

        function flushParagraph() {
            if (!paragraph.length) return;
            html += '<p>' + inlineMarkdown(escapeHtml(paragraph.join('\n'))).replace(/\n/g, '<br>') + '</p>';
            paragraph = [];
        }

        function closeBlocks() {
            flushParagraph();
            closeList();
        }

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (/^\s*```/.test(line)) {
                closeBlocks();
                const lang = line.replace(/^\s*```/, '').trim().split(/\s+/)[0] || '';
                const body = [];
                i += 1;
                while (i < lines.length && !/^\s*```/.test(lines[i])) {
                    body.push(lines[i]);
                    i += 1;
                }
                if (i < lines.length) i += 1;
                blocks.push({ lang: lang, code: body.join('\n') });
                html += '\u0002B' + (blocks.length - 1) + '\u0002';
                continue;
            }
            if (!line.trim()) {
                closeBlocks();
                i += 1;
                continue;
            }
            const heading = line.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                closeBlocks();
                const level = Math.min(heading[1].length, 4);
                html += '<h' + level + '>' + inlineMarkdown(escapeHtml(heading[2])) + '</h' + level + '>';
                i += 1;
                continue;
            }
            if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
                closeBlocks();
                html += '<hr>';
                i += 1;
                continue;
            }
            const quote = line.match(/^\s*>\s?(.*)$/);
            if (quote) {
                closeList();
                flushParagraph();
                const quoted = [];
                while (i < lines.length) {
                    const quoteLine = lines[i].match(/^\s*>\s?(.*)$/);
                    if (!quoteLine) break;
                    quoted.push(quoteLine[1]);
                    i += 1;
                }
                html += '<blockquote>' + inlineMarkdown(escapeHtml(quoted.join('\n'))).replace(/\n/g, '<br>') + '</blockquote>';
                continue;
            }
            if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
                closeBlocks();
                const header = splitTableRow(line);
                i += 2;
                const rows = [];
                while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
                    rows.push(splitTableRow(lines[i]));
                    i += 1;
                }
                html += '<table><thead><tr>' + header.map(function (cell) {
                    return '<th>' + inlineMarkdown(escapeHtml(cell)) + '</th>';
                }).join('') + '</tr></thead><tbody>' + rows.map(function (row) {
                    return '<tr>' + row.map(function (cell) {
                        return '<td>' + inlineMarkdown(escapeHtml(cell)) + '</td>';
                    }).join('') + '</tr>';
                }).join('') + '</tbody></table>';
                continue;
            }
            const list = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.*)$/);
            if (list) {
                flushParagraph();
                const nextType = list[1] ? 'ul' : 'ol';
                if (listType && listType !== nextType) closeList();
                if (!listType) {
                    html += nextType === 'ul' ? '<ul>' : '<ol>';
                    listType = nextType;
                }
                html += '<li>' + inlineMarkdown(escapeHtml(list[3])) + '</li>';
                i += 1;
                continue;
            }
            closeList();
            paragraph.push(line);
            i += 1;
        }
        closeBlocks();
        html = html.replace(/\u0002B(\d+)\u0002/g, function (match, index) {
            return codeBlockHtml(blocks[Number(index)]);
        });
        return html;
    }

    function highlightCode(root) {
        if (!window.hljs || !root) return;
        root.querySelectorAll('.chat-code code').forEach(function (code) {
            if (code.dataset.highlighted === 'yes') return;
            try {
                window.hljs.highlightElement(code);
                code.dataset.highlighted = 'yes';
            } catch (e) { }
        });
    }

    function timeLabel(ts) {
        try {
            return new Date(ts || Date.now()).toLocaleTimeString(getLang() === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function thinkingHtml(message) {
        if (!showThinking || !message.thinking) return '';
        const live = !!message.streaming && !message.content;
        return '<details class="chat-thinking' + (live ? ' live' : '') + '" open>' +
            '<summary>' + escapeHtml(t(live ? 'chat.thinking.live' : 'chat.thinking')) + '</summary>' +
            '<div class="chat-thinking-body">' + escapeHtml(message.thinking) + '</div>' +
            '</details>';
    }

    function messageHtml(message) {
        const isUser = message.role === 'user';
        const streamingNow = !!message.streaming;
        let bubble = '';
        if (streamingNow && !message.content) {
            bubble = '<span class="chat-typing"><span></span><span></span><span></span></span>';
        } else if (isUser) {
            bubble = escapeHtml(message.content).replace(/\n/g, '<br>');
        } else {
            bubble = markdownToHtml(message.content) || escapeHtml(message.content);
            if (streamingNow) bubble += '<span class="chat-cursor"></span>';
        }
        if (message.attachments && message.attachments.length) bubble += attachmentsHistoryHtml(message.attachments);
        const avatar = isUser ? '' : '<div class="chat-msg-avatar">' + SVG.assistant + '</div>';
        const copy = message.content
            ? '<button type="button" class="chat-msg-action" data-copy-msg="' + escapeAttr(message.id) + '">' + SVG.copy + '<span>' + escapeHtml(t('chat.copy')) + '</span></button>'
            : '';
        const stopped = message.stopped && message.content ? '<span class="chat-msg-status">' + escapeHtml(t('chat.stopped')) + '</span>' : '';
        return '<div class="chat-msg ' + (isUser ? 'user' : 'assistant') + (message.error ? ' error' : '') + '" data-msg-id="' + escapeAttr(message.id) + '">' +
            avatar +
            '<div class="chat-msg-body">' +
            '<div class="chat-msg-head"><strong>' + escapeHtml(isUser ? t('chat.you') : t('chat.assistant')) + '</strong><span>' + escapeHtml(timeLabel(message.ts)) + '</span>' + stopped +
            '<div class="chat-msg-actions">' + copy + '</div></div>' +
            (isUser ? '' : thinkingHtml(message)) +
            '<div class="chat-bubble">' + bubble + '</div>' +
            '</div></div>';
    }

    function renderMessages(scrollMode) {
        const tab = activeTab();
        if (!tab) {
            dom.messageList.innerHTML = '';
            dom.empty.classList.remove('hidden');
            return;
        }
        dom.messageList.innerHTML = tab.messages.map(messageHtml).join('');
        dom.empty.classList.toggle('hidden', tab.messages.length > 0);
        highlightCode(dom.messageList);
        const target = typeof scrollMode === 'number' ? scrollMode : null;
        requestAnimationFrame(function () {
            if (target !== null) dom.messages.scrollTop = target;
            else if (scrollMode === 'bottom') scrollToBottom(false);
            updateScrollButton();
        });
    }

    function nearBottom() {
        return dom.messages.scrollHeight - dom.messages.scrollTop - dom.messages.clientHeight < 100;
    }

    function paintStreaming() {
        if (!streamTab || !streamMessage || activeTab() !== streamTab) return;
        const el = dom.messageList.querySelector('[data-msg-id="' + streamMessage.id + '"]');
        if (!el) return;
        const bubble = el.querySelector('.chat-bubble');
        if (!bubble) return;
        const body = el.querySelector('.chat-msg-body');
        let thinkingEl = body ? body.querySelector('.chat-thinking') : null;
        if (showThinking && streamMessage.thinking && body) {
            if (!thinkingEl) {
                thinkingEl = document.createElement('details');
                thinkingEl.className = 'chat-thinking';
                thinkingEl.open = true;
                const summary = document.createElement('summary');
                summary.textContent = t('chat.thinking');
                const content = document.createElement('div');
                content.className = 'chat-thinking-body';
                thinkingEl.appendChild(summary);
                thinkingEl.appendChild(content);
                body.insertBefore(thinkingEl, bubble);
            }
            const live = !streamMessage.content;
            thinkingEl.classList.toggle('live', live);
            const summary = thinkingEl.querySelector('summary');
            if (summary) summary.textContent = t(live ? 'chat.thinking.live' : 'chat.thinking');
            const thinkingBody = thinkingEl.querySelector('.chat-thinking-body');
            if (thinkingBody && thinkingBody.textContent !== streamMessage.thinking) {
                const atBottom = thinkingBody.scrollHeight - thinkingBody.scrollTop - thinkingBody.clientHeight < 24;
                thinkingBody.textContent = streamMessage.thinking;
                if (atBottom) thinkingBody.scrollTop = thinkingBody.scrollHeight;
            }
        } else if (thinkingEl) {
            thinkingEl.remove();
        }
        if (!streamMessage.content) {
            bubble.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';
        } else {
            bubble.innerHTML = markdownToHtml(streamMessage.content) + '<span class="chat-cursor"></span>';
        }
        if (nearBottom()) scrollToBottom(false);
        updateScrollButton();
    }

    function schedulePaint() {
        if (streamPaintTimer) return;
        const wait = Math.max(0, 40 - (Date.now() - lastPaintAt));
        streamPaintTimer = setTimeout(function () {
            streamPaintTimer = null;
            lastPaintAt = Date.now();
            paintStreaming();
        }, wait);
    }

    function setStreaming(value) {
        streaming = value;
        dom.sendBtn.classList.toggle('streaming', value);
        dom.sendBtn.title = t(value ? 'chat.stop' : 'chat.send');
        dom.sendBtn.setAttribute('aria-label', dom.sendBtn.title);
    }

    function stopStream() {
        if (abortController) abortController.abort();
    }

    function valueText(value) {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(valueText).join('');
        if (value && typeof value === 'object') {
            return valueText(value.text || value.content || value.thinking || value.reasoning_content || '');
        }
        return '';
    }

    function contentParts(value) {
        if (Array.isArray(value)) {
            let text = '';
            let thinking = '';
            value.forEach(function (part) {
                if (!part || typeof part !== 'object') return;
                const type = String(part.type || '').toLowerCase();
                const piece = valueText(part);
                if (type === 'thinking' || type === 'reasoning' || type === 'reasoning_content') thinking += piece;
                else text += piece;
            });
            return { text: text, thinking: thinking };
        }
        return { text: typeof value === 'string' ? value : '', thinking: '' };
    }

    function reasoningText(source) {
        if (!source || typeof source !== 'object') return '';
        const fields = ['reasoning_content', 'reasoning', 'thinking', 'analysis'];
        for (let i = 0; i < fields.length; i++) {
            const value = source[fields[i]];
            const text = valueText(value);
            if (text) return text;
        }
        if (Array.isArray(source.reasoning_details)) {
            return valueText(source.reasoning_details);
        }
        return '';
    }

    async function streamChat(payload, onDelta, onThinking, signal, onUsage) {
        const token = getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: signal
        });
        if (!response.ok) {
            let data = null;
            try { data = await response.json(); } catch (e) { }
            const detail = data && (data.message || data.detail || data.title || data.error);
            let message = 'HTTP ' + response.status;
            if (detail) message += ' · ' + detail;
            else if (response.statusText) message += ' ' + response.statusText;
            const error = new Error(message);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        if (!response.body) throw new Error(t('chat.error.send'));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function handleData(raw) {
            const data = raw.trim();
            if (!data) return false;
            if (data === '[DONE]') return true;
            let obj;
            try { obj = JSON.parse(data); } catch (e) { return false; }
            if (obj && obj.error) {
                const err = obj.error;
                const message = obj.message || (typeof err === 'string'
                    ? err
                    : (err.message || err.detail || err.title || err.code || t('chat.error.send')));
                throw new Error(message);
            }
            if (obj && obj.usage && typeof onUsage === 'function') onUsage(obj.usage);
            const choice = obj && obj.choices && obj.choices[0];
            if (!choice) return false;
            const source = choice.delta || choice.message || {};
            const parts = contentParts(source.content);
            let content = parts.text;
            let thinking = parts.thinking || reasoningText(source);
            if (!content && typeof choice.text === 'string') content = choice.text;
            if (thinking && typeof onThinking === 'function') onThinking(thinking);
            if (content && typeof onDelta === 'function') onDelta(content);
            return false;
        }

        let finished = false;
        try {
            while (!finished) {
                const result = await reader.read();
                if (result.done) {
                    buffer += decoder.decode();
                    break;
                }
                buffer += decoder.decode(result.value, { stream: true });
                let index;
                while ((index = buffer.indexOf('\n')) >= 0) {
                    let line = buffer.slice(0, index);
                    buffer = buffer.slice(index + 1);
                    if (line.endsWith('\r')) line = line.slice(0, -1);
                    if (line.indexOf('data:') !== 0) continue;
                    if (handleData(line.slice(5))) {
                        finished = true;
                        break;
                    }
                }
            }
            if (!finished && buffer.trim().indexOf('data:') === 0) handleData(buffer.trim().slice(5));
        } finally {
            try { await reader.cancel(); } catch (e) { }
        }
    }

    function buildApiMessages(tab) {
        const messages = tab.messages.filter(function (message) {
            if (message.role === 'assistant' && !message.content) return false;
            return true;
        }).slice(-MAX_CONTEXT_MESSAGES);
        const result = [];
        messages.forEach(function (message) {
            if (message.role === 'user') {
                let text = message.content || '';
                const attachments = message.attachments || [];
                attachments.forEach(function (attachment) {
                    if (attachment.kind === 'text' && attachment.text) {
                        text += '\n\n--- ' + attachment.name + ' ---\n' + attachment.text;
                    }
                });
                const images = attachments.filter(function (attachment) {
                    return attachment.kind === 'image' && attachment.dataUrl;
                });
                if (images.length) {
                    const parts = [{ type: 'text', text: text }];
                    images.forEach(function (image) {
                        parts.push({ type: 'image_url', image_url: { url: image.dataUrl } });
                    });
                    result.push({ role: 'user', content: parts });
                } else {
                    result.push({ role: 'user', content: text });
                }
            } else {
                result.push({ role: 'assistant', content: message.content });
            }
        });
        return result;
    }

    async function sendMessage() {
        if (streaming) {
            stopStream();
            return;
        }
        const tab = activeTab();
        if (!tab) return;
        const text = dom.input.value.trim();
        if (!text && !pendingAttachments.length) return;
        const model = resolveRef(currentModelRef());
        if (!model) {
            toast(t('chat.error.noModel'));
            if (state.models.singles.length || state.models.groups.some(function (group) { return group.models.length; })) {
                openPicker();
            } else {
                openModelManager();
            }
            return;
        }

        const attachments = pendingAttachments.slice();
        const userMessage = {
            id: uid(),
            role: 'user',
            content: text,
            ts: Date.now(),
            attachments: attachments,
            stopped: false,
            error: false
        };
        if (tab.autoTitle) {
            tab.title = makeTitle(text || (attachments[0] && attachments[0].name) || t('chat.new'));
            tab.autoTitle = false;
        }
        tab.messages.push(userMessage);
        tab.updatedAt = Date.now();
        tab.draft = '';
        dom.input.value = '';
        closeSlashMenu();
        autoResize();
        pendingAttachments = [];
        updatePendingAttachments();
        const requestMessages = buildApiMessages(tab);

        const assistant = {
            id: uid(),
            role: 'assistant',
            content: '',
            thinking: '',
            ts: Date.now(),
            attachments: [],
            stopped: false,
            error: false,
            streaming: true
        };
        tab.messages.push(assistant);
        renderTabList();
        renderMessages('bottom');

        const controller = new AbortController();
        abortController = controller;
        streamTab = tab;
        streamMessage = assistant;
        setStreaming(true);
        saveState();

        let usageRecorded = false;
        let receivedOutput = false;
        try {
            await streamChat({
                baseUrl: model.baseUrl,
                apiKey: model.apiKey,
                authMode: model.authMode,
                extraHeaders: model.extraHeaders || {},
                modelId: model.modelId,
                messages: requestMessages
            }, function (delta) {
                receivedOutput = true;
                assistant.content += delta;
                tab.updatedAt = Date.now();
                schedulePaint();
            }, function (delta) {
                receivedOutput = true;
                assistant.thinking += delta;
                tab.updatedAt = Date.now();
                schedulePaint();
            }, controller.signal, function (rawUsage) {
                if (usageRecorded || tab.messages.indexOf(assistant) < 0) return;
                const used = usageFromApi(rawUsage);
                if (!used) return;
                recordUsage(tab, used, false);
                usageRecorded = true;
            });
            if (!assistant.content) assistant.content = t('chat.error.empty');
        } catch (error) {
            if (error && error.name === 'AbortError') {
                assistant.stopped = true;
                if (!assistant.content) assistant.content = t('chat.stopped');
            } else {
                assistant.error = true;
                const message = error && error.message ? error.message : t('chat.error.send');
                assistant.content = assistant.content
                    ? assistant.content + '\n\n**' + t('chat.error.label') + ':** ' + message
                    : message;
                toast(message);
            }
        } finally {
            assistant.streaming = false;
            if (!assistant.content && !assistant.error) assistant.content = t('chat.stopped');
            if (!usageRecorded && (!assistant.error || receivedOutput) && tab.messages.indexOf(assistant) >= 0) {
                const promptTokens = estimateMessageTokens(requestMessages);
                const completionTokens = estimateTokens(assistant.content) + estimateTokens(assistant.thinking);
                recordUsage(tab, {
                    promptTokens: promptTokens,
                    completionTokens: completionTokens,
                    totalTokens: promptTokens + completionTokens
                }, true);
                usageRecorded = true;
            }
            tab.updatedAt = Date.now();
            if (streamTab === tab) {
                streamTab = null;
                streamMessage = null;
                abortController = null;
                setStreaming(false);
            }
            flushSave();
            if (activeTab() === tab) renderMessages('bottom');
            renderTabList();
            renderModelUi();
        }
    }

    function autoResize() {
        dom.input.style.height = 'auto';
        dom.input.style.height = Math.min(dom.input.scrollHeight, 168) + 'px';
    }

    function copyText(text) {
        const value = String(text == null ? '' : text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value).catch(function () { return fallbackCopy(value); });
        }
        return fallbackCopy(value);
    }

    function fallbackCopy(value) {
        return new Promise(function (resolve, reject) {
            const area = document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            try {
                document.execCommand('copy');
                resolve();
            } catch (e) {
                reject(e);
            }
            document.body.removeChild(area);
        });
    }

    function compressImage(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function () {
                try {
                    const max = 1280;
                    let width = image.naturalWidth || image.width;
                    let height = image.naturalHeight || image.height;
                    if (width > max || height > max) {
                        const ratio = Math.min(max / width, max / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d');
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, width, height);
                    context.drawImage(image, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                } catch (e) {
                    URL.revokeObjectURL(url);
                    reject(e);
                }
            };
            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('image'));
            };
            image.src = url;
        });
    }

    function isTextFile(file) {
        if (file.type && file.type.indexOf('text/') === 0) return true;
        return /\.(txt|md|markdown|json|js|mjs|ts|jsx|tsx|py|java|c|h|cpp|hpp|cs|go|rs|php|rb|css|scss|html|htm|xml|yml|yaml|csv|log|sql|sh|bat|ps1|ini|toml)$/i.test(file.name);
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        for (let i = 0; i < files.length; i++) {
            if (pendingAttachments.length >= MAX_ATTACHMENTS) {
                toast(t('chat.error.tooMany', { max: MAX_ATTACHMENTS }));
                break;
            }
            const file = files[i];
            if (!file || !file.size) continue;
            if (file.size > MAX_IMAGE_BYTES) {
                toast(t('chat.error.fileSize', { name: file.name }));
                continue;
            }
            if (file.type && file.type.indexOf('image/') === 0) {
                try {
                    const dataUrl = file.type === 'image/gif' ? await fileToDataUrl(file) : await compressImage(file);
                    pendingAttachments.push({
                        id: uid(),
                        kind: 'image',
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        dataUrl: dataUrl,
                        text: '',
                        ts: Date.now()
                    });
                } catch (e) {
                    toast(t('chat.error.fileType'));
                }
                continue;
            }
            if (isTextFile(file)) {
                if (file.size > MAX_TEXT_BYTES) {
                    toast(t('chat.error.fileSize', { name: file.name }));
                    continue;
                }
                try {
                    const text = await file.text();
                    pendingAttachments.push({
                        id: uid(),
                        kind: 'text',
                        name: file.name,
                        type: file.type || 'text/plain',
                        size: file.size,
                        dataUrl: '',
                        text: text.slice(0, MAX_TEXT_BYTES),
                        ts: Date.now()
                    });
                } catch (e) {
                    toast(t('chat.error.fileType'));
                }
                continue;
            }
            toast(t('chat.error.fileType'));
        }
        updatePendingAttachments();
        dom.attachInput.value = '';
    }

    function fileToDataUrl(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function removePendingAttachment(id) {
        pendingAttachments = pendingAttachments.filter(function (attachment) { return attachment.id !== id; });
        updatePendingAttachments();
    }

    function selectModel(ref) {
        const tab = activeTab();
        if (!tab || !resolveRef(ref)) return;
        const clean = { kind: ref.kind, id: ref.id, groupId: ref.groupId };
        tab.model = clean;
        state.activeModel = clean;
        renderTabList();
        renderModelUi();
        saveState();
        const model = resolveRef(ref);
        toast(t('chat.modelSelected', { name: model ? model.name : '' }));
    }

    function openPicker() {
        renderPicker();
        dom.picker.classList.remove('hidden');
        dom.modelBtn.setAttribute('aria-expanded', 'true');
        pickerOpen = true;
    }

    function closePicker() {
        dom.picker.classList.add('hidden');
        dom.modelBtn.setAttribute('aria-expanded', 'false');
        pickerOpen = false;
    }

    function pickerItem(ref, name, modelId, activeKey) {
        const active = refKey(ref) === activeKey;
        const attrs = 'data-kind="' + ref.kind + '" data-id="' + escapeAttr(ref.id) + '"' +
            (ref.groupId ? ' data-group-id="' + escapeAttr(ref.groupId) + '"' : '');
        return '<button type="button" class="chat-picker-item' + (active ? ' active' : '') + '" ' + attrs + '>' +
            '<span class="chat-picker-item-main"><span class="chat-picker-item-name">' + escapeHtml(name) + '</span>' +
            '<span class="chat-picker-item-model">' + escapeHtml(modelId) + '</span></span>' +
            (active ? '<span class="chat-picker-check">✓</span>' : '') + '</button>';
    }

    function renderPicker() {
        const activeKey = refKey(currentModelRef());
        const singles = state.models.singles;
        const groups = state.models.groups;
        let html = '';
        if (!singles.length && !groups.some(function (group) { return group.models.length; })) {
            html = '<div class="chat-picker-empty">' + escapeHtml(t('chat.models.emptyAll')) + '</div>';
        } else {
            if (singles.length) {
                html += '<div class="chat-picker-section"><div class="chat-picker-label">' + escapeHtml(t('chat.models.single')) + '</div>' +
                    singles.map(function (model) {
                        return pickerItem({ kind: 'single', id: model.id }, model.name, model.modelId, activeKey);
                    }).join('') + '</div>';
            }
            groups.forEach(function (group) {
                if (!group.models.length) return;
                html += '<div class="chat-picker-section"><div class="chat-picker-label">' + escapeHtml(group.name) + '</div>' +
                    group.models.map(function (model) {
                        return pickerItem({ kind: 'group', groupId: group.id, id: model.id }, model.name, model.modelId, activeKey);
                    }).join('') + '</div>';
            });
        }
        dom.pickerList.innerHTML = html;
    }

    function openModelManager() {
        closePicker();
        renderModelManager();
        openModal('modelModal');
    }

    function avatarText(name) {
        return initials(name);
    }

    function testResultHtml(ref) {
        const result = testResults[refKey(ref)];
        if (!result) return '';
        if (result.loading) {
            return '<span class="chat-model-test-result">' + escapeHtml(t('chat.testing')) + '</span>';
        }
        if (result.ok) {
            return '<span class="chat-model-test-result ok">✓ ' + escapeHtml(String(result.latencyMs)) + ' ms</span>';
        }
        const status = result.status ? 'HTTP ' + result.status : '';
        const label = (status ? status + ' · ' : '') + (result.latencyMs ? result.latencyMs + ' ms · ' : '') + (result.detail || t('chat.test.failed'));
        return '<span class="chat-model-test-result fail" title="' + escapeAttr(label) + '">✗ ' + escapeHtml(label) + '</span>';
    }

    async function testModel(ref) {
        const model = resolveRef(ref);
        if (!model) return;
        const key = refKey(ref);
        if (testResults[key] && testResults[key].loading) return;
        testResults[key] = { loading: true };
        renderModelManager();
        try {
            const data = await apiRequest('POST', '/chat/test', {
                baseUrl: model.baseUrl,
                apiKey: model.apiKey,
                authMode: model.authMode,
                extraHeaders: model.extraHeaders || {},
                modelId: model.modelId
            });
            testResults[key] = {
                loading: false,
                ok: true,
                latencyMs: Number(data && data.latencyMs) || 0,
                detail: data && data.reply ? data.reply : ''
            };
        } catch (error) {
            const data = error && error.data ? error.data : {};
            const status = data.status || (error && error.status) || 0;
            const detail = data.message || data.detail || data.title || (error && error.message) || t('chat.test.failed');
            testResults[key] = {
                loading: false,
                ok: false,
                status: status,
                latencyMs: Number(data.latencyMs) || 0,
                detail: detail
            };
            const label = (status ? 'HTTP ' + status + ' · ' : '') + detail;
            toast(label.length > 400 ? label.slice(0, 400) + '…' : label);
        }
        renderModelManager();
    }

    function singleCard(model) {
        const active = refKey({ kind: 'single', id: model.id }) === refKey(currentModelRef());
        return '<div class="chat-model-card' + (active ? ' is-active' : '') + '" data-single-card="' + escapeAttr(model.id) + '">' +
            '<div class="chat-model-card-head">' +
            '<div class="chat-model-avatar">' + escapeHtml(avatarText(model.name)) + '</div>' +
            '<div class="chat-model-info"><span class="chat-model-name">' + escapeHtml(model.name) + '</span>' +
            '<span class="chat-model-meta">' + escapeHtml(model.modelId || '—') + '</span>' +
            '<span class="chat-model-url">' + escapeHtml(model.baseUrl || '—') + '</span>' +
            testResultHtml({ kind: 'single', id: model.id }) + '</div>' +
            '<div class="chat-model-actions">' +
            '<button type="button" class="chat-model-test-btn" data-action="test-single" data-id="' + escapeAttr(model.id) + '">' + escapeHtml(t(testResults[refKey({ kind: 'single', id: model.id })] && testResults[refKey({ kind: 'single', id: model.id })].loading ? 'chat.testing' : 'chat.test')) + '</button>' +
            '<button type="button" class="chat-model-use' + (active ? ' is-active' : '') + '" data-action="use-single" data-id="' + escapeAttr(model.id) + '">' + escapeHtml(t(active ? 'chat.models.active' : 'chat.models.use')) + '</button>' +
            '<button type="button" class="chat-model-action" data-action="edit-single" data-id="' + escapeAttr(model.id) + '" title="' + escapeAttr(t('chat.models.edit')) + '">' + SVG.edit + '</button>' +
            '<button type="button" class="chat-model-action danger" data-action="delete-single" data-id="' + escapeAttr(model.id) + '" title="' + escapeAttr(t('chat.models.delete')) + '">' + SVG.trash + '</button>' +
            '</div></div></div>';
    }

    function childRow(group, child) {
        const active = refKey({ kind: 'group', groupId: group.id, id: child.id }) === refKey(currentModelRef());
        return '<div class="chat-model-child' + (active ? ' is-active' : '') + '" data-child-row="' + escapeAttr(child.id) + '">' +
            '<div class="chat-model-child-main"><span class="chat-model-child-name">' + escapeHtml(child.name) + '</span>' +
            '<span class="chat-model-child-id">' + escapeHtml(child.modelId || '—') + '</span>' +
            testResultHtml({ kind: 'group', groupId: group.id, id: child.id }) + '</div>' +
            '<div class="chat-model-actions">' +
            '<button type="button" class="chat-model-test-btn" data-action="test-child" data-group-id="' + escapeAttr(group.id) + '" data-id="' + escapeAttr(child.id) + '">' + escapeHtml(t(testResults[refKey({ kind: 'group', groupId: group.id, id: child.id })] && testResults[refKey({ kind: 'group', groupId: group.id, id: child.id })].loading ? 'chat.testing' : 'chat.test')) + '</button>' +
            '<button type="button" class="chat-model-use' + (active ? ' is-active' : '') + '" data-action="use-child" data-group-id="' + escapeAttr(group.id) + '" data-id="' + escapeAttr(child.id) + '">' + escapeHtml(t(active ? 'chat.models.active' : 'chat.models.use')) + '</button>' +
            '<button type="button" class="chat-model-action" data-action="edit-child" data-group-id="' + escapeAttr(group.id) + '" data-id="' + escapeAttr(child.id) + '" title="' + escapeAttr(t('chat.models.edit')) + '">' + SVG.edit + '</button>' +
            '<button type="button" class="chat-model-action danger" data-action="delete-child" data-group-id="' + escapeAttr(group.id) + '" data-id="' + escapeAttr(child.id) + '" title="' + escapeAttr(t('chat.models.delete')) + '">' + SVG.trash + '</button>' +
            '</div></div>';
    }

    function groupCard(group) {
        return '<div class="chat-model-card" data-group-card="' + escapeAttr(group.id) + '">' +
            '<div class="chat-model-card-head">' +
            '<div class="chat-model-avatar">' + escapeHtml(avatarText(group.name)) + '</div>' +
            '<div class="chat-model-info"><span class="chat-model-name">' + escapeHtml(group.name) + '</span>' +
            '<span class="chat-model-meta">' + escapeHtml(t('chat.models.children', { count: group.models.length })) + '</span>' +
            '<span class="chat-model-url">' + escapeHtml(group.baseUrl || '—') + '</span></div>' +
            '<div class="chat-model-actions">' +
            '<button type="button" class="chat-model-action" data-action="edit-group" data-id="' + escapeAttr(group.id) + '" title="' + escapeAttr(t('chat.models.edit')) + '">' + SVG.edit + '</button>' +
            '<button type="button" class="chat-model-action danger" data-action="delete-group" data-id="' + escapeAttr(group.id) + '" title="' + escapeAttr(t('chat.models.delete')) + '">' + SVG.trash + '</button>' +
            '</div></div>' +
            '<div class="chat-model-children">' +
            group.models.map(function (child) { return childRow(group, child); }).join('') +
            '<button type="button" class="chat-model-add-child" data-action="add-child" data-group-id="' + escapeAttr(group.id) + '">' + SVG.plus + '<span>' + escapeHtml(t('chat.models.addChild')) + '</span></button>' +
            '</div></div>';
    }

    function renderModelManager() {
        if (!state) return;
        dom.singleList.innerHTML = state.models.singles.length
            ? state.models.singles.map(singleCard).join('')
            : '<div class="chat-model-empty">' + escapeHtml(t('chat.models.emptySingles')) + '</div>';
        dom.groupList.innerHTML = state.models.groups.length
            ? state.models.groups.map(groupCard).join('')
            : '<div class="chat-model-empty">' + escapeHtml(t('chat.models.emptyGroups')) + '</div>';
    }

    function openModelForm(kind, options) {
        const opts = options || {};
        const isChild = kind === 'child';
        const isGroup = kind === 'group';
        let record = null;
        let group = null;
        let child = null;
        if (kind === 'single' && opts.id) record = findSingle(opts.id);
        if (kind === 'group' && opts.id) record = findGroup(opts.id);
        if (isChild) {
            group = findGroup(opts.groupId);
            if (!group) return;
            if (opts.id) child = group.models.find(function (item) { return item.id === opts.id; });
        }

        dom.modelForm.reset();
        showFormError('');
        dom.modelEditKind.value = kind;
        dom.modelEditId.value = opts.id || '';
        dom.modelEditGroupId.value = opts.groupId || '';
        dom.modelName.value = record ? record.name : (child ? child.name : '');
        dom.modelModelId.value = record ? (record.modelId || '') : (child ? child.modelId : '');
        dom.modelBaseUrl.value = group ? group.baseUrl : (record ? record.baseUrl : '');
        dom.modelApiKey.value = group ? group.apiKey : (record ? record.apiKey : '');
        dom.modelAuthMode.value = group ? group.authMode : (record ? record.authMode : 'bearer');
        const extra = group ? group.extraHeaders : (record ? record.extraHeaders : null);
        dom.modelExtraHeaders.value = extra && Object.keys(extra).length ? JSON.stringify(extra, null, 2) : '';
        dom.modelApiKey.type = 'password';
        dom.toggleKey.classList.remove('visible');
        dom.modelIdOptions.innerHTML = '';

        const baseField = dom.modelBaseUrl.closest('.chat-field');
        const keyField = dom.modelApiKey.closest('.chat-field');
        const idField = dom.modelModelId.closest('.chat-field');
        const advanced = dom.modelForm.querySelector('.chat-advanced');
        baseField.classList.toggle('hidden', isChild);
        keyField.classList.toggle('hidden', isChild);
        idField.classList.toggle('hidden', isGroup);
        advanced.classList.toggle('hidden', isChild);

        let titleKey = 'chat.models.formSingleAdd';
        if (kind === 'single') titleKey = opts.id ? 'chat.models.formSingleEdit' : 'chat.models.formSingleAdd';
        if (kind === 'group') titleKey = opts.id ? 'chat.models.formGroupEdit' : 'chat.models.formGroupAdd';
        if (kind === 'child') titleKey = opts.id ? 'chat.models.formChildEdit' : 'chat.models.formChildAdd';
        dom.modelEditTitle.textContent = t(titleKey);
        openModal('modelEditModal');
        setTimeout(function () { dom.modelName.focus(); }, 30);
    }

    function validBaseUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    function readExtraHeaders() {
        const text = dom.modelExtraHeaders.value.trim();
        if (!text) return {};
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            throw new Error(t('chat.error.headers'));
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('chat.error.headers'));
        const result = {};
        Object.keys(parsed).forEach(function (key) {
            if (!key || parsed[key] == null) return;
            result[key] = String(parsed[key]);
        });
        return result;
    }

    function saveModelForm(event) {
        if (event) event.preventDefault();
        const kind = dom.modelEditKind.value;
        const editId = dom.modelEditId.value;
        const groupId = dom.modelEditGroupId.value;
        const nameInput = dom.modelName.value.trim();
        const baseUrl = dom.modelBaseUrl.value.trim().replace(/\/+$/, '');
        const apiKey = dom.modelApiKey.value.trim();
        const modelId = dom.modelModelId.value.trim();
        let extraHeaders;
        try {
            extraHeaders = readExtraHeaders();
        } catch (error) {
            showFormError(error.message);
            return;
        }

        if (kind === 'single') {
            if (!baseUrl) return showFormError(t('chat.error.baseUrl'));
            if (!validBaseUrl(baseUrl)) return showFormError(t('chat.error.baseUrl'));
            if (!modelId) return showFormError(t('chat.error.modelId'));
            const existing = editId ? findSingle(editId) : null;
            const payload = {
                id: existing ? existing.id : uid(),
                name: nameInput || modelId,
                baseUrl: baseUrl,
                apiKey: apiKey,
                authMode: dom.modelAuthMode.value,
                extraHeaders: extraHeaders,
                modelId: modelId
            };
            if (existing) Object.assign(existing, payload);
            else state.models.singles.push(payload);
            delete testResults[refKey({ kind: 'single', id: payload.id })];
        } else if (kind === 'group') {
            if (!baseUrl) return showFormError(t('chat.error.baseUrl'));
            if (!validBaseUrl(baseUrl)) return showFormError(t('chat.error.baseUrl'));
            const existing = editId ? findGroup(editId) : null;
            const payload = {
                id: existing ? existing.id : uid(),
                name: nameInput || t('chat.models.group'),
                baseUrl: baseUrl,
                apiKey: apiKey,
                authMode: dom.modelAuthMode.value,
                extraHeaders: extraHeaders,
                models: existing ? existing.models : []
            };
            if (existing) Object.assign(existing, payload);
            else state.models.groups.push(payload);
            Object.keys(testResults).forEach(function (key) {
                if (key.indexOf('g:' + payload.id + ':') === 0) delete testResults[key];
            });
        } else if (kind === 'child') {
            const group = findGroup(groupId);
            if (!group) return showFormError(t('chat.error.send'));
            if (!modelId) return showFormError(t('chat.error.modelId'));
            const existing = editId ? group.models.find(function (item) { return item.id === editId; }) : null;
            const payload = {
                id: existing ? existing.id : uid(),
                name: nameInput || modelId,
                modelId: modelId
            };
            if (existing) Object.assign(existing, payload);
            else group.models.push(payload);
            delete testResults[refKey({ kind: 'group', groupId: group.id, id: payload.id })];
        } else {
            return;
        }

        closeModal('modelEditModal');
        renderModelManager();
        renderPicker();
        renderTabList();
        renderModelUi();
        saveState();
        toast(t('chat.saved'));
    }

    async function fetchModels() {
        const kind = dom.modelEditKind.value;
        let baseUrl = dom.modelBaseUrl.value.trim();
        let apiKey = dom.modelApiKey.value.trim();
        let authMode = dom.modelAuthMode.value;
        if (kind === 'child') {
            const group = findGroup(dom.modelEditGroupId.value);
            if (!group) return showFormError(t('chat.error.send'));
            baseUrl = group.baseUrl;
            apiKey = group.apiKey;
            authMode = group.authMode;
        }
        if (!baseUrl) return showFormError(t('chat.error.baseUrl'));
        if (!validBaseUrl(baseUrl)) return showFormError(t('chat.error.baseUrl'));
        let extraHeaders = {};
        try {
            extraHeaders = readExtraHeaders();
        } catch (error) {
            return showFormError(error.message);
        }
        const original = dom.fetchModelsBtn.textContent;
        dom.fetchModelsBtn.disabled = true;
        dom.fetchModelsBtn.textContent = t('chat.loading');
        try {
            const data = await apiRequest('POST', '/chat/models', {
                baseUrl: baseUrl,
                apiKey: apiKey,
                authMode: authMode,
                extraHeaders: extraHeaders
            });
            const models = data && Array.isArray(data.models) ? data.models : [];
            dom.modelIdOptions.innerHTML = models.map(function (model) {
                return '<option value="' + escapeAttr(model.id) + '">' + escapeHtml(model.name || model.id) + '</option>';
            }).join('');
            if (models.length && !dom.modelModelId.value) dom.modelModelId.value = models[0].id;
            if (models.length) showFormError('');
            toast(t('chat.models.fetched', { count: models.length }));
        } catch (error) {
            const message = error && error.data && error.data.message ? error.data.message : (error && error.message ? error.message : t('chat.error.fetchModels'));
            showFormError(message);
        } finally {
            dom.fetchModelsBtn.disabled = false;
            dom.fetchModelsBtn.textContent = original;
        }
    }

    function clearModelRefs(predicate) {
        state.tabs.forEach(function (tab) {
            if (predicate(tab.model)) tab.model = null;
        });
        if (predicate(state.activeModel)) state.activeModel = null;
    }

    function deleteSingle(id) {
        const model = findSingle(id);
        if (!model) return;
        askConfirm(t('chat.models.deleteSingleTitle'), t('chat.models.deleteSingleText', { name: model.name }), function () {
            state.models.singles = state.models.singles.filter(function (item) { return item.id !== id; });
            delete testResults['s:' + id];
            clearModelRefs(function (ref) { return ref && ref.kind === 'single' && ref.id === id; });
            renderModelManager();
            renderPicker();
            renderTabList();
            renderModelUi();
            saveState();
            toast(t('chat.deleted'));
        });
    }

    function deleteGroup(id) {
        const group = findGroup(id);
        if (!group) return;
        askConfirm(t('chat.models.deleteGroupTitle'), t('chat.models.deleteGroupText', { name: group.name, count: group.models.length }), function () {
            state.models.groups = state.models.groups.filter(function (item) { return item.id !== id; });
            Object.keys(testResults).forEach(function (key) {
                if (key.indexOf('g:' + id + ':') === 0) delete testResults[key];
            });
            clearModelRefs(function (ref) { return ref && ref.kind === 'group' && ref.groupId === id; });
            renderModelManager();
            renderPicker();
            renderTabList();
            renderModelUi();
            saveState();
            toast(t('chat.deleted'));
        });
    }

    function deleteChild(groupId, childId) {
        const group = findGroup(groupId);
        if (!group) return;
        const child = group.models.find(function (item) { return item.id === childId; });
        if (!child) return;
        askConfirm(t('chat.models.deleteChildTitle'), t('chat.models.deleteChildText', { name: child.name }), function () {
            group.models = group.models.filter(function (item) { return item.id !== childId; });
            delete testResults['g:' + groupId + ':' + childId];
            clearModelRefs(function (ref) { return ref && ref.kind === 'group' && ref.groupId === groupId && ref.id === childId; });
            renderModelManager();
            renderPicker();
            renderTabList();
            renderModelUi();
            saveState();
            toast(t('chat.deleted'));
        });
    }

    function bindEvents() {
        document.querySelectorAll('[data-close]').forEach(function (el) {
            el.addEventListener('click', function () {
                const id = el.getAttribute('data-close');
                if (id === 'confirmModal') confirmAction = null;
                closeModal(id);
            });
        });

        dom.confirmCancel.addEventListener('click', function () {
            confirmAction = null;
            closeModal('confirmModal');
        });

        dom.confirmOk.addEventListener('click', function () {
            const action = confirmAction;
            confirmAction = null;
            closeModal('confirmModal');
            if (action) action();
        });

        dom.tabList.addEventListener('click', function (event) {
            const item = event.target.closest('.chat-tab-item');
            if (!item) return;
            if (event.target.tagName === 'INPUT') return;
            const id = item.getAttribute('data-tab-id');
            const actionEl = event.target.closest('[data-action]');
            const action = actionEl ? actionEl.getAttribute('data-action') : '';
            if (action === 'rename') {
                event.stopPropagation();
                startRename(id);
            } else if (action === 'pin') {
                event.stopPropagation();
                pinTab(id);
            } else if (action === 'close') {
                event.stopPropagation();
                closeTab(id);
            } else {
                activateTab(id);
            }
        });

        dom.tabList.addEventListener('dblclick', function (event) {
            const item = event.target.closest('.chat-tab-item');
            if (!item) return;
            if (!event.target.closest('.chat-tab-main')) return;
            startRename(item.getAttribute('data-tab-id'));
        });

        dom.newChatBtn.addEventListener('click', function () {
            if (streaming) stopStream();
            const previous = activeTab();
            if (previous) {
                previous.draft = dom.input.value;
                previous.scrollTop = dom.messages.scrollTop;
            }
            const tab = makeTab(newTabTitle());
            tab.autoTitle = true;
            state.tabs.push(tab);
            state.activeTabId = tab.id;
            dom.input.value = '';
            pendingAttachments = [];
            updatePendingAttachments();
            closeSlashMenu();
            autoResize();
            renderTabList();
            renderMessages('bottom');
            renderModelUi();
            closeSidebar();
            dom.input.focus();
            saveState();
        });

        dom.modelManagerBtn.addEventListener('click', openModelManager);
        dom.pickerManage.addEventListener('click', openModelManager);

        dom.modelBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            if (pickerOpen) closePicker();
            else openPicker();
        });

        dom.pickerList.addEventListener('click', function (event) {
            const item = event.target.closest('.chat-picker-item');
            if (!item) return;
            const kind = item.getAttribute('data-kind');
            const ref = kind === 'group'
                ? { kind: 'group', groupId: item.getAttribute('data-group-id'), id: item.getAttribute('data-id') }
                : { kind: 'single', id: item.getAttribute('data-id') };
            selectModel(ref);
            closePicker();
        });

        dom.modelTabs.addEventListener('click', function (event) {
            const button = event.target.closest('[data-model-tab]');
            if (!button) return;
            const name = button.getAttribute('data-model-tab');
            dom.modelTabs.querySelectorAll('button').forEach(function (item) {
                item.classList.toggle('active', item === button);
            });
            $('modelTabSingles').classList.toggle('hidden', name !== 'singles');
            $('modelTabGroups').classList.toggle('hidden', name !== 'groups');
        });

        dom.addSingleBtn.addEventListener('click', function () { openModelForm('single', {}); });
        dom.addGroupBtn.addEventListener('click', function () { openModelForm('group', {}); });

        function handleModelAction(event) {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl) return;
            const action = actionEl.getAttribute('data-action');
            const id = actionEl.getAttribute('data-id');
            const groupId = actionEl.getAttribute('data-group-id');
            if (action === 'test-single') {
                testModel({ kind: 'single', id: id });
            } else if (action === 'test-child') {
                testModel({ kind: 'group', groupId: groupId, id: id });
            } else if (action === 'use-single') {
                selectModel({ kind: 'single', id: id });
                closeModal('modelModal');
            } else if (action === 'edit-single') {
                openModelForm('single', { id: id });
            } else if (action === 'delete-single') {
                deleteSingle(id);
            } else if (action === 'edit-group') {
                openModelForm('group', { id: id });
            } else if (action === 'delete-group') {
                deleteGroup(id);
            } else if (action === 'add-child') {
                openModelForm('child', { groupId: groupId });
            } else if (action === 'use-child') {
                selectModel({ kind: 'group', groupId: groupId, id: id });
                closeModal('modelModal');
            } else if (action === 'edit-child') {
                openModelForm('child', { groupId: groupId, id: id });
            } else if (action === 'delete-child') {
                deleteChild(groupId, id);
            }
        }

        dom.singleList.addEventListener('click', handleModelAction);
        dom.groupList.addEventListener('click', handleModelAction);

        dom.modelForm.addEventListener('submit', saveModelForm);
        dom.fetchModelsBtn.addEventListener('click', fetchModels);

        dom.toggleKey.addEventListener('click', function () {
            const visible = dom.modelApiKey.type === 'text';
            dom.modelApiKey.type = visible ? 'password' : 'text';
            dom.toggleKey.classList.toggle('visible', !visible);
        });

        dom.attachBtn.addEventListener('click', function () { dom.attachInput.click(); });
        dom.attachInput.addEventListener('change', function () { addFiles(dom.attachInput.files); });

        dom.attachmentList.addEventListener('click', function (event) {
            const button = event.target.closest('[data-remove-attachment]');
            if (!button) return;
            removePendingAttachment(button.getAttribute('data-remove-attachment'));
        });

        dom.input.addEventListener('input', function () {
            const tab = activeTab();
            if (tab) tab.draft = dom.input.value;
            autoResize();
            renderSlashMenu();
            saveState();
        });
        dom.input.addEventListener('keydown', function (event) {
            const menuOpen = dom.slashMenu && !dom.slashMenu.classList.contains('hidden');
            if (menuOpen) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveSlashSelection(1);
                    return;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveSlashSelection(-1);
                    return;
                }
                if (event.key === 'Tab') {
                    event.preventDefault();
                    applySlashSelection();
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSlashMenu();
                    return;
                }
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                    event.preventDefault();
                    if (slashItems[slashIndex]) executeSlashCommand(slashItems[slashIndex].command);
                    return;
                }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                handleSendAction();
            }
        });

        dom.sendBtn.addEventListener('click', handleSendAction);

        dom.slashMenu.addEventListener('click', function (event) {
            const item = event.target.closest('[data-command]');
            if (!item) return;
            executeSlashCommand(item.getAttribute('data-command'));
        });

        document.addEventListener('pointerdown', function (event) {
            if (!dom.slashMenu || dom.slashMenu.classList.contains('hidden')) return;
            if (event.target.closest('#slashMenu') || event.target.closest('#composer')) return;
            closeSlashMenu();
        });

        dom.scrollBottomBtn.addEventListener('click', function () { scrollToBottom(true); });

        dom.messages.addEventListener('scroll', function () {
            const tab = activeTab();
            if (tab) tab.scrollTop = dom.messages.scrollTop;
            updateScrollButton();
        }, { passive: true });

        dom.messageList.addEventListener('click', function (event) {
            const codeButton = event.target.closest('[data-code-copy]');
            if (codeButton) {
                const codeEl = codeButton.closest('.chat-code').querySelector('code');
                const label = codeButton.querySelector('span');
                copyText(codeEl ? codeEl.textContent : '').then(function () {
                    if (label) label.textContent = t('chat.copied');
                    codeButton.classList.add('copied');
                    setTimeout(function () {
                        if (label) label.textContent = t('chat.copyCode');
                        codeButton.classList.remove('copied');
                    }, 1600);
                }).catch(function () { });
                return;
            }
            const copyButton = event.target.closest('[data-copy-msg]');
            if (!copyButton) return;
            const tab = activeTab();
            if (!tab) return;
            const message = tab.messages.find(function (item) {
                return item.id === copyButton.getAttribute('data-copy-msg');
            });
            if (!message) return;
            copyText(message.content).then(function () {
                toast(t('chat.copied'));
            }).catch(function () { });
        });

        dom.suggestions.addEventListener('click', function (event) {
            const button = event.target.closest('[data-prompt-key]');
            if (!button) return;
            dom.input.value = t(button.getAttribute('data-prompt-key'));
            dom.input.dispatchEvent(new Event('input', { bubbles: true }));
            autoResize();
            dom.input.focus();
        });

        dom.sidebarToggle.addEventListener('click', function () {
            if (dom.sidebar.classList.contains('open')) closeSidebar();
            else openSidebar();
        });
        dom.sidebarBackdrop.addEventListener('click', closeSidebar);

        dom.backBtn.addEventListener('click', function () {
            flushSave();
            slideOut(dom.app, 'left', function () { window.location.href = 'index.html'; });
        });

        dom.logoutBtn.addEventListener('click', async function () {
            if (streaming) stopStream();
            flushSave();
            await logoutUser();
            slideOut(dom.app, 'left', function () { window.location.href = 'index.html'; });
        });

        dom.themeToggle.addEventListener('click', toggleChatTheme);
        dom.settingsBtn.addEventListener('click', openSettings);
        dom.settingsTheme.addEventListener('click', function (event) {
            const button = event.target.closest('[data-chat-theme]');
            if (!button) return;
            setChatTheme(button.getAttribute('data-chat-theme'));
        });
        dom.showThinkingToggle.addEventListener('change', function () {
            setShowThinking(dom.showThinkingToggle.checked);
        });

        document.addEventListener('pointerdown', function (event) {
            if (!pickerOpen) return;
            if (dom.picker.contains(event.target) || dom.modelBtn.contains(event.target)) return;
            closePicker();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            if (dom.slashMenu && !dom.slashMenu.classList.contains('hidden')) {
                closeSlashMenu();
            } else if (!dom.confirmModal.classList.contains('hidden')) {
                confirmAction = null;
                closeModal('confirmModal');
            } else if (!dom.settingsModal.classList.contains('hidden')) {
                closeModal('settingsModal');
            } else if (!dom.modelEditModal.classList.contains('hidden')) {
                closeModal('modelEditModal');
            } else if (pickerOpen) {
                closePicker();
            } else if (!dom.modelModal.classList.contains('hidden')) {
                closeModal('modelModal');
            } else {
                closeSidebar();
            }
        });

        window.addEventListener('beforeunload', flushSave);

        dom.messages.addEventListener('click', function (event) {
            if (event.target.closest('a')) return;
            const image = event.target.closest('.chat-msg-image img');
            if (image) window.open(image.src, '_blank', 'noopener');
        });
    }

    (async function init() {
        const user = await requireAuth();
        if (!user) return;
        userId = user.id;
        storeKey = STORAGE_PREFIX + userId;
        state = loadState();
        dom.userName.textContent = user.displayName || user.username;
        dom.userName.title = user.displayName || user.username;
        dom.userAvatar.textContent = initials(user.displayName || user.username);
        applyI18n();
        if (dom.slashMenu) dom.slashMenu.setAttribute('aria-label', t('chat.cmd.title'));
        showThinking = localStorage.getItem(SHOW_THINKING_KEY) === '1';
        applyChatTheme(localStorage.getItem(THEME_KEY) || 'dark');
        syncThinkingSetting();
        bindEvents();
        renderTabList();
        renderModelUi();
        const initialTab = activeTab();
        if (initialTab) dom.input.value = initialTab.draft || '';
        renderSlashMenu();
        renderMessages(initialTab && initialTab.scrollTop ? initialTab.scrollTop : 'bottom');
        renderModelManager();
        renderPicker();
        updatePendingAttachments();
        autoResize();
        updateScrollButton();
        slideIn(dom.app, 'right');
    })();
})();
