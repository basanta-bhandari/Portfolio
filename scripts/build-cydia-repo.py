#!/usr/bin/env python3
"""Compress the existing flat Packages index and generate its Release checksums.

Only these explicit public metadata files are written; no device assets are
discovered or copied. Python is a maintainer tool, not a Vercel build dependency.
"""

import bz2
from datetime import datetime, timezone
from email.utils import format_datetime
import gzip
import hashlib
import os
from pathlib import Path
import time


def render_repository(packages, timestamp):
    files = {
        "Packages": packages,
        "Packages.gz": gzip.compress(packages, mtime=0),
        "Packages.bz2": bz2.compress(packages),
    }
    date = format_datetime(datetime.fromtimestamp(timestamp, timezone.utc), usegmt=True)
    lines = [
        "Origin: Basanta iPad Linux Lab",
        "Label: Basanta iPad Linux Lab",
        "Suite: stable",
        "Codename: ipad-lab",
        "Version: 1.0",
        "Architectures: iphoneos-arm",
        "Components: main",
        "Description: Experimental iPad Linux lab; repository hosting, not a Linux installer",
        "Date: " + date,
    ]
    for label, algorithm in (("MD5Sum", "md5"), ("SHA1", "sha1"), ("SHA256", "sha256")):
        lines.append(label + ":")
        for name, data in files.items():
            digest = hashlib.new(algorithm, data).hexdigest()
            lines.append(f" {digest} {len(data)} {name}")
    files["Release"] = ("\n".join(lines) + "\n").encode("utf-8")
    return files


def main():
    directory = Path(__file__).resolve().parents[1] / "cydia"
    # A future signed repo must regenerate its signatures together with Release.
    if any((directory / name).exists() for name in ("Release.gpg", "InRelease")):
        raise SystemExit("Signed metadata exists; use a reviewed signing workflow instead.")
    index = directory / "Packages"
    packages = index.read_bytes() if index.exists() else b""
    timestamp = int(os.environ.get("SOURCE_DATE_EPOCH", str(int(time.time()))))
    for name, data in render_repository(packages, timestamp).items():
        (directory / name).write_bytes(data)
    print("Generated flat Cydia indexes and Release. No packages uploaded or signatures created.")


if __name__ == "__main__":
    main()
