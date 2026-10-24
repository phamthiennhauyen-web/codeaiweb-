// Hiệu ứng chuyển màn hình (lướt vào / lướt ra).
(function () {
    const CLASSES = ['slide-in-right', 'slide-in-left', 'slide-out-right', 'slide-out-left'];

    function prep(el) {
        if (!el) return false;
        CLASSES.forEach((c) => el.classList.remove(c));
        return true;
    }

    function slideIn(el, dir) {
        if (!prep(el)) return;
        void el.offsetWidth; // ép reflow để animation chạy lại
        el.classList.add(dir === 'left' ? 'slide-in-left' : 'slide-in-right');
        // Luôn gỡ class sau khi animation xong. Có nơi 'animationend' không bắn
        // (vd. prefers-reduced-motion, phần tử vừa hiện) khiến class còn lại và
        // giữ nguyên transform translateX -> làm lệch cả màn hình/overlay.
        let done = false;
        const finish = function () {
            if (done) return;
            done = true;
            el.removeEventListener('animationend', finish);
            el.classList.remove('slide-in-right', 'slide-in-left');
        };
        el.addEventListener('animationend', finish);
        setTimeout(finish, 450);
    }

    function slideOut(el, dir, done) {
        if (!prep(el)) {
            if (done) done();
            return;
        }
        void el.offsetWidth;
        el.classList.add(dir === 'right' ? 'slide-out-right' : 'slide-out-left');
        let finished = false;
        const finish = function () {
            if (finished) return;
            finished = true;
            el.removeEventListener('animationend', finish);
            if (done) done();
        };
        el.addEventListener('animationend', finish);
        setTimeout(finish, 420);
    }

    window.slideIn = slideIn;
    window.slideOut = slideOut;
})();
