# Site security and UI review — 25 October 2026

## Addressed

- **Stored XSS in blog Markdown.** The previous renderer escaped angle brackets but interpolated unescaped quotes into image/link attributes. It also ran formatting replacements over generated HTML. The replacement tokenizes raw Markdown once, escapes text and attributes, restricts URL schemes, and supports paragraphs, headings, lists, code, links, and raster images. Existing raster data images remain readable.
- **Admin write requests.** Every API now checks the exact browser origin for writes, rejects cross-site requests, validates JSON and request sizes, and returns controlled errors. Queries continue to use parameterized SQL templates.
- **Authentication.** Sign-in and password changes have database-backed attempt limits: ten per account and fifty per IP in fifteen minutes. IPs and account keys are HMAC hashes. Password hashing runs asynchronously with bounded input. Invalid/expired/malformed sessions are rejected. Remembered sessions retain their thirty-day lifetime.
- **Logout and account changes.** Logout revokes the current signed token on the server; only its SHA-256 fingerprint and expiry are stored. Password and permission changes increment the account's auth version. Other devices remain signed in after an ordinary logout. Revoked/expired tokens cannot be reused.
- **Input constraints.** Post fields, slugs, passwords, project URLs, link/category arrays, and Tether boolean settings have explicit validation. New projects have one to three categories. Existing projects with more categories may keep their unchanged category set.
- **Browser headers.** Public pages, login, and the main admin page get a Content Security Policy with hashes for their existing inline scripts; arbitrary inline scripts and event handlers are not allowed there. Site-wide policies constrain embedding, object content, form targets, content sniffing, referrers, and transport. Session/admin/API responses are private and non-cacheable. Legacy WebOS/Room Quest pages retain a compatible baseline policy because they still use inline event handlers.
- **Supply chain.** Neon is pinned to 1.0.2; package-lock.json fixes the transitive graph and integrity hashes. No dependency code or package-manager install was run locally. The lock was generated from the official npm registry metadata, rejecting lifecycle scripts. Deployment lifecycle scripts are disabled in .npmrc. OSV returned no known advisories for the twelve pinned packages when checked on this date. This is a point-in-time database check, not proof that dependencies cannot contain bugs or malicious code. Dependabot can propose weekly updates; it does not automatically merge them.
- **UI/reliability.** Improved mobile navigation and admin tabs, focus visibility, theme-aware hover contrast, disabled submit states, long text wrapping, network timeouts, retry controls, and failed save/delete reporting. Storage-disabled browsers can still change theme and use the current chat connection. Local document frames are sandboxed.
- **Projects initialization.** Already-initialized databases skip the default-project import. Its ordering column uses an unambiguous SQL name rather than the PostgreSQL POSITION keyword.

## Validation

- Built-in Node regression tests cover rendering attacks, request guards, role restrictions, token replay, password/session handling, input constraints, legacy category preservation, throttling, and the existing R2 signature checks.
- Existing Python bridge tests run without installing packages.
- Browser checks use a local fixture server, including malicious post content, with the actual CSP. They do not create/delete production posts, projects, or admin accounts. The attack text remained text, with no script nodes or injected event attributes.
- Production read-only/API rejection checks and deployment status are verified after the port script runs. Authentication tests use a database stub; they are not a substitute for a signed-in production admin acceptance test.

## Maintaining the policy

After editing an inline page script, run:

```sh
node scripts/security-headers.mjs
node scripts/security-headers.mjs --check
node --test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Commit the regenerated vercel.json together with the page edit. No npm/pnpm/bun command is required for these checks. The login_attempts and revoked_sessions tables are created idempotently by the API; no existing content tables are replaced.

## Limits and host responsibilities

- The local Node executable reported 22.23.1. The October security release for this line is **22.23.4**. Updating website source does not update that workstation executable. Update it through its trusted installation source. [Node advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
- package.json selects Vercel's supported Node 22 line. Vercel manages minor/patch rollout; selecting the major is not independently observing the runtime patch version. [Vercel runtime documentation](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
- This review does not establish that the machine, GitHub account, Cloudflare account, registrar, or production secrets have never been compromised. It does not include an authenticated account-settings audit or a review of the compiled Tether binary. No credentials were changed.
- Cloudflare worker/DNS/billing settings were not changed. Existing upload URLs are short-lived, signed, type/size bounded and restricted to blog-authorized admins; R2's global storage/operation allowances remain provider limits, not a hard spend cap imposed by this site.
- Tether visibility/download toggles control UI availability; public static build URLs are not confidential access controls.
- Application throttling is not a DDoS firewall. Vercel/Cloudflare still handle edge-level abuse and TLS. A website cannot clear a visitor's router DNS cache or fix a compromised certificate authority.
- Security remains an ongoing maintenance task. This review fixes identified issues; it does not certify the absence of all vulnerabilities.

## Sources checked

- [Node October 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Neon changelog](https://github.com/neondatabase/serverless/blob/main/CHANGELOG.md)
- [Vercel security headers](https://vercel.com/docs/cdn-security/security-headers)
- [OSV public vulnerability database](https://osv.dev/)
