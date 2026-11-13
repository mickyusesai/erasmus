#!/usr/bin/env node
/**
 * Renders a promo version (a folder with index.html) frame by frame.
 *
 *   node render.mjs still a-paper-bird 2.5,7,12        PNG stills at these seconds
 *   node render.mjs sheet a-paper-bird --count 24      contact sheet with time stamps
 *   node render.mjs video a-paper-bird --audio x.wav   MP4 (1920x1080, H.264)
 *
 * Options: --from s --to s --fps 30 --workers 4 --scale 1 (2 = draw at 4K, sharper edges, about
 * 7x slower) --size 1920x1080 --sub 1 (sub-frames blended per frame) --cols 4 --out file --crf 16 --hud
 *
 * Needs: Chromium via Playwright, ffmpeg, and for sheets ImageMagick (montage).
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORK = process.env.PROMO_WORK || path.join(ROOT, '.work');
const OUT = process.env.PROMO_OUT || path.join(ROOT, 'out');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) throw new Error('outside root');
      const data = await fsp.readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true;
      else opt[a.slice(2)] = argv[++i];
    } else pos.push(a);
  }
  return { pos, opt };
}

function run(cmd, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: quiet ? ['ignore', 'ignore', 'pipe'] : 'inherit' });
    let err = '';
    p.stderr?.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}\n${err.slice(-2000)}`))));
  });
}

async function openPage(browser, url, scale = 1) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  const info = await page.evaluate(() => ({ duration: window.__promo.duration, fps: window.__promo.fps, timeline: window.__promo.timelineDuration }));
  return { page, cdp, info, scale };
}

async function shoot({ page, cdp, scale }, t, file, format = 'png') {
  await page.evaluate((time) => window.__promo.seek(time), t);
  const params = format === 'png' ? { format: 'png', optimizeForSpeed: true } : { format: 'jpeg', quality: 93, optimizeForSpeed: true };
  // scale 2 draws the frame at 3840x2160 (the video is scaled back to 1080p unless --size says otherwise)
  params.clip = { x: 0, y: 0, width: 1920, height: 1080, scale };
  const { data } = await cdp.send('Page.captureScreenshot', params);
  await fsp.writeFile(file, Buffer.from(data, 'base64'));
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const [command, version, timesArg] = pos;
  if (!command || !version) {
    console.log('usage: node render.mjs still|sheet|video <version-folder> [times] [options]');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, version, 'index.html'))) throw new Error(`No ${version}/index.html`);
  await fsp.mkdir(WORK, { recursive: true });
  await fsp.mkdir(OUT, { recursive: true });

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/${version}/`;
  const launch = () => chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });

  try {
    if (command === 'still') {
      const scale = Number(opt.scale || 1);
      const browser = await launch();
      const view = await openPage(browser, base + (opt.hud ? '?hud=1' : ''), scale);
      const times = String(timesArg ?? '0').split(',').map(Number);
      for (const t of times) {
        const file = opt.out && times.length === 1 ? path.resolve(opt.out) : path.join(OUT, `${version}-still-${t.toFixed(2).padStart(6, '0')}.png`);
        await shoot(view, t, file);
        console.log(file);
      }
      await browser.close();
    } else if (command === 'sheet') {
      const browser = await launch();
      const view = await openPage(browser, base + '?hud=1', Number(opt.scale || 0.5));
      const from = Number(opt.from ?? 0);
      const to = Number(opt.to ?? view.info.duration);
      const count = Number(opt.count || 24);
      const times = timesArg ? timesArg.split(',').map(Number) : Array.from({ length: count }, (_, i) => from + ((to - from) * (i + 0.5)) / count);
      const dir = path.join(WORK, `${version}-sheet`);
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.mkdir(dir, { recursive: true });
      const files = [];
      for (const [i, t] of times.entries()) {
        const file = path.join(dir, `${String(i).padStart(3, '0')}.jpg`);
        await shoot(view, t, file, 'jpeg');
        files.push(file);
      }
      await browser.close();
      const out = opt.out ? path.resolve(opt.out) : path.join(OUT, `${version}-sheet.jpg`);
      const cols = Number(opt.cols || 4);
      await run('montage', [...files, '-tile', `${cols}x`, '-geometry', `${opt.tile || 640}x+6+6`, '-background', '#111', '-quality', '88', out]);
      console.log(out, `(${times.length} frames, duration ${view.info.duration}s, timeline ${view.info.timeline.toFixed(2)}s)`);
    } else if (command === 'video') {
      const fps = Number(opt.fps || 30);
      const sub = Number(opt.sub || 1);
      const workers = Number(opt.workers || 4);
      const scale = Number(opt.scale || 1);
      const format = opt.jpeg ? 'jpeg' : 'png';
      const ext = format === 'png' ? 'png' : 'jpg';
      const probeBrowser = await launch();
      const probe = await openPage(probeBrowser, base, scale);
      const from = Number(opt.from ?? 0);
      const to = Number(opt.to ?? probe.info.duration);
      await probeBrowser.close();

      const rate = fps * sub;
      const total = Math.round((to - from) * rate);
      const dir = path.join(WORK, `${version}-frames`);
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.mkdir(dir, { recursive: true });
      console.log(`${version}: ${total} frames (${from}s → ${to}s at ${rate} fps, ${workers} workers)`);

      const started = Date.now();
      let done = 0;
      const chunk = Math.ceil(total / workers);
      await Promise.all(
        Array.from({ length: workers }, async (_, w) => {
          const first = w * chunk;
          const last = Math.min(total, first + chunk);
          if (first >= last) return;
          const browser = await launch();
          const view = await openPage(browser, base, scale);
          for (let f = first; f < last; f++) {
            // Sub-frames are centred on the frame time, like an open shutter
            const t = from + (sub > 1 ? (f + 0.5) / rate - 0.5 / fps + 0.5 / rate : f / rate);
            await shoot(view, Math.max(0, t), path.join(dir, `${String(f).padStart(6, '0')}.${ext}`), format);
            done++;
            if (done % 150 === 0) console.log(`  ${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
          }
          await browser.close();
        })
      );
      console.log(`  frames done in ${((Date.now() - started) / 1000).toFixed(0)}s, encoding…`);

      const out = opt.out ? path.resolve(opt.out) : path.join(OUT, `${version}.mp4`);
      const filters = [];
      if (sub > 1) filters.push(`tmix=frames=${sub}`, `framestep=${sub}`, `setpts=N/(${fps}*TB)`);
      // Frames drawn at 2x (or more) are scaled down to 1080p: smoother edges and sub-pixel motion
      const frameSize = opt.size ? String(opt.size).replace('x', ':') : '1920:1080';
      filters.push(`scale=${frameSize}:flags=lanczos:out_color_matrix=bt709:out_range=tv`, 'format=yuv420p');
      const args = ['-y', '-framerate', String(rate), '-start_number', '0', '-i', path.join(dir, `%06d.${ext}`)];
      if (opt.audio) args.push('-i', path.resolve(opt.audio));
      args.push('-vf', filters.join(','), '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt.crf || 16),
        '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart');
      if (opt.audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
      args.push(out);
      await run('ffmpeg', args);
      if (!opt.keep) await fsp.rm(dir, { recursive: true, force: true });
      const size = (await fsp.stat(out)).size / 1e6;
      console.log(`${out} (${size.toFixed(1)} MB, total ${((Date.now() - started) / 1000).toFixed(0)}s)`);
    } else {
      throw new Error(`Unknown command ${command}`);
    }
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
