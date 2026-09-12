# Blog + admin system setup

This adds a small database-backed blog with a single-admin login, built to run
on Vercel's free tier. Free-tier Vercel functions can't write to disk between
requests, so posts live in a real (free) Postgres database instead of a JSON
file — everything else (login, the admin UI, the blog page) is plain
serverless functions and static HTML, no framework required.

## What was added

```
api/
  login.js         POST { username, password } -> sets a login cookie
  logout.js        POST -> clears the cookie
  session.js       GET -> { loggedIn: true/false }
  posts/
    index.js       GET (public, list posts) / POST (admin only, create post)
    [slug].js       GET (public, one post) / PUT+DELETE (admin only)
lib/
  db.js             Neon Postgres client (the one external dependency)
  auth.js           Session tokens + password hashing - built entirely on
                     Node's own `crypto` module, no auth-related npm packages
sql/
  schema.sql        run this once against your database
admin/
  login.html        admin login form
  dashboard.html    create/delete posts
blog/
  index.html         UPDATED - now pulls real posts from the API
  post.html           NEW - single post view
package.json          one dependency: @neondatabase/serverless
.env.example           template - copy to .env.local, never commit .env.local
gitignore-additions.txt   lines to add to your existing .gitignore
blog-styles-additions.css  CSS to append to blog/styles.css
```

Nothing here touches your existing `index.html` / `projects/` pages.

On dependencies: the only external package this uses is
`@neondatabase/serverless`, maintained directly by Neon (the database
provider) - there's no way to talk to Postgres from Node without some
client library, but everything else (password hashing, session tokens,
cookies) is built on Node's own `crypto` module rather than pulling in
`bcryptjs`/`jsonwebtoken`/`cookie`, to keep the dependency surface as small
as possible.

## 1. Add the gitignore lines

Copy the lines from `gitignore-additions.txt` into your existing `.gitignore`.
This keeps `.env.local`, `node_modules/`, and `.vercel` out of the repo —
your credentials never get committed.

## 2. Install dependencies

```bash
npm install
```

## 3. Create a free Postgres database on Vercel

In your Vercel project dashboard: **Storage tab -> Create Database -> Postgres**
(the free "Hobby" tier is enough for a personal blog). Vercel automatically
adds a `POSTGRES_URL` environment variable to your project once you do this —
you don't type it in yourself.

Then run the schema once, either by pasting `sql/schema.sql` into the query
editor Vercel's Postgres dashboard gives you, or via `psql` using the
connection string shown there.

## 4. Generate your admin credentials

Passwords are never stored in plain text - only a salted hash of it,
generated with Node's own `crypto` module (no npm install required for
this step):

```bash
node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('your-real-password',s,64).toString('hex'))"
```

Also generate a random session secret:

```bash
openssl rand -hex 32
```

## 5. Set environment variables

**In Vercel** (Project Settings -> Environment Variables), add:

- `ADMIN_USERNAME` — whatever username you want to log in with
- `ADMIN_PASSWORD_HASH` — the bcrypt hash from step 4
- `JWT_SECRET` — the random string from step 4

(`POSTGRES_URL` is already there from step 3.)

**For local dev**, copy `.env.example` to `.env.local` and fill in the same
values (you can run `vercel env pull .env.local` instead, to pull the real
Vercel values down locally). `.env.local` is gitignored — it stays on your
machine only.

## 6. Test locally

```bash
npx vercel dev
```

Visit `/admin/login.html`, log in, and publish a post from
`/admin/dashboard.html`. Then check `/blog/index.html` — it should show your
post instead of the "coming soon" placeholder.

## 7. Deploy

Push to GitHub as usual — Vercel picks up the `api/` folder automatically and
deploys it as serverless functions alongside your static pages. Nothing
special needed in `vercel.json`.

## Notes

- Only one admin account is supported by design (a single username/password
  pair in env vars) — enough for a personal site. If you ever want multiple
  authors, that's a bigger change (a `users` table + per-user sessions).
- The login cookie is `httpOnly` + `Secure` + `SameSite=Strict`, so it isn't
  readable from JavaScript and won't be sent cross-site.
- `/admin/dashboard.html` checks `/api/session` on load and bounces to the
  login page if you're not authenticated — but the real enforcement happens
  server-side in the API routes (`POST`/`PUT`/`DELETE` all re-check the
  session cookie), so hiding the page isn't the only thing protecting it.
