/* musician.js —— 音樂家引擎 v1：曲譜資料 × 音色合成（WebAudio，零檔案零授權）

   用法（任何專案複製本檔即可，跟 designer-panel.js 一樣不要跨資料夾引用）：
     Musician.play(tune, { voice:'piano', cfg:CONFIG, beats:8, onend:fn })
       tune  ＝ { name, bpm, notes:[[音名,拍數],…], chords }（格式見 config.js 的 TUNES）
       voice ＝ 'chip' | 'crystal' | 'piano'（預設 crystal）
       cfg   ＝ CONFIG 形狀的參數物件（play/voices/chord 三區）；不給就用內建保底值
       beats ＝ 只播前 N 拍（辨認遊戲的「猜歌難度」就是這個數字）；省略＝整首
       onend ＝ 播完呼叫（自然結束才叫，stop() 打斷不叫）
     Musician.stop()
     Musician.fromJianpu('3.1415926', {bpm, base, name, radix:16, hexMode})  → tune（簡譜字串直接變曲）
     Musician.toJianpu(tune)  → {base, tokens:[{d,acc,oct,beats,at,sec,dur}], seconds}（顯示用）
     Musician.position()      → 目前播到第幾秒（沒在播 -1）

   排程：整首一次排進 WebAudio 絕對時間軸（取樣級準確）。代價是播放中改音色參數
   不會即時生效，要重按——調參工作流是「拉旋鈕→重按同一首」，可接受。
   AudioContext 延後到第一次 play 才建立（自動播放政策要求使用者手勢，
   而 play 一定是按鈕觸發的）。 */
const Musician = (() => {

  const NOTE_BASE = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  function noteHz(n){
    const m = /^([A-G])(#?)([0-9])$/.exec(n); if(!m) return 0;
    const midi = 12*(+m[3]+1) + NOTE_BASE[m[1]] + (m[2]?1:0);
    return 440*Math.pow(2,(midi-69)/12);
  }

  /* 和弦字典＋自動配和聲（移植自 Math-Racer lullaby，含 G7 的推理見該專案）：
     每小節挑「含旋律音最多」的和弦，偏好順序 C→F→G→G7。只適合 C 大調曲；
     小調曲在資料裡標 chords:false 或自帶進行 */
  const TRIAD = { C:['C','E','G'], F:['F','A','C'], G:['G','B','D'], G7:['G','B','D','F'],
                  Am:['A','C','E'], Em:['E','G','B'], Dm:['D','F','A'] };
  const AUTO_CHORDS = ['C','F','G','G7'];
  const chordRoot = k => k.replace(/[m7]/g,'');
  function chordFor(names){
    let best='C', bestN=-1;
    for(const k of AUTO_CHORDS){
      const n = names.filter(x => TRIAD[k].indexOf(x)>=0).length;
      if(n>bestN){ bestN=n; best=k; }
    }
    return best;
  }

  // cfg 沒給時的保底值（正式參數在各專案的 config.js，這份只求檔案單獨可用）
  const FALLBACK = {
    play:  { volume:0.5, bpm:100, chords:true, chordBars:2 },
    voices:{ chip:{gain:0.10,attack:0.005,cut:0.85},
             crystal:{oct:2,main:0.34,shimmer:0.16,sparkle:0.30,attack:0.002,ring:3.5,padScale:0,echoTime:0.30,echoFb:0.45,echoMix:0.60},
             piano:{h1:0.7,h2:0.35,h3:0.12,h4:0.05,attack:0.008},
             strings:{gain:0.07,attack:0.12,release:0.20,detune:7,brightness:4},
             flute:{gain:0.22,woody:0.12,attack:0.06,release:0.12,vibRate:5,vibDepth:9} },
    chord: { root:0.30, triad:0.13, attack:0.18 },
  };

  let actx=null, master=null, endTimer=null, limiter=null;
  let curT0=0, curLen=0, curTail=0;   // 這次播放的絕對起點與長度（秒）——position() 用，UI 靠它高亮簡譜
  /* 防削波保險（v1.06.00，Roy：「耳機聽咚咚聲會破音」）：所有聲音過一顆壓縮器再出門。
     多聲部＋回聲＋襯底的瞬時總和很容易超過 1.0，超過就是硬削波＝破音；
     壓縮器把峰值軟著陸。每個 AudioContext 建一次，常駐 */
  function ensureLimiter(){
    if(limiter) return limiter;
    limiter=actx.createDynamicsCompressor();
    limiter.threshold.value=-12; limiter.knee.value=24; limiter.ratio.value=6;
    limiter.attack.value=0.003; limiter.release.value=0.25;
    limiter.connect(actx.destination);
    return limiter;
  }

  function osc(type,hz,t,dur,peak,attack,decayAt,out){
    const o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.value=hz;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(peak,t+attack);
    g.gain.exponentialRampToValueAtTime(0.0008,decayAt);
    o.connect(g); g.connect(out); o.start(t); o.stop(t+dur);
  }

  const VOICES = {
    // 8-bit：方波、快起音、提早收音（cut）做顆粒感
    chip(hz,t,dur,out,P){
      const o=actx.createOscillator(), g=actx.createGain();
      o.type='square'; o.frequency.value=hz;
      const cutT=t+dur*P.cut;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(P.gain,t+P.attack);
      g.gain.setValueAtTime(P.gain,Math.max(cutT-0.02,t+P.attack));  // 平台段：方波要「站住」才有晶片感
      g.gain.linearRampToValueAtTime(0,cutT);
      o.connect(g); g.connect(out); o.start(t); o.stop(t+dur);
    },
    /* 水晶（v1.04.00 再修，Roy：「怎麼調都厚，像鋼琴變高音」）。診斷：厚的根源不是波形，
       是①住錯樓層＋②泛音太和諧＋③襯底太厚。三帖藥：
       oct＝整體上移八度數（音樂盒住在高兩個八度）；
       sparkle 改掛在 2.756×（鐘的不和諧模態——「叮」的感覺全靠不和諧比例，2×3× 只會融成厚音）；
       padScale 在 play() 端把和聲襯底壓薄。ring 餘韻與回聲匯流排照舊 */
    crystal(hz,t,dur,out,P){
      hz*=Math.pow(2,P.oct||0);
      const ring=dur*Math.max(1,P.ring||1);
      osc('sine',hz,      t,ring,    P.main,   P.attack,t+ring*0.95,out);
      osc('sine',hz*2,    t,ring,    P.shimmer,P.attack,t+ring*0.60,out);
      osc('sine',hz*2.756,t,ring*0.5,P.sparkle||0,P.attack,t+ring*0.25,out);  // 鐘鳴泛音，衰減最快
    },
    // 鋼琴：基音＋2/3/4 倍泛音遞減；泛音越高衰減越快（真琴弦的物理走向）
    piano(hz,t,dur,out,P){
      osc('sine',hz,  t,dur,P.h1,P.attack,t+dur*0.98,out);
      osc('sine',hz*2,t,dur,P.h2,P.attack,t+dur*0.60,out);
      osc('sine',hz*3,t,dur,P.h3,P.attack,t+dur*0.40,out);
      osc('sine',hz*4,t,dur,P.h4,P.attack,t+dur*0.25,out);
    },
    /* 弦樂（v1.05.00，Roy：「弦樂與吹管樂的效果也可以重現嗎？」）：
       鋸齒波＝完整泛音列（弓擦弦的頻譜）；三把微失諧（±detune 音分）＝群感，
       一把是獨奏、三把是樂團；低通濾波壓掉鋸齒的毛邊；慢起音＝弓速起步。
       持續音色：整個音長都站住，收尾用 release 放掉 */
    strings(hz,t,dur,out,P){
      const f=actx.createBiquadFilter();
      f.type='lowpass'; f.frequency.value=Math.min(hz*P.brightness,12000); f.connect(out);
      [-P.detune,0,P.detune].forEach(dt=>{
        const o=actx.createOscillator(), g=actx.createGain();
        o.type='sawtooth'; o.frequency.value=hz; o.detune.value=dt;
        const rel=Math.min(P.release,dur*0.4), sus=Math.max(t+P.attack,t+dur-rel);
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(P.gain,Math.min(t+P.attack,t+dur*0.5));
        g.gain.setValueAtTime(P.gain,sus);
        g.gain.linearRampToValueAtTime(0,t+dur);
        o.connect(g); g.connect(f); o.start(t); o.stop(t+dur+0.05);
      });
    },
    /* 長笛（吹管）：接近純音的正弦＋一點 2 倍泛音給木頭味，
       輕柔起音（氣流成形需要時間）＋顫音 LFO（吹奏者的氣息，音準微幅波動） */
    flute(hz,t,dur,out,P){
      const lfo=actx.createOscillator(), lg=actx.createGain();
      lfo.frequency.value=P.vibRate; lg.gain.value=P.vibDepth;   // 音分
      lfo.connect(lg); lfo.start(t); lfo.stop(t+dur+0.05);
      [[1,P.gain],[2,P.gain*P.woody]].forEach(([m,peak])=>{
        const o=actx.createOscillator(), g=actx.createGain();
        o.type='sine'; o.frequency.value=hz*m; lg.connect(o.detune);
        const rel=Math.min(P.release,dur*0.4), sus=Math.max(t+P.attack,t+dur-rel);
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(peak,Math.min(t+P.attack,t+dur*0.5));
        g.gain.setValueAtTime(peak,sus);
        g.gain.linearRampToValueAtTime(0,t+dur);
        o.connect(g); g.connect(out); o.start(t); o.stop(t+dur+0.05);
      });
    },
  };

  /* 襯底：根音＋三和弦（三角波、很薄），慢起音不搶旋律前緣。
     根音預設第 3 八度（v1.06.00，Roy：「每個版本都有低沉的咚咚聲」「耳機聽會破音」——
     原本掛第 2 八度＝65Hz，耳機放得出來、筆電喇叭放不出來，低頻能量疊上旋律就削波；
     rootOct 是旋鈕，要更沉自己拉回 2） */
  function chordVoice(key,t,dur,out,P,ratio){
    const r=chordRoot(key);
    const ro=Math.round(P.rootOct==null?3:P.rootOct);
    const notes=[r+ro].concat(TRIAD[key].map(n=>n+(NOTE_BASE[n]<NOTE_BASE[r]?'4':'3')));
    notes.forEach((nm,i)=>{
      const hz=noteHz(nm)*(ratio||1); if(!hz)return;
      osc(i===0?'sine':'triangle',hz,t,dur,i===0?P.root:P.triad,P.attack,t+dur*0.98,out);
    });
  }

  function stop(){
    curT0=0; curLen=0;
    if(endTimer){ clearTimeout(endTimer); endTimer=null; }
    if(schedTimer){ clearTimeout(schedTimer); schedTimer=null; }
    if(master){ try{master.disconnect();}catch(e){} master=null; }  // 已排程的音一起切掉
  }
  let schedTimer=null;

  /* 低音折疊（v1.11.00，Roy：「有些音色似乎太低……我不知道怎麼修」）。
     診斷：從管弦／鋼琴 MIDI 抽「同格最高音」時，旋律休息的空檔會抽到伴奏軌——
     給愛麗絲因此跨到 G#2、晨歌出現 C1（32Hz，聽不見但會讓喇叭悶住）。
     floorMidi 以下的音整顆往上折八度（可折多次）直到進範圍，旋律線就回到一個音域內。
     **不改曲庫資料**：關掉即還原，所以可以 A/B 比對再決定要不要固化。
     只折旋律——襯底本來就該在下面 */
  function foldUp(midi, floorMidi){
    if(!floorMidi) return midi;
    while(midi < floorMidi) midi += 12;
    return midi;
  }
  const midiOf = n => { const m=/^([A-G])(#?)([0-9])$/.exec(n);
    return m ? 12*(+m[3]+1)+NOTE_BASE[m[1]]+(m[2]?1:0) : 0; };
  const hzOfMidi = m => 440*Math.pow(2,(m-69)/12);

  function play(tune, opts={}){
    stop();
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return 0; } }
    const cfg   = opts.cfg || FALLBACK;
    /* v1.08.00 疊奏混音（Roy：「有沒有可能讓音色同時作用，自己混音？」）：
       voice 可以是字串或陣列，同一條旋律每個音色各奏一層（管弦樂法的 doubling）。
       這不是交響樂——交響是分部各司其職，那需要多聲部曲譜（見藍圖 💡）；
       疊奏是同旋律多層樂器：厚度與亮度，即開即用 */
    const voices = [].concat(opts.voice||'crystal').filter(v=>VOICES[v]);
    if(!voices.length) voices.push('crystal');
    const beat  = 60/(tune.bpm || cfg.play.bpm);
    const cap   = opts.beats || Infinity;
    const t0    = actx.currentTime + 0.08;

    master = actx.createGain();
    master.gain.value = cfg.play.volume / Math.sqrt(voices.length);   // 疊幾層就退幾分，剩下交給壓縮器
    master.connect(ensureLimiter());
    /* 每個音色自己的匯流排：帶 echoTime 的掛回聲（乾聲照走），其餘直通 master。
       和聲襯底永遠走 master 乾聲，地板不能跟著飄 */
    const buses = voices.map(v=>{
      const P=cfg.voices[v];
      let out=master;
      if(P.echoTime > 0){
        const bus=actx.createGain(), dl=actx.createDelay(2), fb=actx.createGain(), wet=actx.createGain();
        dl.delayTime.value=P.echoTime; fb.gain.value=Math.min(0.9,P.echoFb||0); wet.gain.value=P.echoMix||0;
        bus.connect(master);
        bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(master);
        out=bus;
      }
      return {v, P, out};
    });

    /* 全域移調（v1.11.00，Roy：「有些音色似乎太低……可是我不知道怎麼修」）：
       半音數，旋律與襯底一起移，和聲關係不變。整首偏低就整首搬上去，不用改資料 */
    const xpose=Math.round(cfg.play.transpose||0), ratio=Math.pow(2,xpose/12);

    // 襯底厚度：取各層音色中最大的 padScale（有任何一層要地板就給地板；全是水晶＝無襯底）
    const pad = Math.max(...buses.map(b=>b.P.padScale==null?1:b.P.padScale));
    const CH = { root:cfg.chord.root*pad, triad:cfg.chord.triad*pad, attack:cfg.chord.attack,
                 rootOct:cfg.chord.rootOct };

    /* v1.06.00 分段排程：先把整首算成事件表（純資料，快），再以 look-ahead 每秒
       把「接下來 5 秒」排進 WebAudio。全曲一次排的舊做法在小夜曲全樂章（2600 事件）
       實測凍 622ms——長樂章進庫後這不再是理論問題。發聲時間仍是絕對時間軸，取樣級準確 */
    const events=[];   // {at:相對 t0 的秒數, run:排程呼叫}
    if(cfg.play.chords && tune.chords!==false && Array.isArray(tune.chords)){
      let ct=0, cb=0;
      for(const c of tune.chords){
        if(cb>=cap)break;
        const at=ct, dur=c[1]*beat, key=c[0];
        events.push({at, run:()=>chordVoice(key,t0+at,dur,master,CH,ratio)});
        ct+=dur; cb+=c[1];
      }
    }
    const autoChord = cfg.play.chords && tune.chords!==false && !Array.isArray(tune.chords);
    const BAR = tune.chordBars || cfg.play.chordBars;

    let t=0, played=0, barT=0, barNames=[], barLen=0, lastDur=0;
    const flushBar=()=>{
      if(barLen<=0)return;
      if(autoChord && barNames.length){
        const at=barT, dur=barLen*beat, key=chordFor(barNames);
        events.push({at, run:()=>chordVoice(key,t0+at,dur,master,CH,ratio)});
      }
      barT+=barLen*beat; barNames=[]; barLen=0;
    };
    for(const n of tune.notes){
      if(played>=cap)break;
      const dur=n[1]*beat;
      if(n[0]){
        const at=t, hz=hzOfMidi(foldUp(midiOf(n[0]), Math.round(cfg.play.floorMidi||0)));
        lastDur=dur;
        events.push({at, run:()=>buses.forEach(b=>VOICES[b.v](hz*ratio,t0+at,dur,b.out,b.P))});
        barNames.push(n[0][0]);
      }
      t+=dur; played+=n[1]; barLen+=n[1];
      if(barLen>=BAR)flushBar();
    }
    flushBar();
    events.sort((a,b)=>a.at-b.at);   // 和聲事件與旋律事件交錯，排一次

    const HORIZON=10;  // 秒；look-ahead 窗（拉到 10 秒：背景分頁的 setTimeout 會被節流，多一倍緩衝）
    let idx=0;
    const pump=()=>{
      schedTimer=null;
      const until=actx.currentTime-t0+HORIZON;
      while(idx<events.length && events[idx].at<=until){ events[idx].run(); idx++; }
      if(idx<events.length) schedTimer=setTimeout(pump,1000);
    };
    pump();

    /* 尾音緩衝（v1.12.00，Roy：「有時候覺得某些歌沒唱完就下一首」）。
       `t` 只是音符時值的總和，但最後一顆音實際還在響：水晶的 ring 是 3.5 倍音長、
       回聲鏈還要再拖幾輪。onend 若照 t 觸發，下一首的 stop() 就把尾音硬切——
       實測小星星水晶版被切掉 1.44 秒、搖籃曲 1.88 秒。改成等尾音真的消失才換曲。
       上限 4 秒：曲子之間不該留出一段空白 */
    const tail=Math.min(4, Math.max(0, ...buses.map(b=>{
      const P=b.P;
      return (P.ring ? lastDur*(Math.max(1,P.ring)-1) : 0)
           + (P.release || 0.05)
           + (P.echoTime>0 ? P.echoTime*4 : 0);      // 回授 0.45^4≈4%，已經聽不見
    })));
    curT0=t0; curLen=t+tail; curTail=tail;
    if(opts.onend) endTimer=setTimeout(opts.onend,(t0+t+tail-actx.currentTime)*1000);
    return t;   // 這一次播放的長度（秒），呼叫端排 UI 用
  }

  /* 簡譜 → tune（v1.10.00，Roy：「3.1415926，圓周率當樂譜！我想要輸入簡譜就能發音」）。
     語法（一個字元一個動作，空白與分隔符忽略）：
       1–7  音級（C 大調：1=C 2=D 3=E 4=F 5=G 6=A 7=B）      0  休止
       ^ 或 '  下一顆音升八度   _ 或 ,  下一顆音降八度（可疊，^^ 升兩個）
       #  升半音   b  降半音                                 -  延長前一顆音一拍
       .  前一顆音加半拍（附點）  /  前一顆音減半（八分）；//＝十六分
       8 9  圓周率的數字裡本來就會出現，當作 1 與 2 的高八度（8=1̇、9=2̇）——數字當譜的慣例
     其餘字元（小數點以外的標點、字母、換行）一律略過，所以「3.1415926」貼進來直接能唱 */
  const DEGREE={1:0,2:2,3:4,4:5,5:7,6:9,7:11, 8:12, 9:14};
  /* 16 進位模式（v1.11.00，Roy：「簡譜能不能用 16 進位制？」）：0–F 十六個符號各給一個音。
     兩種對應——`scale`（預設）走音階梯，C 大調往上十六個音階音（兩個八度多兩階），
     隨便一串雜湊都還在調上；`chroma` 走半音階（忠於進位制，但無調性、比較前衛）。
     16 進位模式下 0 是音不是休止、b 是數字不是降記號（其餘語法糖照舊） */
  const HEX_SCALE=[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24,26];
  function fromJianpu(text, opts={}){
    const base=opts.base==null?4:opts.base;          // 1 落在第幾八度（C4＝中央 C）
    const hex=+opts.radix===16, hexMode=opts.hexMode||'scale';
    const notes=[]; let oct=0, acc=0;
    const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const push=semi=>{
      const midi=12*(base+1)+semi+12*oct, m=((midi%12)+12)%12;
      notes.push([NAMES[m]+(Math.floor(midi/12)-1), 1]); oct=0; acc=0;
    };
    for(const ch0 of String(text)){
      const ch=ch0;
      if(hex){
        const v=parseInt(ch,16);
        if(!isNaN(v)&&/^[0-9a-fA-F]$/.test(ch)){ push(hexMode==='chroma'?v:HEX_SCALE[v]); continue; }
      }
      if(ch==='^'||ch==="'"){oct++;continue;}
      if(ch==='_'||ch===','){oct--;continue;}
      if(ch==='#'){acc=1;continue;}
      if(ch==='b'){acc=-1;continue;}
      if(ch==='-'){ if(notes.length) notes[notes.length-1][1]+=1; continue; }
      if(ch==='.'){ if(notes.length) notes[notes.length-1][1]*=1.5; continue; }
      if(ch==='/'){ if(notes.length) notes[notes.length-1][1]/=2; continue; }
      if(ch==='0'){ notes.push([null,1]); oct=0; acc=0; continue; }
      if(ch>='1'&&ch<='9'){
        const semi=DEGREE[ch]+acc, midi=12*(base+1)+semi+12*oct;
        const m=((midi%12)+12)%12, o=Math.floor(midi/12)-1;
        notes.push([NAMES[m]+o, 1]); oct=0; acc=0;
      }
      // 其他字元：略過
    }
    return { id:'jianpu', name:opts.name||'簡譜', composer:opts.composer||'即興', bpm:opts.bpm||120,
             chords:opts.chords===undefined?false:opts.chords, notes };
  }

  /* tune → 簡譜 token（v1.11.00，Roy：「播放的時候下面就顯示簡譜」）。
     每個 token：{d 音級字元, acc 升降, oct 八度偏移（＋高／－低，UI 畫點）,
                  beats 拍數, at 起拍, sec 起秒, dur 秒, i 原始 notes 索引}
     **這也是「音太低」的診斷儀**：低八度在簡譜上就是數字底下的點，一排點就是一排低音。
     base 自動挑：讓最多音落在無點的中央八度（多數曲子＝C4，移調過的曲子也讀得順） */
  const SEMI2JP=[['1',''],['1','#'],['2',''],['2','#'],['3',''],['4',''],['4','#'],
                 ['5',''],['5','#'],['6',''],['6','#'],['7','']];
  function toJianpu(tune, opts={}){
    const beat=60/(tune.bpm||120);
    const floorMidi=Math.round(opts.floorMidi||0);   // 跟播放套同一條規則，否則看到的跟聽到的不一樣
    const midis=tune.notes.filter(n=>n[0]).map(n=>foldUp(midiOf(n[0]),floorMidi));
    let base=opts.base;
    if(base==null){   // 中位數所在的八度當中央，點最少
      const sorted=midis.slice().sort((a,b)=>a-b);
      const mid=sorted.length?sorted[Math.floor(sorted.length/2)]:60;
      base=Math.floor(mid/12)-1;
    }
    const out=[]; let at=0, si=0;
    tune.notes.forEach((n,i)=>{
      const beats=n[1];
      if(n[0]){
        const midi=foldUp(midiOf(n[0]),floorMidi);
        const rel=midi-12*(base+1), oct=Math.floor(rel/12), jp=SEMI2JP[((rel%12)+12)%12];
        out.push({d:jp[0], acc:jp[1], oct, beats, at, sec:si, dur:beats*beat, i});
      } else out.push({d:'0', acc:'', oct:0, beats, at, sec:si, dur:beats*beat, i});
      at+=beats; si+=beats*beat;
    });
    return { base, beat, tokens:out, seconds:si };
  }

  /* 目前播到第幾秒（相對曲首）；沒在播回 -1。UI 每幀問它決定高亮哪一顆 */
  function position(){
    if(!actx||!curT0) return -1;
    const p=actx.currentTime-curT0;
    return (p<0||p>curLen+0.5) ? -1 : p;
  }

  return { play, stop, noteHz, fromJianpu, toJianpu, position,
           tail:()=>curTail,   // 上一次播放算出的尾音緩衝（秒）——自檢台用它守這條回歸
           voices:Object.keys(VOICES) };
})();
