# Rewrite

Open Admin → Rewrite. All model requests originate in your browser.

## Local server

Start a model server using Ollama, LM Studio, llama.cpp, or Odysseus's model-serving controls. Enter the model server's address (not the Odysseus UI address), click Connect, and select a model. This does not start servers or install models automatically.

Ollama normally uses `http://127.0.0.1:11434/v1`. LM Studio normally uses `http://127.0.0.1:1234/v1`. The server must allow the exact origin of your blog admin in its CORS configuration. For Ollama, set `OLLAMA_ORIGINS` to that origin in the environment that starts its server. Keep the server bound to loopback. A hosted page may also prompt for local-network permission.

No API key is sent. Local mode supports loopback addresses only and has a three-minute completion timeout. The connected server receives your drafts and samples.

## Browser models

GPU mode uses WebLLM and switches to the smaller CPU model if GPU loading fails. CPU mode uses Transformers.js with its matching ONNX runtime. First use downloads the selected model; the quantized Qwen 0.5B CPU fallback is approximately 0.8 GB. Browser caches can be cleared or evicted. Load timeout is ten minutes; generation timeout for CPU is three minutes. Internet access is needed for initial dependencies and uncached model files.

## Samples and output

Add sample → Test → Review traits → Integrate → Ready. Integration updates editing instructions in `~/.local/share/portfolio-rewrite/rewrite-voice-profile.md`; it does not fine-tune weights. The per-user `rewrite-profile.service` owns that file, so clearing browser data does not remove it. If the helper is temporarily offline, the browser keeps a pending fallback and migrates it to the file when the helper returns.

Use **Export profile** for an additional portable copy and **Import profile** to restore one. Imports accept only files produced by this feature and replace the current local profile after confirmation.

Input accepts Markdown or TXT up to 1 MB. Samples must be 120–8,000 characters. Code and links are protected and restored, with one retry if the model damages them or invents new code or links. Failed rewrites preserve the preceding successful output. Always review meaning: these checks cannot prove factual equivalence.

## Verification

`node --test` runs regression tests, including mocked GPU fallback. To test Chromium against a real local model, set `PLAYWRIGHT_PATH` to an installed Playwright `index.mjs`, set `REWRITE_LIVE_URL` to the model endpoint, and run `node scripts/rewrite-browser.mjs`. It serves a local fixture on port 8765; only blog authentication/data are mocked, not inference. Screenshots go to `/tmp/rewrite-desktop.png` and `/tmp/rewrite-mobile.png`.

Set `REWRITE_TEST_CPU=only` to download and exercise the actual browser CPU worker. These tests do not publish posts or change the production database.
