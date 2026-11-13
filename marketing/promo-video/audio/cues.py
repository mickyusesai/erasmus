"""
Turns a version's cues.json (moments in the film that deserve a sound) into sound effects.

Cue: {"t": seconds, "type": ..., "level": 0–1, "to": end time, "count": n, "note": text}
Types: cut, hit, whoosh, pop, tick, rise, drop, success, logo.
"""
import json
import os

from synth import bell, blip, hz, impact, mallet, pop, reverse_swell, riser, scan, tick, whoosh


def load_cues(folder):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', folder, 'cues.json')
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)['cues']


def apply_cues(sfx, cues, scale, level=1.0, skip=lambda cue: False, ticks='tick', rises='riser', hit_gain=lambda cue: 0.5):
    """
    scale: note names for tuned effects (pops and pings climb through it)
    skip:  function(cue) → True for cues the music already covers
    ticks: 'tick' (dry click) or 'ping' (soft tuned note)
    rises: 'riser' (noise build) or 'shimmer' (soft glassy sweep)
    hit_gain: function(cue) → loudness of a hit before its own level is applied
    """
    step = 0
    last_pop = -10.0
    for i, cue in enumerate(cues):
        kind = cue['type']
        t = float(cue['t'])
        if skip(cue):
            continue
        gain = float(cue.get('level', 1.0)) * level
        pan = float(cue.get('pan', 0.0))
        end = float(cue['to']) if 'to' in cue else None

        if kind == 'cut':
            sfx.add(whoosh(0.3, 500, 2800, seed=300 + i, q=1.1), t - 0.12, 0.2 * gain, pan=pan, reverb=0.1)
        elif kind == 'whoosh':
            length = min(1.6, max(0.3, (end - t) * 1.25)) if end else 0.5
            sfx.add(whoosh(length, 350, 3000, seed=320 + i), t - 0.05, 0.42 * gain, pan=pan, reverb=0.15)
        elif kind == 'hit':
            sfx.add(impact(1.2, tone=float(cue.get('tone', 55)), seed=340 + i), t, hit_gain(cue) * gain, reverb=0.3)
        elif kind == 'drop':
            sfx.add(reverse_swell(0.9, seed=360 + i), t - 0.9, 0.6 * gain)
            sfx.add(impact(1.9, tone=48, seed=361 + i), t, 0.85 * gain, reverb=0.35)
        elif kind == 'rise':
            length = max(0.4, (end or t + 1.5) - t)
            if rises == 'shimmer':
                sfx.add(scan(length), t, 0.55 * gain, pan=pan, reverb=0.45)
            else:
                sfx.add(riser(length, seed=380 + i), t, 0.4 * gain, reverb=0.2)
        elif kind == 'pop':
            # Pops close together climb the scale; after a pause they start again from the bottom
            step = step + 1 if t - last_pop < 0.6 else 0
            last_pop = t
            note = scale[step % len(scale)]
            sfx.add(mallet(hz(note), 0.45, bright=0.6, decay=0.13), t, 0.34 * gain, pan=pan, reverb=0.3)
            sfx.add(pop(480 + 40 * (step % 6)), t, 0.22 * gain, pan=pan)
        elif kind == 'tick':
            count = int(cue.get('count', 1))
            for k in range(count):
                when = t + (end - t) * k / max(1, count - 1) if (end and count > 1) else t
                if ticks == 'ping':
                    note = scale[(step + k) % len(scale)]
                    sfx.add(mallet(hz(note) * 2, 0.4, bright=0.5, decay=0.11), when, 0.2 * gain, pan=pan, reverb=0.4)
                else:
                    sfx.add(tick(seed=400 + i + k, tone=2000 + 60 * (k % 12)), when, 0.4 * gain, pan=pan, reverb=0.05)
            if ticks == 'ping':
                step += 1
        elif kind == 'success':
            sfx.add(blip(hz(scale[2 % len(scale)]), hz(scale[-1])), t, 0.42 * gain, pan=pan, reverb=0.25)
            sfx.add(bell(hz(scale[-1]), 1.6), t + 0.07, 0.22 * gain, pan=pan, reverb=0.45)
        elif kind == 'logo':
            for k, note in enumerate((scale[0], scale[2 % len(scale)], scale[-1])):
                sfx.add(bell(hz(note), 2.6), t + k * 0.015, 0.26 * gain, pan=(-0.2, 0.2, 0.0)[k], reverb=0.55)
