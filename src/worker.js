// Thread de rendu : compose + synthétise en flux (RAM bornée) -> WAV sur disque, MP3 via ffmpeg, MIDI + ZIP par instrument.
import { parentPort, workerData } from 'node:worker_threads';
import { renderTrack } from './engine/render.js';
import { stemFilter } from './stems.js';

const { params, wavPath, mp3Path, midPath, midZipPath, bitrate, ffmpeg, title, zipBase, tags, loudness, stem, fixedGain } = workerData;
try {
  let last = 0;
  const r = await renderTrack(params, {
    wavPath, mp3Path, midPath, midZipPath, bitrate, ffmpeg, title, zipBase,
    tags, loudness, ...(stem ? { stem: stemFilter(stem), fixedGain } : {}),
    onProgress: (p, stage, info = {}) => {
      const now = Date.now();
      if (now - last > 400 || p >= 0.98) { last = now; parentPort.postMessage({ type: 'progress', progress: p, stage, eta: info.eta ?? null, speed: info.speed ?? null }); }
    },
  });
  parentPort.postMessage({
    type: 'done',
    result: {
      params: r.params,
      meta: { ...r.meta, loudness: r.loudness, rms: r.rms, peak: r.peak, busLevels: r.busLevels, midiTracks: r.midiTracks || [] },
      seconds: r.seconds, renderMs: r.renderMs, waveform: r.peaks,
    },
  });
} catch (e) {
  parentPort.postMessage({ type: 'error', error: e.stack || String(e) });
}
