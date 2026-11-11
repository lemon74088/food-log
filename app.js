(function(){
"use strict";

/* ---------- 基本工具 ---------- */
var $ = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var MEALS = ["早餐","午餐","點心","晚餐","宵夜"];
var SYMPTOMS = ["脹氣","腹瀉","胃痛","疲倦","過敏","頭暈"];

function pad(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function todayStr(){ return ymd(new Date()); }
function parseYmd(s){ var p=s.split("-").map(Number); return new Date(p[0],p[1]-1,p[2]); }
function addDays(s,n){ var d=parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); }
function diffDays(a,b){ return Math.round((parseYmd(b)-parseYmd(a))/86400000); }
function niceDate(s){ var d=parseYmd(s); return d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日 星期"+"日一二三四五六"[d.getDay()]; }
function shortDate(s){ var d=parseYmd(s); return (d.getMonth()+1)+"/"+d.getDate(); }
function nowTime(){ var d=new Date(); return pad(d.getHours())+":"+pad(d.getMinutes()); }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function uid(){ return (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }
function mealFromTime(t){
  var h = parseInt(String(t).slice(0,2),10);
  if(h>=5 && h<11) return "早餐";
  if(h>=11 && h<15) return "午餐";
  if(h>=15 && h<17) return "點心";
  if(h>=17 && h<21) return "晚餐";
  return "宵夜";
}

/* ---------- 視覺用小工具（不影響資料） ---------- */
var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z"></path><path d="M13.5 6.5 17.5 10.5"></path></svg>';
var ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15"></path><path d="M9.5 7V4.8h5V7"></path><path d="M6.5 7l.9 12.2h9.2L17.5 7"></path></svg>';

function emptyState(title, sub){
  return '<div class="empty">'+
    '<span class="art" aria-hidden="true"><svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+
      '<path class="steam" d="M37 33c0-5 4-5.5 4-10"></path>'+
      '<path class="steam s2" d="M47 31c0-5 4-5.5 4-10"></path>'+
      '<path class="steam s3" d="M57 33c0-5 4-5.5 4-10"></path>'+
      '<path d="M16 45h64a32 32 0 0 1-64 0Z"></path>'+
      '<path d="M26 78h44" opacity=".45"></path>'+
    '</svg></span>'+
    '<b>'+title+'</b>'+sub+'</div>';
}

function groupHTML(list, meal){
  var items = list.filter(function(e){ return e.meal===meal; });
  if(!items.length) return "";
  return '<div class="mealgroup" data-meal="'+esc(meal)+'">'+
    '<div class="gtitle"><span>'+esc(meal)+'</span><i class="gcount">'+items.length+'</i></div>'+
    items.map(cardHTML).join("")+
  '</div>';
}

/* ---------- 資料層 ---------- */
var DB_NAME="foodlog-db", STORE="entries", db=null, entries=[], selectedDate=todayStr(), pendingPhoto=null;
var DEMO = /[?&]demo=1/.test(location.search);

function openDB(){
  return new Promise(function(res,rej){
    var req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = function(){
      var d = req.result;
      if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onsuccess = function(){ res(req.result); };
    req.onerror = function(){ rej(req.error); };
  });
}
function store(mode){ return db.transaction(STORE,mode).objectStore(STORE); }
function dbAll(){ return new Promise(function(res,rej){ var r=store("readonly").getAll(); r.onsuccess=function(){res(r.result||[]);}; r.onerror=function(){rej(r.error);}; }); }
function dbPut(o){ if(DEMO) return Promise.resolve(); return new Promise(function(res,rej){ var r=store("readwrite").put(o); r.onsuccess=function(){res();}; r.onerror=function(){rej(r.error);}; }); }
function dbDel(id){ if(DEMO) return Promise.resolve(); return new Promise(function(res,rej){ var r=store("readwrite").delete(id); r.onsuccess=function(){res();}; r.onerror=function(){rej(r.error);}; }); }

/* ---------- 狀態 ---------- */
var view="today", rangeMode="30", customFrom=addDays(todayStr(),-29), customTo=todayStr();
var calY=new Date().getFullYear(), calM=new Date().getMonth();
var lastDeleted=null;

/* ---------- 畫面切換 ---------- */
function setView(v){
  view=v;
  $$(".view").forEach(function(el){ el.classList.toggle("on", el.id==="v-"+v); });
  $$("#tabbar button").forEach(function(b){ b.classList.toggle("on", b.dataset.view===v); });
  if(v==="calendar") renderCalendar();
  if(v==="stats") renderStats();
  if(v==="report") renderReport();
  if(v==="today") renderPets();
  window.scrollTo(0,0);
}

/* ---------- 今天 ---------- */
function renderToday(){
  var isToday = selectedDate===todayStr();
  $("#dayLabel").textContent = isToday ? "今天" : (selectedDate===addDays(todayStr(),-1) ? "昨天" : niceDate(selectedDate).replace(/ \S+$/,""));
  $("#dateLabel").textContent = niceDate(selectedDate);

  var list = entries.filter(function(e){ return e.date===selectedDate; })
                   .sort(function(a,b){ return a.time.localeCompare(b.time); });
  var wrap = $("#entryList");
  if(!list.length){
    wrap.innerHTML = emptyState("這天還沒有紀錄", "在上面打一句話就能開始；用 ‹ › 或到日曆頁點日期可以看別天。");
    return;
  }
  var html="";
  MEALS.forEach(function(m){ html += groupHTML(list, m); });
  var other = list.filter(function(e){ return MEALS.indexOf(e.meal)<0; });
  if(other.length) html += groupHTML(list, "其他");
  wrap.innerHTML = html;
}

function cardHTML(e){
  var syms = (e.symptoms&&e.symptoms.length) ? '<div class="syms">'+e.symptoms.map(function(s){return '<span class="sym">'+esc(s)+'</span>';}).join("")+'</div>' : "";
  var photo = e.photo ? '<img class="thumb'+(e.text?"":" big")+'" src="'+e.photo+'" alt="餐點照片">' : "";
  var note = e.note ? '<div class="note">'+esc(e.note)+'</div>' : "";
  var symOpts = SYMPTOMS.map(function(s){
    var on = (e.symptoms||[]).indexOf(s)>=0;
    return '<button type="button" data-sym="'+esc(s)+'" class="'+(on?"sel":"")+'">'+esc(s)+'</button>';
  }).join("");
  var mealOpts = MEALS.map(function(m){ return '<option value="'+m+'"'+(m===e.meal?" selected":"")+'>'+m+'</option>'; }).join("");

  return '<article class="card" data-id="'+e.id+'" data-meal="'+esc(e.meal)+'">'+
    '<div class="cardmain">'+
      '<div class="meta"><span class="time">'+e.time+'</span><span class="meal">'+esc(e.meal)+'</span></div>'+
      (e.text ? '<div class="text">'+esc(e.text)+'</div>' : '<div class="text muted">只有照片，還沒有文字</div>')+ syms + note +
    '</div>'+ photo +
    '<div class="cardfoot no-print">'+
      '<button class="link" data-act="edit" type="button" aria-label="編輯這筆紀錄" title="編輯">'+ICON_EDIT+'</button>'+
      '<button class="link danger" data-act="del" type="button" aria-label="刪除這筆紀錄" title="刪除">'+ICON_DEL+'</button>'+
    '</div>'+
    '<div class="editbox">'+
      '<div class="editrow"><input type="time" data-f="time" value="'+e.time+'">'+
        '<select data-f="meal">'+mealOpts+'</select></div>'+
      '<div class="editrow"><textarea data-f="text" placeholder="吃了什麼">'+esc(e.text)+'</textarea></div>'+
      '<div class="symtoggle">'+symOpts+'</div>'+
      '<div class="editrow"><textarea data-f="note" placeholder="備註（選填）">'+esc(e.note||"")+'</textarea></div>'+
      '<div class="crow"><button class="ghost" type="button" data-act="cancel">取消</button><span class="spacer"></span><button class="primary" type="button" data-act="save">儲存</button></div>'+
    '</div>'+
  '</article>';
}

function renderFreq(){
  var from = addDays(todayStr(),-30);
  var counts = {};
  entries.filter(function(e){ return e.date>=from; }).forEach(function(e){
    tokensOf(e).forEach(function(t){ counts[t]=(counts[t]||0)+1; });
  });
  var top = Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; }).slice(0,10);
  var wrap = $("#freqWrap"), row = $("#freqRow");
  if(!top.length){ wrap.hidden = true; return; }
  wrap.hidden = false;
  row.innerHTML = top.map(function(t){ return '<button class="fchip" type="button">'+esc(t)+'</button>'; }).join("");
}

function tokensOf(e){
  if(e.items && e.items.length){
    return e.items.map(function(i){ return (typeof i==="string")? i : i.name; }).filter(function(s){ return s && s.trim(); });
  }
  var MEASURE = {"顆":1,"粒":1,"碗":1,"杯":1,"份":1,"個":1,"片":1,"塊":1,"條":1,"支":1,"根":1,"盤":1,"碟":1,"匙":1,"口":1,"把":1,"瓶":1,"包":1,"盒":1,"串":1,"斤":1,"克":1,"公克":1,"毫升":1,"cc":1,"大":1,"小":1,"中":1};
  return String(e.text||"").split(/[、,，。;；\/\s]+/).filter(function(s){
    if(!s || /^\d+$/.test(s)) return false;
    if(s.length===1 && MEASURE[s]) return false;
    if(/^(\d+(\.\d+)?)'?$/.test(s)) return false;
    return true;
  });
}

/* ---------- 新增 ---------- */
async function addEntry(){
  var text = $("#quickText").value.trim();
  if(!text && !pendingPhoto){ toast("先打一句話，或加一張照片"); return; }
  var t = nowTime();
  var e = {
    id: uid(), date: selectedDate, time: t, meal: mealFromTime(t),
    text: text, items: [], symptoms: [], note: "",
    photo: pendingPhoto || null, createdAt: new Date().toISOString()
  };
  await dbPut(e);
  var beforeN = entries.length;
  entries.push(e);
  $("#quickText").value = "";
  clearPhoto();
  renderToday(); renderFreq();
  toast("已記錄 " + e.time + " " + e.meal);
  checkEntryBadge(beforeN, entries.length);
}

function clearPhoto(){
  pendingPhoto=null;
  $("#photoBtn").classList.remove("attached");
  $("#photoLabel").textContent = "照片";
  $("#photoHint").textContent = "";
}

function compressImage(file){
  return new Promise(function(res,rej){
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function(){
      var max = 800;
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, max/Math.max(w,h));
      var cw = Math.round(w*scale), ch = Math.round(h*scale);
      var c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      c.getContext("2d").drawImage(img,0,0,cw,ch);
      URL.revokeObjectURL(url);
      try { res(c.toDataURL("image/jpeg",0.72)); } catch(err){ rej(err); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("圖片讀取失敗")); };
    img.src = url;
  });
}

/* ---------- 刪除 / 復原 ---------- */
async function removeEntry(id){
  var e = entries.filter(function(x){ return x.id===id; })[0];
  if(!e) return;
  if(!confirm("刪除這筆紀錄？")) return;
  await dbDel(id);
  entries = entries.filter(function(x){ return x.id!==id; });
  lastDeleted = e;
  renderAll();
  toast("已刪除一筆", "復原", async function(){
    await dbPut(lastDeleted);
    entries.push(lastDeleted);
    renderAll();
    toast("已復原");
  });
}

/* ---------- 日曆 ---------- */
function renderCalendar(){
  var first = new Date(calY, calM, 1);
  var days = new Date(calY, calM+1, 0).getDate();
  var lead = first.getDay();
  $("#calTitle").textContent = calY + "年 " + (calM+1) + " 月";

  var counts = {};
  entries.forEach(function(e){ counts[e.date] = (counts[e.date]||0)+1; });

  var html = "";
  for(var i=0;i<lead;i++) html += '<div class="cell blank"></div>';
  for(var d=1; d<=days; d++){
    var ds = ymd(new Date(calY,calM,d));
    var cls = "cell";
    if(counts[ds]) cls += " has";
    if(ds===todayStr()) cls += " today";
    if(ds===selectedDate) cls += " sel";
    html += '<button class="'+cls+'" data-date="'+ds+'">'+d+(counts[ds]?'<i class="dot"></i>':'')+'</button>';
  }
  $("#calGrid").innerHTML = html;

  var inMonth = entries.filter(function(e){ return e.date.slice(0,7)===ymd(new Date(calY,calM,1)).slice(0,7); });
  var uniq = {};
  inMonth.forEach(function(e){ uniq[e.date]=1; });
  $("#calSum").innerHTML =
    '<div class="csrow"><span><b>'+Object.keys(uniq).length+'</b> 天已記</span>'+
    '<span class="dotsep"></span><span>本月共 '+days+' 天</span>'+
    '<span class="dotsep"></span><span><b>'+inMonth.length+'</b> 筆</span></div>'+
    '<div class="csnote">點日期，下方直接顯示那天的紀錄，可就地修改。</div>';
  renderCalDay();
}

function renderCalDay(){
  var wrap = $("#calDay"); if(!wrap) return;
  var list = entries.filter(function(e){ return e.date===selectedDate; })
                    .sort(function(a,b){ return a.time.localeCompare(b.time); });
  var d = parseYmd(selectedDate);
  var head = '<div class="dt"><span class="d">'+(d.getMonth()+1)+' 月 '+d.getDate()+' 日</span>'+
             '<span class="n">星期'+"日一二三四五六"[d.getDay()]+'・'+(list.length? list.length+' 筆':'尚無紀錄')+'</span></div>';
  var body = "";
  if(list.length){
    MEALS.forEach(function(m){ body += groupHTML(list, m); });
    var other = list.filter(function(e){ return MEALS.indexOf(e.meal)<0; });
    if(other.length) body += groupHTML(list, "其他");
  } else {
    body = emptyState("這天還沒有紀錄", "在下面打一句話就能補記。");
  }
  wrap.innerHTML = head + body +
    '<div class="quick"><input id="calQuick" placeholder="補記這一天吃了什麼"><button class="primary" id="calAdd" type="button">記錄</button></div>';
  $("#calAdd").onclick = function(){ addEntryTo(selectedDate); };
}

async function addEntryTo(date){
  var txt = ($("#calQuick").value || "").trim();
  if(!txt){ toast("先打一句話"); return; }
  var t = nowTime();
  var e = {id:uid(), date:date, time:t, meal:mealFromTime(t), text:txt, items:[],
           symptoms:[], note:"", photo:null, createdAt:new Date().toISOString()};
  await dbPut(e);
  var beforeCal = entries.length;
  entries.push(e);
  $("#calQuick").value = "";
  renderAll();
  toast("已補記 "+shortDate(date)+" "+t);
  checkEntryBadge(beforeCal, entries.length);
}

/* ---------- 統計 ---------- */
function rangeBounds(){
  if(rangeMode==="7") return {from: addDays(todayStr(),-6), to: todayStr()};
  if(rangeMode==="30") return {from: addDays(todayStr(),-29), to: todayStr()};
  if(rangeMode==="month"){ var d=new Date(); return {from: ymd(new Date(d.getFullYear(),d.getMonth(),1)), to: ymd(new Date(d.getFullYear(),d.getMonth()+1,0))}; }
  if(rangeMode==="lastmonth"){ var d2=new Date(); return {from: ymd(new Date(d2.getFullYear(),d2.getMonth()-1,1)), to: ymd(new Date(d2.getFullYear(),d2.getMonth(),0))}; }
  return {from: customFrom, to: customTo};
}

function renderStats(){
  var b = rangeBounds();
  if(b.from > b.to){ var t=b.from; b.from=b.to; b.to=t; }
  var days = diffDays(b.from,b.to)+1;
  var inRange = entries.filter(function(e){ return e.date>=b.from && e.date<=b.to; });
  $("#periodLine").textContent = niceDate(b.from).replace(/ \S+$/,"") + " — " + niceDate(b.to).replace(/ \S+$/,"") + "（共 " + days + " 天）";

  var recDays = {}, tok = {}, hours = {};
  var firstT=[], lastT=[];
  inRange.forEach(function(e){
    recDays[e.date]=1;
    tokensOf(e).forEach(function(t){ tok[t]=(tok[t]||0)+1; });
    var h = parseInt(e.time.slice(0,2),10);
    hours[h]=(hours[h]||0)+1;
  });
  var byDay = {};
  inRange.forEach(function(e){ (byDay[e.date] = byDay[e.date]||[]).push(e); });
  Object.keys(byDay).forEach(function(d){
    var es = byDay[d].slice().sort(function(x,y){ return x.time.localeCompare(y.time); });
    firstT.push(es[0].time); lastT.push(es[es.length-1].time);
  });

  var recN = Object.keys(recDays).length;
  var pct = days ? Math.round(recN/days*100) : 0;
  var divN = Object.keys(tok).length;

  $("#statTiles").innerHTML =
    tile("記錄完整度", pct+"%", "記了 "+recN+"／"+days+" 天", "mint") +
    tile("紀錄筆數", inRange.length, "平均每天 "+(recN? (inRange.length/recN).toFixed(1):"0")+" 筆", "tomato") +
    tile("食物多樣性", divN, "不同食物／詞", "grape") +
    tile("有症狀的餐", inRange.filter(function(e){ return e.symptoms && e.symptoms.length; }).length, "可對照吃了什麼", "sun");

  // 完整度
  var missing = [];
  for(var i=0;i<days;i++){
    var ds = addDays(b.from,i);
    if(!recDays[ds]) missing.push(ds);
  }
  $("#completeness").innerHTML = recN===days
    ? '<div class="hint">這期間每一天都有紀錄。</div><div class="prog"><i style="width:100%"></i></div>'
    : '<div class="hint miss">缺 <b>'+missing.length+'</b> 天'+(missing.length?'：'+missing.slice(0,8).map(shortDate).join("、")+(missing.length>8?" 等":""):"")+'</div>'+
      '<div class="prog"><i style="width:'+pct+'%"></i></div>';

  // 排行
  var rank = Object.keys(tok).sort(function(a,b2){ return tok[b2]-tok[a]; }).slice(0,12);
  var max = rank.length ? tok[rank[0]] : 1;
  $("#rankList").innerHTML = rank.length ? rank.map(function(t,i){
    return '<li><div class="rtop"><span class="rn">'+esc(t)+'</span><span class="rc">'+tok[t]+' 次</span></div>'+
      '<div class="track"><i class="fill c'+(i%4)+'" style="width:'+Math.max(5,Math.round(tok[t]/max*100))+'%"></i></div></li>';
  }).join("") : '<li style="color:#A08D78;border:0;padding:6px 0">這期間還沒有紀錄</li>';

  // 時段
  var hmax = 1;
  for(var h=0;h<24;h++){ if((hours[h]||0)>hmax) hmax=hours[h]; }
  var bars="";
  for(var h2=0;h2<24;h2++){
    bars += '<i title="'+pad(h2)+':00 · '+(hours[h2]||0)+' 筆"><b style="height:'+Math.round((hours[h2]||0)/hmax*100)+'%"></b></i>';
  }
  $("#hourBars").innerHTML = bars;

  var tl = "";
  if(firstT.length){
    var avgFirst = avgTime(firstT), avgLast = avgTime(lastT);
    tl = "最早的一餐平均 " + avgFirst + "，最晚的一餐平均 " + avgLast +
         "，進食時間約 " + windowHours(avgFirst, avgLast) + " 小時。";
  } else {
    tl = "這期間沒有紀錄。";
  }
  $("#timeLine").textContent = tl;
  renderBadgeWall();
}

function tile(k,v,s,tone){
  return '<div class="tile spot t-'+tone+'"><div class="k">'+k+'</div><div class="v">'+v+'</div><div class="s">'+s+'</div></div>';
}
function toMin(t){ return parseInt(t.slice(0,2),10)*60 + parseInt(t.slice(3,5),10); }
function avgTime(list){
  var sum = list.reduce(function(a,t){ return a+toMin(t); },0)/list.length;
  var m = Math.round(sum);
  return pad(Math.floor(m/60)%24)+":"+pad(m%60);
}
function windowHours(a,b){
  var d = toMin(b)-toMin(a); if(d<0) d+=1440;
  return (d/60).toFixed(1);
}

/* ---------- 報告 ---------- */
function renderReport(){
  var b = rangeBounds();
  if(b.from > b.to){ var t=b.from; b.from=b.to; b.to=t; }
  var list = entries.filter(function(e){ return e.date>=b.from && e.date<=b.to; })
                    .sort(function(a,c){ return (a.date+a.time).localeCompare(c.date+c.time); });

  var showTime=$("#optTime").checked, showPhoto=$("#optPhoto").checked,
      showSym=$("#optSym").checked, showNote=$("#optNote").checked;

  var head = '<h2>食物紀錄期間報告</h2><div class="range">'+
    niceDate(b.from).replace(/ \S+$/,"")+' — '+niceDate(b.to).replace(/ \S+$/,"")+
    '　共 '+(diffDays(b.from,b.to)+1)+' 天／'+list.length+' 筆　列印日期 '+todayStr()+'</div>';

  if(!list.length){
    $("#reportSheet").innerHTML = head + '<div class="rempty">這段期間沒有紀錄。</div>';
    return;
  }

  var days = diffDays(b.from,b.to)+1;
  var recSet = {}, tok = {}, symCount = 0, symTally = {};
  list.forEach(function(e){
    recSet[e.date] = 1;
    tokensOf(e).forEach(function(t){ tok[t]=(tok[t]||0)+1; });
    if(e.symptoms && e.symptoms.length){
      symCount++;
      e.symptoms.forEach(function(s){ symTally[s]=(symTally[s]||0)+1; });
    }
  });
  var top = Object.keys(tok).sort(function(a,c){ return tok[c]-tok[a]; }).slice(0,5)
    .map(function(t){ return esc(t)+"（"+tok[t]+"）"; }).join("、");
  var symLine = Object.keys(symTally).sort(function(a,c){ return symTally[c]-symTally[a]; })
    .map(function(s){ return esc(s)+" "+symTally[s]+" 次"; }).join("、");
  var sum = '<div class="rsum">期間 <b>'+days+'</b> 天，有紀錄 <b>'+Object.keys(recSet).length+'</b> 天，共 <b>'+list.length+'</b> 筆；有症狀的餐 <b>'+symCount+'</b> 筆。'+
    (top ? "<br>最常出現："+top : "")+
    (symLine ? "<br>症狀："+symLine : "")+'</div>';

  var byDate = {};
  list.forEach(function(e){ (byDate[e.date]=byDate[e.date]||[]).push(e); });

  var body = Object.keys(byDate).sort().map(function(d){
    var es = byDate[d].sort(function(a,c){ return a.time.localeCompare(c.time); });
    return '<div class="dayblk"><h4>'+niceDate(d)+'　'+es.length+' 筆</h4>'+ es.map(function(e){
      var left = showTime ? '<span class="t">'+e.time+'</span>' : '';
      var sym = (showSym && e.symptoms && e.symptoms.length) ? '<div class="syms">'+e.symptoms.map(function(s){return '<span class="sym">'+esc(s)+'</span>';}).join("")+'</div>' : "";
      var note = (showNote && e.note) ? '<div class="note">'+esc(e.note)+'</div>' : "";
      var photo = (showPhoto && e.photo) ? '<img class="rphoto" src="'+e.photo+'" alt="餐點照片">' : "";
      var line = e.text ? esc(e.text) : '<span style="color:#A08D78">（只有照片，沒有文字）</span>';
      return '<div class="mline">'+left+'<span class="m">'+e.meal+'</span><div class="b">'+line+sym+note+photo+'</div></div>';
    }).join("")+'</div>';
  }).join("");

  $("#reportSheet").innerHTML = head + sum + body;
}

/* ---------- 匯出 / 匯入 ---------- */
function backupText(){
  return JSON.stringify({version:1, exportedAt:new Date().toISOString(), entries:entries, pets:{days:petState.days}}, null, 2);
}
function backupName(){ return "食物紀錄-"+todayStr()+".json"; }
function markBackup(){
  try { localStorage.setItem("fl-last-backup", new Date().toISOString()); } catch(e){}
  showBackupLine();
}
function showBackupLine(){
  var el = $("#backupLine"); if(!el) return;
  var v = null;
  try { v = localStorage.getItem("fl-last-backup"); } catch(e){}
  el.textContent = v ? ("上次備份：" + v.slice(0,10) + "（換裝置時用它匯入）") : "還沒有備份紀錄";
}

async function exportJSON(){
  var text = backupText(), name = backupName();
  // 手機優先：用系統分享（可存到「檔案」App 或傳給自己）
  try {
    if(window.File && navigator.canShare){
      var file = new File([text], name, {type:"application/json"});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:"食物紀錄備份"});
        markBackup(); toast("已交出備份檔"); return;
      }
    }
  } catch(err){
    if(err && err.name==="AbortError") return;   // 使用者取消，不算失敗
  }
  // 桌機／不支援分享：走一般下載
  var blob = new Blob([text], {type:"application/json"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  markBackup();
  toast("已匯出備份檔");
}

async function copyBackup(){
  var text = backupText();
  try {
    await navigator.clipboard.writeText(text);
    markBackup();
    toast("備份內容已複製，貼到記事本或寄給自己即可");
  } catch(err){
    // 沒有剪貼簿權限時，退成「開一個新視窗讓你自己長按複製」
    var w = window.open("", "_blank");
    if(w){
      w.document.write('<meta name="viewport" content="width=device-width,initial-scale=1"><pre style="white-space:pre-wrap;font:14px/1.6 -apple-system,sans-serif;padding:16px">'+text.replace(/</g,"&lt;")+'</pre>');
      w.document.title = name;
      markBackup();
    } else {
      alert("這個瀏覽器不給複製，請改用「匯出備份」。");
    }
  }
}

async function importJSON(file){
  var text;
  try { text = await file.text(); }
  catch(e){ alert("這個檔案讀不進來，換一個試試。"); return; }
  var data;
  try { data = JSON.parse(text); } catch(e){ alert("檔案格式不對（不是 JSON），無法匯入。"); return; }
  var list = data.entries || (Array.isArray(data) ? data : null);
  if(!list){ alert("這個檔案裡找不到 entries 欄位。"); return; }
  if(DEMO){ toast("示範模式不能匯入，請開正式網址"); return; }
  var added = 0, skipped = 0;
  for(var i=0;i<list.length;i++){
    var e = list[i];
    if(!e || !e.id || !e.date){ skipped++; continue; }
    try { await dbPut(e); added++; } catch(err){ skipped++; }
  }
  entries = await dbAll();
  if(data.pets && data.pets.days && typeof data.pets.days === "object"){
    Object.keys(data.pets.days).forEach(function(k){ petState.days[k] = 1; });
    savePets();
    renderPets();
  }
  renderAll();
  toast("匯入 "+added+" 筆" + (skipped ? "，略過 "+skipped+" 筆" : ""));
}

/* ---------- 下載單檔版（部署用） ---------- */
async function buildStandalone(){
  var btn = $("#deployBtn");
  var label = btn ? btn.querySelector(".lbl") : null;
  var old = label ? label.textContent : "";
  if(label) label.textContent = "打包中…";
  if(btn) btn.disabled = true;
  try {
    var res = await Promise.all([
      fetch("index.html").then(function(r){ if(!r.ok) throw new Error("index.html"); return r.text(); }),
      fetch("styles.css").then(function(r){ if(!r.ok) throw new Error("styles.css"); return r.text(); }),
      fetch("app.js").then(function(r){ if(!r.ok) throw new Error("app.js"); return r.text(); })
    ]);
    var html = res[0], css = res[1], js = res[2];

    for(var i=0;i<CATS.length;i++){
      var c = CATS[i];
      var ir = await fetch(c.img);
      if(!ir.ok) throw new Error(c.img);
      var blob = await ir.blob();
      var data = await new Promise(function(ok,no){
        var fr = new FileReader();
        fr.onload = function(){ ok(fr.result); };
        fr.onerror = no;
        fr.readAsDataURL(blob);
      });
      js = js.split(c.img).join(data);
    }

    // 避免内联脚本被 </script> 截断
    js = js.replace(/<\/script/gi, "<\\/script");

    html = html.replace('<link rel="preload" as="style" href="styles.css">\n', "");
    html = html.replace('<link rel="stylesheet" href="styles.css">', function(){ return '<style>\n'+css+'\n</style>'; });
    html = html.replace('<script src="app.js"></script>', function(){ return '<script>window.__FOODLOG_STANDALONE=true;\n'+js+'\n</script>'; });

    var out = new Blob([html], {type:"text/html;charset=utf-8"});
    var url = URL.createObjectURL(out);
    var a = document.createElement("a");
    a.href = url; a.download = "index.html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
    toast("已產生單檔版本，正在下載");
  } catch(err){
    console.error(err);
    toast("打包失敗：請直接複製 index.html、styles.css、app.js、assets");
  } finally {
    if(label) label.textContent = old;
    if(btn) btn.disabled = false;
  }
}

/* ---------- toast ---------- */
var toastTimer=null;
function toast(msg, actLabel, actFn){
  var el = $("#toast"), at = $("#toastAct");
  $("#toastText").textContent = msg;
  if(actLabel){
    at.hidden = false; at.textContent = actLabel;
    at.onclick = function(){ at.hidden=true; el.classList.remove("on"); if(actFn) actFn(); };
  } else { at.hidden = true; at.onclick = null; }
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove("on"); }, actLabel?6000:2600);
}

/* ---------- 小貓打卡 ---------- */
var PET_KEY = "fl-pets-v1";
var PET_STAGES = [1,3,7,14,30];
var CATS = [
  { name:"橘子", color:"#EE8B3E", alt:"橘色虎斑小貓",
    img:"data:image/jpeg;base64,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",
    lines:["罐罐！是罐罐嗎？","今天吃什麼～","我先聞一下","吃飽才有力氣喵"] },
  { name:"芝麻", color:"#6B5EE6", alt:"黑色小貓",
    img:"data:image/jpeg;base64,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",
    lines:["呼…再睡五分鐘","呼嚕呼嚕…","跟你一起最安心","今天也很努力喵"] },
  { name:"布丁", color:"#1FA890", alt:"奶油色小貓",
    img:"data:image/jpeg;base64,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",
    lines:["摸摸我嘛～","等你一整天了","今天也要吃飽飽","抱一下再走"] }
];
var petState = {days:{}};
var bubbleTimer = null;

function loadPets(){
  if(DEMO){
    for(var i=1;i<=8;i++) petState.days[addDays(todayStr(),-i)] = 1;
    return;
  }
  try {
    var raw = localStorage.getItem(PET_KEY);
    if(!raw) return;
    var o = JSON.parse(raw);
    if(o && o.days && typeof o.days === "object") petState = {days:o.days};
  } catch(e){}
}

function savePets(){
  if(DEMO) return;
  try { localStorage.setItem(PET_KEY, JSON.stringify({days:petState.days})); } catch(e){}
}

function petChecked(d){ return !!(petState.days && petState.days[d]); }
function petTotal(){ return petState.days ? Object.keys(petState.days).length : 0; }
function petStreak(){
  var d = todayStr(), n = 0;
  if(!petChecked(d)) d = addDays(d,-1);
  while(petChecked(d)){ n++; d = addDays(d,-1); }
  return n;
}
function petHearts(){
  var total = petTotal(), h = 0;
  for(var i=0;i<PET_STAGES.length;i++){ if(total >= PET_STAGES[i]) h++; }
  return h;
}

function heartSvgs(n, color){
  var out = "";
  for(var i=0;i<5;i++){
    out += '<svg viewBox="0 0 24 24" class="'+(i<n?"on":"")+'" style="--cc:'+color+'" aria-hidden="true"><path d="M12 20.3s-7.7-4.7-7.7-9.7A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.7 3c0 5-7.7 9.7-7.7 9.7Z"></path></svg>';
  }
  return out;
}

function renderPets(){
  var total = petTotal(), h = petHearts(), streak = petStreak(), done = petChecked(todayStr());
  $("#petStreak").textContent = streak;

  $("#petRow").innerHTML = CATS.map(function(c,i){
    return '<button class="cat" type="button" data-cat="'+i+'" aria-label="'+c.name+'，親密度 '+h+'／5">'+
      '<span class="catpic"><img src="'+c.img+'" alt="'+c.alt+'" loading="lazy"></span>'+
      '<span class="catname">'+c.name+'</span>'+
      '<span class="hearts">'+heartSvgs(h,c.color)+'</span>'+
    '</button>';
  }).join("");

  var wk = "";
  for(var i=6;i>=0;i--){
    var d = addDays(todayStr(),-i);
    var dt = parseYmd(d);
    wk += '<span class="day'+(petChecked(d)?" on":"")+(d===todayStr()?" today":"")+'"><span>'+"日一二三四五六"[dt.getDay()]+'</span><i></i></span>';
  }
  $("#petWeek").innerHTML = wk;
  $("#petTotalLine").textContent = "累計 "+total+" 天";

  var btn = $("#petBtn");
  btn.classList.toggle("done", done);
  btn.disabled = done;
  $("#petBtnLabel").textContent = done ? "今天已打卡" : "今天打卡";
  $("#petHint").textContent = done ? "已餵飽 · 明天見" : "今天還沒餵";
}

function petSay(text){
  var b = $("#petBubble"); if(!b) return;
  b.textContent = text;
  b.classList.add("on");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(function(){ b.classList.remove("on"); }, 3000);
}

function petCheckin(){
  var today = todayStr();
  if(petChecked(today)){ toast("今天已經打過卡了，明天再來"); return; }
  var before = petHearts();
  petState.days[today] = 1;
  savePets();
  renderPets();
  var n = petStreak(), after = petHearts();
  var card = $("#petCard");
  card.classList.remove("celebrate");
  void card.offsetWidth;
  card.classList.add("celebrate");
  setTimeout(function(){ card.classList.remove("celebrate"); }, 1200);
  var c = CATS[Math.floor(Math.random()*CATS.length)];
  petSay(c.name + "：" + c.lines[Math.floor(Math.random()*c.lines.length)]);
  toast(after > before ? ("打卡成功 · 連續 "+n+" 天 · 小貓更喜歡你了") : ("打卡成功 · 連續 "+n+" 天"));
  if(after > before){
    setTimeout(function(){ badgeUnlock(BADGE_TITLES[Math.min(after,5)-1], "連續 " + n + " 天 · 親密度 " + after + "／5", "var(--tomato)"); }, 420);
  }
}

/* ---------- 成就徽章：定義 / 徽章牆 ---------- */
var BADGE_TITLES = ["初次相遇","有點熟了","好朋友","很黏人","最強羈絆"];
var BADGE_SETS = [
  { key:"checkin", label:"打卡", unit:"天", color:"var(--tomato)", stages:[1,3,7,14,30], titles:BADGE_TITLES,
    value:function(){ return petTotal(); } },
  { key:"entries", label:"紀錄", unit:"筆", color:"var(--grape)", stages:[1,30,100,365], titles:["第一筆紀錄","三十筆的習慣","一百筆的紀錄","一整年"]
    , value:function(){ return entries.length; } }
];
var badgeTimer = 0;

function closeBadge(){
  var el = $("#badgeFx");
  if(!el || el.hidden) return;
  clearTimeout(badgeTimer);
  el.classList.remove("on");
  setTimeout(function(){
    el.hidden = true;
    el.setAttribute("aria-hidden","true");
  }, 260);
}

function badgeUnlock(title, sub, color){
  var el = $("#badgeFx");
  if(!el) return;
  if(color) el.style.setProperty("--bx", color); else el.style.removeProperty("--bx");
  $("#badgeTitle").textContent = title || "成就解鎖";
  $("#badgeSub").textContent = sub || "";
  el.hidden = false;
  el.setAttribute("aria-hidden","false");
  el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(closeBadge, 3000);
}

function badgeList(){
  var out = [];
  BADGE_SETS.forEach(function(s){
    var v = s.value();
    s.stages.forEach(function(st, i){
      out.push({ set:s.key, label:s.label, unit:s.unit, color:s.color,
                 need:st, title:s.titles[i] || (s.label + " " + st + s.unit), got: v >= st });
    });
  });
  return out;
}

function renderBadgeWall(){
  var el = $("#badgeWall"); if(!el) return;
  var list = badgeList();
  var got = list.filter(function(b){ return b.got; }).length;
  el.innerHTML = list.map(function(b){
    return '<div class="bdg spot'+(b.got?" got":" lock")+'" style="--bc:'+b.color+';--spot-color:'+b.color+'">'+
      '<span class="bdghex"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 5 L89 27 V73 L50 95 L11 73 V27 Z"></path></svg><b>'+b.need+'</b></span>'+
      '<span class="bdgt">'+b.title+'</span>'+
      '<span class="bdgs">'+b.label+' '+b.need+' '+b.unit+'</span>'+
    '</div>';
  }).join("");
  $("#badgeWallHint").textContent = "已解鎖 " + got + "／" + list.length + "　·　打卡累計 " + petTotal() + " 天、紀錄 " + entries.length + " 筆";
}

function checkEntryBadge(before, after){
  if(after <= before) return;
  var set = BADGE_SETS[1], hit = null;
  set.stages.forEach(function(st, i){
    if(after >= st && before < st){
      hit = { title:set.titles[i], color:set.color,
              sub:"累計 " + after + " 筆紀錄" + (st > 1 ? " · 達成 " + st + " 筆" : "") };
    }
  });
  if(hit) setTimeout(function(){ badgeUnlock(hit.title, hit.sub, hit.color); }, 420);
}

window.__foodlogBadge = badgeUnlock;

/* ---------- 事件 ---------- */
$("#badgeFx").addEventListener("click", closeBadge);
document.addEventListener("keydown", function(ev){ if(ev.key === "Escape") closeBadge(); });
$("#petBtn").onclick = petCheckin;
$("#petRow").addEventListener("click", function(ev){
  var el = ev.target.closest(".cat"); if(!el) return;
  var c = CATS[+el.dataset.cat]; if(!c) return;
  petSay(c.name + "：" + c.lines[Math.floor(Math.random()*c.lines.length)]);
  el.classList.remove("hop");
  void el.offsetWidth;
  el.classList.add("hop");
  setTimeout(function(){ el.classList.remove("hop"); }, 700);
});

$("#prevDay").onclick = function(){ selectedDate = addDays(selectedDate,-1); renderToday(); };
$("#nextDay").onclick = function(){ selectedDate = addDays(selectedDate,1); renderToday(); };
$("#addBtn").onclick = addEntry;
$("#quickText").addEventListener("keydown", function(ev){
  if((ev.metaKey || ev.ctrlKey) && ev.key==="Enter"){ addEntry(); }
});
$("#photoBtn").onclick = function(){ $("#photoInput").click(); };
$("#photoInput").onchange = async function(ev){
  var f = ev.target.files && ev.target.files[0];
  if(!f) return;
  try {
    pendingPhoto = await compressImage(f);
    $("#photoBtn").classList.add("attached");
    $("#photoLabel").textContent = "換照片";
    $("#photoHint").textContent = "已附 1 張（約 " + Math.round(pendingPhoto.length/1024) + " KB）";
  } catch(err){ alert("這張圖讀不進來，換一張試試。"); }
  ev.target.value = "";
};
$("#photoHint").addEventListener("click", clearPhoto);

$("#freqRow").addEventListener("click", function(ev){
  var b = ev.target.closest(".fchip"); if(!b) return;
  var ta = $("#quickText");
  ta.value = ta.value ? (ta.value + "、" + b.textContent) : b.textContent;
  ta.focus();
});

async function handleCardAction(ev){
  var card = ev.target.closest(".card"); if(!card) return;
  var id = card.dataset.id;
  var actEl = ev.target.closest("[data-act]");
  var symEl = ev.target.closest("[data-sym]");
  var act = actEl ? actEl.dataset.act : null;

  if(act==="del"){ removeEntry(id); return; }
  if(act==="edit"){ card.querySelector(".editbox").classList.toggle("on"); return; }
  if(act==="cancel"){ card.querySelector(".editbox").classList.remove("on"); return; }
  if(symEl){
    symEl.classList.toggle("sel");
    return;
  }
  if(act==="save"){
    var e = entries.filter(function(x){ return x.id===id; })[0];
    if(!e) return;
    e.time = card.querySelector('[data-f="time"]').value || e.time;
    e.meal = card.querySelector('[data-f="meal"]').value;
    e.text = card.querySelector('[data-f="text"]').value.trim() || e.text;
    e.note = card.querySelector('[data-f="note"]').value.trim();
    e.symptoms = $$('.symtoggle button.sel', card).map(function(b){ return b.dataset.sym; });
    await dbPut(e);
    renderAll();
    toast("已更新");
  }
}
$("#entryList").addEventListener("click", handleCardAction);
$("#calDay").addEventListener("click", handleCardAction);

$("#tabbar").addEventListener("click", function(ev){
  var b = ev.target.closest("button[data-view]"); if(!b) return;
  b.classList.remove("hop");
  void b.offsetWidth;
  b.classList.add("hop");
  clearTimeout(b.__hopT);
  b.__hopT = setTimeout(function(){ b.classList.remove("hop"); }, 700);
  setView(b.dataset.view);
});

/* 邊框聚光：游標在卡片群裡移動時，靠近游標的卡片邊框被照亮 */
document.addEventListener("pointermove", function(ev){
  if(ev.pointerType === "touch") return;
  var h = ev.target.closest ? ev.target.closest(".spotgrid") : null;
  if(!h) return;
  $$(".spot", h).forEach(function(el){
    var r = el.getBoundingClientRect();
    el.style.setProperty("--x", (ev.clientX - r.left) + "px");
    el.style.setProperty("--y", (ev.clientY - r.top) + "px");
    el.classList.add("on");
  });
}, {passive:true});
document.addEventListener("pointerleave", function(ev){
  if(ev.pointerType === "touch") return;
  $$(".spot").forEach(function(el){ el.classList.remove("on"); });
}, true);
document.addEventListener("pointerdown", function(ev){
  if(ev.pointerType !== "touch") return;
  var h = ev.target.closest ? ev.target.closest(".spotgrid") : null;
  if(!h) return;
  $$(".spot", h).forEach(function(el){
    var r = el.getBoundingClientRect();
    el.style.setProperty("--x", (ev.clientX - r.left) + "px");
    el.style.setProperty("--y", (ev.clientY - r.top) + "px");
    el.classList.add("on");
  });
  setTimeout(function(){ $$(".spot", h).forEach(function(el){ el.classList.remove("on"); }); }, 700);
}, {passive:true});

$("#calPrev").onclick = function(){ calM--; if(calM<0){calM=11;calY--;} renderCalendar(); };
$("#calNext").onclick = function(){ calM++; if(calM>11){calM=0;calY++;} renderCalendar(); };
$("#calGrid").addEventListener("click", function(ev){
  var c = ev.target.closest(".cell[data-date]"); if(!c) return;
  selectedDate = c.dataset.date;
  renderCalendar();
});

function syncRange(){
  $$(".rchip").forEach(function(b){ b.classList.toggle("on", b.dataset.range===rangeMode); });
  var show = rangeMode==="custom";
  $("#customRange").classList.toggle("on", show);
  $("#repCustomRange").classList.toggle("on", show);
  if(show){
    $("#fromDate").value = customFrom; $("#toDate").value = customTo;
    $("#repFrom").value = customFrom; $("#repTo").value = customTo;
  }
}

$("#rangeRow").addEventListener("click", function(ev){
  var b = ev.target.closest(".rchip"); if(!b) return;
  rangeMode = b.dataset.range;
  syncRange();
  if(rangeMode!=="custom") renderStats();
});
$("#applyRange").onclick = function(){
  var f=$("#fromDate").value, t=$("#toDate").value;
  if(!f||!t){ alert("兩邊日期都要選。"); return; }
  customFrom=f; customTo=t; renderStats(); syncRange();
};

$("#repRangeRow").addEventListener("click", function(ev){
  var b = ev.target.closest(".rchip"); if(!b) return;
  rangeMode = b.dataset.range;
  syncRange();
  if(rangeMode!=="custom") renderReport();
});
$("#repApply").onclick = function(){
  var f=$("#repFrom").value, t=$("#repTo").value;
  if(!f||!t){ alert("兩邊日期都要選。"); return; }
  customFrom=f; customTo=t; renderReport(); syncRange();
};
["optTime","optPhoto","optSym","optNote"].forEach(function(id){
  $("#"+id).onchange = renderReport;
});
$("#printBtn").onclick = function(){ window.print(); };

$("#exportBtn").onclick = exportJSON;
$("#copyBtn").onclick = copyBackup;
$("#deployBtn").onclick = buildStandalone;
$("#importInput").onchange = async function(ev){
  var f = ev.target.files && ev.target.files[0];
  if(f){
    try { await importJSON(f); }
    catch(err){ alert("匯入時出錯：" + (err && err.message ? err.message : "未知錯誤")); }
  }
  ev.target.value="";
};
$("#storageBtn").onclick = async function(){
  if(!navigator.storage || !navigator.storage.estimate){ $("#storageLine").textContent = "此瀏覽器不支援"; return; }
  var est = await navigator.storage.estimate();
  $("#storageLine").textContent = Math.round(est.usage/1048576) + " MB / 約 " + Math.round(est.quota/1048576) + " MB";
};
$("#demoBtn").onclick = async function(){
  if(!confirm("載入 7 天範例資料？會與現有紀錄並存。")) return;
  var demo = [
    {d:-0,t:"08:10",m:"早餐",x:"蛋餅、豆漿",s:[],n:""},
    {d:-0,t:"12:30",m:"午餐",x:"雞腿便當",s:["脹氣"],n:"吃完有點脹"},
    {d:-0,t:"19:20",m:"晚餐",x:"番茄麵、燙青菜",s:[],n:""},
    {d:-1,t:"08:40",m:"早餐",x:"吐司夾蛋、紅茶",s:[],n:""},
    {d:-1,t:"13:05",m:"午餐",x:"牛肉麵",s:["胃痛"],n:""},
    {d:-2,t:"09:00",m:"早餐",x:"燕麥粥",s:[],n:"自煮"},
    {d:-2,t:"18:50",m:"晚餐",x:"滷肉飯、味噌湯",s:["脹氣"],n:""},
    {d:-3,t:"12:40",m:"午餐",x:"水餃 15 顆",s:[],n:""},
    {d:-4,t:"08:20",m:"早餐",x:"蛋餅、豆漿",s:[],n:""},
    {d:-4,t:"19:00",m:"晚餐",x:"咖哩飯",s:[],n:""},
    {d:-6,t:"12:10",m:"午餐",x:"雞腿便當",s:[],n:""}
  ];
  for(var i=0;i<demo.length;i++){
    var x=demo[i];
    await dbPut({id:uid(), date:addDays(todayStr(),x.d), time:x.t, meal:x.m, text:x.x,
      items:[], symptoms:x.s, note:x.n, photo:null, createdAt:new Date().toISOString()});
  }
  entries = await dbAll(); renderAll();
  toast("已載入範例資料");
};
$("#clearBtn").onclick = async function(){
  if(!confirm("清空所有紀錄？這個動作無法復原，建議先匯出備份。")) return;
  if(!confirm("確定要刪除全部資料嗎？")) return;
  for(var i=0;i<entries.length;i++) await dbDel(entries[i].id);
  entries=[]; renderAll(); toast("已清空");
};

/* ---------- 啟動 ---------- */
function renderAll(){ renderToday(); renderFreq(); if(view==="calendar") renderCalendar(); if(view==="stats") renderStats(); if(view==="report") renderReport(); }

function demoSeed(){
  var rows = [
    {d:0, t:"08:10", m:"早餐", x:"蛋餅、豆漿", s:[], n:""},
    {d:0, t:"12:30", m:"午餐", x:"雞腿便當", s:["脹氣"], n:"吃完有點脹"},
    {d:0, t:"19:20", m:"晚餐", x:"番茄麵、燙青菜", s:[], n:""},
    {d:1, t:"08:40", m:"早餐", x:"吐司夾蛋、紅茶", s:[], n:""},
    {d:1, t:"13:05", m:"午餐", x:"牛肉麵", s:["胃痛"], n:""},
    {d:2, t:"09:00", m:"早餐", x:"燕麥粥", s:[], n:"自煮"},
    {d:2, t:"18:50", m:"晚餐", x:"滷肉飯、味噌湯", s:["脹氣"], n:""},
    {d:3, t:"12:40", m:"午餐", x:"水餃 15 顆", s:[], n:""},
    {d:4, t:"08:20", m:"早餐", x:"蛋餅、豆漿", s:[], n:""},
    {d:4, t:"19:00", m:"晚餐", x:"咖哩飯", s:[], n:""},
    {d:6, t:"12:10", m:"午餐", x:"雞腿便當", s:[], n:""}
  ];
  return rows.map(function(r,i){
    return { id:"demo-"+i, date:addDays(todayStr(),-r.d), time:r.t, meal:r.m, text:r.x,
             items:[], symptoms:r.s.slice(), note:r.n, photo:null, createdAt:"" };
  });
}

(async function init(){
  if(window.__FOODLOG_STANDALONE){
    var dep = $("#deployBtn");
    if(dep && dep.parentNode) dep.parentNode.removeChild(dep);
  }
  loadPets();
  renderPets();
  try {
    if(DEMO){
      entries = demoSeed();
      $("#demobar").hidden = false;
      $("#demoBtn").style.display = "none";
      $("#subline").textContent = "示範模式：可以隨意點，重新整理就還原";
    } else {
      db = await openDB();
      entries = await dbAll();
      // 請瀏覽器不要把資料清掉（Chrome/Android 有效；iOS 仍受系統規則限制）
      try { if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
      $("#subline").textContent = entries.length ? ("共 " + entries.length + " 筆紀錄，全部存在這台裝置") : ("記錄吃什麼、什麼時候吃，一段期間整理成報告");
    }
    showBackupLine();
    $("#fromDate").value = customFrom; $("#toDate").value = customTo;
    syncRange();
    renderAll();
  } catch(err){
    console.error(err);
    var msg = (location.protocol === "file:")
      ? "直接雙擊開啟檔案時，部分瀏覽器會封鎖本機資料庫。<br>請用本機伺服器開啟，或直接部署到 GitHub Pages（見 README）。"
      : "這個瀏覽器不支援本機資料庫（IndexedDB），<br>請改用 Chrome、Edge、Safari 或 Firefox。";
    $("#entryList").innerHTML = '<div class="empty">'+msg+'</div>';
  }
  window.__foodlogReady = true;
})();

})();
