// BUILD: SORARE-v2-COM-STATS · app-part3 de 6 · 2026-06-25
// admin: criar rodada
async function createRound(name,limit,phaseId,mode,boostTokens,cfg){
  const row={group_id:APP.groupId,name,pick_limit:limit,status:"open",phase_id:phaseId||null,mode:mode||"select",boost_tokens:boostTokens||0};
  if(mode==="boost"&&cfg){
    row.boost_chips=cfg.chips||[];
    row.boost_max_per_game=cfg.maxPerGame||0;
    row.boost_min_games=cfg.minGames||0;
    row.boost_no_mix=!!cfg.noMix;
  }
  const rows=await sbInsert("rounds",row);
  await loadRounds();
  toast("Mini rodada criada!");
  if(rows&&rows[0]){enterRound(rows[0].id);}else render();
}
function setAddGameTab(t){APP.addGameTab=t;renderKeepScroll();}
async function addRoomToRound(roomId){  if(!isAdmin())return;
  if(isArchived(roomId)){toast("Jogo arquivado não pode entrar em rodada.");return;}
  await sbInsert("round_rooms",{round_id:APP.roundId,room_id:roomId,status:"open"},true,"round_id,room_id");
  await loadRound(APP.roundId);render();
}
function delRoomFromRound(roomId){
  if(!isAdmin())return;
  const j=(APP.jogos||[]).find(x=>x.room_id===roomId);
  askConfirm("REMOVER",`Tirar "${j?j.match_name:"este jogo"}" da mini rodada`,async()=>{
    await sbDelete("round_rooms",`round_id=eq.${APP.roundId}&room_id=eq.${roomId}`);
    await loadRound(APP.roundId);render();
    toast("Jogo removido da mini rodada.");
  },"Isto só tira o jogo desta mini rodada (as escalações que as pessoas fizeram nele aqui são apagadas). O jogo em si e a partida avulsa continuam existindo.");
}
// admin FASE 1: trava/destrava a seleção de jogos da rodada
async function setRoundStatus(status){
  if(!isAdmin()||!APP.roundId)return;
  try{
    // ao reabrir (open), marca picks_reopened pra vencer a trava automática do tempo;
    // ao fechar (locked_picks), limpa a marca.
    const patch={status, picks_reopened: status==="open"};
    await sbUpdate("rounds",patch,"id=eq."+APP.roundId);
    await loadRound(APP.roundId);
    toast(status==="locked_picks"?"Seleção de jogos fechada.":"Seleção de jogos reaberta.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// ADMIN: reabrir/refechar a distribuição de impulsos mesmo após o 1º jogo (override da trava temporal)
async function setDistribLock(lock){
  if(!isAdmin()||!APP.roundId)return;
  const mode=modeOf(APP.round);
  const nome=mode==="confianca"?"ordem de confiança":mode==="previsao"?"palpites":"distribuição de impulsos";
  try{
    // lock=true: força fechamento. lock=false: reabre (libera mesmo com partida começada).
    await sbUpdate("rounds",{boost_forced_lock:lock,boost_reopened:!lock},"id=eq."+APP.roundId);
    await loadRound(APP.roundId);
    toast(lock?`A ${nome} foi fechada — ninguém mais edita.`:`A ${nome} foi REABERTA pelo admin — todos podem reeditar.`);
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// compat: chamadas antigas
function toggleBoostReopen(){ setDistribLock(boostLocked()?false:true); }
function enterRound(roundId){APP.confOrderMode=false;APP.confOrderDraft=null;APP.confDrag=null;APP.confHover=null;go("round",null,roundId);}
function leaveRound(){APP.roundId=null;APP.round=null;APP.view="home";render();window.scrollTo(0,0);}
// toque num jogo da rodada → decide o que fazer
async function askEnterRoundGame(roomId){
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished"){go("result",roomId);return;} // acabou → resultado
  if(!pickedRoom(roomId)){
    // todos os modos: escala todos os jogos livremente; cria a entry vazia automaticamente
    try{
      await sbInsert("entries",{room_id:roomId,group_id:APP.groupId,round_id:APP.roundId,username:APP.user.username,slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},captain:null,tactic:null,boost:0,confirmed:false,updated_at:new Date().toISOString()});
      await loadRound(APP.roundId);
    }catch(e){toast("Erro: "+e.message);return;}
  }
  go("build",roomId);
}
// admin: excluir rodada
// ----- RENOMEAR liga / rodada(phase) / mini rodada(round) -----
function askRenameLeague(id){const l=(APP.leagues||[]).find(x=>x.id===id);APP.confirm={mode:"rename",kind:"league",id,cur:l?l.name:"",label:"Renomear liga"};render();}
function askRenamePhase(id){const p=(APP.phases||[]).find(x=>x.id===id);APP.confirm={mode:"rename",kind:"phase",id,cur:p?p.name:"",label:"Renomear rodada"};render();}
function askRenameRound(id){const r=(APP.rounds||[]).find(x=>x.id===id);const isBoost=r&&modeOf(r)==="boost";const chips=(r&&Array.isArray(r.boost_chips)&&r.boost_chips.length)?r.boost_chips.slice():(isBoost?Array(r.boost_tokens||2).fill(BOOST_PCT):[]);APP.confirm={mode:"rename",kind:"round",id,cur:r?r.name:"",roundMode:r?modeOf(r):"select",pickLimit:r?r.pick_limit:3,boostTokens:r?(r.boost_tokens||0):0,chips,boostMaxPerGame:r?(r.boost_max_per_game||0):0,boostMinGames:r?(r.boost_min_games||0):0,boostNoMix:r?!!r.boost_no_mix:false,label:"Editar mini rodada"};render();}
async function submitRename(){
  const c=APP.confirm;if(!c||!isAdmin())return;
  const f=$("renameInput");const novo=f?f.value.trim():"";
  if(!novo){toast("Digite um nome.");return;}
  const tbl=c.kind==="league"?"leagues":c.kind==="phase"?"phases":"rounds";
  const patch={name:novo};
  // mini rodada: permite editar limite de jogos (select) ou tokens (boost)
  if(c.kind==="round"){
    if(c.roundMode==="select"){const li=$("renamePick");if(li){let v=parseInt(li.value,10);if(v&&v>=1)patch.pick_limit=v;}}
    if(c.roundMode==="boost"){
      const chips=(c.chips||[]).map(v=>Number(v)||0).filter(v=>v!==0);
      if(!chips.length){toast("Adicione pelo menos uma ficha de impulso.");return;}
      const feas=boostFeasibility(chips,c.boostMaxPerGame||0,!!c.boostNoMix);
      if(!feas.ok){toast("Configuração impossível: "+feas.msg);return;}
      patch.boost_chips=chips;
      patch.boost_tokens=chips.length;
      patch.boost_max_per_game=c.boostMaxPerGame||0;
      patch.boost_min_games=c.boostMinGames||0;
      patch.boost_no_mix=!!c.boostNoMix;
    }
  }
  APP.confirm=null;
  try{
    await sbUpdate(tbl,patch,`id=eq.${c.id}`);
    await loadLeagues();await loadPhases();await loadRounds();
    if(c.kind==="league"&&APP.leagueId===c.id)await loadLeague(c.id);
    if(c.kind==="phase"&&APP.phaseId===c.id)await loadPhase(c.id);
    if(c.kind==="round"&&APP.roundId===c.id)await loadRound(c.id);
    toast("Salvo!");render();
  }catch(e){toast("Erro: "+e.message);}
}
function askDeleteRound(roundId){
  if(!isAdmin())return;
  const r=APP.rounds.find(x=>x.id===roundId);
  askConfirm("EXCLUIR",`Excluir a rodada "${r?r.name:""}"`,async()=>{
    await sbDelete("entries",`round_id=eq.${roundId}`);
    await sbDelete("round_rooms",`round_id=eq.${roundId}`);
    await sbDelete("rounds",`id=eq.${roundId}`);
    if(APP.roundId===roundId){APP.roundId=null;APP.round=null;}
    await loadRounds();
    toast("Rodada excluída.");
    APP.view="home";render();
  },"Esta ação exclui a rodada e todos os times dela. Não pode ser desfeita.");
}

// hash de senha bem simples (suficiente pra evitar troca de nome casual)
function hashPass(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;}return"h"+h.toString(16);}

// ---------- TROCAR NOME / SENHA (perfil) ----------
function askChangeUsername(){APP.confirm={mode:"changeUsername"};render();}
function askChangePassword(){APP.confirm={mode:"changePassword"};render();}
function submitChangeUsername(){
  const novo=($("cu-new")?.value||"").trim();
  const senha=$("cu-pass")?.value||"";
  if(novo.length<2){toast("O novo apelido precisa ter 2+ letras.");return;}
  if(!senha){toast("Digite sua senha atual.");return;}
  changeUsername(novo,senha).catch(e=>toast("Erro: "+e.message));
}
function submitChangePassword(){
  const atual=$("cp-old")?.value||"";
  const nova=$("cp-new")?.value||"";
  const nova2=$("cp-new2")?.value||"";
  if(!atual){toast("Digite sua senha atual.");return;}
  if(nova.length<3){toast("A nova senha precisa ter 3+ caracteres.");return;}
  if(nova!==nova2){toast("As duas senhas novas não batem.");return;}
  changePassword(atual,nova).catch(e=>toast("Erro: "+e.message));
}
async function changeUsername(novo,senha){
  if(!APP.user)return;
  const atual=APP.user.username;
  if(novo===atual){toast("Esse já é o seu apelido.");return;}
  // valida senha atual
  const me=await sb("users?username=eq."+encodeURIComponent(atual)+"&select=pass_hash");
  if(!me||!me[0]||me[0].pass_hash!==hashPass(senha)){toast("Senha incorreta.");return;}
  // o novo apelido não pode já existir
  const ex=await sb("users?username=eq."+encodeURIComponent(novo)+"&select=username");
  if(ex&&ex.length){toast("Já existe alguém com esse apelido. Escolha outro.");return;}
  // atualiza nas três tabelas que guardam o username
  await sbUpdate("users",{username:novo},"username=eq."+encodeURIComponent(atual));
  try{await sbUpdate("group_members",{username:novo},"username=eq."+encodeURIComponent(atual));}catch(e){}
  try{await sbUpdate("entries",{username:novo},"username=eq."+encodeURIComponent(atual));}catch(e){}
  APP.user={username:novo};
  try{localStorage_safe_set("fpvp_user",novo);localStorage_safe_set("fpvp_pass",me[0].pass_hash);}catch(e){}
  APP.confirm=null;
  toast("Pronto! Agora você é "+novo+".");
  clearEntriesCache();
  if(APP.view==="profile"){const ps=await loadProfileStats(novo);APP.profile=ps;}
  render();
}
async function changePassword(atual,nova){
  if(!APP.user)return;
  const me=await sb("users?username=eq."+encodeURIComponent(APP.user.username)+"&select=pass_hash");
  if(!me||!me[0]||me[0].pass_hash!==hashPass(atual)){toast("Senha atual incorreta.");return;}
  await sbUpdate("users",{pass_hash:hashPass(nova)},"username=eq."+encodeURIComponent(APP.user.username));
  try{localStorage_safe_set("fpvp_pass",hashPass(nova));}catch(e){}
  APP.confirm=null;
  toast("Senha alterada! Use a nova da próxima vez que entrar.");
  render();
}

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
    <div class="h2 disp" style="color:var(--amber)">Criar perfil / Entrar</div>
    <p class="p" style="margin-bottom:6px;font-size:13px">Você está criando o <b style="color:var(--chalk)">seu perfil</b> no Fantasy PvP. O <b style="color:var(--chalk)">apelido</b> que você escolher é como os outros jogadores vão te ver no app (nos rankings, em "quem está disputando" etc).</p>
    <p class="p" style="margin-bottom:12px;font-size:13px">A <b style="color:var(--chalk)">senha</b> protege seu perfil: toda vez que você abrir o app vai precisar dela pra entrar. Anote num lugar seguro — sem ela não dá pra acessar seu perfil. Se o apelido já existir, a senha precisa bater; se for novo, a conta é criada na hora.</p>
    <input class="input" id="li-user" placeholder="Apelido (como vão te ver)" autocomplete="off">
    <div style="position:relative">
      <input class="input" id="li-pass" type="password" placeholder="Senha (você vai usar toda vez)" autocomplete="off" style="padding-right:44px">
      <span id="li-eye" onclick="togglePassVisib('li-pass','li-eye')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8" title="Mostrar/ocultar senha">👁️</span>
    </div>
    <div class="warn" id="li-warn" style="display:none"></div>
    <button class="btn" onclick="doLogin()">Entrar / Criar conta</button>
  </div></div>`;
}
// alterna mostrar/ocultar senha (olhinho)
function togglePassVisib(inputId,eyeId){
  const inp=$(inputId),eye=$(eyeId);
  if(!inp)return;
  if(inp.type==="password"){inp.type="text";if(eye)eye.textContent="🙈";}
  else{inp.type="password";if(eye)eye.textContent="👁️";}
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
    await loadGroups();APP.view="groups";
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
function logout(){APP.user=null;APP.groupId=null;APP.groupName=null;localStorage_safe_set("fpvp_user","");localStorage_safe_set("fpvp_pass","");APP.view="groups";render();}
// alterna entre modo DEV (poderes de admin) e jogador comum — só funciona pra quem é dev
function toggleDevMode(){
  if(!isDev())return;
  APP.devMode=!APP.devMode;
  localStorage_safe_set("fpvp_devmode",APP.devMode?"1":"0");
  toast(APP.devMode?"Modo DEV ligado — poderes de admin ativos.":"Modo jogador — vendo como usuário comum.");
  render();
}

// ============================================================
// NAV
// ============================================================
async function go(view,roomId){
  APP.view=view; if(roomId)APP.roomId=roomId;
  if(view==="groups"){await loadGroups();}
  if(view==="home"){await loadGroups();await loadGroupRooms();}
  if(view==="room"||view==="build"||view==="result"){
    await loadRoom(APP.roomId);
  }
  render(); window.scrollTo(0,0);
}
async function loadRoom(roomId){
  const g=window.GAMES.data[roomId];
  APP.prepool=g.prepool;
  APP.match=g.match||{status:"pending"};
  // status da sala vem do group_rooms (por grupo), com fallback pro catálogo
  await loadGroupRooms();
  const gr=APP.groupRooms.find(x=>x.room_id===roomId);
  APP.roomMeta={...(APP.jogos.find(j=>j.room_id===roomId)||{}),status:gr?gr.status:"closed"};
  APP._byId=Object.fromEntries(APP.prepool.players.map(p=>[p.id,p]));
  // está numa rodada? carrega a entry da rodada; senão a avulsa
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===roomId);
  APP.avulsaLineup=null; // escalação avulsa deste mesmo jogo (pra copiar dentro da mini rodada)
  if(APP.user&&SUPA.ready()){
    try{
      const filtro=inRound?("&round_id=eq."+APP.roundId):"&round_id=is.null";
      const es=await sb("entries?room_id=eq."+roomId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+filtro+"&select=*");
      if(es.length){const e=es[0];APP.slots=e.slots;APP.captain=e.captain;APP.tactic=e.tactic;}
      else{APP.slots={GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null};APP.captain=null;APP.tactic=null;}
      // se estou numa mini rodada, verifica se existe escalação avulsa deste jogo pra oferecer cópia
      if(inRound){
        const av=await sb("entries?room_id=eq."+roomId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+"&round_id=is.null&select=slots,captain,tactic");
        const src=(av||[]).find(e=>e.slots&&Object.values(e.slots).some(Boolean));
        if(src)APP.avulsaLineup=src;
      }
    }catch(e){}
  }
}

// ============================================================
// TELA: HOME (lista de salas)
// ============================================================
function groupsHTML(){
  const mine=APP.groups.filter(g=>isMember(g.id));
  const others=APP.groups.filter(g=>!isMember(g.id));
  const card=(g,member)=>`<div class="roomrow" onclick="${member?`enterGroup('${g.id}')`:`askJoin('${g.id}')`}">
    <div class="info"><div class="nm">${esc(g.name)}</div><div class="meta">${member?"✓ você é membro · toque pra entrar":"🔒 toque e digite a senha"}</div></div>
    ${member?'<span class="statuspill st-open">MEMBRO</span>':'<span class="statuspill st-closed">SENHA</span>'}
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteGroup('${g.id}')" title="Excluir grupo">🗑</button>`:""}
  </div>`;
  return `<div class="card">
    <div class="h1 disp" style="color:var(--amber)">Grupos</div>
    <p class="p" style="margin-bottom:14px">Entre num grupo de amigos para jogar. Cada grupo tem seus próprios jogos e ranking.</p>
    ${mine.length?`<div class="tag" style="margin-bottom:6px">SEUS GRUPOS</div>${mine.map(g=>card(g,true)).join("")}`:""}
    ${others.length?`<div class="tag" style="margin:12px 0 6px">OUTROS GRUPOS</div>${others.map(g=>card(g,false)).join("")}`:""}
    ${!APP.groups.length?'<p class="p">Nenhum grupo ainda.</p>':""}
  </div>
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px">ADMIN</div>
    <button class="btn" onclick="askCreateGroup()">+ Criar grupo de amigos</button>
  </div>`:""}`;
}
// modal de criar grupo (admin)
function askCreateGroup(){APP.confirm={mode:"createGroup",label:"Criar grupo"};render();}
// modal de entrar com senha
function askJoin(gid){APP.confirm={mode:"join",gid,label:"Entrar no grupo"};render();}
// extrai uma chave de dia legível do campo data (ex: "17 Jun 2026" → "17 Jun", "Jun 2026" → "A definir")
function dayKeyOf(data){
  if(!data)return "A definir";
  const m=String(data).match(/^(\d{1,2})\s+([A-Za-zçÇ]+)/);
  if(m)return m[1]+" "+m[2];
  return "A definir";
}
function dayNum(diaKey){const m=String(diaKey).match(/^(\d{1,2})/);return m?parseInt(m[1],10):999;}
// formata o kickoff de forma rica, sempre no fuso de Brasília (onde os jogos acontecem)
const _DOW=["dom","seg","ter","qua","qui","sex","sáb"];
const _MON=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function kickoffInfo(iso){
  if(!iso)return null;
  const d=new Date(iso);
  if(isNaN(d))return null;
  // extrai componentes no fuso de São Paulo (Brasília), independente do fuso do aparelho
  let parts;
  try{
    const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,weekday:"short"});
    parts={};fmt.formatToParts(d).forEach(p=>parts[p.type]=p.value);
  }catch(e){parts=null;}
  let Y,M,D,hh,mm;
  if(parts){Y=+parts.year;M=+parts.month;D=+parts.day;hh=parts.hour==="24"?"00":parts.hour;mm=parts.minute;}
  else{Y=d.getFullYear();M=d.getMonth()+1;D=d.getDate();hh=String(d.getHours()).padStart(2,"0");mm=String(d.getMinutes()).padStart(2,"0");}
  // "hoje" também no fuso de Brasília
  const hojeStr=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const [hY,hM,hD]=hojeStr.split("-").map(Number);
  const dGame=Date.UTC(Y,M-1,D), dHoje=Date.UTC(hY,hM-1,hD);
  const diff=Math.round((dGame-dHoje)/86400000);
  let rel="";
  if(diff===0)rel="Hoje"; else if(diff===1)rel="Amanhã"; else if(diff===-1)rel="Ontem";
  // dia da semana no fuso certo
  const dowIdx=new Date(Date.UTC(Y,M-1,D)).getUTCDay();
  const dow=_DOW[dowIdx];
  const dd=String(D).padStart(2,"0");
  const mm2=String(M).padStart(2,"0");
  return {ts:d.getTime(), rel, dow, dd, mon:_MON[M-1], yr:Y, hh:hh+":"+mm, diff,
    dayKey:`${dow} ${dd}/${mm2}`,
    full:`${rel?rel+" · ":""}${dow} ${dd}/${mm2}/${Y} · ${hh}:${mm}`};
}
function setHomeTab(t){APP.homeTab=t;APP.homeDay="todos";render();}
function setHomeNav(t){APP.homeNavTab=t;render();}
function setHomeDay(d){APP.homeDay=decodeURIComponent(d);APP.calOpen=false;render();}
function openCal(){APP.calOpen=true; if(!APP.calMonth){var n=new Date();APP.calMonth=n.getFullYear()+"-"+(n.getMonth()+1);} render();}
function closeCal(){APP.calOpen=false;render();}
function calNav(delta){
  var p=(APP.calMonth||"").split("-");var y=+p[0],m=+p[1]-1;var d=new Date(y,m+delta,1);
  APP.calMonth=d.getFullYear()+"-"+(d.getMonth()+1);render();
}
function toggleShowAll(){APP.homeShowAll=(APP.homeShowAll===true?false:true);render();}
function pickCalDay(dayKey){APP.homeDay=decodeURIComponent(dayKey);APP.calOpen=false;render();}
function setHomeSearch(v){
  APP.homeSearch=v;
  render();
  // restaura foco e cursor no campo de busca (senão o iPhone perde o foco a cada tecla)
  requestAnimationFrame(()=>{
    const inp=document.getElementById("homeSearchInput");
    if(inp){inp.focus();const n=inp.value.length;try{inp.setSelectionRange(n,n);}catch(e){}}
  });
}
// tira acentos e normaliza (ç→c) pra busca tolerante: "sao"/"são", "suica"/"suíça" batem igual
function normTxt(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ç/g,"c");
}
function scrollSnap(){
  const m=document.querySelector(".modal");
  return {y:window.scrollY||0,my:m?m.scrollTop:0,hasModal:!!m};
}
function restoreScroll(snap){
  if(!snap)return;
  const apply=()=>{
    window.scrollTo(0,snap.y||0);
    const m=document.querySelector(".modal");
    if(m&&snap.hasModal)m.scrollTop=snap.my||0;
  };
  requestAnimationFrame(()=>{apply();setTimeout(apply,60);setTimeout(apply,180);});
}
function renderKeepScroll(){
  const snap=scrollSnap();
  const ae=document.activeElement;
  if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)){try{ae.blur();}catch(e){}}
  render();
  restoreScroll(snap);
}
// === FOTOS DA COPA: trio de estrelas por time ===
// Retorna o HTML do trio de fotos (3 maiores price) de um time num jogo.
function srTrio(roomId, teamCode){
  try{
    const g=window.GAMES.data[roomId];
    if(!g||!g.prepool||!g.prepool.players) return "";
    const ps=g.prepool.players.filter(p=>p.team===teamCode);
    if(!ps.length) return "";
    ps.sort((a,b)=>(b.price||b.mv||0)-(a.price||a.mv||0));
    const top=ps.slice(0,3);
    let html='<div class="sr-trio">';
    top.forEach(p=>{
      const url=(typeof photoOf==="function")?photoOf(roomId,p.id):null;
      const ini=(p.name||"").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
      if(url){
        html+=`<span class="sr-pf"><img src="${url}" loading="lazy" onerror="this.parentNode.classList.add('ph');this.parentNode.textContent='${ini}'"></span>`;
      }else{
        html+=`<span class="sr-pf ph">${ini}</span>`;
      }
    });
    html+='</div>';
    return html;
  }catch(e){ return ""; }
}
function homeHTML(){
  // jogos abertos NESTE grupo (status vem de group_rooms)
  const abertosRaw=APP.groupRooms.map(gr=>{
    const cat=APP.jogos.find(j=>j.room_id===gr.room_id);
    return cat?{...cat,status:gr.status}:null;
  }).filter(Boolean);
  // A JOGAR = abertos, não-arquivados, não-finalizados
  const enrich=(j,extra)=>{const g=window.GAMES.data[j.room_id];const isFinished=g&&g.match&&g.match.status==="finished";const ki=kickoffInfo(j.kickoff);return {...j,isFinished,ki,dayKey:ki?ki.dayKey:"A definir",ts:ki?ki.ts:Infinity,...extra};};
  const toplay=abertosRaw.filter(j=>!isArchived(j.room_id)).map(j=>enrich(j)).filter(j=>!j.isFinished);
  // FINALIZADOS = (abertos finalizados não-arquivados) + (todos os arquivados)
  const finOpen=abertosRaw.filter(j=>!isArchived(j.room_id)).map(j=>enrich(j,{archived:false})).filter(j=>j.isFinished);
  const finArch=APP.jogos.filter(j=>isArchived(j.room_id)).map(j=>enrich(j,{archived:true,isFinished:true}));
  const finIds=new Set(finOpen.map(j=>j.room_id));
  const finished=[...finOpen,...finArch.filter(j=>!finIds.has(j.room_id))];

  const tab=APP.homeTab||"toplay";
  const q=normTxt((APP.homeSearch||"").trim());
  const matchQ=j=>!q||normTxt(j.match_name).includes(q);
  const baseLista=(tab==="finished"?finished:toplay);
  // dias disponíveis nesta aba (ordenados por data; "A definir" por último)
  const dayOrder={};baseLista.forEach(j=>{if(dayOrder[j.dayKey]===undefined||j.ts<dayOrder[j.dayKey])dayOrder[j.dayKey]=j.ts;});
  const diasDisp=[...new Set(baseLista.map(j=>j.dayKey))].sort((a,b)=>{
    if(a==="A definir")return 1; if(b==="A definir")return -1;
    return tab==="finished"?(dayOrder[b]-dayOrder[a]):(dayOrder[a]-dayOrder[b]); // finalizados: recente primeiro; a jogar: próximo primeiro
  });
  let diaSel=APP.homeDay||"todos";
  if(diaSel!=="todos"&&!diasDisp.includes(diaSel))diaSel="todos";
  // Nos FINALIZADOS, o padrão ("todos") mostra só ONTEM + HOJE.
  // O calendário permite escolher um dia específico ou "ver todos".
  const isRecent=j=>{ if(!j.ki) return false; return j.ki.rel==="Hoje"||j.ki.rel==="Ontem"; };
  let lista=baseLista.filter(matchQ);
  if(diaSel==="todos"){
    if(tab==="finished" && APP.homeShowAll!==true){
      lista=lista.filter(isRecent);
    }
  }else{
    lista=lista.filter(j=>j.dayKey===diaSel);
  }
  const nToplay=toplay.filter(matchQ).length, nFinished=finished.filter(matchQ).length;
  const nextGame=toplay.slice().sort((a,b)=>a.ts-b.ts)[0]||finished.slice().sort((a,b)=>b.ts-a.ts)[0]||null;
  const heroAction=nextGame?(nextGame.isFinished?"Ver resultado":(nextGame.status==="open"?"Montar escalação":"Acompanhar")):"Sem partidas";
  const heroMeta=nextGame?(nextGame.ki?nextGame.ki.full:"horário a definir"):"Abra jogos no grupo para começar.";
  const gameScore=j=>{
    const g=window.GAMES.data[j.room_id];
    const sc=g&&g.match&&g.match.score;
    if(Array.isArray(sc)&&sc.length>=2)return `${sc[0]} × ${sc[1]}`;
    if(sc&&typeof sc==="object"&&sc.home!=null&&sc.away!=null)return `${sc.home} × ${sc.away}`;
    return "";
  };
  const gameActionText=j=>j.isFinished?"resultado disponível":(j.status==="open"?"toque para escalar":"travado até finalizar");
  const statusLegend=`<div class="legendbar">
    <span><b style="color:var(--green)">ABERTA</b> ainda dá para montar/editar</span>
    <span><b style="color:var(--amber)">FECHADA</b> escalação travada</span>
    <span><b style="color:var(--blue)">FINALIZADA</b> resultado liberado</span>
  </div>`;
  let diaChips="";
  if(diasDisp.length>1){
    // Botão de calendário + indicação do filtro atual (em vez da fileira gigante de chips)
    let filtroLabel;
    if(diaSel!=="todos") filtroLabel="📅 "+esc(diaSel);
    else if(tab==="finished" && APP.homeShowAll!==true) filtroLabel="📅 Ontem e hoje";
    else filtroLabel="📅 Todos os dias";
    diaChips=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <span onclick="openCal()" class="daychip on" style="cursor:pointer">${filtroLabel} ▾</span>
      ${diaSel!=="todos"?`<span onclick="setHomeDay('todos')" class="daychip" style="cursor:pointer">✕ limpar</span>`:""}
      ${(tab==="finished"&&diaSel==="todos")?`<span onclick="toggleShowAll()" class="daychip" style="cursor:pointer">${APP.homeShowAll===true?"ver só recentes":"ver todos"}</span>`:""}
    </div>`;
  }

  // agrupar por dia, ordenando os jogos por horário dentro do dia
  const grupos={};
  lista.forEach(j=>{(grupos[j.dayKey]=grupos[j.dayKey]||[]).push(j);});
  const diasOrdenados=Object.keys(grupos).sort((a,b)=>{
    if(a==="A definir")return 1; if(b==="A definir")return -1;
    return tab==="finished"?(dayOrder[b]-dayOrder[a]):(dayOrder[a]-dayOrder[b]);
  });
  // dentro de cada dia: a jogar = mais cedo primeiro; finalizado = mais tarde (recente) primeiro
  Object.values(grupos).forEach(arr=>arr.sort((a,b)=>tab==="finished"?(b.ts-a.ts):(a.ts-b.ts)));
  let listaHTML="";
  if(!lista.length){
    if(q){
      const outra=(tab==="finished"?toplay:finished).filter(matchQ);
      listaHTML=`<p class="p">Nenhum jogo com "${esc(APP.homeSearch)}" ${tab==="finished"?"nos finalizados":"a jogar"}.`;
      if(outra.length)listaHTML+=` <a onclick="setHomeTab('${tab==="finished"?"toplay":"finished"}')" style="color:var(--amber);cursor:pointer;text-decoration:underline">Ver ${outra.length} em "${tab==="finished"?"A jogar":"Finalizados"}"</a>`;
      listaHTML+=`</p>`;
    }
    else listaHTML=`<p class="p">${tab==="finished"?"Nenhum jogo finalizado ainda.":"Nenhum jogo a jogar no momento."}</p>`;
  }else{
    if(tab==="finished"){
      // FINALIZADOS: agrupado por dia, linhas com placar centralizado
      diasOrdenados.forEach(dia=>{
        const first=grupos[dia][0];
        const relTag=first.ki&&first.ki.rel?`<span style="color:var(--green)">${first.ki.rel}</span> · `:"";
        listaHTML+=`<div class="sr-sec">📅 ${relTag}${esc(dia)}${first.ki?"/"+first.ki.yr:""}</div>`;
        grupos[dia].forEach(j=>{
          const onclick=`go('result','${j.room_id}')`;
          const score=gameScore(j)||"–";
          const fo=flagsOf(j.room_id);
          let adminBtn="";
          if(isAdmin()){
            if(j.archived)adminBtn=`<button class="cbtn sr-adm" style="position:static;width:26px;height:26px" onclick="event.stopPropagation();unarchiveGame('${j.room_id}')" title="Desarquivar">↩</button>`;
            else adminBtn=`<button class="cbtn sr-adm" style="position:static;width:26px;height:26px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askArchive('${j.room_id}')" title="Arquivar">🗄</button>`;
          }
          listaHTML+=`<div class="sr-fin" onclick="${onclick}">
            <div class="sr-row-l"><span class="sr-fl2">${fo.hf}</span><span class="sr-nm">${esc(fo.hn||j.match_name)}</span></div>
            <span class="sr-sc">${score}</span>
            <div class="sr-row-r"><span class="sr-nm">${esc(fo.an)}</span><span class="sr-fl2">${fo.af}</span>${adminBtn}</div>
          </div>`;
        });
      });
    } else {
      // A JOGAR: jogos de HOJE viram esteira de destaque; o resto vai pra lista larga
      const hoje=lista.filter(j=>j.ki&&j.ki.rel==="Hoje");
      const resto=lista.filter(j=>!(j.ki&&j.ki.rel==="Hoje"));
      const admBtn=(j,cls)=>{
        if(!isAdmin())return "";
        if(j.archived)return `<button class="cbtn ${cls}" onclick="event.stopPropagation();unarchiveGame('${j.room_id}')" title="Desarquivar">↩</button>`;
        return `<button class="cbtn ${cls}" style="color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askArchive('${j.room_id}')" title="Arquivar">🗄</button>`;
      };
      if(hoje.length){
        listaHTML+=`<div class="sr-sec">⭐ Em destaque · hoje</div><div class="sr-strip">`;
        hoje.forEach(j=>{
          const isOpen=j.status==="open";
          const fo=flagsOf(j.room_id);
          const col=teamColor(fo.hc)||"#8B97B8";
          const hora=j.ki?j.ki.hh:"a definir";
          const _g=window.GAMES.data[j.room_id];
          const _hc=(_g&&_g.prepool&&_g.prepool.home)?_g.prepool.home.code:fo.hc;
          const _ac=(_g&&_g.prepool&&_g.prepool.away)?_g.prepool.away.code:null;
          listaHTML+=`<div class="sr-big" style="--gc:${col}" onclick="go('room','${j.room_id}')">
            <div class="sr-big-top"><span class="sr-comp">⚽ ${esc(j.comp||"Partida")}</span><span class="sr-when">${isOpen?"Aberta":"Fechada"} · ${hora}</span></div>
            <div class="sr-big-mid">
              <div class="sr-tm"><span class="sr-fl">${fo.hf}</span><span class="sr-tn">${esc(fo.hn||j.match_name)}</span>${srTrio(j.room_id,_hc)}</div>
              <span class="sr-x">VS</span>
              <div class="sr-tm"><span class="sr-fl">${fo.af}</span><span class="sr-tn">${esc(fo.an)}</span>${srTrio(j.room_id,_ac)}</div>
            </div>
            <div class="sr-go ${isOpen?"":"closed"}">${isOpen?"Escalar time →":"Ver jogo →"}</div>
          </div>`;
        });
        listaHTML+=`</div>`;
      }
      if(resto.length){
        listaHTML+=`<div class="sr-sec">⚽ Próximas partidas</div>`;
        resto.forEach(j=>{
          const isOpen=j.status==="open";
          const fo=flagsOf(j.room_id);
          const hora=j.ki?(j.ki.rel?j.ki.rel+" "+j.ki.hh:j.ki.hh):"a definir";
          listaHTML+=`<div class="sr-row ${isOpen?"":"closed"}" onclick="go('room','${j.room_id}')">
            <div class="sr-row-l"><span class="sr-fl2">${fo.hf}</span><span class="sr-nm">${esc(fo.hn||j.match_name)}</span></div>
            <span class="sr-vs2">×</span>
            <div class="sr-row-r"><span class="sr-nm">${esc(fo.an)}</span><span class="sr-fl2">${fo.af}</span></div>
            <span class="sr-time ${isOpen?"":"closed"}">${hora}${admBtn(j,"sr-adm")}</span>
          </div>`;
        });
      }
    }
  }
  // jogos do catálogo ainda NÃO abertos neste grupo (só admin)
  const naoAbertos=APP.jogos.filter(j=>!APP.groupRooms.some(gr=>gr.room_id===j.room_id)&&!isArchived(j.room_id));
  const abrirRows=naoAbertos.map(j=>`<div class="roomrow" onclick="openRoomInGroup('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">toque para abrir neste grupo</div></div>
    <span class="statuspill st-closed">+ ABRIR</span></div>`).join("");
  const navTab=APP.homeNavTab||"partidas";
  const nMini=APP.rounds.filter(r=>!r.phase_id).length;
  const nRod=(APP.phases||[]).filter(p=>!p.league_id).length;
  const nLig=(APP.leagues||[]).length;
  const nDraft=(APP.draftSeasons||[]).length;
  const navBtn=(t,ic,label,n)=>`<div class="navtab${navTab===t?" on":""}" onclick="setHomeNav('${t}')"><span class="ic">${ic}</span> ${label}${n?` <span class="ct">(${n})</span>`:""}</div>`;
  // painel da aba PARTIDAS (busca + lista de jogos)
  const partidasPanel=`<div class="card">
    <div style="position:relative;margin-bottom:10px">
      <input id="homeSearchInput" class="input" style="margin:0;padding-left:38px" placeholder="🔍 Buscar partida pelo nome do time…" value="${esc(APP.homeSearch||"")}" oninput="setHomeSearch(this.value)" autocorrect="off" />
      ${q?`<span onclick="setHomeSearch('')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--dim)">✕</span>`:""}
    </div>
    ${statusLegend}
    <div class="postabs" style="margin-bottom:8px">
      <div class="ptab${tab==="toplay"?" on":""}" onclick="setHomeTab('toplay')">⚽ A jogar</div>
      <div class="ptab${tab==="finished"?" on":""}" onclick="setHomeTab('finished')">✓ Finalizados</div>
    </div>
    ${diaChips}
    ${listaHTML}
  </div>`;
  let navPanel="";
  if(navTab==="partidas")navPanel=partidasPanel;
  else if(navTab==="mini")navPanel=roundsCardHTML()||`<div class="card"><p class="p">Nenhuma mini rodada ainda.</p></div>`;
  else if(navTab==="rodadas")navPanel=phasesCardHTML()||`<div class="card"><p class="p">Nenhuma rodada ainda.</p></div>`;
  else if(navTab==="ligas")navPanel=leaguesCardHTML()||`<div class="card"><p class="p">Nenhuma liga ainda.</p></div>`;
  else if(navTab==="draft")navPanel=draftSeasonsCardHTML();
  return `<div class="homehero">
    <div class="heroTop">
      <div>
        <div class="tag">FANTASY PvP</div>
        <div class="heroTitle disp">${esc(APP.groupName||"Salas")}</div>
        <div class="heroSub">Escolha as partidas, monte seu time e acompanhe os resultados do grupo.</div>
      </div>
      <div class="userchip" onclick="leaveGroupView()" style="cursor:pointer">⇄ trocar grupo</div>
    </div>
    <div class="quickgrid">
      <div class="quickstat"><b>${nToplay}</b><span>A jogar</span></div>
      <div class="quickstat"><b>${nFinished}</b><span>Finalizadas</span></div>
      <div class="quickstat"><b>${APP.entries?APP.entries.length:0}</b><span>Escalações</span></div>
    </div>
    ${nextGame?`<div class="nextbox" onclick="${nextGame.isFinished?`go('result','${nextGame.room_id}')`:`go('room','${nextGame.room_id}')`}">
      <div class="nextIcon">${nextGame.isFinished?"✓":"⚽"}</div>
      <div style="min-width:0;flex:1">
        <div class="nextTitle">${flaggedName(nextGame.room_id, esc(nextGame.match_name))}</div>
        <div class="nextMeta">${esc(heroMeta)} · ${esc(nextGame.comp)}</div>
      </div>
      <div class="nextGo">${heroAction}</div>
    </div>`:""}
    <div onclick="event.stopPropagation();go('members')" style="display:flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--line);background:var(--panel2);border-radius:99px;padding:6px 12px;width:fit-content;margin-top:10px">
      <span style="font-size:13px">👥</span><span style="font-size:12px;font-weight:700;color:var(--chalk)">Membros do grupo</span><span style="color:var(--dim);font-size:12px">›</span>
    </div>
  </div>
  <div class="navtabs">
    ${navBtn("partidas","⚽","Partidas",0)}
    ${navBtn("mini","🎯","Mini-rodadas",nMini)}
    ${navBtn("rodadas","📅","Rodadas",nRod)}
    ${navBtn("ligas","🏆","Ligas",nLig)}
    ${navBtn("draft","🏟️","Mercado Draft",nDraft)}
  </div>
  <div class="navpanel">${navPanel}</div>
  ${isAdmin()&&naoAbertos.length?`<div class="card">
    <div class="tag" style="margin-bottom:6px">ADMIN · ABRIR JOGO NESTE GRUPO</div>
    <p class="p" style="margin-bottom:10px">Jogos do catálogo ainda não abertos aqui:</p>
    ${abrirRows}
  </div>`:""}
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--red)">MANUTENÇÃO DO SITE</div>
    <p class="p" style="margin-bottom:10px">Reinício de emergência: apaga TODOS os times de TODOS os jogos (caso o site bugue). Salas e usuários são mantidos.</p>
    <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="resetAll()">🧹 Limpar todos os times (reboot)</button>
  </div>`:""}`;
}

// ----- RESULTADOS: card de jogos arquivados (todos veem) -----
function resultsCardHTML(){
  const arq=APP.jogos.filter(j=>isArchived(j.room_id));
  if(!arq.length)return"";
  const rows=arq.map(j=>`<div class="roomrow" onclick="go('result','${j.room_id}')">
    <div class="info"><div class="nm">${flaggedName(j.room_id, esc(j.match_name))}</div><div class="meta">${esc(j.comp)} · ${esc(j.data||"")}</div></div>
    <span class="statuspill st-finished">VER RESULTADO</span>
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px" onclick="event.stopPropagation();unarchiveGame('${j.room_id}')" title="Desarquivar">↩</button>`:""}
  </div>`).join("");
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--blue)">RESULTADOS · JOGOS ENCERRADOS</div>
    <p class="p" style="margin-bottom:10px">Jogos já finalizados. Toque para ver como foi a apuração e o ranking.</p>
    ${rows}
  </div>`;
}
function askArchive(roomId){APP.confirm={mode:"archive",roomId,label:"Arquivar jogo"};render();}
// ranking acumulado da rodada (aparece quando há jogos finalizados)
function roundRankingHTML(){
  const r=APP.round;if(!r)return"";
  const selLocked=picksLocked();
  const rk=APP.roundRanking||[];
  const all=APP.roundAllEntries||[];
  const TAC=window.ENGINE_TACTICS;
  // quantos jogos da rodada já finalizaram
  const finishedCount=APP.roundRooms.filter(rr=>{const g=window.GAMES.data[rr.room_id];return g&&g.match&&g.match.status==="finished";}).length;
  let html="";
  // ── CLASSIFICAÇÃO ──
  html+=`<div class="card"><div class="h2 disp">🏆 Classificação da mini rodada${helpBtn("minirodada")}</div>`;
  if(rk.length){
    html+=`<p class="p" style="margin-bottom:10px">Soma dos pontos de cada um nos jogos já encerrados desta mini rodada${finishedCount<APP.roundRooms.length?` (${finishedCount}/${APP.roundRooms.length} apurados)`:""}. Toque num nome pra ver a escalação.</p>`;
    let posN=0;
    rk.forEach((u,i)=>{
      const me=u.username===APP.user?.username;
      const open=APP._openRoundUser===u.username;
      if(u.eliminated){
        const motivo=modeOf(APP.round)==="confianca"?"não ordenou todos os jogos":
          modeOf(APP.round)==="sobrevivencia"?"teve jogo negativo":
          "não distribuiu todas as fichas";
        html+=`<div class="rank${me?" me":""}" style="opacity:.7"><div class="po mono" style="color:var(--red)">✗</div><div class="nm">${esc(u.username)}<small style="color:var(--red)">eliminado · ${motivo}</small></div><div class="pt mono" style="color:var(--red)">0.0</div></div>`;
        return;
      }
      posN++;
      const survNote=modeOf(APP.round)==="sobrevivencia"&&u.survivalCut!=null?` · descartou ${u.survivalCut.toFixed(1)}`:"";
      html+=`<div class="rank${me?" me":""}" onclick="toggleRoundUser('${encodeURIComponent(u.username)}')" style="cursor:pointer"><div class="po mono">${posN}º</div><div class="nm">${esc(u.username)}<small>${u.games} jogo${u.games>1?"s":""} apurado${u.games>1?"s":""}${survNote} · toque pra ${open?"fechar":"ver time"}</small></div><div class="pt mono">${u.total.toFixed(1)}</div></div>`;
      if(open)html+=roundUserTeamsHTML(u.username);
    });
  }else{
    html+=`<p class="p">⏳ Aguardando os jogos escolhidos terminarem. A classificação aparece aqui conforme as partidas forem sendo apuradas.</p>`;
  }
  // aviso se há gente disputando que ainda não pontuou (jogos não terminados)
  if(rk.length){
    const participantes=new Set((all||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean)).map(e=>e.username));
    const naClassif=new Set(rk.map(u=>u.username));
    const faltam=[...participantes].filter(u=>!naClassif.has(u));
    if(faltam.length||finishedCount<APP.roundRooms.length){
      html+=`<p class="p" style="margin-top:8px;font-size:12px;color:var(--dim)">Só entram na conta os jogos já encerrados. Quem escalou jogos que ainda não terminaram aparece em "Quem está disputando" e entra na classificação assim que a partida for apurada.</p>`;
    }
  }
  html+=`</div>`;
  // ── PARTICIPANTES: quem escolheu cada jogo / quem já montou ──
  const mode=modeOf(APP.round);
  html+=`<div class="card"><div class="h2 disp">👥 Quem está disputando</div>`;
  if(mode==="boost")html+=`<p class="p" style="font-size:11px;margin:4px 0 0">⚡ O impulso de cada partida só é revelado quando aquela partida começa. Antes disso, fica oculto (só você vê os seus).</p>`;
  if(!all.length){
    html+=`<p class="p" style="margin-top:6px">Ninguém entrou nesta rodada ainda.</p></div>`;
    return html;
  }
  APP.roundRooms.forEach(rr=>{
    const g=window.GAMES.data[rr.room_id];
    const nome=g?g.prepool.home.name+" "+flagOf(g.prepool.home.code)+" × "+flagOf(g.prepool.away.code)+" "+g.prepool.away.name:rr.room_id;
    const finished=g&&g.match&&g.match.status==="finished";
    // espiar libera quando a pool daquele jogo está TRAVADA (admin fechou) ou o jogo finalizou
    const started=roomLockedInRound(rr.room_id);
    let here=all.filter(e=>e.room_id===rr.room_id);
    // SELECIONE: só mostra quem TRAVOU este jogo (confirmed); não-travados são descartados
    if(mode==="select")here=here.filter(e=>e.confirmed===true);
    if(!here.length)return;
    html+=`<div style="margin-top:10px"><div class="bsub" style="border:none;padding:0;margin:0 0 4px">${esc(nome)}${started?` <span style="font-size:9px;color:var(--blue)">· toque p/ espiar</span>`:""}</div>`;
    here.forEach(e=>{
      const me=e.username===APP.user?.username;
      const montou=e.slots&&Object.values(e.slots).some(Boolean);
      let status;
      if(mode==="select"){
        status=montou
          ? `<span style="color:var(--green);font-size:10px">🔒 travou ✓ escalado</span>`
          : `<span style="color:var(--amber);font-size:10px">🔒 travou, sem time</span>`;
      }else if(mode==="boost"){
        const _ch=Array.isArray(e.boost_chips)?e.boost_chips:null;
        const tkPct=_ch&&_ch.length?_ch.reduce((s,v)=>s+(Number(v)||0),0):(parseInt(e.boost,10)||0)*BOOST_PCT;
        const showTokens=me||started; // so revela o impulso DESTE jogo quando ELE trava (nao todos de uma vez)
        const tkTag=(showTokens&&tkPct)?` · <span style="color:${tkPct<0?"#FF6B6B":"#FFC247"}">⚡ ${tkPct<0?"":"+"}${tkPct}%</span>`:(showTokens?"":` · <span style="color:var(--dim)">⚡ ?</span>`);
        status=montou
          ? `<span style="color:var(--green);font-size:10px">✓ escalado${tkTag}</span>`
          : `<span style="color:var(--dim);font-size:10px">sem time</span>`;
      }else{
        status=montou?`<span style="color:var(--green);font-size:10px">✓ escalado</span>`:`<span style="color:var(--dim);font-size:10px">sem time</span>`;
      }
      // após o jogo começar, a linha vira clicável pra espiar a escalação
      const pkey="peek_"+rr.room_id+"_"+encodeURIComponent(e.username);
      const canPeek=started&&montou;
      const isOpen=_openPeekRound[pkey];
      const arrow=canPeek?` <span style="color:var(--blue);font-size:10px">${isOpen?"▲":"▼"}</span>`:"";
      html+=`<div class="line" style="padding:4px 0;${canPeek?"cursor:pointer":""}" ${canPeek?`onclick="togglePeekRound('${pkey}')"`:""}><span style="${me?"color:var(--amber);font-weight:700":""}">${esc(e.username)}${me?" (você)":""}${arrow}</span>${status}</div>`;
      if(canPeek&&isOpen)html+=peekLineupHTML(e,rr.room_id);
    });
    html+=`</div>`;
  });
  html+=`</div>`;
  return html;
}


// abas Em andamento / Finalizadas reutilizável
function compTabsHTML(kind,liveN,doneN){
  const active=APP.compTab[kind]||"live";
  const tab=(k,label,n)=>`<button class="statuspill ${k===active?"st-open":"st-closed"}" style="cursor:pointer;${k===active?"border-color:var(--amber);color:var(--amber)":""}" onclick="setCompTab('${kind}','${k}')">${label}</button>`;
  return `<div style="display:flex;gap:6px;margin:4px 0 10px">${tab("live","Em andamento",liveN)}${tab("done","Finalizadas",doneN)}</div>`;
}
function setCompTab(kind,k){APP.compTab[kind]=k;renderKeepScroll();}
// ----- MINI RODADAS: card na home (só as avulsas, sem phase) -----
function roundRowHTML(r){
  const mm=modeMeta(r);
  const fin=compIsFinishedView("round",r.id);
  const pill=fin?'<span class="statuspill st-finished">FINALIZADA</span>'
    :(r.status==="open"?'<span class="statuspill st-open">ABERTA</span>':'<span class="statuspill st-closed">FECHADA</span>');
  let metaTxt;
  if(modeOf(r)==="full")metaTxt="joga todos os jogos";
  else if(modeOf(r)==="boost"){const nc=Array.isArray(r.boost_chips)&&r.boost_chips.length?r.boost_chips.length:(r.boost_tokens||0);metaTxt=`todos os jogos · ${nc} ficha(s) de impulso`;}
  else if(modeOf(r)==="confianca")metaTxt="todos os jogos · ordene por confiança";
  else if(modeOf(r)==="previsao")metaTxt="todos os jogos · crave os placares";
  else if(modeOf(r)==="zebra")metaTxt="todos os jogos · bônus para azarões";
  else if(modeOf(r)==="sobrevivencia")metaTxt="todos os jogos · não pode negativar";
  else if(modeOf(r)==="capitaoduplo")metaTxt="todos os jogos · capitão turbinado";
  else metaTxt=`escolha ${r.pick_limit} jogos`;
  // botão admin de mover entre andamento/finalizada (manual)
  const arch=compIsArchived("round",r.id);
  const archBtn=isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:${arch?"var(--green)":"var(--amber)"};border-color:${arch?"var(--green)":"var(--amber)"}" onclick="event.stopPropagation();${arch?`unarchiveComp('round','${r.id}')`:`archiveComp('round','${r.id}')`}" title="${arch?"Reabrir":"Finalizar"}">${arch?"♻️":"📥"}</button>`:"";
  return `<div class="roomrow" style="border-left:3px solid ${mm.color}" onclick="enterRound('${r.id}')">
    <div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">${metaTxt}</div></div>
    ${pill}
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenameRound('${r.id}')" title="Editar">✏️</button>${archBtn}<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteRound('${r.id}')">🗑</button>`:""}
  </div>`;
}
function roundsCardHTML(){
  const avulsasAll=APP.rounds.filter(r=>!r.phase_id);
  if(!avulsasAll.length&&!isAdmin())return"";
  const tab=APP.compTab.round||"live";
  const liveList=avulsasAll.filter(r=>!compIsFinishedView("round",r.id));
  const doneList=avulsasAll.filter(r=>compIsFinishedView("round",r.id));
  const avulsas=tab==="done"?doneList:liveList;
  // agrupar por modo
  const order=MODE_LIST;
  let groupsHTML="";
  for(const mk of order){
    const list=avulsas.filter(r=>modeOf(r)===mk);
    if(!list.length)continue;
    const mm=MODE_META[mk];
    const collapsed=!APP.openModes[mk]; // invertido: começa FECHADO, abre ao clicar
    groupsHTML+=`<div onclick="toggleModeGroup('${mk}')" style="margin:14px 0 6px;display:flex;align-items:center;gap:8px;cursor:pointer">
      <span style="display:inline-flex;align-items:center;gap:6px;font-family:'Saira Condensed';font-weight:800;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${mm.color};border:1px solid ${mm.color};background:color-mix(in srgb,${mm.color} 14%,transparent);border-radius:99px;padding:4px 12px">${mm.icon} ${mm.label} <span style="font-size:10px;opacity:.8">(${list.length})</span></span>
      <span style="flex:1;height:1px;background:color-mix(in srgb,${mm.color} 30%,transparent)"></span>
      <span style="color:${mm.color};font-size:13px;transform:rotate(${collapsed?"-90deg":"0deg"});transition:transform .15s">▾</span>
    </div>
    ${collapsed?"":`<p class="p" style="font-size:11px;margin-bottom:8px;color:color-mix(in srgb,${mm.color} 70%,var(--dim))">${mm.desc}</p>
    ${list.map(roundRowHTML).join("")}`}`;
  }
  const emptyMsg=tab==="done"?'<p class="p">Nenhuma mini rodada finalizada ainda.</p>':'<p class="p">Nenhuma mini rodada em andamento.</p>';
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px">MINI RODADAS AVULSAS · ESCOLHA SEUS JOGOS${helpBtn("minirodada")}</div>
    <p class="p" style="margin-bottom:10px">Gaste fichas nos jogos que quiser e monte o time de cada um.${helpBtn("token")}</p>
    ${compTabsHTML("round",liveList.length,doneList.length)}
    ${groupsHTML||emptyMsg}
    ${isAdmin()&&tab==="live"?`<button class="btn" style="margin-top:14px" onclick="askCreateRound()">+ Criar mini rodada avulsa</button>`:""}
  </div>`;
}
function askCreateRound(){APP.confirm={mode:"createRound",newMode:"full",label:"Criar mini rodada"};render();}
function setCreateMode(mk){if(APP.confirm){const n=$("rndName");if(n)APP.confirm.draftName=n.value;APP.confirm.newMode=mk;renderKeepScroll();}}
function toggleModeGroup(mk){APP.openModes[mk]=!APP.openModes[mk];renderKeepScroll();}

// ----- RODADAS (phases) avulsas: card na home -----
function phaseRowHTML(p){
  const fin=compIsFinishedView("phase",p.id);
  const pill=fin?'<span class="statuspill st-finished">FINALIZADA</span>':'<span class="statuspill st-finished" style="border-color:var(--mid);color:var(--mid)">VER</span>';
  const arch=compIsArchived("phase",p.id);
  const archBtn=isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:${arch?"var(--green)":"var(--amber)"};border-color:${arch?"var(--green)":"var(--amber)"}" onclick="event.stopPropagation();${arch?`unarchiveComp('phase','${p.id}')`:`archiveComp('phase','${p.id}')`}" title="${arch?"Reabrir":"Finalizar"}">${arch?"♻️":"📥"}</button>`:"";
  return `<div class="roomrow" onclick="enterPhase('${p.id}')">
    <div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">rodada · toque pra ver mini rodadas</div></div>
    ${pill}
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenamePhase('${p.id}')" title="Renomear">✏️</button>${archBtn}<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeletePhase('${p.id}')">🗑</button>`:""}
  </div>`;
}
function phasesCardHTML(){
  const avulsasAll=(APP.phases||[]).filter(p=>!p.league_id);
  if(!avulsasAll.length&&!isAdmin())return"";
  const tab=APP.compTab.phase||"live";
  const liveList=avulsasAll.filter(p=>!compIsFinishedView("phase",p.id));
  const doneList=avulsasAll.filter(p=>compIsFinishedView("phase",p.id));
  const list=tab==="done"?doneList:liveList;
  const rows=list.map(phaseRowHTML).join("");
  const emptyMsg=tab==="done"?'<p class="p">Nenhuma rodada finalizada ainda.</p>':'<p class="p">Nenhuma rodada em andamento.</p>';
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--mid)">RODADAS AVULSAS${helpBtn("rodada")}</div>
    <p class="p" style="margin-bottom:10px">Uma rodada (ex: "Fase de Grupos") agrupa várias mini rodadas. Fora de liga.</p>
    ${compTabsHTML("phase",liveList.length,doneList.length)}
    ${rows||emptyMsg}
    ${isAdmin()&&tab==="live"?`<button class="btn" style="margin-top:10px" onclick="askCreatePhase(null)">+ Criar rodada avulsa</button>`:""}
  </div>`;
}
function askDeletePhase(id){
  if(!isAdmin())return;
  const p=(APP.phases||[]).find(x=>x.id===id);
  askConfirm("EXCLUIR",`Excluir a rodada "${p?p.name:""}"`,()=>{deletePhase(id);},
    "Esta ação apaga a rodada, TODAS as mini rodadas dela e as escalações (times) dessas mini rodadas. Não pode ser desfeita.");
}

// ----- LIGAS: card na home -----
function leagueRowHTML(l){
  const nPh=(APP.phases||[]).filter(p=>p.league_id===l.id).length;
  const fin=compIsFinishedView("league",l.id);
  const pill=fin?'<span class="statuspill st-finished">FINALIZADA</span>':'<span class="statuspill st-finished" style="border-color:var(--mid);color:var(--mid)">VER</span>';
  const arch=compIsArchived("league",l.id);
  const archBtn=isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:${arch?"var(--green)":"var(--amber)"};border-color:${arch?"var(--green)":"var(--amber)"}" onclick="event.stopPropagation();${arch?`unarchiveComp('league','${l.id}')`:`archiveComp('league','${l.id}')`}" title="${arch?"Reabrir":"Finalizar"}">${arch?"♻️":"📥"}</button>`:"";
  return `<div class="roomrow" onclick="enterLeague('${l.id}')">
      <div class="info"><div class="nm">🏆 ${esc(l.name)}</div><div class="meta">${nPh} rodada${nPh!==1?"s":""} · classificação geral</div></div>
      ${pill}
      ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenameLeague('${l.id}')" title="Renomear">✏️</button>${archBtn}<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteLeague('${l.id}')">🗑</button>`:""}
    </div>`;
}
function leaguesCardHTML(){
  const all=(APP.leagues||[]);
  if(!all.length&&!isAdmin())return"";
  const tab=APP.compTab.league||"live";
  const liveList=all.filter(l=>!compIsFinishedView("league",l.id));
  const doneList=all.filter(l=>compIsFinishedView("league",l.id));
  const list=tab==="done"?doneList:liveList;
  const rows=list.map(leagueRowHTML).join("");
  const emptyMsg=tab==="done"?'<p class="p">Nenhuma liga finalizada ainda.</p>':'<p class="p">Nenhuma liga em andamento.</p>';
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--amber)">LIGAS · TEMPORADA${helpBtn("liga")}</div>
    <p class="p" style="margin-bottom:10px">Junta várias rodadas numa classificação geral da temporada.${helpBtn("liga")}</p>
    ${compTabsHTML("league",liveList.length,doneList.length)}
    ${rows||emptyMsg}
    ${isAdmin()&&tab==="live"?`<button class="btn" style="margin-top:10px" onclick="askCreateLeague()">+ Criar liga</button>`:""}
  </div>`;
}
function askCreateLeague(){APP.confirm={mode:"createLeague",label:"Criar liga"};render();}
function askDeleteLeague(id){APP.confirm={mode:"deleteLeague",leagueId:id,label:"Excluir liga"};render();}
// ----- MERCADO DRAFT: modo avançado separado -----
function draftSeasonsCardHTML(){
  if(APP.draftSchemaMissing){
    return `<div class="card" style="border-color:var(--amber)">
      <div class="h2 disp">🏟️ Mercado Draft</div>
      <p class="p" style="margin-top:8px">O modo já está no app, mas precisa criar as tabelas novas no Supabase antes de funcionar.</p>
      <p class="p" style="font-size:11px;margin-top:8px">Use o arquivo <b style="color:var(--chalk)">draft-market-schema.sql</b> no SQL Editor do Supabase.</p>
    </div>`;
  }
  const list=APP.draftSeasons||[];
  let rows="";
  if(!list.length)rows=`<p class="p" style="margin-top:8px">Nenhuma temporada Mercado Draft criada ainda.</p>`;
  else rows=list.map(s=>{
    const live=s.status==="active"||s.status==="setup";
    return `<div class="roomrow" style="border-left:3px solid #FF8A4C" onclick="go('draft',null,null,null,null,null,'${s.id}')">
      <div class="info"><div class="nm">${esc(s.name)}</div><div class="meta">${esc(s.status||"setup")} · orçamento ${s.budget||300} · elenco ${s.roster_limit||12}</div></div>
      <span class="statuspill ${live?"st-open":"st-finished"}">${live?"ABERTA":"FINALIZADA"}</span>
    </div>`;
  }).join("");
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px">MODO AVANÇADO · TEMPORADA</div>
    <div class="h2 disp">🏟️ Mercado Draft</div>
    <p class="p" style="margin:8px 0">Modo separado: elenco exclusivo, orçamento, mercado de livres, transações e temporada longa.</p>
    ${rows}
    ${isAdmin()?`<button class="btn" style="margin-top:14px;background:#FF8A4C;color:#0A0E1C" onclick="askCreateDraftSeason()">+ Criar Mercado Draft</button>`:""}
  </div>`;
}
