/* composer.js —— 積木展開器（純邏輯，無 DOM；瀏覽器與 node 通用）
   state ＝ { name, bpm, bars, chords:[和弦id×bars], tracks:[{name,voice,oct,vol,pan,mute,solo,blocks:[樂句id|null ×bars]}] }
   expand(state, COMPOSER) → 引擎吃的 tune（parts[].notes）；音全由和弦決定＝鎖在調內。
   一小節固定 4 拍。 */
const Composer = (() => {
  const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const nm = m => NAMES[((m%12)+12)%12] + (Math.floor(m/12)-1);

  // t＝和弦音的 MIDI 陣列 [根,三,五,(七)]；每個樂句回傳一小節（4 拍）的 notes
  const PATTERNS = {
    eighths:  t => Array.from({length:8}, () => [nm(t[0]), .5]),
    quarters: t => Array.from({length:4}, () => [nm(t[0]), 1]),
    roll:     t => Array.from({length:16}, () => [nm(t[0]), .25]),
    hit:      t => [[nm(t[0]), 1], [null, 3]],
    rootfifth:t => [[nm(t[0]), 2], [nm(t[2]), 2]],
    whole:    t => [[nm(t[0]), 4]],
    third:    t => [[nm(t[1]), 4]],
    fifth:    t => [[nm(t[2]), 4]],
    arpUp:    t => [t[0], t[1], t[2], t[0]+12].map(m => [nm(m), 1]),
    arpDown:  t => [t[0]+12, t[2], t[1], t[0]].map(m => [nm(m), 1]),
    arpWave:  t => [t[0], t[1], t[2], t[1]+12, t[2]+12, t[1]+12, t[2], t[1]].map(m => [nm(m), .5]),
  };

  /* 旋律軌的一小節：v＝長 8 的陣列，null＝續前一個音，-1＝休止，0..11＝音高列（C 大調白鍵，0＝oct 的 C）。
     每個音響到下一個標記為止；開頭沒標記的空格補休止。全 null＝休止一小節 */
  const DIAT = [0,2,4,5,7,9,11];
  const rowMidi = (row, oct) => 12*(oct+1) + 12*Math.floor(row/7) + DIAT[row%7];
  function melodyBar(v, oct, C){
    const n = C.melody.steps, per = 4/n, at = [];
    for(let i = 0; i < n; i++) if(v && v[i] != null) at.push(i);
    if(!at.length) return [[null, 4]];
    const out = [];
    if(at[0] > 0) out.push([null, at[0]*per]);
    at.forEach((i, k) => { const d = ((at[k+1] == null ? n : at[k+1]) - i) * per;
      out.push([v[i] < 0 ? null : nm(rowMidi(v[i], oct)), d]); });
    return out;
  }

  /* 簡譜（notes）→ 旋律格（v1.20.00，簡譜即興台併入創作台）。放得進才回 {oct, bars}；
     放不進回 {err}：時值不是八分音符的整數倍、有升降記號（黑鍵）、或音域超過格子的列數。
     oct 自動挑（最低音所在八度的 C 當第 0 列），或由呼叫端指定（填進既有旋律軌時沿用該軌的 oct）。尾巴不滿一小節補休止。 */
  const midiOf = n => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return m ? 12*(+m[2]+1) + NAMES.indexOf(m[1]) : null; };
  function fitMelody(notes, C, fixedOct){
    const n = C.melody.steps, per = 4/n, R = C.melody.rows;
    const midis = notes.filter(x => x[0]).map(x => midiOf(x[0]));
    if(!midis.length) return { err:'沒有任何音' };
    const oct = fixedOct != null ? fixedOct : Math.floor(Math.min(...midis)/12) - 1, steps = [];
    for(const [name, beats] of notes){
      const k = beats/per;
      if(Math.abs(k - Math.round(k)) > 1e-9 || k < 1) return { err:'有比八分音符更短（或不整齊）的音' };
      let v = -1;
      if(name){ const rel = midiOf(name) - 12*(oct+1), d = DIAT.indexOf(((rel%12)+12)%12);
        if(d < 0) return { err:'有升降記號（' + name + '）' };
        v = Math.floor(rel/12)*7 + d;
        if(v < 0 || v >= R) return { err:'音域超出格子（' + R + ' 列）' }; }
      steps.push(v); for(let i = 1; i < Math.round(k); i++) steps.push(null);
    }
    if(steps.length % n) steps.push(-1);
    while(steps.length % n) steps.push(null);
    const bars = []; for(let i = 0; i < steps.length; i += n) bars.push(steps.slice(i, i + n));
    return { oct, bars };
  }
  function transpose(notes, semi){
    if(!semi) return notes;
    return notes.map(([name, b]) => [name ? nm(midiOf(name) + semi) : null, b]);
  }

  function barNotes(patId, chordId, oct, C){
    const ch = C.chords.find(c => c.id === chordId), pat = PATTERNS[patId];
    if(!ch || !pat) return [[null, 4]];                  // 沒放積木＝休止一小節
    const r = 12*(oct+1) + ch.pc;
    return pat(ch.q.map(i => r+i));
  }

  function expand(st, C){
    return { id:'composer', name:st.name||'我的配樂', composer:'Master Roy', bpm:st.bpm||C.bpm,
      parts: st.tracks.map(tr => ({
        name:tr.name, voice:tr.voice, vol:tr.vol, pan:tr.pan, mute:!!tr.mute, solo:!!tr.solo,
        notes: tr.kind === 'jp' ? tr.notes : [].concat(...Array.from({length:st.bars}, (_, i) =>
          tr.kind === 'melody' ? melodyBar(tr.blocks[i], tr.oct, C) : barNotes(tr.blocks[i], st.chords[i], tr.oct, C))),
      })) };
  }

  // notes → 簡譜字串（顯示用；與引擎 fromJianpu 語法相容，C 大調音級，base＝第 4 八度）
  const DEG = {C:'1','C#':'1#',D:'2','D#':'2#',E:'3',F:'4','F#':'4#',G:'5','G#':'5#',A:'6','A#':'6#',B:'7'};
  function jianpu(notes){
    return notes.map(([n, b]) => {
      let s;
      if(!n) s = '0';
      else { const m = /^([A-G]#?)(\d)$/.exec(n), o = +m[2]-4, d = DEG[m[1]];
        s = (o>0 ? '^'.repeat(o) : '_'.repeat(-o)) + d[0] + (d[1]||''); }
      if(b >= 1) s += '-'.repeat(Math.round(b)-1);
      else if(b === .5) s += '/'; else if(b === .25) s += '//';
      return s;
    }).join(' ');
  }

  return { expand, jianpu, barNotes, melodyBar, rowMidi, fitMelody, transpose, PATTERNS };
})();
if(typeof module !== 'undefined') module.exports = Composer;
