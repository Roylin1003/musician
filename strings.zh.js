/* strings.zh.js —— 玩家看得到的字，繁體中文（台灣）。本體不是鏡子：改這裡 F5 生效。
   靜態文字用 data-t="鍵名" 標在 HTML 上，applyStaticText() 開局掃描填入。 */
const TEXT = {
  'app.title':    'Royal Musician 音樂家',   // 品牌名 Royal 系列（Roy 定案 2026-09-15）；repo／資料夾仍用工程代號 musician
  'app.subtitle': '同一份曲譜 × 五種音色——古典名曲合成試聽台',
  'ui.voiceHeading': '音色',
  'ui.voice.chip':    '8-bit 版',
  'ui.voice.crystal': '水晶版',
  'ui.voice.piano':   '鋼琴版',
  'ui.voice.strings': '弦樂版',
  'ui.voice.flute':   '長笛版',
  'ui.stop':      '停止',
  'ui.hint':      '音色可複選疊加——勾幾個疊幾層；點任何一首開始播放，播放中改組合立刻重播',
  'ui.playing':   n => '♪ 正在演奏：' + n,
  'ui.beats':     n => n + ' 拍',
};

/* docgen 與遊戲端共用的入口。缺字 console 點名，不靜靜留空 */
function applyText(CONFIG){
  ['chip','crystal','piano','strings','flute'].forEach(v=>{
    if(!TEXT['ui.voice.'+v]) console.warn('[strings] 缺音色名稱 ui.voice.'+v);
  });
  return CONFIG;
}
function applyStaticText(){
  document.querySelectorAll('[data-t]').forEach(el=>{
    const v=TEXT[el.dataset.t];
    if(v===undefined){ console.warn('[strings] 缺字：'+el.dataset.t); return; }
    if(typeof v==='string') el.textContent=v;
  });
}
