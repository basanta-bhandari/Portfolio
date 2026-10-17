# Room Quest Tailscale sync companion

The hosted Room Quest page cannot open SSH or raw LAN sockets. This small Node.js service stores encrypted browser snapshots and is intended to sit behind Tailscale Serve. It has no package dependencies.

## Run it

Generate a long random token, then run:

```sh
ROOMQUEST_TOKEN="replace-with-a-long-random-token" \
ROOMQUEST_NODE_NAME="Home mini PC" \
ROOMQUEST_ORIGINS="https://basanta.space,https://room-quest-workspace.lucky-lemon-0693.chatgpt.site" \
node companion/server.mjs
```

In a second terminal on the same machine:

```sh
tailscale serve --bg localhost:8787
tailscale serve status
```

Tailscale prints the private `https://<device>.<tailnet>.ts.net` URL. Add that URL, the same access token, and the same encryption passphrase in Room Quest on every device.

The first authenticated connection pins the companion's stable seed identity in that browser. Later connections fail if the same URL starts reporting a different identity. Devices are recognized by their browser-local device ID and use a logical revision that advances beyond every revision they have observed, so conflict order does not depend on clocks being perfectly synchronized.

`localStorage` and IndexedDB are still local to each browser profile and origin. Vercel serves the application, while this companion carries encrypted snapshots between devices on the tailnet. Browsers cannot safely perform UDP discovery or scan the LAN, so each device needs the same seed URL once; after that, the companion lists the devices it recognizes.

Use Tailscale grants to restrict access to the device that runs this service. The service binds to `127.0.0.1` by default, requires an exact browser origin, checks a bearer token, rejects stale per-device revisions, limits request size, and writes state atomically with private file permissions. The browser encrypts the data with PBKDF2 and AES-GCM before upload. This is a personal sync design and has not had an independent security audit.

Optional environment variables:

- `ROOMQUEST_PORT`: local port, default `8787`
- `ROOMQUEST_DATA_DIR`: storage directory, default `./roomquest-data`
- `ROOMQUEST_MAX_BYTES`: maximum request size, default 25 MiB
- `ROOMQUEST_HOST`: listen address, default `127.0.0.1`
- `ROOMQUEST_NODE_NAME`: human-readable name shown after the seed is trusted

Do not put tokens, passphrases, or passwords in Git. SSH passwords remain device-local and are not included in sync snapshots.
