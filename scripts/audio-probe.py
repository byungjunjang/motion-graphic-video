#!/usr/bin/env python3
"""오디오 파일의 길이, 무음 구간, 음량 곡선을 출력한다. 귀로 들을 수 없을 때 시간표를 짜는 근거로 쓴다.

사용: python3 scripts/audio-probe.py <파일> [--step 0.25] [--silence auto|-dB] [--min-gap 0.15]
      python3 scripts/audio-probe.py <음악 파일> --onsets [--write videos/<id>]
      python3 scripts/audio-probe.py <음악 파일> --fit 2.1,5.4,9.0 --video videos/<id>
      python3 scripts/audio-probe.py <내레이션 파일> --words [--model small]
      python3 scripts/audio-probe.py <효과음 파일> --peak
  내레이션 → 무음 구간으로 문장 경계를 찾는다
  음악     → 음량 곡선으로 도입, 고조 시작, 종결 화음 시각을 찾는다
  음악     → --onsets 로 타격음 시각과 BPM 을 찾는다. --write 를 주면 video.json 의
             music.delay·cut·repeat 으로 영상 시각으로 바꿔 video.json 의 beats 와 src/beats.js 에 쓴다
             downbeats 줄은 마디 첫 박(4/4), hits 줄은 큰 타격의 120Hz 아래 비율과 킥 표시(k)다
  음악     → --fit 으로 전환 시각(영상 시각)이 큰 타격에 가장 많이 닿는 delay 를 찾는다. video.json 은 고치지 않는다
  내레이션 → --words 로 단어마다 시작·끝 시각을 찾는다 (로컬 whisper, 크레딧 없음)
  효과음   → --peak 로 최고점과 첫 타격 시각을 찾는다. video.json sfx 의 4번째 칸(동기점)과 같은 정의다
  영상     → 최종 믹스의 음량이 뒤로 갈수록 커지는지 확인한다
"""
import json, math, os, struct, subprocess, sys

path = sys.argv[1]
opt = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
step, gap = opt('--step', 0.25), opt('--min-gap', 0.15)

dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
print(f'duration {dur}s')

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
s = struct.unpack(f'<{len(raw)//2}h', raw); w = int(8000 * step)
db = lambda c: 20 * math.log10(max(1, math.sqrt(sum(x * x for x in c) / len(c))) / 32768)

# 무음은 20ms 창의 음량(RMS)으로 찾는다. ffmpeg silencedetect 는 순간 진폭을 보므로 숨소리·잡음이 섞인 쉼을 못 잡는다.
# 기준은 파일마다 다르게 잡는다. 창 음량의 하위 10% 를 바닥 소음으로 보고, 바닥보다 4dB 큰 값까지를 무음으로 본다
lv = [db(s[i:i + 160]) for i in range(0, len(s) - 160, 160)]
if '--silence' in sys.argv and sys.argv[sys.argv.index('--silence') + 1] != 'auto':
    sil = float(sys.argv[sys.argv.index('--silence') + 1])
else:
    sil = round(sorted(lv)[int(len(lv) * 0.1)] + 4) if lv else -35
runs, st = [], None
for i, v in enumerate(lv + [0]):
    if v < sil and st is None:
        st = i
    elif v >= sil and st is not None:
        if (i - st) * 0.02 >= gap:
            runs.append((st * 0.02, i * 0.02))
        st = None
print(f'silences (기준 {sil:g}dB, {gap:g}초 이상) ' + ' '.join(f'{a:.2f}-{b:.2f}' for a, b in runs))
print('rms(dB) ' + ' '.join(f'{i*step:g}:{db(s[i*w:(i+1)*w]):.0f}' for i in range(len(s) // w)))

if '--peak' in sys.argv:
    # 효과음을 화면 사건에 맞출 지점. mix.py 의 sfx 4번째 칸("peak"·"onset")과 같은 정의다
    # peak 는 10ms 창 음량을 50ms 로 평균한 곡선이 가장 큰 곳, onset 은 그보다 20dB 작은 소리를 처음 넘는 10ms 창이다
    pw = [sum(x * x for x in s[i:i + 80]) / 80 for i in range(0, len(s) - 79, 80)]
    if not pw:
        sys.exit('파일을 읽지 못했다 (10ms 보다 짧다)')
    sm = [sum(pw[max(0, i - 2):i + 3]) / len(pw[max(0, i - 2):i + 3]) for i in range(len(pw))]
    pk = max(range(len(sm)), key=sm.__getitem__)
    on = next(i for i, p in enumerate(pw) if p >= sm[pk] / 100)
    print(f'peak {pk * 0.01:.2f}s ({10 * math.log10(max(sm[pk], 1) / 32768 ** 2):.0f}dB) · onset {on * 0.01:.2f}s')

if '--onsets' in sys.argv or '--fit' in sys.argv:
    # 스펙트럼 변화량(spectral flux)의 봉우리를 타격음으로 본다. 봉우리 세기는 0~1 로 맞춘다
    import numpy as np
    SR, HOP, N = 22050, 256, 1024
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    frames = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * np.hanning(N)
    mag = np.log1p(100 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.r_[0, np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)]
    flux /= flux.max() or 1
    fps = SR / HOP
    win = int(0.25 * fps)
    if len(flux) < 2 * win + 1:  # 바탕선(앞뒤 0.25초 평균)을 잴 수 없을 만큼 짧으면 타격음도 BPM 도 믿을 수 없다
        sys.exit(f'소리가 너무 짧아 박자를 잴 수 없다 ({math.ceil((2 * win * HOP + N) / SR * 100) / 100:.2f}초 이상이어야 한다)')
    base = np.convolve(flux, np.ones(2 * win + 1) / (2 * win + 1), mode='same')
    gap, onsets, last = int(0.1 * fps), [], -10**9
    for i in range(1, len(flux) - 1):
        lo, hi = max(0, i - 3), i + 4
        if flux[i] == flux[lo:hi].max() and flux[i] > base[i] + 0.08 and i - last >= gap:
            onsets.append((round((i * HOP + N / 2) / SR, 3), round(float(flux[i]), 2))); last = i
    # BPM: 변화량의 자기상관이 가장 큰 박자 간격 (70~180 BPM)
    ac = np.correlate(flux - flux.mean(), flux - flux.mean(), mode='full')[len(flux) - 1:]
    lags = np.arange(int(fps * 60 / 180), int(fps * 60 / 70) + 1)
    lags = lags[lags < len(ac)]  # 곡이 1초보다 짧으면 긴 박 간격은 잴 수 없다
    lag = lags[np.argmax(ac[lags])]
    # 하이햇·8분 음표가 촘촘하면 자기상관이 배속 박자에서 가장 크다. 두 배 간격도 충분히 강하면 반 속도를 박자로 본다
    if 60 * fps / lag > 130 and 2 * lag < len(ac) and ac[2 * lag] >= 0.5 * ac[lag]:
        lag *= 2
    bpm = round(60 * fps / lag, 1)
    print(f'bpm {bpm}')
    print('onsets ' + ' '.join(f'{t:.2f}:{v:.2f}' for t, v in onsets))

    def to_video(t, m):
        # 곡 시각 t 를 delay 를 더하기 전의 영상 시각 목록으로 바꾼다. --write 와 --fit 이 같이 쓴다
        c0, clen = m.get('cut', [None, 0])
        r0, rl, rn = m.get('repeat', [None, 0, 0])
        if c0 is not None and c0 <= t < c0 + clen:
            return []  # 잘라낸 구간의 타격음은 영상에 없다
        t = t - (clen if c0 is not None and t >= c0 + clen else 0)  # cut 을 먼저 적용한다
        if r0 is None:
            return [t]
        # 반복 구간의 타격음은 반복 횟수만큼 더 나오고, 그 뒤는 늘어난 만큼 밀린다 (repeat 시각은 cut 뒤의 곡 시각)
        return [t] + [t + k * rl for k in range(1, rn + 1)] if r0 <= t < r0 + rl else [t + (rn * rl if t >= r0 + rl else 0)]

    # 마디 시작 (4/4 로 본다). 박 간격의 빗을 곡 전체에 대 보고 빗살(±1 프레임 안의 가장 큰 타격)이 가장 크게 걸리는 템포·위상을 박으로 본다.
    # 템포는 bpm 의 ±2% 안에서 0.02 BPM 간격으로 다듬는다. bpm 줄은 박 간격을 정수 프레임(11.6ms) 단위로 재므로 박마다 몇 ms 씩 밀려 곡 뒤쪽에서 격자가 타격을 벗어난다
    # 네 박 위상 가운데 저역(120Hz 아래) 변화량의 합이 가장 큰 쪽을 마디 첫 박으로 본다
    # from animate (MIT, Copyright (c) 2026 cth9191) · plugins/animate/skills/animate/tools/beats.mjs 의 comb·마디 위상을 numpy 로 옮겼다
    env = np.maximum(0, flux - base)
    near = np.maximum(env, np.maximum(np.r_[0, env[:-1]], np.r_[env[1:], 0]))
    def comb(b):  # 템포 b 의 모든 위상(0.5 프레임 간격) 가운데 가장 잘 걸리는 빗. (점수, 빗살 프레임)
        per = 60 * fps / b
        fr = np.arange(0, per, 0.5)[:, None] + np.arange(int(len(env) / per) + 1)[None, :] * per
        ok = fr <= len(env) - 1
        sc = np.where(ok, near[np.round(np.minimum(fr, len(env) - 1)).astype(int)], 0).sum(axis=1) / ok.sum(axis=1)
        return sc.max(), fr[sc.argmax()][ok[sc.argmax()]]
    bt = max(np.arange(bpm * 0.98, bpm * 1.02, 0.02), key=lambda b: comb(b)[0])
    bf = comb(bt)[1]
    lb = int(120 / (SR / N))
    low = np.r_[0, np.maximum(0, np.diff(mag[:, 1:lb + 1], axis=0)).sum(axis=1)]
    ls = [low[np.round(bf[j::4]).astype(int)].sum() for j in range(4)]
    bar = int(np.argmax(ls))
    # 저역 배율 = 고른 위상의 저역 합 / 두 번째 위상의 저역 합. 1 에 가까울수록 네 위상의 저역이 비슷해서(예 · 킥이 매 박에 있는 곡) 마디 첫 박을 가리기 어렵다
    downs = [float((i * HOP + N / 2) / SR) for i in bf[bar::4]] if onsets else []   # 마디 첫 박의 곡 시각. 타격음이 없으면 근거가 없어 비운다
    print(f'downbeats (박 {bt:.2f} BPM, 마디 {240 / bt:.3f}초, 저역 배율 {max(ls) / (sorted(ls)[-2] or 1):.2f}) ' + ' '.join(f'{t:.2f}' for t in downs))

    # 큰 타격(세기 상위 25%)마다 그 타격으로 새로 생긴 에너지 가운데 120Hz 아래 비율을 잰다. 0.5 이상이면 킥으로 보고 k 를 붙인다
    # 새로 생긴 에너지는 타격 뒤 100ms 와 앞 100ms 의 스펙트럼 차이다. 앞에서부터 이어지는 베이스는 빠진다
    # 참고 · motion-graphics (MIT, Copyright (c) 2026 Bart) skills/sound-effects/scripts/sound_pass.py 의 120Hz 아래 킥 확인. 재는 방법은 다르다
    thr = float(np.percentile([v for _, v in onsets], 75)) if onsets else 1
    W = int(0.1 * SR); xp = np.r_[np.zeros(W), x, np.zeros(W)]; hw = np.hanning(W); fq = np.fft.rfftfreq(W, 1 / SR)
    def low_share(t):
        i = W + int((t - 0.01) * SR)
        d = np.maximum(0, np.abs(np.fft.rfft(xp[i:i + W] * hw)) ** 2 - np.abs(np.fft.rfft(xp[i - W:i] * hw)) ** 2)
        return d[(fq >= 20) & (fq < 120)].sum() / (d[fq >= 20].sum() or 1)
    big = [(t, v, low_share(t)) for t, v in onsets if v >= thr]
    print(f'hits (세기 {thr:.2f} 이상, 시각:세기:120Hz 아래 비율, k=킥) ' + ' '.join(f'{t:.2f}:{v:.2f}:{r:.2f}' + ('k' if r >= 0.5 else '') for t, v, r in big))

    if '--write' in sys.argv:
        # 영상 시각으로 바꿔 쓴다. onsets 는 [시각, 세기], beat 는 downbeats 줄의 다듬은 박(BPM), downbeats 는 마디 첫 박, kicks 는 킥(k) 큰 타격의 시각이다
        vdir = os.path.abspath(sys.argv[sys.argv.index('--write') + 1])
        cfg_path = os.path.join(vdir, 'video.json')
        cfg = json.load(open(cfg_path))
        m = cfg.get('audio', {}).get('music', {})
        delay = m.get('delay', 0)
        vts = lambda t: [round(vt, 3) for vt in (x + delay for x in to_video(t, m)) if 0 <= vt <= cfg['duration']]
        out = sorted([vt, v] for t, v in onsets for vt in vts(t))
        cfg['beats'] = {'bpm': bpm, 'onsets': out, 'beat': round(float(bt), 2),
                        'downbeats': sorted(vt for t in downs for vt in vts(t)),
                        'kicks': sorted(vt for t, v, r in big if r >= 0.5 for vt in vts(t))}
        json.dump(cfg, open(cfg_path, 'w'), ensure_ascii=False, indent=2)
        os.makedirs(os.path.join(vdir, 'src'), exist_ok=True)
        with open(os.path.join(vdir, 'src', 'beats.js'), 'w') as f:
            f.write('// audio-probe.py --onsets --write 가 만든 파일. 직접 고치지 않는다\n')
            f.write(f'window.BEATS = {json.dumps(cfg["beats"])};\n')
        print(f'wrote {len(out)} beats · 마디 {len(cfg["beats"]["downbeats"])} · 킥 {len(cfg["beats"]["kicks"])} → video.json, src/beats.js')

    if '--fit' in sys.argv:
        # 전환 시각(영상 시각, 쉼표)이 큰 타격에 가장 많이 닿는 delay 를 0~3초에서 5ms 간격으로 찾는다. video.json 은 고치지 않는다
        # 닿음은 1프레임 안이다. 닿는 수가 같으면 오차 합이 작은 쪽을 고른다. 오차는 가장 가까운 큰 타격 - 전환 시각이다
        if '--video' not in sys.argv:
            sys.exit('--fit 은 --video videos/<id> 와 함께 쓴다')
        cuts = np.array([float(v) for v in sys.argv[sys.argv.index('--fit') + 1].split(',')])
        cfg = json.load(open(os.path.join(sys.argv[sys.argv.index('--video') + 1], 'video.json')))
        m = cfg.get('audio', {}).get('music', {})
        hv = np.array([vt for t, v, r in big for vt in to_video(t, m)])
        if not hv.size:
            sys.exit('큰 타격이 없다')
        tol = 1 / cfg['fps']
        def errs(d):
            e = hv[None, :] + d - cuts[:, None]
            return e[np.arange(len(cuts)), np.abs(e).argmin(axis=1)]
        hit = lambda d: (np.abs(errs(d)) <= tol + 1e-9).sum()
        show = lambda d: f'{hit(d)}/{len(cuts)} 닿음 · ' + ' '.join(f'{c:g}:{e * 1000:+.0f}ms' for c, e in zip(cuts, errs(d)))
        best = min(np.arange(0, 3.0001, 0.005), key=lambda d: (-hit(d), np.abs(errs(d)).sum()))
        now = m.get('delay', 0)
        print(f'fit (닿음 ±{tol * 1000:.0f}ms, 전환:오차) 가장 좋은 delay {best:.3f} · {show(best)}')
        print(f'fit 지금 delay {now:g} · {show(now)}')

if '--words' in sys.argv:
    # 로컬 whisper 로 단어 시각을 잰다. 화면 문구를 대사의 단어에 맞출 때 쓴다. 단어 글자는 틀릴 수 있으니 시각만 믿는다
    import shutil, tempfile
    if not shutil.which('whisper'):
        sys.exit('whisper 명령이 없다. brew install openai-whisper')
    model = sys.argv[sys.argv.index('--model') + 1] if '--model' in sys.argv else 'small'
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['whisper', path, '--model', model, '--language', 'ko', '--word_timestamps', 'True',
                        '--output_format', 'json', '--output_dir', tmp, '--verbose', 'False'], check=True, capture_output=True)
        res = json.load(open(os.path.join(tmp, os.path.splitext(os.path.basename(path))[0] + '.json')))
    for seg in res['segments']:
        print('words ' + ' '.join(f"{w['start']:.2f}-{w['end']:.2f}:{w['word'].strip()}" for w in seg.get('words', [])))
