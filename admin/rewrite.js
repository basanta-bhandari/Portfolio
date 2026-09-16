import { CreateWebWorkerMLCEngine } from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
import {
  DEFAULT_MODEL,
  VOICE_PROFILE,
  buildMessages,
  protectMarkdown,
  restoreMarkdown,
  splitMarkdown,
  stripResponseWrapper,
} from './humanizer-prompt.js';

const input = document.getElementById('humanizerInput');
const output = document.getElementById('humanizerOutput');
const runButton = document.getElementById('humanizeBtn');
const copyButton = document.getElementById('copyHumanizedBtn');
const editorButton = document.getElementById('useInEditorBtn');
const status = document.getElementById('humanizerStatus');
const progress = document.getElementById('modelProgress');
const modelSelect = document.getElementById('humanizerModel');
const roughEdges = document.getElementById('roughEdges');
const sampleTrainer = document.getElementById('sampleTrainer');
const writingSample = document.getElementById('writingSample');
const sampleAnalysis = document.getElementById('sampleAnalysis');
const sampleConfirm = document.getElementById('sampleConfirm');
const testSampleButton = document.getElementById('testSampleBtn');
const integrateSampleButton = document.getElementById('integrateSampleBtn');
const profileMeta = document.getElementById('sampleProfileMeta');
const resetVoiceButton = document.getElementById('resetVoiceBtn');
const runtimeDot = document.getElementById('runtimeDot');
const runtimeReadiness = document.getElementById('runtimeReadiness');
const runtimeDetail = document.getElementById('runtimeDetail');

const PROFILE_STORAGE_KEY = 'basanta-humanizer-voice-profile-v1';

let engine = null;
let loadedModel = null;
let running = false;
let sampleRunning = false;
let pendingSampleAnalysis = '';
let learnedProfile = readLearnedProfile();

function readLearnedProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || 'null');
    if (!value || typeof value.profile !== 'string') return { profile: '', sampleCount: 0 };
    return { profile: value.profile, sampleCount: Number(value.sampleCount || 0) };
  } catch {
    return { profile: '', sampleCount: 0 };
  }
}

function saveLearnedProfile(profile) {
  learnedProfile = {
    profile: profile.trim(),
    sampleCount: learnedProfile.sampleCount + 1,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(learnedProfile));
  updateProfileMeta();
}

function updateProfileMeta() {
  const count = learnedProfile.sampleCount;
  profileMeta.textContent = count ? `${count} approved sample${count === 1 ? '' : 's'} in local voice profile` : 'Base voice profile';
  resetVoiceButton.hidden = count === 0;
}

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function updateCounts() {
  document.getElementById('humanizerInputCount').textContent = `${input.value.length.toLocaleString()} chars`;
  document.getElementById('humanizerOutputCount').textContent = `${output.value.length.toLocaleString()} chars`;
}

function updateSampleCount() {
  document.getElementById('writingSampleCount').textContent = `${writingSample.value.length.toLocaleString()} / 8,000 chars`;
}

function setSampleStep(activeStep, completedThrough = 0) {
  const steps = [
    document.getElementById('sampleStepAdd'),
    document.getElementById('sampleStepTest'),
    document.getElementById('sampleStepIntegrate'),
    document.getElementById('sampleStepReady'),
  ];
  steps.forEach((step, index) => {
    step.dataset.state = index + 1 === activeStep ? 'active' : index + 1 <= completedThrough ? 'done' : '';
  });
}

function resetSampleTrainer() {
  writingSample.value = '';
  writingSample.disabled = false;
  pendingSampleAnalysis = '';
  sampleAnalysis.textContent = '';
  sampleAnalysis.hidden = true;
  sampleConfirm.hidden = true;
  testSampleButton.hidden = false;
  testSampleButton.disabled = false;
  testSampleButton.textContent = 'Test sample';
  integrateSampleButton.disabled = false;
  document.getElementById('rejectSampleBtn').disabled = false;
  document.getElementById('sampleStepIntegrate').textContent = '3. Integrate?';
  setSampleStep(1);
  updateSampleCount();
}

async function checkLocalRuntime() {
  if (!('gpu' in navigator)) {
    runtimeDot.dataset.state = 'error';
    runtimeReadiness.textContent = 'Local AI is unavailable here';
    runtimeDetail.textContent = 'Open this page in a current Chrome or Edge browser with hardware acceleration enabled.';
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No graphics adapter');
    runtimeDot.dataset.state = 'ready';
    runtimeReadiness.textContent = 'This browser can run the writing brain';
    runtimeDetail.textContent = 'Start a rewrite or test a sample to load it. The 3B model uses about 2.3 GB of graphics memory; switch to 1B if it does not fit.';
  } catch {
    runtimeDot.dataset.state = 'error';
    runtimeReadiness.textContent = 'No usable graphics device found';
    runtimeDetail.textContent = 'Try enabling browser hardware acceleration, or open the page in a current Chrome or Edge browser.';
  }
}

function selectedLevel() {
  return document.querySelector('input[name="rewriteLevel"]:checked')?.value || 'balanced';
}

async function getEngine() {
  if (!('gpu' in navigator)) {
    throw new Error('This browser does not expose WebGPU. Use a current Chrome, Edge, or another WebGPU-enabled browser.');
  }

  const requestedModel = modelSelect.value || DEFAULT_MODEL;
  if (engine && loadedModel === requestedModel) return engine;

  setStatus('Loading the local model. The first download is large; later loads use the browser cache.');
  runtimeReadiness.textContent = 'Loading the writing brain...';
  progress.hidden = false;
  progress.value = 0;

  const worker = new Worker(new URL('./humanizer-worker.js', import.meta.url), { type: 'module' });
  engine = await CreateWebWorkerMLCEngine(worker, requestedModel, {
    initProgressCallback: (report) => {
      const amount = Number(report.progress || 0);
      progress.value = Math.max(0, Math.min(1, amount));
      setStatus(report.text || `Loading model: ${Math.round(amount * 100)}%`);
    },
  });
  loadedModel = requestedModel;
  progress.value = 1;
  runtimeDot.dataset.state = 'ready';
  runtimeReadiness.textContent = 'Writing brain ready on this device';
  runtimeDetail.textContent = 'The model is cached in this browser. Drafts and samples are processed here.';
  setStatus('Model ready. Everything runs in this browser.', 'success');
  return engine;
}

async function rewriteChunk(localEngine, chunk, index, total) {
  setStatus(total > 1 ? `Rewriting section ${index + 1} of ${total}...` : 'Rewriting...');
  const response = await localEngine.chat.completions.create({
    messages: buildMessages(chunk, {
      level: selectedLevel(),
      roughEdges: roughEdges.checked,
      learnedProfile: learnedProfile.profile,
      part: index + 1,
      totalParts: total,
    }),
    temperature: 0.72,
    top_p: 0.9,
    repetition_penalty: 1.08,
    max_tokens: 1800,
  });
  return stripResponseWrapper(response.choices[0]?.message?.content || '');
}

async function testWritingSample() {
  const sample = writingSample.value.trim();
  if (sample.length < 120) {
    setStatus('The sample is too short to learn a reliable voice. Give it at least a paragraph.', 'error');
    writingSample.focus();
    return;
  }
  if (sampleRunning || running) return;

  sampleRunning = true;
  writingSample.disabled = true;
  testSampleButton.disabled = true;
  testSampleButton.textContent = 'Testing...';
  setSampleStep(2, 1);

  try {
    const localEngine = await getEngine();
    setStatus('Testing the sample for reusable presentation traits...');
    const response = await localEngine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Analyze a writing sample for a private style editor. Study presentation only, never summarize the subject matter. Identify reusable traits in rhythm, sentence construction, point of view, transitions, punctuation, humor, directness, qualifications, and argument structure. Separate intentional voice from ordinary mistakes. Return 6 to 10 short bullet rules, no heading, no quotations from the sample, and no commentary.`,
        },
        { role: 'user', content: sample },
      ],
      temperature: 0.25,
      top_p: 0.85,
      max_tokens: 500,
    });

    pendingSampleAnalysis = stripResponseWrapper(response.choices[0]?.message?.content || '');
    if (!pendingSampleAnalysis) throw new Error('The local model did not return a style analysis.');
    sampleAnalysis.textContent = pendingSampleAnalysis;
    sampleAnalysis.hidden = false;
    sampleConfirm.hidden = false;
    testSampleButton.hidden = true;
    setSampleStep(3, 2);
    setStatus('Sample tested. Review the traits, then choose whether to integrate them.', 'success');
  } catch (error) {
    console.error(error);
    writingSample.disabled = false;
    testSampleButton.disabled = false;
    testSampleButton.textContent = 'Test sample';
    setSampleStep(1);
    setStatus(error?.message || 'The sample could not be tested.', 'error');
  } finally {
    sampleRunning = false;
  }
}

async function integrateWritingSample() {
  if (!pendingSampleAnalysis || sampleRunning || running) return;
  sampleRunning = true;
  integrateSampleButton.disabled = true;
  document.getElementById('rejectSampleBtn').disabled = true;
  setSampleStep(3, 2);
  document.getElementById('sampleStepIntegrate').textContent = '3. Reworking...';
  setStatus('Reworking the local voice profile with the approved sample...');

  try {
    const localEngine = await getEngine();
    const existing = learnedProfile.profile || 'No previously learned sample traits.';
    const response = await localEngine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Maintain a compact voice profile for a private style editor. Merge the existing learned traits with the newly approved analysis. Resolve contradictions in favor of the new analysis, avoid duplicating the permanent baseline, and distinguish intentional style from typos. Return 8 to 14 imperative bullet rules, under 260 words, with no heading or commentary.\n\nPermanent baseline:\n${VOICE_PROFILE}`,
        },
        {
          role: 'user',
          content: `EXISTING LEARNED PROFILE:\n${existing}\n\nNEW APPROVED SAMPLE ANALYSIS:\n${pendingSampleAnalysis}`,
        },
      ],
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 550,
    });
    const mergedProfile = stripResponseWrapper(response.choices[0]?.message?.content || '');
    if (!mergedProfile) throw new Error('The local model could not rebuild the voice profile.');
    saveLearnedProfile(mergedProfile);

    sampleConfirm.hidden = true;
    sampleAnalysis.textContent = mergedProfile;
    document.getElementById('sampleStepIntegrate').textContent = '3. Integrated';
    setSampleStep(4, 3);
    setStatus('Ready! The approved sample now influences future rewrites.', 'success');
  } catch (error) {
    console.error(error);
    integrateSampleButton.disabled = false;
    document.getElementById('rejectSampleBtn').disabled = false;
    document.getElementById('sampleStepIntegrate').textContent = '3. Integrate?';
    setSampleStep(3, 2);
    setStatus(error?.message || 'The voice profile could not be rebuilt.', 'error');
  } finally {
    sampleRunning = false;
  }
}

async function humanize() {
  const markdown = input.value.trim();
  if (!markdown) {
    setStatus('Paste some Markdown first.', 'error');
    input.focus();
    return;
  }
  if (running) return;

  running = true;
  runButton.disabled = true;
  copyButton.disabled = true;
  editorButton.disabled = true;
  output.value = '';
  updateCounts();

  try {
    const localEngine = await getEngine();
    const protectedMarkdown = protectMarkdown(markdown);
    const chunks = splitMarkdown(protectedMarkdown.text);
    const rewritten = [];

    for (let index = 0; index < chunks.length; index += 1) {
      rewritten.push(await rewriteChunk(localEngine, chunks[index], index, chunks.length));
      output.value = rewritten.join('\n\n');
      updateCounts();
    }

    output.value = restoreMarkdown(rewritten.join('\n\n'), protectedMarkdown.values);
    updateCounts();
    copyButton.disabled = false;
    editorButton.disabled = false;
    setStatus('Done. Read it before publishing; the tool edits voice, not truth.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error?.message || 'The local model could not finish the rewrite.', 'error');
  } finally {
    running = false;
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', humanize);
input.addEventListener('input', updateCounts);
output.addEventListener('input', updateCounts);

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    setStatus('Copied the Markdown.', 'success');
  } catch {
    output.select();
    document.execCommand('copy');
    setStatus('Copied the Markdown.', 'success');
  }
});

editorButton.addEventListener('click', () => {
  document.getElementById('content').value = output.value;
  document.getElementById('blogTab').click();
  document.getElementById('content').scrollIntoView({ behavior: 'smooth', block: 'center' });
  setStatus('Moved the result into the blog editor.', 'success');
});

modelSelect.value = DEFAULT_MODEL;
document.getElementById('addSampleBtn').addEventListener('click', () => {
  resetSampleTrainer();
  sampleTrainer.hidden = false;
  sampleTrainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  writingSample.focus();
});
document.getElementById('closeSampleTrainer').addEventListener('click', () => {
  if (sampleRunning) return;
  sampleTrainer.hidden = true;
});
writingSample.addEventListener('input', updateSampleCount);
testSampleButton.addEventListener('click', testWritingSample);
integrateSampleButton.addEventListener('click', integrateWritingSample);
document.getElementById('rejectSampleBtn').addEventListener('click', () => {
  if (sampleRunning) return;
  resetSampleTrainer();
  sampleTrainer.hidden = true;
  setStatus('Sample discarded. The voice profile was not changed.');
});
resetVoiceButton.addEventListener('click', () => {
  if (!confirm('Remove all learned sample traits from this browser?')) return;
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  learnedProfile = { profile: '', sampleCount: 0 };
  updateProfileMeta();
  setStatus('Learned samples removed. The base voice profile is still active.', 'success');
});
updateProfileMeta();
updateSampleCount();
updateCounts();
checkLocalRuntime();
