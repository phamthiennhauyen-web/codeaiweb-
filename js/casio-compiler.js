// ==========================================
// Casio Compiler workspace
// ==========================================

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    const SETTINGS_KEY = 'codeai_editor_settings';
    const DEFAULT_SETTINGS = {
        tabSize: 4,
        lineNumbers: true,
        zoomFun: false,
        zoomScale: 3.5
    };
    const ZOOM_MIN = 1.5;
    const ZOOM_MAX = 4;
    const HEX_BYTES_PER_LINE = 16;
    const HEX_LINES_PER_GROUP = 6;
    const CASIO_KEY = 'codeai_casio_settings';
    const DEFAULT_CODE = [
        '# Casio assembly',
        'org 0xE9E0',
        '',
        'text:',
        'str "hello"',
        ''
    ].join('\n');

    // Autocomplete definitions
    const COMPLETION_DIRECTIVES = [
        'org', 'str', 'hex', 'goto', 'adr_of'
    ];
    const COMPLETION_INSTRUCTIONS = [
        'mov', 'add', 'sub', 'cmp', 'l', 'st', 'push', 'pop',
        'b', 'bc', 'bl', 'call', 'rt', 'rti', 'nop',
        'ei', 'di', 'sc', 'rc', 'cplc', 'cmp_ea'
    ];
    const COMPLETION_SPECIAL_PATTERNS = [
        'push ea', 'pop ea', 'push lr', 'pop pc',
        '0x00', '[+4784]', '[-2]'
    ];
    const COMPLETION_REGISTERS = {
        qr: ['qr0', 'qr1', 'qr2', 'qr3', 'qr4', 'qr5', 'qr6', 'qr7', 'qr8'],
        xr: ['xr0', 'xr4', 'xr8', 'xr12'],
        er: ['er2', 'er4', 'er5', 'er6', 'er8', 'er10', 'er12'],
        r: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'],
        special: ['pc', 'sp', 'lr', 'ea', 'dsr', 'csr']
    };

    let currentTheme = window.CodeTheme ? window.CodeTheme.get() : 'light';
    let settings = loadSettings();
    let casioSettings = loadCasioSettings();
    let user = null;
    let tabsKey = '';
    let savedKey = '';
    let tabs = [];
    let activeId = null;
    let tabSeq = 1;
    let untitledSeq = 1;
    let editor = null;
    let monacoReady = false;
    let zoomed = false;
    let splitRatio = 0.62;
    let compileInFlight = false;
    let currentOutput = '';
    let compiledByModel = {};
    let confirmState = null;
    let confirmAnchor = null;
    let toastTimer = null;
    let persistTimer = null;
    let labelRequest = 0;
    let labelCache = {};
    let completionLabelCache = { 580: [], 880: [] };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        user = await requireAuth();
        if (!user) return;

        tabsKey = 'codeai_casio_tabs_' + user.id;
        savedKey = 'codeai_casio_saved_' + user.id;

        $('userName').textContent = user.displayName || user.username || '';
        applyI18n();
        bindHeader();
        bindToolbar();
        bindSettings();
        bindModelPicker();
        bindLabels();
        bindTabs();
        bindSplitter();
        bindOutput();
        bindSaved();
        bindConfirmMenu();

        loadTabs();
        renderTabs();
        applyTheme(currentTheme);
        applyModelUI();
        applyFormatUI();
        resetOutput();
        updateSettingsUI();
        initMonaco();
        slideIn($('casioView'), 'right');
    }

    // ---------- Settings (shared with the main editor) ----------

    function loadSettings() {
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        } catch (e) {
            stored = {};
        }
        const out = Object.assign({}, DEFAULT_SETTINGS, stored);
        out.tabSize = [2, 4, 8].indexOf(out.tabSize) >= 0 ? out.tabSize : DEFAULT_SETTINGS.tabSize;
        out.lineNumbers = !!out.lineNumbers;
        out.zoomFun = !!out.zoomFun;
        const z = parseFloat(out.zoomScale);
        out.zoomScale = isNaN(z) ? DEFAULT_SETTINGS.zoomScale : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
        return out;
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) { /* ignore */ }
    }

    function loadCasioSettings() {
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem(CASIO_KEY) || '{}') || {};
        } catch (e) {
            stored = {};
        }
        return {
            model: stored.model === '880' ? '880' : '580',
            format: stored.format === 'key' ? 'key' : 'hex'
        };
    }

    function saveCasioSettings() {
        try {
            localStorage.setItem(CASIO_KEY, JSON.stringify(casioSettings));
        } catch (e) { /* ignore */ }
    }

    function applyTheme(theme) {
        currentTheme = window.CodeTheme ? window.CodeTheme.apply(theme) : (theme === 'dark' ? 'dark' : 'light');
        if (monacoReady && window.monaco) {
            window.monaco.editor.setTheme(currentTheme === 'dark' ? 'vs-dark' : 'vs');
        }
        updateSettingsUI();
    }

    function applySettings() {
        if (editor) {
            editor.updateOptions({
                tabSize: settings.tabSize,
                lineNumbers: settings.lineNumbers ? 'on' : 'off'
            });
        }
        if (!settings.zoomFun) zoomOut();
        updateSettingsUI();
    }

    function updateSettingsUI() {
        const tabSeg = $('setTabSize');
        if (tabSeg) {
            tabSeg.querySelectorAll('button').forEach((b) => {
                b.classList.toggle('active', parseInt(b.getAttribute('data-val'), 10) === settings.tabSize);
            });
        }
        const themeSeg = $('setTheme');
        if (themeSeg) {
            themeSeg.querySelectorAll('button').forEach((b) => {
                b.classList.toggle('active', b.getAttribute('data-val') === currentTheme);
            });
        }
        const ln = $('setLineNumbers');
        if (ln) ln.checked = settings.lineNumbers;
        const zf = $('setZoomFun');
        if (zf) zf.checked = settings.zoomFun;
        const zs = $('setZoom');
        if (zs) zs.value = String(settings.zoomScale);
        const zv = $('setZoomValue');
        if (zv) zv.textContent = settings.zoomScale.toFixed(1) + 'x';
    }

    function openSettings() {
        updateSettingsUI();
        $('settingsModal').classList.remove('hidden');
    }

    function closeSettings() {
        $('settingsModal').classList.add('hidden');
    }

    function bindSettings() {
        $('settingsBtn').addEventListener('click', openSettings);
        $('settingsClose').addEventListener('click', closeSettings);
        $('settingsModal').addEventListener('mousedown', (e) => {
            if (e.target === $('settingsModal')) closeSettings();
        });

        $('setTheme').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-val]');
            if (!btn) return;
            applyTheme(btn.getAttribute('data-val'));
        });

        $('setTabSize').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-val]');
            if (!btn) return;
            settings.tabSize = parseInt(btn.getAttribute('data-val'), 10);
            saveSettings();
            applySettings();
        });

        $('setLineNumbers').addEventListener('change', (e) => {
            settings.lineNumbers = e.target.checked;
            saveSettings();
            applySettings();
        });

        $('setZoomFun').addEventListener('change', (e) => {
            settings.zoomFun = e.target.checked;
            saveSettings();
            applySettings();
        });

        $('setZoom').addEventListener('input', (e) => {
            const z = parseFloat(e.target.value);
            settings.zoomScale = isNaN(z) ? DEFAULT_SETTINGS.zoomScale : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
            saveSettings();
            updateSettingsUI();
            if (settings.zoomFun) {
                zoomOut();
                zoomIn();
            }
        });

        $('setReset').addEventListener('click', (e) => {
            openConfirmMenu(e.currentTarget, {
                title: t('casio.confirmResetTitle'),
                message: t('casio.confirmResetMessage'),
                confirmLabel: t('casio.resetSettings'),
                onConfirm: () => {
                    settings = Object.assign({}, DEFAULT_SETTINGS, { live: settings.live });
                    saveSettings();
                    applySettings();
                    applyTheme('light');
                }
            });
        });
    }

    // ---------- Destructive action menu ----------

    function bindConfirmMenu() {
        $('confirmCancel').addEventListener('click', closeConfirmMenu);
        $('confirmOk').addEventListener('click', () => {
            const action = confirmState && confirmState.onConfirm;
            closeConfirmMenu();
            if (action) action();
        });

        document.addEventListener('mousedown', (e) => {
            if ($('confirmMenu').classList.contains('hidden')) return;
            if (confirmAnchor && (e.target === confirmAnchor || confirmAnchor.contains(e.target))) return;
            if (e.target.closest('#confirmMenu')) return;
            closeConfirmMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('confirmMenu').classList.contains('hidden')) {
                e.preventDefault();
                closeConfirmMenu();
            }
        });
    }

    function openConfirmMenu(anchor, options) {
        const menu = $('confirmMenu');
        confirmAnchor = anchor || null;
        confirmState = { onConfirm: options.onConfirm || null };

        $('confirmTitle').textContent = options.title || t('casio.confirm');
        $('confirmMessage').textContent = options.message || '';
        $('confirmCancel').textContent = t('casio.cancel');
        $('confirmOk').textContent = options.confirmLabel || t('casio.delete');

        menu.classList.remove('hidden');
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
        const box = menu.getBoundingClientRect();
        const margin = 8;
        let left = rect.right - box.width;
        let top = rect.bottom + margin;
        left = Math.min(Math.max(margin, left), window.innerWidth - box.width - margin);
        if (top + box.height > window.innerHeight - margin) top = rect.top - box.height - margin;
        top = Math.min(Math.max(margin, top), window.innerHeight - box.height - margin);
        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(top) + 'px';
        menu.style.visibility = '';

        $('confirmCancel').focus();
    }

    function closeConfirmMenu() {
        const menu = $('confirmMenu');
        if (!menu || menu.classList.contains('hidden')) return;
        menu.classList.add('hidden');
        confirmState = null;
        confirmAnchor = null;
    }

    // ---------- Header / tabs ----------

    function bindHeader() {
        $('logoutBtn').addEventListener('click', async () => {
            await logoutUser();
            window.location.href = 'index.html';
        });
    }

    function bindTabs() {
        $('tabAdd').addEventListener('click', () => {
            const name = 'untitled-' + (untitledSeq++) + '.asm';
            addTab(name, '');
        });
    }

    function loadTabs() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(tabsKey) || 'null');
        } catch (e) {
            stored = null;
        }

        const list = stored && Array.isArray(stored.tabs) ? stored.tabs :
            (Array.isArray(stored) ? stored : []);
        tabs = list
            .filter((t) => t && typeof t.name === 'string')
            .map((t, index) => ({
                id: typeof t.id === 'string' && t.id ? t.id : 't' + (index + 1),
                name: t.name || ('untitled-' + (index + 1) + '.asm'),
                content: typeof t.content === 'string' ? t.content : '',
                model: null,
                viewState: null
            }));

        if (!tabs.length) {
            tabs = [{
                id: 't1',
                name: 'main.asm',
                content: DEFAULT_CODE,
                model: null,
                viewState: null
            }];
        }

        let maxTabSeq = 0;
        let maxUntitled = 0;
        tabs.forEach((tab) => {
            const idMatch = /^t(\d+)$/.exec(tab.id);
            if (idMatch) maxTabSeq = Math.max(maxTabSeq, parseInt(idMatch[1], 10));
            const nameMatch = /^untitled-(\d+)\.asm$/i.exec(tab.name);
            if (nameMatch) maxUntitled = Math.max(maxUntitled, parseInt(nameMatch[1], 10));
        });
        tabSeq = maxTabSeq + 1;
        untitledSeq = Math.max(maxUntitled, tabs.length) + 1;
        const wanted = stored && stored.activeId;
        activeId = tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id;
    }

    function getActiveTab() {
        return tabs.find((t) => t.id === activeId) || null;
    }

    function getContent(tab) {
        if (tab && tab.model) return tab.model.getValue();
        return tab ? (tab.content || '') : '';
    }

    function persistTabs() {
        if (!tabsKey) return;
        const payload = {
            activeId: activeId,
            tabs: tabs.map((t) => ({
                id: t.id,
                name: t.name,
                content: getContent(t)
            }))
        };
        try {
            localStorage.setItem(tabsKey, JSON.stringify(payload));
        } catch (e) { /* ignore */ }
    }

    function schedulePersist() {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(persistTabs, 300);
    }

    function renderTabs() {
        const bar = $('tabBar');
        if (!bar) return;
        closeConfirmMenu();
        const add = $('tabAdd');
        bar.querySelectorAll('.file-tab').forEach((el) => el.remove());

        tabs.forEach((tab) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'file-tab' + (tab.id === activeId ? ' active' : '');
            el.title = tab.name;

            const name = document.createElement('span');
            name.className = 'tab-name';
            name.textContent = tab.name;

            const close = document.createElement('span');
            close.className = 'tab-close';
            close.setAttribute('role', 'button');
            close.setAttribute('aria-label', t('editor.closeTab', { name: tab.name }));
            close.textContent = '\u00d7';

            close.addEventListener('click', (e) => {
                e.stopPropagation();
                requestCloseTab(tab.id, close);
            });

            el.appendChild(name);
            el.appendChild(close);
            el.addEventListener('click', () => activateTab(tab.id));
            bar.insertBefore(el, add);
        });
    }

    function makeModel(content) {
        return window.monaco.editor.createModel(content || '', 'casio-asm');
    }

    function addTab(name, content) {
        const tab = {
            id: 't' + (tabSeq++),
            name: name || ('untitled-' + (untitledSeq++) + '.asm'),
            content: content || '',
            model: null,
            viewState: null
        };
        if (monacoReady) tab.model = makeModel(tab.content);
        tabs.push(tab);
        activateTab(tab.id);
        persistTabs();
    }

    function activateTab(id, silent) {
        const tab = tabs.find((item) => item.id === id);
        if (!tab) return;
        const previous = getActiveTab();

        if (editor && monacoReady && previous && previous.model) {
            previous.viewState = editor.saveViewState();
        }

        activeId = tab.id;
        zoomOut();

        if (editor && monacoReady && tab.model) {
            editor.setModel(tab.model);
            if (tab.viewState) editor.restoreViewState(tab.viewState);
            if (!silent) editor.focus();
        }

        renderTabs();
        schedulePersist();
    }

    function requestCloseTab(id, anchor) {
        if (tabs.length === 1) {
            showToast(t('casio.lastTab'));
            return;
        }
        const tab = tabs.find((item) => item.id === id);
        if (!tab) return;
        openConfirmMenu(anchor, {
            title: t('casio.confirmDeleteTabTitle'),
            message: t('casio.confirmDeleteTabMessage', { name: tab.name }),
            confirmLabel: t('casio.deleteTab'),
            onConfirm: () => closeTab(id)
        });
    }

    function closeTab(id) {
        if (tabs.length === 1) {
            showToast(t('casio.lastTab'));
            return;
        }
        const index = tabs.findIndex((tab) => tab.id === id);
        if (index < 0) return;

        const closing = tabs[index];
        const wasActive = closing.id === activeId;
        let next = null;

        if (wasActive) {
            next = tabs[index + 1] || tabs[index - 1];
        }

        tabs.splice(index, 1);
        if (wasActive && next) {
            activeId = next.id;
            if (editor && monacoReady && next.model) {
                editor.setModel(next.model);
                if (next.viewState) editor.restoreViewState(next.viewState);
            }
        }

        if (closing.model) closing.model.dispose();
        renderTabs();
        persistTabs();
    }

    // ---------- Monaco ----------

    function initMonaco() {
        if (!window.require) {
            showToast(t('casio.editorFailed'));
            return;
        }
        window.require.config({ paths: { vs: 'vendor/monaco/vs' } });
        window.require(['vs/editor/editor.main'], function () {
            // Register custom language
            monaco.languages.register({ id: 'casio-asm' });

            // Configure auto-closing pairs
            monaco.languages.setLanguageConfiguration('casio-asm', {
                autoClosingPairs: [
                    { open: '"', close: '"' },
                    { open: '[', close: ']' }
                ],
                brackets: [['[', ']']]
            });

            // Register completion provider
            monaco.languages.registerCompletionItemProvider('casio-asm', {
                triggerCharacters: [' ', ',', '\n', '_'],
                
                provideCompletionItems: (model, position) => {
                    const context = getCompletionContext(model, position);
                    const localLabels = parseWorkspaceLabels();
                    
                    // Combine labels
                    const apiLabels = completionLabelCache[casioSettings.model] || [];
                    const labels = [...apiLabels, ...localLabels];
                    const seen = new Set();
                    const allLabels = [];
                    labels.forEach((item) => {
                        if (seen.has(item.label)) return;
                        seen.add(item.label);
                        allLabels.push(item);
                    });
                    
                    // Context filtering
                    if (context === 'labels-only') {
                        return { suggestions: allLabels };
                    }
                    
                    // All items
                    const staticItems = buildStaticCompletionItems();
                    const specialItems = buildSpecialCompletionItems(model, position);
                    return {
                        suggestions: [...allLabels, ...staticItems, ...specialItems]
                    };
                }
            });

            monacoReady = true;

            tabs.forEach((tab) => {
                tab.model = makeModel(tab.content);
            });

            const active = getActiveTab();
            editor = window.monaco.editor.create($('monacoHost'), {
                model: active ? active.model : null,
                theme: currentTheme === 'dark' ? 'vs-dark' : 'vs',
                language: 'casio-asm',
                automaticLayout: true,
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                wrappingIndent: 'same',
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                tabSize: settings.tabSize,
                lineNumbers: settings.lineNumbers ? 'on' : 'off',
                insertSpaces: true,
                renderWhitespace: 'selection',
                smoothScrolling: true,
                padding: { top: 10 },
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: 'off'
            });

            editor.onDidChangeModelContent(() => {
                schedulePersist();
                setRunStatus(t('casio.ready'), '');
            });

            editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, runCompile);
            editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, saveCurrentTab);

            editor.onKeyDown(() => {
                if (!settings.zoomFun) return;
                setTimeout(zoomIn, 0);
            });

            $('casioView').addEventListener('mousedown', () => {
                if (settings.zoomFun) zoomOut();
            });

            applySplit();
            activateTab(activeId, true);
            editor.focus();
            const primaryModel = casioSettings.model;
            loadLabels(primaryModel).then(() => {
                const otherModel = primaryModel === '580' ? '880' : '580';
                loadLabels(otherModel);
            });
        });
    }

    // ---------- Zoom ----------

    function currentScale(el) {
        const tr = getComputedStyle(el).transform;
        if (!tr || tr === 'none') return 1;
        const m = tr.match(/matrix\(([^)]+)\)/);
        if (!m) return 1;
        return parseFloat(m[1].split(',')[0]) || 1;
    }

    function zoomIn() {
        if (!settings.zoomFun || !editor || !monacoReady) return;
        const viewEl = $('casioView');
        const pos = editor.getPosition();
        if (!pos) return;
        const vp = editor.getScrolledVisiblePosition(pos);
        if (!vp) return;

        const scale = currentScale(viewEl);
        const viewRect = viewEl.getBoundingClientRect();
        const hostRect = $('monacoHost').getBoundingClientRect();

        const hostLeft = (hostRect.left - viewRect.left) / scale;
        const hostTop = (hostRect.top - viewRect.top) / scale;
        const width = viewRect.width / scale;
        const height = viewRect.height / scale;

        const cx = hostLeft + vp.left + 2;
        const cy = hostTop + vp.top + vp.height / 2;

        const z = settings.zoomScale;
        const tx = -z * (cx - width / 2);
        const ty = -z * (cy - height / 2);
        zoomed = true;
        viewEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')';
    }

    function zoomOut() {
        const viewEl = $('casioView');
        if (viewEl) viewEl.style.transform = '';
        zoomed = false;
    }

    // ---------- Split ----------

    function applySplit() {
        $('paneCode').style.flex = '0 0 ' + (splitRatio * 100) + '%';
        if (editor) editor.layout();
    }

    function bindSplitter() {
        const splitter = $('splitter');
        const workspace = $('workspace');
        let dragging = false;

        splitter.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect = workspace.getBoundingClientRect();
            if (!rect.width) return;
            let ratio = (e.clientX - rect.left) / rect.width;
            ratio = Math.min(0.78, Math.max(0.28, ratio));
            splitRatio = ratio;
            $('paneCode').style.flex = '0 0 ' + (splitRatio * 100) + '%';
            if (editor) editor.layout();
        });

        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (editor) editor.layout();
        });
    }

    // ---------- Toolbar / files ----------

    function bindToolbar() {
        $('runBtn').addEventListener('click', runCompile);
        $('copyCodeBtn').addEventListener('click', () => {
            const tab = getActiveTab();
            if (!tab) return;
            copyText(getContent(tab), t('casio.copied'), t('casio.copyFailed'));
        });
        $('clearCodeBtn').addEventListener('click', (e) => {
            if (!editor) return;
            openConfirmMenu(e.currentTarget, {
                title: t('casio.confirmClearTitle'),
                message: t('casio.confirmClearMessage'),
                confirmLabel: t('casio.clearCode'),
                onConfirm: clearCurrentCode
            });
        });
        $('saveBtn').addEventListener('click', saveCurrentTab);
        $('openTabBtn').addEventListener('click', openSavedModal);
        $('openBtn').addEventListener('click', () => $('fileInput').click());
        $('downloadBtn').addEventListener('click', downloadCurrentTab);
        $('fileInput').addEventListener('change', openLocalFile);
        window.addEventListener('beforeunload', persistTabs);
    }

    function clearCurrentCode() {
        if (!editor) return;
        editor.setValue('');
        compiledByModel = {};
        setRunStatus(t('casio.ready'), '');
        resetOutput();
    }

    function openLocalFile(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 1024 * 1024) {
            showToast(t('casio.fileTooLarge'));
            return;
        }
        file.text().then((text) => {
            addTab(file.name || 'untitled.asm', text);
            showToast(t('casio.fileOpened', { name: file.name }));
        }).catch(() => {
            showToast(t('casio.fileOpenFailed'));
        });
    }

    function downloadCurrentTab() {
        const tab = getActiveTab();
        if (!tab) return;
        const blob = new Blob([getContent(tab)], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = tab.name || 'main.asm';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- Saved tabs ----------

    function loadSaved() {
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem(savedKey) || '[]');
        } catch (e) {
            saved = [];
        }
        if (!Array.isArray(saved)) return [];
        return saved.filter((item) => item && typeof item.name === 'string' && typeof item.content === 'string');
    }

    function saveCurrentTab() {
        const tab = getActiveTab();
        if (!tab) return;
        const saved = loadSaved().filter((item) => item.name !== tab.name);
        saved.unshift({
            name: tab.name,
            content: getContent(tab),
            savedAt: Date.now()
        });
        try {
            localStorage.setItem(savedKey, JSON.stringify(saved.slice(0, 100)));
            showToast(t('casio.savedOk'));
        } catch (e) {
            showToast(t('casio.saveFailed'));
        }
    }

    function bindSaved() {
        $('savedClose').addEventListener('click', closeSavedModal);
        $('savedModal').addEventListener('mousedown', (e) => {
            if (e.target === $('savedModal')) closeSavedModal();
        });
    }

    function openSavedModal() {
        renderSavedList();
        $('savedModal').classList.remove('hidden');
    }

    function closeSavedModal() {
        $('savedModal').classList.add('hidden');
    }

    function renderSavedList() {
        const list = $('savedList');
        list.textContent = '';
        const saved = loadSaved();

        if (!saved.length) {
            const empty = document.createElement('div');
            empty.className = 'saved-empty';
            empty.textContent = t('casio.savedEmpty');
            list.appendChild(empty);
            return;
        }

        saved.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'saved-item';

            const info = document.createElement('div');
            info.className = 'saved-info';
            const name = document.createElement('div');
            name.className = 'saved-name';
            name.textContent = item.name;
            const date = document.createElement('div');
            date.className = 'saved-date';
            date.textContent = new Date(item.savedAt || Date.now()).toLocaleString();
            info.appendChild(name);
            info.appendChild(date);

            const actions = document.createElement('div');
            actions.className = 'saved-actions';
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'sv-btn sv-open';
            open.textContent = t('casio.open');
            open.addEventListener('click', () => {
                closeSavedModal();
                addTab(item.name, item.content);
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'sv-btn sv-del';
            remove.textContent = t('casio.delete');
            remove.addEventListener('click', (e) => {
                openConfirmMenu(e.currentTarget, {
                    title: t('casio.confirmDeleteSavedTitle'),
                    message: t('casio.confirmDeleteSavedMessage', { name: item.name }),
                    confirmLabel: t('casio.delete'),
                    onConfirm: () => {
                        const next = loadSaved();
                        next.splice(index, 1);
                        localStorage.setItem(savedKey, JSON.stringify(next));
                        renderSavedList();
                    }
                });
            });

            actions.appendChild(open);
            actions.appendChild(remove);
            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
        });
    }

    // ---------- Output / compile ----------

    function bindOutput() {
        $('copyOutputBtn').addEventListener('click', () => {
            if (!currentOutput) {
                showToast(t('casio.emptyOutput'));
                return;
            }
            copyText(currentOutput, t('casio.copied'), t('casio.copyFailed'));
        });

        $('formatSeg').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-format]');
            if (!btn || btn.disabled) return;
            const format = btn.getAttribute('data-format');
            if (format !== 'hex' && format !== 'key') return;
            if (casioSettings.format === format) return;
            casioSettings.format = format;
            saveCasioSettings();
            applyFormatUI();
            renderCompiledOutput();
        });
    }

    function modelLabel(model) {
        return (model || casioSettings.model) === '880' ? 'fx-880BTG' : 'fx-580VN X';
    }

    function outputMeta(extra) {
        return modelLabel() + ' \u00b7 ' + casioSettings.format.toUpperCase() + (extra ? ' \u00b7 ' + extra : '');
    }

    function setOutput(text, isError, meta) {
        currentOutput = text || '';
        const out = $('outputText');
        out.textContent = currentOutput || t('casio.emptyOutput');
        out.classList.toggle('is-empty', !currentOutput);
        out.classList.toggle('is-error', !!isError && !!currentOutput);
        out.classList.remove('is-warning');
        $('outputMeta').textContent = meta || '';
    }

    function resetOutput() {
        setOutput('', false, outputMeta(t('casio.ready')));
    }

    function formatHexOutput(text) {
        const tokens = [];
        String(text || '').split(/\r?\n/).forEach((line) => {
            if (/^\s*===/.test(line)) return;
            const matches = line.match(/\b[0-9a-fA-F]{2}\b/g);
            if (matches) tokens.push(...matches.map((item) => item.toLowerCase()));
        });
        if (!tokens.length) return String(text || '').trim();

        const lines = [];
        for (let i = 0; i < tokens.length; i += HEX_BYTES_PER_LINE) {
            lines.push(tokens.slice(i, i + HEX_BYTES_PER_LINE).join(' '));
        }

        const grouped = [];
        lines.forEach((line, index) => {
            grouped.push(line);
            if ((index + 1) % HEX_LINES_PER_GROUP === 0 && index !== lines.length - 1) {
                grouped.push('');
            }
        });
        return grouped.join('\n');
    }

    function buildCompileResult(res, model, format) {
        const stdout = (res.stdout || '').trim();
        const stderr = (res.stderr || '').trim();
        const parts = [];
        if (stdout) {
            parts.push(format === 'hex' && res.ok ? formatHexOutput(stdout) : stdout);
        }
        if (stderr) parts.push(stderr);
        return {
            model: model,
            format: format,
            text: parts.join('\n\n') || t('casio.emptyResult'),
            isError: !res.ok,
            isWarning: !!stderr && res.ok,
            elapsed: res.elapsedMs != null ? res.elapsedMs + ' ms' : ''
        };
    }

    function setOutputResult(result) {
        if (!result) {
            resetOutput();
            return;
        }
        currentOutput = result.text || '';
        const out = $('outputText');
        out.textContent = currentOutput || t('casio.emptyOutput');
        out.classList.toggle('is-empty', !currentOutput);
        out.classList.toggle('is-error', !!result.isError && !!currentOutput);
        out.classList.toggle('is-warning', !result.isError && !!result.isWarning && !!currentOutput);
        $('outputMeta').textContent =
            modelLabel(result.model) + ' \u00b7 ' + result.format.toUpperCase() + (result.elapsed ? ' \u00b7 ' + result.elapsed : '');
    }

    function setStatusForOutputs(outputs) {
        const active = outputs[casioSettings.format];
        const hasError = outputs.hex.isError || outputs.key.isError;
        const hasWarning = outputs.hex.isWarning || outputs.key.isWarning;
        if (active.isError) setRunStatus(t('casio.error'), 'err');
        else if (hasError || hasWarning) setRunStatus(t('casio.warning'), 'busy');
        else setRunStatus(t('casio.done'), '');
    }

    function renderCompiledOutput() {
        const entry = compiledByModel[casioSettings.model];
        if (!entry) {
            resetOutput();
            setRunStatus(t('casio.ready'), '');
            return;
        }
        setOutputResult(entry.outputs[casioSettings.format]);
        setStatusForOutputs(entry.outputs);
    }

    function setCompileControlsDisabled(disabled) {
        $('runBtn').disabled = disabled;
        $('modelBtn').disabled = disabled;
        $('formatSeg').querySelectorAll('button[data-format]').forEach((btn) => {
            btn.disabled = disabled;
        });
    }

    function setRunStatus(text, state) {
        const el = $('runStatus');
        el.textContent = text || '';
        el.className = 'ed-status' + (state ? ' ' + state : '');
    }

    function humanError(err) {
        if (!err) return translateError(null);
        const key = 'err.' + (err.code || '');
        const dict = I18N[getLang()] || I18N.vi;
        if (dict[key] !== undefined) return translateError(err);
        return err.message || translateError(err);
    }

    async function compileOne(model, format, code) {
        try {
            const res = await ApiCasio.compile({
                model: model,
                format: format,
                code: code
            });
            return buildCompileResult(res, model, format);
        } catch (err) {
            return {
                model: model,
                format: format,
                text: humanError(err),
                isError: true,
                isWarning: false,
                elapsed: ''
            };
        }
    }

    async function runCompile() {
        if (!editor || compileInFlight) return;
        const code = editor.getValue();
        if (!code.trim()) {
            showToast(t('casio.codeEmpty'));
            return;
        }

        const reqModel = casioSettings.model;

        compileInFlight = true;
        zoomOut();
        setCompileControlsDisabled(true);
        $('runLabel').textContent = t('casio.compiling');
        setRunStatus(t('casio.compiling'), 'busy');
        $('outputMeta').textContent = modelLabel(reqModel) + ' \u00b7 HEX + KEY';

        try {
            compiledByModel = {};
            const [hexResult, keyResult] = await Promise.all([
                compileOne(reqModel, 'hex', code),
                compileOne(reqModel, 'key', code)
            ]);
            const outputs = { hex: hexResult, key: keyResult };
            compiledByModel[reqModel] = { outputs: outputs };
            renderCompiledOutput();
        } finally {
            compileInFlight = false;
            setCompileControlsDisabled(false);
            $('runLabel').textContent = t('editor.run');
        }
    }

    // ---------- Model ----------

    function bindModelPicker() {
        const btn = $('modelBtn');
        const menu = $('modelMenu');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = !menu.classList.contains('hidden');
            menu.classList.toggle('hidden', open);
            btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        });

        menu.addEventListener('click', (e) => {
            const item = e.target.closest('button[data-model]');
            if (!item) return;
            const model = item.getAttribute('data-model');
            closeModelMenu();
            if (model !== '580' && model !== '880') return;
            if (casioSettings.model === model) return;
            casioSettings.model = model;
            saveCasioSettings();
            applyModelUI();
            renderCompiledOutput();
            loadLabels(model);
            if (!$('labelModal').classList.contains('hidden')) {
                $('labelSearch').value = '';
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!menu.classList.contains('hidden') && !e.target.closest('.casio-model-wrap')) {
                closeModelMenu();
            }
        });
    }

    function closeModelMenu() {
        $('modelMenu').classList.add('hidden');
        $('modelBtn').setAttribute('aria-expanded', 'false');
    }

    function applyModelUI() {
        $('casioModelName').textContent = modelLabel();
        $('labelModelName').textContent = modelLabel();
        $('modelMenu').querySelectorAll('button[data-model]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-model') === casioSettings.model);
        });
    }

    function applyFormatUI() {
        $('formatSeg').querySelectorAll('button[data-format]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-format') === casioSettings.format);
        });
    }

    // ---------- Labels ----------

    function bindLabels() {
        $('labelBtn').addEventListener('click', openLabelModal);
        $('labelClose').addEventListener('click', closeLabelModal);
        $('labelModal').addEventListener('mousedown', (e) => {
            if (e.target === $('labelModal')) closeLabelModal();
        });
        $('labelSearch').addEventListener('input', renderLabelRows);
    }

    function openLabelModal() {
        $('labelModal').classList.remove('hidden');
        $('labelSearch').value = '';
        $('labelModelName').textContent = modelLabel();
        loadLabels(casioSettings.model);
    }

    function closeLabelModal() {
        $('labelModal').classList.add('hidden');
    }

    async function loadLabels(model) {
        const request = ++labelRequest;
        if (labelCache[model]) {
            updateLabelCompletionCache(labelCache[model], model);
            if (model === casioSettings.model) renderLabelRows();
            return;
        }

        $('labelCount').textContent = t('casio.labels.loading');
        renderLabelMessage(t('casio.labels.loading'));

        try {
            const res = await ApiCasio.labels(model);
            if (request !== labelRequest) return;
            labelCache[model] = Array.isArray(res.labels) ? res.labels : [];
            updateLabelCompletionCache(labelCache[model], model);
            if (model === casioSettings.model) renderLabelRows();
        } catch (err) {
            if (request !== labelRequest) return;
            $('labelCount').textContent = '';
            renderLabelMessage(humanError(err), true);
        }
    }

    function renderLabelMessage(message, isError) {
        const body = $('labelBody');
        body.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.className = 'label-empty';
        td.textContent = message;
        if (isError) td.style.color = 'var(--error-color, #ff4d4d)';
        tr.appendChild(td);
        body.appendChild(tr);
    }

    function renderLabelRows() {
        const body = $('labelBody');
        const query = ($('labelSearch').value || '').trim().toLowerCase();
        const rows = labelCache[casioSettings.model] || [];
        const filtered = query
            ? rows.filter((row) =>
                (row.label || '').toLowerCase().indexOf(query) >= 0 ||
                (row.address || '').toLowerCase().indexOf(query) >= 0)
            : rows;

        $('labelCount').textContent = t('casio.labels.count', { count: filtered.length });
        body.textContent = '';

        if (!filtered.length) {
            renderLabelMessage(t('casio.labels.empty'));
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach((row) => {
            const tr = document.createElement('tr');
            const address = document.createElement('td');
            address.className = 'label-address';
            address.textContent = row.address || '';
            const label = document.createElement('td');
            label.className = 'label-name';
            label.textContent = row.label || '';
            tr.appendChild(address);
            tr.appendChild(label);
            frag.appendChild(tr);
        });
        body.appendChild(frag);
    }

    // ---------- Autocomplete helpers ----------

    function buildCompletionItem(label, kind, sortPrefix) {
        return {
            label: label,
            kind: kind,
            insertText: label,
            sortText: sortPrefix + label,
            filterText: label
        };
    }

    function buildStaticCompletionItems() {
        const items = [];
        
        // Directives
        COMPLETION_DIRECTIVES.forEach(dir => {
            items.push(buildCompletionItem(dir, monaco.languages.CompletionItemKind.Function, '1_'));
        });
        
        // Instructions
        COMPLETION_INSTRUCTIONS.forEach(inst => {
            items.push(buildCompletionItem(inst, monaco.languages.CompletionItemKind.Keyword, '1_'));
        });
        
        // Registers
        const allRegs = [
            ...COMPLETION_REGISTERS.qr,
            ...COMPLETION_REGISTERS.xr,
            ...COMPLETION_REGISTERS.er,
            ...COMPLETION_REGISTERS.r,
            ...COMPLETION_REGISTERS.special
        ];
        allRegs.forEach(reg => {
            items.push(buildCompletionItem(reg, monaco.languages.CompletionItemKind.Variable, '2_'));
        });
        
        return items;
    }

    function getLinePrefix(model, position) {
        return model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        });
    }

    function buildSpecialCompletionItems(model, position) {
        const items = [];
        const prefix = getLinePrefix(model, position);
        const line = model.getLineContent(position.lineNumber);

        // fixed literal
        items.push(buildCompletionItem('0x00', monaco.languages.CompletionItemKind.Value, '3_'));

        // push/pop operands
        const pushMatch = /^(\s*)(push|pop)\s+(\w*)$/.exec(prefix);
        if (pushMatch) {
            COMPLETION_SPECIAL_PATTERNS
                .filter((pattern) => pattern.indexOf(pushMatch[2] + ' ') === 0)
                .forEach((pattern) => {
                    const operand = pattern.slice(pushMatch[2].length + 1);
                    items.push(Object.assign(
                        buildCompletionItem(pattern, monaco.languages.CompletionItemKind.Value, '3_'),
                        { filterText: operand, insertText: operand }
                    ));
                });
        }

        // memory offsets inside [ ]
        const bracketIndex = prefix.lastIndexOf('[');
        if (bracketIndex >= 0 && prefix.indexOf(']', bracketIndex) === -1) {
            const inside = prefix.slice(bracketIndex + 1);
            const word = model.getWordUntilPosition(position).word || '';
            const hasClosing = line.charAt(position.column - 1) === ']';
            ['[+4784]', '[-2]'].forEach((pattern) => {
                const content = pattern.slice(1, -1);
                let insert = content.indexOf(inside) === 0 ? content.slice(inside.length - word.length) : content;
                if (!hasClosing) insert += ']';
                if (!insert) insert = content;
                items.push(Object.assign(
                    buildCompletionItem(pattern, monaco.languages.CompletionItemKind.Value, '3_'),
                    { filterText: content.replace(/[^0-9]/g, ''), insertText: insert }
                ));
            });
        }

        return items;
    }

    function parseLocalLabels(code) {
        const labels = [];
        const lines = code.split('\n');
        const labelPattern = /^\s*([A-Za-z_]\w*):\s*(?:#.*)?$/;
        const seen = new Set();
        
        lines.forEach(line => {
            const match = labelPattern.exec(line);
            if (match && !seen.has(match[1])) {
                seen.add(match[1]);
                labels.push({
                    label: match[1],
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: match[1],
                    sortText: '0_' + match[1],
                    detail: 'local label'
                });
            }
        });
        
        return labels;
    }

    function parseWorkspaceLabels() {
        const merged = [];
        const seen = new Set();
        tabs.forEach((tab) => {
            const code = tab.model ? tab.model.getValue() : (tab.content || '');
            parseLocalLabels(code).forEach((item) => {
                if (seen.has(item.label)) return;
                seen.add(item.label);
                merged.push(item);
            });
        });
        return merged;
    }

    function getCompletionContext(model, position) {
        const linePrefix = getLinePrefix(model, position);
        
        // Check if after "adr_of" or "goto"
        if (/^\s*(adr_of|goto)\s+\w*$/.test(linePrefix)) {
            return 'labels-only';
        }
        
        return 'all';
    }

    function updateLabelCompletionCache(labels, model) {
        completionLabelCache[model] = labels.map(item => ({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: item.label,
            sortText: '0_' + item.label,
            filterText: item.label + ' ' + item.label.replace(/\./g, ' '),
            detail: item.address + ' · ' + modelLabel(model)
        }));
    }

    // ---------- Utilities ----------

    function copyText(text, okMessage, failMessage) {
        const value = String(text || '');
        if (!value) {
            showToast(failMessage || t('casio.copyFailed'));
            return;
        }
        const done = () => showToast(okMessage || t('casio.copied'));
        const failed = () => showToast(failMessage || t('casio.copyFailed'));

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(() => {
                if (fallbackCopy(value)) done();
                else failed();
            });
            return;
        }
        if (fallbackCopy(value)) done();
        else failed();
    }

    function fallbackCopy(text) {
        try {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            area.remove();
            return ok;
        } catch (e) {
            return false;
        }
    }

    function showToast(message) {
        const el = $('toast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
})();
