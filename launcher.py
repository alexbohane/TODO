"""
Native macOS launcher for the Todo App.
Starts the FastAPI server in a background thread and opens a pywebview window.
"""

import signal
import socket
import sys
import threading
import time

import uvicorn
import webview

HOST = "127.0.0.1"
PORT = 8000


def _port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) != 0


def _wait_for_server(host: str, port: int, timeout: float = 10.0):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if not _port_available(host, port):
            return True
        time.sleep(0.1)
    return False


def _run_server():
    uvicorn.run("app.main:app", host=HOST, port=PORT, log_level="warning")


def main():
    if not _port_available(HOST, PORT):
        print(f"Port {PORT} is already in use. Is another instance running?")
        sys.exit(1)

    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()

    if not _wait_for_server(HOST, PORT):
        print("Server failed to start.")
        sys.exit(1)

    window = webview.create_window(
        "Todo App",
        f"http://{HOST}:{PORT}",
        width=780,
        height=820,
        min_size=(400, 500),
    )
    webview.start()

    signal.raise_signal(signal.SIGTERM)


if __name__ == "__main__":
    main()
