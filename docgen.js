/* docgen.js —— 規格表產生器（node docgen.js）。讀 config.js + strings.zh.js，
   把 CONFIG 現值與曲庫印成 docs/規格_數值.md。鏡子不手改。 */
const fs = require('fs'), path = require('path');
const D = __dirname, OUT = path.join(D, 'docs');

const strSrc = fs.readFileSync(path.join(D, 'strings.zh.js'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(D, 'config.js'), 'utf8');
const { CONFIG, TUNES } = new Function(
  strSrc + '\n' + cfgSrc + '\napplyText(CONFIG);\nreturn {CONFIG, TUNES};')();

function fmt(v){
  if(Array.isArray(v) || (v && typeof v === 'object')) return '`' + JSON.stringify(v) + '`';
  return String(v);
}
function table(o){
  const rows = Object.entries(o).map(([k,v]) => '| `' + k + '` | ' + fmt(v) + ' |');
  return ['| 鍵 | 值 |', '|---|---|', ...rows].join('\n');
}

const chordKind = t => t.chords===false ? '不配（小調）'
                     : Array.isArray(t.chords) ? '自帶進行' : '自動配';
const tuneRows = TUNES.slice()
  .sort((a,b)=>(a.orig||a.name).localeCompare(b.orig||b.name))   // 鏡子跟試聽台同一個排序
  .map(t => {
  const beats = t.notes.reduce((s,n)=>s+n[1],0);
  return '| ' + t.name + ' | ' + (t.orig||'-') + ' | ' + t.composer + ' | ' + (t.bpm||CONFIG.play.bpm) +
         ' | ' + beats + ' | ' + chordKind(t) + ' |';
});
const tuneTable = ['| 曲名 | 原名 | 作曲 | bpm | 拍數 | 和聲 |','|---|---|---|---|---|---|',...tuneRows].join('\n');

const STAMP = new Date().toISOString().slice(0,10);
const groups = Object.keys(CONFIG).filter(k => k !== 'version');
const body = groups.map(k => '## ' + k + '\n\n' + table(CONFIG[k])).join('\n\n');
const out = [
  '# 規格_數值',
  '',
  '> [!CAUTION] 本檔由 `docgen.js` 生成，**不要手改**——下次生成會整份覆蓋。',
  '> 要改參數請改 `config.js`（F5 就套用）；要改設計意圖請改 [[設計藍圖]]。',
  '',
  '← [[設計藍圖]]　｜　版本 **v' + CONFIG.version + '**　｜　生成於 ' + STAMP,
  '',
  body,
  '',
  '## 曲庫（' + TUNES.length + ' 首）',
  '',
  tuneTable,
  '',
].join('\n');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '規格_數值.md'), out);
console.log('docgen v' + CONFIG.version + ' → docs/規格_數值.md（曲庫 ' + TUNES.length + ' 首）');
