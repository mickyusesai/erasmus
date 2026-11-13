"""
Soundtrack for version B · "Numbers". 124 BPM, A minor, 14 bars (27.1s).
  bars 1–4   tension: a hit on every number, a pulsing bass that opens up, a heartbeat, then silence…
  bar 5      the drop ("0 spreadsheets"): full four-on-the-floor beat
  bars 6–12  the groove (Am – F – C – G) under the logo and the feature punches
  bars 13–14 end card: final chord in C major, a last accent, ring out
The film's cue sheet (b-numbers/cues.json) places the hits, pops and ticks.
Run: python3 audio/b.py  →  out/b-numbers.wav
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cues import apply_cues, load_cues
from synth import (SR, Mix, bass, bell, clap, duck, hat, hz, impact, kick, mallet, master, pad, pluck_bass, reverse_swell,
                   riser, snare, stab, write_wav)

BPM = 124
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = 27.1
DROP = 4 * BAR  # 7.74s
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'b-numbers.wav')

music = Mix(TOTAL)
drums = Mix(TOTAL)
sfx = Mix(TOTAL)


def at(bar, beat=0.0):
    return bar * BAR + beat * BEAT


CHORDS = {
    'Am': ('A2', ['A3', 'C4', 'E4'], ['A4', 'C5', 'E5', 'A5']),
    'F': ('F2', ['A3', 'C4', 'F4'], ['A4', 'C5', 'F5', 'A5']),
    'C': ('C3', ['G3', 'C4', 'E4'], ['G4', 'C5', 'E5', 'G5']),
    'G': ('G2', ['G3', 'B3', 'D4'], ['G4', 'B4', 'D5', 'G5']),
}

# ───────────────────────────── Bars 1–4: the pain, in numbers ─────────────────────────────
# One dark chord per number, each a step higher; the bass pulse underneath opens up bar by bar
for bar, root in enumerate(('A2', 'A2', 'C3', 'D3')):
    chord = {0: ['A2', 'E3', 'A3'], 1: ['A2', 'E3', 'C4'], 2: ['C3', 'G3', 'E4'], 3: ['D3', 'A3', 'F4']}[bar]
    music.add(stab([hz(n) for n in chord], 0.9, cutoff=1400 + 500 * bar), at(bar), 0.7, reverb=0.35)
    for i in range(1, 8):
        music.add(pluck_bass(hz(root), BEAT * 0.45, cutoff=260 + 170 * bar + 25 * i), at(bar, i * 0.5), 0.36 + 0.03 * bar)
    if bar >= 1:
        for i in range(16):
            drums.add(hat(seed=30 + bar * 16 + i), at(bar, i * 0.25), (0.14 + 0.05 * bar) * (1.0 if i % 4 == 2 else 0.6), pan=0.3)
    if bar in (1, 2):
        for beat in (1, 3):
            drums.add(clap(seed=50 + bar), at(bar, beat), 0.4, reverb=0.2)
# Bar 4 belongs to the heartbeat hits from the cue sheet; a riser pulls towards the drop
sfx.add(riser(BAR * 0.96, seed=21), at(3), 0.55, reverb=0.2)
sfx.add(reverse_swell(BEAT * 1.6, seed=22), DROP - 0.07 - BEAT * 1.6, 0.6)

# ───────────────────────────── Bars 5–12: the drop and the groove ─────────────────────────────
PROGRESSION = {4: 'Am', 5: 'F', 6: 'Am', 7: 'F', 8: 'C', 9: 'G', 10: 'Am', 11: 'F'}
LEAD = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]  # sixteenth-note pattern over the chord tones
kicks = []
sfx.add(impact(2.0, tone=48, seed=23), DROP, 0.6, reverb=0.35)

for bar, name in PROGRESSION.items():
    root, mid, top = CHORDS[name]
    lift = bar == 11  # the bar before the end card builds up
    # Four on the floor
    for beat in range(4):
        drums.add(kick(f_hi=170, decay=0.17, click=0.55), at(bar, beat), 0.64)
        kicks.append(at(bar, beat))
        drums.add(hat(seed=100 + bar * 4 + beat, open_=True), at(bar, beat + 0.5), 0.3, pan=0.25)
    for beat in (1, 3):
        drums.add(clap(seed=120 + bar), at(bar, beat), 0.7, reverb=0.2)
        drums.add(snare(seed=140 + bar), at(bar, beat), 0.3, reverb=0.15)
    for i in range(16):
        drums.add(hat(seed=160 + i), at(bar, i * 0.25), 0.13 if i % 2 else 0.07, pan=-0.3)
    # Eighth-note bass, pushing on the off-beats between the kicks
    for i in range(8):
        octave = 2 if i in (3, 7) else 1
        music.add(pluck_bass(hz(root) * octave, BEAT * 0.48, cutoff=900), at(bar, i * 0.5), 0.44 if i % 2 else 0.28)
    # Chord stabs: pushed, syncopated
    for off in (0, 0.75, 1.5, 2.5, 3.25):
        music.add(stab([hz(n) for n in mid], 0.3, cutoff=3400), at(bar, off), 0.6, pan=0.15, reverb=0.22, delay=0.12)
    for note in mid:
        music.add(pad(hz(note), BAR * 1.02, cutoff=2400), at(bar), 0.4, reverb=0.3)
    # Lead plucks from the logo sting on
    if bar >= 5:
        for i, idx in enumerate(LEAD):
            if lift and i >= 8:
                idx = (i - 8) % 4  # climbs straight up before the end card
            music.add(mallet(hz(top[idx]) * (2 if (lift and i >= 12) else 1), 0.4, bright=1.3, decay=0.12), at(bar, i * 0.25),
                      0.2 if i % 4 else 0.28, pan=0.5 if i % 2 else -0.5, reverb=0.3, delay=0.2)
    if lift:
        for i in range(8):
            drums.add(snare(seed=180 + i), at(bar, 2 + i * 0.25), 0.3 + 0.05 * i, reverb=0.12)
        sfx.add(riser(BAR * 0.6, seed=24), at(bar, 1.6), 0.5, reverb=0.2)

# The logo's three-note call (bar 6)
for i, (note, beat) in enumerate((('E5', 0), ('G5', 0.75), ('A5', 1.5))):
    sfx.add(bell(hz(note), 2.2), at(5, beat), 0.3, pan=(-0.3, 0.3, 0.0)[i], reverb=0.5)

# ───────────────────────────── Bars 13–14: end card ─────────────────────────────
E = at(12)
drums.add(kick(f_hi=170, decay=0.22), E, 0.8)
kicks.append(E)
sfx.add(impact(2.2, tone=65, seed=25), E, 0.5, reverb=0.4)
for note in ('C3', 'G3', 'C4', 'E4', 'G4'):
    music.add(pad(hz(note), BAR * 2.0, cutoff=3000, attack=0.02, release=1.8), E, 0.75, reverb=0.5)
music.add(stab([hz(n) for n in ('C4', 'E4', 'G4', 'C5')], 1.2, cutoff=4200), E, 0.8, reverb=0.4, delay=0.2)
music.add(bass(hz('C3'), 1.9), E, 0.45)
for i, (note, beat) in enumerate((('G5', 0), ('C6', 0.75), ('E6', 1.5))):
    sfx.add(bell(hz(note), 2.4), at(12, beat), 0.3, pan=(-0.3, 0.3, 0.0)[i], reverb=0.55)
# A light pulse keeps the end card alive, then the last accent rings out
for i in range(8):
    drums.add(hat(seed=200 + i), at(12, i * 0.5), 0.12 if i % 2 else 0.07, pan=-0.3)
music.add(stab([hz(n) for n in ('C4', 'E4', 'G4', 'C5')], 1.6, cutoff=3600), at(13), 0.5, reverb=0.5, delay=0.25)
music.add(bass(hz('C3'), 1.6), at(13), 0.35)
for i, note in enumerate(('C6', 'G6')):
    sfx.add(bell(hz(note), 2.2), at(13, i * 0.5), 0.22, pan=(-0.2, 0.2)[i], reverb=0.6)

# ───────────────────────────── Effects from the film's cue sheet ─────────────────────────────
apply_cues(
    sfx, load_cues('b-numbers'), ['A4', 'C5', 'D5', 'E5', 'G5', 'A5'], level=0.9,
    # The drop, the logo calls and the long riser are already in the music above
    skip=lambda c: c['type'] in ('drop', 'logo') or (c['type'] == 'rise' and c.get('to', 0) - c['t'] > 1.2),
    rises='shimmer',
    # Hits are heavy before the drop and lighter once the kick drum is playing
    hit_gain=lambda c: 0.45 if c['t'] < DROP else 0.3,
)

mix = duck(music.render(reverb_seconds=1.8), kicks, depth=0.5, release=0.2) * 0.9 + drums.render(reverb_seconds=1.0) * 0.85 + sfx.render() * 0.8
# Two frames of black before the drop: everything cuts out for a breath
gap0, gap1 = int((DROP - 0.075) * SR), int(DROP * SR)
mix[gap0:gap1] *= np.linspace(1, 0, gap1 - gap0)[:, None] ** 6
write_wav(OUT, master(mix, peak_db=-1.0, drive=1.25, fade_out=0.7))
