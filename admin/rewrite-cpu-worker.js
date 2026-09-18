import { pipeline, env } from 'https://esm.run/@huggingface/transformers@3.4.2';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250306-ccf8fdd9ea/dist/';
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
        dtype: 'q4f16',
        device: 'wasm',
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
      const text = output?.[0]?.generated_text || '';
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