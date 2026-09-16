# midi2tune.py —— MIDI → TUNES 資料管線（音樂家引擎的進譜工具，零依賴 stdlib）
#
#   python midi2tune.py <file.mid>                    # 只印軌道摘要（先偵察）
#   python midi2tune.py <file.mid> --track 1 --transpose -2 [--from-beat 0 --to-beat 999]
#
# 流程＝已驗證四戰的固化（天國與地獄序曲／藍色多瑙河／天鵝湖／小星星變奏）：
#   選軌 → 同格多音取最高音（旋律線）→ 十六分音符量化 → 移調 → 出 config.js 格式。
# 慣例：大調移到 C、小調移到 Am（--transpose 自己算好半音數）。
# 驗明正身是人的工作：跑完先看印出的開頭音名像不像那首曲子，再入庫。
import struct, sys, os

def rv(d, i):
    v = 0
    while True:
        b = d[i]; i += 1; v = (v << 7) | (b & 0x7F)
        if not b & 0x80: return v, i

def parse(path):
    d = open(path, 'rb').read()
    fmt, ntr, div = struct.unpack('>HHH', d[8:14])
    i = 14; tracks = []
    for _ in range(ntr):
        ln = struct.unpack('>I', d[i+4:i+8])[0]; j = i + 8; end = j + ln
        time = 0; run = None; pend = {}; notes = []; name = ''
        while j < end:
            dt, j = rv(d, j); time += dt
            st = d[j]
            if st & 0x80: j += 1; run = st
            else: st = run
            if st == 0xFF:
                mt = d[j]; j += 1; l, j = rv(d, j)
                if mt == 3: name = d[j:j+l].decode('latin1', 'replace')
                j += l
            elif st in (0xF0, 0xF7):
                l, j = rv(d, j); j += l
            else:
                hi = st & 0xF0
                if hi in (0x80, 0x90, 0xA0, 0xB0, 0xE0): a, b = d[j], d[j+1]; j += 2
                else: a = d[j]; j += 1; b = None
                if hi == 0x90 and b: pend.setdefault(a, []).append(time)
                elif hi == 0x80 or (hi == 0x90 and b == 0):
                    if pend.get(a): s = pend[a].pop(0); notes.append((s, time - s, a))
        tracks.append((name, sorted(notes))); i = end
    return div, tracks

NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
nm = lambda m: NAMES[m % 12] + str(m // 12 - 1)

def fb(d16):
    b = d16 * 0.25
    if b == int(b): return str(int(b))
    s = ('%.2f' % b).rstrip('0').rstrip('.')
    return s[1:] if s.startswith('0.') else s

def main():
    if len(sys.argv) < 2:
        print(__doc__ or 'usage: midi2tune.py file.mid [--track N] [--transpose S] [--from-beat A] [--to-beat B]'); return
    path = sys.argv[1]
    args = dict(zip(sys.argv[2::2], sys.argv[3::2]))
    div, tracks = parse(path)
    if '--track' not in args:
        print('div', div)
        for k, (name, notes) in enumerate(tracks):
            if notes:
                ps = [p for *_, p in notes]
                print(f'track {k} {name!r:24} notes {len(notes):4}  range {nm(min(ps))}-{nm(max(ps))}  '
                      f'span {notes[0][0]/div:.0f}-{(notes[-1][0]+notes[-1][1])/div:.0f} beats')
        return
    # --track 可逗號併多軌（1,2＝長笛＋鋼琴右手——二重奏譜的獨奏段互補，合併取最高音才不會斷）
    trs = [int(x) for x in str(args['--track']).split(',')]
    tp = int(args.get('--transpose', 0))
    a = float(args.get('--from-beat', 0)) * div; b = float(args.get('--to-beat', 1e12)) * div
    notes = [(s, dur, p) for tr in trs for s, dur, p in tracks[tr][1] if a <= s < b]
    notes.sort()
    Q = div // 4                                   # 十六分音符格
    # 同格多音取最高音
    grid = {}
    for s, dur, p in notes:
        k = round(s / Q)
        if k not in grid or p > grid[k][0]: grid[k] = (p, max(1, round(dur / Q)))
    out = []; cur = None
    for k in sorted(grid):
        p, d16 = grid[k]
        if cur is None: cur = k                    # 掐頭去掉起始休止
        if k > cur: out.append((None, k - cur))
        out.append((p + tp, d16)); cur = k + d16
    items = ['[%s,%s]' % ('null' if p is None else "'" + nm(p) + "'", fb(d)) for p, d in out]
    rows = [','.join(items[i:i+8]) for i in range(0, len(items), 8)]
    total = sum(d for _, d in out) * 0.25
    sys.stderr.write('%d events, %.2f beats\n' % (len(items), total))
    print(',\n    '.join(rows))

if __name__ == '__main__':
    main()
