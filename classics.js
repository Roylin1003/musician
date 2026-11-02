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
