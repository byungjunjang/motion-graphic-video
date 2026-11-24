#!/usr/bin/env python3
"""look.py - 7단계 렌더 측정. 검수 시트 한 장과 G0·G2·끝 정지·음량을 낸다. 표준 라이브러리 + ffmpeg.

사용: python3 scripts/look.py <mp4> [--out <폴더>] [--frames 16] [--expect 초] [--expect-tol 0.15] [--expect-audio]

  <out>/sheet.jpg  고르게 뽑은 프레임 N장(4열). ffmpeg 에 drawtext 가 있으면 타임코드를 넣는다
  G0        디코드된다, 빈 화면이 아니다(5% 넘는 프레임에 그림이 있다), 움직인다(5% 넘는 프레임이 바뀐다),
            길이가 --expect 와 ±--expect-tol 안에서 같다, --expect-audio 면 음성 스트림이 있다
  G2        단색 프레임이 4장 넘게 이어지는 구간 (참고용)
  end hold  끝에서 그림이 바뀌지 않는 길이 (96x54 휘도의 프레임 차이 평균 < 0.35/255)
  audio     통합 음량 LUFS · LRA · true peak (ffmpeg ebur128)
종료 코드 · 0 측정 완료(G0 FAIL 도 0), 1 실패, 2 잘못된 사용.

motionmaxxing 의 look.py 를 줄여 고친 것이다 (Apache-2.0 · motionmaxxing, Made by Tejas Makwana ·
https://github.com/Tejashmakwana/motionmaxxing). 라이선스 전문은 scripts/look.LICENSE.
바꾼 것 · 컷 검출·mid/strips 시트·still.txt·G3·음량 FLAG·움직임 비교를 뺐다. 출력을 한국어로 줄였다.
"""
import argparse, math, operator, os, re, shutil, subprocess, sys

FONTS = ["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Helvetica.ttc",
         "/Library/Fonts/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
AW, AH = 96, 54                       # 분석 해상도 (휘도)
HOLD_EPS = 0.35                       # 이보다 작은 프레임 차이는 '정지'
FLAT_STD, FLAT_RNG, FLAT_MAX_OK = 1.5, 8, 3


def die(msg, code=1):
    print('error: ' + msg, file=sys.stderr)
    sys.exit(code)


def ff(args, check=True):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y'] + args, capture_output=True, text=True)
    if check and r.returncode:
        die('ffmpeg 실패: ' + ' '.join(args[:6]) + ' ...\n' + r.stderr[-1000:])
    return r


def probe(f):
    import json
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], capture_output=True, text=True)
    if r.returncode:
        die('ffprobe 가 읽지 못함: ' + r.stderr.strip()[:300])
    return json.loads(r.stdout)


def drawtext():
    # Homebrew 기본 ffmpeg 처럼 drawtext 가 없으면 타임코드 없이 만든다
    font = next((f for f in FONTS if os.path.exists(f)), None)
    has = 'drawtext' in subprocess.run(['ffmpeg', '-hide_banner', '-filters'], capture_output=True, text=True).stdout
    if not (font and has):
        return ''
    return ("drawtext=fontfile='%s':text='%%{pts\\:hms}':x=6:y=h-th-6:fontsize=18:"
            "fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4," % font)


def analyse(film):
    """작은 휘도 영상을 한 번 읽는다 → 프레임마다 (앞 프레임과의 차이 평균, 표준편차, 밝기 범위, 평균)."""
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', film, '-an', '-vf', 'scale=%d:%d:flags=area,format=gray' % (AW, AH),
                          '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size, prev = AW * AH, None
    diff, std, rng, mean = [], [], [], []
    while True:
        fr = p.stdout.read(size)
        if len(fr) < size:
            break
        m = sum(fr) / size
        var = sum(map(operator.mul, fr, fr)) / size - m * m
        mean.append(m); std.append(math.sqrt(max(0.0, var))); rng.append(max(fr) - min(fr))
        diff.append(0.0 if prev is None else sum(map(abs, map(operator.sub, fr, prev))) / size)
        prev = fr
    p.wait()
    return diff, std, rng, mean


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('film')
    ap.add_argument('--out', default='look')
    ap.add_argument('--frames', type=int, default=16)
    ap.add_argument('--expect', type=float)
    ap.add_argument('--expect-tol', type=float, default=0.15)
    ap.add_argument('--expect-audio', action='store_true')
    a = ap.parse_args()
    if not os.path.isfile(a.film):
        die('파일 없음: ' + a.film, 2)
    for t in ('ffmpeg', 'ffprobe'):
        if not shutil.which(t):
            die(t + ' 없음')
    os.makedirs(a.out, exist_ok=True)

    info = probe(a.film)
    vs = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
    au = next((s for s in info['streams'] if s['codec_type'] == 'audio'), None)
    if not vs:
        die('영상 스트림 없음')
    dur = float(info['format'].get('duration') or vs.get('duration') or 0)
    n_, d_ = (vs.get('avg_frame_rate') or '0/1').split('/')
    fps = float(n_) / float(d_) if float(d_) else 0.0
    if dur <= 0 or fps <= 0:
        die('길이·fps 를 알 수 없음')
    nframes = int(vs.get('nb_frames') or round(dur * fps))

    # 검수 시트 · 프레임 번호로 고르게 뽑아 칸 가운데에 둔다
    N = max(1, min(a.frames, nframes))
    idx = sorted({min(nframes - 1, int((k + 0.5) * nframes / N)) for k in range(N)})
    cols = 4 if len(idx) > 4 else len(idx)
    sel = '+'.join('eq(n\\,%d)' % i for i in idx)
    sheet = os.path.join(a.out, 'sheet.jpg')
    ff(['-i', a.film, '-an', '-vf', "select='%s',%sscale=%d:-2,tile=%dx%d:padding=4:margin=4:color=0x111111"
        % (sel, drawtext(), 480 if cols >= 4 else 640, cols, math.ceil(len(idx) / cols)),
        '-frames:v', '1', '-q:v', '3', '-fps_mode', 'passthrough', sheet])

    diff, std, rng, mean = analyse(a.film)
    n = len(diff)
    if n < 2:
        die('프레임을 디코드하지 못함')

    # G0
    st, why = 'PASS', []
    if sum(1 for v in std if v >= FLAT_STD) < max(1, 0.05 * n):
        st = 'FAIL'; why.append('빈 화면 (그림이 있는 프레임이 5% 미만)')
    if max(mean) < 3:
        st = 'FAIL'; why.append('모든 프레임이 검정')
    if sum(1 for v in diff[1:] if v >= HOLD_EPS) < max(2, 0.05 * (n - 1)):
        st = 'FAIL'; why.append('움직임 없음')
    if a.expect is not None:
        ok = abs(dur - a.expect) <= a.expect_tol
        st = st if ok else 'FAIL'
        why.append('길이 %.2f s %s --expect %.2f s (±%.2f)' % (dur, '=' if ok else '≠', a.expect, a.expect_tol))
    else:
        why.append('길이 %.2f s (--expect 없음 · 비교 안 함)' % dur)
    if a.expect_audio and not au:
        st = 'FAIL'; why.append('음성 스트림 없음')
    else:
        why.append('음성 스트림 ' + ('있음' if au else '없음'))

    # G2 · 단색 프레임 연속 구간
    runs, s0 = [], None
    for i in range(n + 1):
        flat = i < n and std[i] < FLAT_STD and rng[i] < FLAT_RNG
        if flat and s0 is None:
            s0 = i
        elif not flat and s0 is not None:
            runs.append((s0, i - 1)); s0 = None
    bad = [(s, e) for s, e in runs if e - s + 1 > FLAT_MAX_OK]
    g2 = ('FAIL  ' + ', '.join('%.2f-%.2f s (%d프레임)' % (s / fps, (e + 1) / fps, e - s + 1) for s, e in bad[:8])) if bad else 'PASS'

    # 끝 정지 · 끝에서부터 차이가 HOLD_EPS 미만인 프레임 수
    k = n - 1
    while k >= 1 and diff[k] < HOLD_EPS:
        k -= 1
    hold = (n - 1 - k) / fps

    print('file      %s' % a.film)
    print('duration  %.2f s   fps %.3f   %dx%d   frames %d' % (dur, fps, vs['width'], vs['height'], nframes))
    print('G0        %s  %s' % (st, '; '.join(why)))
    print('G2        %s  (참고)' % g2)
    print('end hold  %.2f s (마지막 %d프레임 정지)' % (hold, round(hold * fps)))
    if au:
        r = ff(['-i', a.film, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], check=False)
        s = r.stderr[r.stderr.rfind('Summary:'):]
        g = lambda pat: (re.search(pat, s) or [None, '?'])[1]
        print('audio     integrated %s LUFS   LRA %s LU   true peak %s dBFS'
              % (g(r'I:\s+(-?[\d.]+) LUFS'), g(r'LRA:\s+([\d.]+) LU'), g(r'Peak:\s+(-?[\d.]+) dBFS')))
    else:
        print('audio     없음')
    print('sheet     %s' % sheet)


if __name__ == '__main__':
    main()
