# Local Rewrite Feature — Complete Rebuild Specification

## Status

The feature described here is intentionally **not installed**. The Admin page contains only Blog and Projects. No rewrite JavaScript, browser model worker, profile helper, model-service unit, or rewrite test is part of the active application.

This document preserves the design closely enough to rebuild it later without keeping executable feature code in the site.

Before rebuilding, fix and validate the laptop cooling system. During the original implementation, four consecutive Llama 3.2 3B generations ended in an abrupt hardware-level shutdown. Never run the live inference suite unattended. Run Dell F12/ePSA fan and thermal diagnostics first, inspect the vents, and do not assume that a clean Linux journal rules out a firmware thermal or power cutoff.

## Original user-facing behavior

The feature occupied a third Admin tab between **Blog** and **Projects**. Its heading was **Voice editor**. It accepted Markdown or plain text and returned the same format. Nothing was sent to Vercel, Neon, Cloudflare, or any hosted inference API.

The normal flow was:

1. Select a runtime and model.
2. Paste text or load a `.md`/`.txt` file.
3. Choose Light, Balanced, or Strong editing.
4. Optionally keep harmless rough edges.
5. Run the edit.
6. Copy, download, or move the result into the Blog editor.

The sample-learning flow was exactly:

`Add sample → Testing... → Integrate? → Ready!`

The user reviewed extracted presentation traits before integrating them. Integration updated a Markdown instruction profile; it never fine-tuned model weights.

## Required file layout

Recreate these files only when the feature is deliberately restored:

| File | Responsibility |
| --- | --- |
| `admin/rewrite.js` | UI state, event handlers, runtime selection, file I/O, sample workflow, chunk orchestration |
| `admin/rewrite-local.js` | Loopback-only OpenAI-compatible model adapter |
| `admin/rewrite-prompt.js` | Voice rules, prompt construction, Markdown locks, splitting, filenames, profile parser, injection scanner |
| `admin/rewrite-profile-store.js` | Five-second-timeout client for the local profile helper |
| `admin/rewrite-worker.js` | WebLLM worker entry point |
| `admin/rewrite-cpu-worker.js` | Transformers.js CPU worker |
| `scripts/rewrite-profile-server.mjs` | Loopback-only profile file service |
| `scripts/rewrite-profile.service` | Per-user systemd unit for the profile helper |
| `scripts/ollama-vulkan.service` | Optional per-user Ollama/Vulkan unit |
| `scripts/rewrite-browser.mjs` | Playwright end-to-end and layout harness |
| `tests/rewrite-local.test.js` | URL and local API contract tests |
| `tests/rewrite-prompt.test.js` | Prompt, Markdown, profile, file, and injection tests |
| `tests/rewrite-ui.test.js` | Mocked Admin workflow test |

The Admin page must load only one feature entry point:

```html
<script type="module" src="/admin/rewrite.js"></script>
```

Removing that line and the panel must leave Blog and Projects functional.

## Admin UI contract

Add a `Rewrite` tab with `id="rewriteTab"` and a panel with `id="rewritePanel"`. Keep the compact desktop layout and collapse to one column below 620 px. The page must never overflow horizontally at mobile widths.

The runtime selector is `rewriteRuntime` and has these choices:

- `local`: **Local Ollama** (recommended for a supported, thermally healthy machine)
- `gpu`: **Direct browser WebGPU (experimental)**
- `cpu`: **Direct browser CPU (slow fallback)**

Do not label direct browser WebGPU as the MX230 path. On Firefox/Linux it may be unavailable even when Ollama can use the GPU. Never silently change `gpu` to `cpu`; show an actionable error and preserve the selected value.

Core element IDs:

```text
rewriteRuntime rewriteEndpoint connectRewrite rewriteModel
rewriteLight rewriteBalanced rewriteStrong roughEdges
modelProgress rewriteStatus
rewriteInput rewriteOutput rewriteBtn
copyRewriteBtn downloadRewriteBtn useInEditorBtn
rewriteFile rewriteFileBtn rewriteDrop rewriteFileChip
rewriteInputCount rewriteOutputCount rewriteInputExt rewriteOutputExt
addSampleBtn sampleTrainer writingSample writingSampleCount
sampleFile sampleFileBtn sampleFileChip testSampleBtn
sampleAnalysis sampleConfirm integrateSampleBtn rejectSampleBtn
samplePostIntegrate restartAgentBtn recalibrateAgentBtn
sampleProfileMeta importVoiceBtn exportVoiceBtn resetVoiceBtn profileFile
```

Disable runtime, model, input, profile, and sample controls while a generation or sample operation is active. Keep the preceding successful output if a later run fails. Enable copy/download/blog-editor actions only after a complete validated result exists.

## Local inference boundary

The browser talks directly to a loopback model server. The deployed Vercel application must never proxy, log, store, or inspect model prompts or results.

Accepted hosts are exactly:

```text
localhost
127.0.0.1
[::1]
```

Accept only HTTP or HTTPS URLs without embedded credentials, query strings, or fragments. Normalize `/`, `/api`, `/api/tags`, `/api/chat`, `/api/generate`, `/models`, and `/chat/completions` to an OpenAI-compatible `/v1` base.

Use:

- `GET {base}/models`, eight-second timeout
- `POST {base}/chat/completions`, three-minute timeout
- `credentials: "omit"`
- `redirect: "error"`
- JSON body containing `model`, `messages`, `temperature`, `top_p`, `max_tokens`, and `stream: false`

Reject an empty model list, an empty completion, HTTP failures, and `finish_reason: "length"` with actionable messages.

The previous default local endpoint was `http://127.0.0.1:11434/v1`. Prefer a 3B model only on hardware that has passed thermal diagnostics; otherwise default to the 1B model. Never infer GPU use merely because Ollama is reachable. Before a long job, confirm the loaded model reports nonzero GPU/VRAM use through Ollama's process API. Refuse a GPU-labelled run if the server has fallen back to CPU.

## Browser runtimes

The optional direct WebGPU implementation used WebLLM `0.2.85`:

```js
import { CreateWebWorkerMLCEngine } from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
```

Models were:

```text
Llama-3.2-3B-Instruct-q4f16_1-MLC
Llama-3.2-1B-Instruct-q4f16_1-MLC
```

Require both `navigator.gpu` and a successful `navigator.gpu.requestAdapter()`. Model loading times out after ten minutes. The worker imports `@mlc-ai/web-llm` and forwards messages through `webllm.WebWorkerMLCEngineHandler`.

The CPU worker used Transformers.js `3.8.1`:

```js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
```

Its model was `onnx-community/Qwen2.5-0.5B-Instruct`. Use one worker, correlate requests by numeric IDs, report progress messages, and enforce a ten-minute load timeout and three-minute generation timeout.

## Voice prompt

The fixed base voice profile was:

```text
Edit in Basanta's conversational blog voice: direct, opinionated, curious, informal.
Keep the argument and its qualifications. Use ordinary words, contractions, active voice,
and occasional brief parenthetical asides. Keep natural sentence flow and varied length.
Use rhetorical questions sparingly, only when they express an existing point.
Keep existing humor and emphasis; do not invent experiences, facts, analogies, or profanity.
Avoid em dashes, fake enthusiasm, corporate wording, forced three-part lists,
repetitive conclusions, unnecessary metaphors, and chains of choppy sentences.
Do not turn every subject into a story. Do not add technical examples.
```

The style example was:

```text
INPUT:
Artificial intelligence tools are changing how developers work. They can speed up repetitive tasks, help explain unfamiliar code, and make prototyping easier. However, relying on them too heavily can weaken problem-solving skills and introduce mistakes that are difficult to notice. Developers should treat AI as an assistant rather than a replacement for careful thinking.

TARGET VOICE:
AI(s) are changing programming and how programmers work. They can automate work, help explain weird or new concepts (especially in terms of code), and make the base structure, the prototype, easier. However, relying on them too much can weaken critical & creative thinking and introduce mistakes that are difficult to notice. AI is a tool. Use it wisely and it's good; use it poorly and it can hurt you. You wouldn't blame a calculator for ruining your mental arithmetic, would you? So why ask AI any and goddamn everything?
```

The system prompt must say that this is voice editing, not detector evasion. It must preserve facts, uncertainty, opinions, names, numbers, quotations, and technical meaning; preserve every protected lock token exactly once; output revised Markdown only; never imitate distinctive phrases from a public speaker; and never invent anecdotes, evidence, quotations, links, code, profanity, or details.

Strength rules:

- **Light:** keep structure and wording where possible; remove obvious machine-writing habits with the smallest useful edits.
- **Balanced:** sentence and paragraph rhythm may change, but argument, order, and detail must remain.
- **Strong:** sentence-level rewriting is allowed while all facts, qualifications, and Markdown structure remain.

When rough edges are enabled, preserve intentional quirks, fix only errors that obscure meaning, and never manufacture mistakes. When disabled, correct spelling, spacing, and grammar without sterilizing the informal voice.

Generation parameters were `temperature: 0.35`, `top_p: 0.9`, and `max_tokens: 1800`. The previous code also supplied `repetition_penalty: 1.08`, although the OpenAI-compatible adapter did not forward that field. Fix that mismatch during a rebuild or remove the unused option.

## Markdown safety and chunking

Before generation, replace these source spans with sequential tokens shaped like `<<<LOCK_0001>>>`:

- fenced code blocks using backticks or tildes
- inline code
- Markdown links and images
- angle-bracket HTTP(S) links
- bare HTTP(S) URLs

Split protected text at blank-line boundaries with a target maximum of 1,800 characters. If a single block is too large, split at the last space in the window when that space is beyond the halfway point; otherwise make a hard split.

After each completion:

1. Remove a single outer Markdown fence if the model added one.
2. Reject any code or link not represented by a source lock.
3. Require every expected lock exactly once.
4. If validation fails, retry once in Light mode at temperature zero with an explicit lock-correction instruction.
5. Publish the combined output only after every chunk validates.

This cannot establish factual equivalence. The UI must tell the author to review the result before publishing.

## File I/O

Accept only `.md` and `.txt`, maximum 1 MiB. Preserve the matching extension. Derive download names as follows:

```text
my-post.md    → my-post-rewrite.md
notes.txt     → notes-rewrite.txt
weird.name.md → weird.name-rewrite.md
no input name → rewrite.md
```

Use `FileReader.readAsText` for input and an object URL plus a temporary anchor for downloads. Revoke the object URL after one second. Drag/drop and file-picker paths must use the same validator.

## Sample analysis and profile merging

Samples must be 120–8,000 characters. Scan them before inference for attempts to:

- override prior rules
- assign a new persona
- claim system/developer/admin authority
- force or forbid output
- hide an instruction trigger
- extract the system prompt
- spoof system/user/developer message boundaries
- pressure the model about an earlier refusal

Treat a sample as quoted data. The analysis request must study presentation only: rhythm, sentence construction, point of view, transitions, punctuation, humor, directness, qualifications, and argument structure. It must separate voice from ordinary mistakes and return 6–10 short bullet rules with no heading, quotations, summary, or commentary. Use `temperature: 0.25`, `top_p: 0.85`, and `max_tokens: 500`.

After explicit approval, merge the existing profile and new analysis into at most eight short presentation-only bullet rules under 180 words. Explicitly forbid topic facts, examples, em dashes, corporate wording, fake enthusiasm, forced lists, repetitive conclusions, metaphors, and choppy sentences. Use `temperature: 0.2`, `top_p: 0.8`, and `max_tokens: 550`.

## Persistent profile format

The profile path was:

```text
~/.local/share/portfolio-rewrite/rewrite-voice-profile.md
```

The exact format was:

```markdown
<!-- portfolio-rewrite-profile:v1 -->
# Rewrite voice profile

Approved samples: 2
Updated: 2026-09-20T00:00:00.000Z

## Presentation instructions

- First short presentation rule.
- Second short presentation rule.
```

On import, require the marker, count, parseable ISO date, and presentation heading. Permit no more than 12 nonempty rules, 4,000 profile characters, or 10,000 recorded samples. Every nonempty instruction line must be a bullet. Reject code fences, lock tokens, and URLs. Normalize `-`, `*`, `•`, and numbered source bullets to `-` when serializing.

Browser `localStorage` key `basanta-rewrite-voice-profile-v1` existed only as an offline pending-write fallback. The file service was authoritative. When service connectivity returned, migrate the pending value to the file and remove the browser copy.

## Profile helper protocol

Bind a Node HTTP server to `127.0.0.1:11435`. The only route is `/profile`:

| Method | Result |
| --- | --- |
| `GET` | `200 text/markdown` with the profile, or `204` when absent |
| `PUT` | Validate the marker/heading, atomically write, return `204` |
| `DELETE` | Remove the file if present, return `204` |
| `OPTIONS` | Return `204` for CORS/PNA preflight |

Reject request bodies over 64 KiB. Create the parent directory as `0700`, write a `.tmp` file as `0600`, then rename atomically. Set `Cache-Control: no-store` and `Access-Control-Allow-Private-Network: true`.

Allow only these origins plus explicitly configured local development origins:

```text
https://basanta.space
https://www.basanta.space
http(s)://localhost[:port]
http(s)://127.0.0.1[:port]
http(s)://[::1][:port]
```

The browser client uses a five-second timeout and never sends credentials.

## Local services

The profile helper is a per-user systemd service with `Restart=on-failure`, `RestartSec=3`, and `WantedBy=default.target`. Its `ExecStart` must use the actual Node path and repository path on the target machine; do not hardcode another user's home directory.

Ollama must bind to `127.0.0.1:11434`, never `0.0.0.0`. Set exact CORS origins for the production Admin page and local development. Use one parallel request and one loaded model at most.

For Vulkan, enable `OLLAMA_VULKAN=1`. Do **not** blindly restore `GGML_VK_VISIBLE_DEVICES=1`; enumerate Vulkan devices on every boot/configuration and select the discrete GPU only after confirming its index. The index changed or disappeared after the thermal shutdown in the original environment, causing Ollama to report CPU-only inference. A rebuilt service must fail closed instead of silently using CPU when GPU mode was requested.

Recommended safety requirements for a rebuild:

- refuse long inference if GPU telemetry is unavailable
- show the actual loaded processor (`GPU`, mixed, or `CPU`) in the UI
- never call a CPU fallback “GPU”
- cap concurrency at one
- add a user-cancellable queue
- add a cooling pause between chunks on laptops
- default to the 1B model until thermal diagnostics pass
- stop work and surface an error when temperature telemetry crosses a conservative configured limit
- never run the live suite unattended

## Test plan

### Unit tests

`rewrite-local.test.js` must cover URL normalization, rejection of non-loopback hosts and credentials, model-list deduplication, timeouts, empty models, HTTP failures, and completion shape validation.

`rewrite-prompt.test.js` must cover:

- exact runtime model constants
- all three strength rules
- base voice prohibitions
- lock/restore behavior for every protected Markdown type
- invented code/link rejection
- missing/duplicate lock rejection
- fence stripping
- chunk size and order
- `.md`/`.txt` validation and derived names
- all injection categories plus benign prose false positives
- profile round-trip, bullet normalization, and every import limit

`rewrite-ui.test.js` must build a small DOM stub, mock both local endpoints, connect a model, complete an edit, integrate at least two samples without restarting, verify file-backed profile updates, and prove unavailable browser WebGPU does not silently select CPU.

### Browser tests

Serve a local authenticated Admin fixture. Mock only the portfolio session/blog/project APIs; do not mock inference in a live run. Verify:

- model connection and selection
- `.md` file import
- real completion and nonempty output
- download filename
- Add Sample → Test → Integrate → Ready
- profile persistence across reload
- no desktop or mobile horizontal overflow
- no page errors

Visual-only mode may capture `/tmp/rewrite-desktop.png` and `/tmp/rewrite-mobile.png`. A separate explicit opt-in may test the CPU worker download. Never make live GPU inference part of the default test command.

## Restoration order

1. Pass hardware fan/thermal diagnostics.
2. Implement and test the pure prompt/Markdown/profile helpers.
3. Implement the loopback-only model adapter.
4. Implement the file-backed profile helper and unit tests.
5. Add the Admin panel and local runtime only.
6. Verify CPU/GPU identity is displayed and GPU mode fails closed.
7. Add sample integration.
8. Add optional browser WebGPU and CPU workers last.
9. Run unit tests.
10. Run a short, attended 1B smoke test while watching temperatures.
11. Only then consider an attended 3B test.

## Acceptance criteria

The feature is rebuilt only when all of these are true:

- no draft, sample, profile, or inference request touches the hosted backend
- only loopback model/profile endpoints are accepted
- actual compute placement is visible and truthful
- GPU selection never silently becomes CPU
- failures preserve prior output and user input
- protected Markdown survives exactly
- samples require review and approval
- the profile persists as a local Markdown file
- Blog and Projects continue working without the feature module
- desktop and mobile layouts have no overflow
- unit tests pass without model downloads
- live inference is opt-in, attended, cancellable, and thermally monitored
