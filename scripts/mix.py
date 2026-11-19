#!/usr/bin/env python3
"""videos/<id>/video.json 의 시간표대로 내레이션·음악·효과음을 섞고 renders/frames 와 합쳐 renders/video.mp4 를 만든다.

사용: python3 scripts/mix.py videos/<id>
"""
import json, math, os, struct, subprocess, sys

DIR = os.path.abspath(sys.argv[1])
CFG = json.load(open(os.path.join(DIR, 'video.json')))
FPS, DUR = CFG['fps'], CFG['duration']
AU = CFG.get('audio', {})
A = lambda p: os.path.join(DIR, 'assets', p)

inputs, fc, mix = [], [], []
def add(path):
    inputs.extend(['-i', A(path)]); return len(inputs) // 2  # 0번 입력은 프레임

# 내레이션: 원본에서 문장 단위로 잘라 장면 시작에 맞춰 놓는다
vo = AU.get('voice')
if vo:
    labels = []
    for i, (a, b, at) in enumerate(vo['segments']):
        n = add(vo['file'])
        fc.append(f'[{n}:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b-a-0.04}:d=0.04,adelay={int(at*1000)}:all=1[v{i}]')
        labels.append(f'[v{i}]')
    fc.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0,volume={vo.get("gain", 1.5)},apad=whole_dur={DUR},asplit=2[vo][vok]')
    mix.append('[vo]')

# 음악: 필요하면 한 구간을 잘라 길이를 맞추고, 영상 시간 기준으로 음량을 올린다
bgm = AU.get('music')
if bgm:
    n = add(bgm['file'])
    chain = f'[{n}:a]'
    if bgm.get('cut'):  # [잘라낼 시작, 잘라낼 길이] — 박자 단위로 잘라야 이음매가 안 들린다. 시작이 0 이면 도입을 잘라 당긴다
        c0, clen = bgm['cut']
        if c0 <= 0:
            fc.append(f'[{n}:a]atrim=start={clen},asetpts=PTS-STARTPTS[mc]')
        else:
            fc.append(f'[{n}:a]asplit=2[m1][m2]')
            fc.append(f'[m1]atrim=0:{c0},asetpts=PTS-STARTPTS[ma]')
            fc.append(f'[m2]atrim={c0+clen-0.025},asetpts=PTS-STARTPTS[mb]')
            fc.append('[ma][mb]acrossfade=d=0.025:c1=tri:c2=tri[mc]')
        chain = '[mc]'
    if bgm.get('repeat'):  # [반복할 시작, 길이, 더 넣을 횟수] — 고조가 너무 일찍 오거나 곡이 짧을 때 박자 단위 구간을 늘린다
        r0, rl, rn = bgm['repeat']  # 시각은 cut 을 적용한 뒤의 곡 시각이다
        fc.append(f'{chain}asplit={rn + 2}' + ''.join(f'[r{k}]' for k in range(rn + 2)))
        fc.append(f'[r0]atrim=0:{r0 + rl},asetpts=PTS-STARTPTS[p0]')
        for k in range(1, rn + 1):
            fc.append(f'[r{k}]atrim={r0 - 0.025}:{r0 + rl},asetpts=PTS-STARTPTS[p{k}]')
        fc.append(f'[r{rn + 1}]atrim={r0 + rl - 0.025},asetpts=PTS-STARTPTS[p{rn + 1}]')
        prev = '[p0]'
        for k in range(1, rn + 2):
            fc.append(f'{prev}[p{k}]acrossfade=d=0.025:c1=tri:c2=tri[q{k}]'); prev = f'[q{k}]'
        chain = prev
    f = []
    ib = bgm.get('intro_boost')  # [배율, 끝 시각] — 도입부가 너무 조용할 때만
    if ib:
        f.append(f"volume=eval=frame:volume='1+{ib[0]-1}*(1-clip((t-{ib[1]-0.4})/0.4,0,1))'")
    f.append(f"adelay={int(bgm.get('delay', 0)*1000)}:all=1")
    g0, g1, r0, rd = bgm.get('gain', [0.5, 0.92, 17, 5.3])  # [시작 음량, 정점 음량, 올리기 시작, 올리는 시간]
    f.append(f"volume=eval=frame:volume='{g0}+{g1-g0}*clip((t-{r0})/{rd},0,1)'")
    f.append(f'apad=whole_dur={DUR}')
    fc.append(f'{chain}{",".join(f)}[mu]')
    if vo:
        fc.append(f'[mu][vok]sidechaincompress=threshold=0.03:ratio={bgm.get("duck", 2.5)}:attack=20:release=350[mud]')
        mix.append('[mud]')
    else:
        mix.append('[mu]')
elif vo:
    fc.append('[vok]anullsink')

def sync_at(path, mode):
    # 효과음 파일 안에서 화면 사건 시각에 맞출 지점(초). audio-probe.py --peak 와 같은 정의다
    # peak 는 10ms 창 음량을 50ms 로 평균한 곡선이 가장 큰 곳이다. whoosh 처럼 봉우리가 여럿인 소리에서 창 하나의 최댓값은 흔들린다
    # onset 은 그 최고점보다 20dB 작은 소리를 처음 넘는 10ms 창이다. 돌려주는 값은 (지점, 파일 길이) 다
    if isinstance(mode, bool) or not isinstance(mode, (str, int, float)) or isinstance(mode, str) and mode not in ('peak', 'onset'):
        sys.exit(f'sfx 의 4번째 칸은 "peak", "onset" 또는 초(숫자)다: {path} · {mode}')
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', A(path), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    x = struct.unpack(f'<{len(pcm)//2}h', pcm)
    pw = [sum(v * v for v in x[i:i + 80]) / 80 for i in range(0, len(x) - 79, 80)]
    if not pw:
        sys.exit(f'sfx {path} 를 읽지 못했다 (파일이 없거나 10ms 보다 짧다)')
    if not isinstance(mode, str):
        return float(mode), len(x) / 8000
    sm = [sum(pw[max(0, i - 2):i + 3]) / len(pw[max(0, i - 2):i + 3]) for i in range(len(pw))]
    pk = max(range(len(sm)), key=sm.__getitem__)
    if mode == 'peak':
        return pk * 0.01, len(x) / 8000
    return next(i for i, p in enumerate(pw) if p >= sm[pk] / 100) * 0.01, len(x) / 8000

# sfx 한 줄은 [파일, 시각, 음량] 또는 [파일, 시각, 음량, 동기점] 이다. 동기점이 없으면 파일 시작을 그 시각에 놓는다
# 동기점이 있으면 시각은 화면 사건 시각이고, 파일 안의 그 지점(peak·onset·초)이 그 시각에 온다
sfx_warn = []
for i, (path, at, vol, *sync) in enumerate(AU.get('sfx', [])):
    if len(sync) > 1:
        sys.exit(f'sfx 한 줄은 칸이 3개나 4개다: {path}')
    n = add(path)
    sh, length = sync_at(path, sync[0]) if sync else (0, None)
    if length is not None and sh - at >= length:
        sfx_warn.append(f'{path} · 시각 {at}초에 동기점 {sh:.2f}초를 맞추면 파일 길이 {length:.2f}초가 전부 0초 앞으로 가서 소리가 남지 않는다. 시각이나 동기점을 고친다')
    head = f'atrim=start={sh - at:.3f},asetpts=PTS-STARTPTS,' if sh > at else ''  # 앞당긴 시작이 0초보다 앞이면 파일 앞을 자른다
    fc.append(f'[{n}:a]{head}volume={vol},adelay={int(max(0, at - sh)*1000)}:all=1[s{i}]'); mix.append(f'[s{i}]')

if not mix:  # 소리 파일이 하나도 없으면 (ElevenLabs 를 쓰지 않은 영상) 무음 트랙을 넣는다
    inputs.extend(['-f', 'lavfi', '-t', str(DUR), '-i', 'anullsrc=r=48000:cl=stereo'])
    fc.append(f'[{inputs.count("-i")}:a]anull[sil]'); mix.append('[sil]')

fc.append(f'{"".join(mix)}amix=inputs={len(mix)}:normalize=0,alimiter=limit=0.8,atrim=0:{DUR},afade=t=out:st={DUR-0.6}:d=0.6[out]')
out = os.path.join(DIR, 'renders/video.mp4')
cmd = ['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(DIR, 'renders/frames/f%05d.png'), *inputs,
       '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[out]', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', str(DUR), '-movflags', '+faststart', out]
subprocess.run(cmd, check=True)
print(out)

# 귀로 들을 수 없으니 흔한 실수 세 가지를 숫자로 확인한다. 경고가 나오면 video.json 만 고치고 mix.py 를 다시 실행한다
probe = lambda p: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)
warn = sfx_warn
if bgm:
    c = bgm.get('cut', [0, 0]); r = bgm.get('repeat', [0, 0, 0])
    end = bgm.get('delay', 0) + probe(A(bgm['file'])) - c[1] + r[1] * r[2]
    if end < DUR - 1:
        warn.append(f'음악이 {end:.1f}초에 끝난다 (영상 {DUR}초). 끝이 빈다. repeat 로 정점 구간을 늘리거나 cut 을 줄인다')
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
x = struct.unpack(f'<{len(pcm)//2}h', pcm)
lv = [(i / 8000, 20 * math.log10(max(1, math.sqrt(sum(v * v for v in x[i:i + 2000]) / 2000)) / 32768)) for i in range(0, len(x) - 2000, 2000)]
body = sorted(d for t, d in lv)[len(lv) // 2] if lv else 0  # 영상 전체 음량의 가운데값
quiet_from, loud = DUR - 0.6, 0
for t, d in reversed([(t, d) for t, d in lv if t < DUR - 0.6]):
    loud = loud + 1 if d >= body - 20 else 0
    if loud >= 2: break  # 효과음 한 번(0.25초)은 무음 구간을 끊지 않는다
    if not loud: quiet_from = t
if DUR - 0.6 - quiet_from > 2.5:  # 종결 화음이 2초쯤 잦아드는 것은 정상이다
    warn.append(f'{quiet_from:.1f}초부터 끝까지 거의 무음이다 (가운데값 {body:.0f}dB 보다 20dB 이상 작다). 음악 길이나 마지막 장면을 확인한다')
if vo and bgm:
    spans = [(at, at + b - a) for a, b, at in vo['segments']]
    inside = lambda t: any(s0 - 0.2 <= t <= s1 + 0.2 for s0, s1 in spans)
    pw = lambda ds: 10 * math.log10(sum(10 ** (d / 10) for d in ds) / len(ds)) if ds else None
    v = pw([d for t, d in lv if any(s0 <= t and t + 0.25 <= s1 for s0, s1 in spans)])
    m = pw([d for t, d in lv if not inside(t) and not inside(t + 0.25) and spans[0][0] < t < spans[-1][1]])  # 대사가 오가는 사이의 쉼만 본다
    if m is None:
        print('대사 사이 쉼이 짧아 목소리와 음악 크기를 비교하지 못했다. 내레이션 구간을 직접 들어 본다')
    if v is not None and m is not None:
        print(f'목소리 구간 {v:.1f}dB · 음악만 나오는 구간 {m:.1f}dB · 차이 {v - m:.1f}dB')
        if v - m < 4:
            warn.append(f'목소리가 음악에 묻힌다 (차이 {v - m:.1f}dB, 4dB 이상이어야 한다). voice.gain 을 올리거나 music.gain 을 내린다')
for w in warn:
    print(f'경고 · {w}')
if not warn:
    print('경고 없음')
