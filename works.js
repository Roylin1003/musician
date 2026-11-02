/* works.js —— Claude 為 Master 寫的原創配樂：宏大×悠揚（2026-11-03，Master：「請盡情地創造各種宏大的音樂，悠揚的音樂」）
   做法：和弦進行是骨架，伴奏（低音、定音鼓、琶音、墊底）由進行「算」出來，所以不會和旋律打架；旋律是手寫的簡譜（1–7 音級、^ 升八度、_ 降八度、- 延長、/ 減半、0 休止、# 升半音）。
   每首 32 小節、4/4；前 8 小節只有伴奏（引子），之後旋律進場、逐層加厚。樂器優先用真樂器取樣（r_*）。
   test-works.js 會驗：每軌小節數、旋律每小節第一拍是不是和弦音、有沒有未知音色。 */
const WORKS = (() => {
  const NM = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const nm = m => NM[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  // 和弦：[根音半音, 根, 三音, 五音] 的相對半音（根音以 C=0 起算）
  const CH = { C:[0,0,4,7], Dm:[2,0,3,7], Em:[4,0,3,7], F:[5,0,4,7], G:[7,0,4,7], Am:[9,0,3,7], E:[4,0,4,7] };
  const tone = (c, oct, k) => 12 * (oct + 1) + CH[c][0] + CH[c][1 + k];   // k：0 根、1 三、2 五
  const rest = n => Array(n).fill('0---').join(' | ');
  const jp = (...chunks) => chunks.join(' | ');
  // 一小節（4 拍）的伴奏樣式
  const F = {
    bassHalf: c => [[nm(tone(c, 2, 0)), 2], [nm(tone(c, 2, 2)), 2]],
    bassRoot: c => [[nm(tone(c, 2, 0)), 4]],
    timp:     c => [[nm(tone(c, 2, 0)), 1], [null, 1], [nm(tone(c, 2, 0)), 1], [nm(tone(c, 2, 0)), 1]],
    timpOne:  c => [[nm(tone(c, 2, 0)), 1], [null, 3]],
    arp:      c => [0, 1, 2].map(k => tone(c, 3, k)).concat([tone(c, 4, 0), tone(c, 4, 1), tone(c, 4, 0), tone(c, 3, 2), tone(c, 3, 1)]).map(m => [nm(m), .5]),
    pad3:     c => [[nm(tone(c, 4, 1)), 4]],
    pad5:     c => [[nm(tone(c, 4, 2)), 4]],
    padRoot:  c => [[nm(tone(c, 3, 0)), 4]],
    hold3hi:  c => [[nm(tone(c, 5, 1)), 4]],
    spark:    c => [[nm(tone(c, 5, 2)), 1], [null, 3]],
    pluck:    c => [[nm(tone(c, 5, 0)), 1], [null, 3]],
  };
  const play = (name, voice, vol, pan, prog, from, to, fn) => {
    const notes = []; for(let i = from; i < to; i++) notes.push(...fn(prog[i], i));
    return { name, voice, vol, pan, offset: from * 4, notes };
  };
  const mel = (name, voice, vol, pan, from, text) => ({ name, voice, vol, pan, offset: from * 4, jp: text });
  const loop = (a, n) => Array(n).fill(a).flat();

  /* ① 星海遠征（宏大，A 小調，進行曲）：低音與定音鼓踏出行軍步伐，小號唱出主題，第三段小提琴與長笛把主題推到高處，合唱與長號加入，最後收在主和弦 */
  const voyL = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'], voyP = [...voyL, ...voyL, ...voyL, 'Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'Am'];
  const voyT1 = '6-^1^3 | ^6-^4^1 | ^1-5^1 | ^2-75 | 6-^1^3 | ^4-^6^4 | ^5-^3^2 | ^3---';
  const voyT2 = '^6-^5^3 | ^4-^1^4 | ^5-^3^1 | ^2-^5^2 | ^6-^7^^1 | ^^1-^6^4 | ^5-^7^^2 | ^^3---';
  const voyFin = '6-^1^3 | ^6-^4^1 | ^1-5^1 | ^2-75 | 6-^1^3 | ^4-^6^4 | 7-#57 | 6---';
  const voyage = { id:'voyage-1', name:'宏大・星海遠征', composer:'Claude', bpm:96,
    check:{ prog:voyP, melody:['小號主題', '小提琴', '長笛'] }, parts:[
      play('定音鼓', 'timpani', .7, 0, voyP, 0, 32, F.timp),
      play('大提琴低音', 'r_cello', .8, -.4, voyP, 0, 32, F.bassHalf),
      play('豎琴琶音', 'r_harp', .5, .3, voyP, 4, 32, F.arp),
      play('弦樂顫音', 'r_trem', .45, .25, voyP, 4, 32, F.pad3),
      mel('小號主題', 'r_tpt', .75, -.15, 8, jp(voyT1, rest(8), voyFin)),
      mel('小提琴', 'r_vln', .6, .2, 16, jp(voyT2, voyFin)),
      mel('長笛', 'r_flute', .5, .35, 16, voyT2),
      play('長號', 'r_tbn', .55, -.3, voyP, 16, 32, F.padRoot),
      play('合唱', 'choir', .4, .15, voyP, 16, 32, F.hold3hi),
    ] };

  /* ② 天穹合唱（宏大，C 大調，聖歌式）：「卡農進行」C-G-Am-Em-F-C-F-G 一路堆高——豎琴與大提琴鋪底、小提琴唱歌、長笛加八分音符流線、最後合唱與銅管把它推到天頂 */
  const hymL = ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'], hymP = [...hymL, ...hymL, ...hymL, 'C', 'G', 'Am', 'Em', 'F', 'C', 'G', 'C'];
  const hymM1 = '^3-^5- | ^5-^2- | ^1-^3- | 7-^3- | ^4-^6- | ^5-^3- | ^6-^^1- | ^5-^7^^2';
  const hymM2 = '^3/^4/^5-^3/^5/ | ^5/^4/^2-^5/^7/ | ^1/^2/^3-^1/^3/ | 7/^1/^3-7/^3/ | ^4/^5/^6-^4/^6/ | ^5/^6/^5-^3/^5/ | ^6/^7/^^1-^6/^^1/ | ^5/^6/^7-^5/^7/';
  const hymFin = '^3-^5- | ^5-^2- | ^1-^3- | 7-^3- | ^4-^6- | ^5-^3- | ^5-^7^^2 | ^^1---';
  const hymn = { id:'hymn-1', name:'宏大・天穹合唱', composer:'Claude', bpm:66,
    check:{ prog:hymP, melody:['小提琴', '長笛', '小號'] }, parts:[
      play('豎琴', 'r_harp', .55, -.25, hymP, 0, 32, F.arp),
      play('大提琴', 'r_cello', .7, -.4, hymP, 0, 32, F.bassRoot),
      play('弦樂墊底', 'strings', .35, .3, hymP, 4, 32, F.pad3),
      mel('小提琴', 'r_vln', .7, .1, 8, jp(hymM1, hymM2, hymFin)),
      mel('長笛', 'r_flute', .5, .3, 16, jp(hymM2, rest(8))),
      mel('小號', 'r_tpt', .6, -.1, 24, hymFin),
      play('低音號', 'r_tuba', .6, -.35, hymP, 16, 32, F.bassRoot),
      play('定音鼓', 'timpani', .65, 0, hymP, 16, 32, F.timpOne),
      play('合唱', 'choir', .45, .2, hymP, 8, 32, F.hold3hi),
    ] };

  /* ③ 湖畔晨光（悠揚，F 大調）：長笛唱長線，豎琴像水面的光；第二段旋律換成八分音符流動，雙簧管接手 */
  const lakeL = ['C', 'Em', 'F', 'C', 'Dm', 'Am', 'F', 'G'], lakeP = [...lakeL, ...lakeL, ...lakeL, 'C', 'Em', 'F', 'C', 'Dm', 'Am', 'G', 'C'];
  const lakeA = '^3-^5^3 | 7-^3^5 | ^6-^4^1 | ^1-^3- | ^2-^4^6 | ^6-^3^1 | ^4-^6^^1 | ^5-^2-';
  const lakeB = '^3/^4/^5/^4/^3- | 7/^1/^2/^1/7- | ^6/^7/^^1/^7/^6- | ^5/^4/^3/^2/^1- | ^4/^5/^6/^5/^4- | ^3/^4/^3/^2/^1- | ^6/^5/^4/^3/^4- | ^2/^3/^4/^3/^2-';
  const lakeFin = '^3-^5^3 | 7-^3^5 | ^6-^4^1 | ^1-^3- | ^2-^4^6 | ^6-^3^1 | ^2-^5^7 | ^1---';
  const lake = { id:'lake-1', name:'悠揚・湖畔晨光', composer:'Claude', bpm:60,
    check:{ prog:lakeP, melody:['長笛', '雙簧管', '小提琴'] }, parts:[
      play('豎琴', 'r_harp', .55, -.2, lakeP, 0, 32, F.arp),
      play('鐵琴微光', 'r_glock', .3, .35, lakeP, 0, 8, F.spark),
      play('弦樂墊底', 'strings', .3, .3, lakeP, 4, 32, F.pad3),
      play('大提琴', 'r_cello', .6, -.4, lakeP, 8, 32, F.bassRoot),
      mel('長笛', 'r_flute', .8, .15, 8, jp(lakeA, rest(8), lakeFin)),
      mel('雙簧管', 'r_oboe', .7, -.1, 16, lakeB),
      mel('小提琴', 'r_vln', .45, .25, 24, lakeFin),
      play('合唱', 'choir', .25, .2, lakeP, 24, 32, F.pad5),
    ] };

  /* ④ 月下長廊（悠揚，A 小調）：鋼琴琶音像腳步，雙簧管、長笛、小提琴輪流唱同一條旋律的低、高、收束三種樣子，古箏偶爾點一下像月光落在地板上 */
  const moonL = ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am'], moonP = [...moonL, ...moonL, ...moonL, ...moonL];
  const moonA = '^3-^16 | ^2-^4^6 | ^5-^27 | ^1-^3- | ^4-^6^^1 | ^6-^4^2 | 7-#57 | 6---';
  const moonB = '^6-^3^1 | ^4-^2^4 | ^2-^5^7 | ^^1-^5^3 | ^6-^4^1 | ^4-^6^^1 | ^7-^^3- | ^6---';
  const moon = { id:'moon-1', name:'悠揚・月下長廊', composer:'Claude', bpm:54,
    check:{ prog:moonP, melody:['雙簧管', '長笛', '小提琴'] }, parts:[
      play('鋼琴琶音', 'piano', .5, -.15, moonP, 0, 32, F.arp),
      play('大提琴', 'r_cello', .6, -.4, moonP, 4, 32, F.bassRoot),
      mel('雙簧管', 'r_oboe', .75, .1, 8, jp(moonA, moonB, moonA)),
      mel('長笛', 'r_flute', .55, .3, 16, moonB),
      mel('小提琴', 'r_vln', .55, .2, 24, moonA),
      play('弦樂顫音', 'r_trem', .3, .25, moonP, 16, 32, F.pad3),
      play('古箏', 'guzheng', .45, -.1, moonP, 8, 32, F.pluck),
    ] };

  return [voyage, hymn, lake, moon];
})();
ORCH_TUNES.push(...WORKS);
if(typeof module !== 'undefined') module.exports = WORKS;
