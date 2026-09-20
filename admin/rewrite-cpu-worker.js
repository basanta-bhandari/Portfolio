import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated ? 4 : 1;

let generator = null;

self.onmessage = async (event) => {
  const { id, type } = event.data || {};
  if (!id) return;
  try {
    if (type === 'load') {
      const modelId = event.data.model;
      self.postMessage({ id, type: 'progress', text: `Downloading ${modelId}... (first load only)`, progress: 0 });
      generator = await pipeline('text-generation', modelId, {
        dtype: 'q4',
        device: 'wasm',
        progress_callback: (report) => {
          self.postMessage({ type: 'progress', text: report.status === 'progress'
            ? `Downloading ${report.file}: ${Math.round(report.progress || 0)}%`
            : `Loading ${report.file || modelId}...` });
        },
      });
      self.postMessage({ id, ok: true, type: 'loaded' });
    } else if (type === 'generate') {
      if (!generator) throw new Error('The CPU model is not loaded yet.');
      const { messages, options } = event.data;
      const output = await generator(messages, {
        max_new_tokens: options.max_tokens ?? 1024,
        do_sample: true,
        temperature: options.temperature ?? 0.72,
        top_p: options.top_p ?? 0.9,
        repetition_penalty: options.repetition_penalty ?? 1.08,
        return_full_text: false,
      });
      const generated = output?.[0]?.generated_text;
      const text = typeof generated === 'string' ? generated : generated?.at(-1)?.content || '';
      if (!text) throw new Error('The CPU model returned no text.');
      self.postMessage({ id, ok: true, type: 'result', text });
    } else if (type === 'unload') {
      generator = null;
      self.postMessage({ id, ok: true, type: 'unloaded' });
    }
  } catch (error) {
    self.postMessage({ id, ok: false, type: 'error', error: String(error?.message || error) });
  }
};
