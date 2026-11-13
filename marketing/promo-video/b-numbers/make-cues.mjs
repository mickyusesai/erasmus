#!/usr/bin/env node
/**
 * Writes cues.json for the soundtrack of version B from the same beat grid as scene.js.
 * Run: node b-numbers/make-cues.mjs
 *
 * Types: cut, hit, whoosh, pop, tick, rise, drop, success, logo.
 * "to" marks the end of a sound that lasts (a rise, a roll of ticks, a long whoosh);
 * "count" is the number of evenly spaced ticks between t and to; "level" is 0–1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BPM = 124;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 14;
const at = (bar, beat = 0) => (bar - 1) * BAR + beat * BEAT;
const r3 = (v) => Math.round(v * 1000) / 1000;

const cues = [];
const cue = (t, type, note, extra = {}) => {
  const c = { t: r3(t), type, note };
  for (const [k, v] of Object.entries(extra)) c[k] = typeof v === 'number' && k !== 'count' ? r3(v) : v;
  cues.push(c);
};

// Bar 1: 42 participants
cue(at(1), 'hit', '"42" slams in (first frame of the film)', { level: 1 });
cue(0.05, 'tick', '42 avatars pop in one by one while the number counts up', { to: 0.87, count: 42, level: 0.35 });
cue(at(1, 1) - 0.06, 'pop', 'word "participants" rises', { level: 0.5 });
cue(at(1, 2), 'hit', 'count lands on 42: outline echo, wave through the crowd', { level: 0.6 });
cue(at(1, 3), 'pop', 'second wave through the crowd', { level: 0.35 });
cue(at(2) - 0.11, 'whoosh', 'bar 1 darts out to the left', { to: at(2), level: 0.5 });

// Bar 2: 317 tickets
cue(at(2), 'cut', 'bar 2');
cue(at(2), 'hit', '"317" slams in from the right', { level: 1 });
cue(at(2) + 0.32, 'tick', '14 tickets fall onto a pile, one every 0.1s (paper slaps)', { to: at(2) + 1.62, count: 14, level: 0.5 });
cue(at(2, 1) - 0.06, 'pop', 'word "tickets" rises', { level: 0.5 });
cue(at(2, 3), 'hit', 'count lands on 317: outline echo', { level: 0.6 });
cue(at(3) - 0.2, 'whoosh', 'pile is swept off to the left', { to: at(3), level: 0.6 });

// Bar 3: 6 currencies
cue(at(3), 'cut', 'bar 3');
cue(at(3), 'hit', 'number slams in showing "1", first currency tile lights', { level: 0.9 });
for (let k = 1; k < 6; k++) cue(at(3) + (k * BEAT) / 2, 'pop', `currency tile ${k + 1} lights, number counts to ${k + 1} (rising pitch works well)`, { level: 0.5 + k * 0.06 });
cue(at(3, 3), 'hit', 'all six tiles flash together, "6" echoes', { level: 0.8 });
cue(at(4) - 0.14, 'whoosh', 'bar 3 splits up and down', { to: at(4), level: 0.5 });

// Bar 4: 1 deadline
cue(at(4), 'cut', 'bar 4: the room goes dark and red');
cue(at(4), 'hit', '"1" slams in inside a countdown ring', { level: 0.9 });
cue(at(4), 'rise', 'tension: the ring runs out, a spreadsheet creeps in, slow zoom', { to: at(5) - 0.066, level: 1 });
for (const [b, level] of [[1, 0.4], [2, 0.5], [2.5, 0.5], [3, 0.65], [3.25, 0.6], [3.5, 0.8], [3.75, 0.9]]) cue(at(4, b), 'hit', 'heartbeat thump, faster and harder', { level });
cue(at(4) + 0.15, 'tick', 'days-left counter runs down from 30 to 1, speeding up', { to: at(5) - 0.15, count: 29, level: 0.25 });
cue(at(5) - 0.066, 'cut', 'two frames of black: silence before the drop');

// Bar 5: 0 spreadsheets (the drop)
cue(at(5), 'drop', 'THE DROP: white flash, the zero lands, the spreadsheet is blown apart', { level: 1 });
cue(at(5, 1), 'hit', 'word "spreadsheets." slams in', { level: 0.9 });
cue(at(5, 2), 'pop', 'the zero pulses, a ring ripples out', { level: 0.5 });
cue(at(5, 3.25), 'whoosh', 'word drops away, the ring closes up into the logo shape', { to: at(6), level: 0.7 });

// Bar 6: logo
cue(at(6), 'logo', 'logo lands on the downbeat with a flash, the bird unfolds', { level: 1 });
cue(at(6) + 0.1, 'whoosh', 'wordmark "EasyReimburse" rises', { to: at(6) + 0.6, level: 0.35 });
cue(at(6, 1.5) - 0.05, 'pop', 'line "Erasmus+ travel reimbursements." rises', { level: 0.4 });
cue(at(6, 2.25) - 0.05, 'hit', 'line "From weeks to minutes." rises, logo pulses', { level: 0.6 });
cue(at(7) - 0.2, 'whoosh', 'gradient curtain sweeps left to right; fully covers at the bar line', { to: at(7) + 0.28, level: 0.9 });

// Bar 7: 01 Invite
cue(at(7), 'cut', 'bar 7: 01 Invite, "Magic link in."');
cue(at(7) + 0.06, 'pop', 'headline line 1 and the email card arrive', { level: 0.5 });
cue(at(7, 1) - 0.05, 'pop', 'headline line 2 "No accounts."', { level: 0.5 });
cue(at(7, 1.5), 'tick', 'mouse click on the link button', { level: 0.8 });
cue(at(7, 2), 'hit', 'participant card pops up', { level: 0.6 });
for (let i = 0; i < 3; i++) cue(at(7, 2.5 + i * 0.25), 'tick', `strike-through ${['Password', 'App', 'Sign-up'][i]}`, { level: 0.5 });
cue(at(7, 3.25), 'success', 'green sticker "You\'re in" (small success)', { level: 0.5 });
cue(at(8) - 0.1, 'whoosh', 'push to the next bar', { to: at(8) + 0.12, level: 0.5 });

// Bar 8: 02 Extract
cue(at(8), 'cut', 'bar 8: 02 Extract, "AI reads every ticket."');
cue(at(8) + 0.14, 'rise', 'scan line runs down the boarding pass (short scanner sweep)', { to: at(8) + 0.7, level: 0.5 });
cue(at(8, 1) - 0.05, 'pop', 'headline line 2 "every ticket."', { level: 0.4 });
for (let i = 0; i < 3; i++) cue(at(8, 1 + i * 0.5), 'pop', `extracted field ${['route', 'date', 'amount'][i]} pops out with a sparkle (rising pitch)`, { level: 0.6 });
cue(at(8, 3), 'hit', 'all three fields pulse', { level: 0.4 });
cue(at(9) - 0.1, 'whoosh', 'push to the next bar', { to: at(9) + 0.12, level: 0.5 });

// Bar 9: 03 Convert
cue(at(9), 'cut', 'bar 9: 03 Convert, "Official EU exchange rates."');
cue(at(9) + 0.08, 'hit', '"1,240 Kč" lands', { level: 0.5 });
cue(at(9, 1), 'pop', 'rate chip "1 € = 25.243 Kč" pops', { level: 0.5 });
cue(at(9, 2) - 0.36, 'tick', 'euro amount spins up (fast counter roll)', { to: at(9, 2), count: 10, level: 0.4 });
cue(at(9, 2), 'hit', '"€49.12" lands', { level: 0.8 });
cue(at(9, 2.5), 'pop', 'second conversion pops (zł)', { level: 0.4 });
cue(at(9, 3), 'pop', 'third conversion pops (lei)', { level: 0.4 });
cue(at(10) - 0.1, 'whoosh', 'push to the next bar', { to: at(10) + 0.12, level: 0.5 });

// Bar 10: 04 Review
cue(at(10), 'cut', 'bar 10: 04 Review, "AI review flags what needs you."');
for (const [i, dt] of [0.14, 0.26, 0.38].entries()) cue(at(10) + dt, 'tick', `check ${i + 1} passes (green tick)`, { level: 0.5 });
cue(at(10, 1), 'hit', 'fourth row is flagged amber "Needs you" (a warning tone, not harsh)', { level: 0.7 });
cue(at(10, 2.5), 'pop', 'flag resolved: turns into a green tick', { level: 0.5 });
cue(at(10, 3), 'success', 'big green sticker "All clear"', { level: 0.8 });
cue(at(11) - 0.1, 'whoosh', 'push out', { to: at(11), level: 0.5 });

// Bar 11: Approve. Pay. Done.
cue(at(11), 'cut', 'bar 11');
cue(at(11), 'hit', '"Approve." slams in', { level: 0.9 });
cue(at(11) + 0.16, 'tick', '5 status pills flip to "Approved", top to bottom', { to: at(11) + 0.36, count: 5, level: 0.45 });
cue(at(11, 1), 'hit', '"Pay." slams in', { level: 0.9 });
cue(at(11, 1) + 0.1, 'tick', '5 status pills flip to green "Paid"', { to: at(11, 1) + 0.3, count: 5, level: 0.5 });
cue(at(11, 2), 'hit', '"Done." slams in with confetti', { level: 1 });
cue(at(11, 2), 'success', 'everyone is paid: the main success sound of the film', { level: 1 });
cue(at(11, 2) + 0.02, 'tick', 'total counts up to €12,480.50', { to: at(11, 2) + 0.46, count: 12, level: 0.35 });
cue(at(11, 3), 'pop', 'total and "Done." pulse', { level: 0.5 });
cue(at(12) - 0.1, 'whoosh', 'bar 11 splits left and right', { to: at(12), level: 0.5 });

// Bar 12: 90% less time spent
cue(at(12), 'cut', 'bar 12');
cue(at(12), 'hit', '"90%" slams in, counting up from 0', { level: 1 });
cue(at(12, 1) - 0.06, 'pop', 'words "less time spent" rise, outline echo on the number', { level: 0.6 });
cue(at(12, 2) - 0.2, 'whoosh', 'the time bar collapses from "weeks" to a tenth (falling pitch)', { to: at(12, 2) + 0.22, level: 0.7 });
cue(at(12, 2.5), 'pop', 'label "MINUTES" pops', { level: 0.5 });
cue(at(13) - 0.2, 'whoosh', 'gradient curtain sweeps right to left; fully covers at the bar line', { to: at(13) + 0.28, level: 0.9 });

// Bars 13–14: end card
cue(at(13), 'cut', 'bar 13: end card');
cue(at(13) + 0.04, 'logo', 'logo spins in', { level: 0.8 });
cue(at(13) + 0.16, 'whoosh', 'name "EasyReimburse" rises', { to: at(13) + 0.66, level: 0.3 });
cue(at(13, 1), 'pop', 'line "Travel reimbursements, from weeks to minutes."', { level: 0.4 });
cue(at(13, 2), 'pop', '"Try for free" button pops', { level: 0.7 });
cue(at(13, 2) + 0.14, 'pop', 'easyreimburse.ai slides in', { level: 0.3 });
cue(at(13, 3), 'pop', 'two footnotes rise', { level: 0.3 });
cue(at(14), 'hit', 'final accent: glint across the button, logo pulse. Let it ring out to the end', { to: at(15), level: 0.7 });

cues.sort((a, b) => a.t - b.t);
const out = {
  version: 'b-numbers',
  bpm: BPM,
  beat: r3(BEAT),
  bar: r3(BAR),
  bars: BARS,
  duration: Math.ceil(at(BARS + 1) * 10) / 10,
  barStarts: Array.from({ length: BARS + 1 }, (_, i) => r3(at(i + 1))),
  sections: [
    { bars: '1-3', mood: 'dim and tight: a kick-less pulse or muted bass, room for the three slams' },
    { bars: '4', mood: 'tension: heartbeat, riser, high-pass sweep; two frames of silence at the end' },
    { bars: '5-6', mood: 'the drop: full beat and bass come in; bar 6 is the logo' },
    { bars: '7-10', mood: 'driving groove, one feature per bar' },
    { bars: '11-12', mood: 'peak: "Approve. Pay. Done." and the 90% stat' },
    { bars: '13-14', mood: 'end card: resolve; last hit on the downbeat of bar 14, then ring out' },
  ],
  cues,
};
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cues.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`${file}: ${cues.length} cues, duration ${out.duration}s`);
