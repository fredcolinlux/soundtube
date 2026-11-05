// soundtube v1.16.0 — thread de rendu audio de l'agent : exécute le moteur (core/engine ou ../src/engine) avec les
// paramètres sérialisés reçus du CT. Même appel que src/worker.js du CT, sans MP3 (le CT encode le MP3 à partir du WAV
// reçu, avec son propre ffmpeg : MP3 identique au bit près à un rendu fait sur le CT).
import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { root, params, wavPath, midPath, midZipPath, title, zipBase, tags, loudness } = workerData;
try {
  const { renderTrack } = await import(pathToFileURL(path.join(root, 'engine', 'render.js')).href);
  let last = 0;
  const r = await renderTrack(params, {
    wavPath, mp3Path: null, midPath, midZipPath, title, zipBase, tags, loudness,
    onProgress: (p, stage, info = {}) => {
      const now = Date.now();
      if (now - last > 400 || p >= 0.98) { last = now; parentPort.postMessage({ type: 'progress', progress: p, stage, eta: info.eta ?? null }); }
    },
  });
  parentPort.postMessage({ type: 'done', result: {
    params: r.params,
    meta: { ...r.meta, loudness: r.loudness, rms: r.rms, peak: r.peak, busLevels: r.busLevels, midiTracks: r.midiTracks || [] },
    seconds: r.seconds, renderMs: r.renderMs, waveform: r.peaks,
  } });
} catch (e) { parentPort.postMessage({ type: 'error', error: e.stack || String(e) }); }
