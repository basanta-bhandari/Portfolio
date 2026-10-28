# Browser chat

`/chat/` is a browser-native implementation. Opening it does not run or require
NeoNet, a launcher, Rust, Python, an administrator account, or local-network
permission. The main site's navigation continues to hide Chat; the direct URL
is available.

Create a room, choose a nickname, and share the complete invite. Invite secrets
are in the URL fragment and are removed from the address bar after reading.
Participants can chat in the room or select someone for a private DM.

## Transport and hosting

Browsers exchange WebRTC offers and ICE candidates through the site's API.
Direct data channels use Cloudflare's public STUN service. No TURN deployment
is provisioned. Signed encrypted messages are also retained in the existing
Postgres/Neon database and fetched over same-origin HTTPS. This provides
history and delivery when a peer connection cannot be established. The client
polls while a conversation is active, backing off on failure and in hidden tabs.
Direct connections can be disabled in the browser identity's privacy settings.

`/api/chat` rewrites to the existing `api/tether-settings.js` entry point using
`browser_chat=1`; the handler lives in `lib/web-chat-handler.js`. The existing
settings route retains its authentication, method checks, and body limit.
This avoids adding a thirteenth standalone Vercel Function. Chat requests use
separate capability authentication and a 48 KiB request limit.

The existing `DATABASE_URL` is used. Tables and indexes are initialized lazily
with parameterized queries; no credentials are sent to the browser. There is
no third-party realtime subscription or new paid hosting service.

## Cryptography and retention

- Each browser-tab session generates independent ECDSA P-256 signing and
  ECDH P-256 exchange keys using Web Crypto.
- A room invite contains a random 256-bit secret. HKDF-SHA-256 derives separate
  AES-256-GCM encryption and room-admission keys. The server stores only a hash
  of the admission credential, never the invite secret or encryption key.
- DMs use ECDH with the other participant's signed exchange key and a distinct
  HKDF context. Possessing a room invite is insufficient to decrypt others' DMs.
- Signed registration records bind a public identity, display name, exchange
  key, session hash, room and connection preference. A separate invite-derived
  HMAC proves that a participant also possesses the room secret, preventing a
  signaling service from injecting its own key as a fake participant. Message signatures cover
  the routing header, nonce and ciphertext. AEAD binds that same header.
- Delivery receipts are signed and only accepted from an intended participant.
  Successful storage alone is displayed as Sent, not Delivered.
- Message reads exclude expired records, and clients also enforce expiry.
  Expired records are purged as the service is used; this is not a promise of
  secure deletion from backups or other participants' screenshots/copies.

Only ciphertext is stored as message content. Room names, nicknames, membership,
timing, recipients, and connection metadata remain visible to the service.
Session credentials are hashed server-side. Public signup and per-session
operations are rate-limited; rooms have bounded online membership, identities,
message history, and signaling. The initial public service has a global daily
message allowance to bound storage and costs.

## Boundaries

Browser keys and room credentials live in this tab's sessionStorage so ordinary
page reloads can restore it. No plaintext message history is persisted there.
These session secrets are **not passphrase-protected**. This does not provide
the native client's local history vault or protection against a copied browser
session/profile, a compromised device, or malicious code served by the site.
Closing/clearing the session may lose DM access. Retain invites to rejoin rooms;
room invites do not recover a lost DM private key.

Nicknames are not verified accounts. Browser sessions do not sign into native
Tether accounts, speak the Rust mesh wire protocol, forward other peers'
traffic, provide multi-hop routes, create a torrent swarm, shard cloud objects,
or expose Tether/SSH tunnels. Native interoperability needs a separate gateway.
This implementation must not be advertised as the completed decentralized
Tether network or as an independently audited messenger.

## Verification

`node tests/web-chat.test.js` exercises actual browser-compatible Web Crypto
against server signature verification. It also tests the handler against an
in-memory SQL test adapter: capability failures, tampering, room/DM isolation,
JSONB-order-independent retries, signed receipts, signaling admission, expiry,
and rate limits. This is not a substitute for testing the deployed database.
`node scripts/check-browser-chat.mjs --live` is an explicit opt-in check that
creates a disposable room against the deployed API. It verifies real database
isolation, ciphertext responses, duplicate retries, signatures and receipts,
then marks its synthetic participants offline.

Use two browser sessions against the deployed API to verify create/join,
room messages, DMs, receipts, reconnect/refresh and encrypted-relay fallback.

Live verification on 2026-10-27 passed: two independent browser sessions joined
a room, exchanged messages, established a WebRTC peer connection, and exchanged
a private DM after direct connections were disabled. Signed delivery, Refresh,
invite copying, unread DM indicators and key/history restoration after reloading
were exercised. The opt-in live API checks also passed against the actual
deployed database. Browser UI testing used Chromium; Zen/Firefox and Safari
runtime testing remains separate from API compatibility.
