// Split a session .mkv into per-hole clips using ffmpeg based on a shot timeline.
// Uses ffmpeg-static (bundled binary). Each hole gets a stream-copy cut (no re-encode).

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let ffmpegPath;
try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = 'ffmpeg'; }

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`)));
    p.on('error', reject);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.inputMkv  - full path to the session recording
 * @param {string} opts.outDir    - directory for per-hole clips
 * @param {number} opts.sessionStartMs  - epoch ms when OBS StartRecord returned
 * @param {Array<{hole_number:number, start_ms:number, end_ms:number}>} opts.holes
 * @returns {Promise<Array<{hole_number:number, filepath:string, clip_start_seconds:number, clip_end_seconds:number}>>}
 */
async function splitByHoles({ inputMkv, outDir, sessionStartMs, holes }) {
  if (!fs.existsSync(inputMkv)) throw new Error(`recording not found: ${inputMkv}`);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const h of holes) {
    const startSec = Math.max(0, (h.start_ms - sessionStartMs) / 1000);
    const endSec = Math.max(startSec + 1, (h.end_ms - sessionStartMs) / 1000);
    const dur = endSec - startSec;
    const outPath = path.join(outDir, `hole-${String(h.hole_number).padStart(2, '0')}.mkv`);
    // Stream-copy cut (fast, no re-encode). GOP boundaries may skew by a few frames — acceptable.
    await runFfmpeg(['-y', '-ss', startSec.toFixed(2), '-i', inputMkv, '-t', dur.toFixed(2), '-c', 'copy', outPath]);
    results.push({ hole_number: h.hole_number, filepath: outPath, clip_start_seconds: startSec, clip_end_seconds: endSec });
  }
  return results;
}

module.exports = { splitByHoles };
