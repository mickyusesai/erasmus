"""
A small synthesiser for the promo soundtracks: instruments, sound effects, a mixer and
mastering. Everything is generated with numpy/scipy, so the music is original and free to use.

Sounds are mono float arrays at 48 kHz; Mix places them on a stereo timeline.
"""
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
TAU = 2 * np.pi

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(name):
    """'A4' → 440.0, also accepts MIDI numbers"""
    if isinstance(name, (int, float)):
        return 440.0 * 2 ** ((name - 69) / 12)
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + (octave + 1) * 12 - 69) / 12)


def midi(name):
    pitch, octave = name[:-1], int(name[-1])
    return NOTE[pitch] + (octave + 1) * 12


def n_samples(seconds):
    return max(1, int(round(seconds * SR)))


def t_axis(seconds):
    return np.arange(n_samples(seconds)) / SR


def rng(seed):
    return np.random.default_rng(seed)


# ───────────────────────────── Envelopes and filters ─────────────────────────────
def adsr(seconds, a=0.005, d=0.1, s=0.7, r=0.1):
    n = n_samples(seconds)
    env = np.full(n, s, dtype=np.float64)
    na, nd, nr = n_samples(a), n_samples(d), n_samples(r)
    na = min(na, n)
    env[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    if nd > 0:
        env[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    nr = min(nr, n)
    env[-nr:] *= np.linspace(1, 0, nr)
    return env


def fade(x, a=0.003, r=0.01):
    x = x.copy()
    na, nr = min(len(x), n_samples(a)), min(len(x), n_samples(r))
    x[:na] *= np.linspace(0, 1, na)
    x[-nr:] *= np.linspace(1, 0, nr)
    return x


def lowpass(x, cutoff, order=2):
    sos = signal.butter(order, min(cutoff, SR * 0.45), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def highpass(x, cutoff, order=2):
    sos = signal.butter(order, cutoff, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def sweep_filter(x, f_start, f_end, q=1.2, kind='band', curve=1.0):
    """A filter whose frequency glides over the sound (state-variable filter, per sample)"""
    n = len(x)
    pos = np.linspace(0, 1, n) ** curve
    freqs = f_start * (f_end / f_start) ** pos
    f = 2 * np.sin(np.pi * np.minimum(freqs, SR / 6.5) / SR)
    damp = 1.0 / q
    low = band = 0.0
    out = np.empty(n)
    for i in range(n):
        low += f[i] * band
        high = x[i] - low - damp * band
        band += f[i] * high
        out[i] = band if kind == 'band' else low if kind == 'low' else high
    return out


def saw(freq, seconds, phase=0.0):
    """Band-limited sawtooth (sum of harmonics below 9 kHz)"""
    t = t_axis(seconds)
    out = np.zeros(len(t))
    k = 1
    while k * freq < 9000 and k <= 60:
        out += np.sin(TAU * freq * k * t + phase * k) / k
        k += 1
    return out * (2 / np.pi)


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


# ───────────────────────────── Instruments ─────────────────────────────
def mallet(freq, seconds=0.9, bright=1.0, decay=0.32):
    """Marimba/kalimba-like pluck (FM): warm, exact pitch"""
    t = t_axis(seconds)
    index = 2.2 * bright * np.exp(-t / 0.045)
    body = np.sin(TAU * freq * t + index * np.sin(TAU * freq * 4.0 * t))
    sub = 0.35 * np.sin(TAU * freq * 0.5 * t) * np.exp(-t / (decay * 0.8))
    env = np.exp(-t / decay)
    return fade((body * env + sub) * 0.6, 0.002, 0.03)


def epiano(freq, seconds=1.2, vel=1.0):
    """Soft electric piano (FM with a short bell-like tine)"""
    t = t_axis(seconds)
    index = (1.1 * vel) * (0.25 + 0.75 * np.exp(-t / 0.35))
    body = np.sin(TAU * freq * t + index * np.sin(TAU * freq * t))
    tine = 0.22 * vel * np.sin(TAU * freq * t + 0.8 * np.sin(TAU * freq * 14 * t)) * np.exp(-t / 0.09)
    env = adsr(seconds, 0.004, 0.5, 0.45, min(0.35, seconds * 0.4)) * np.exp(-t / 2.2)
    return (body + tine) * env * 0.45


def pad(freq, seconds, cutoff=1800, detune=7.0, attack=0.35, release=0.7):
    """Warm string-like pad: three slightly detuned saws through a low-pass. Returns stereo."""
    voices = []
    for cents, pan in ((-detune, -0.6), (0.0, 0.0), (detune, 0.6)):
        f = freq * 2 ** (cents / 1200)
        voices.append((saw(f, seconds, phase=pan * 2.0), pan))
    env = adsr(seconds, attack, 0.2, 0.9, release)
    left = sum(v * (1 - max(0, p)) for v, p in voices)
    right = sum(v * (1 + min(0, p)) for v, p in voices)
    out = np.stack([left, right], axis=1) * env[:, None] * 0.16
    return lowpass(out, cutoff, 2)


def bass(freq, seconds, cutoff=420, punch=1.0):
    """Round bass: sine with a little filtered saw for definition"""
    t = t_axis(seconds)
    env = adsr(seconds, 0.004, 0.12, 0.75, min(0.08, seconds * 0.3))
    tone = np.sin(TAU * freq * t) + 0.35 * lowpass(saw(freq, seconds), cutoff * (1 + punch), 2)
    return tone * env * 0.5


def pluck_bass(freq, seconds, cutoff=900):
    """Short plucked bass for dance grooves"""
    t = t_axis(seconds)
    raw = saw(freq, seconds) * 0.6 + np.sin(TAU * freq * t)
    env = np.exp(-t / (seconds * 0.45))
    return fade(lowpass(raw, cutoff, 2) * env * 0.5, 0.003, 0.02)


def stab(freqs, seconds=0.35, cutoff=3200):
    """Chord stab: saws through a closing filter. Returns mono."""
    t = t_axis(seconds)
    raw = sum(saw(f, seconds, phase=i) for i, f in enumerate(freqs)) / max(1, len(freqs))
    env = np.exp(-t / (seconds * 0.4))
    return fade(lowpass(raw, cutoff, 2) * env * 0.5, 0.003, 0.03)


def bell(freq, seconds=2.2, bright=1.0):
    """Glassy chime (a few inharmonic partials with their own decays)"""
    t = t_axis(seconds)
    out = np.zeros(len(t))
    for ratio, amp, decay in ((1.0, 1.0, 0.9), (2.0, 0.5, 0.6), (3.01, 0.28 * bright, 0.4), (4.2, 0.16 * bright, 0.25), (5.4, 0.08 * bright, 0.16)):
        out += amp * np.sin(TAU * freq * ratio * t) * np.exp(-t / (decay * seconds / 2.2))
    return fade(out * 0.28, 0.002, 0.05)


# ───────────────────────────── Drums ─────────────────────────────
def kick(seconds=0.42, f_hi=150, f_lo=46, punch=0.03, decay=0.16, click=0.4):
    t = t_axis(seconds)
    freq = f_lo + (f_hi - f_lo) * np.exp(-t / punch)
    phase = TAU * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t / decay)
    noise = highpass(rng(1).standard_normal(len(t)), 2500) * np.exp(-t / 0.004) * click * 0.3
    return fade(soft_clip(body * 1.4 + noise, 1.2) * 0.9, 0.0005, 0.02)


def clap(seconds=0.3, seed=2):
    r = rng(seed)
    n = n_samples(seconds)
    t = np.arange(n) / SR
    noise = bandpass(r.standard_normal(n), 900, 4200, 2)
    env = np.zeros(n)
    for delay in (0.0, 0.011, 0.023):
        start = n_samples(delay)
        env[start:] += np.exp(-t[:n - start] / 0.008)
    env += 0.5 * np.exp(-t / 0.07) * (t > 0.03)
    return fade(noise * env * 0.3, 0.0005, 0.02)


def snare(seconds=0.25, seed=3):
    r = rng(seed)
    t = t_axis(seconds)
    noise = bandpass(r.standard_normal(len(t)), 300, 7000, 2) * np.exp(-t / 0.07)
    tone = np.sin(TAU * 190 * t) * np.exp(-t / 0.05)
    return fade((noise * 0.4 + tone * 0.5) * 0.7, 0.0005, 0.02)


def hat(seconds=0.06, seed=4, open_=False):
    r = rng(seed)
    t = t_axis(0.3 if open_ else seconds)
    noise = highpass(r.standard_normal(len(t)), 7500, 2)
    return fade(noise * np.exp(-t / (0.09 if open_ else 0.018)) * 0.16, 0.0005, 0.01)


def shaker(seconds=0.09, seed=5):
    r = rng(seed)
    t = t_axis(seconds)
    noise = bandpass(r.standard_normal(len(t)), 4500, 10000, 2)
    env = np.minimum(t / 0.012, 1) * np.exp(-t / 0.03)
    return noise * env * 0.12


# ───────────────────────────── Sound effects ─────────────────────────────
def whoosh(seconds=0.5, f_start=500, f_end=3500, seed=10, q=1.0):
    """Airy pass-by: filtered noise that swells and fades"""
    r = rng(seed)
    n = n_samples(seconds)
    noise = r.standard_normal(n)
    out = sweep_filter(noise, f_start, f_end, q=q)
    pos = np.linspace(0, 1, n)
    env = np.sin(np.pi * pos) ** 1.6
    return out * env * 0.3


def riser(seconds=1.5, seed=11):
    r = rng(seed)
    n = n_samples(seconds)
    pos = np.linspace(0, 1, n)
    noise = sweep_filter(r.standard_normal(n), 300, 7000, q=1.4, curve=1.6)
    tone = np.sin(TAU * np.cumsum(180 * 2 ** (pos * 2.0)) / SR) * 0.25
    return fade((noise * 0.35 + tone) * pos ** 2 * 0.5, 0.01, 0.015)


def reverse_swell(seconds=0.8, seed=12):
    """A cymbal-like swell that grows into a cut"""
    r = rng(seed)
    n = n_samples(seconds)
    pos = np.linspace(0, 1, n)
    noise = highpass(r.standard_normal(n), 2500, 2)
    return fade(noise * pos ** 3 * 0.22, 0.01, 0.004)


def impact(seconds=1.4, seed=13, tone=52):
    """Deep thump with a short noise burst"""
    r = rng(seed)
    t = t_axis(seconds)
    freq = tone * 0.7 + tone * 1.6 * np.exp(-t / 0.05)
    body = np.sin(TAU * np.cumsum(freq) / SR) * np.exp(-t / 0.35)
    noise = lowpass(r.standard_normal(len(t)), 1800, 2) * np.exp(-t / 0.09) * 0.35
    return fade(soft_clip(body * 1.2 + noise, 1.3) * 0.8, 0.001, 0.05)


def pop(freq=600, seconds=0.12):
    """Soft bubble pop: a short tone that drops in pitch"""
    t = t_axis(seconds)
    f = freq * (1 + 0.8 * np.exp(-t / 0.012))
    return fade(np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.035) * 0.5, 0.001, 0.02)


def blip(f1=880, f2=1320, gap=0.07, seconds=0.28):
    """Two-note message sound"""
    out = np.zeros(n_samples(seconds))
    for i, f in enumerate((f1, f2)):
        tone = mallet(f, seconds - i * gap, bright=0.6, decay=0.09)
        out[n_samples(i * gap):n_samples(i * gap) + len(tone)] += tone[:len(out) - n_samples(i * gap)]
    return out * 0.7


def tick(seed=20, tone=2400):
    r = rng(seed)
    t = t_axis(0.03)
    noise = highpass(r.standard_normal(len(t)), 3000) * np.exp(-t / 0.002)
    return fade((noise * 0.25 + np.sin(TAU * tone * t) * np.exp(-t / 0.006) * 0.3) * 0.5, 0.0003, 0.005)


def click(seed=21):
    """Mouse click: two tiny ticks"""
    out = np.zeros(n_samples(0.09))
    a, b = tick(seed, 1800), tick(seed + 1, 2600) * 0.7
    out[:len(a)] += a
    start = n_samples(0.05)
    out[start:start + len(b)] += b
    return out


def paper(seed=30, weight=1.0):
    """A sheet of paper landing: a short rustle and a soft thud"""
    r = rng(seed)
    t = t_axis(0.16)
    lo = r.uniform(1200, 2200)
    rustle = bandpass(r.standard_normal(len(t)), lo, lo * 3.2, 2) * np.exp(-t / r.uniform(0.018, 0.035))
    thud = np.sin(TAU * r.uniform(90, 130) * t) * np.exp(-t / 0.03) * 0.5 * weight
    return fade((rustle * 0.3 + thud) * 0.5, 0.001, 0.02)


def flutter(seconds=0.22, seed=40):
    """One wing beat / a sheet turning over"""
    r = rng(seed)
    n = n_samples(seconds)
    out = sweep_filter(r.standard_normal(n), 700, 2600, q=0.9)
    pos = np.linspace(0, 1, n)
    return out * np.sin(np.pi * pos) ** 2 * 0.3


def scan(seconds=1.0):
    """A reading beam: a soft rising shimmer"""
    t = t_axis(seconds)
    pos = t / seconds
    out = np.zeros(len(t))
    for i, base in enumerate((660, 990, 1320)):
        f = base * 2 ** (pos * 0.5)
        out += np.sin(TAU * np.cumsum(f) / SR + i) * (0.5 + 0.5 * np.sin(TAU * (9 + i * 2) * t)) / (i + 1)
    return fade(out * np.sin(np.pi * pos) ** 1.2 * 0.12, 0.02, 0.05)


def counter(seconds=0.8, rate=28, seed=50):
    """Fast soft ticks for a number counting up; slows down at the end"""
    out = np.zeros(n_samples(seconds))
    time = 0.0
    i = 0
    while time < seconds - 0.03:
        tk = tick(seed + i, 1700 + 500 * (time / seconds)) * (0.5 + 0.5 * time / seconds)
        start = n_samples(time)
        out[start:start + len(tk)] += tk[:len(out) - start]
        time += (1 / rate) * (1 + 1.5 * (time / seconds) ** 2)
        i += 1
    return out


# ───────────────────────────── Mixer ─────────────────────────────
class Mix:
    """A stereo timeline. add() places a sound at a time with gain, pan and effect sends."""

    def __init__(self, seconds):
        self.n = n_samples(seconds)
        self.dry = np.zeros((self.n, 2))
        self.rev = np.zeros((self.n, 2))  # reverb send
        self.dly = np.zeros((self.n, 2))  # delay send

    def add(self, sound, at, gain=1.0, pan=0.0, reverb=0.0, delay=0.0):
        if at < 0:
            sound = sound[n_samples(-at):]
            at = 0
        start = int(round(at * SR))
        if start >= self.n or len(sound) == 0:
            return
        if sound.ndim == 1:
            left = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
            right = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
            sound = np.stack([sound * left, sound * right], axis=1)
        sound = sound[: self.n - start] * gain
        self.dry[start:start + len(sound)] += sound
        if reverb:
            self.rev[start:start + len(sound)] += sound * reverb
        if delay:
            self.dly[start:start + len(sound)] += sound * delay

    def render(self, reverb_seconds=2.2, reverb_tone=5200, delay_time=0.375, delay_feedback=0.38):
        out = self.dry.copy()
        # Reverb: convolution with a decaying noise burst (a smooth synthetic room)
        r = rng(99)
        n_ir = n_samples(reverb_seconds)
        t = np.arange(n_ir) / SR
        ir = r.standard_normal((n_ir, 2)) * np.exp(-t / (reverb_seconds / 6.5))[:, None]
        ir[: n_samples(0.012)] *= 0.2  # a short gap before the room answers
        ir = lowpass(highpass(ir, 220), reverb_tone)
        ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
        for ch in range(2):
            wet = signal.fftconvolve(self.rev[:, ch], ir[:, ch])[: self.n]
            out[:, ch] += wet * 0.5
        # Echo
        if np.any(self.dly):
            d = n_samples(delay_time)
            echo = np.zeros((self.n, 2))
            src = lowpass(highpass(self.dly, 300), 4200)
            level = 1.0
            for k in range(1, 6):
                if k * d >= self.n:
                    break
                level *= delay_feedback if k > 1 else 1.0
                shifted = src[: self.n - k * d] * level
                # Echoes bounce between left and right
                echo[k * d:, 0] += shifted[:, 0] * (0.9 if k % 2 else 0.4)
                echo[k * d:, 1] += shifted[:, 1] * (0.4 if k % 2 else 0.9)
            out += echo * 0.5
        return out


def duck(track, times, depth=0.5, attack=0.004, release=0.22):
    """Pump: lower a track briefly at each kick so the kick stays clear"""
    env = np.ones(len(track))
    rel = n_samples(release)
    att = n_samples(attack)
    shape = np.concatenate([np.linspace(1, 1 - depth, att), 1 - depth * (1 - np.linspace(0, 1, rel) ** 0.7)])
    for time in times:
        start = int(round(time * SR))
        if start >= len(env):
            continue
        seg = shape[: len(env) - start]
        env[start:start + len(seg)] = np.minimum(env[start:start + len(seg)], seg)
    return track * env[:, None]


def master(stereo, peak_db=-1.0, drive=1.15, fade_out=0.0, fade_in=0.0):
    """Clean up the lows, glue with gentle saturation, set the peak level"""
    out = highpass(stereo, 28, 2)
    out = out / (np.max(np.abs(out)) + 1e-9)
    out = soft_clip(out * drive, 1.0)
    if fade_in:
        n = n_samples(fade_in)
        out[:n] *= np.linspace(0, 1, n)[:, None]
    if fade_out:
        n = n_samples(fade_out)
        out[-n:] *= (np.linspace(1, 0, n) ** 1.5)[:, None]
    out = out / (np.max(np.abs(out)) + 1e-9) * 10 ** (peak_db / 20)
    return out


def write_wav(path, stereo):
    wavfile.write(path, SR, (np.clip(stereo, -1, 1) * 32767).astype(np.int16))
    print(f'{path}: {len(stereo) / SR:.2f}s, peak {20 * np.log10(np.max(np.abs(stereo)) + 1e-9):.1f} dBFS, '
          f'rms {20 * np.log10(np.sqrt(np.mean(stereo ** 2)) + 1e-9):.1f} dBFS')
