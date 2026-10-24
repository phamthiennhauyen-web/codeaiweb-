#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import threading


class _Client:
    def __init__(self, ws):
        self.ws = ws
        self.rooms = set()
        self.send_lock = threading.Lock()


class ProjectHub:
    def __init__(self):
        self._lock = threading.RLock()
        self._clients = {}

    def add(self, ws):
        client = _Client(ws)
        with self._lock:
            self._clients[id(ws)] = client
        return client

    def remove(self, ws):
        with self._lock:
            self._clients.pop(id(ws), None)

    def subscribe(self, ws, room):
        with self._lock:
            client = self._clients.get(id(ws))
            if client:
                client.rooms.add(room)

    def unsubscribe(self, ws, room):
        with self._lock:
            client = self._clients.get(id(ws))
            if client:
                client.rooms.discard(room)

    def send(self, client, payload):
        with client.send_lock:
            try:
                client.ws.send(json.dumps(payload, ensure_ascii=False))
                return True
            except Exception:
                return False

    def broadcast(self, room, payload):
        with self._lock:
            clients = [
                client for client in self._clients.values()
                if room in client.rooms
            ]
        dead = []
        for client in clients:
            if not self.send(client, payload):
                dead.append(client)
        if dead:
            with self._lock:
                for client in dead:
                    self._clients.pop(id(client.ws), None)
