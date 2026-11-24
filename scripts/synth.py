#!/usr/bin/env python3
"""ElevenLabs 커넥터가 없을 때 배경음악과 효과음을 코드로 합성한다. 내레이션은 만들지 않는다.

사용:
  python3 scripts/synth.py list
  python3 scripts/synth.py sfx   videos/<id> [종류 ...] [--len 초]
  python3 scripts/synth.py music videos/<id> --mood <분위기> --peak 초 [--bpm N] [--end 초]

sfx   · assets/sfx/<종류>.wav 를 만든다. 종류를 빼면 전부 만든다. --len 은 whoosh·riser 의 길이다
music · assets/bgm/synth_<분위기>.wav 를 영상 길이에 맞춰 만든다.
        마디 격자가 --peak 를 지나도록 놓으므로 정점 장면의 시작이 마디 첫 박에 닿는다.
        도입(악기 1~2개) → 고조(정점 4마디 앞부터 베이스·하이햇·riser) → 정점(킥·클랩) → 종결 화음(--end, 기본 영상 끝 2.5초 앞).
        video.json 의 audio.music 과 beats, src/beats.js 를 쓴다. 박을 직접 정했으므로 audio-probe.py --onsets 로 잴 필요가 없다.
같은 인자에는 항상 같은 파일이 나온다(난수 씨앗 고정). numpy 가 필요하다.
"""
import json, os, sys, wave
import numpy as np

SR = 48000

def args_of(flag, default=None, cast=str):
    return cast(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default

def tl(sec):
    return np.arange(int(sec * SR)) / SR

def rng(seed):
    return np.random.default_rng(seed)

def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x * (peak / m)

def save(path, x):
    x = np.atleast_2d(x)
    if x.shape[0] in (1, 2) and x.shape[0] < x.shape[1]:
        x = x.T
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(pcm.shape[1]); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def band_noise(n, lo, hi, seed, tilt=0.0):
    # 주파수 영역에서 lo~hi Hz 만 남긴 잡음. tilt 가 양수면 고역이 약해진다
    spec = np.fft.rfft(rng(seed).standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    g = ((f >= lo) & (f <= hi)).astype(float)
    g *= 1 / np.maximum(f, 20) ** tilt
    return norm(np.fft.irfft(spec * g, n), 1.0)

def sweep_noise(n, f_from, f_to, width, seed):
    # 대역이 f_from → f_to 로 옮겨 가는 잡음 (whoosh·riser). 20ms 블록마다 대역을 바꾸고 겹쳐 더한다
    src = rng(seed).standard_normal(n + 2048)
    blk, hop = 2048, 1024
    out = np.zeros(n + 2048)
    win = np.hanning(blk)
    f = np.fft.rfftfreq(blk, 1 / SR)
    for i in range(0, n, hop):
        c = f_from * (f_to / f_from) ** (i / max(1, n))
        g = np.exp(-0.5 * (np.log2(np.maximum(f, 1) / c) / width) ** 2)
        out[i:i + blk] += np.fft.irfft(np.fft.rfft(src[i:i + blk] * win) * g, blk) * win
    return norm(out[:n], 1.0)

def additive(freq, sec, harmonics, falloff=1.0, detune=0.0, phase_seed=0):
    # 배음을 더해 만든 파형. falloff 1 은 톱니, 2 는 부드러운 톱니에 가깝다. 표본화 한계 위 배음은 넣지 않는다
    t = tl(sec)
    ph = rng(phase_seed).random(harmonics) * 2 * np.pi
    x = np.zeros_like(t)
    f0 = freq * (1 + detune)
    for k in range(1, harmonics + 1):
        if k * f0 >= SR / 2 - 1000:
            break
        x += np.sin(2 * np.pi * k * f0 * t + ph[k - 1]) / k ** falloff
    return x

def env(sec, a=0.005, d=0.2, s=0.0, r=0.05, hold=None):
    # a·d·s·r 엔벨로프. hold 가 있으면 그 시각에 놓는다(r 동안 줄어든다)
    t = tl(sec)
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    if hold is not None:
        e *= np.clip(1 - (t - hold) / max(r, 1e-6), 0, 1)
    return e

def reverb(x, sec=1.6, seed=7):
    # 지수로 줄어드는 잡음을 충격 응답으로 쓰는 단순한 잔향. 왼쪽·오른쪽 씨앗을 달리해 넓게 들린다
    t = tl(sec)
    ir = rng(seed).standard_normal(len(t)) * np.exp(-t / (sec / 6.9))
    ir[:int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    n = len(x) + len(ir)
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]

def midi(m):
    return 440 * 2 ** ((m - 69) / 12)

# ── 효과음 ──────────────────────────────────────────────

def sfx_click(_):
    t = tl(0.08)
    x = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006) + 0.6 * band_noise(len(t), 2000, 9000, 1) * np.exp(-t / 0.003)
    return norm(x, 0.9)

def sfx_tick(_):
    t = tl(0.05)
    return norm(np.sin(2 * np.pi * 3600 * t) * np.exp(-t / 0.004), 0.8)

def sfx_pop(_):
    t = tl(0.18)
    f = 300 + 900 * np.exp(-t / 0.02)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05) * np.minimum(1, t / 0.002), 0.9)

def sfx_whoosh(sec):
    sec = sec or 0.6
    n = int(sec * SR); t = tl(sec)
    shape = np.where(t / sec < 0.62, np.sin(np.pi * (t / sec) / 1.24) ** 2, np.cos(np.pi * (t / sec - 0.62) / 0.76) ** 2)
    return norm(sweep_noise(n, 500, 3200, 0.7, 2) * shape, 0.9)

def sfx_riser(sec):
    sec = sec or 1.5
    n = int(sec * SR); t = tl(sec)
    rise = (t / sec) ** 2.5
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / sec)) / SR)
    x = sweep_noise(n, 300, 6000, 0.8, 3) * 0.8 + 0.35 * tone
    x *= rise * np.clip((sec - t) / 0.01, 0, 1)
    return norm(x, 0.85)

def sfx_impact(_):
    t = tl(1.6)
    f = 48 + 70 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
    hit = band_noise(len(t), 80, 4000, 4, tilt=0.5) * np.exp(-t / 0.04)
    return norm(body + 0.5 * hit, 0.95)

def sfx_shimmer(_):
    t = tl(1.4); x = np.zeros_like(t)
    for i, m in enumerate([84, 88, 91, 96, 100]):
        st = i * 0.06; n0 = int(st * SR)
        seg = np.arange(len(t) - n0) / SR
        x[n0:] += np.sin(2 * np.pi * midi(m) * seg) * np.exp(-seg / 0.35) * 0.4 + np.sin(2 * np.pi * midi(m) * 2.76 * seg) * np.exp(-seg / 0.12) * 0.15
    return norm(reverb(x, 1.2, 5) * 0.6 + x, 0.8)

def sfx_blip(_):
    t = tl(0.14)
    f = np.where(t < 0.05, midi(76), midi(83))
    return norm(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 * np.clip((0.14 - t) / 0.02, 0, 1), 0.7)

def sfx_paper(_):
    t = tl(0.35)
    grain = (rng(6).random(len(t)) < 0.004).astype(float)
    grain = np.convolve(grain, np.exp(-np.arange(200) / 30), 'same')
    x = band_noise(len(t), 1500, 9000, 6) * (0.3 + grain) * np.sin(np.pi * t / 0.35) ** 0.8
    return norm(x, 0.8)

def sfx_key(_):
    t = tl(0.09)
    x = band_noise(len(t), 1200, 7000, 8) * np.exp(-t / 0.008) + 0.5 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.015)
    return norm(x, 0.85)

SFX = {
    'click': (sfx_click, 'UI 클릭·등장 (0.08초)'),
    'tick': (sfx_tick, '짧은 틱·숫자 바뀜 (0.05초)'),
    'pop': (sfx_pop, '말랑한 팝·튀어나옴 (0.18초)'),
    'whoosh': (sfx_whoosh, '전환 휙 (--len, 기본 0.6초)'),
    'riser': (sfx_riser, '타격 앞에서 차오름 (--len, 기본 1.5초 · 끝이 타격)'),
    'impact': (sfx_impact, '낮은 붐·정점 타격 (1.6초)'),
    'shimmer': (sfx_shimmer, '반짝임·입자 (1.4초)'),
    'blip': (sfx_blip, '8비트 효과음 (0.14초)'),
    'paper': (sfx_paper, '종이·연필 (0.35초)'),
    'key': (sfx_key, '키보드 타건 (0.09초)'),
}

# ── 음악 ───────────────────────────────────────────────
# prog 의 각 칸은 (근음, 화음) 한 마디다. 화음은 근음 위 반음 수. key 는 근음 MIDI 번호다
MOODS = {
    'calm': dict(bpm=92, key=60, prog=[(0, (0, 4, 7, 11)), (9, (0, 3, 7, 10)), (5, (0, 4, 7, 11)), (7, (0, 4, 7, 9))],
                 lead='marimba', arp=8, pad=0.5, bass=0.55, kick=0.6, clap=0.0, hat=0.25, desc='에디토리얼·미니멀 UI·인포그래픽·블루프린트·단면도 · 펠트 피아노·마림바·패드'),
    'tech': dict(bpm=120, key=57, prog=[(0, (0, 3, 7)), (8, (0, 4, 7)), (3, (0, 4, 7)), (10, (0, 4, 7))],
                 lead='saw', arp=16, pad=0.35, bass=0.8, kick=1.0, clap=0.6, hat=0.35, desc='키네틱 타이포·HUD·다크 네온·사이버펑크·ASCII · 톱니 아르페지오·신스 베이스·드럼머신'),
    'bright': dict(bpm=112, key=55, prog=[(0, (0, 4, 7)), (7, (0, 4, 7)), (9, (0, 3, 7)), (5, (0, 4, 7))],
                   lead='glock', arp=8, pad=0.3, bass=0.65, kick=0.8, clap=0.55, hat=0.3, desc='손그림·클레이·카툰·스톱모션·복셀·화이트보드 · 글로켄슈필·통통 튀는 베이스·셰이커'),
    'cinematic': dict(bpm=72, key=50, prog=[(0, (0, 3, 7)), (8, (0, 4, 7)), (3, (0, 4, 7)), (10, (0, 4, 7))],
                      lead='brass', arp=0, pad=0.7, bass=0.8, kick=0.0, clap=0.0, hat=0.0, desc='시네마틱 3D·파티클·글래스모픽·애니 · 드론·저음 브라스·팀파니'),
    'chip': dict(bpm=132, key=60, prog=[(0, (0, 4, 7)), (9, (0, 3, 7)), (5, (0, 4, 7)), (7, (0, 4, 7))],
                 lead='pulse', arp=16, pad=0.0, bass=0.6, kick=0.7, clap=0.5, hat=0.3, desc='픽셀 · 펄스파·삼각파 베이스·노이즈 드럼'),
}

def note(kind, freq, sec, seed=0):
    t = tl(sec)
    if kind == 'marimba':
        return (np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 3.93 * t) * np.exp(-t / 0.05)) * np.exp(-t / 0.35) * np.minimum(1, t / 0.002)
    if kind == 'glock':
        return (np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.6) + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / 0.15)
                + 0.12 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.06)) * np.minimum(1, t / 0.001)
    if kind == 'saw':
        return additive(freq, sec, 14, 1.3, phase_seed=seed) * env(sec, 0.003, 0.12, 0.15, 0.04, hold=sec - 0.04)
    if kind == 'pulse':
        x = np.where((t * freq) % 1 < 0.25, 1.0, -1.0) * 0.5
        return x * np.clip((sec - t) / 0.01, 0, 1)
    if kind == 'brass':
        return additive(freq, sec, 10, 1.6, phase_seed=seed) * env(sec, 0.35, 1.0, 0.7, 0.6, hold=sec - 0.6)
    if kind == 'pluckbass':
        return (np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(4 * np.pi * freq * t)) * np.exp(-t / 0.18) * np.minimum(1, t / 0.003)
    if kind == 'sub':
        return (np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(4 * np.pi * freq * t)) * env(sec, 0.005, 0.3, 0.6, 0.05, hold=sec - 0.05)
    if kind == 'tri':
        return (2 * np.abs(2 * ((t * freq) % 1) - 1) - 1) * 0.6 * np.clip((sec - t) / 0.01, 0, 1)
    raise ValueError(kind)

def pad(freqs, sec, seed):
    x = np.zeros(int(sec * SR))
    for i, f in enumerate(freqs):
        for d in (-0.004, 0.004):
            x += additive(f, sec, 8, 1.8, d, seed + i)
    return x * env(sec, min(0.8, sec / 3), 10, 1, min(0.8, sec / 3), hold=sec - min(0.8, sec / 3)) / (len(freqs) * 2)

def kick(seed=0):
    t = tl(0.45)
    f = 45 + 110 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + 0.3 * band_noise(len(t), 1000, 6000, seed) * np.exp(-t / 0.004)

def clap(seed=0):
    t = tl(0.3); x = np.zeros_like(t)
    for i, d in enumerate((0, 0.011, 0.022)):
        n0 = int(d * SR); seg = t[:len(t) - n0]
        x[n0:] += band_noise(len(seg), 800, 5000, seed + i) * np.exp(-seg / (0.01 if i < 2 else 0.09))
    return x * 0.6

def hat(seed=0):
    t = tl(0.06)
    return band_noise(len(t), 7000, 16000, seed) * np.exp(-t / 0.014) * 0.35

def timpani(seed=0):
    t = tl(1.8)
    f = 55 + 25 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7) + 0.25 * band_noise(len(t), 60, 1500, seed, 0.6) * np.exp(-t / 0.06)

def music(vdir, mood, peak, bpm=None, end=None):
    cfg_path = os.path.join(vdir, 'video.json')
    cfg = json.load(open(cfg_path))
    dur = float(cfg['duration'])
    M = MOODS[mood]
    bpm = bpm or M['bpm']
    beat = 60 / bpm; bar = 4 * beat
    if not 0 < peak < dur:
        sys.exit(f'--peak 는 0 과 영상 길이 {dur}초 사이여야 한다')
    t0 = peak % bar  # 마디 격자가 peak 를 지나게 하는 첫 마디 첫 박
    grid = [t0 + k * bar for k in range(int((dur - t0) / bar) + 1)]
    end = end if end is not None else dur - 2.5
    endt = min((g for g in grid if g > peak), key=lambda g: abs(g - end), default=None)
    if endt is None or endt <= peak:
        sys.exit(f'정점 {peak}초 뒤에 종결 화음을 둘 마디가 없다. --peak 를 당기거나 영상을 늘린다')
    build = max(t0, peak - 4 * bar)

    n = int(dur * SR) + SR * 3
    mel = np.zeros(n); dry = np.zeros(n)
    onsets = []
    def put(buf, x, at, gain=1.0):
        i = int(round(at * SR))
        if i >= n or i + len(x) <= 0: return
        if i < 0: x, i = x[-i:], 0
        x = x[:n - i]; buf[i:i + len(x)] += x * gain

    sec_gain = lambda g: 0.65 if g < build else (0.75 if g < peak else 1.0)
    key = M['key']
    starts = ([0.0] if t0 > 0.05 else []) + [g for g in grid if g < endt]
    for bi, g in enumerate(starts):
        k = round((g - t0) / bar)  # 격자 번호 (첫 박 앞의 짧은 마디는 -1 에 해당)
        root, chord = M['prog'][k % len(M['prog'])]
        length = (t0 if g == 0.0 and t0 > 0.05 else bar)
        sg = sec_gain(g)
        sec = 'intro' if g < build else ('build' if g < peak else 'peak')
        chord_f = [midi(key - 12 + root + c) for c in chord] if root < 6 else [midi(key - 24 + root + c) for c in chord]
        if M['pad']:
            put(mel, pad(chord_f, length + 0.4, k + 11), g, M['pad'] * sg)
        if mood == 'cinematic':
            put(mel, (np.sin(2 * np.pi * midi(key - 24 + root) * tl(length + 0.5)) * env(length + 0.5, 0.6, 10, 1, 0.6, hold=length - 0.1)), g, 0.5 * sg)
        if g == 0.0 and t0 > 0.05:
            continue  # 첫 박 앞 짧은 마디는 패드만
        onsets.append([round(g, 3), 0.6 * sg])
        # 리드 · 도입은 박마다 한 음, 고조·정점은 arp 단위로 화음 음을 돈다
        if M['arp']:
            steps = 4 if sec == 'intro' else M['arp']
            tones = [key + root + c for c in chord] + [key + 12 + root + chord[0]]
            pat = [0, 1, 2, 3, 2, 1, 3, 4] if len(tones) > 4 else [0, 1, 2, 3, 2, 1, 2, 3]
            for s in range(steps):
                at = g + s * bar / steps
                m = tones[pat[s % len(pat)] % len(tones)]
                put(mel, note(M['lead'], midi(m), min(0.8, bar / steps * 1.6), s), at, (0.32 if M['lead'] in ('saw', 'pulse') else 0.45) * sg)
                if steps <= 8: onsets.append([round(at, 3), 0.4 * sg])
        elif sec != 'intro':
            for c in chord[:3]:
                put(mel, note('brass', midi(key - 12 + root + c), bar, k), g, 0.22 * sg)
        # 베이스 · 고조부터
        if sec != 'intro' and M['bass']:
            bf = midi(key - 24 + root)
            if mood == 'cinematic':
                put(dry, note('sub', bf / 2 if bf > 50 else bf, bar, 0), g, M['bass'] * sg)
            else:
                kind = 'tri' if mood == 'chip' else ('sub' if mood == 'tech' else 'pluckbass')
                for b8 in range(8):
                    if mood == 'calm' and b8 % 2: continue
                    put(dry, note(kind, bf * (2 if (mood == 'bright' and b8 % 2) else 1), beat / 2 * 0.9, b8), g + b8 * beat / 2, M['bass'] * 0.7)
        # 북 · 하이햇은 고조부터, 킥·클랩은 정점부터 (도입에는 타악기를 넣지 않는다)
        if sec != 'intro' and M['hat']:
            for h in range(8):
                put(dry, hat(k * 8 + h), g + h * beat / 2 + (beat / 4 if mood == 'bright' else 0), M['hat'] * (1.0 if h % 2 else 0.6))
        if sec == 'peak':
            for b in range(4):
                if M['kick'] and (mood != 'calm' or b in (0, 2)):
                    put(dry, kick(b), g + b * beat, M['kick']); onsets.append([round(g + b * beat, 3), 1.0])
                if M['clap'] and b in (1, 3):
                    put(dry, clap(k + b), g + b * beat, M['clap']); onsets.append([round(g + b * beat, 3), 0.8])
            if mood == 'cinematic':
                put(dry, timpani(k), g, 0.9); onsets.append([round(g, 3), 1.0])
    # 고조 끝 · riser 가 정점 첫 박에서 끝나고, 시네마틱은 그 앞 0.4초를 크게 줄인다(바닥 소리는 남긴다)
    if peak - build >= bar:
        r = sfx_riser(bar)
        put(dry, r, peak - len(r) / SR, 0.35)
    if mood == 'cinematic':
        i0, i1 = int((peak - 0.4) * SR), int(peak * SR)
        mel[i0:i1] *= 0.03; dry[i0:i1] *= 0.03
    # 정점 첫 박 강조
    put(dry, kick(99) if mood != 'cinematic' else timpani(99), peak, 0.9)
    # 종결 화음 · 근음 화음 하나가 울리고 잦아든다
    fin = [midi(key - 12 + c) for c in M['prog'][0][1]]
    ring = min(4.0, dur + 1 - endt)
    put(mel, pad(fin, ring, 3) * np.exp(-tl(ring) / (ring / 2.5)), endt, max(M['pad'], 0.4) * 1.2)
    if M['lead'] in ('marimba', 'glock'):
        for i, f in enumerate(fin):
            put(mel, note(M['lead'], f * 2, ring, i), endt + i * 0.03, 0.4)
    put(dry, timpani(5) if mood == 'cinematic' else kick(5), endt, 0.8)
    onsets.append([round(endt, 3), 1.0])

    wet_l, wet_r = reverb(mel, 1.8, 21), reverb(mel, 1.8, 22)
    L = mel + dry + 0.35 * wet_l
    R = mel + dry + 0.35 * wet_r
    out = np.stack([L, R])[:, :int(dur * SR)]
    tail = int(0.6 * SR); out[:, -tail:] *= np.linspace(1, 0, tail)
    out = norm(out, 0.89)  # -1 dBFS
    rel = os.path.join('bgm', f'synth_{mood}.wav')
    save(os.path.join(vdir, 'assets', rel), out)

    kicks = sorted({t for t, v in onsets if v >= 1.0})
    au = cfg.setdefault('audio', {})
    au['music'] = {'file': rel, 'delay': 0, 'gain': [1, 1, 0, 1]}  # 도입·고조·정점의 크기 차이는 합성할 때 넣었다
    cfg['beats'] = {'bpm': bpm, 'onsets': sorted(onsets), 'beat': round(float(bpm), 2),
                    'downbeats': [round(g, 3) for g in grid if g <= dur], 'kicks': kicks}
    json.dump(cfg, open(cfg_path, 'w'), ensure_ascii=False, indent=2)
    os.makedirs(os.path.join(vdir, 'src'), exist_ok=True)
    with open(os.path.join(vdir, 'src', 'beats.js'), 'w') as f:
        f.write('// synth.py music 가 만든 파일. 직접 고치지 않는다\n')
        f.write(f'window.BEATS = {json.dumps(cfg["beats"])};\n')
    print(f'wrote assets/{rel} · {bpm} BPM · 마디 {bar:.3f}초 · 도입 0~{build:.2f} · 고조 {build:.2f}~{peak:.2f} · 정점 {peak:.2f}~{endt:.2f} · 종결 화음 {endt:.2f}')
    print('마디 첫 박 ' + ' '.join(f'{g:.2f}' for g in grid if g <= dur))
    print('→ video.json (audio.music, beats), src/beats.js')

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('list', 'sfx', 'music'):
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == 'list':
        print('효과음 (sfx)')
        for k, (_, d) in SFX.items(): print(f'  {k:8s} {d}')
        print('분위기 (music --mood)')
        for k, m in MOODS.items(): print(f'  {k:10s} {m["bpm"]} BPM · {m["desc"]}')
        return
    vdir = os.path.abspath(sys.argv[2])
    if cmd == 'sfx':
        sec = args_of('--len', None, float)
        rest = sys.argv[3:]
        if '--len' in rest:
            i = rest.index('--len'); rest = rest[:i] + rest[i + 2:]
        names = rest or list(SFX)
        bad = [a for a in names if a not in SFX]
        if bad: sys.exit(f'모르는 효과음: {" ".join(bad)} · python3 scripts/synth.py list')
        for k in names:
            p = os.path.join(vdir, 'assets', 'sfx', f'{k}.wav')
            save(p, SFX[k][0](sec))
            print(f'wrote assets/sfx/{k}.wav')
        return
    mood = args_of('--mood')
    if mood not in MOODS:
        sys.exit(f'--mood 는 {", ".join(MOODS)} 중 하나다')
    peak = args_of('--peak', None, float)
    if peak is None:
        sys.exit('--peak <정점 장면 시작 초> 가 필요하다')
    music(vdir, mood, peak, args_of('--bpm', None, float), args_of('--end', None, float))

if __name__ == '__main__':
    main()
