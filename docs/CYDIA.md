# iPad Linux Lab repository

Public page and flat APT source: **https://www.basanta.cc/cydia/**.
`https://basanta.cc/cydia/` follows the site's existing canonical-host redirect.

## What is live

- An iOS 9-friendly HTML/CSS page with a Cydia source link and manual instructions.
- `Release`, `Packages`, `Packages.gz`, and `Packages.bz2` as static Vercel files.
- **Zero packages.** There is no Linux installer, boot launcher or automatic boot.
- Initial metadata is **unsigned**. A checksum detects corruption; it does not
  authenticate the publisher. Configure and test repository signing before
  publishing installable boot-related packages. Do not disable verification to
  work around errors.

This change does not touch the blog, database, Cloudflare Worker, R2 objects,
DNS, iPad filesystem or boot configuration. Pushing main uses the existing
GitHub-to-Vercel deployment flow; it does not prove a successful deployment.

## Regenerate and test

From the portfolio root, with Python 3 available:

```sh
python3 scripts/build-cydia-repo.py
node --test
python3 -m unittest discover -s tests -p test_cydia_repo.py -v
```

The script preserves the existing plain `cydia/Packages` index, compresses it
for older APT clients, and records byte counts plus MD5, SHA-1 and SHA-256 hashes
in `Release`. MD5/SHA-1 are included only for legacy client compatibility.
`SOURCE_DATE_EPOCH` makes the Release date reproducible. No directory of device
assets is scanned. Review and commit all four generated metadata files together.
The script refuses to overwrite signed metadata without a reviewed signing flow.

Vercel revalidates the Cydia files and serves the plain indexes as text. Compressed
files are download artifacts, not pages; do not assign `Content-Encoding: gzip`
to `Packages.gz`. Do not add Cloudflare browser challenges in front of APT files.

## Future packages and R2

Keep large redistributable `.deb` files outside Git and Vercel. Use a dedicated
`cydia/pool/` prefix or separate bucket on R2, not the blog's image-upload API.
The existing `media.basanta.cc` domain is one possible download host; no bucket,
object or DNS change is included in this commit.

When an actual reviewed package exists, generate its standard Debian control
index, including `Package`, `Version`, `Architecture: iphoneos-arm`, `Filename`,
`Size` and `SHA256`. An absolute HTTPS R2 `Filename` is the intended layout, but
first verify download/redirect/TLS support using the actual iOS 9 APT client.
Use immutable versioned object paths and publish the object before its index.
Update the zero-package notice and its test when the first package is ready.

Never publish project SSH keys, device identifiers, calibration, Apple-derived
iBSS/iBEC/DeviceTree assets, private diagnostic logs or the current boot bundle.
Only publish code and binaries whose redistribution rights have been checked.
No package installation script may invoke kloader or start Linux automatically.

## Device validation is separate

Adding the source must not launch a boot or modify partitions. Verify HTTPS and
source refresh on iOS before calling the repository device-tested. If old TLS or
certificate support fails, retain the error; do not weaken global site security.
The cable-free Linux handoff, payload size limits, recovery and persistence
remain separate engineering work. Website hosting alone does not solve them.

## The two local copies

Development: `~/Desktop/Codex-Prjs/Portfolio`.
Publishing: `~/Desktop/Submitted- Prjs/Portfolio`.

Keep these Cydia additions in both copies so a later `~/port.sh` does not delete
them. Do not run its broad `rsync --delete` or commit unrelated working changes
just to publish this feature. Commit and push the reviewed file list over SSH.
