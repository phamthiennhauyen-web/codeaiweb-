(function () {
    'use strict';

    var THEME_KEY = 'codeai_theme';

    function getTheme() {
        try {
            return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
        } catch (e) {
            return 'light';
        }
    }

    function applyTheme(theme) {
        var t = theme === 'dark' ? 'dark' : 'light';
        try {
            localStorage.setItem(THEME_KEY, t);
        } catch (e) { /* ignore */ }
        document.documentElement.classList.toggle('theme-dark', t === 'dark');
        return t;
    }

    function toggleTheme() {
        return applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }

    applyTheme(getTheme());

    window.CodeTheme = {
        KEY: THEME_KEY,
        get: getTheme,
        apply: applyTheme,
        toggle: toggleTheme
    };
})();
