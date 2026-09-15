/* 設計師面板（共用版，v10）——掃描 CONFIG 內所有數字／布林葉節點，自動生成可即時調整的旋鈕。
   出處：抽自 Eden-Defender 的設計師面板（v3.49），拿掉遊戲專屬的儀表頁與敵型分桶，
   只留下「掃描數字→旋鈕」＋「重置」＋「淨差異匯出」這幾件任何調參面板都該有的基本功能，
   給任何 ZPD 網頁遊戲共用：新專案直接複製這份檔案到專案資料夾。

   v10 = 兩個各自長出來的 v9 合併：life-rpg 的手機 ⚙ 把手，加上 Typing-Drop 的
   方框／文字參考線。會出現兩個 v9，是因為這份檔案在各專案裡是複製品，有人改了自己
   那份卻沒回流——同步與分岔偵測改用 _tools/sync-designer-panel.py，不要再手動複製。

   ══ 配色：面板要跟「它所屬的那款遊戲」一致（v7，2026-09-11 Roy 定案）══
   Roy：「我希望面板色系盡量與遊戲本身色系一致。」

   這件事繞了一圈才想清楚，把推理留在這裡免得以後又改錯方向：
   - v5 以前面板寫死 Typing-Drop-Arcade 的磷光綠 #39ff14（那是該款「復古街機終端機」的
     **遊戲**主色，見它 index.html 的 `--phosphor`）。Roy 指出「被打字遊戲的磷光綠汙染」。
   - v6 改成寫死 Eden-Defender 的礦晶青／香料金。**但這只是把污染源換一個而已**——
     Eden 的面板之所以好看，正是因為青／金本來就是 Eden 自己的 HUD 色；把它搬到粉彩
     田園風的 life-rpg 上，一樣格格不入。
   - 真正的問題從來不是「哪個顏色」，是**把單一遊戲的顏色寫死在跨遊戲共用元件裡**。

   v7 的解法：面板顏色改由宿主遊戲透過 `opts.theme` 指定，共用檔只提供預設值
   （沿用出處 Eden-Defender 的色票，新專案沒指定也不會太醜）。接面板時順手把該遊戲
   自己的色票餵進來，面板就會長得像那款遊戲的一部分，而不是外掛上去的第三方工具。

     initDesignerPanel(CONFIG, {
       labels: DP_LABELS,
       theme: { bg:'rgba(251,248,241,.97)', text:'#5B4A3A', accent:'#5F7A50',
                accent2:'#B97974', field:'#fff', line:'#E3D9C4',
                muted:'#9C8B77', danger:'#D9534F' },   // ← life-rpg 的暖色紙感
     });

   八個角色（都可以只給其中幾個，沒給的用預設）：
     bg      面板底色（建議帶 .95~.97 alpha，讓遊戲畫面透一點出來）
     text    內文
     accent  主色：標題／輸入框文字／滑桿
     accent2 次色：分組標題／按鈕／「已改動」標示
     field   輸入框與文字區底色
     line    框線／分隔線
     muted   中文說明等次要文字
     danger  破壞性動作（重置全部）

   **參考線刻意不吃 theme**：它要蓋在遊戲畫面上還看得清楚，固定用紅色雷射質感，
   跟面板本身的主題色區隔開（見下方 .dp-guide）。

   往後要調面板外觀，改的應該是這份共用檔＋呼叫端的 theme（並同步回本 skill），
   不要就地改單一專案的副本——副本改了不會回流，同一個問題會再長一次。

   ══ 權限分流：玩家沒有面板，設計者才有（v8，2026-09-11 Roy 定案）══
   Roy：「我希望使用者拿到的沒有設計師面板，我用的才有設計師面板。」「每個專案都應該
   用這種方式管理設計師面板權限。」

   **預設就會分流，不必每個專案自己寫一遍**——只看「現在這個網址」，三態：
     ?design=1  開（本機、線上都開）
     ?design=0  關（本機也關，用來在本機看玩家實際會看到的樣子）
     不帶參數    **本機開，線上關**（file:／localhost／127.0.0.1／[::1] 算本機）

   v10 拿掉了 localStorage 記憶（v8 加的，原意是手機不用每次貼參數）。那個記憶正好
   打破「線上不帶參數就沒有面板」這條：造訪過一次 ?design=1 之後，同一個 origin 下
   所有網址都還會有面板——包括交付給客戶的凍結副本路徑。手機要開就把 ?design=1
   加進書籤，一次的麻煩換掉一個看不見的洩漏。改用「本機一律開」之後，本機開發
   反而比以前更省事：連參數都不用帶。
   沒通過就 `return false` 什麼都不建，呼叫端可以據此決定要不要建自己的外掛區塊：

     if (initDesignerPanel(CONFIG, { labels, theme, onChange })) initMyExtraSections();

   要改參數名或記憶鍵、或某專案根本不需要分流：
     gate: 'dev'          → 改用 ?dev=1
     gate: { param:'dev' } → 同上，物件寫法
     gate: false          → 不分流，一律開。**只給不會發佈的專案**；會上架的別用，
                            上架那天沒人會記得回來改這一行

   ⚠️ **這是分流不是權限**：檔案仍在伺服器上，知道參數的人就開得了。面板只改瀏覽器
   記憶體裡的 CONFIG 與使用者自己的存檔，沒有機密也影響不到別人，所以夠用；真要擋住
   得靠伺服器端對不同請求出不同檔案，那是另一個層級的工。
   想讓玩家**連檔案都不下載**（少 15KB，也更不容易被發現），呼叫端別用 `<script src>`
   靜態載入，改成自己先判斷一次再動態載入——life-rpg 的 index.html 有現成範例。
   元件內部這道 gate 是安全網：就算某個專案忘了外層判斷、無條件載入了，玩家一樣看不到面板。

   用法：
     <script src="config.js"></script>
     <script src="designer-panel.js"></script>
     <script>
       initDesignerPanel(CONFIG, { labels: DP_LABELS, onChange: () => { ... } });
     </script>

   - CONFIG：任何巢狀物件，數字葉節點會變成一顆旋鈕，改了立刻寫回原物件（F5 前即時生效）
   - labels：{ 路徑片段: 中文說明 } 對照表，沒收錄的片段就顯示英文鍵名（寧缺勿錯，不硬翻）
   - toggleKey：開關面板的按鍵代碼（KeyboardEvent.code），預設 'F2'
   - onChange：每次旋鈕改值後呼叫一次，方便遊戲重算尺寸等衍生狀態（例如版面／畫布大小）

   重置：每顆旋鈕旁邊有 ↺，點了單顆回檔案值；標題列「重置全部」整組回檔案值。

   差異匯出（v3，2026-09-10 改版）：面板底部一份唯讀 textarea，即時算「目前 CONFIG 跟
   CONFIG0（檔案原值快照）的淨差異」，格式是可以直接貼進 config.js 的合法 JS：
     CONFIG.world.scale = 3.1;   // 原本 2.5
   旁邊一顆「複製」鈕。這是 Eden-Defender 與 Train-Detective 的設計師面板各自獨立收斂出、
   兩邊都有的核心功能——Roy 的原話：「我發現沒有更動記錄功能？這樣我要如何把參數傳給妳？」
   用途是調參 session 結束後整段複製貼進聊天視窗，Claude 讀了就知道該把 config.js 的
   哪幾行改成多少，不用一顆一顆旋鈕念出來。

   v2 曾經做過「逐筆編輯事件」的日誌（每次改值都疊一行，含來回調整、重置的中間過程），
   但那不是 Roy 實際要的東西——來回拖曳滑桿會留下一堆已經作廢的中間值，複製貼上時還要
   自己肉眼剔除。**淨差異**（只看「現在」跟「檔案值」不一樣的地方，不管中間改了幾次）
   才是兩個真實專案都用、也才是能直接拿去用的格式，v3 改回這個做法。
   若某遊戲需要「每一局測試結果」的歷史紀錄（不是差異，是時間序的 playtest 日誌——
   Eden-Defender 的 dpRunLog／dpLogRun 就是這種：贏/輸/撤退各記一行、附帶存活時間與當時
   的差異快照），那是因為那款遊戲有明確的「一局」邊界（開始→結束）才做得出來，
   屬於該專案自己疊加的複雜度，不進共用版。

   會連動失效的地雷（Roy 2026-09-10 提醒）：這支面板改的是 CONFIG 物件本體，
   遊戲程式碼若在開局時把某個值「複製」進一個 const（例如 `const SCALE=CONFIG.world.scale`），
   那個 const 之後就跟面板斷線——面板顯示改了、遊戲畫面卻沒變。只有遊戲邏輯每次使用時
   都直接讀 `CONFIG.xxx.yyy`（不快取成本地變數）的欄位，才會被這支面板即時連動。
   幫某個專案接上這支面板前，先確認想開放調整的欄位是不是這種「即時讀」欄位。

   參考線（v4，2026-09-10 新增）：F2 面板頂部「+ 橫線／+ 直線」，會在整個畫面（不只面板裡）
   疊一條可拖曳的細紅線，旁邊即時顯示這條線在畫面高度/寬度的百分比（例如 `Y 18.4%`）。
   純粹是「指給 Claude 看」的溝通工具，**不綁定任何 CONFIG 值、不自動寫回**——Roy 拖好線、
   唸出（或截圖傳）百分比，這個數字要拿去改哪個參數、或哪塊版面要對齊這裡，還是雙方討論決定。
   源起：Roy 觀察到他的遊戲構圖幾乎都是「上資訊列／中主畫面／下功能列」三段式（近似
   星海爭霸一代的介面配置），與其像 v3 設計草案那樣替每顆旋鈕額外標記「這是空間值、
   對應哪個軸」，不如做一個不綁定任何特定旋鈕、單純負責「精確指出畫面上某個位置」的
   通用工具，兩種需求（連續視覺參數如霧化帶／不綁 config 的版面元素定位）都能用同一組
   參考線解決，不用做兩套機制。視覺上刻意做成細、半透明、帶紅光暈的「雷射／紅外線」
   質感（Roy 指定），跟面板本身的青／金主題區隔開——參考線要蓋在遊戲畫面上還看得清楚，
   不能跟任何遊戲配色混在一起。

   滑桿（v5，2026-09-11 新增，Roy 提議）：每顆數字旋鈕除了數字框，下面多一條滑桿——
   「設定裡面這種拉桿很不錯耶」。理由是調參的兩種動作需求不同：**探索**（不知道要多少，
   來回拖到看起來對）適合滑桿，**收斂**（已知要 0.0125）適合打字，所以兩個都留、雙向同步。
   範圍沒指定就從檔案原值推 0→3 倍（整數步進 1、小數切 200 格）；要精準控制用 `opts.ranges`
   覆寫（鍵可以是完整路徑或最後一段）。**數字框刻意不受滑桿範圍限制**——推斷區間只是
   方便探索的預設視窗，不該變成參數上限。
   同版布林葉節點也納入掃描（核取方塊）：很多遊戲的開關（最低速度爬升、自動對齊）
   跟數值一樣是設計參數，之前只掃數字會讓這些開關無處可調，只好留在玩家設定面板裡。

   ponytail: 只做「掃描數字/布林→旋鈕→重置→淨差異匯出→參考線」，不做分頁儀表、不做逐局測試紀錄、
   不做敵型分桶、參考線不做網格/吸附/儲存——那些是 Eden 自己疊加的複雜度或還沒被證明需要
   的功能，此檔要留通用。真的需要時，個別專案自己加。 */
/* 本機判斷：直接開檔（file:）或本機伺服器都算。呼叫端若要「先判斷再決定載不載這支檔案」
   （見檔案開頭最後一段），那時候本函式還不存在，只能自己複製這三行——兩邊規則要一致。 */
function isLocalHost() {
  return location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

function initDesignerPanel(CONFIG, opts = {}) {
  /* 權限分流（v8）：沒通過就什麼都不建，回傳 false 讓呼叫端一起跳過自己的外掛區塊。
     規則與自訂方式見檔案開頭「權限分流」段。 */
  const gate = opts.gate === undefined ? {} : opts.gate;
  if (gate !== false) {
    const g = typeof gate === 'string' ? { param: gate } : gate;
    const q = new URLSearchParams(location.search).get(g.param || 'design');
    /* 只看現在這個網址，不留記憶。白名單只認 0/1，其他值（?design=yes）當沒帶參數，
       所以 ?v=arcade、?pack=… 這些跟面板無關的查詢字串在線上一律沒有面板。 */
    const on = q === '1' ? true : q === '0' ? false : isLocalHost();
    if (!on) return false;
  }

  const labels = opts.labels || {};
  const toggleKey = opts.toggleKey || 'F2';
  const onChange = opts.onChange || (() => {});
  const ranges = opts.ranges || {};   // { '路徑或鍵名': [min, max, step] }，見 rangeOf()
  const CONFIG0 = JSON.parse(JSON.stringify(CONFIG)); // 檔案原值快照，重置／「已改動」判斷／差異匯出都靠它

  /* 預設色票（2026-09-14 Roy 改版）：黑底／金主色／紅警告，不再用 Eden-Defender 的
     礦晶青。呼叫端用 opts.theme 蓋掉任何一個角色，面板就會跟著那款遊戲的色系走——
     見檔案開頭的說明；這裡只是「沒指定時」的預設，不影響已經自帶 theme 的專案。 */
  const TH = Object.assign({
    bg: 'rgba(10,8,6,.97)', text: '#D9D2C4', accent: '#E8C36A', accent2: '#C97A2B',
    field: '#141210', line: '#3a3226', muted: '#8a7f6e', danger: '#E5484D',
  }, opts.theme || {});

  const style = document.createElement('style');
  style.textContent = `
    #dp-panel{position:fixed;top:0;right:0;bottom:0;width:340px;max-width:90vw;
      background:${TH.bg};color:${TH.text};font:13px/1.4 monospace;
      overflow-y:auto;z-index:9999;padding:10px 14px;display:none;
      border-left:1px solid ${TH.accent};}
    #dp-panel.open{display:block;}
    #dp-panel h2{font-size:14px;margin:0 0 8px;color:${TH.accent};letter-spacing:.15em;}
    #dp-panel details{margin-bottom:4px;}
    #dp-panel summary{cursor:pointer;padding:2px 0;color:${TH.accent2};letter-spacing:.08em;}
    #dp-panel i{font-style:normal;color:${TH.muted};margin-left:6px;}
    .dp-row{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:2px 0 2px 12px;}
    .dp-row.chg .dp-name{color:${TH.accent2};}
    .dp-row.chg input{border-color:${TH.accent2};}
    .dp-row input[type=number]{width:82px;background:${TH.field};color:${TH.accent};
      border:1px solid ${TH.line};font:inherit;padding:1px 5px;}
    /* 數字列改直排：上排是名稱＋數字框＋重置，下排整條滑桿——
       Roy 定案（2026-09-11）：「設定裡面這種拉桿很不錯耶」。拖曳探索、打字精確，兩者都留 */
    .dp-row.dp-num{display:block;padding:4px 0 6px 12px;}
    .dp-row .dp-head{display:flex;justify-content:space-between;align-items:center;gap:6px;}
    .dp-row .dp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .dp-sld{width:100%;margin-top:3px;accent-color:${TH.accent};background:transparent;}
    .dp-row input[type=checkbox]{accent-color:${TH.accent};width:14px;height:14px;margin:0 6px 0 0;flex:0 0 auto;}
    .dp-reset{cursor:pointer;opacity:.5;flex:0 0 auto;}
    .dp-reset:hover{opacity:1;}
    #dp-close{position:absolute;top:6px;right:12px;cursor:pointer;color:${TH.accent2};}
    #dp-resetAll{cursor:pointer;color:${TH.danger};font-size:12px;margin-left:8px;}
    #dp-filter{width:100%;box-sizing:border-box;margin-bottom:6px;background:${TH.field};
      color:${TH.accent};border:1px solid ${TH.line};font:inherit;padding:3px 6px;}
    #dp-panel details.dp-hit>summary{color:${TH.accent};}
    #dp-diffWrap{margin-top:10px;padding-top:8px;border-top:1px solid ${TH.line};}
    #dp-diffWrap .dp-note{font-size:11px;color:${TH.muted};margin-bottom:4px;}
    #dp-diff{width:100%;box-sizing:border-box;height:120px;background:${TH.field};color:${TH.text};
      border:1px solid ${TH.line};font:11px/1.4 monospace;resize:vertical;padding:4px;}
    #dp-copy{cursor:pointer;color:${TH.accent};font-size:11px;margin-top:4px;display:inline-block;}
    /* 參考線的控制鈕沿用面板自己的按鈕語言，只有線本身固定是紅色——
       線要蓋在遊戲畫面上還看得清楚，才刻意不吃 theme，見下方 .dp-guide */
    #dp-guides-ctl{display:flex;flex-wrap:wrap;gap:8px;row-gap:6px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid ${TH.line};}
    #dp-guides-ctl span{cursor:pointer;color:${TH.accent2};font-size:12px;border:1px solid ${TH.line};
      border-radius:4px;padding:2px 7px;background:none;}
    #dp-guides-ctl span:hover{border-color:${TH.accent2};}
    #dp-guide-layer{position:fixed;inset:0;z-index:10000;pointer-events:none;}
    .dp-guide{position:fixed;pointer-events:auto;}
    .dp-guide.h{left:0;right:0;height:13px;margin-top:-6px;cursor:ns-resize;}
    .dp-guide.v{top:0;bottom:0;width:13px;margin-left:-6px;cursor:ew-resize;}
    .dp-guide::before{content:'';position:absolute;background:#ff2222;
      box-shadow:0 0 2px #ff2222,0 0 7px rgba(255,34,34,.75);
      animation:dp-guide-pulse 2.2s ease-in-out infinite;}
    .dp-guide.h::before{left:0;right:0;top:6px;height:1px;}
    .dp-guide.v::before{top:0;bottom:0;left:6px;width:1px;}
    @keyframes dp-guide-pulse{0%,100%{opacity:.65}50%{opacity:1}}
    .dp-guide-tag{position:absolute;display:flex;align-items:center;gap:4px;pointer-events:none;
      background:rgba(25,0,0,.82);border:1px solid rgba(255,40,40,.5);padding:0 4px;
      font:11px/16px monospace;color:#ff9a9a;white-space:nowrap;}
    .dp-guide.h .dp-guide-tag{left:8px;top:-9px;}
    .dp-guide.v .dp-guide-tag{top:8px;left:9px;}
    .dp-guide-del{pointer-events:auto;cursor:pointer;color:#ff6a6a;}
    .dp-guide-del:hover{color:#fff;}

    /* 方框（金）與文字（白）：跟紅色參考線同一套操作邏輯，只是量的東西不一樣——
       線量「一條邊在哪」，方框量「一塊區域多大」，文字量「這行字多大、什麼顏色」。
       三者顏色都固定不吃 theme，理由同 .dp-guide：要蓋在遊戲畫面上還分得出來。 */
    /* 外面再描一圈深色：金線在深色遊戲上夠亮，但在 life-rpg 那種米色紙感底上會糊掉。
       雙描邊讓同一組參考線在深底與淺底都讀得出來，不必每個遊戲各配一套。 */
    .dp-box{position:fixed;pointer-events:auto;cursor:move;border:1px solid #ffc400;
      box-shadow:0 0 0 1px rgba(0,0,0,.55),0 0 6px rgba(255,196,0,.45);}
    .dp-hd{position:absolute;}
    .dp-hd.n{left:0;right:0;top:-5px;height:11px;cursor:ns-resize;}
    .dp-hd.s{left:0;right:0;bottom:-5px;height:11px;cursor:ns-resize;}
    .dp-hd.w{top:0;bottom:0;left:-5px;width:11px;cursor:ew-resize;}
    .dp-hd.e{top:0;bottom:0;right:-5px;width:11px;cursor:ew-resize;}
    .dp-tag{position:absolute;left:0;top:-19px;display:flex;align-items:center;gap:5px;
      background:rgba(30,22,0,.85);border:1px solid rgba(255,196,0,.5);padding:0 4px;
      font:11px/17px monospace;color:#ffd34d;white-space:nowrap;}
    .dp-text{position:fixed;pointer-events:auto;}
    .dp-text .dp-t-body{display:inline-block;outline:none;white-space:pre;line-height:1;
      box-shadow:0 0 0 1px rgba(127,127,127,.7);}
    .dp-text .dp-tag{background:rgba(18,18,18,.88);border-color:rgba(255,255,255,.45);
      color:#eee;cursor:move;}
    .dp-text .dp-hd.se{right:-7px;bottom:-7px;width:13px;height:13px;cursor:nwse-resize;
      background:#fff;border:1px solid #777;}
    .dp-tag input,.dp-tag select{background:#111;color:#eee;border:1px solid #555;
      font:11px monospace;padding:0 2px;}
    .dp-tag input[type=number]{width:46px;}
    .dp-tag input[type=color]{width:22px;height:15px;padding:0;}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'dp-panel';
  panel.innerHTML = '<span id="dp-close">✕</span>' +
    '<h2>設計師面板（' + toggleKey + '）<span id="dp-resetAll">重置全部</span></h2>' +
    '<div id="dp-guides-ctl"><span id="dp-addH">+ 橫線</span><span id="dp-addV">+ 直線</span><span id="dp-addBox">+ 方框</span><span id="dp-addText">+ 文字</span><span id="dp-clearGuides">清空參考線</span></div>' +
    '<input id="dp-filter" placeholder="過濾：英文路徑或中文（如 速度、lanes）…">' +
    '<div id="dp-knobs"></div>' +
    '<div id="dp-diffWrap"><div class="dp-note">與檔案原值的淨差異（貼回 config.js 用）：</div>' +
    '<textarea id="dp-diff" readonly></textarea><span id="dp-copy">複製</span></div>';
  document.body.appendChild(panel);
  panel.querySelector('#dp-close').addEventListener('click', () => toggle(false));
  panel.querySelector('#dp-resetAll').addEventListener('click', () => resetAll());
  panel.querySelector('#dp-copy').addEventListener('click', async () => {
    const ta = panel.querySelector('#dp-diff'), btn = panel.querySelector('#dp-copy');
    ta.focus(); ta.select();
    try { await navigator.clipboard.writeText(ta.value); btn.textContent = '已複製'; }
    catch (err) { btn.textContent = '已選取，Ctrl+C'; } // 剪貼簿權限被擋時，至少幫忙全選
    setTimeout(() => { btn.textContent = '複製'; }, 1500);
  });

  // 參考線：純指認工具，不讀不寫 CONFIG，跟面板開關無關（F2 關了線還在，才看得到蓋在遊戲上的樣子）
  const guideLayer = document.createElement('div');
  guideLayer.id = 'dp-guide-layer';
  document.body.appendChild(guideLayer);
  let guides = [], guideSeq = 0;

  function positionGuide(g, el) {
    const pct = (g.pos * 100).toFixed(1) + '%';
    if (g.axis === 'h') el.style.top = (g.pos * 100) + '%';
    else el.style.left = (g.pos * 100) + '%';
    el.querySelector('.dp-guide-pct').textContent = (g.axis === 'h' ? 'Y ' : 'X ') + pct;
  }
  function startGuideDrag(g, el) {
    function move(e) {
      const client = g.axis === 'h' ? e.clientY : e.clientX;
      const span = g.axis === 'h' ? innerHeight : innerWidth;
      g.pos = Math.min(1, Math.max(0, client / span));
      positionGuide(g, el);
    }
    function up() { removeEventListener('pointermove', move); removeEventListener('pointerup', up); }
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  function addGuide(axis) {
    const g = { id: ++guideSeq, axis, pos: 0.5 };
    guides.push(g);
    const el = document.createElement('div');
    el.className = 'dp-guide ' + axis;
    el.dataset.id = g.id;
    el.innerHTML = '<div class="dp-guide-tag"><span class="dp-guide-pct"></span><span class="dp-guide-del">✕</span></div>';
    guideLayer.appendChild(el);
    positionGuide(g, el);
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.dp-guide-del')) return;
      e.preventDefault();
      startGuideDrag(g, el);
    });
    el.querySelector('.dp-guide-del').addEventListener('click', () => removeGuide(g.id));
  }
  function removeGuide(id) {
    guides = guides.filter(g => g.id !== id);
    const el = guideLayer.querySelector('[data-id="' + id + '"]');
    if (el) el.remove();
  }
  panel.querySelector('#dp-addH').addEventListener('click', () => addGuide('h'));
  panel.querySelector('#dp-addV').addEventListener('click', () => addGuide('v'));
  panel.querySelector('#dp-clearGuides').addEventListener('click', () => {
    guides.slice().forEach(g => removeGuide(g.id));
  });
  /* 視窗改變大小時重算一次：方框與文字存的是視窗比例，但畫出來是換算後的像素，
     而且參考畫布的縮放比也跟著視窗變——不重算的話，標籤上的數字會停在舊尺寸。
     紅色線不用進來，它的位置直接用 CSS % 表示，瀏覽器自己會跟。 */
  // 等一幀再重算：遊戲自己的 fitStage() 也掛在 resize 上，誰先誰後不保證——
  // 排到下一幀就一定讀得到縮放後的參考畫布尺寸，不會量到過渡中的中間值。
  addEventListener('resize', () => requestAnimationFrame(
    () => guides.forEach(g => g.place && g.place())));

  panel.querySelector('#dp-filter').addEventListener('input', applyFilter);
  panel.querySelector('#dp-addBox').addEventListener('click', () => addBox());
  panel.querySelector('#dp-addText').addEventListener('click', () => addText());

  /* 座標換算：把視窗像素換成 config.js 在用的參考畫布座標。要換算得成立，需要
     opts.stageEl（或頁面上有個 id="stage" 的元素）＋ CONFIG.stage 兩者都在——
     沒有就退回視窗像素，標籤會加註「(視窗)」提醒這組數字不能直接貼進 config.js。
     原點永遠在參考畫布左上角，往右往左、往下往上：右和下數值變大。 */
  function stageBox() {
    const el = (typeof opts.stageEl === 'string' ? document.querySelector(opts.stageEl) : opts.stageEl)
            || document.getElementById('stage');
    const ref = CONFIG.stage;
    if (!el || !ref || !ref.w) return null;
    const r = el.getBoundingClientRect();
    return r.width ? { x: r.left, y: r.top, k: ref.w / r.width } : null;
  }
  function toStage(px, py) {
    const s = stageBox();
    if (!s) return [Math.round(px), Math.round(py), '視窗'];
    return [Math.round((px - s.x) * s.k), Math.round((py - s.y) * s.k), ''];
  }
  function scaleK() { const s = stageBox(); return s ? s.k : 1; }

  /* 標籤上的讀數點一下就複製。量出來的值本來就是要貼回 config.js 的，中間不該卡一次
     手抄——Roy 2026-09-13 只能截圖回報，就是卡在這裡。 */
  function wireCopy(el) {
    el.title = '點一下複製';
    el.style.cursor = 'copy';
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const t = el.textContent;
      try {
        await navigator.clipboard.writeText(t);
        el.textContent = '已複製';
        setTimeout(() => { if (el.textContent === '已複製') el.textContent = t; }, 900);
      } catch (err) {
        /* 剪貼簿權限被擋（非安全來源、瀏覽器設定、嵌在別的框架裡）。**不能就這樣算了**
           ——點了沒反應的按鈕比沒有這顆按鈕更糟。退而幫忙把讀數選起來，Ctrl+C 照樣能複製，
           而且「被選起來」本身就是看得見的回饋，不必再改字（改字會把選取洗掉）。 */
        const r = document.createRange(); r.selectNodeContents(el);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        el.title = '已選取，按 Ctrl+C 複製';
      }
    });
  }

  // 共用拖曳：按住後一路聽 pointermove，放開就收工（三種參考線都用這個）
  function onDrag(fn) {
    function move(e) { e.preventDefault(); fn(e); }
    function up() { removeEventListener('pointermove', move); removeEventListener('pointerup', up); }
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /* 金色方框：四條邊各自能拖，中間拖曳整塊搬家。左上兩條＝原點基準，右下兩條＝尺寸。
     標籤即時顯示 X Y 與 寬×高，單位是參考畫布像素——量出來多少，config.js 就寫多少。
     位置存成視窗比例（0~1）而非像素，視窗改大小時方框跟著等比例移動，跟紅線一致。 */
  function addBox() {
    const g = { id: ++guideSeq, type: 'box', l: .32, t: .32, r: .62, b: .55 };
    guides.push(g);
    const el = document.createElement('div');
    el.className = 'dp-box';
    el.dataset.id = g.id;
    el.innerHTML = '<span class="dp-hd n"></span><span class="dp-hd s"></span>' +
      '<span class="dp-hd w"></span><span class="dp-hd e"></span>' +
      '<div class="dp-tag"><span class="dp-box-val"></span><span class="dp-guide-del">✕</span></div>';
    guideLayer.appendChild(el);
    g.place = place; place();
    wireCopy(el.querySelector('.dp-box-val'));
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.dp-guide-del') || e.target.closest('.dp-box-val')) return;
      e.preventDefault();
      const hd = e.target.closest('.dp-hd');
      const edge = hd ? hd.className.trim().split(/\s+/).pop() : null;
      const x0 = e.clientX, y0 = e.clientY, s0 = { l: g.l, t: g.t, r: g.r, b: g.b };
      onDrag(ev => {
        const dx = (ev.clientX - x0) / innerWidth, dy = (ev.clientY - y0) / innerHeight;
        if (!edge) { g.l = s0.l + dx; g.r = s0.r + dx; g.t = s0.t + dy; g.b = s0.b + dy; }
        else if (edge === 'e') g.r = Math.max(s0.l + .005, s0.r + dx);
        else if (edge === 'w') g.l = Math.min(s0.r - .005, s0.l + dx);
        else if (edge === 's') g.b = Math.max(s0.t + .005, s0.b + dy);
        else g.t = Math.min(s0.b - .005, s0.t + dy);
        place();
      });
    });
    el.querySelector('.dp-guide-del').addEventListener('click', () => removeGuide(g.id));
    function place() {
      const L = g.l * innerWidth, T = g.t * innerHeight, R = g.r * innerWidth, B = g.b * innerHeight;
      el.style.left = L + 'px'; el.style.top = T + 'px';
      el.style.width = (R - L) + 'px'; el.style.height = (B - T) + 'px';
      const xy = toStage(L, T), k = scaleK();
      el.querySelector('.dp-box-val').textContent = 'X' + xy[0] + ' Y' + xy[1] + ' · ' +
        Math.round((R - L) * k) + '×' + Math.round((B - T) * k) + (xy[2] ? ' (' + xy[2] + ')' : '');
    }
  }

  /* 白色文字：直接在畫面上打字（中英文都行），拖右下角白點改字級，或在標籤裡輸入 size。
     顏色、字型各一個選單；字級同樣是參考畫布像素。標籤本身就是搬家把手——
     字本體要留給游標打字，不能同時拿來拖曳。
     ponytail: 不做「文字樣式群組」。等畫面上真的擺到十幾行、改一次要改十幾次，
     再把共用樣式抽成 CONFIG.text.* 讓旋鈕去調，那時群組是免費附帶的。 */
  function addText() {
    const gameFont = getComputedStyle(document.body).fontFamily || 'sans-serif';
    // 起始色吃面板主題的文字色＝這款遊戲自己的文字色。寫死白色的話，淺色遊戲一放上去就消失
    const gameInk = /^#[0-9a-f]{6}$/i.test(TH.text) ? TH.text : '#ffffff';
    const g = { id: ++guideSeq, type: 'text', x: .35, y: .38, size: 48, color: gameInk, font: gameFont };
    guides.push(g);
    const el = document.createElement('div');
    el.className = 'dp-text';
    el.dataset.id = g.id;
    el.innerHTML = '<span class="dp-t-body" contenteditable="true">文字 Text</span>' +
      '<span class="dp-hd se"></span>' +
      '<div class="dp-tag"><span class="dp-t-val"></span>' +
      '<input type="number" class="dp-t-size" min="6" max="600" step="1">' +
      '<input type="color" class="dp-t-color" value="' + gameInk + '">' +
      '<select class="dp-t-font">' +
      ['遊戲字型'].concat(['monospace', 'sans-serif', 'serif'], opts.fonts || [])
        .map((f, i) => '<option value="' + (i ? f : gameFont).replace(/"/g, '&quot;') + '">' + f + '</option>').join('') +
      '</select><span class="dp-guide-del">✕</span></div>';
    guideLayer.appendChild(el);
    const sizeIn = el.querySelector('.dp-t-size');
    g.place = place; place();
    wireCopy(el.querySelector('.dp-t-val'));
    el.querySelector('.dp-tag').addEventListener('pointerdown', e => {
      if (e.target.closest('.dp-guide-del') || e.target.closest('.dp-t-val') ||
          e.target.matches('input,select')) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, sx = g.x, sy = g.y;
      onDrag(ev => {
        g.x = sx + (ev.clientX - x0) / innerWidth;
        g.y = sy + (ev.clientY - y0) / innerHeight;
        place();
      });
    });
    el.querySelector('.dp-hd.se').addEventListener('pointerdown', e => {
      e.preventDefault();
      const y0 = e.clientY, s0 = g.size, k = scaleK();
      onDrag(ev => { g.size = Math.max(6, Math.round(s0 + (ev.clientY - y0) * k)); place(); });
    });
    sizeIn.addEventListener('input', () => { const v = +sizeIn.value; if (v >= 6) { g.size = v; place(); } });
    el.querySelector('.dp-t-color').addEventListener('input', e => { g.color = e.target.value; place(); });
    el.querySelector('.dp-t-font').addEventListener('change', e => { g.font = e.target.value; place(); });
    el.querySelector('.dp-guide-del').addEventListener('click', () => removeGuide(g.id));
    function place() {
      el.style.left = (g.x * innerWidth) + 'px';
      el.style.top = (g.y * innerHeight) + 'px';
      el.style.color = g.color;
      el.style.fontFamily = g.font;
      // g.size 是參考畫布像素，畫到螢幕上要先除以縮放比，量到的數字才跟 config.js 同一個尺度
      el.querySelector('.dp-t-body').style.fontSize = (g.size / scaleK()) + 'px';
      const xy = toStage(g.x * innerWidth, g.y * innerHeight);
      el.querySelector('.dp-t-val').textContent =
        'X' + xy[0] + ' Y' + xy[1] + (xy[2] ? ' (' + xy[2] + ')' : '');
      if (document.activeElement !== sizeIn) sizeIn.value = g.size;
    }
  }

  // 遞迴找出所有數字／布林葉節點；leaf 的路徑用陣列表示，例如 ['fall','speedMin']
  function leaves(obj, path, out) {
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'number' || typeof v === 'boolean') out.push(path.concat(k));
      else if (v && typeof v === 'object') leaves(v, path.concat(k), out);
    }
    return out;
  }
  /* 滑桿範圍（v5）：沒指定就從「檔案原值」推——0→3 倍是絕大多數遊戲參數的合理探索區間，
     整數值步進 1、小數值切 200 格。要精準控制就用 opts.ranges 覆寫：
       ranges: { 'player.baseSpeed': [0, .05, .0005], speedMax: [1, 3, .05] }
     鍵可以是完整路徑或最後一段（路徑優先）。 */
  function rangeOf(path, v0) {
    const byPath = ranges[path.join('.')] || ranges[path[path.length - 1]];
    if (byPath) return { min: byPath[0], max: byPath[1], step: byPath[2] };
    if (v0 === 0) return { min: -1, max: 1, step: .01 };
    const hi = Math.abs(v0) * 3, isInt = Number.isInteger(v0) && Math.abs(v0) >= 1;
    return v0 > 0
      ? { min: 0, max: hi, step: isInt ? 1 : hi / 200 }
      : { min: -hi, max: 0, step: isInt ? 1 : hi / 200 };
  }
  function get(root, p) { let o = root; for (const k of p) o = o[k]; return o; }
  function set(p, v) { let o = CONFIG; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }

  // 淨差異：只看「現在」跟 CONFIG0 不一樣的葉節點，不管中間改了幾次——貼進 config.js 就是合法賦值敘述
  function diffText() {
    const changed = leaves(CONFIG, [], []).filter(p => get(CONFIG, p) !== get(CONFIG0, p));
    if (!changed.length) return '（目前沒有改動）';
    return changed.map(p =>
      'CONFIG.' + p.join('.') + ' = ' + get(CONFIG, p) + ';   // 原本 ' + get(CONFIG0, p)
    ).join('\n');
  }
  function refreshDiff() {
    const el = panel.querySelector('#dp-diff');
    if (el) el.value = diffText();
  }

  /* 過濾：英文路徑與中文標籤都吃。命中的列留著、其餘隱藏，並把有命中的群組自動展開
     （收合狀態是 <details open>，不改它就等於搜到了卻看不到）。清空關鍵字時還原。 */
  function applyFilter() {
    const q = (panel.querySelector('#dp-filter').value || '').trim().toLowerCase();
    const knobs = panel.querySelector('#dp-knobs');
    knobs.querySelectorAll('.dp-row').forEach(r => {
      const hit = !q || (r.dataset.path + ' ' + (r.dataset.zh || '')).toLowerCase().includes(q);
      r.style.display = hit ? '' : 'none';
    });
    knobs.querySelectorAll('details').forEach(d => {
      const hit = !!d.querySelector('.dp-row:not([style*="none"])');
      d.style.display = q && !hit ? 'none' : '';
      d.classList.toggle('dp-hit', !!q && hit);
      if (q && hit) d.open = true;
    });
  }

  function build() {
    const all = leaves(CONFIG, [], []);
    const groups = {};
    for (const p of all) (groups[p[0]] = groups[p[0]] || []).push(p);
    const changed = all.filter(p => get(CONFIG, p) !== get(CONFIG0, p));
    /* 小專案（旋鈕不多）一切照舊：全部群組預設展開，跟 v9 以前看起來一模一樣。
       旋鈕破百才開始收合——Eden-Defender 有 1178 顆，攤平的清單等於沒有清單。 */
    const many = all.length > 100;

    let h = '';
    // ① 已改動置頂且一律展開：迭代時你要看的永遠是自己剛動過的那幾顆
    if (changed.length) h += section('已改動', changed, true, ' dp-chgset');
    // ② 其餘群組依中文名排序，找「掉落」就往ㄉ的位置去，不必記 CONFIG 的宣告順序
    const names = Object.keys(groups)
      // 注音排序：Roy 找「掉落」是往ㄉ的位置去。zh-Hant 預設是筆畫序，得明講 co-zhuyin
      .sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b, 'zh-Hant-u-co-zhuyin'));
    for (const g of names) {
      const gz = labels[g] ? `<i>${labels[g]}</i>` : '';
      const list = groups[g];
      // ③ 大群組再依路徑第二段切子群（Eden 的敵型 282 顆 ⇒ 十幾個可摺疊的敵人）
      if (list.length > 40) {
        const subs = {};
        for (const q of list) (subs[q.length > 2 ? q[1] : '其他'] = subs[q.length > 2 ? q[1] : '其他'] || []).push(q);
        let inner = '';
        for (const sk of Object.keys(subs).sort()) inner += section(sk, subs[sk], false);
        h += `<details><summary>${g}${gz}<i>${list.length}</i></summary>${inner}</details>`;
      } else {
        h += section(g, list, !many, '', gz);
      }
    }

    function section(title, list, open, cls, gz) {
      return `<details${open ? ' open' : ''}${cls || ''}><summary>${title}${gz || ''}` +
             `<i>${list.length}</i></summary>${list.map(row).join('')}</details>`;
    }
    function row(p) {
      const chg = get(CONFIG, p) !== get(CONFIG0, p);
      const key = p[p.length - 1];
      const name = p.slice(1).join('.') || key;
      const zhTxt = labels[key] || '';
      const zh = zhTxt ? `<i>${zhTxt}</i>` : '';
      // data-zh 讓過濾框吃得到中文——Roy 用中文想事情，「速度」要搜得到 speedMin
      const meta = `data-path="${p.join('.')}" data-zh="${zhTxt}"`;
      const v = get(CONFIG, p);
      if (typeof v === 'boolean') {
        return `<label class="dp-row${chg ? ' chg' : ''}" ${meta} data-kind="bool">` +
               `<input type="checkbox" class="dp-chk"${v ? ' checked' : ''}>` +
               `<span class="dp-name">${name}${zh}</span>` +
               `<span class="dp-reset" title="重置這顆">↺</span></label>`;
      }
      const r = rangeOf(p, get(CONFIG0, p));
      return `<div class="dp-row dp-num${chg ? ' chg' : ''}" ${meta}>` +
             `<div class="dp-head"><span class="dp-name">${name}${zh}</span>` +
             `<input type="number" step="any" value="${v}">` +
             `<span class="dp-reset" title="重置這顆">↺</span></div>` +
             `<input type="range" class="dp-sld" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}">` +
             `</div>`;
    }
    panel.querySelector('#dp-knobs').innerHTML = h;
    applyFilter();
    panel.querySelectorAll('.dp-row input[type=number], .dp-row input[type=range]').forEach(inp => {
      inp.addEventListener('input', () => {
        const row = inp.closest('.dp-row');
        const path = row.dataset.path.split('.');
        const to = parseFloat(inp.value);
        if (Number.isNaN(to)) return; // 打到一半（例如只打了「-」）先不寫回，避免 NaN 污染 CONFIG
        set(path, to);
        /* 滑桿與數字框同步：拖滑桿時數字框跟著跑，打數字時滑桿跟著跑。
           數字框可以超出滑桿範圍（推斷的區間只是方便探索，不該變成上限） */
        row.querySelectorAll('input').forEach(o => { if (o !== inp) o.value = to; });
        row.classList.toggle('chg', to !== get(CONFIG0, path));
        refreshDiff();
        onChange();
      });
    });
    panel.querySelectorAll('.dp-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const row = chk.closest('.dp-row'), path = row.dataset.path.split('.');
        set(path, chk.checked);
        row.classList.toggle('chg', chk.checked !== get(CONFIG0, path));
        refreshDiff();
        onChange();
      });
    });
    panel.querySelectorAll('.dp-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.dp-row');
        const path = row.dataset.path.split('.');
        const to = get(CONFIG0, path);
        if (get(CONFIG, path) === to) return;
        set(path, to);
        if (typeof to === 'boolean') row.querySelector('input').checked = to;
        else row.querySelectorAll('input').forEach(o => { o.value = to; });
        row.classList.remove('chg');
        refreshDiff();
        onChange();
      });
    });
    refreshDiff();
  }

  function resetAll() {
    const all = leaves(CONFIG, [], []);
    let touched = false;
    for (const p of all) {
      if (get(CONFIG, p) === get(CONFIG0, p)) continue;
      set(p, get(CONFIG0, p));
      touched = true;
    }
    if (touched) { build(); onChange(); }
  }

  /* v9（Roy 2026-09-11：「手機版本沒辦法開設計師視窗啊」）：手機沒有 F2 鍵，面板在
     ?design=1 之下明明已經建好，卻沒有任何辦法打開——分流做完了，開關卻漏了。
     一律建這個小把手而不是只在觸控裝置建：它只存在於設計師版，而「用能力偵測決定要不要
     給開關」本身就會產生新的偵測失敗面（外接鍵盤的平板、桌機觸控螢幕），不值得。
     放左下角是因為面板固定在右側，不會互相蓋住。 */
  const handle = document.createElement('div');
  handle.id = 'dp-handle';
  handle.textContent = '⚙';
  handle.title = '設計師面板（' + toggleKey + '）';
  handle.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9998;cursor:pointer;' +
    'width:40px;height:40px;line-height:40px;text-align:center;font-size:20px;border-radius:50%;' +
    'background:' + TH.bg + ';color:' + TH.accent + ';border:1px solid ' + TH.line + ';' +
    'user-select:none;-webkit-tap-highlight-color:transparent;';
  handle.addEventListener('click', () => toggle());
  document.body.appendChild(handle);

  function toggle(force) {
    const open = force !== undefined ? force : !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    handle.style.display = open ? 'none' : 'block';   // 開著的時候讓路，面板自己有關閉鈕
    if (open) build();
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === toggleKey) { e.preventDefault(); toggle(); }
  });
  /* 回傳面板元素本身（仍然 truthy，既有的 if (initDesignerPanel(...)) 寫法照舊）。
     遊戲專屬的分頁／區塊直接 appendChild 到這裡，不必在共用版裡蓋一套分頁系統——
     Eden-Defender 的儀表／紀錄／測試就是這樣掛上去的。 */
  return panel;
}
