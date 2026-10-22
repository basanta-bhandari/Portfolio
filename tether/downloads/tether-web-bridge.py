#!/usr/bin/env python3
"""Local bridge between basanta.cc's admin chat and the Tether/NeoNet CLI.

The bridge only listens on 127.0.0.1. Message bodies move between the browser
and the local Tether process; they are never sent to the portfolio backend.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


BRIDGE_VERSION = 1
DEFAULT_PORT = 7331
MAX_BODY_BYTES = 16 * 1024
MAX_MESSAGE_CHARS = 1000
RETENTION_SECONDS = 24 * 60 * 60
WIRE_PREFIX = "TWCHAT1:"
DEFAULT_ORIGINS = {
    "https://www.basanta.cc",
    "https://basanta.cc",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def encode_wire(value: dict) -> str:
    raw = compact_json(value).encode("utf-8")
    return WIRE_PREFIX + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_wire(text: str) -> dict | None:
    if not text.startswith(WIRE_PREFIX):
        return None
    try:
        encoded = text[len(WIRE_PREFIX) :]
        encoded += "=" * (-len(encoded) % 4)
        value = json.loads(base64.urlsafe_b64decode(encoded).decode("utf-8"))
        return value if isinstance(value, dict) and value.get("v") == 1 else None
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None


class Bridge:
    def __init__(self, neonet: str, root: Path, origins: set[str], token: str | None = None):
        self.neonet = neonet
        self.root = root
        self.origins = origins
        self.token = token or secrets.token_urlsafe(32)
        self.state_path = root / "web-chat-outbox.json"

    def run_neonet(self, arguments: list[str], input_text: str | None = None) -> str:
        environment = os.environ.copy()
        environment["NEONET_HOME"] = str(self.root)
        try:
            result = subprocess.run(
                [self.neonet, *arguments],
                input=input_text,
                text=True,
                capture_output=True,
                timeout=35,
                env=environment,
                check=False,
            )
        except FileNotFoundError as error:
            raise RuntimeError("Tether/NeoNet was not found. Restart the bridge with --neonet PATH.") from error
        except subprocess.TimeoutExpired as error:
            raise RuntimeError("Tether did not answer within 35 seconds. Check that a core route is online.") from error
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            raise RuntimeError(detail[:500] or "Tether command failed")
        return result.stdout

    def snapshot(self) -> dict:
        output = self.run_neonet(["control", "--inbox-limit", "100"])
        try:
            value = json.loads(output)
        except json.JSONDecodeError as error:
            raise RuntimeError("Tether returned an invalid control snapshot") from error
        if not isinstance(value, dict):
            raise RuntimeError("Tether returned an invalid control snapshot")
        return value

    def enable_node(self) -> dict:
        """Start Tether's saved background route, then return its live state."""
        try:
            self.run_neonet(["up"])
        except RuntimeError as error:
            # `up` may report that the existing daemon is already running.
            # The control snapshot is authoritative, so only surface the error
            # if no background route is actually alive.
            snapshot = self.snapshot()
            if not snapshot.get("background", {}).get("running"):
                raise error
            return snapshot
        return self.snapshot()

    def devices(self, snapshot: dict | None = None) -> list[dict]:
        snapshot = snapshot or self.snapshot()
        devices = []
        for item in snapshot.get("devices", []):
            if not isinstance(item, dict) or not item.get("trusted"):
                continue
            alias = str(item.get("alias") or "").strip()
            fingerprint = str(item.get("fingerprint") or "").strip().lower()
            if alias and len(fingerprint) == 64:
                devices.append({"alias": alias, "fingerprint": fingerprint})
        return devices

    def resolve_device(self, requested: str, snapshot: dict | None = None) -> dict:
        value = requested.strip().lower()
        for device in self.devices(snapshot):
            if value in {device["alias"].lower(), device["fingerprint"]}:
                return device
        raise ValueError("Choose a paired Tether device")

    def load_outbox(self) -> list[dict]:
        try:
            value = json.loads(self.state_path.read_text(encoding="utf-8"))
            messages = value.get("messages", []) if isinstance(value, dict) else []
            return [message for message in messages if isinstance(message, dict)]
        except FileNotFoundError:
            return []
        except (OSError, json.JSONDecodeError):
            return []

    def save_outbox(self, messages: list[dict]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(compact_json({"version": 1, "messages": messages}), encoding="utf-8")
        os.replace(temporary, self.state_path)
        try:
            self.state_path.chmod(0o600)
        except OSError:
            pass

    def prune(self) -> None:
        now = int(time.time())
        active = [message for message in self.load_outbox() if int(message.get("expiresAt", 0)) > now]
        self.save_outbox(active)
        for directory in (self.root / "channel", self.root / "identity" / "channel"):
            if not directory.is_dir():
                continue
            for path in list(directory.glob("*.log"))[:256]:
                self.prune_log(path, now)

    def prune_log(self, path: Path, now: int) -> None:
        try:
            original = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return
        kept = []
        changed = False
        for line in original.splitlines(keepends=True):
            fields = line.rstrip("\r\n").split("\t", 2)
            wire = decode_wire(fields[2]) if len(fields) == 3 else None
            if wire is not None and int(wire.get("expiresAt", 0)) <= now:
                changed = True
                continue
            kept.append(line)
        if changed:
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_text("".join(kept), encoding="utf-8")
            os.replace(temporary, path)

    def conversation(self, requested: str) -> dict:
        self.prune()
        snapshot = self.snapshot()
        device = self.resolve_device(requested, snapshot)
        fingerprint = device["fingerprint"]
        aliases = {item["fingerprint"]: item["alias"] for item in self.devices(snapshot)}
        messages: dict[str, dict] = {}

        for directory in (self.root / "channel", self.root / "identity" / "channel"):
            path = directory / f"{fingerprint}.log"
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except (FileNotFoundError, OSError, UnicodeDecodeError):
                continue
            for line in lines:
                fields = line.split("\t", 2)
                if len(fields) != 3:
                    continue
                wire = decode_wire(fields[2])
                if wire is None or int(wire.get("expiresAt", 0)) <= int(time.time()):
                    continue
                message_id = str(wire.get("id") or "")
                if not message_id:
                    continue
                sender_fingerprint = fields[1].strip().lower()
                messages[message_id] = {
                    "id": message_id,
                    "username": str(wire.get("username") or aliases.get(sender_fingerprint) or sender_fingerprint[:12]),
                    "message": str(wire.get("message") or ""),
                    "createdAt": int(wire.get("createdAt", fields[0])),
                    "expiresAt": int(wire.get("expiresAt", 0)),
                    "direction": "incoming",
                }

        for message in self.load_outbox():
            if message.get("recipient") == fingerprint and int(message.get("expiresAt", 0)) > int(time.time()):
                messages[str(message["id"])] = message

        ordered = sorted(messages.values(), key=lambda item: (int(item.get("createdAt", 0)), str(item.get("id", ""))))
        return {"device": device, "messages": ordered[-200:], "retentionHours": 24}

    def send(self, requested: str, username: str, message_text: str) -> dict:
        message_text = message_text.strip()
        username = username.strip()
        if not message_text or len(message_text) > MAX_MESSAGE_CHARS:
            raise ValueError(f"Messages must contain 1 to {MAX_MESSAGE_CHARS} characters")
        if not username or len(username) > 32:
            raise ValueError("Invalid admin display name")
        snapshot = self.snapshot()
        device = self.resolve_device(requested, snapshot)
        now = int(time.time())
        wire = {
            "v": 1,
            "id": secrets.token_hex(16),
            "username": username,
            "message": message_text,
            "createdAt": now,
            "expiresAt": now + RETENTION_SECONDS,
        }
        self.run_neonet(["channel", device["fingerprint"], "--stdin"], encode_wire(wire))
        stored = {
            **wire,
            "recipient": device["fingerprint"],
            "direction": "outgoing",
        }
        messages = [item for item in self.load_outbox() if int(item.get("expiresAt", 0)) > now]
        messages.append(stored)
        self.save_outbox(messages[-500:])
        return stored


def handler_for(bridge: Bridge):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TetherWebBridge/1"

        def log_message(self, pattern: str, *arguments: object) -> None:
            sys.stderr.write("tether-web-bridge: " + (pattern % arguments) + "\n")

        def origin(self) -> str:
            return self.headers.get("Origin", "")

        def cors(self) -> bool:
            origin = self.origin()
            if origin not in bridge.origins:
                return False
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Tether-Bridge-Token")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Vary", "Origin")
            return True

        def reply(self, status: int, value: object) -> None:
            body = compact_json(value).encode("utf-8")
            self.send_response(status)
            if not self.cors():
                self.end_headers()
                return
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self) -> bool:
            return self.origin() in bridge.origins and secrets.compare_digest(
                self.headers.get("X-Tether-Bridge-Token", ""), bridge.token
            )

        def do_OPTIONS(self) -> None:
            if self.origin() not in bridge.origins:
                self.send_response(403)
                self.end_headers()
                return
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self) -> None:
            if not self.authorized():
                self.reply(401, {"error": "Bridge token or website origin was rejected"})
                return
            try:
                route = urlparse(self.path)
                if route.path == "/v1/status":
                    bridge.prune()
                    snapshot = bridge.snapshot()
                    self.reply(200, {
                        "bridgeVersion": BRIDGE_VERSION,
                        "tetherVersion": snapshot.get("version"),
                        "identityFingerprint": snapshot.get("identity_fingerprint"),
                        "background": snapshot.get("background", {}),
                        "devices": bridge.devices(snapshot),
                        "retentionHours": 24,
                    })
                elif route.path == "/v1/messages":
                    device = parse_qs(route.query).get("device", [""])[0]
                    self.reply(200, bridge.conversation(device))
                else:
                    self.reply(404, {"error": "Unknown bridge endpoint"})
            except ValueError as error:
                self.reply(400, {"error": str(error)})
            except RuntimeError as error:
                self.reply(503, {"error": str(error)})
            except Exception as error:
                self.log_error("request failed: %s", error)
                self.reply(500, {"error": "Local Tether bridge failed"})

        def do_POST(self) -> None:
            if not self.authorized():
                self.reply(401, {"error": "Bridge token or website origin was rejected"})
                return
            try:
                route = urlparse(self.path).path
                if route == "/v1/enable":
                    snapshot = bridge.enable_node()
                    self.reply(200, {
                        "enabled": True,
                        "background": snapshot.get("background", {}),
                        "identityFingerprint": snapshot.get("identity_fingerprint"),
                        "devices": bridge.devices(snapshot),
                        "retentionHours": 24,
                    })
                    return
                if route != "/v1/messages":
                    self.reply(404, {"error": "Unknown bridge endpoint"})
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_BODY_BYTES:
                    raise ValueError("Invalid request size")
                payload = json.loads(self.rfile.read(length))
                message = bridge.send(
                    str(payload.get("device") or ""),
                    str(payload.get("username") or ""),
                    str(payload.get("message") or ""),
                )
                self.reply(201, {"message": message})
            except (ValueError, json.JSONDecodeError) as error:
                self.reply(400, {"error": str(error)})
            except RuntimeError as error:
                self.reply(503, {"error": str(error)})
            except Exception as error:
                self.log_error("request failed: %s", error)
                self.reply(500, {"error": "Local Tether bridge failed"})

    return Handler


def find_neonet(explicit: str | None) -> str:
    if explicit:
        return str(Path(explicit).expanduser())
    environment = os.environ.get("NEONET_BINARY")
    if environment:
        return str(Path(environment).expanduser())
    installed = shutil.which("neonet")
    if installed:
        return installed
    raise SystemExit("Tether/NeoNet was not found. Pass its path with --neonet /path/to/neonet-or-AppImage")


def main() -> None:
    parser = argparse.ArgumentParser(description="Use Tether messaging from the basanta.cc admin page")
    parser.add_argument("--neonet", help="Path to the neonet binary or Tether AppImage")
    parser.add_argument("--home", help="Tether state directory (default: NEONET_HOME or ~/.neonet)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--allow-origin", action="append", default=[], help="Additional website origin")
    arguments = parser.parse_args()
    if arguments.port < 1024 or arguments.port > 65535:
        parser.error("--port must be between 1024 and 65535")
    root = Path(arguments.home or os.environ.get("NEONET_HOME", "~/.neonet")).expanduser()
    supplied_token = os.environ.get("TETHER_BRIDGE_TOKEN", "")
    if supplied_token and (len(supplied_token) < 32 or len(supplied_token) > 200):
        raise SystemExit("TETHER_BRIDGE_TOKEN must contain 32 to 200 characters")
    bridge = Bridge(
        find_neonet(arguments.neonet),
        root,
        DEFAULT_ORIGINS | set(arguments.allow_origin),
        supplied_token or None,
    )
    server = ThreadingHTTPServer(("127.0.0.1", arguments.port), handler_for(bridge))
    print("Tether web bridge is ready.", flush=True)
    print(f"Local address: http://127.0.0.1:{arguments.port}", flush=True)
    print(f"Bridge token: {bridge.token}", flush=True)
    print("Keep this window open while using admin chat. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nTether web bridge stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
