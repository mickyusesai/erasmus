"""
Soundtrack for version A · "Paper Bird". 108 BPM, D major, 16 bars (35.56s).
  bars 1–3  the pile: a nervous little ostinato in B minor, papers landing, message pings
  bar 4     everything stops; the fold: a rising run of notes and a chime when the bird lands
  bars 5–12 the groove (D – A – Bm – G) under the brand reveal and the four steps
  bar 13    the proof: a held breath and a fill
  bars 14–16 end card: full band, final chord
Run: python3 audio/a.py  →  out/a-paper-bird.wav
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import (SR, Mix, bass, bell, blip, clap, click, counter, duck, epiano, flutter, hat, hz, impact, kick, mallet,
                   master, pad, paper, pop, reverse_swell, riser, rng, scan, shaker, snare, tick, whoosh, write_wav)

BPM = 108
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = 16 * BAR
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'a-paper-bird.wav')

music = Mix(TOTAL)   # everything that ducks under the kick
drums = Mix(TOTAL)
sfx = Mix(TOTAL)


def at(bar, beat=0.0):
    """Time of a beat (0-based) in a bar (0-based)"""
    return bar * BAR + beat * BEAT


CHORDS = {
    'D': (['D2'], ['D3', 'A3', 'D4', 'F#4'], ['D5', 'F#5', 'A5']),
    'A': (['A1'], ['E3', 'A3', 'C#4', 'E4'], ['C#5', 'E5', 'A5']),
    'Bm': (['B1'], ['F#3', 'B3', 'D4', 'F#4'], ['B4', 'D5', 'F#5']),
    'G': (['G1'], ['D3', 'G3', 'B3', 'D4'], ['B4', 'D5', 'G5']),
    'Em': (['E2'], ['E3', 'B3', 'D4', 'G4'], ['B4', 'E5', 'G5']),
    'Asus': (['A1'], ['E3', 'A3', 'D4', 'E4'], ['A4', 'D5', 'E5']),
}

# ───────────────────────────── Bars 1–3: the pile ─────────────────────────────
# A staccato figure that gets busier: B minor, then G, then Em → A to wind up
ostinato = {0: ['B3', 'D4', 'F#4', 'D4', 'B3', 'D4', 'F#4', 'D4'],
            1: ['G3', 'B3', 'D4', 'B3', 'G3', 'B3', 'D4', 'G4'],
            2: ['E3', 'G3', 'B3', 'G3', 'A3', 'C#4', 'E4', 'A4']}
for bar, notes in ostinato.items():
    for i, note in enumerate(notes):
        if bar == 0 and i < 1:
            continue
        gain = 0.26 + 0.05 * bar + (0.05 if i % 2 == 0 else 0)
        music.add(mallet(hz(note), 0.5, bright=0.7, decay=0.16), at(bar, i * 0.5), gain, pan=-0.25 if i % 2 else 0.25, reverb=0.18)
        if bar >= 1:  # an octave above joins in
            music.add(mallet(hz(note) * 2, 0.4, bright=0.5, decay=0.11), at(bar, i * 0.5 + 0.25), 0.11 + 0.03 * bar, pan=0.4 if i % 2 else -0.4, reverb=0.25)
music.add(pad(hz('B2'), BAR * 1.02, cutoff=900), at(0), 0.55, reverb=0.3)
music.add(pad(hz('F#3'), BAR * 1.02, cutoff=900), at(0), 0.4, reverb=0.3)
music.add(pad(hz('G2'), BAR * 1.02, cutoff=1000), at(1), 0.6, reverb=0.3)
music.add(pad(hz('D3'), BAR * 1.02, cutoff=1000), at(1), 0.42, reverb=0.3)
music.add(pad(hz('E2'), BAR * 0.52, cutoff=1200), at(2), 0.65, reverb=0.3)
music.add(pad(hz('A2'), BAR * 0.5, cutoff=1500), at(2, 2), 0.7, reverb=0.3)
music.add(pad(hz('E3'), BAR * 0.5, cutoff=1500), at(2, 2), 0.5, reverb=0.3)
# A pulse like a heartbeat under the messages, shaker getting busier
for beat in range(4):
    drums.add(kick(decay=0.12, click=0.2), at(2, beat), 0.5)
for i in range(16):
    drums.add(shaker(seed=60 + i), at(1, i * 0.25), 0.25 + 0.2 * (i % 4 == 2), pan=0.3)
    drums.add(shaker(seed=80 + i), at(2, i * 0.25), 0.4 + 0.25 * (i % 4 == 2), pan=-0.3)
sfx.add(riser(BAR * 0.95), at(2, 0.2), 0.42, reverb=0.2)
sfx.add(reverse_swell(BEAT * 1.4), at(3) - BEAT * 1.4, 0.7)

# Papers landing (same times as the animation: start 1.15s, last 4.2s, 0.34s fall)
r = rng(7)
for i in range(40):
    land = 1.15 + (4.2 - 1.15) * (i / 39) ** 0.62 + 0.34
    sfx.add(paper(seed=100 + i, weight=1.0 if i < 6 else 0.6), land, r.uniform(0.3, 0.5), pan=r.uniform(-0.8, 0.8), reverb=0.08)
sfx.add(paper(seed=141, weight=1.3), 4.32 + 0.34, 0.75, reverb=0.1)
# Message pings, one per beat
for i, (f1, f2) in enumerate((('E5', 'A5'), ('G5', 'B5'), ('A5', 'C#6'), ('B5', 'E6'))):
    sfx.add(blip(hz(f1), hz(f2)), at(2, i), 0.5, pan=(-0.5, 0.5, -0.3, 0.4)[i], reverb=0.2, delay=0.15)

# ───────────────────────────── Bar 4: the stop and the fold ─────────────────────────────
F = at(3)
sfx.add(impact(1.6, tone=55), F, 0.75, reverb=0.25)
sfx.add(whoosh(0.7, 300, 2400, seed=14), F, 0.5, pan=-0.2, reverb=0.2)
for note, gain in (('A2', 0.6), ('E3', 0.5), ('A3', 0.4), ('D4', 0.35)):
    music.add(pad(hz(note), BAR * 0.95, cutoff=1400, attack=0.6, release=0.5), F + 0.1, gain, reverb=0.45)
fold = F + 0.76
for i in range(3):
    sfx.add(flutter(0.55, seed=40 + i), fold + i * 0.12, 0.45, pan=(-0.4, 0.3, 0.0)[i], reverb=0.2)
run = ['D4', 'F#4', 'A4', 'B4', 'D5', 'F#5', 'A5', 'B5', 'D6']
for i, note in enumerate(run):
    music.add(mallet(hz(note), 0.9, bright=0.8, decay=0.3), fold + 0.05 + i * 0.098, 0.2 + 0.02 * i, pan=-0.6 + 0.15 * i, reverb=0.4, delay=0.2)
landed = fold + 0.95
sfx.add(bell(hz('D5'), 2.4), landed, 0.42, pan=-0.15, reverb=0.5)
sfx.add(bell(hz('A5'), 2.0), landed + 0.02, 0.26, pan=0.2, reverb=0.5)
sfx.add(pop(520), landed, 0.4)
for beat_time in (landed + 0.12, landed + 0.46):
    sfx.add(flutter(0.24, seed=int(beat_time * 100)), beat_time, 0.4, reverb=0.15)
# Pick-up into the groove
drums.add(snare(seed=31), at(3, 3.5), 0.35, reverb=0.15)
drums.add(snare(seed=32), at(3, 3.75), 0.45, reverb=0.15)

# ───────────────────────────── Bars 5–16: the groove ─────────────────────────────
PROGRESSION = {4: ['D'], 5: ['A'], 6: ['Bm'], 7: ['G'], 8: ['D'], 9: ['A'], 10: ['Bm'], 11: ['G'],
               12: ['Em', 'Asus'], 13: ['D'], 14: ['G', 'A'], 15: ['D']}
kicks = []

ARP = [0, 1, 2, 1, 0, 2, 1, 2]  # which chord tone each 8th note plays
HOOK = {  # the tune that comes in with "AI does the data entry" (beat, note, length in beats)
    'D': [(0, 'F#5', 1), (1, 'A5', 1), (2, 'F#5', 0.5), (2.5, 'E5', 0.5), (3, 'D5', 1)],
    'A': [(0, 'E5', 1.5), (1.5, 'C#5', 0.5), (2, 'E5', 1), (3, 'A4', 1)],
    'Bm': [(0, 'D5', 1), (1, 'F#5', 1), (2, 'D5', 0.5), (2.5, 'B4', 1), (3.5, 'D5', 0.5)],
    'G': [(0, 'B4', 1), (1, 'D5', 1), (2, 'G5', 1), (3, 'F#5', 0.5), (3.5, 'E5', 0.5)],
}

for bar, chords in PROGRESSION.items():
    final = bar == 15
    proof = bar == 12
    span = 4 / len(chords)  # beats per chord
    energy = 1.0 if bar >= 13 else 0.85 if bar >= 8 else 0.75
    for ci, name in enumerate(chords):
        root, mid, top = CHORDS[name]
        b0 = ci * span
        start = at(bar, b0)
        if final:
            # Last chord: let it ring
            for note in mid + top:
                music.add(epiano(hz(note), 3.2, vel=0.9), start, 0.26, pan=0.0, reverb=0.5)
            music.add(bass(hz(root[0]), 2.6), start, 0.48)
            for note in ('D5', 'A5', 'D6'):
                sfx.add(bell(hz(note), 3.0), start, 0.2, reverb=0.6)
            for note in ('D3', 'A3', 'F#4'):
                music.add(pad(hz(note), 3.0, cutoff=2200, attack=0.05, release=1.6), start, 0.6, reverb=0.5)
            # A small sign-off: two notes that answer the chord
            music.add(mallet(hz('A5'), 0.9, decay=0.35), at(bar, 1.5), 0.3, pan=0.2, reverb=0.5, delay=0.25)
            music.add(mallet(hz('D6'), 1.4, decay=0.5), at(bar, 2), 0.32, pan=-0.2, reverb=0.5, delay=0.25)
            continue

        # Pad
        for note in mid[:3]:
            music.add(pad(hz(note), span * BEAT * 1.03, cutoff=1500 + 500 * energy), start, 0.42, reverb=0.3)
        # Electric piano: on the one and pushed before the three
        hits = [(0, 1.4), (1.5, 2.3)] if span == 4 else [(0, 1.8)]
        for off, length in hits:
            for note in mid:
                music.add(epiano(hz(note), length * BEAT, vel=0.8), at(bar, b0 + off), 0.2 * energy, pan=0.15, reverb=0.22)
        # Bass follows the kick
        pattern = [(0, 1.3), (1.5, 0.45), (2, 1.3), (3.5, 0.45)] if span == 4 else [(0, 1.3), (1.5, 0.45)]
        for off, length in pattern:
            if proof and ci == 0:
                continue
            music.add(bass(hz(root[0]) * (2 if off == 3.5 else 1), length * BEAT), at(bar, b0 + off), 0.46)
        # Mallet arpeggio in eighths
        for i in range(int(span * 2)):
            tone = top[ARP[i % 8] % len(top)]
            accent = 1.0 if i % 4 == 0 else 0.75
            music.add(mallet(hz(tone), 0.6, bright=1.1, decay=0.2), at(bar, b0 + i * 0.5), 0.24 * accent * energy,
                      pan=0.45 if i % 2 else -0.45, reverb=0.25, delay=0.18)
        # The tune
        if (8 <= bar <= 11 or bar in (13, 14)) and name in HOOK:
            for off, note, length in HOOK[name]:
                if off >= span:
                    continue
                music.add(mallet(hz(note) * 2, max(0.5, length * BEAT * 1.5), bright=1.0, decay=0.3), at(bar, b0 + off), 0.2, pan=-0.1, reverb=0.4, delay=0.3)
                music.add(epiano(hz(note), length * BEAT * 1.2, vel=1.0), at(bar, b0 + off), 0.2, pan=0.1, reverb=0.3)

    if final:
        drums.add(kick(), at(bar), 0.9)
        kicks.append(at(bar))
        sfx.add(impact(1.8, tone=73), at(bar), 0.35, reverb=0.4)
        continue

    # Drums: kick on 1, the "and" of 2, and 3; clap on 2 and 4; hats in eighths
    drum_beats = [0, 1.5, 2] if not proof else []
    for beat in drum_beats:
        drums.add(kick(), at(bar, beat), 0.74)
        kicks.append(at(bar, beat))
    if not proof:
        for beat in (1, 3):
            drums.add(clap(seed=200 + bar), at(bar, beat), 0.62, reverb=0.18)
        for i in range(8):
            open_ = i == 7 and bar % 2 == 1
            drums.add(hat(seed=300 + bar * 8 + i, open_=open_), at(bar, i * 0.5), 0.6 if i % 2 else 0.4, pan=0.25)
        for i in range(16):
            drums.add(shaker(seed=400 + i), at(bar, i * 0.25), (0.22 if i % 2 else 0.12) * energy, pan=-0.35)
    else:
        # Proof: hold back for two beats, then a fill into the end card
        for i, beat in enumerate((2, 2.5, 3, 3.25, 3.5, 3.75)):
            drums.add(snare(seed=500 + i), at(bar, beat), 0.3 + 0.06 * i, reverb=0.15)
        drums.add(kick(), at(bar, 2), 0.7)
        kicks.append(at(bar, 2))

# A lift into bars 9 and 14
sfx.add(reverse_swell(BEAT * 2), at(8) - BEAT * 2, 0.4)
sfx.add(reverse_swell(BEAT * 2), at(13) - BEAT * 2, 0.55)
sfx.add(impact(1.2, tone=73), at(4), 0.45, reverb=0.3)
sfx.add(impact(1.2, tone=73), at(13), 0.4, reverb=0.3)

# ───────────────────────────── Sound effects for the scenes ─────────────────────────────
PENTA = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6']


def note_pop(index, time, gain=0.3, pan=0.0):
    sfx.add(mallet(hz(PENTA[index % len(PENTA)]), 0.5, bright=0.6, decay=0.14), time, gain, pan=pan, reverb=0.3)


# Brand scene out
sfx.add(whoosh(0.6, 400, 3200, seed=15), at(5) - 0.45, 0.4, pan=0.2, reverb=0.15)

# Step 1 · invite
t0 = at(5)
sfx.add(click(), t0 + 1.2, 0.6, pan=0.4)
for i in range(5):
    sfx.add(whoosh(0.4, 900, 3800, seed=20 + i, q=1.4), t0 + 1.32 + i * 0.09, 0.22, pan=0.5, reverb=0.1)
    note_pop(i, t0 + 1.32 + i * 0.09 + 0.6, 0.24, pan=0.45)
sfx.add(blip(hz('A5'), hz('D6')), t0 + 2.3, 0.35, pan=0.3, reverb=0.2)

# Step 2 · upload
t0 = at(6.5)
sfx.add(whoosh(0.5, 300, 1800, seed=26), t0 - 0.2, 0.3, pan=0.3, reverb=0.1)
for i in range(4):
    sfx.add(pop(420 + 60 * i), t0 + 0.25 + i * 0.08, 0.22, pan=0.3)
    fly = t0 + 1.0 + i * 0.24
    sfx.add(flutter(0.42, seed=70 + i), fly, 0.38, pan=0.35, reverb=0.1)
    sfx.add(pop(560 + 70 * i), fly + 0.46, 0.4, pan=0.35)
    sfx.add(tick(seed=75 + i, tone=2800), fly + 0.72, 0.5, pan=0.35)
sfx.add(blip(hz('F#5'), hz('A5')), t0 + 2.4, 0.3, pan=0.35, reverb=0.2)

# Step 3 · AI reads
t0 = at(8)
sfx.add(whoosh(0.5, 300, 1800, seed=27), t0 - 0.2, 0.3, pan=0.3, reverb=0.1)
scan0 = t0 + 0.55
sfx.add(scan(1.05), scan0, 0.9, pan=0.3, reverb=0.3)
for i, frac in enumerate((0.34, 0.5, 0.62, 0.76)):
    note_pop(i + 1, scan0 + frac + 0.16, 0.3, pan=0.35)
sfx.add(pop(700), scan0 + 0.62 + 0.5, 0.3, pan=0.4)
sfx.add(counter(0.6, rate=30, seed=51), t0 + 2.05, 0.5, pan=0.35)
sfx.add(bell(hz('A5'), 1.2), t0 + 2.5, 0.2, pan=0.35, reverb=0.4)
swap = t0 + 2.85
sfx.add(whoosh(0.4, 500, 2600, seed=28), swap, 0.28, pan=0.3, reverb=0.1)
for i in range(4):
    sfx.add(tick(seed=90 + i, tone=2200 + 200 * i), swap + 0.5 + i * 0.1, 0.5, pan=0.35)
sfx.add(counter(0.75, rate=30, seed=52), swap + 0.4, 0.45, pan=0.35)

# Step 4 · review, approve, pay
t0 = at(10)
sfx.add(whoosh(0.5, 300, 1800, seed=29), t0 - 0.2, 0.3, pan=0.3, reverb=0.1)
for i in range(3):
    note_pop((0, 2, 3)[i], t0 + 0.45 + i * 0.26, 0.34, pan=0.3)
sfx.add(bell(hz('D6'), 1.6), t0 + 1.28, 0.26, pan=0.35, reverb=0.45)
sfx.add(click(seed=23), t0 + 1.85, 0.6, pan=0.4)
sfx.add(blip(hz('A5'), hz('D6')), t0 + 1.97, 0.4, pan=0.35, reverb=0.25)
swap = t0 + 2.3
sfx.add(whoosh(0.4, 500, 2600, seed=33), swap, 0.28, pan=0.3, reverb=0.1)
for i in range(5):
    paid = swap + 0.72 + i * 0.15
    note_pop(i + 1, paid, 0.34, pan=0.4)
    sfx.add(flutter(0.3, seed=110 + i), paid + 0.1, 0.2, pan=0.6, reverb=0.15)
sfx.add(counter(1.15, rate=30, seed=53), swap + 0.6, 0.45, pan=0.35)

# Proof
t0 = at(12)
sfx.add(impact(1.5, tone=62), t0, 0.55, reverb=0.35)
sfx.add(counter(0.75, rate=34, seed=54), t0 - 0.05, 0.5)
for i in range(4):
    sfx.add(pop(520 + 70 * i), t0 + 0.55 + i * 0.09, 0.32, pan=-0.45 + 0.3 * i)

# End card
t0 = at(13)
sfx.add(whoosh(0.75, 300, 2600, seed=34), t0 - 0.38, 0.45, pan=-0.2, reverb=0.2)
sfx.add(whoosh(1.2, 600, 2200, seed=35, q=0.8), t0 - 0.1, 0.3, pan=-0.3, reverb=0.25)
for i in range(6):
    sfx.add(flutter(0.2, seed=120 + i), t0 - 0.05 + i * 0.28, 0.3, pan=-0.7 + 0.14 * i, reverb=0.15)
sfx.add(bell(hz('A5'), 1.8), t0 + 2.15, 0.22, reverb=0.5)
sfx.add(pop(660), t0 + 2.15, 0.35)

# ───────────────────────────── Mixdown ─────────────────────────────
mix = duck(music.render(), kicks, depth=0.3) * 0.9 + drums.render(reverb_seconds=1.2) * 0.8 + sfx.render() * 0.8
write_wav(OUT, master(mix, peak_db=-1.0, drive=1.1, fade_out=0.6))
