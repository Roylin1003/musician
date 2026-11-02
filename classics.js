/* classics.js —— 經典公式圖鑑（公式作曲台用）。每條是一軌的資料，點了就載入並播放，讓 Master 聽「這條公式長什麼聲音」。
   kind：pitch＝n→音級（旋律／低音）；pulse＝b→這一拍打幾下（鼓）；wave＝t（秒）、f（本音 Hz）→波形（公式直接當聲音，voice 固定 wave）
   公式只用 musician.js 白名單函數；test-formula.js 會把每一條都編譯＋生成一遍，寫錯會紅燈。 */
const CLASSICS = [
  // ── 旋律：數列與數論 ──
  { g:'數列', name:'等差（爬音階）',      kind:'pitch', f:'n' },
  { g:'數列', name:'費波那契 mod 7',      kind:'pitch', f:'mod(floor(phi^n/sqrt(5)+0.5),7)', note:'比內公式 φⁿ/√5' },
  { g:'數列', name:'平方 mod 9',          kind:'pitch', f:'mod(n*n,9)' },
  { g:'數列', name:'立方 mod 11',         kind:'pitch', f:'mod(n^3,11)' },
  { g:'數列', name:'拋物線（上去再下來）', kind:'pitch', f:'floor(n*(32-n)/16)' },
  { g:'數列', name:'二進位 1 的個數',      kind:'pitch', f:'sum(i,0,7,mod(floor(n/2^i),2))', note:'漢明權重＝謝爾賓斯基的聲音' },
  { g:'數列', name:'Thue–Morse',          kind:'pitch', f:'4*mod(sum(i,0,7,mod(floor(n/2^i),2)),2)+mod(n,4)', note:'沒有任何三連重複的序列' },
  // ── 旋律：波形 ──
  { g:'波形', name:'正弦起伏',            kind:'pitch', f:'7+7*sin(n/3)' },
  { g:'波形', name:'鋸齒',                kind:'pitch', f:'mod(n,8)' },
  { g:'波形', name:'三角波',              kind:'pitch', f:'abs(mod(n,16)-8)' },
  { g:'波形', name:'方波',                kind:'pitch', f:'4+4*mod(floor(n/4),2)' },
  { g:'波形', name:'拍頻（兩個正弦疊加）', kind:'pitch', f:'7+3.5*sin(n*0.5)+3.5*sin(n*0.55)' },
  { g:'波形', name:'高斯鐘形',            kind:'pitch', f:'floor(14*exp(-((mod(n,32)-16)/6)^2))' },
  { g:'波形', name:'阻尼振盪',            kind:'pitch', f:'7+7*exp(-mod(n,24)/8)*cos(mod(n,24))' },
  // ── 旋律：無理數與混沌 ──
  { g:'無理數', name:'黃金比 φ',          kind:'pitch', f:'floor(7*frac(n*phi))', note:'最不規則的準週期' },
  { g:'無理數', name:'√2 準週期',         kind:'pitch', f:'floor(7*frac(n*sqrt(2)))' },
  { g:'無理數', name:'π 的小數',          kind:'pitch', f:'floor(10*frac(pi*n))' },
  { g:'無理數', name:'e 的小數',          kind:'pitch', f:'floor(10*frac(e*n))' },
  { g:'混沌', name:'GLSL 雜湊（偽隨機）', kind:'pitch', f:'floor(14*frac(sin(n*12.9898)*43758.5453))', note:'繪圖界最常抄的亂數公式' },
  { g:'混沌', name:'魏爾斯特拉斯（處處粗糙）', kind:'pitch', f:'7+4*sum(k,0,3,cos(3^k*n)/2^k)' },
  // ── 鼓：節奏 ──
  { g:'節奏', name:'四四拍重擊',          kind:'pulse', f:'1' },
  { g:'節奏', name:'1-2-3-4 加速',        kind:'pulse', f:'1+mod(b,4)', note:'影片 2 號' },
  { g:'節奏', name:'三連音循環',          kind:'pulse', f:'1+mod(b,3)' },
  { g:'節奏', name:'指數爬升（riser）',    kind:'pulse', f:'1+floor(7*(exp(3*x)-1)/(exp(3)-1))', note:'影片 e^x' },
  { g:'節奏', name:'正弦起伏（呼吸）',     kind:'pulse', f:'round(2+2*sin(b/2))' },
  { g:'節奏', name:'Thue–Morse 節奏',     kind:'pulse', f:'1+2*mod(sum(i,0,7,mod(floor(b/2^i),2)),2)' },
  { g:'節奏', name:'費波那契 mod 4',       kind:'pulse', f:'mod(floor(phi^b/sqrt(5)+0.5),4)' },
  // ── 聲音：公式直接當波形 ──
  { g:'音色', name:'純正弦',              kind:'wave', w:'sin(2*pi*f*t)*exp(-t*3)' },
  { g:'音色', name:'方波（傅立葉 10 項）', kind:'wave', w:'0.9*sum(k,0,9,sin(2*pi*(2*k+1)*f*t)/(2*k+1))*exp(-t*2)', note:'奇次泛音 1/n' },
  { g:'音色', name:'鋸齒波（傅立葉 12 項）', kind:'wave', w:'0.8*sum(k,1,12,sin(2*pi*k*f*t)/k)*exp(-t*2)', note:'全部泛音 1/n' },
  { g:'音色', name:'三角波（傅立葉）',     kind:'wave', w:'0.9*sum(k,0,6,(-1)^k*sin(2*pi*(2*k+1)*f*t)/(2*k+1)^2)*exp(-t*2)', note:'奇次泛音 1/n²' },
  { g:'音色', name:'拍頻（差 3 Hz）',      kind:'wave', w:'0.5*(sin(2*pi*f*t)+sin(2*pi*(f+3)*t))*exp(-t*1.5)' },
  { g:'音色', name:'顫音（振幅調變）',     kind:'wave', w:'sin(2*pi*f*t)*(0.6+0.4*sin(2*pi*6*t))*exp(-t*1.5)' },
  { g:'音色', name:'FM 鐘聲（比 1.4）',    kind:'wave', w:'sin(2*pi*f*t+3*exp(-t*3)*sin(2*pi*1.4*f*t))*exp(-t*3)', note:'不和諧比例＝金屬' },
  { g:'音色', name:'hardbass（影片 1 號）', kind:'wave', w:'sin(2*pi*f*t+(0.6+4.4*exp(-t*9))*sin(4*pi*f*t))*exp(-t*3)' },
  { g:'音色', name:'掃頻啾聲（chirp）',    kind:'wave', w:'sin(2*pi*(f*t+30*t*t))*exp(-t*3)' },
  { g:'音色', name:'波形折疊',            kind:'wave', w:'(1-4*abs(frac((4*sin(2*pi*f*t)+1)/4)-0.5))*exp(-t*3)', note:'影片 5 號' },
  { g:'音色', name:'魏爾斯特拉斯波形',     kind:'wave', w:'0.7*sum(k,0,5,0.5^k*sin(2*pi*3^k*f*t))*exp(-t*2)', note:'影片 7 號' },
  { g:'音色', name:'雜訊（亂數 hash）',    kind:'wave', w:'0.7*(frac(sin(t*12345.6)*43758.5453)*2-1)*exp(-t*18)', note:'鼓的噪音部分' },
];

/* 影片重現（YouTube Shorts〈Math Functions That Go Insanely Hard〉，@thelab.67）：影片每一段一個公式，這裡每段是一組軌。
   shown＝影片畫面上寫的公式；caption＝畫面字幕。tracks 欄位同公式作曲台的一軌（缺的欄位用預設）。
   重現是「由公式推出聲音」，沒聽過原片音檔：τ 等小字看不清的數值是估的，在 note 欄標明。 */
const VIDEO = [
  { name:'1 hardbass', bpm:150, caption:'hardbass = a sine inside a sine',
    shown:'y(t) = sin(2πft + I(t)·sin(4πft)),  I(t) = 0.6 + 4.4·e^(−t/τ)',
    note:'τ 在畫面上看不清，取 e^(−9t)（約 0.11 秒）；調變頻率是載波的 2 倍',
    tracks:[
      { name:'鼓', kind:'pulse', f:'1', voice:'kick', base:2, vol:0.9 },
      { name:'咬音（波形公式）', f:'2*floor(3*frac(n*phi))', r:'0.5', voice:'wave', base:3, vol:0.8, wave:'sin(2*pi*f*t+(0.6+4.4*exp(-t*9))*sin(4*pi*f*t))*exp(-t*3)' } ] },
  { name:'2 脈衝鼓', bpm:120, caption:'every spike = one tuned kick',
    shown:'δ(x) = lim(ε→0) 1/(ε√π)·e^(−x²/ε²),  每拍打 r = 1, 2, 3, 4 下',
    note:'脈衝＝一瞬間的「咚」；公式台的脈衝公式就是「這一拍打幾下」',
    tracks:[ { name:'調音脈衝鼓', kind:'pulse', f:'1+mod(b,4)', voice:'kick', base:2, vol:0.9 } ] },
  { name:'3 彈跳低音', bpm:120, caption:'every bass note bounces up an octave',
    shown:'f(t) = f_k · 2^(−e^(−(t−t_k)/τ)),  鼓打正拍、低音打反拍',
    note:'反拍＝偶數拍休止（公式 0/mod(n,2) 在偶數拍算出 NaN＝休止）；彈跳深度 1 個八度',
    tracks:[
      { name:'鼓（正拍）', kind:'pulse', f:'1', voice:'kick', base:2, vol:0.9 },
      { name:'低音（反拍）', f:'2*floor(3*frac(n*phi))+0/mod(n,2)', r:'1', voice:'bounce', base:2, vol:0.9, bounce:1 } ] },
  { name:'4 鐘形包絡', bpm:100, caption:'every note = one bell curve',
    shown:'g(t) = e^(−(t−t_k)²/σ²)  每個音沿自己的鐘形曲線漲落',
    note:'鐘形寬度＝音長 30%；沒有尖銳的起音與收音',
    tracks:[ { name:'旋律（鐘形）', f:'floor(7*frac(n*phi))', r:'1', voice:'fm', base:4, vol:0.8, bell:0.3 } ] },
  { name:'5 波形折疊', bpm:100, caption:'|x| folds a sine back on itself',
    shown:'y = 1 − 4·|frac((g·sinφ + 1)/4) − ½|   增益 g 越大折越多越硬',
    note:'「折疊音」音色：g 從 6 降到 1.2（每個音由硬變柔）；下方另有純波形公式版',
    tracks:[
      { name:'折疊音', f:'floor(7*frac(n*phi))', r:'1', voice:'folder', base:3, vol:0.8 },
      { name:'折疊（波形公式）', f:'floor(7*frac(n*phi))+7', r:'2', voice:'wave', base:3, vol:0.6, wave:'(1-4*abs(frac(((6*exp(-t*4)+1)*sin(2*pi*f*t)+1)/4)-0.5))*exp(-t*2)' } ] },
  { name:'7 魏爾斯特拉斯', bpm:110, caption:'the curve with no smooth spot',
    shown:'W(x) = Σ(n=0→3) aⁿ·cos(3ⁿπx)   處處連續、處處不可微',
    note:'「怪物音」音色：4 層、頻率每層 ×3、振幅每層 ×0.55',
    tracks:[ { name:'怪物', f:'floor(7*frac(n*phi))', r:'1', voice:'monster', base:3, vol:0.8 } ] },
  { name:'爬升 e^x', bpm:120, caption:"e^x: the climb keeps speeding up",
    shown:'y = (e^(3x) − 1)/(e^3 − 1)   每一步都比上一步來得更快',
    note:'爬升＝每拍打幾下隨 x 指數增加；嗆鈸同公式墊高頻',
    tracks:[
      { name:'鼓', kind:'pulse', f:'1+floor(7*(exp(3*x)-1)/(exp(3)-1))', voice:'kick', base:2, vol:0.8 },
      { name:'嗆', kind:'pulse', f:'floor(8*(exp(3*x)-1)/(exp(3)-1))', voice:'hat', base:6, vol:0.5 } ] },
  { name:'終 2＋7 最終首領', bpm:128, caption:'2 + 7 = the final boss',
    shown:'Σ aⁿcos(3ⁿπx) + Σ_k δ(x − x_k)   怪物＋脈衝，從第 8 拍起速度加倍',
    note:'第 8 拍起打擊數×2、旋律時值減半（公式用 floor(b/8) 做「到了第 8 拍」的開關）',
    tracks:[
      { name:'脈衝鼓', kind:'pulse', f:'(1+mod(b,4))*(1+min(1,floor(b/8)))', voice:'kick', base:2, vol:0.9 },
      { name:'怪物', f:'floor(7*frac(n*phi))', r:'1/(1+min(1,floor(n/8)))', voice:'monster', base:3, vol:0.8 } ] },
];
