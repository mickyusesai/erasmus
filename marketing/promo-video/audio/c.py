"""
Soundtrack for version C · "The Journey". 84 BPM, C major, 13 bars (37.14s). Warm and cinematic.
  bars 1–2   the map appears: a slow swell (F – C/E), first piano notes
  bars 3–5   the route: a gentle pulse (Am – F – C), piano arpeggios
  bar 6      "…and ends with paperwork": the pulse drops out (Dm – Gsus)
  bars 7–8   "Not anymore": lift (F – G), the pulse returns, fuller
  bars 9–11  the organiser, everyone paid (Am – F – C/E→G), the tune on top
  bars 12–13 end card: C major, ring out
Run: python3 audio/c.py  →  out/c-journey.wav
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cues import apply_cues, load_cues
from synth import (Mix, bass, bell, clap, duck, epiano, hat, hz, impact, kick, mallet, master, pad, reverse_swell, riser,
                   shaker, snare, write_wav)

BPM = 84
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = 37.2
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'c-journey.wav')

music = Mix(TOTAL)
drums = Mix(TOTAL)
sfx = Mix(TOTAL)


def at(bar, beat=0.0):
    return bar * BAR + beat * BEAT


# name: (bass, pad notes, arpeggio notes)
CHORDS = {
    'F': ('F2', ['F3', 'A3', 'C4', 'E4'], ['F4', 'A4', 'C5', 'E5', 'A5']),
    'C/E': ('E2', ['E3', 'G3', 'C4', 'D4'], ['E4', 'G4', 'C5', 'D5', 'G5']),
    'Am': ('A2', ['E3', 'A3', 'C4', 'G4'], ['A4', 'C5', 'E5', 'G5', 'C6']),
    'C': ('C2', ['G3', 'C4', 'E4', 'G4'], ['G4', 'C5', 'E5', 'G5', 'C6']),
    'Dm': ('D2', ['F3', 'A3', 'C4', 'F4'], ['D4', 'F4', 'A4', 'C5', 'F5']),
    'Gsus': ('G2', ['G3', 'C4', 'D4'], ['G4', 'C5', 'D5', 'G5', 'D5']),
    'G': ('G2', ['G3', 'B3', 'D4', 'G4'], ['G4', 'B4', 'D5', 'G5', 'B5']),
    'Cadd9': ('C2', ['G3', 'C4', 'D4', 'E4', 'G4'], ['G4', 'C5', 'D5', 'E5', 'G5']),
}
# bar: [(chord, beats)]
PLAN = {
    0: [('F', 4)], 1: [('C/E', 4)],
    2: [('Am', 4)], 3: [('F', 4)], 4: [('C', 4)],
    5: [('Dm', 2), ('Gsus', 2)],
    6: [('F', 4)], 7: [('G', 4)],
    8: [('Am', 4)], 9: [('F', 4)], 10: [('C/E', 2), ('G', 2)],
    11: [('Cadd9', 4)], 12: [('Cadd9', 4)],
}
ARP = [0, 2, 1, 3, 2, 4, 3, 2]  # eighth notes through the chord
TUNE = {  # bar: [(beat, note, beats)]
    6: [(0, 'A5', 1.5), (1.5, 'C6', 0.5), (2, 'A5', 1), (3, 'F5', 1)],
    7: [(0, 'G5', 1.5), (1.5, 'B5', 0.5), (2, 'D6', 2)],
    8: [(0, 'E5', 1), (1, 'G5', 1), (2, 'C6', 1.5), (3.5, 'B5', 0.5)],
    9: [(0, 'A5', 1.5), (1.5, 'F5', 0.5), (2, 'A5', 1), (3, 'C6', 1)],
    10: [(0, 'G5', 1), (1, 'E5', 1), (2, 'D5', 1), (3, 'G5', 1)],
}
kicks = []

for bar, parts in PLAN.items():
    beat0 = 0.0
    for name, beats in parts:
        root, mid, arp = CHORDS[name]
        start = at(bar, beat0)
        length = beats * BEAT
        ending = bar >= 11
        opening = bar <= 1
        quiet = bar == 5
        full = bar >= 6 and not ending

        # Pad: slow and wide; the opening swells in
        for note in mid:
            music.add(pad(hz(note), length * (1.6 if ending and bar == 11 else 1.04), cutoff=1700 if (opening or quiet) else 3200,
                          attack=1.6 if bar == 0 else 0.5, release=1.0), start, 0.5 if not quiet else 0.42, reverb=0.45)
        if bar == 12:
            beat0 += beats
            continue
        # Bass: one long note per chord, with a second push when the pulse is on
        if not opening:
            music.add(bass(hz(root), length * 0.92, cutoff=480), start, 0.4 if not quiet else 0.3)
        # Piano arpeggio
        if bar >= 1 and not ending:
            for i in range(int(beats * 2)):
                if quiet and i % 2:
                    continue
                note = arp[ARP[i % 8] % len(arp)]
                vel = 1.15 if i % 4 == 0 else 0.9
                music.add(epiano(hz(note), BEAT * 1.6, vel=vel), at(bar, beat0 + i * 0.5), (0.24 if full else 0.2) * (0.7 if bar == 1 else 1),
                          pan=0.35 if i % 2 else -0.35, reverb=0.4, delay=0.22)
        if ending and bar == 11:
            # The last chord, spread out like a strum
            for i, note in enumerate(mid + arp[2:]):
                music.add(epiano(hz(note), 4.5, vel=0.9), start + i * 0.035, 0.2, pan=-0.4 + 0.1 * i, reverb=0.55)
        beat0 += beats

    # The tune (bell-like, doubled by the piano)
    for beat, note, beats in TUNE.get(bar, []):
        music.add(mallet(hz(note), max(0.8, beats * BEAT * 1.4), bright=1.4, decay=0.45), at(bar, beat), 0.3, pan=-0.1, reverb=0.5, delay=0.3)
        music.add(epiano(hz(note) / 2, beats * BEAT * 1.3, vel=0.9), at(bar, beat), 0.16, pan=0.1, reverb=0.4)

    # A soft pulse: kick on 1 and 3, shaker in eighths; fuller from "Not anymore" on
    if 2 <= bar <= 4 or 6 <= bar <= 10:
        strong = bar >= 6
        for beat in ((0, 2) if not strong else (0, 1.5, 2)):
            drums.add(kick(f_hi=110, f_lo=44, decay=0.2, click=0.15), at(bar, beat), 0.55 if not strong else 0.7)
            kicks.append(at(bar, beat))
        for i in range(8):
            drums.add(shaker(seed=200 + bar * 8 + i), at(bar, i * 0.5), 0.9 if i % 2 else 0.55, pan=0.3)
        if strong:
            for beat in (1, 3):
                drums.add(clap(seed=220 + bar), at(bar, beat), 0.32, reverb=0.3)
            for i in range(16):
                drums.add(hat(seed=240 + i), at(bar, i * 0.25), 0.3 if i % 2 else 0.18, pan=-0.3)

# Shape: swells into the lifts, a roll into the end card, a deep note on the final chord
sfx.add(reverse_swell(BEAT * 3, seed=31), at(6) - BEAT * 3, 0.55)
sfx.add(impact(1.8, tone=44, seed=32), at(6), 0.5, reverb=0.4)
sfx.add(riser(BAR * 0.9, seed=33), at(10, 0.4), 0.4, reverb=0.25)
for i in range(8):
    drums.add(snare(seed=260 + i), at(10, 2 + i * 0.25), 0.16 + 0.04 * i, reverb=0.3)
sfx.add(impact(2.4, tone=65, seed=34), at(11), 0.7, reverb=0.45)
for i, (note, beat) in enumerate((('G5', 0), ('C6', 1), ('E6', 2), ('G6', 3))):
    sfx.add(bell(hz(note), 3.2), at(11, beat), 0.24 - 0.02 * i, pan=(-0.3, 0.3, -0.15, 0.15)[i], reverb=0.6)
sfx.add(bell(hz('C6'), 3.5), at(12), 0.2, reverb=0.6)

# Effects from the film's cue sheet
apply_cues(
    sfx, load_cues('c-journey'), ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'], level=0.85,
    # The mood dip, the logo chime and the final ring-out are already in the music above
    skip=lambda c: c['type'] in ('drop', 'logo') or (c['type'] == 'rise' and c['t'] > 34),
    ticks='ping', rises='shimmer',
    hit_gain=lambda c: 0.32,
)

mix = duck(music.render(reverb_seconds=3.0, delay_time=BEAT * 0.75), kicks, depth=0.25, release=0.3) * 0.95 + drums.render(reverb_seconds=1.6) * 0.75 + sfx.render(reverb_seconds=2.6) * 0.8
write_wav(OUT, master(mix, peak_db=-1.0, drive=1.05, fade_in=0.4, fade_out=1.2))
