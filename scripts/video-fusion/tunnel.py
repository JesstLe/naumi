"""Loopback forwarding to this task's standalone PostgreSQL, with SSH auth only on stdin."""
import argparse
import json
import os
from pathlib import Path
import select
import signal
import socketserver
import sys
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument("--metadata", required=True)
parser.add_argument("--deps", required=True)
args = parser.parse_args()
sys.path.insert(0, args.deps)
import paramiko

auth = json.load(sys.stdin)
if auth.get("host") != "103.30.76.93":
    raise ValueError("Unexpected fixture SSH host")
client = paramiko.SSHClient()
client.load_host_keys(auth["knownHostsFile"])
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(auth["host"], port=int(auth.get("port", 22)), username=auth["user"], password=auth["password"], timeout=20, allow_agent=False, look_for_keys=False)
auth.clear()
transport = client.get_transport()
transport.set_keepalive(15)

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        channel = transport.open_channel("direct-tcpip", ("127.0.0.1", 14732), self.request.getpeername())
        try:
            while True:
                readable, _, _ = select.select([self.request, channel], [], [], 30)
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    (channel if source is self.request else self.request).sendall(data)
        finally:
            channel.close()

class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

server = Server(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
metadata = Path(args.metadata)
metadata.write_text(json.dumps({"owner": "canvas-video-fusion-20261013", "pid": os.getpid(), "host": "103.30.76.93", "localPort": server.server_address[1], "remotePort": 14732}), encoding="utf-8")
stopping = threading.Event()
signal.signal(signal.SIGTERM, lambda *_: stopping.set())
signal.signal(signal.SIGINT, lambda *_: stopping.set())
try:
    while transport.is_active() and not stopping.wait(1):
        pass
finally:
    server.shutdown()
    server.server_close()
    client.close()
