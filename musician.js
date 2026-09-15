/* musician.js —— 音樂家引擎 v1：曲譜資料 × 音色合成（WebAudio，零檔案零授權）

   用法（任何專案複製本檔即可，跟 designer-panel.js 一樣不要跨資料夾引用）：
     Musician.play(tune, { voice:'piano', cfg:CONFIG, beats:8, onend:fn })
       tune  ＝ { name, bpm, notes:[[音名,拍數],…], chords }（格式見 config.js 的 TUNES）
       voice ＝ 'chip' | 'crystal' | 'piano'（預設 crystal）
       cfg   ＝ CONFIG 形狀的參數物件（play/voices/chord 三區）；不給就用內建保底值
       beats ＝ 只播前 N 拍（辨認遊戲的「猜歌難度」就是這個數字）；省略＝整首
       onend ＝ 播完呼叫（自然結束才叫，stop() 打斷不叫）
     Musician.stop()

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
             crystal:{main:0.8,shimmer:0.2,attack:0.02},
             piano:{h1:0.7,h2:0.35,h3:0.12,h4:0.05,attack:0.008} },
    chord: { root:0.30, triad:0.13, attack:0.18 },
  };

  let actx=null, master=null, endTimer=null;

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
  };

  // 襯底：根音低八度（正弦、稍厚）＋三和弦（三角波、很薄），慢起音不搶旋律前緣
  function chordVoice(key,t,dur,out,P){
    const r=chordRoot(key);
    const notes=[r+'2'].concat(TRIAD[key].map(n=>n+(NOTE_BASE[n]<NOTE_BASE[r]?'4':'3')));
    notes.forEach((nm,i)=>{
      const hz=noteHz(nm); if(!hz)return;
      osc(i===0?'sine':'triangle',hz,t,dur,i===0?P.root:P.triad,P.attack,t+dur*0.98,out);
    });
  }

  function stop(){
    if(endTimer){ clearTimeout(endTimer); endTimer=null; }
    if(master){ try{master.disconnect();}catch(e){} master=null; }  // 已排程的音一起切掉
  }

  function play(tune, opts={}){
    stop();
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return 0; } }
    const cfg   = opts.cfg || FALLBACK;
    const voice = VOICES[opts.voice] ? opts.voice : 'crystal';
    const P     = cfg.voices[voice];
    const beat  = 60/(tune.bpm || cfg.play.bpm);
    const cap   = opts.beats || Infinity;
    const t0    = actx.currentTime + 0.08;

    master = actx.createGain();
    master.gain.value = cfg.play.volume;
    master.connect(actx.destination);
    /* 旋律匯流排：音色參數帶 echoTime 就掛一條回聲（delay＋回授），乾聲照走。
       只掛旋律——和聲襯底走 master 保持乾聲，地板不能跟著飄 */
    let out = master;   // stop() 之後 master 會換新，排程閉包要抓住自己那一顆
    if(P.echoTime > 0){
      const bus=actx.createGain(), dl=actx.createDelay(2), fb=actx.createGain(), wet=actx.createGain();
      dl.delayTime.value=P.echoTime; fb.gain.value=Math.min(0.9,P.echoFb||0); wet.gain.value=P.echoMix||0;
      bus.connect(master);                       // 乾聲
      bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(master);
      out=bus;
    }

    // 襯底厚度可由音色縮放（水晶要浮起來，襯底就得讓開）
    const pad = P.padScale==null ? 1 : P.padScale;
    const CH = { root:cfg.chord.root*pad, triad:cfg.chord.triad*pad, attack:cfg.chord.attack };
    // 自帶和聲進行照它走；沒帶才逐小節自動配；chords:false 一律不配
    if(cfg.play.chords && tune.chords!==false && Array.isArray(tune.chords)){
      let ct=t0, cb=0;
      for(const c of tune.chords){ if(cb>=cap)break; chordVoice(c[0],ct,c[1]*beat,master,CH); ct+=c[1]*beat; cb+=c[1]; }
    }
    const autoChord = cfg.play.chords && tune.chords!==false && !Array.isArray(tune.chords);
    const BAR = tune.chordBars || cfg.play.chordBars;

    let t=t0, played=0, barT=t0, barNames=[], barLen=0;
    const flushBar=()=>{
      if(barLen<=0)return;
      if(autoChord && barNames.length) chordVoice(chordFor(barNames),barT,barLen*beat,master,CH);
      barT+=barLen*beat; barNames=[]; barLen=0;
    };
    for(const n of tune.notes){
      if(played>=cap)break;
      const dur=n[1]*beat;
      if(n[0]){ VOICES[voice](noteHz(n[0]),t,dur,out,P); barNames.push(n[0][0]); }
      t+=dur; played+=n[1]; barLen+=n[1];
      if(barLen>=BAR)flushBar();
    }
    flushBar();

    if(opts.onend) endTimer=setTimeout(opts.onend,(t-actx.currentTime)*1000);
    return t-t0;   // 這一次播放的長度（秒），呼叫端排 UI 用
  }

  return { play, stop, noteHz, voices:Object.keys(VOICES) };
})();
