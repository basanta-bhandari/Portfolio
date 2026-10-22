import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import time
import unittest


SCRIPT = Path(__file__).parents[1] / "tether" / "downloads" / "tether-web-bridge.py"
SPEC = importlib.util.spec_from_file_location("tether_web_bridge", SCRIPT)
bridge_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge_module)


class TetherWebBridgeTests(unittest.TestCase):
    def fake_neonet(self, root: Path) -> Path:
        script = root / "fake-neonet"
        snapshot = {
            "version": "0.5.2",
            "identity_fingerprint": "b" * 64,
            "background": {"running": True, "pid": 10, "bootstrap_cores": 1},
            "devices": [{
                "alias": "other-admin",
                "fingerprint": "a" * 64,
                "trusted": True,
                "address": "127.0.0.1:7000",
            }],
            "inbox": [],
            "incoming_files": [],
        }
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import json, sys\n"
            f"snapshot = {snapshot!r}\n"
            "if sys.argv[1] == 'control': print(json.dumps(snapshot))\n"
            "elif sys.argv[1] == 'up': print('online')\n"
            "elif sys.argv[1] == 'channel': sys.stdin.read(); print('acked')\n"
            "else: sys.exit(2)\n",
            encoding="utf-8",
        )
        script.chmod(script.stat().st_mode | stat.S_IXUSR)
        return script

    def test_wire_round_trip_and_expiry_pruning(self):
        now = int(time.time())
        message = {
            "v": 1,
            "id": "one",
            "username": "admin",
            "message": "hello",
            "createdAt": now,
            "expiresAt": now + 60,
        }
        self.assertEqual(bridge_module.decode_wire(bridge_module.encode_wire(message)), message)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            channel = root / "channel"
            channel.mkdir()
            path = channel / (("a" * 64) + ".log")
            expired = {**message, "id": "old", "expiresAt": now - 1}
            path.write_text(
                f"{now}\t{'a' * 64}\t{bridge_module.encode_wire(expired)}\n"
                f"{now}\t{'a' * 64}\tordinary Tether message\n"
                f"{now}\t{'a' * 64}\t{bridge_module.encode_wire(message)}\n",
                encoding="utf-8",
            )
            bridge = bridge_module.Bridge(str(self.fake_neonet(root)), root, set())
            bridge.prune()
            saved = path.read_text(encoding="utf-8")
            self.assertNotIn(bridge_module.encode_wire(expired), saved)
            self.assertEqual(len(saved.splitlines()), 2)
            self.assertIn('ordinary Tether message', saved)
            self.assertIn(bridge_module.encode_wire(message), saved)

    def test_send_uses_trusted_tether_device_and_keeps_only_local_outbox(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bridge = bridge_module.Bridge(str(self.fake_neonet(root)), root, set())
            sent = bridge.send("other-admin", "site-admin", "private hello")
            self.assertEqual(sent["recipient"], "a" * 64)
            self.assertEqual(sent["direction"], "outgoing")
            stored = json.loads(bridge.state_path.read_text(encoding="utf-8"))
            self.assertEqual(stored["messages"][0]["message"], "private hello")
            conversation = bridge.conversation("other-admin")
            self.assertEqual(conversation["messages"][0]["message"], "private hello")
            self.assertEqual(conversation["retentionHours"], 24)


if __name__ == "__main__":
    unittest.main()
