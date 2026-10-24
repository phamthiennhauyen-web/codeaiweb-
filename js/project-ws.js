(function () {
    'use strict';

    class ProjectSocket {
        constructor(options) {
            this.options = options || {};
            this.ws = null;
            this.manualClose = false;
            this.retry = 0;
            this.rooms = new Set();
            this.seen = new Set();
            this.timer = null;
            this.pingTimer = null;
        }

        connect() {
            this.manualClose = false;
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(protocol + '//' + location.host + '/ws/projects');
            this.setStatus('connecting');
            this.ws.addEventListener('open', () => {
                const auth = this.options.shareToken
                    ? { type: 'auth', shareToken: this.options.shareToken }
                    : { type: 'auth', sessionToken: getToken() };
                this.ws.send(JSON.stringify(auth));
            });
            this.ws.addEventListener('message', (event) => {
                let data = null;
                try { data = JSON.parse(event.data); } catch (e) { return; }
                this.handle(data);
            });
            this.ws.addEventListener('close', () => {
                this.setStatus('offline');
                clearInterval(this.pingTimer);
                if (this.manualClose) return;
                this.retry = Math.min(this.retry + 1, 6);
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.connect(), Math.min(1000 * Math.pow(1.8, this.retry), 15000));
            });
            this.ws.addEventListener('error', () => {
                this.setStatus('offline');
            });
        }

        handle(data) {
            if (data.type === 'ready') {
                this.retry = 0;
                this.setStatus('online');
                this.rooms.forEach((room) => this.send({ type: 'subscribe', projectId: room }));
                clearInterval(this.pingTimer);
                this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
                return;
            }
            if (data.type === 'pong' || data.type === 'subscribed') return;
            if (data.type === 'error') return;
            if (data.eventId) {
                if (this.seen.has(data.eventId)) return;
                this.seen.add(data.eventId);
                if (this.seen.size > 300) {
                    const first = this.seen.values().next().value;
                    this.seen.delete(first);
                }
            }
            if (this.options.onEvent) this.options.onEvent(data);
        }

        subscribe(projectId) {
            if (!projectId) return;
            this.rooms.add(projectId);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send({ type: 'subscribe', projectId });
            }
        }

        send(data) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        }

        setStatus(status) {
            if (this.options.onStatus) this.options.onStatus(status);
        }

        close() {
            this.manualClose = true;
            clearTimeout(this.timer);
            clearInterval(this.pingTimer);
            if (this.ws) this.ws.close();
        }
    }

    window.ProjectSocket = ProjectSocket;
})();
