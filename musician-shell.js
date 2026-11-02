/* musician-shell.js —— 三頁共用外殼：色票切換＋「聽／做」導覽（改版提案階段 1，2026-11-02）
   頁面放一個 <span id="mnav" data-page="listen|brick|formula"></span>，這支檔把導覽與色票鍵填進去。
   色票在 <head> 載入時就套（避免閃一下預設色）。localStorage 一律包 try/catch。 */
(function(){
  var K='musician.palette', LIST=['blue','black','green'], NAME={blue:'藍金',black:'黑金',green:'綠金'};
  function get(){ try{ var v=localStorage.getItem(K); return LIST.indexOf(v)>=0?v:'blue'; }catch(e){ return 'blue'; } }
  function paint(p){
    document.documentElement.setAttribute('data-p',p);
    var b=document.getElementById('mpal'); if(b) b.textContent='◐ '+NAME[p];
    try{ window.dispatchEvent(new Event('musician-palette')); }catch(e){}
  }
  function set(p){ try{ localStorage.setItem(K,p); }catch(e){} paint(p); }
  document.documentElement.setAttribute('data-p',get());
  function T(key,fb){ return (window.TEXT&&window.TEXT[key])||fb; }
  function mount(){
    var el=document.getElementById('mnav'); if(!el) return;
    var page=el.getAttribute('data-page')||'listen', make=page==='brick'||page==='formula';
    el.className='mnav';
    var a=function(href,txt,on){ return '<a href="'+href+'"'+(on?' class="on"':'')+'>'+txt+'</a>'; };
    el.innerHTML=a('index.html',T('nav.listen','聽'),page==='listen')+a('composer.html',T('nav.make','做'),make)+
      '<button id="mpal" type="button" title="換色票"></button>';
    document.getElementById('mpal').onclick=function(){ set(LIST[(LIST.indexOf(get())+1)%LIST.length]); };
    paint(get());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
