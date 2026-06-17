// ============================================================
// FANTASY PvP — APP (navegação, Supabase, telas)
// ============================================================
const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"FLEX",BENCH:"BANCO"};
// paleta de cores por seleção/clube (código → hex). Fallback para um cinza-azulado.
const TEAM_COLOR={POR:"#E63946",COD:"#5CA8FF",AUT:"#FF6B6B",JOR:"#54E0A8",NED:"#FF7A1A",JPN:"#4D7BFF",UZB:"#3DC1D3",COL:"#FFD23F",GHA:"#54E0A8",PAN:"#E63946",ENG:"#5CA8FF",CRO:"#E63946",BRA:"#FFC247",ARG:"#62C9F5",FRA:"#5C6BFF",ESP:"#E63946",GER:"#EEF2FB"};
const teamColor=code=>TEAM_COLOR[code]||"#8B97B8";
// admins: só estes usuários veem os botões de fechar/reabrir pool
const ADMINS=["Lucchini"];
const isAdmin=()=>APP.user&&ADMINS.includes(APP.user.username);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=id=>document.getElementById(id);

// estado global
let APP={
  user:null,            // {username}
  view:"home",          // home | room | build | result
  roomId:null,
  jogos:[],
  prepool:null, match:null, roomMeta:null,
  slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},
  captain:null, tactic:null, tab:"ALL", warn:"", showRules:false, confirm:null,
  entries:[],           // entries da sala (pro ranking)
};

// ---------- Supabase REST helpers ----------
async function sb(path, opts={}){
  const r=await fetch(SUPA.url+"/rest/v1/"+path,{headers:SUPA.headers(),...opts});
  if(!r.ok){const t=await r.text();throw new Error("Supabase "+r.status+": "+t);}
  if(r.status===204)return null;
  return r.json();
}
async function sbInsert(table,row,upsert=false){
  const h=SUPA.headers(); h["Prefer"]=upsert?"resolution=merge-duplicates,return=representation":"return=representation";
  return sb(table,{method:"POST",headers:h,body:JSON.stringify(row)});
}
async function sbUpdate(table,patch,filter){
  const h=SUPA.headers(); h["Prefer"]="return=representation";
  return sb(`${table}?${filter}`,{method:"PATCH",headers:h,body:JSON.stringify(patch)});
}
async function sbDelete(table,filter){
  return sb(`${table}?${filter}`,{method:"DELETE",headers:SUPA.headers()});
}

// hash de senha bem simples (suficiente pra evitar troca de nome casual)
function hashPass(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;}return"h"+h.toString(16);}

// ---------- carregar JSONs locais ----------
async function loadJSON(path){const r=await fetch(path+"?t="+Date.now());if(!r.ok)throw new Error("404 "+path);return r.json();}

// ---------- TOAST ----------
let _tt=null;
function toast(m){let e=$("toast");if(!e){e=document.createElement("div");e.id="toast";e.className="toast";document.body.appendChild(e);}e.textContent=m;e.style.opacity="1";clearTimeout(_tt);_tt=setTimeout(()=>e.style.opacity="0",1900);}

// ============================================================
// LOGIN
// ============================================================
function needLogin(){ return !APP.user; }
function loginModalHTML(){
  return `<div class="modal" id="loginModal"><div class="box">
    <div class="h2 disp" style="color:var(--amber)">Entrar</div>
    <p class="p" style="margin-bottom:12px">Escolha um apelido e uma senha. Se já existe, valida a senha; se é novo, cria a conta.</p>
    <input class="input" id="li-user" placeholder="Apelido" autocomplete="off">
    <input class="input" id="li-pass" type="password" placeholder="Senha" autocomplete="off">
    <div class="warn" id="li-warn" style="display:none"></div>
    <button class="btn" onclick="doLogin()">Entrar / Criar conta</button>
  </div></div>`;
}
async function doLogin(){
  const u=$("li-user").value.trim(), p=$("li-pass").value;
  const warn=$("li-warn");
  if(u.length<2||p.length<3){warn.style.display="block";warn.textContent="Apelido (2+) e senha (3+) obrigatórios.";return;}
  if(!SUPA.ready()){warn.style.display="block";warn.textContent="Supabase não configurado (veja config.js).";return;}
  try{
    const existing=await sb("users?username=eq."+encodeURIComponent(u)+"&select=*");
    const ph=hashPass(p);
    if(existing.length){
      if(existing[0].pass_hash!==ph){warn.style.display="block";warn.textContent="Senha incorreta para esse apelido.";return;}
    }else{
      await sbInsert("users",{username:u,pass_hash:ph});
    }
    APP.user={username:u};
    localStorage_safe_set("fpvp_user",u); localStorage_safe_set("fpvp_pass",ph);
    render();
  }catch(e){warn.style.display="block";warn.textContent="Erro: "+e.message;}
}
// localStorage pode falhar em alguns contextos; protege
function localStorage_safe_set(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function localStorage_safe_get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
async function tryAutoLogin(){
  const u=localStorage_safe_get("fpvp_user"), ph=localStorage_safe_get("fpvp_pass");
  if(u&&ph&&SUPA.ready()){
    try{const ex=await sb("users?username=eq."+encodeURIComponent(u)+"&select=*");
      if(ex.length&&ex[0].pass_hash===ph){APP.user={username:u};}}catch(e){}
  }
}
function logout(){APP.user=null;localStorage_safe_set("fpvp_user","");localStorage_safe_set("fpvp_pass","");APP.view="home";render();}

// ============================================================
// NAV
// ============================================================
async function go(view,roomId){
  APP.view=view; if(roomId)APP.roomId=roomId;
  if(view==="room"||view==="build"||view==="result"){
    await loadRoom(APP.roomId);
  }
  render(); window.scrollTo(0,0);
}
async function loadRoom(roomId){
  const g=window.GAMES.data[roomId];
  APP.prepool=g.prepool;
  APP.match=g.match||{status:"pending"};
  APP.roomMeta=APP.jogos.find(j=>j.room_id===roomId)||{};
  APP._byId=Object.fromEntries(APP.prepool.players.map(p=>[p.id,p]));
  // carregar minha entry se existir
  if(APP.user&&SUPA.ready()){
    try{
      const es=await sb("entries?room_id=eq."+roomId+"&username=eq."+encodeURIComponent(APP.user.username)+"&select=*");
      if(es.length){const e=es[0];APP.slots=e.slots;APP.captain=e.captain;APP.tactic=e.tactic;}
      else{APP.slots={GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null};APP.captain=null;APP.tactic=null;}
    }catch(e){}
  }
}

// ============================================================
// TELA: HOME (lista de salas)
// ============================================================
function homeHTML(){
  const rows=APP.jogos.map(j=>{
    const st=j.status;
    const pill=st==="open"?'<span class="statuspill st-open">ABERTA</span>':st==="finished"?'<span class="statuspill st-finished">FINALIZADA</span>':'<span class="statuspill st-closed">FECHADA</span>';
    return `<div class="roomrow" onclick="go('room','${j.room_id}')">
      <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${esc(j.comp)} · ${esc(j.data||"")}</div></div>
      ${pill}</div>`;
  }).join("");
  return `<div class="card">
    <div class="h1 disp" style="color:var(--amber)">Salas</div>
    <p class="p" style="margin-bottom:14px">Escolha uma partida para montar seu time ou ver o resultado.</p>
    ${rows||'<p class="p">Nenhuma sala ainda.</p>'}
  </div>
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--red)">MANUTENÇÃO DO SITE</div>
    <p class="p" style="margin-bottom:10px">Reinício de emergência: apaga TODOS os times de TODOS os jogos (caso o site bugue). Salas e usuários são mantidos.</p>
    <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="resetAll()">🧹 Limpar todos os times (reboot)</button>
  </div>`:""}`;
}

// ============================================================
// TELA: ROOM (entrada da sala)
// ============================================================
function roomHTML(){
  const pp=APP.prepool, m=APP.match, meta=APP.roomMeta;
  const finished=m&&m.status==="finished";
  const open=meta.status==="open";
  return `<div class="scorebar">
    <div class="tag">${esc(pp.comp)} · ${esc(pp.venue||"")}</div>
    <div class="score disp">
      <div><div class="team">${esc(pp.home.name)}</div><div class="elo mono">ELO ${pp.home.elo}</div></div>
      <div class="vs mono">${finished?m.score[0]+"–"+m.score[1]:"VS"}</div>
      <div style="text-align:right"><div class="team">${esc(pp.away.name)}</div><div class="elo mono">ELO ${pp.away.elo}</div></div>
    </div></div>
  <div class="card">
    ${open?`<div class="prebox">⏳ <b>Pool aberta.</b> Monte seu time com o elenco dos dois países. Quem não entrar em campo fica com 0 pontos.</div>`:""}
    ${finished?`<div class="ok">✓ Jogo finalizado — veja o ranking e a apuração detalhada.</div>`:""}
    ${!open&&!finished?`<div class="prebox">🔒 Pool fechada, aguardando o jogo terminar.</div>`:""}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${open?`<button class="btn" onclick="go('build')">${hasEntry()?"Editar meu time":"Montar meu time"}</button>`:""}
      ${finished?`<button class="btn" onclick="go('result')">Ver ranking & resultado</button>`:""}
    </div>
    ${isAdmin()&&!finished?`<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
      <div class="tag" style="margin-bottom:6px">ADMIN</div>
      ${open
        ?`<button class="btn ghost" onclick="setPoolStatus('closed')">🔒 Fechar pool (trava as escalações)</button>`
        :`<button class="btn ghost" onclick="setPoolStatus('open')">🔓 Reabrir pool</button>`}
      <button class="btn ghost" style="margin-top:8px;color:var(--red);border-color:var(--red)" onclick="resetRoom()">🧹 Limpar times desta sala</button>
    </div>`:""}
    <button class="btn ghost" style="margin-top:8px" onclick="go('home')">← Voltar</button>
  </div>`;
}
async function setPoolStatus(status){
  if(!isAdmin())return;
  try{
    await sbUpdate("rooms",{status},`id=eq.${APP.roomId}`);
    APP.roomMeta.status=status;
    // refletir no índice em memória também
    const j=(window.GAMES.index||[]).find(x=>x.room_id===APP.roomId);if(j)j.status=status;
    toast(status==="closed"?"Pool fechada. Ninguém mais edita.":"Pool reaberta.");
    render();
  }catch(e){toast("Erro ao mudar status: "+e.message);}
}

// ---------- MANUTENÇÃO / RESET (admin) ----------
// APP.confirm = {word, label, action} controla o modal de confirmação por texto
function askConfirm(word,label,action){APP.confirm={word,label,action,typed:""};render();}
function closeConfirm(){APP.confirm=null;render();}
function confirmInput(v){if(APP.confirm)APP.confirm.typed=v;}
function confirmModalHTML(){
  const c=APP.confirm;if(!c)return"";
  const ok=c.typed===c.word;
  return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
    <div class="h2 disp" style="color:var(--red)">⚠ ${esc(c.label)}</div>
    <p class="p" style="margin:10px 0">Esta ação <b style="color:var(--chalk)">apaga os times e não pode ser desfeita</b>. Salas e usuários são mantidos. Para confirmar, digite <b style="color:var(--amber)">${c.word}</b> abaixo.</p>
    <input class="input" placeholder="Digite ${c.word}" oninput="confirmInput(this.value)" autocapitalize="characters" />
    <button class="btn" style="background:var(--red);color:#fff;margin-top:4px" ${ok?"":"disabled"} onclick="runConfirm()">Apagar agora</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
  </div></div>`;
}
async function runConfirm(){
  const c=APP.confirm;if(!c||c.typed!==c.word)return;
  const action=c.action;APP.confirm=null;render();
  try{await action();}catch(e){toast("Erro: "+e.message);}
}
// reset de UMA sala
function resetRoom(){
  if(!isAdmin())return;
  askConfirm("RESET","Limpar times desta sala",async()=>{
    await sbDelete("entries",`room_id=eq.${APP.roomId}`);
    APP.entries=[];
    toast("Times desta sala apagados.");
    render();
  });
}
// reset GERAL (todas as salas)
function resetAll(){
  if(!isAdmin())return;
  askConfirm("RESET TUDO","Manutenção: limpar TODOS os times de TODOS os jogos",async()=>{
    // deleta todas as entries (room_id sempre existe; pega todas)
    await sbDelete("entries","room_id=not.is.null");
    APP.entries=[];
    toast("Manutenção concluída. Todos os times foram apagados.");
    render();
  });
}
function hasEntry(){return APP.slots&&Object.values(APP.slots).some(Boolean);}

// ============================================================
// TELA: BUILD (montar time) — reaproveitada do chalkboard
// ============================================================
function buildHTML(){
  const pp=APP.prepool, byId=APP._byId, s=APP.slots;
  const used=Object.values(s).filter(Boolean);
  const spent=used.reduce((a,id)=>a+(byId[id]?byId[id].price:0),0);
  const left=100-spent;
  const TAC=window.ENGINE_TACTICS;
  const filt=pp.players.filter(p=>APP.tab==="ALL"||([pp.home.code,pp.away.code].includes(APP.tab)?p.team===APP.tab:p.pos===APP.tab));
  const ready=Object.values(s).every(Boolean)&&APP.captain&&APP.tactic;
  const slotsHTML=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>{
    const pid=s[sl],pl=pid?byId[pid]:null;
    const posKey=sl==="BENCH"&&pl?pl.pos:sl; // banco herda a cor da posição real do jogador
    return `<div class="slot${pl?` filled s-${posKey}`:" empty"}${pl&&APP.captain===sl?" cap":""}" onclick="${pl?`clearSlot('${sl}')`:""}">
      <div class="lab"><span class="pc-${posKey}">${SLOT_LABEL[sl]}</span>${sl==="FLEX"?" ·DEF/MEI/ATA":""}</div>
      <div class="nm">${pl?esc(pl.name):"toque num jogador"}</div>
      ${pl?`<div class="pr mono"><span class="teamtag" style="--tc:${teamColor(pl.team)}">${pl.team}</span> · ${pl.price}</div>`:""}
      ${pl&&sl!=="BENCH"?`<button class="cbtn${APP.captain===sl?" on":""}" onclick="event.stopPropagation();toggleCap('${sl}')">C</button>`:""}
    </div>`;}).join("");
  const tactsHTML=Object.entries(TAC).map(([k,t])=>`<div class="tact${APP.tactic===k?" on":""}" onclick="setTactic('${k}')"><div class="tn">${t.name}</div><div class="td">${t.desc}</div></div>`).join("");
  const tabs=["ALL",pp.home.code,pp.away.code,"GK","DEF","MID","ATT"];
  const tabsHTML=tabs.map(t=>{
    const isTeam=t===pp.home.code||t===pp.away.code;
    const isPos=["GK","DEF","MID","ATT"].includes(t);
    const on=APP.tab===t;
    let style="";
    if(on&&isTeam)style=`style="--tc:${teamColor(t)};border-color:${teamColor(t)};color:${teamColor(t)};background:color-mix(in srgb,${teamColor(t)} 14%,transparent)"`;
    else if(on&&isPos)style=`style="border-color:var(--pos-${t});color:var(--pos-${t});background:color-mix(in srgb,var(--pos-${t}) 14%,transparent)"`;
    return `<div class="ptab${on?" on":""}" ${style} onclick="setTab('${t}')">${t==="ALL"?"TODOS":isTeam?t:SLOT_LABEL[t]}</div>`;
  }).join("");
  const poolHTML=filt.map(p=>{const sel=used.includes(p.id);const dis=!sel&&left-p.price<0;return `<div class="prow${sel?" sel":""}${dis?" dis":""}" onclick="${dis?"":`place(${p.id})`}"><div class="posbar pb-${p.pos}"></div><div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div><div class="nm">${esc(p.name)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${p.team}</span>${p.age?` <span class="age">${p.age}a</span>`:""}</div><div class="pr mono">${p.price}</div></div>`;}).join("");
  return `<div class="card">
    <div class="budget"><div class="h2 disp">Seu time</div><div><span class="tag">RESTANTE </span><span class="val mono">${left}</span><span class="tag"> /100</span></div></div>
    <div class="slots">${slotsHTML}</div>
    <div class="tag" style="margin-bottom:6px">TÁTICA (ativa conforme as stats dos seus jogadores em campo · buff + nerf)</div>
    <div class="tacts">${tactsHTML}</div>
  </div>
  <div class="card">
    <div class="h2 disp">Pool <span class="tag">· ${pp.players.length} JOGADORES</span></div>
    <div class="postabs">${tabsHTML}</div>
    <div class="pool">${poolHTML}</div>
    ${APP.warn?`<div class="warn">${APP.warn}</div>`:""}
    <button class="btn" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"Salvar time":"Complete 6 slots, capitão e tática"}</button>
    <button class="btn ghost" style="margin-top:8px" onclick="go('room')">← Voltar</button>
  </div>`;
}
function place(pid){
  const byId=APP._byId,p=byId[pid],s=APP.slots,used=Object.values(s).filter(Boolean);APP.warn="";
  if(used.includes(pid)){const sl=Object.keys(s).find(k=>s[k]===pid);s[sl]=null;if(APP.captain===sl)APP.captain=null;render();return;}
  const spent=used.reduce((a,id)=>a+byId[id].price,0);
  if(100-spent-p.price<0){APP.warn="Orçamento estourado.";render();return;}
  let t=null;
  if(p.pos==="GK")t=!s.GK?"GK":!s.BENCH?"BENCH":null;
  else{if(!s[p.pos])t=p.pos;else if(!s.FLEX)t="FLEX";else if(!s.BENCH)t="BENCH";}
  if(!t){APP.warn="Sem slot compatível livre.";render();return;}
  s[t]=pid;render();
}
function clearSlot(sl){APP.slots[sl]=null;if(APP.captain===sl)APP.captain=null;render();}
function toggleCap(sl){APP.captain=APP.captain===sl?null:sl;render();}
function setTactic(k){APP.tactic=k;render();}
function setTab(t){APP.tab=t;render();}

async function saveEntry(){
  if(!SUPA.ready()){toast("Supabase não configurado.");return;}
  try{
    // trava: confirma no banco que a pool ainda está aberta antes de salvar
    const rooms=await sb(`rooms?id=eq.${APP.roomId}&select=status`);
    if(rooms&&rooms[0]&&rooms[0].status!=="open"){
      APP.roomMeta.status=rooms[0].status;
      toast("Pool fechada — não dá mais pra editar o time.");
      go("room");return;
    }
    await sbInsert("entries",{room_id:APP.roomId,username:APP.user.username,slots:APP.slots,captain:APP.captain,tactic:APP.tactic,updated_at:new Date().toISOString()},true);
    toast("Time salvo!");
    go("room");
  }catch(e){toast("Erro ao salvar: "+e.message);}
}

// ============================================================
// TELA: RESULT (ranking + apuração)
// ============================================================
async function loadEntries(){
  if(!SUPA.ready())return [];
  return sb("entries?room_id=eq."+APP.roomId+"&select=*");
}
function buildMatchCtx(){
  const pp=APP.prepool,m=APP.match;
  m.homeCode=pp.home.code;m.awayCode=pp.away.code;m.homeElo=pp.home.elo;m.awayElo=pp.away.elo;
  // set piece goals (pra tatica bola parada) — opcional no match.json
  for(const tc of [pp.home.code,pp.away.code]){if(m.team_stats[tc]&&m.team_stats[tc].setPieceGoals==null)m.team_stats[tc].setPieceGoals=0;}
  return makeEngine(m);
}
function scoreEntry(entry,eng){
  const pp=APP.prepool,byId=APP._byId,m=APP.match;
  const slots=["GK","DEF","MID","ATT","FLEX","BENCH"];
  // monta o objeto de stats de cada jogador escalado
  function rawOf(pid){const meta=byId[pid];const raw=m.players?m.players[String(pid)]:null;return Object.assign({pos:meta.pos,team:meta.team},raw||{min:0});}
  // 1ª passada SEM tática (pra decidir substituições por pontuação)
  const res={};
  for(const sl of slots){const pid=entry.slots[sl];if(!pid){res[sl]=null;continue;}res[sl]=eng.scorePlayer(rawOf(pid),null);}
  // substituição do banco
  let subOut=null;const benchPid=entry.slots.BENCH,benchMeta=benchPid?byId[benchPid]:null;
  if(benchMeta&&res.BENCH){
    if(benchMeta.pos==="GK"){
      const gkTitularMin=res.GK?res.GK.minutes:0;
      if(gkTitularMin===0&&res.BENCH){subOut="GK";[res.GK,res.BENCH]=[res.BENCH,res.GK];const t=entry.slots.GK;entry.slots.GK=entry.slots.BENCH;entry.slots.BENCH=t;}
    }
    else{const cand=[benchMeta.pos,"FLEX"].filter(x=>res[x]);let worst=null;for(const x of cand){if(!worst||res[x].total<res[worst].total||(res[x].total===res[worst].total&&x==="FLEX"))worst=x;}if(worst&&res.BENCH.total>res[worst].total){subOut=worst;const t=entry.slots[worst];entry.slots[worst]=entry.slots.BENCH;entry.slots.BENCH=t;[res[worst],res.BENCH]=[res.BENCH,res[worst]];}}
  }
  // squadSum: só os 5 que CONTAM (titulares de linha + GK, exclui o banco não-usado)
  // e dentro deles, só quem TERMINOU em campo (o engine.squadSum filtra subbedOff/min=0)
  const titulares=["GK","DEF","MID","ATT","FLEX"].map(sl=>entry.slots[sl]).filter(Boolean).map(rawOf);
  const sq=eng.squadSum(titulares);
  // 2ª passada COM tática (agora que temos o squadSum)
  let sum=0;const view=[];
  for(const sl of slots){
    const pid=entry.slots[sl];
    if(!pid){view.push(null);continue;}
    const r=eng.scorePlayer(rawOf(pid),sl==="BENCH"?null:entry.tactic,sl==="BENCH"?null:sq);
    let pts=r.total,cap=false;
    if(sl===entry.captain&&sl!=="BENCH"){pts=Math.round(pts*1.2*10)/10;cap=true;}
    if(sl!=="BENCH")sum+=pts;
    view.push({slot:sl,pid:entry.slots[sl],pts,cap,subIn:sl===subOut,r});
  }
  return {username:entry.username,total:Math.round(sum*10)/10,view,captain:entry.captain,tactic:entry.tactic,subOut,squadSum:sq};
}
function resultHTML(){
  const pp=APP.prepool,m=APP.match;
  if(!m||m.status!=="finished")return `<div class="card"><p class="p">O jogo ainda não foi finalizado.</p><button class="btn ghost" onclick="go('room')">← Voltar</button></div>`;
  const eng=buildMatchCtx();
  const scored=APP.entries.map(e=>scoreEntry(JSON.parse(JSON.stringify(e)),eng)).sort((a,b)=>b.total-a.total);
  const mine=scored.find(s=>s.username===APP.user?.username);
  const TAC=window.ENGINE_TACTICS;
  let html=`<div class="scorebar"><div class="tag">${esc(pp.comp)} · FINALIZADO</div>
    <div class="score disp"><div><div class="team">${esc(pp.home.name)}</div></div><div class="vs mono">${m.score[0]}–${m.score[1]}</div><div style="text-align:right"><div class="team">${esc(pp.away.name)}</div></div></div></div>`;
  // ranking
  html+=`<div class="card"><div class="h2 disp">Ranking da sala</div>`;
  if(scored.length===0)html+=`<p class="p">Ninguém montou time nesta sala ainda.</p>`;
  scored.forEach((s,i)=>{html+=`<div class="rank${s.username===APP.user?.username?" me":""}"><div class="po mono">${i+1}º</div><div class="nm">${esc(s.username)}<small>cap: ${esc(SLOT_LABEL[s.captain])} · ${TAC[s.tactic]?.name||s.tactic}</small></div><div class="pt mono">${s.total.toFixed(1)}</div></div>`;});
  html+=`</div>`;
  // minha apuração detalhada
  if(mine){
    html+=`<div class="card"><div class="h2 disp">Sua apuração</div><p class="p" style="margin-bottom:10px">Toque em cada jogador para abrir o cálculo.</p>`;
    mine.view.filter(Boolean).forEach((v,idx)=>{html+=receiptHTML(v,idx);});
    html+=`<div class="line total" style="font-size:16px;padding:10px 4px 4px"><span class="disp">TOTAL</span><span class="v mono" style="color:var(--amber);font-size:22px">${mine.total.toFixed(1)}</span></div>`;
    if(mine.subOut)html+=`<p class="p" style="margin-top:8px">🔄 Substituição: banco entrou no slot ${SLOT_LABEL[mine.subOut]}.</p>`;
    html+=`</div>`;
  }
  html+=`<button class="btn ghost" onclick="go('home')">← Voltar às salas</button>`;
  return html;
}
let _openRec={};
function receiptHTML(v,idx){
  const byId=APP._byId,p=byId[v.pid],r=v.r,open=_openRec[idx];
  let body="";
  if(open){
    body=`<div class="rbody">
      <div class="bsub" style="border:none;margin-top:0;padding-top:0">📋 Estatísticas · ${r.minutes}' em campo</div>
      ${r.statLines.length===0?`<div class="line"><span>Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`:""}
      ${r.statLines.map(([l,c,u,pts])=>`<div class="line stat"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
      ${r.lines.length?`<div class="bsub">⚙️ Modificadores</div>`:""}
      ${r.lines.map(([k,val])=>`<div class="line"><span>${k}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
      ${v.cap?`<div class="line"><span>Capitão</span><span class="v mono plus">×1.20</span></div>`:""}
      <div class="line total"><span>TOTAL DO SLOT</span><span class="v mono">${v.pts.toFixed(1)}</span></div>
      ${r.evNote.length?`<div class="metricbox">${r.evNote.map(e=>`<div>${esc(e)}</div>`).join("")}</div>`:""}
      <div class="chips"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${r.meta.traits.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span></div>
    </div>`;
  }
  return `<div class="receipt"><div class="rhead" onclick="toggleRec(${idx})">
    <div class="sl mono">${SLOT_LABEL[v.slot]}</div>
    <div class="nm">${esc(p.name)}<small>${p.team} · ${p.pos}${v.subIn?' · ↑ entrou do banco':''}</small></div>
    ${v.cap?'<span class="badgeC">C ×1.20</span>':''}
    <div class="tot mono${v.pts<0?" neg":""}">${v.pts.toFixed(1)}</div></div>${body}</div>`;
}
function toggleRec(i){_openRec[i]=!_openRec[i];render();}

// ============================================================
// RENDER
// ============================================================
function render(){
  const root=$("root");
  if(needLogin()){root.innerHTML=topbarHTML()+loginModalHTML();return;}
  let panel="";
  if(APP.view==="home")panel=homeHTML();
  else if(APP.view==="room")panel=roomHTML();
  else if(APP.view==="build")panel=buildHTML();
  else if(APP.view==="result")panel=resultHTML();
  root.innerHTML=topbarHTML()+panel+footHTML()+confirmModalHTML();
}
function topbarHTML(){
  return `<div class="topbar">
    <div class="logo" onclick="go('home')" style="cursor:pointer">FANTASY PvP<br><small>v2.4.0 · PvP</small></div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="userchip" onclick="toggleRules()" style="padding:5px 11px;font-weight:700" title="Como funciona">?</div>
      ${APP.user?`<div class="userchip" onclick="logout()">👤 <b>${esc(APP.user.username)}</b> · sair</div>`:""}
    </div>
  </div>${APP.showRules?rulesModalHTML():""}`;
}
function toggleRules(){APP.showRules=!APP.showRules;render();}
function rulesModalHTML(){
  return `<div class="modal" onclick="toggleRules()"><div class="box" onclick="event.stopPropagation()" style="max-height:80vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">Como funciona o Fantasy PvP</div>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">O jogo:</b> antes de cada partida real, abre uma "pool". Você monta um time de 6 jogadores escolhidos entre os elencos dos DOIS times que vão se enfrentar. Quando o jogo acontece, seus jogadores pontuam pelo que fizerem em campo de verdade.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Orçamento:</b> 100 moedas. Cada jogador tem um preço (calculado por qualidade técnica: valor de mercado corrigido pela idade). O banco também conta no orçamento.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Os 6 slots:</b> 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Capitão (×1.20):</b> escolha 1 jogador (qualquer um menos o banco) pra pontuar 20% a mais.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Banco:</b> se um titular de linha pontuar pouco, o reserva pode entrar no lugar dele (vale o maior). <b style="color:var(--chalk)">Exceção do goleiro:</b> o GK do banco só entra se o GK titular não jogar NENHUM minuto. Se o titular jogar, o reserva fica com 0.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Tática:</b> escolha 1. Ela depende de COMO você montou seu time: olha as estatísticas SOMADAS dos seus jogadores que terminaram a partida em campo (quem foi substituído ou ficou no banco não conta). Se a condição bater, dá bônus em certas ações e desconto em outras (ex: Ataque Total premia times com ≥3 gols, mas enfraquece a defesa deles). Escolher a tática certa pro seu time é estratégia.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Pontuação:</b> gols, assistências, defesas, desarmes etc. somam pontos. Gol difícil vale mais que fácil. Gol nos minutos finais de jogo apertado vale mais (clutch). Time mais fraco (underdog) ganha um bônus — calculado por ELO, forma recente e mando de campo.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Ranking:</b> quando o jogo acaba, todos os times da sala são pontuados e o ranking aparece, com a apuração detalhada de cada jogador.</p>
    <button class="btn" style="margin-top:8px" onclick="toggleRules()">Entendi</button>
  </div></div>`;
}
function footHTML(){
  return `<div class="foot">Motor v2.4.0 · ELO eloratings + FootballDatabase<br>Dados FotMob + SofaScore · ${SUPA.ready()?"Supabase conectado":"⚠ configure o config.js"}</div>`;
}

// ============================================================
// BOOT
// ============================================================
// ENGINE_TACTICS já é definido por engine.js no navegador
if(typeof window.ENGINE_TACTICS==="undefined"){window.ENGINE_TACTICS={};}
(async function boot(){
 try{
  try{
    APP.jogos=window.GAMES.index;
  }catch(e){APP.jogos=[];}
  await tryAutoLogin();
  // intercepta: quando entrar em result, precisa carregar entries
  const _go=go;
  window.go=async function(view,roomId){
    APP.view=view;if(roomId)APP.roomId=roomId;
    if(view==="room"||view==="build"||view==="result"){await loadRoom(APP.roomId);}
    if(view==="result"){APP.entries=await loadEntries();_openRec={};}
    render();window.scrollTo(0,0);
  };
  render();
 }catch(err){
  // em vez de travar no "Carregando...", mostra o erro
  var r=document.getElementById("root");
  if(r)r.innerHTML='<div style="padding:20px;color:#E0604F;font-family:monospace;font-size:13px"><b>Erro ao iniciar:</b><br>'+String(err&&err.message?err.message:err)+'<br><br><span style="color:#8FA89A">Tire um print desta tela.</span></div>';
 }
})();
