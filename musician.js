/* musician.js —— 音樂家引擎 v1：曲譜資料 × 音色合成（WebAudio，零檔案零授權）

   用法（任何專案複製本檔即可，跟 designer-panel.js 一樣不要跨資料夾引用）：
     Musician.play(tune, { voice:'piano', cfg:CONFIG, beats:8, onend:fn })
       tune  ＝ { name, bpm, notes:[[音名,拍數],…], chords }（格式見 config.js 的 TUNES）
       voice ＝ 'chip' | 'crystal' | 'piano'（預設 crystal）
       cfg   ＝ CONFIG 形狀的參數物件（play/voices/chord 三區）；不給就用內建保底值
       beats ＝ 只播前 N 拍（辨認遊戲的「猜歌難度」就是這個數字）；省略＝整首
       onend ＝ 播完呼叫（自然結束才叫，stop() 打斷不叫）
     Musician.stop()
     多聲部：tune 帶 parts:[{name,voice,vol,pan,mute,solo,shift,offset,rep,notes|jp}] 就走分部路徑
       （呼叫方式不變）；Musician.setPart(i,{vol,mute,solo}) 播放中即時調軌（見 playParts）
     Musician.fromJianpu('3.1415926', {bpm, base, name, radix:16, hexMode})  → tune（簡譜字串直接變曲）
     Musician.toJianpu(tune)  → {base, tokens:[{d,acc,oct,beats,at,sec,dur}], seconds}（顯示用）
     Musician.position()      → 目前播到第幾秒（沒在播 -1）
     Musician.setMuted(true)  → 靜音（播放中立刻生效）；Musician.muted 讀狀態

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
             flute:{gain:0.22,woody:0.12,attack:0.06,release:0.12,vibRate:5,vibDepth:9},
             brass:{gain:0.10,attack:0.07,release:0.12,bright:5,detune:4},
             choir:{gain:0.10,attack:0.25,release:0.30,vowel1:800,vowel2:1150,vibRate:5,vibDepth:12},
             timpani:{gain:0.70,drop:1.35,dropTime:0.07,decay:1.1,thump:0.5},
             harp:{gain:0.35,decay:1.8,h2:0.4,h3:0.15},
             shamisen:{gain:0.55,decay:1.0,bright:0.85,sawari:3,bachi:0.25},
             guzheng:{gain:0.55,decay:2.6,bright:0.45,vibDelay:0.25,vibRate:5.5,vibDepth:18} },
    chord: { root:0.30, triad:0.13, attack:0.18 },
  };

  let actx=null, master=null, endTimer=null, limiter=null, muteGain=null, userMuted=false;
  let curT0=0, curLen=0, curTail=0;   // 這次播放的絕對起點與長度（秒）——position() 用，UI 靠它高亮簡譜
  /* 防削波保險（v1.06.00，Roy：「耳機聽咚咚聲會破音」）：所有聲音過一顆壓縮器再出門。
     多聲部＋回聲＋襯底的瞬時總和很容易超過 1.0，超過就是硬削波＝破音；
     壓縮器把峰值軟著陸。每個 AudioContext 建一次，常駐 */
  function ensureLimiter(){
    if(limiter) return limiter;
    limiter=actx.createDynamicsCompressor();
    limiter.threshold.value=-12; limiter.knee.value=24; limiter.ratio.value=6;
    limiter.attack.value=0.003; limiter.release.value=0.25;
    /* 靜音閘（v1.13.00，全站音響盤點：音樂播放器竟然沒有靜音鈕）。
       常駐在 limiter 與喇叭之間，所以播放中按下去立刻生效——
       整首是預先排程的，改 CONFIG.play.volume 只對「下一次播放」有效，那不叫靜音鈕。 */
    muteGain=actx.createGain();
    muteGain.gain.value=userMuted?0:1;
    limiter.connect(muteGain);
    muteGain.connect(actx.destination);
    return limiter;
  }
  /* 靜音狀態由呼叫端保存（試聽台記在 localStorage），引擎只管開關 */
  function setMuted(v){
    userMuted=!!v;
    if(muteGain) muteGain.gain.setTargetAtTime(userMuted?0:1, actx.currentTime, 0.01);
    return userMuted;
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
    /* ── 多聲部用的四個新音色（v1.15.00，Master 的史詩配樂）──
       素材庫 D:\game_art 沒有可演奏的管弦取樣（只有音效與成品配樂），所以這四個一樣是合成。
       銅管：鋸齒波＋低通濾波「漸開」（嘴唇起振，亮度隨氣息打開）——銅管的靈魂是亮度包絡不是音量 */
    brass(hz,t,dur,out,P){
      const f=actx.createBiquadFilter(); f.type='lowpass'; f.connect(out);
      f.frequency.setValueAtTime(hz*1.2,t);
      f.frequency.linearRampToValueAtTime(Math.min(hz*P.bright,12000),t+P.attack+0.10);
      [-P.detune,P.detune].forEach(dt=>{
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
    /* 合唱：三把失諧鋸齒（人群）過兩個帶通濾波＝「啊」的母音共振峰（vowel1/vowel2 Hz）；
       慢起音＋顫音。vowel 改成 400/800 是「喔」，300/2300 是「衣」 */
    choir(hz,t,dur,out,P){
      const lfo=actx.createOscillator(), lg=actx.createGain();
      lfo.frequency.value=P.vibRate; lg.gain.value=P.vibDepth; lfo.connect(lg); lfo.start(t); lfo.stop(t+dur+0.05);
      const mix=actx.createGain();
      [P.vowel1,P.vowel2].forEach(fc=>{
        const b=actx.createBiquadFilter(); b.type='bandpass'; b.frequency.value=fc; b.Q.value=5;
        mix.connect(b); b.connect(out);
      });
      [-9,0,9].forEach(dt=>{
        const o=actx.createOscillator(), g=actx.createGain();
        o.type='sawtooth'; o.frequency.value=hz; o.detune.value=dt; lg.connect(o.detune);
        const peak=P.gain*3, rel=Math.min(P.release,dur*0.4), sus=Math.max(t+P.attack,t+dur-rel);
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(peak,Math.min(t+P.attack,t+dur*0.5));
        g.gain.setValueAtTime(peak,sus);
        g.gain.linearRampToValueAtTime(0,t+dur);
        o.connect(g); g.connect(mix); o.start(t); o.stop(t+dur+0.05);
      });
    },
    /* 定音鼓：正弦從 drop 倍音高快速滑到本音（皮面被敲的瞬間張力）＋一小口低通噪音（槌擊）；
       衰減由 decay 管、不跟音符長度走（鼓敲了就響那麼久） */
    timpani(hz,t,dur,out,P){
      const o=actx.createOscillator(), g=actx.createGain();
      o.type='sine'; o.frequency.setValueAtTime(hz*P.drop,t);
      o.frequency.exponentialRampToValueAtTime(hz,t+P.dropTime);
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(P.gain,t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0008,t+P.decay);
      o.connect(g); g.connect(out); o.start(t); o.stop(t+P.decay+0.05);
      if(P.thump>0){
        if(!noiseBuf){ noiseBuf=actx.createBuffer(1,Math.floor(actx.sampleRate*0.06),actx.sampleRate);
          const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; }
        const n=actx.createBufferSource(), nf=actx.createBiquadFilter(), ng=actx.createGain();
        n.buffer=noiseBuf; nf.type='lowpass'; nf.frequency.value=500;
        ng.gain.setValueAtTime(P.gain*P.thump,t); ng.gain.exponentialRampToValueAtTime(0.0008,t+0.06);
        n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t);
      }
    },
    // 豎琴：撥弦——瞬間起音、基音＋2/3 倍泛音，指數衰減（decay 秒，不跟音符長度走）
    harp(hz,t,dur,out,P){
      [[1,P.gain,1],[2,P.gain*P.h2,0.55],[3,P.gain*P.h3,0.35]].forEach(([m,pk,k])=>
        osc('sine',hz*m,t,P.decay*k+0.05,pk,0.003,t+P.decay*k,out));
    },
    /* ── 撥弦兩兄弟（v1.18.00，Master：「三味線版！古箏版！」）──
       Karplus-Strong 撥弦合成：一小段雜訊在長度＝一個週期的環裡反覆平均，高頻先死、基音留下——
       這就是真的弦被撥開後的物理樣子。比加法合成（豎琴）更像「撥」。
       bright＝平均的比例（1＝不平均＝金屬感長亮；0.4＝溫潤）；decay＝60dB 衰減秒數。
       三味線：亮、短，過一顆 tanh 失真＝さわり（sawari，琴頸的嗡嗡震）＋撥子（bachi）擊皮的「啪」；
       古箏：暗一點、長餘韻，發音後 vibDelay 秒開始揉弦（左手按弦的顫音，detune LFO）。 */
    shamisen(hz,t,dur,out,P){
      const src=pluck(hz,P,'sh'), sh=actx.createWaveShaper(), g=actx.createGain();
      sh.curve=sawariCurve(P.sawari); g.gain.value=P.gain;
      src.connect(sh); sh.connect(g); g.connect(out); src.start(t); src.stop(t+P.decay);
      if(P.bachi>0){
        if(!noiseBuf){ noiseBuf=actx.createBuffer(1,Math.floor(actx.sampleRate*0.06),actx.sampleRate);
          const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; }
        const n=actx.createBufferSource(), hp=actx.createBiquadFilter(), ng=actx.createGain();
        n.buffer=noiseBuf; hp.type='highpass'; hp.frequency.value=1800;
        ng.gain.setValueAtTime(P.gain*P.bachi,t); ng.gain.exponentialRampToValueAtTime(0.0008,t+0.03);
        n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t);
      }
    },
    guzheng(hz,t,dur,out,P){
      const src=pluck(hz,P,'gz'), g=actx.createGain();
      g.gain.value=P.gain; src.connect(g); g.connect(out);
      const lfo=actx.createOscillator(), lg=actx.createGain();
      lfo.frequency.value=P.vibRate; lg.gain.setValueAtTime(0,t);
      lg.gain.linearRampToValueAtTime(P.vibDepth,t+P.vibDelay+0.3);   // 揉弦是發音後才開始
      lfo.connect(lg); lg.connect(src.detune); lfo.start(t); lfo.stop(t+P.decay);
      src.start(t); src.stop(t+P.decay);
    },
  };
  /* Karplus-Strong 緩衝：同音高＋同參數算一次就快取（一顆音 1～3 秒的 Float32）。
     環長取整數會走音，用 playbackRate 補回：實測週期＝N－(1－bright)/2 取樣（平均濾波讀的是「下一格」，週期變短；
     scratch 驗算 b=0.85/0.45/0 × N=109/54 全吻合到 0.01 取樣）。
     ponytail: 快取上限 96 筆、滿了整個清掉；要更省就改 LRU */
  const ksCache=new Map();
  function pluck(hz,P,tag){
    const sr=actx.sampleRate, sh=(1-P.bright)/2, N=Math.max(2,Math.round(sr/hz+sh)), per=N-sh;
    const key=tag+N+'|'+P.decay+'|'+P.bright;
    let buf=ksCache.get(key);
    if(!buf){
      if(ksCache.size>96) ksCache.clear();
      const len=Math.floor(sr*P.decay), loopG=Math.pow(0.001,1/((sr/per)*P.decay)), b=P.bright;
      buf=actx.createBuffer(1,len,sr); const d=buf.getChannelData(0), ring=new Float32Array(N);
      for(let i=0;i<N;i++) ring[i]=Math.random()*2-1;
      for(let i=0,p=0;i<len;i++){ const cur=ring[p], nxt=ring[(p+1)%N];
        d[i]=cur; ring[p]=(b*cur+(1-b)*0.5*(cur+nxt))*loopG; p=(p+1)%N; }
      ksCache.set(key,buf);
    }
    const src=actx.createBufferSource(); src.buffer=buf;
    src.playbackRate.value=hz*per/sr;
    return src;
  }

  /* ── 真樂器取樣（v1.19.00，Master：「真實樂器的音色取樣……可以重新搜尋嗎」）──
     素材庫 D:\game_art 沒有可演奏的樂器單音；改用 VSCO 2 Community Edition（Versilian Studios，CC0）
     50 取樣精簡包，轉成 samples/vsco/*.mp3（檔名＝實測 MIDI 音高）。
     setSamples(CONFIG.samples, 'samples/vsco/') 把每組取樣註冊成一個音色：挑最近的取樣、playbackRate 移調。
     perc:true＝打擊組（音級挑樂器：1 定音鼓低 2 定音鼓 3 小鼓 4 小鼓滾奏 5 銅鈸 6 鑼 7 吊鈸漸強，原速不移調）；
     oneShot:true＝敲／撥一下就讓它自然響完（豎琴、馬林巴），其餘照音符長度＋release 收音。
     載入是非同步的：play() 發現要用的取樣還沒到，就先下載、到了再自動開播（期間 position() 回 0）。 */
  const sampleBank={}; let sampleBase='', pendingTok=0, pending=false;
  function setSamples(defs, base){
    sampleBase=base||'';
    for(const id in (defs||{})){ sampleBank[id]={def:defs[id]}; VOICES[id]=(hz,t,dur,out,P)=>playSample(id,hz,t,dur,out,P); }
  }
  function loadSample(id){
    const b=sampleBank[id]; if(b.p) return b.p;
    return b.p=Promise.all(b.def.files.map(([f,m])=>fetch(sampleBase+f).then(r=>{ if(!r.ok) throw new Error(f+' '+r.status); return r.arrayBuffer(); })
        .then(a=>actx.decodeAudioData(a)).then(buf=>({midi:m,buf}))))
      .then(list=>{ b.bufs=list.sort((x,y)=>x.midi-y.midi); b.ready=true; })
      .catch(e=>{ b.p=null; console.warn('[Musician] 取樣載入失敗：'+id, e); throw e; });
  }
  function playSample(id,hz,t,dur,out,P){
    const b=sampleBank[id]; if(!b||!b.ready) return;
    const def=b.def, midi=69+12*Math.log2(hz/440);
    let s, rate=1;
    if(def.perc){ const deg=[0,0,1,1,2,3,3,4,4,5,5,6][((Math.round(midi)%12)+12)%12]; s=b.bufs[deg%b.bufs.length]; }
    else { s=b.bufs.reduce((a,c)=>Math.abs(c.midi-midi)<Math.abs(a.midi-midi)?c:a); rate=Math.pow(2,(midi-s.midi)/12); }
    const src=actx.createBufferSource(), g=actx.createGain();
    src.buffer=s.buf; src.playbackRate.value=rate;
    const full=s.buf.duration/rate, rel=P.release||0.2;
    g.gain.setValueAtTime(P.gain,t);
    if(def.perc||def.oneShot){ src.start(t); src.stop(t+full); }
    else { const end=t+Math.min(dur,full); g.gain.setValueAtTime(P.gain,Math.max(t,end-0.01));
      g.gain.exponentialRampToValueAtTime(0.0008,end+rel); src.start(t); src.stop(Math.min(t+full,end+rel+0.05)); }
    src.connect(g); g.connect(out);
  }
  const sawariCache={};
  function sawariCurve(k){
    if(sawariCache[k]) return sawariCache[k];
    const c=new Float32Array(1024); for(let i=0;i<1024;i++){ const x=i/511.5-1; c[i]=Math.tanh(k*x)/Math.tanh(k); }
    return sawariCache[k]=c;
  }

  let noiseBuf=null;

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
    curT0=0; curLen=0; pendingTok++; pending=false;
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

  /* ── 多聲部（v1.15.00，Master 的史詩配樂；藍圖 💡「真交響」兌現）──
     tune.parts = [{ name, voice, vol, pan, mute, solo, shift, offset, rep, notes | jp }]
       notes：同單旋律格式 [[音名,拍數],…]；jp：簡譜字串（引擎現場轉 notes，Master 直接貼譜）
       shift：整軌移調半音　offset：晚幾拍進場　rep：整軌重複幾遍（低音節奏型的 4 小節寫一次）
     每軌自己一條時間線、自己一個音量／左右位置閘，所以「疊加與對位」＝各軌各寫各的。
     不配自動和聲（分部本身就是和聲）；沒有 parts 的舊曲走原路徑，一個字節都沒動。
     ponytail: 分部路徑不掛水晶的回聲匯流排（天花板；要的話把 play() 的 buses 邏輯抽出來共用） */
  let partBus=[];
  function partGain(i){
    const any=partBus.some(b=>b.solo);
    const b=partBus[i]; return (any ? b.solo : !b.mute) ? b.vol : 0;
  }
  function setPart(i, st){          // 播放中即時生效：{vol, mute, solo}
    const b=partBus[i]; if(!b) return;
    Object.assign(b, st);
    partBus.forEach((x,j)=>x.g.gain.setTargetAtTime(partGain(j), actx.currentTime, 0.02));
  }
  function playParts(tune, opts, cfg){
    const beat=60/(tune.bpm||cfg.play.bpm), cap=opts.beats||Infinity, t0=actx.currentTime+0.08;
    const xpose=Math.round(cfg.play.transpose||0), ratio=Math.pow(2,xpose/12);
    master=actx.createGain();
    master.gain.value=cfg.play.volume/Math.sqrt(tune.parts.length);
    master.connect(ensureLimiter());
    const events=[]; let total=0, tail=0;
    partBus=tune.parts.map((p,i)=>{
      const v=VOICES[p.voice]?p.voice:'piano', P=(cfg.voices&&cfg.voices[v])||FALLBACK.voices[v];
      const g=actx.createGain(); let out=g;
      if(actx.createStereoPanner){ const pn=actx.createStereoPanner(); pn.pan.value=p.pan||0; g.connect(pn); pn.connect(master); }
      else g.connect(master);
      const src=p.notes||fromJianpu(p.jp||'').notes;
      const shiftR=Math.pow(2,(p.shift||0)/12);
      let t=(p.offset||0)*beat, played=(p.offset||0), lastDur=0;
      for(let r=0;r<(p.rep||1);r++) for(const n of src){
        if(played>=cap)break;
        const dur=n[1]*beat;
        if(n[0]){ const at=t, hz=hzOfMidi(midiOf(n[0]))*ratio*shiftR; lastDur=dur;
          events.push({at, run:()=>VOICES[v](hz,t0+at,dur,out,P)}); }
        t+=dur; played+=n[1];
      }
      total=Math.max(total,t);
      tail=Math.max(tail,(P.release||P.decay||0.05)+(P.ring?lastDur*(Math.max(1,P.ring)-1):0));
      const b={g, vol:p.vol==null?1:p.vol, mute:!!p.mute, solo:!!p.solo};
      return b;
    });
    partBus.forEach((b,j)=>b.g.gain.value=partGain(j));
    events.sort((a,b)=>a.at-b.at);
    const HORIZON=10; let idx=0;
    const pump=()=>{
      schedTimer=null;
      const until=actx.currentTime-t0+HORIZON;
      while(idx<events.length && events[idx].at<=until){ events[idx].run(); idx++; }
      if(idx<events.length) schedTimer=setTimeout(pump,1000);
    };
    pump();
    tail=Math.min(4,tail);
    curT0=t0; curLen=total+tail; curTail=tail;
    if(opts.onend) endTimer=setTimeout(opts.onend,(t0+total+tail-actx.currentTime)*1000);
    return total;
  }


  /* 單音即時發聲（v1.21.00，電腦鍵盤當琴彈）：不打斷正在播的曲子，自己一條 gain 直通壓縮器。
     取樣音色第一次用到要先下載，到了才響（那一下會晚一點） */
  function noteNow(midi, opts={}){
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; } }
    if(actx.state==='suspended') actx.resume().catch(()=>{});
    const cfg=opts.cfg||FALLBACK, v=VOICES[opts.voice]?opts.voice:'piano';
    const go=()=>{ const P=(cfg.voices&&cfg.voices[v])||FALLBACK.voices[v], g=actx.createGain();
      g.gain.value=cfg.play.volume; g.connect(ensureLimiter());
      VOICES[v](hzOfMidi(midi), actx.currentTime+0.01, opts.dur||0.4, g, P); };
    if(sampleBank[v]&&!sampleBank[v].ready) loadSample(v).then(go,()=>{}); else go();
  }

  function play(tune, opts={}){
    stop();
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return 0; } }
    /* 延後建立不等於一定在跑：分頁自動播放政策、切背景回來、系統節能都會讓 ctx
       停在 suspended，那時排程照走但一點聲音也沒有。resume 是每次播放的保險。 */
    if(actx.state==='suspended') actx.resume().catch(()=>{});
    const cfg   = opts.cfg || FALLBACK;
    const used=(Array.isArray(tune.parts)?tune.parts.map(p=>p.voice):[].concat(opts.voice||'crystal'))
      .filter(v=>sampleBank[v]&&!sampleBank[v].ready);
    if(used.length){                      // 取樣還沒到：先下載，到了再自動開播（中途 stop() 或換曲就作廢）
      const tok=++pendingTok; pending=true;
      Promise.all(used.map(loadSample)).then(()=>{ if(tok===pendingTok){ pending=false; play(tune,opts); } },
                                             ()=>{ if(tok===pendingTok) pending=false; });
      return 0;
    }
    if(Array.isArray(tune.parts)) return playParts(tune, opts, cfg);
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
           + (P.release || P.decay || 0.05)
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
        out.push({d:jp[0], acc:jp[1], oct, beats, at, sec:si, dur:beats*beat, i, midi});
      } else out.push({d:'0', acc:'', oct:0, beats, at, sec:si, dur:beats*beat, i, midi:null});
      at+=beats; si+=beats*beat;
    });
    return { base, beat, tokens:out, seconds:si };
  }

  /* 目前播到第幾秒（相對曲首）；沒在播回 -1。UI 每幀問它決定高亮哪一顆 */
  function position(){
    if(pending) return 0;                 // 取樣下載中：當作停在開頭
    if(!actx||!curT0) return -1;
    const p=actx.currentTime-curT0;
    /* 開播前 0.08 秒的預備拍（t0＝currentTime+0.08）p 會是負的：回 0 不是 -1。
       舊寫法回 -1，UI 的 rAF 迴圈第一幀就看到「沒在播」而永久退出——簡譜／長條圖開頭不跟著跑（Master 2026-10-16 回報） */
    return p>curLen+0.5 ? -1 : Math.max(0,p);
  }

  return { play, stop, setPart, setSamples, noteNow, noteHz, fromJianpu, toJianpu, position,
           setMuted, get muted(){ return userMuted; },
           tail:()=>curTail,   // 上一次播放算出的尾音緩衝（秒）——自檢台用它守這條回歸
           get voices(){ return Object.keys(VOICES); },
           isSampled:v=>!!sampleBank[v] };
})();
