// ==========================================
// Code Editor - Monaco + Python console (WebSocket)
// ==========================================

const TABS_PREFIX = 'codeai_editor_tabs_';
const SAVED_PREFIX = 'codeai_editor_saved_';
const SPLIT_KEY = 'codeai_editor_split';

// Cáº¥u hÃ¬nh theo ngÃ´n ngá»¯
const LANG_CONF = {
    python: { monaco: 'python', ext: '.py', mime: 'text/x-python;charset=utf-8', main: 'main.py' },
    cpp: { monaco: 'cpp', ext: '.cpp', mime: 'text/x-c++src;charset=utf-8', main: 'main.cpp' },
    java: { monaco: 'java', ext: '.java', mime: 'text/x-java;charset=utf-8', main: 'Main.java' },
    web: { monaco: 'html', ext: '.html', mime: 'text/html;charset=utf-8', main: 'index.html' }
};

// NgÃ´n ngá»¯ Monaco theo Ä‘uÃ´i file (dÃ¹ng cho cháº¿ Ä‘á»™ web: 3 file html/css/js)
const WEB_EXT_LANG = {
    html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript',
    json: 'json', txt: 'plaintext', md: 'markdown'
};

const WEB_FILE_MIME = {
    html: 'text/html;charset=utf-8', htm: 'text/html;charset=utf-8',
    css: 'text/css;charset=utf-8', js: 'text/javascript;charset=utf-8',
    mjs: 'text/javascript;charset=utf-8', json: 'application/json;charset=utf-8',
    txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8'
};

// Bo 3 file con cua moi "tab lon" o che do web
const WEB_KINDS = [
    { kind: 'html', name: 'index.html' },
    { kind: 'css', name: 'style.css' },
    { kind: 'js', name: 'script.js' }
];

function fileExt(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
}

// NgÃ´n ngá»¯ Monaco cho má»™t tab: cháº¿ Ä‘á»™ web thÃ¬ theo Ä‘uÃ´i file
function monacoLangForTab(name, lang) {
    if (lang === 'web') {
        return WEB_EXT_LANG[fileExt(name)] || 'html';
    }
    return (LANG_CONF[lang] || LANG_CONF.python).monaco;
}

const DEFAULT_CODE = {
    python: `# Chao mung den voi CodeAI!
# Viet code Python roi bam nut "Chay".

def chao(ten):
    return "Xin chao, " + ten + "!"

ten = input("Nhap ten cua ban: ")
print(chao(ten))
print("2 + 3 * 4 =", 2 + 3 * 4)
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string ten;
    cout << "Nhap ten cua ban: ";
    cin >> ten;
    cout << "Xin chao, " << ten << "!" << endl;
    cout << "2 + 3 * 4 = " << 2 + 3 * 4 << endl;
    return 0;
}
`,
    java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        System.out.println("Xin chào từ Java!");
        Scanner sc = new Scanner(System.in);
        System.out.print("Nhập tên của bạn: ");
        String ten = sc.nextLine();
        System.out.println("Chào " + ten + "!");
        System.out.println("2 + 3 * 4 = " + (2 + 3 * 4));
    }
}
`,
    webFiles: {
        'index.html': `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeAI Web</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Xin chào 👋</h1>
  <p>Viết HTML, CSS, JavaScript ở các tab bên trái rồi xem kết quả ở tab Preview.</p>
  <button id="btn">Bấm vào đây</button>
  <p id="count">Số lần bấm: 0</p>

  <script src="script.js"></script>
</body>
</html>
`,
        'style.css': `body {
  font-family: system-ui, 'Segoe UI', Arial, sans-serif;
  margin: 0;
  padding: 32px;
  color: #1a1a2e;
  background: #f6f8fc;
}

h1 {
  color: #0066ff;
}

button {
  padding: 8px 16px;
  font-size: 1rem;
  color: #fff;
  background: #0066ff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

button:hover {
  background: #0052cc;
}
`,
        'script.js': `let count = 0;

const btn = document.getElementById('btn');
const out = document.getElementById('count');

btn.addEventListener('click', () => {
  count += 1;
  out.textContent = 'Số lần bấm: ' + count;
  console.log('Đã bấm', count, 'lần');
});

console.log('Trang đã sẵn sàng!');
`
    }
};

let editorLang = 'python';
let currentUserId = null;
let langInitialized = false;

let editor = null;
let monacoReady = false;
let ws = null;
let running = false;
let rerunPending = false;
let rerunTimer = null;
let tabsKey = null;
let savedKey = null;
let saveTimer = null;
let splitRatio = parseFloat(localStorage.getItem(SPLIT_KEY)) || 0.62;
let currentTheme = (window.CodeTheme ? CodeTheme.get() : 'light');
let tabs = [];
let activeId = null;
let tabSeq = 1;
let groups = [];
let activeGroupId = null;
let groupSeq = 1;

const SETTINGS_KEY = 'codeai_editor_settings';
const DEFAULT_SETTINGS = { tabSize: 4, lineNumbers: true, zoomFun: false, zoomScale: 3.5, live: true };
const BASE_FONT_SIZE = 14;
const ZOOM_MIN = 1.5;
const ZOOM_MAX = 4;
let settings = loadSettings();
let zoomed = false;

const $ = (id) => document.getElementById(id);

function isNarrow() {
    return window.matchMedia('(max-width: 900px)').matches;
}

// ---------- Toast ----------

let toastTimer = null;
function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- Custom dialog (khÃ´ng dÃ¹ng há»™p thoáº¡i máº·c Ä‘á»‹nh cá»§a trÃ¬nh duyá»‡t) ----------

function uiDialog(opts) {
    return new Promise((resolve) => {
        const overlay = $('uiModal');
        const body = $('uiModalBody');
        const inputEl = $('uiModalInput');
        const titleEl = $('uiModalTitle');
        const okBtn = $('uiModalOk');
        const cancelBtn = $('uiModalCancel');
        const withInput = !!opts.input;

        titleEl.textContent = opts.title || '';
        okBtn.textContent = opts.okText || t('editor.ok');
        cancelBtn.textContent = t('editor.cancel');
        okBtn.className = 'sv-btn ' + (opts.danger ? 'sv-danger' : 'sv-primary');
        body.classList.toggle('hidden', !withInput);
        if (withInput) inputEl.value = opts.value || '';

        function cleanup() {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('mousedown', onOverlay);
            inputEl.removeEventListener('keydown', onKey);
            document.removeEventListener('keydown', onKey);
        }

        function finish(value) {
            cleanup();
            resolve(value);
        }

        function onOk() {
            if (!withInput) return finish(true);
            const value = inputEl.value.trim();
            if (!value) {
                inputEl.focus();
                return;
            }
            finish(value);
        }

        function onCancel() {
            finish(withInput ? null : false);
        }

        function onOverlay(e) {
            if (e.target === overlay) onCancel();
        }

        function onKey(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('mousedown', onOverlay);
        document.addEventListener('keydown', onKey);
        if (withInput) inputEl.addEventListener('keydown', onKey);

        overlay.classList.remove('hidden');
        if (withInput) {
            inputEl.focus();
            inputEl.select();
        } else {
            okBtn.focus();
        }
    });
}

function uiPrompt(title, value) {
    return uiDialog({ title: title, input: true, value: value || '' });
}

function uiConfirm(title, okText, danger) {
    return uiDialog({ title: title, okText: okText, danger: danger });
}

// ---------- Console (terminal) ----------

let consoleLen = 0;
const CONSOLE_MAX = 800000; // kÃ½ tá»± - chá»‘ng treo trÃ¬nh duyá»‡t (khÃ´ng giá»›i háº¡n tiáº¿n trÃ¬nh)
const PENDING_MAX = 200000; // gá»™p output trÆ°á»›c khi render, giá»›i háº¡n Ä‘á»ƒ khÃ´ng ngá»‘n RAM
let inputBuffer = '';
let liveSpan = null;
let pendingOutput = '';
let outputFlushScheduled = false;

// Gá»™p nhiá»u gÃ³i output láº¡i rá»“i render 1 láº§n má»—i khung hÃ¬nh.
// TrÃ¡nh viá»‡c vÃ²ng láº·p in nhanh lÃ m ngháº½n main thread -> báº¥m Dá»«ng khÃ´ng Äƒn.
function scheduleOutputFlush() {
    if (outputFlushScheduled) return;
    outputFlushScheduled = true;
    requestAnimationFrame(flushOutput);
}

function flushOutput() {
    outputFlushScheduled = false;
    if (!pendingOutput) return;
    const text = pendingOutput;
    pendingOutput = '';
    appendOutput(text);
}

function trimConsole() {
    const out = $('consoleOutput');
    while (consoleLen > CONSOLE_MAX && out.firstChild) {
        if (out.firstChild === liveSpan) break;
        consoleLen -= (out.firstChild.textContent || '').length;
        out.removeChild(out.firstChild);
    }
}

function appendOutput(text) {
    const out = $('consoleOutput');
    const clean = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    out.appendChild(document.createTextNode(clean));
    consoleLen += clean.length;
    if (liveSpan) out.appendChild(liveSpan); // giá»¯ con trá» á»Ÿ cuá»‘i
    trimConsole();
    out.scrollTop = out.scrollHeight;
}

function appendLine(text, cls) {
    const out = $('consoleOutput');
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    out.appendChild(div);
    consoleLen += text.length + 1;
    if (liveSpan) out.appendChild(liveSpan);
    trimConsole();
    out.scrollTop = out.scrollHeight;
}

function clearConsole(showNotice) {
    $('consoleOutput').innerHTML = '';
    consoleLen = 0;
    inputBuffer = '';
    liveSpan = null;
    pendingOutput = '';
    appendLine(t('editor.welcome'), 'console-sys');
    if (showNotice !== false) appendLine(t('editor.simNotice'), 'console-note');
}

function refreshLive() {
    const out = $('consoleOutput');
    if (!liveSpan) {
        liveSpan = document.createElement('span');
        liveSpan.className = 'console-live';
    }
    liveSpan.textContent = inputBuffer;
    out.appendChild(liveSpan);
    out.scrollTop = out.scrollHeight;
}

function startInputLine() {
    inputBuffer = '';
    refreshLive();
}

function endInputLine() {
    if (liveSpan) {
        liveSpan.remove();
        liveSpan = null;
    }
    inputBuffer = '';
}

function finalizeInput() {
    const out = $('consoleOutput');
    const data = inputBuffer;
    if (liveSpan) {
        liveSpan.className = 'console-live-done'; // giá»¯ láº¡i pháº§n Ä‘Ã£ gÃµ
        liveSpan = null;
    }
    out.appendChild(document.createTextNode('\n'));
    consoleLen += data.length + 1;
    inputBuffer = '';
    trimConsole();
    out.scrollTop = out.scrollHeight;
    return data;
}

function onConsoleKey(e) {
    if (!running || editorLang === 'web') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Enter') {
        e.preventDefault();
        const data = finalizeInput();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: data }));
        }
        startInputLine();
        return;
    }
    if (e.key === 'Backspace') {
        e.preventDefault();
        inputBuffer = inputBuffer.slice(0, -1);
        refreshLive();
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        inputBuffer += '\t';
        refreshLive();
        return;
    }
    if (e.key.length === 1) {
        e.preventDefault();
        inputBuffer += e.key;
        refreshLive();
    }
}

function onConsolePaste(e) {
    if (!running || editorLang === 'web') return;
    e.preventDefault();
    const clip = e.clipboardData || window.clipboardData;
    const text = (clip ? clip.getData('text') : '') || '';
    inputBuffer += text.replace(/\r/g, '').split('\n')[0];
    refreshLive();
}

function setStatus(text, cls) {
    const el = $('runStatus');
    el.textContent = text || '';
    el.className = 'ed-status' + (cls ? ' ' + cls : '');
    $('consoleState').textContent = text || '';
}

// ---------- Theme ----------

function applyTheme(theme) {
    currentTheme = window.CodeTheme ? CodeTheme.apply(theme) : (theme === 'dark' ? 'dark' : 'light');
    if (monacoReady && window.monaco) {
        window.monaco.editor.setTheme(currentTheme === 'dark' ? 'vs-dark' : 'vs');
    }
    updateSettingsUI();
}

// ---------- Settings ----------

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
    out.live = out.live !== false; // máº·c Ä‘á»‹nh báºt
    const z = parseFloat(out.zoomScale);
    out.zoomScale = isNaN(z) ? DEFAULT_SETTINGS.zoomScale : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    return out;
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
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
    updateToolbarForLang();
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
    const lv = $('setLive');
    if (lv) lv.checked = settings.live;
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

// ---------- Zoom code (cháº¿ Ä‘á»™ vui) ----------

function currentScale(el) {
    const tr = getComputedStyle(el).transform;
    if (!tr || tr === 'none') return 1;
    const m = tr.match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(',');
    return parseFloat(parts[0]) || 1;
}

function zoomIn() {
    if (!settings.zoomFun || !editor || !monacoReady) return;
    const viewEl = $('editorView');
    const pos = editor.getPosition();
    if (!pos) return;
    const vp = editor.getScrolledVisiblePosition(pos);
    if (!vp) return;

    const scale = currentScale(viewEl);
    const viewRect = viewEl.getBoundingClientRect();
    const hostRect = $('monacoHost').getBoundingClientRect();

    // KÃ­ch thÆ°á»›c/Ä‘á»™ lá»‡ch á»Ÿ há»‡ toáº¡ Ä‘á»™ layout (khÃ´ng phá»¥ thuá»™c transform Ä‘ang cháº¡y)
    const hostLeft = (hostRect.left - viewRect.left) / scale;
    const hostTop = (hostRect.top - viewRect.top) / scale;
    const width = viewRect.width / scale;
    const height = viewRect.height / scale;

    const cx = hostLeft + vp.left + 2;
    const cy = hostTop + vp.top + vp.height / 2;

    zoomed = true;
    const z = settings.zoomScale;
    const tx = -z * (cx - width / 2);
    const ty = -z * (cy - height / 2);
    viewEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')';
}

function zoomOut() {
    const viewEl = $('editorView');
    if (viewEl) viewEl.style.transform = '';
    if (!zoomed) return;
    zoomed = false;
}

// ---------- Split ----------

function applySplit() {
    $('paneCode').style.flex = '0 0 ' + (splitRatio * 100) + '%';
}

function initSplitter() {
    const splitter = $('splitter');
    const workspace = $('workspace');
    let dragging = false;

    splitter.addEventListener('mousedown', (e) => {
        dragging = true;
        e.preventDefault();
        document.body.style.cursor = isNarrow() ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = workspace.getBoundingClientRect();
        let ratio = isNarrow()
            ? (e.clientY - rect.top) / rect.height
            : (e.clientX - rect.left) / rect.width;
        ratio = Math.min(0.85, Math.max(0.15, ratio));
        splitRatio = ratio;
        applySplit();
    });

    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(SPLIT_KEY, String(splitRatio));
    });
}

// ---------- Tabs / models ----------

function tabById(id) {
    return tabs.find((x) => x.id === id);
}

function activeTab() {
    return tabById(activeId);
}

function groupById(id) {
    return groups.find((g) => g.id === id) || null;
}

function activeGroup() {
    return groupById(activeGroupId) || groups[0] || null;
}

function groupFile(group, kind) {
    return group ? tabById(group.fileIds[kind]) : null;
}

function groupContents(group) {
    const out = { html: '', css: '', js: '' };
    if (!group) return out;
    WEB_KINDS.forEach((k) => {
        const tab = groupFile(group, k.kind);
        out[k.kind] = tab ? tab.model.getValue() : '';
    });
    return out;
}

function langConf() {
    return LANG_CONF[editorLang] || LANG_CONF.python;
}

function createTab(name, code, activate, savedId) {
    const conf = langConf();
    const tabName = name || (t('editor.untitled') + conf.ext);
    const model = monaco.editor.createModel(code == null ? '' : String(code), monacoLangForTab(tabName, editorLang));
    const tab = {
        id: 'tab' + (tabSeq++),
        name: tabName,
        model: model,
        viewState: null,
        savedId: savedId || null
    };
    tabs.push(tab);
    model.onDidChangeContent(() => {
        scheduleSave();
        scheduleLivePreview();
    });
    if (activate !== false) {
        activateTab(tab.id);
    } else {
        renderTabs();
    }
    return tab;
}

function activateTab(id) {
    const tab = tabById(id);
    if (!tab || !editor) return;
    if (editorLang === 'web' && tab.group) {
        activeGroupId = tab.group;
        const group = groupById(tab.group);
        if (group) group.activeKind = tab.kind;
    }
    const cur = activeTab();
    if (cur && editor.getModel()) cur.viewState = editor.saveViewState();
    activeId = id;
    editor.setModel(tab.model);
    if (tab.viewState) editor.restoreViewState(tab.viewState);
    editor.focus();
    renderTabs();
    if (editorLang === 'web') scheduleSave();
}

function closeTab(id) {
    if (tabs.length <= 1) {
        return; // luÃ´n giá»¯ tá»‘i thiá»ƒu 1 tab
    }
    const idx = tabs.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const tab = tabs[idx];
    const wasActive = activeId === id;

    tabs.splice(idx, 1);
    if (wasActive) {
        const next = tabs[idx - 1] || tabs[idx + 1] || tabs[0];
        activeId = null;
        activateTab(next.id);
    }
    if (editor && editor.getModel() === tab.model) {
        editor.setModel(null);
    }
    tab.model.dispose();
    renderTabs();
    scheduleSave();
}

async function renameTab(id) {
    const tab = tabById(id);
    if (!tab) return;
    const name = await uiPrompt(t('editor.rename'), tab.name);
    if (name && name.trim()) {
        tab.name = name.trim();
        renderTabs();
        scheduleSave();
    }
}

// ---------- Web groups (tab lon = 1 trang gom html/css/js) ----------

function createGroup(name, contents, activate, savedId, activeKind) {
    const gid = 'g' + (groupSeq++);
    const group = {
        id: gid,
        name: name || t('editor.groupName', { n: groupSeq - 1 }),
        fileIds: {},
        activeKind: activeKind || 'html',
        savedId: savedId || null
    };
    groups.push(group);
    WEB_KINDS.forEach((k) => {
        let code = '';
        if (contents && contents[k.kind] != null) {
            code = contents[k.kind];
        } else if (!contents) {
            code = DEFAULT_CODE.webFiles[k.name] || '';
        }
        const tab = createTab(k.name, code, false);
        tab.group = gid;
        tab.kind = k.kind;
        group.fileIds[k.kind] = tab.id;
    });
    if (activate !== false) {
        activateGroup(gid);
    } else {
        renderTabs();
    }
    return group;
}

function activateGroup(gid) {
    const group = groupById(gid);
    if (!group) return;
    const cur = activeTab();
    if (cur && editor && editor.getModel()) cur.viewState = editor.saveViewState();
    activeGroupId = gid;
    const tab = groupFile(group, group.activeKind) || groupFile(group, 'html');
    if (tab) {
        activeId = tab.id;
        if (editor) {
            editor.setModel(tab.model);
            if (tab.viewState) editor.restoreViewState(tab.viewState);
            editor.focus();
        }
    }
    renderTabs();
    scheduleLivePreview();
    scheduleSave();
}

function closeGroup(gid) {
    if (groups.length <= 1) {
        return; // luon giu toi thieu 1 trang
    }
    const idx = groups.findIndex((g) => g.id === gid);
    if (idx < 0) return;
    const group = groups[idx];
    const wasActive = activeGroupId === gid;

    if (editor) {
        const model = editor.getModel();
        const own = WEB_KINDS.some((k) => {
            const tab = groupFile(group, k.kind);
            return tab && tab.model === model;
        });
        if (own) editor.setModel(null);
    }

    WEB_KINDS.forEach((k) => {
        const tab = groupFile(group, k.kind);
        if (!tab) return;
        const i = tabs.indexOf(tab);
        if (i >= 0) tabs.splice(i, 1);
        tab.model.dispose();
    });
    groups.splice(idx, 1);

    if (wasActive) {
        const next = groups[idx - 1] || groups[idx + 1] || groups[0];
        activeGroupId = null;
        if (next) {
            activateGroup(next.id);
        } else {
            activeId = null;
            renderTabs();
        }
    } else {
        renderTabs();
    }
    scheduleSave();
}

async function renameGroup(gid) {
    const group = groupById(gid);
    if (!group) return;
    const name = await uiPrompt(t('editor.renameGroup'), group.name);
    if (name && name.trim()) {
        group.name = name.trim();
        if (group.savedId) {
            const list = getSaved();
            const item = list.find((x) => x.id === group.savedId);
            if (item) {
                item.name = group.name;
                item.updatedAt = Date.now();
                setSaved(list);
            }
        }
        renderTabs();
        scheduleSave();
    }
}

function renderTabs() {
    const bar = $('tabBar');
    const addBtn = $('tabAdd');
    bar.querySelectorAll('.file-tab').forEach((el) => el.remove());

    if (editorLang === 'web') {
        renderGroupTabs(bar, addBtn);
        renderSubTabs();
        return;
    }

    const sub = $('subTabBar');
    if (sub) {
        sub.classList.add('hidden');
        sub.innerHTML = '';
    }

    tabs.forEach((tab) => {
        const el = document.createElement('div');
        el.className = 'file-tab' + (tab.id === activeId ? ' active' : '');

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tab.name;
        name.title = tab.name;
        el.appendChild(name);

        if (tabs.length > 1) {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'tab-close';
            close.innerHTML = '&times;';
            close.title = t('editor.closeTab');
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            });
            el.appendChild(close);
        }

        el.addEventListener('click', () => activateTab(tab.id));
        el.addEventListener('dblclick', () => renameTab(tab.id));
        bar.insertBefore(el, addBtn);
    });
}

function renderGroupTabs(bar, addBtn) {
    groups.forEach((group) => {
        const el = document.createElement('div');
        el.className = 'file-tab group-tab' + (group.id === activeGroupId ? ' active' : '');

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = group.name;
        name.title = group.name;
        el.appendChild(name);

        if (groups.length > 1) {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'tab-close';
            close.innerHTML = '&times;';
            close.title = t('editor.closeTab');
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                closeGroup(group.id);
            });
            el.appendChild(close);
        }

        el.addEventListener('click', () => activateGroup(group.id));
        el.addEventListener('dblclick', () => renameGroup(group.id));
        bar.insertBefore(el, addBtn);
    });
}

function renderSubTabs() {
    const sub = $('subTabBar');
    if (!sub) return;
    sub.innerHTML = '';
    sub.classList.remove('hidden');
    const group = activeGroup();
    if (!group) return;
    WEB_KINDS.forEach((k) => {
        const tab = groupFile(group, k.kind);
        if (!tab) return;
        const el = document.createElement('div');
        el.className = 'file-tab sub-tab' + (tab.id === activeId ? ' active' : '');
        el.dataset.kind = k.kind;

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tab.name;
        name.title = tab.name;
        el.appendChild(name);

        el.addEventListener('click', () => activateTab(tab.id));
        sub.appendChild(el);
    });
}

function addTab() {
    if (editorLang === 'web') {
        createGroup(null, null, true);
        scheduleSave();
        return;
    }
    createTab(null, '', true);
    scheduleSave();
}

// ---------- Persistence ----------

function persist() {
    if (!tabsKey) return;
    if (editorLang === 'web') {
        const data = {
            activeGroup: Math.max(0, groups.findIndex((g) => g.id === activeGroupId)),
            groups: groups.map((g) => ({
                name: g.name,
                activeKind: g.activeKind,
                savedId: g.savedId || null,
                files: groupContents(g)
            }))
        };
        try {
            localStorage.setItem(tabsKey, JSON.stringify(data));
        } catch (e) { /* quota */ }
        return;
    }
    const activeIndex = Math.max(0, tabs.findIndex((x) => x.id === activeId));
    const data = {
        active: activeIndex,
        tabs: tabs.map((x) => ({ name: x.name, code: x.model.getValue(), savedId: x.savedId || null }))
    };
    try {
        localStorage.setItem(tabsKey, JSON.stringify(data));
    } catch (e) { /* quota */ }
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
}

// ---------- Saved tabs (thÆ° viá»‡n tab) ----------

function getSaved() {
    try {
        const data = JSON.parse(localStorage.getItem(savedKey) || '[]');
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function setSaved(list) {
    try {
        localStorage.setItem(savedKey, JSON.stringify(list));
    } catch (e) { /* quota */ }
}

function newSavedId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function saveActiveTab() {
    if (editorLang === 'web') {
        return saveActiveGroup();
    }
    const tab = activeTab();
    if (!tab) return;
    const name = tab.name;
    const code = tab.model.getValue();
    const list = getSaved();

    // Tab má»Ÿ ra tá»« má»™t file Ä‘Ã£ lÆ°u -> lÆ°u Ä‘Ã¨ trá»±c tiáº¿p (coi nhÆ° chá»‰nh sá»­a file)
    if (tab.savedId) {
        const linked = list.find((x) => x.id === tab.savedId);
        if (linked) {
            linked.name = name;
            linked.code = code;
            linked.updatedAt = Date.now();
            setSaved(list);
            toast(t('editor.saved'));
            return;
        }
    }

    const existing = list.find((x) => x.name === name);
    if (existing) {
        const ok = await uiConfirm(t('editor.overwriteTab', { name: name }), t('editor.ok'));
        if (!ok) return;
        existing.name = name;
        existing.code = code;
        existing.updatedAt = Date.now();
        tab.savedId = existing.id;
    } else {
        const newId = newSavedId();
        list.push({ id: newId, name: name, code: code, updatedAt: Date.now() });
        tab.savedId = newId;
    }
    setSaved(list);
    toast(t('editor.tabSaved'));
}

async function saveActiveGroup() {
    const group = activeGroup();
    if (!group) return;
    const files = groupContents(group);
    const list = getSaved();

    if (group.savedId) {
        const linked = list.find((x) => x.id === group.savedId);
        if (linked) {
            linked.name = group.name;
            linked.type = 'web';
            linked.files = files;
            linked.updatedAt = Date.now();
            setSaved(list);
            toast(t('editor.saved'));
            return;
        }
    }

    const existing = list.find((x) => x.name === group.name);
    if (existing) {
        const ok = await uiConfirm(t('editor.overwriteTab', { name: group.name }), t('editor.ok'));
        if (!ok) return;
        existing.name = group.name;
        existing.type = 'web';
        existing.files = files;
        existing.updatedAt = Date.now();
        group.savedId = existing.id;
    } else {
        const newId = newSavedId();
        list.push({ id: newId, type: 'web', name: group.name, files: files, updatedAt: Date.now() });
        group.savedId = newId;
    }
    setSaved(list);
    toast(t('editor.tabSaved'));
}

async function copyAllCode() {
    if (!editor) return;
    const code = editor.getValue();
    try {
        await navigator.clipboard.writeText(code);
        toast(t('editor.codeCopied'));
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = code;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast(t('editor.codeCopied'));
        } catch (e2) {
            toast(t('editor.copyFailed'));
        }
    }
}

async function clearAllCode() {
    if (!editor) return;
    const ok = await uiConfirm(t('editor.confirmClearCode'), t('editor.clearCode'), true);
    if (!ok) return;
    editor.setValue('');
    editor.focus();
    toast(t('editor.codeCleared'));
}

function openSavedTab(id) {
    const item = getSaved().find((x) => x.id === id);
    if (!item) return;
    if (item.type === 'web') {
        const opened = groups.find((g) => g.savedId === item.id);
        if (opened) {
            opened.savedId = item.id;
            activateGroup(opened.id);
        } else {
            createGroup(item.name, item.files || {}, true, item.id);
            scheduleSave();
        }
        closeSavedModal();
        return;
    }
    const opened = tabs.find((x) => x.name === item.name);
    if (opened) {
        opened.savedId = item.id;
        activateTab(opened.id);
    } else {
        createTab(item.name, item.code, true, item.id);
        scheduleSave();
    }
    closeSavedModal();
}

async function renameSavedTab(id) {
    const list = getSaved();
    const item = list.find((x) => x.id === id);
    if (!item) return;
    const name = await uiPrompt(t('editor.rename'), item.name);
    if (name && name.trim()) {
        item.name = name.trim();
        item.updatedAt = Date.now();
        setSaved(list);
        if (item.type === 'web') {
            const open = groups.find((g) => g.savedId === id);
            if (open) {
                open.name = item.name;
                renderTabs();
                scheduleSave();
            }
        } else {
            const open = tabs.find((x) => x.savedId === id);
            if (open) {
                open.name = item.name;
                renderTabs();
                scheduleSave();
            }
        }
        renderSavedList();
    }
}

async function deleteSavedTab(id) {
    const list = getSaved();
    const item = list.find((x) => x.id === id);
    if (!item) return;
    const ok = await uiConfirm(t('editor.confirmDeleteTab', { name: item.name }), t('editor.delete'), true);
    if (!ok) return;
    setSaved(list.filter((x) => x.id !== id));
    if (item.type === 'web') {
        const open = groups.find((g) => g.savedId === id);
        if (open) open.savedId = null;
    } else {
        const open = tabs.find((x) => x.savedId === id);
        if (open) open.savedId = null;
    }
    scheduleSave();
    renderSavedList();
}

function renderSavedList() {
    const box = $('savedList');
    box.innerHTML = '';
    const list = getSaved().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!list.length) {
        const p = document.createElement('p');
        p.className = 'saved-empty';
        p.textContent = t('editor.savedEmpty');
        box.appendChild(p);
        return;
    }

    list.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'saved-item';

        const info = document.createElement('div');
        info.className = 'saved-info';
        const nm = document.createElement('div');
        nm.className = 'saved-name';
        nm.textContent = item.name;
        const dt = document.createElement('div');
        dt.className = 'saved-date';
        dt.textContent = new Date(item.updatedAt || Date.now()).toLocaleString();
        info.appendChild(nm);
        if (item.type === 'web') {
            const badge = document.createElement('div');
            badge.className = 'saved-date';
            badge.textContent = 'HTML · CSS · JS';
            info.appendChild(badge);
        }
        info.appendChild(dt);

        const actions = document.createElement('div');
        actions.className = 'saved-actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'sv-btn sv-open';
        openBtn.textContent = t('editor.open');
        openBtn.addEventListener('click', () => openSavedTab(item.id));

        const renBtn = document.createElement('button');
        renBtn.type = 'button';
        renBtn.className = 'sv-btn';
        renBtn.textContent = t('editor.renameBtn');
        renBtn.addEventListener('click', () => renameSavedTab(item.id));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'sv-btn sv-del';
        delBtn.textContent = t('editor.delete');
        delBtn.addEventListener('click', () => deleteSavedTab(item.id));

        actions.appendChild(openBtn);
        actions.appendChild(renBtn);
        actions.appendChild(delBtn);
        row.appendChild(info);
        row.appendChild(actions);
        box.appendChild(row);
    });
}

function openSavedModal() {
    renderSavedList();
    $('savedModal').classList.remove('hidden');
}

function closeSavedModal() {
    $('savedModal').classList.add('hidden');
}

function loadTabs() {
    let data = null;
    try {
        data = JSON.parse(localStorage.getItem(tabsKey) || 'null');
    } catch (e) { /* ignore */ }

    if (editorLang === 'web') {
        loadWebGroups(data);
        renderTabs();
        return;
    }

    if (data && Array.isArray(data.tabs) && data.tabs.length) {
        data.tabs.forEach((tt) => createTab(tt.name, tt.code, false, tt.savedId));
        const idx = Math.min(Math.max(0, data.active | 0), tabs.length - 1);
        activateTab(tabs[idx].id);
    } else {
        const conf = langConf();
        createTab(conf.main, DEFAULT_CODE[editorLang] || '', true);
    }
    renderTabs();
}

function loadWebGroups(data) {
    if (data && Array.isArray(data.groups) && data.groups.length) {
        data.groups.forEach((g) => createGroup(g.name, g.files || {}, false, g.savedId, g.activeKind));
        const idx = Math.min(Math.max(0, data.activeGroup | 0), groups.length - 1);
        activateGroup(groups[idx].id);
        return;
    }

    // Di chuyen du lieu tab phang cua phien ban cu sang 1 trang duy nhat
    if (data && Array.isArray(data.tabs) && data.tabs.length) {
        const contents = { html: '', css: '', js: '' };
        data.tabs.forEach((tt) => {
            const ext = fileExt(tt.name);
            let kind = null;
            if (ext === 'html' || ext === 'htm') kind = 'html';
            else if (ext === 'css') kind = 'css';
            else if (ext === 'js' || ext === 'mjs') kind = 'js';
            if (!kind) return;
            contents[kind] += (contents[kind] ? '\n' : '') + (tt.code || '');
        });
        if (contents.html || contents.css || contents.js) {
            createGroup(null, contents, true);
            return;
        }
    }

    createGroup(null, null, true);
}

// ---------- File actions ----------

function ensureExt(name, ext) {
    return /\.[a-z0-9]+$/i.test(name) ? name : name + ext;
}

function downloadActive() {
    const tab = activeTab();
    if (!tab) return;
    const conf = langConf();
    let name;
    let mime;
    if (editorLang === 'web') {
        const ext = fileExt(tab.name) || 'html';
        name = tab.name;
        mime = WEB_FILE_MIME[ext] || 'text/plain;charset=utf-8';
    } else {
        name = ensureExt(tab.name, conf.ext);
        mime = conf.mime;
    }
    const blob = new Blob([tab.model.getValue()], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function onFilesChosen(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (editorLang === 'web') {
        const group = activeGroup();
        let remaining = files.length;
        const done = () => {
            if (--remaining === 0) $('fileInput').value = '';
        };
        files.forEach((file) => {
            const ext = fileExt(file.name);
            let kind = null;
            if (ext === 'html' || ext === 'htm') kind = 'html';
            else if (ext === 'css') kind = 'css';
            else if (ext === 'js' || ext === 'mjs') kind = 'js';
            const tab = (kind && group) ? groupFile(group, kind) : null;
            if (!tab) {
                done();
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                tab.model.setValue(String(reader.result == null ? '' : reader.result));
                scheduleSave();
                done();
            };
            reader.onerror = done;
            reader.readAsText(file);
        });
        return;
    }
    let remaining = files.length;
    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
            createTab(file.name, String(reader.result == null ? '' : reader.result), true);
            scheduleSave();
            if (--remaining === 0) {
                $('fileInput').value = '';
            }
        };
        reader.onerror = () => {
            if (--remaining === 0) $('fileInput').value = '';
        };
        reader.readAsText(file);
    });
}

// ---------- Monaco ----------

function loadMonaco(cb) {
    // Worker cá»§a Monaco pháº£i dÃ¹ng baseUrl TUYá»†T Äá»‘i, náº¿u Ä‘á»ƒ tÆ°Æ¡ng Ä‘á»‘i thÃ¬ trong
    // blob-worker sáº½ lá»—i "Failed to parse URL" -> htmlWorker/cssWorker/tsWorker
    // khÃ´ng náº¡p Ä‘Æ°á»£c (máº¥t gá»£i Ã½ ngÃ´n ngá»¯). VÃ¬ váºy tá»± dá»±ng blob vá»›i baseUrl Ä‘á»§.
    const VS_URL = new URL('vendor/monaco/vs/', location.href).href;       // .../vendor/monaco/vs/
    const MONACO_ROOT = VS_URL.slice(0, VS_URL.length - 'vs/'.length);      // .../vendor/monaco/
    const MAIN = VS_URL + 'base/worker/workerMain.js';
    window.MonacoEnvironment = {
        getWorkerUrl: function () {
            const code = "self.MonacoEnvironment={baseUrl:'" + MONACO_ROOT + "'};" +
                "importScripts('" + MAIN + "');";
            return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        }
    };
    require.config({ paths: { vs: 'vendor/monaco/vs' } });
    require(['vs/editor/editor.main'], function () {
        monacoReady = true;
        registerPythonCompletions();
        registerCppCompletions();
        registerJavaCompletions();
        cb();
    });
}

const HTML_VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen',
    'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

// GÃµ '<' -> tá»± chÃ¨n '>' (con trá»  Ä‘á»©ng giá»¯a) cho tab HTML
function autoCloseAngle() {
    if (!editor || !window.monaco) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const line = model.getLineContent(pos.lineNumber);
    if (line.charAt(pos.column - 1) === '>') return; // Ä‘Ã£ cÃ³ '>' ngay sau
    editor.executeEdits('web-lt', [{
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        text: '>'
    }]);
    editor.setPosition(pos);
}

// GÃµ '>' -> tá»± Ä‘Ã³ng tháº»: "<div>" thÃ nh "<div></div>"
function autoCloseTag() {
    if (!editor || !window.monaco) return;
    let model = editor.getModel();
    let pos = editor.getPosition();
    if (!model || !pos) return;

    // Náº¿u ngay sau con trá»  cÃ²n '>' do autoCloseAngle chÃ¨n vÃ o thÃ¬ bá»  nÃ³ Ä‘i
    // (thay vÃ¬ Ä‘á»ƒ thÃ nh ">>"). ÄÃ¢y lÃ hÃ nh vi "nháº£y qua" dáº¥u Ä‘Ã³ng.
    const line0 = model.getLineContent(pos.lineNumber);
    if (line0.charAt(pos.column - 1) === '>') {
        editor.executeEdits('web-gt', [{
            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1),
            text: ''
        }]);
        model = editor.getModel();
        pos = editor.getPosition();
    }

    const line = model.getLineContent(pos.lineNumber);
    const before = line.slice(0, pos.column - 1);
    const m = /<([a-zA-Z][\w:-]*)(?:\s[^<>]*)?>$/.exec(before);
    if (!m) return;
    if (/\/$/.test(before)) return;
    const tag = m[1];
    if (HTML_VOID_TAGS.indexOf(tag.toLowerCase()) !== -1) return;
    const after = line.slice(pos.column - 1);
    if (/^\s*<\//.test(after)) return;
    editor.executeEdits('web-close-tag', [{
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        text: '</' + tag + '>'
    }]);
    editor.setPosition(pos);
}

let completionsRegistered = false;

function registerPythonCompletions() {
    if (completionsRegistered || !window.monaco) return;
    completionsRegistered = true;

    const builtins = [
        'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes', 'callable', 'chr',
        'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate',
        'eval', 'exec', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr',
        'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len',
        'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open',
        'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set', 'setattr',
        'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip'
    ];
    const keywords = [
        'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
        'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
        'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
        'try', 'while', 'with', 'yield', 'self'
    ];
    const modules = [
        'math', 'random', 'time', 'datetime', 'os', 'sys', 'json', 're', 'collections',
        'itertools', 'functools', 'string', 'statistics', 'decimal', 'fractions', 'heapq',
        'bisect', 'copy', 'typing'
    ];
    const snippets = [
        { label: 'main', insertText: "if __name__ == '__main__':\n\t${1:main()}", doc: 'Äiá»ƒm báº¯t Ä‘áº§u chÆ°Æ¡ng trÃ¬nh' },
        { label: 'def', insertText: 'def ${1:name}(${2:args}):\n\t${3:pass}', doc: 'Äá»‹nh nghÄ©a hÃ m' },
        { label: 'class', insertText: 'class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t${3:pass}', doc: 'Äá»‹nh nghÄ©a lá»›p' },
        { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', doc: 'VÃ²ng láº·p for' },
        { label: 'while', insertText: 'while ${1:condition}:\n\t${2:pass}', doc: 'VÃ²ng láº·p while' },
        { label: 'if', insertText: 'if ${1:condition}:\n\t${2:pass}', doc: 'Ráº½ nhÃ¡nh if' },
        { label: 'try', insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:pass}', doc: 'Báº¯t lá»—i' },
        { label: 'input', insertText: 'input(${1:prompt})', doc: 'Äá»c dá»¯ liá»‡u tá»« bÃ n phÃ­m' },
        { label: 'print', insertText: 'print(${1:value})', doc: 'In ra mÃ n hÃ¬nh' }
    ];

    const K = monaco.languages.CompletionItemKind;
    const items = [];
    builtins.forEach((b) => items.push({ label: b, kind: K.Function, detail: 'built-in', insertText: b }));
    keywords.forEach((k) => items.push({ label: k, kind: K.Keyword, detail: 'keyword', insertText: k }));
    modules.forEach((m) => items.push({ label: m, kind: K.Module, detail: 'module', insertText: m }));
    snippets.forEach((s) => items.push({
        label: s.label,
        kind: K.Snippet,
        detail: 'snippet',
        documentation: s.doc,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    }));

    const RESERVED = new Set(keywords.concat(builtins, modules));
    let varsCache = { id: null, version: -1, list: [] };

    // QuÃ©t biáº¿n/hÃ m/lá»›p Ä‘Æ°á»£c khai bÃ¡o trong tÃ i liá»‡u hiá»‡n táº¡i (a = 1, def f, class C, for x in, as y ...)
    function getDocVariables(model) {
        const id = (model.uri && model.uri.toString()) || String(model.id || 'model');
        const version = typeof model.getVersionId === 'function' ? model.getVersionId() : 0;
        if (varsCache.id === id && varsCache.version === version) return varsCache.list;

        const text = model.getValue();
        const found = new Set();
        const add = (name) => {
            name = (name || '').trim();
            if (name && !RESERVED.has(name) && !found.has(name)) found.add(name);
        };
        let m;

        // a = ... , a, b = ...
        const assignRe = /(^|[^\w.])([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]*=(?!=)/gm;
        while ((m = assignRe.exec(text))) {
            m[2].split(',').forEach(add);
        }
        // a += ... , a *= ...
        const augRe = /([A-Za-z_]\w*)[ \t]*[+\-*/%@]=(?!=)/g;
        while ((m = augRe.exec(text))) add(m[1]);
        // def / class
        const defRe = /\b(?:def|class)[ \t]+([A-Za-z_]\w*)/g;
        while ((m = defRe.exec(text))) add(m[1]);
        // for x in ...
        const forRe = /\bfor[ \t]+([A-Za-z_]\w*)[ \t]+in\b/g;
        while ((m = forRe.exec(text))) add(m[1]);
        // ... as y
        const asRe = /\bas[ \t]+([A-Za-z_]\w*)/g;
        while ((m = asRe.exec(text))) add(m[1]);

        varsCache = { id: id, version: version, list: Array.from(found) };
        return varsCache.list;
    }

    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function (model, position, context) {
            const word = model.getWordUntilPosition(position);
            const isManual = context &&
                context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;
            // KhÃ´ng gá»£i Ã½ khi chÆ°a gÃµ kÃ½ tá»± nÃ o (trÃ¡nh báº­t popup lÃ m cháº·n auto-close dáº¥u nhÃ¡y)
            if (!word.word && !isManual) {
                return { suggestions: [] };
            }
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            const suggestions = items.map((it) => {
                const s = Object.assign({}, it);
                s.range = range;
                return s;
            });
            getDocVariables(model).forEach((name) => {
                suggestions.push({
                    label: name,
                    kind: K.Variable,
                    detail: 'biáº¿n',
                    insertText: name,
                    range: range
                });
            });
            return { suggestions: suggestions };
        }
    });
}

let cppCompletionsRegistered = false;

function registerCppCompletions() {
    if (cppCompletionsRegistered || !window.monaco) return;
    cppCompletionsRegistered = true;

    const keywords = [
        'alignas', 'alignof', 'and', 'asm', 'auto', 'break', 'case', 'catch', 'class', 'const',
        'constexpr', 'continue', 'default', 'delete', 'do', 'dynamic_cast', 'else', 'enum',
        'explicit', 'extern', 'false', 'for', 'friend', 'goto', 'if', 'inline', 'mutable',
        'namespace', 'new', 'noexcept', 'not', 'nullptr', 'operator', 'or', 'private',
        'protected', 'public', 'register', 'return', 'signals', 'sizeof', 'static',
        'static_cast', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try',
        'typedef', 'typename', 'union', 'using', 'virtual', 'volatile', 'while', 'xor'
    ];
    const types = [
        'int', 'long', 'short', 'unsigned', 'signed', 'float', 'double', 'char', 'bool', 'void',
        'size_t', 'wchar_t', 'string', 'vector', 'map', 'unordered_map', 'set', 'unordered_set',
        'multiset', 'pair', 'tuple', 'queue', 'deque', 'stack', 'list', 'array', 'priority_queue',
        'stringstream', 'iterator', 'auto'
    ];
    const stdfuncs = [
        'cout', 'cin', 'cerr', 'endl', 'printf', 'scanf', 'getline', 'size', 'length',
        'push_back', 'pop_back', 'emplace_back', 'insert', 'erase', 'begin', 'end', 'rbegin',
        'rend', 'find', 'sort', 'stable_sort', 'reverse', 'max', 'min', 'max_element',
        'min_element', 'swap', 'abs', 'fabs', 'sqrt', 'pow', 'ceil', 'floor', 'round',
        'to_string', 'stoi', 'stoll', 'stod', 'substr', 'at', 'front', 'back', 'clear',
        'empty', 'resize', 'assign', 'count', 'accumulate', 'memset', 'strlen', 'strcmp',
        'strcpy', 'malloc', 'calloc', 'free', 'rand', 'srand', 'time', 'unique', 'lower_bound',
        'upper_bound', 'push', 'pop', 'top', 'first', 'second'
    ];
    const headers = [
        'iostream', 'bits/stdc++.h', 'vector', 'string', 'algorithm', 'cmath', 'cstdio',
        'cstdlib', 'map', 'set', 'queue', 'stack', 'utility', 'iomanip', 'fstream', 'sstream'
    ];
    const snippets = [
        { label: 'main', insertText: 'int main() {\n\t${1}\n\treturn 0;\n}', doc: 'HÃ m main' },
        { label: 'boilerplate', insertText: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\t${1}\n\treturn 0;\n}', doc: 'Khung chÆ°Æ¡ng trÃ¬nh C++' },
        { label: 'for', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${3}\n}', doc: 'VÃ²ng láº·p for' },
        { label: 'forrange', insertText: 'for (auto ${1:x} : ${2:container}) {\n\t${3}\n}', doc: 'VÃ²ng láº·p for-each' },
        { label: 'while', insertText: 'while (${1:condition}) {\n\t${2}\n}', doc: 'VÃ²ng láº·p while' },
        { label: 'if', insertText: 'if (${1:condition}) {\n\t${2}\n}', doc: 'Ráº½ nhÃ¡nh if' },
        { label: 'ifelse', insertText: 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', doc: 'if / else' },
        { label: 'cout', insertText: 'cout << ${1:value} << endl;', doc: 'In ra mÃ n hÃ¬nh' },
        { label: 'cin', insertText: 'cin >> ${1:value};', doc: 'Äá»c dá»¯ liá»‡u vÃ o' },
        { label: 'struct', insertText: 'struct ${1:Name} {\n\t${2}\n};', doc: 'Khai bÃ¡o struct' },
        { label: 'class', insertText: 'class ${1:Name} {\npublic:\n\t${2}\n};', doc: 'Khai bÃ¡o class' },
        { label: 'func', insertText: '${1:int} ${2:name}(${3}) {\n\t${4}\n}', doc: 'Äá»‹nh nghÄ©a hÃ m' },
        { label: 'vector', insertText: 'vector<${1:int}> ${2:v};', doc: 'Khai bÃ¡o vector' },
        { label: 'inc', insertText: '#include <${1:iostream}>', doc: 'ThÃªm thÆ° viá»‡n' }
    ];

    const K = monaco.languages.CompletionItemKind;
    const items = [];
    keywords.forEach((k) => items.push({ label: k, kind: K.Keyword, detail: 'keyword', insertText: k }));
    types.forEach((tp) => items.push({ label: tp, kind: K.TypeParameter, detail: 'type', insertText: tp }));
    stdfuncs.forEach((fn) => items.push({ label: fn, kind: K.Function, detail: 'std', insertText: fn }));
    headers.forEach((h) => items.push({ label: h, kind: K.Module, detail: 'header', insertText: h }));
    snippets.forEach((s) => items.push({
        label: s.label,
        kind: K.Snippet,
        detail: 'snippet',
        documentation: s.doc,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    }));

    const RESERVED = new Set(keywords.concat(types, stdfuncs, headers));
    let varsCache = { id: null, version: -1, list: [] };

    function getCppVariables(model) {
        const id = (model.uri && model.uri.toString()) || String(model.id || 'model');
        const version = typeof model.getVersionId === 'function' ? model.getVersionId() : 0;
        if (varsCache.id === id && varsCache.version === version) return varsCache.list;

        const text = model.getValue();
        const found = new Set();
        const add = (name) => {
            name = (name || '').trim().replace(/[*&]+$/, '');
            if (name && !RESERVED.has(name) && !found.has(name)) found.add(name);
        };
        let m;

        // kiá»ƒu tÃªn [= ... | ; | ( | [ ] :  vÃ­ dá»¥: int a = 1; vector<int> v; string s;
        const declRe = /(?:^|[;{}\(\s])([A-Za-z_]\w*(?:\s*<[^;{}()]*>)?)\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?=[=;\(\[,)])/gm;
        while ((m = declRe.exec(text))) {
            const type = m[1].trim();
            if (RESERVED.has(type) || /^(if|else|while|for|switch|return|case|using|namespace|typedef|new|delete)$/.test(type)) continue;
            m[2].split(',').forEach(add);
        }
        // auto x = ...
        const autoRe = /\bauto\s+([A-Za-z_]\w*)/g;
        while ((m = autoRe.exec(text))) add(m[1]);
        // struct / class / enum Name
        const namedRe = /\b(?:struct|class|enum)\s+(?:class\s+)?([A-Za-z_]\w*)/g;
        while ((m = namedRe.exec(text))) add(m[1]);
        // hÃ m: ret name(args) {
        const fnRe = /(?:^|[;{}\s])(?:[A-Za-z_]\w*(?:\s*<[^;{}()]*>)?[\s*&]+)+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/gm;
        while ((m = fnRe.exec(text))) add(m[1]);
        // #define X
        const defRe = /^\s*#\s*define\s+([A-Za-z_]\w*)/gm;
        while ((m = defRe.exec(text))) add(m[1]);
        // typedef ... Name;
        const tdRe = /typedef[^;]*?\b([A-Za-z_]\w*)\s*;/g;
        while ((m = tdRe.exec(text))) add(m[1]);

        varsCache = { id: id, version: version, list: Array.from(found) };
        return varsCache.list;
    }

    monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: function (model, position, context) {
            const word = model.getWordUntilPosition(position);
            const isManual = context &&
                context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;
            if (!word.word && !isManual) {
                return { suggestions: [] };
            }
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            const suggestions = items.map((it) => {
                const s = Object.assign({}, it);
                s.range = range;
                return s;
            });
            getCppVariables(model).forEach((name) => {
                suggestions.push({
                    label: name,
                    kind: K.Variable,
                    detail: 'biáº¿n',
                    insertText: name,
                    range: range
                });
            });
            return { suggestions: suggestions };
        }
    });
}

let javaCompletionsRegistered = false;

function registerJavaCompletions() {
    if (javaCompletionsRegistered || !window.monaco) return;
    javaCompletionsRegistered = true;

    const keywords = [
        'abstract', 'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
        'do', 'else', 'enum', 'extends', 'final', 'finally', 'for', 'goto', 'if', 'implements',
        'import', 'instanceof', 'interface', 'native', 'new', 'package', 'private', 'protected',
        'public', 'record', 'return', 'sealed', 'static', 'strictfp', 'super', 'switch',
        'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'var', 'volatile', 'while',
        'yield', 'true', 'false', 'null'
    ];
    const types = [
        'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short', 'void',
        'String', 'Integer', 'Double', 'Float', 'Long', 'Short', 'Byte', 'Character', 'Boolean',
        'Object', 'Math', 'System', 'Scanner', 'ArrayList', 'LinkedList', 'HashMap', 'HashSet',
        'TreeMap', 'TreeSet', 'Arrays', 'Collections', 'List', 'Map', 'Set', 'Queue', 'Deque',
        'StringBuilder', 'StringBuffer', 'Random', 'LocalDate', 'LocalDateTime', 'Optional',
        'Stream', 'Comparator', 'Runnable', 'Thread', 'Exception', 'RuntimeException',
        'IOException', 'File', 'Files', 'Path', 'Paths', 'BigInteger', 'BigDecimal'
    ];

    const M = (n) => ({ n: n, call: true });
    const F = (n) => ({ n: n, call: false });
    const MEMBERS = {
        'System': [F('out'), F('err'), F('in'), M('currentTimeMillis'), M('nanoTime'), M('exit'),
            M('getenv'), M('getProperty'), M('arraycopy')],
        'System.out': [M('println'), M('print'), M('printf'), M('write'), M('flush')],
        'System.err': [M('println'), M('print'), M('printf')],
        'Math': [M('abs'), M('max'), M('min'), M('pow'), M('sqrt'), M('cbrt'), M('random'),
            M('round'), M('floor'), M('ceil'), M('log'), M('exp'), M('sin'), M('cos'), M('tan'),
            F('PI'), F('E')],
        'String': [M('length'), M('charAt'), M('substring'), M('indexOf'), M('lastIndexOf'),
            M('equals'), M('equalsIgnoreCase'), M('contains'), M('startsWith'), M('endsWith'),
            M('toUpperCase'), M('toLowerCase'), M('trim'), M('replace'), M('split'), M('repeat'),
            M('toCharArray'), M('isEmpty'), M('compareTo'), M('concat'), M('format'), M('valueOf'),
            M('strip'), M('lines')],
        'Integer': [M('parseInt'), M('toString'), M('valueOf'), M('compare'), M('sum'),
            M('toBinaryString'), M('toHexString'), F('MAX_VALUE'), F('MIN_VALUE')],
        'Double': [M('parseDouble'), M('toString'), M('valueOf'), M('compare'), F('MAX_VALUE'),
            F('MIN_VALUE')],
        'Long': [M('parseLong'), M('toString'), M('valueOf'), F('MAX_VALUE'), F('MIN_VALUE')],
        'Arrays': [M('toString'), M('sort'), M('fill'), M('copyOf'), M('asList'), M('equals'),
            M('binarySearch'), M('stream'), F('stream')],
        'Collections': [M('sort'), M('reverse'), M('shuffle'), M('max'), M('min'), M('frequency'),
            M('swap'), M('unmodifiableList')],
        'ArrayList': [M('add'), M('get'), M('set'), M('remove'), M('size'), M('isEmpty'),
            M('clear'), M('contains'), M('indexOf'), M('forEach'), M('sort'), M('stream'), M('toArray')],
        'List': [M('add'), M('get'), M('set'), M('remove'), M('size'), M('isEmpty'), M('contains'),
            M('indexOf'), M('forEach'), M('sort'), M('stream'), M('toArray')],
        'Map': [M('put'), M('get'), M('getOrDefault'), M('containsKey'), M('keySet'), M('values'),
            M('entrySet'), M('remove'), M('size'), M('isEmpty'), M('forEach')],
        'HashMap': [M('put'), M('get'), M('getOrDefault'), M('containsKey'), M('keySet'),
            M('values'), M('entrySet'), M('remove'), M('size'), M('isEmpty'), M('forEach')],
        'Set': [M('add'), M('remove'), M('contains'), M('size'), M('isEmpty'), M('forEach')],
        'HashSet': [M('add'), M('remove'), M('contains'), M('size'), M('isEmpty'), M('forEach')],
        'Scanner': [M('nextLine'), M('next'), M('nextInt'), M('nextDouble'), M('nextBoolean'),
            M('nextLong'), M('hasNext'), M('hasNextLine'), M('close')],
        'StringBuilder': [M('append'), M('insert'), M('delete'), M('deleteCharAt'), M('replace'),
            M('reverse'), M('toString'), M('length'), M('charAt'), M('setLength')],
        'LocalDate': [M('now'), M('of'), M('plusDays'), M('minusDays'), M('getYear'),
            M('getMonthValue'), M('getDayOfMonth'), M('format')],
        'Optional': [M('of'), M('ofNullable'), M('empty'), M('get'), M('isPresent'), M('orElse'),
            M('ifPresent'), M('map'), M('filter')]
    };

    const statics = [
        'System.out.println', 'System.out.print', 'System.out.printf', 'System.err.println',
        'Math.abs', 'Math.max', 'Math.min', 'Math.pow', 'Math.sqrt', 'Math.random',
        'Integer.parseInt', 'Integer.toString', 'Double.parseDouble', 'String.valueOf',
        'Arrays.toString', 'Arrays.sort', 'Collections.sort'
    ];

    const snippets = [
        { label: 'main', insertText: 'public static void main(String[] args) {\n\t${1}\n}', doc: 'Điểm bắt đầu chương trình' },
        { label: 'sout', insertText: 'System.out.println(${1});', doc: 'In ra màn hình' },
        { label: 'soutf', insertText: 'System.out.printf("${1:%s}\\n", ${2});', doc: 'In theo định dạng' },
        { label: 'class', insertText: 'public class ${1:Main} {\n\t${2}\n}', doc: 'Khai báo lớp' },
        { label: 'fori', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', doc: 'Vòng lặp for' },
        { label: 'foreach', insertText: 'for (${1:String} ${2:item} : ${3:list}) {\n\t${4}\n}', doc: 'Vòng lặp for-each' },
        { label: 'if', insertText: 'if (${1:condition}) {\n\t${2}\n}', doc: 'Rẽ nhánh if' },
        { label: 'ifelse', insertText: 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', doc: 'if / else' },
        { label: 'tryc', insertText: 'try {\n\t${1}\n} catch (${2:Exception} e) {\n\t${3}\n}', doc: 'Bắt lỗi' },
        { label: 'scanner', insertText: 'Scanner sc = new Scanner(System.in);\n${1}', doc: 'Đọc dữ liệu từ bàn phím' },
        { label: 'array', insertText: '${1:int}[] ${2:arr} = new ${1:int}[${3:n}];', doc: 'Khai báo mảng' },
        { label: 'list', insertText: 'List<${1:String}> ${2:list} = new ArrayList<>();', doc: 'Khai báo List' }
    ];

    const K = monaco.languages.CompletionItemKind;
    const RESERVED = new Set(keywords.concat(types));
    const globals = [];
    keywords.forEach((k) => globals.push({ label: k, kind: K.Keyword, detail: 'keyword', insertText: k }));
    types.forEach((tp) => globals.push({ label: tp, kind: K.Class, detail: 'class', insertText: tp }));
    statics.forEach((s) => globals.push({ label: s, kind: K.Function, detail: 'method', insertText: s }));
    snippets.forEach((s) => globals.push({
        label: s.label,
        kind: K.Snippet,
        detail: 'snippet',
        documentation: s.doc,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    }));

    let infoCache = { id: null, version: -1, names: [], types: {} };

    function getJavaInfo(model) {
        const id = (model.uri && model.uri.toString()) || String(model.id || 'model');
        const version = typeof model.getVersionId === 'function' ? model.getVersionId() : 0;
        if (infoCache.id === id && infoCache.version === version) return infoCache;

        const text = model.getValue();
        const names = new Set();
        const typesMap = {};
        let m;

        const declRe = /\b(int|long|short|byte|char|float|double|boolean|String|var|[A-Z][A-Za-z0-9_$]*)\s+([a-zA-Z_$][\w$]*)\s*(?=[=;,)\[:])/g;
        while ((m = declRe.exec(text))) {
            const type = m[1];
            const name = m[2];
            if (RESERVED.has(name)) continue;
            names.add(name);
            if (/^[A-Z]/.test(type)) typesMap[name] = type;
        }
        const namedRe = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g;
        while ((m = namedRe.exec(text))) {
            if (!RESERVED.has(m[1])) names.add(m[1]);
        }

        infoCache = { id: id, version: version, names: Array.from(names), types: typesMap };
        return infoCache;
    }

    monaco.languages.registerCompletionItemProvider('java', {
        triggerCharacters: ['.'],
        provideCompletionItems: function (model, position, context) {
            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            const isManual = context &&
                context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke;
            const lineText = model.getLineContent(position.lineNumber);
            const before = lineText.slice(0, position.column - 1);
            const info = getJavaInfo(model);

            // Gợi ý thành viên sau dấu chấm: System.out.pr..., sc.ne...
            const mm = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.(\w*)$/.exec(before);
            if (mm) {
                const receiver = mm[1];
                const partial = mm[2].toLowerCase();
                const typeName = info.types[receiver] || receiver;
                const list = MEMBERS[receiver] ||
                    MEMBERS[typeName] ||
                    MEMBERS[typeName.replace(/<.*$/, '')] ||
                    [];
                return {
                    suggestions: list
                        .filter((it) => !partial || it.n.toLowerCase().indexOf(partial) === 0)
                        .map((it) => ({
                            label: it.call ? it.n + '()' : it.n,
                            kind: it.call ? K.Method : K.Field,
                            detail: receiver,
                            insertText: it.n,
                            range: range
                        }))
                };
            }

            if (!word.word && !isManual) return { suggestions: [] };

            const suggestions = globals.map((it) => Object.assign({}, it, { range: range }));
            info.names.forEach((name) => {
                suggestions.push({
                    label: name,
                    kind: K.Variable,
                    detail: info.types[name] ? info.types[name] : 'biến',
                    insertText: name,
                    range: range
                });
            });
            return { suggestions: suggestions };
        }
    });
}

function initEditor() {
    editor = monaco.editor.create($('monacoHost'), {
        theme: currentTheme === 'dark' ? 'vs-dark' : 'vs',
        language: 'python',
        automaticLayout: true,
        fontSize: BASE_FONT_SIZE,
        fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        wrappingIndent: 'same',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        tabSize: settings.tabSize,
        lineNumbers: settings.lineNumbers ? 'on' : 'off',
        insertSpaces: true,
        renderWhitespace: 'selection',
        smoothScrolling: true,
        padding: { top: 10 },
        quickSuggestions: { other: true, comments: false, strings: true },
        quickSuggestionsDelay: 10,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        wordBasedSuggestions: 'currentDocument',
        suggest: { showWords: true, showSnippets: true }
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActiveTab);

    // Tab HTML: gÃµ '<' tá»± thÃªm '>', gÃµ '>' tá»± Ä‘Ã³ng tháº» ("<div>" -> "<div></div>")
    editor.onDidType(function (text) {
        if (editorLang !== 'web') return;
        const model = editor.getModel();
        if (!model || model.getLanguageId() !== 'html') return;
        if (text === '<') autoCloseAngle();
        else if (text === '>') autoCloseTag();
    });

    // Zoom code (cháº¿ Ä‘á»™ vui): mÃ n hÃ¬nh zoom + lÆ°á»›t theo con trá» khi gÃµ / di chuyá»ƒn;
    // click chuá»™t Ä‘á»ƒ zoom ra
    editor.onKeyDown(() => {
        if (!settings.zoomFun) return;
        // Ä‘á»ƒ con trá» di chuyá»ƒn xong rá»“i má»›i tÃ­nh vá»‹ trÃ­ zoom
        setTimeout(zoomIn, 0);
    });
    // Báº¥m chuá»™t á»Ÿ Báº¤T Ká»² Ä‘Ã¢u trong khung editor (code, tab, thanh cÃ´ng cá»¥,
    // console) Ä‘á»u zoom ra -> báº¥m Cháº¡y/Dá»«ng... cÅ©ng thoÃ¡t zoom Ä‘Æ°á»£c.
    $('editorView').addEventListener('mousedown', () => {
        if (settings.zoomFun) zoomOut();
    });
}

// ---------- Views ----------

function showLanguage() {
    zoomOut();
    document.querySelector('.editor-header').classList.remove('hidden');
    $('editorView').classList.add('hidden');
    $('langView').classList.remove('hidden');
    slideIn($('langView'), 'left');
}

function disposeAllTabs() {
    if (editor) editor.setModel(null);
    tabs.forEach((tb) => tb.model.dispose());
    tabs = [];
    activeId = null;
    groups = [];
    activeGroupId = null;
}

function openLanguage(lang) {
    lang = (lang === 'cpp' || lang === 'web' || lang === 'java') ? lang : 'python';
    const switching = langInitialized && lang !== editorLang;
    if (switching) {
        persist();          // lÆ°u tab cá»§a ngÃ´n ngá»¯ hiá»‡n táº¡i trÆ°á»›c khi Ä‘á»•i
        disposeAllTabs();
    }
    clearTimeout(liveTimer);
    editorLang = lang;
    tabsKey = TABS_PREFIX + currentUserId + '_' + lang;
    savedKey = SAVED_PREFIX + currentUserId + '_' + lang;

    document.querySelector('.editor-header').classList.add('hidden');
    $('langView').classList.add('hidden');
    $('editorView').classList.remove('hidden');
    slideIn($('editorView'), 'right');

    if (!monacoReady) {
        loadMonaco(() => {
            initEditor();
            loadTabs();
            langInitialized = true;
            afterOpen();
        });
        return;
    }
    if (switching || !tabs.length) {
        loadTabs();
    }
    afterOpen();
}

function afterOpen() {
    setStatus(t('editor.status.ready'));
    updateConsoleTabsForLang();
    if (editorLang === 'web' && settings.live) {
        renderPreview();
    }
    setTimeout(() => editor && editor.layout(), 60);
}

// ---------- Preview (HTML / CSS / JS) ----------

let liveTimer = null;
let currentPreviewToken = null;

function collectWebFiles() {
    const group = activeGroup();
    if (!group) return { html: '', css: '', js: '' };
    const files = groupContents(group);
    return { html: files.html || '', css: files.css || '', js: files.js || '' };
}

function injectInHead(doc, html) {
    const i = doc.search(/<\/head\s*>/i);
    if (i >= 0) return doc.slice(0, i) + html + doc.slice(i);
    const j = doc.search(/<head[^>]*>/i);
    if (j >= 0) {
        const k = doc.indexOf('>', j) + 1;
        return doc.slice(0, k) + html + doc.slice(k);
    }
    const h = doc.search(/<html[^>]*>/i);
    if (h >= 0) {
        const k = doc.indexOf('>', h) + 1;
        return doc.slice(0, k) + html + doc.slice(k);
    }
    return html + doc;
}

function injectBeforeBodyEnd(doc, html) {
    const i = doc.search(/<\/body\s*>/i);
    if (i >= 0) return doc.slice(0, i) + html + doc.slice(i);
    return doc + html;
}

function consoleBridge(token) {
    return '<scr' + 'ipt>(' + function (token) {
        function ser(a) {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch (e) { return String(a); }
        }
        function post(level, args) {
            try {
                var text = Array.prototype.map.call(args, ser).join(' ');
                parent.postMessage({ __codeai: token, level: level, text: text }, '*');
            } catch (e) { /* ignore */ }
        }
        ['log', 'info', 'warn', 'error'].forEach(function (k) {
            var orig = console[k];
            console[k] = function () {
                post(k, arguments);
                if (orig) orig.apply(console, arguments);
            };
        });
        window.onerror = function (msg, url, line, col) {
            post('error', ['Uncaught ' + msg + ' (' + (line || 0) + ':' + (col || 0) + ')']);
        };
        window.addEventListener('unhandledrejection', function (e) {
            var r = e.reason;
            post('error', ['Unhandled promise rejection: ' + ((r && r.message) ? r.message : r)]);
        });
    }.toString() + ')(' + JSON.stringify(token) + ');</scr' + 'ipt>';
}

function buildPreviewDoc(token) {
    const src = collectWebFiles();
    let doc = (src.html && src.html.trim())
        ? src.html
        : '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Preview</title>\n</head>\n<body></body>\n</html>';

    // Bá»  cÃ¡c tham chiáº¿u file ná»™i bá»™ (sáº½ Ä‘Æ°á»£c nÃ´i suy trá»±c tiáº¿p)
    doc = doc.replace(/<link\b[^>]*href\s*=\s*["'][^"']*\.css["'][^>]*>/gi, '');
    doc = doc.replace(/<script\b[^>]*src\s*=\s*["'][^"']*\.js["'][^>]*>\s*<\/script>/gi, '');

    doc = injectInHead(doc, consoleBridge(token) + (src.css ? '<style>\n' + src.css + '\n</style>' : ''));
    if (src.js) {
        doc = injectBeforeBodyEnd(doc, '<scr' + 'ipt>\n' + src.js + '\n</scr' + 'ipt>');
    }
    return doc;
}

function resetWebConsole() {
    $('consoleOutput').innerHTML = '';
    consoleLen = 0;
    inputBuffer = '';
    liveSpan = null;
    pendingOutput = '';
    appendLine(t('editor.simNotice'), 'console-note');
}

function renderPreview() {
    if (editorLang !== 'web') return;
    const frame = $('previewFrame');
    if (!frame) return;
    const files = collectWebFiles();
    const empty = !files.html.trim() && !files.css.trim() && !files.js.trim();
    resetWebConsole();
    setConsoleTab('preview');
    if (empty) {
        setConsoleTab('console');
        appendLine(t('editor.previewEmpty'), 'console-sys');
        frame.srcdoc = '<!DOCTYPE html><html><body></body></html>';
        setStatus(t('editor.status.previewReady'));
        return;
    }
    const token = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    currentPreviewToken = token;
    frame.srcdoc = buildPreviewDoc(token);
    setStatus(t('editor.status.previewReady'));
}

function stopPreview() {
    if (editorLang !== 'web') return;
    clearTimeout(liveTimer);
    const frame = $('previewFrame');
    if (frame) frame.srcdoc = '<!DOCTYPE html><html><body></body></html>';
    currentPreviewToken = null;
    resetWebConsole();
    setStatus(t('editor.status.previewStopped'));
}

function scheduleLivePreview() {
    if (editorLang !== 'web' || !settings.live) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(renderPreview, 150);
}

function onPreviewMessage(e) {
    const d = e.data;
    if (!d || d.__codeai !== currentPreviewToken) return;
    const cls = (d.level === 'error' || d.level === 'warn') ? 'console-err' : 'console-sys';
    appendLine(String(d.text), cls);
}

// ---------- Console / Preview tabs ----------

function setConsoleTab(tab) {
    const preview = tab === 'preview';
    $('previewPane').classList.toggle('hidden', !preview);
    $('consoleOutput').classList.toggle('hidden', preview);
    document.querySelectorAll('#consoleTabs .ctab').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-pane') === tab);
    });
}

function updateConsoleTabsForLang() {
    const previewBtn = document.querySelector('#consoleTabs .ctab[data-pane="preview"]');
    const isWeb = editorLang === 'web';
    if (previewBtn) previewBtn.classList.toggle('is-hidden', !isWeb);
    if (!isWeb) setConsoleTab('console');
    else setConsoleTab(settings.live ? 'preview' : 'console');
    updateToolbarForLang();
}

function updateToolbarForLang() {
    const hide = editorLang === 'web' && settings.live;
    ['runBtn', 'stopBtn', 'rerunBtn'].forEach((id) => {
        const el = $(id);
        if (el) el.classList.toggle('hidden', hide);
    });
}

// ---------- WebSocket ----------

function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws/run?token=' + encodeURIComponent(getToken() || '');
}

function ensureSocket(onReady) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        onReady();
        return;
    }
    if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', onReady, { once: true });
        return;
    }
    setStatus(t('editor.status.connecting'), 'busy');
    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => onReady());

    ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        handleMessage(msg);
    });

    ws.addEventListener('close', () => {
        ws = null;
        if (running) {
            running = false;
            setRunning(false);
            appendLine(t('editor.status.offline'), 'console-err');
        }
    });

    ws.addEventListener('error', () => {
        appendLine(t('editor.status.offline'), 'console-err');
    });
}

function handleMessage(msg) {
    if (msg.type === 'started') {
        running = true;
        setRunning(true);
        setStatus(t('editor.status.running'), 'busy');
    } else if (msg.type === 'output') {
        // gá»™p output, render theo nhá»‹p khung hÃ¬nh Ä‘á»ƒ UI khÃ´ng bá»‹ Ä‘Æ¡
        pendingOutput += msg.data;
        if (pendingOutput.length > PENDING_MAX) {
            pendingOutput = pendingOutput.slice(pendingOutput.length - PENDING_MAX);
        }
        scheduleOutputFlush();
    } else if (msg.type === 'exit') {
        flushOutput();
        if (rerunPending) {
            rerunPending = false;
            clearTimeout(rerunTimer);
            runCode();
        } else {
            running = false;
            setRunning(false);
            setStatus(t('editor.status.done'));
            if (msg.compileFailed) {
                appendLine('');
                appendLine(t('editor.error.compileFailed'), 'console-err');
            } else {
                appendLine('');
                appendLine(t('editor.exit', { code: msg.code }), 'console-sys');
            }
        }
    } else if (msg.type === 'stopped') {
        flushOutput();
        if (!rerunPending) {
            appendLine(t('editor.status.stopped'), 'console-sys');
        }
    } else if (msg.type === 'error') {
        running = false;
        setRunning(false);
        setStatus(t('editor.status.offline'), 'err');
        const m = msg.message || '';
        if (m === 'unauthorized') {
            appendLine(t('editor.error.unauthorized'), 'console-err');
        } else if (m === 'compiler_not_found') {
            appendLine(t('editor.error.noCompiler'), 'console-err');
        } else if (m === 'java_not_found') {
            appendLine(t('editor.error.noJava'), 'console-err');
        } else if (m === 'java_no_class') {
            appendLine(t('editor.error.javaNoClass'), 'console-err');
        } else {
            appendLine(t('editor.error.spawn'), 'console-err');
        }
    }
}

function setRunning(isRunning) {
    $('runBtn').disabled = isRunning;
    $('stopBtn').disabled = !isRunning;
    if (isRunning) {
        $('consoleOutput').focus();
        startInputLine();
    } else {
        endInputLine();
    }
}

function runCode() {
    if (!monacoReady || !editor) return;
    if (settings.zoomFun) zoomOut();
    if (editorLang === 'web') {
        renderPreview();
        return;
    }
    clearConsole(false);
    const code = editor.getValue();
    persist();
    if (editorLang === 'java') {
        appendLine(t('editor.javaCompiling'), 'console-sys');
    }
    ensureSocket(() => {
        try {
            ws.send(JSON.stringify({ type: 'start', code: code, lang: editorLang }));
        } catch (e) {
            appendLine(t('editor.status.offline'), 'console-err');
        }
    });
}

function stopCode() {
    if (settings.zoomFun) zoomOut();
    if (editorLang === 'web') {
        stopPreview();
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
    }
}

function rerunCode() {
    if (!monacoReady || !editor) return;
    if (settings.zoomFun) zoomOut();
    if (editorLang === 'web') {
        renderPreview();
        return;
    }
    if (running) {
        // Ä‘ang cháº¡y: dá»«ng tiáº¿n trÃ¬nh cÅ© rá»“i cháº¡y láº¡i vá»›i code hiá»‡n táº¡i
        rerunPending = true;
        clearTimeout(rerunTimer);
        rerunTimer = setTimeout(() => {
            if (rerunPending) {
                rerunPending = false;
                runCode();
            }
        }, 1500);
        stopCode();
        return;
    }
    runCode();
}

// ---------- Init ----------

(async function init() {
    const user = await requireAuth();
    if (!user) return;

    currentUserId = user.id;
    tabsKey = TABS_PREFIX + user.id + '_python';
    savedKey = SAVED_PREFIX + user.id + '_python';

    $('userName').textContent = user.displayName || user.username;
    $('logoutBtn').addEventListener('click', async () => {
        const view = !$('editorView').classList.contains('hidden') ? $('editorView') : $('langView');
        await logoutUser();
        slideOut(view, 'left', () => { window.location.href = 'index.html'; });
    });

    applyI18n();
    applyTheme(currentTheme);
    clearConsole();
    setStatus(t('editor.status.ready'));
    slideIn($('langView'), 'right');

    // language picker
    document.querySelectorAll('.lang-card[data-lang]').forEach((card) => {
        card.addEventListener('click', () => {
            if (card.disabled) return;
            const lang = card.getAttribute('data-lang');
            if (lang === 'python' || lang === 'cpp' || lang === 'web' || lang === 'java') openLanguage(lang);
        });
    });

    // má»Ÿ tháº³ng ngÃ´n ngá»¯ qua ?lang=... (nÃºt á»Ÿ sáº£nh)
    const wanted = new URLSearchParams(location.search).get('lang');
    if (wanted === 'cpp' || wanted === 'python' || wanted === 'web' || wanted === 'java') {
        openLanguage(wanted);
    }

    // toolbar
    $('langBtn').addEventListener('click', showLanguage);
    $('runBtn').addEventListener('click', runCode);
    $('stopBtn').addEventListener('click', stopCode);
    $('rerunBtn').addEventListener('click', rerunCode);
    $('clearBtn').addEventListener('click', () => clearConsole(true));
    $('copyCodeBtn').addEventListener('click', copyAllCode);
    $('clearCodeBtn').addEventListener('click', clearAllCode);
    $('saveBtn').addEventListener('click', saveActiveTab);
    $('openTabBtn').addEventListener('click', openSavedModal);
    $('savedClose').addEventListener('click', closeSavedModal);
    $('savedModal').addEventListener('mousedown', (e) => {
        if (e.target === $('savedModal')) closeSavedModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !$('uiModal').classList.contains('hidden')) return;
        if (!$('savedModal').classList.contains('hidden')) {
            closeSavedModal();
        } else if (!$('settingsModal').classList.contains('hidden')) {
            closeSettings();
        }
    });
    $('openBtn').addEventListener('click', () => $('fileInput').click());
    $('downloadBtn').addEventListener('click', downloadActive);

    // settings
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
        if (!settings.zoomFun) zoomOut();
    });
    $('setZoom').addEventListener('input', (e) => {
        settings.zoomScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat(e.target.value) || DEFAULT_SETTINGS.zoomScale));
        $('setZoomValue').textContent = settings.zoomScale.toFixed(1) + 'x';
        saveSettings();
    });
    $('setLive').addEventListener('change', (e) => {
        settings.live = e.target.checked;
        saveSettings();
        updateToolbarForLang();
        if (editorLang === 'web') {
            if (settings.live) {
                setConsoleTab('preview');
                renderPreview();
            } else {
                setConsoleTab('console');
            }
        }
    });
    $('setReset').addEventListener('click', () => {
        settings = Object.assign({}, DEFAULT_SETTINGS);
        saveSettings();
        applyTheme('light');
        applySettings();
        toast(t('editor.saved'));
    });

    $('tabAdd').addEventListener('click', addTab);
    $('fileInput').addEventListener('change', onFilesChosen);

    // console terminal: báº¥m vÃ o rá»“i gÃµ trá»±c tiáº¿p nhÆ° terminal tháº­t
    $('consoleOutput').addEventListener('keydown', onConsoleKey);
    $('consoleOutput').addEventListener('paste', onConsolePaste);

    // tab Console / Preview
    $('consoleTabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.ctab');
        if (!btn || btn.classList.contains('is-hidden')) return;
        const pane = btn.getAttribute('data-pane');
        setConsoleTab(pane);
        if (pane === 'preview' && editorLang === 'web' && !currentPreviewToken) {
            renderPreview();
        }
    });

    // log/lá»—i JS tá»« iframe preview
    window.addEventListener('message', onPreviewMessage);

    initSplitter();
    applySplit();
    window.addEventListener('resize', applySplit);
})();
