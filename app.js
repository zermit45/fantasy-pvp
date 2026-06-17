// ============================================================
// FANTASY PvP — APP (navegação, Supabase, telas)
// ============================================================
const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"FLEX",BENCH:"BANCO"};
// paleta de cores por seleção/clube (código → hex). Fallback para um cinza-azulado.
const TEAM_COLOR={POR:"#E63946",COD:"#5CA8FF",AUT:"#FF6B6B",JOR:"#54E0A8",NED:"#FF7A1A",JPN:"#4D7BFF",UZB:"#3DC1D3",COL:"#FFD23F",GHA:"#54E0A8",PAN:"#E63946",ENG:"#5CA8FF",CRO:"#E63946",BRA:"#FFC247",ARG:"#62C9F5",FRA:"#5C6BFF",ESP:"#E63946",GER:"#EEF2FB"};
const teamColor=code=>TEAM_COLOR[code]||"#8B97B8";
// devs: a conta que tem acesso ao "modo DEV" (poderes de admin).
const ADMINS=["Lucchini"];
// isDev = é a pessoa autorizada (imutável). isAdmin = tem poderes AGORA (modo dev ligado).
const isDev=()=>APP.user&&ADMINS.includes(APP.user.username);
const isAdmin=()=>isDev()&&APP.devMode;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=id=>document.getElementById(id);

// estado global
let APP={
  user:null,            // {username}
  view:"home",          // home | room | build | result
  roomId:null,
  jogos:[],
  groups:[], groupId:null, groupName:null, myGroups:[], groupRooms:[],
  rounds:[], roundId:null, round:null, roundRooms:[], roundEntries:[], roundRanking:null,
  archived:[],          // room_ids de jogos arquivados (global) — só aparecem em Resultados
  profile:null,         // estatísticas do perfil (calculadas ao vivo)
  devMode:true,         // modo DEV ligado (só afeta quem é dev); alterna admin x jogador comum
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
async function sbInsert(table,row,upsert=false,onConflict=null){
  const h=SUPA.headers(); h["Prefer"]=upsert?"resolution=merge-duplicates,return=representation":"return=representation";
  const path=onConflict?`${table}?on_conflict=${onConflict}`:table;
  return sb(path,{method:"POST",headers:h,body:JSON.stringify(row)});
}
async function sbUpdate(table,patch,filter){
  const h=SUPA.headers(); h["Prefer"]="return=representation";
  return sb(`${table}?${filter}`,{method:"PATCH",headers:h,body:JSON.stringify(patch)});
}
async function sbDelete(table,filter){
  return sb(`${table}?${filter}`,{method:"DELETE",headers:SUPA.headers()});
}

// ---------- GRUPOS ----------
async function loadGroups(){
  if(!SUPA.ready())return;
  try{
    APP.groups=await sb("groups?select=*&order=created_at");
    if(APP.user){
      const m=await sb("group_members?username=eq."+encodeURIComponent(APP.user.username)+"&select=group_id");
      APP.myGroups=m.map(x=>x.group_id);
    }
  }catch(e){APP.groups=[];APP.myGroups=[];}
}
function isMember(gid){return APP.myGroups.includes(gid);}
async function createGroup(name,pass){
  const rows=await sbInsert("groups",{name,pass,created_by:APP.user.username});
  const g=rows[0];
  // criador já entra como membro
  await sbInsert("group_members",{group_id:g.id,username:APP.user.username});
  await loadGroups();
  toast("Grupo criado!");
  render();
}
async function joinGroup(gid,tryPass){
  const g=APP.groups.find(x=>x.id===gid);
  if(!g)return;
  if(String(tryPass).trim()!==String(g.pass).trim()){toast("Senha incorreta.");return;}
  await sbInsert("group_members",{group_id:gid,username:APP.user.username},true,"group_id,username");
  await loadGroups();
  toast("Você entrou no grupo "+g.name+"!");
  enterGroup(gid);
}
function enterGroup(gid){
  const g=APP.groups.find(x=>x.id===gid);
  APP.groupId=gid; APP.groupName=g?g.name:"";
  go("home");
}
function leaveGroupView(){APP.groupId=null;APP.groupName=null;APP.view="groups";render();window.scrollTo(0,0);}
// admin: excluir um grupo (com confirmação por palavra)
function askDeleteGroup(gid){
  if(!isAdmin())return;
  const g=APP.groups.find(x=>x.id===gid);
  askConfirm("EXCLUIR",`Excluir o grupo "${g?g.name:""}"`,async()=>{
    // apaga em ordem: times, jogos abertos, membros, e por fim o grupo
    await sbDelete("entries",`group_id=eq.${gid}`);
    await sbDelete("group_rooms",`group_id=eq.${gid}`);
    await sbDelete("group_members",`group_id=eq.${gid}`);
    await sbDelete("groups",`id=eq.${gid}`);
    if(APP.groupId===gid){APP.groupId=null;APP.groupName=null;}
    await loadGroups();
    toast("Grupo excluído.");
    APP.view="groups";render();
  },"Esta ação exclui o grupo, seus membros e todos os times dele. Não pode ser desfeita.");
}
// quais jogos estão abertos neste grupo
async function loadGroupRooms(){
  if(!APP.groupId)return;
  try{APP.groupRooms=await sb("group_rooms?group_id=eq."+APP.groupId+"&select=*");}
  catch(e){APP.groupRooms=[];}
}
// admin: abrir um jogo do catálogo neste grupo
async function openRoomInGroup(roomId){
  if(!isAdmin())return;
  if(isArchived(roomId)){toast("Jogo arquivado. Desarquive primeiro se quiser reabrir.");return;}
  await sbInsert("group_rooms",{group_id:APP.groupId,room_id:roomId,status:"open"},true,"group_id,room_id");
  await loadGroupRooms();
  toast("Jogo aberto no grupo.");
  render();
}

// ----- JOGOS ARQUIVADOS (resultados) — global -----
async function loadArchived(){
  try{const rows=await sb("archived_games?select=room_id");APP.archived=(rows||[]).map(r=>r.room_id);}
  catch(e){APP.archived=[];}
}
function isArchived(roomId){return APP.archived.includes(roomId);}
async function archiveGame(roomId){
  if(!isAdmin())return;
  try{
    await sbInsert("archived_games",{room_id:roomId},true,"room_id");
    // sai de toda pool/grupo: remove de group_rooms e round_rooms em todos os lugares
    await sbDelete("group_rooms",`room_id=eq.${roomId}`);
    await sbDelete("round_rooms",`room_id=eq.${roomId}`);
    await loadArchived();await loadGroupRooms();
    toast("Jogo arquivado — agora aparece em Resultados.");
    go("home");
  }catch(e){toast("Erro: "+e.message);}
}
async function unarchiveGame(roomId){
  if(!isAdmin())return;
  try{
    await sbDelete("archived_games",`room_id=eq.${roomId}`);
    await loadArchived();
    toast("Jogo desarquivado — pode ser aberto de novo.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}

// ============================================================
// PERFIL / CONQUISTAS (Caminho A — calculado ao vivo, por grupo)
// ============================================================
const RARITY_ORDER=["Comum","Incomum","Raro","Épico","Mítico","Lendário"];
// estatísticas agregadas do usuário no grupo atual, varrendo jogos arquivados (encerrados)
async function loadProfileStats(username){
  const stats={
    games:0, wins:0, podiums:0, bestScore:0, bestGame:null, totalPoints:0,
    archetypes:{}, traits:{}, rarities:{}, players:{}, bestPlayer:null
  };
  if(!SUPA.ready()||!APP.groupId)return stats;
  // todos os jogos FINALIZADOS deste catálogo (arquivado ou não — basta ter resultado)
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    let entries;
    try{entries=await sb("entries?room_id=eq."+j.room_id+"&group_id=eq."+APP.groupId+"&select=*");}
    catch(e){continue;}
    if(!entries||!entries.length)continue;
    // respeita "ocultar do perfil": não conta minhas entries marcadas
    entries=entries.filter(e=>!(e.username===username&&e.hidden_profile===true));
    const scored=entries.map(e=>scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx)).sort((a,b)=>b.total-a.total);
    const myIdx=scored.findIndex(s=>s.username===username);
    if(myIdx<0)continue; // não participei deste jogo
    const me=scored[myIdx];
    stats.games++;
    stats.totalPoints+=me.total;
    if(myIdx===0)stats.wins++;
    if(myIdx<3)stats.podiums++;
    if(me.total>stats.bestScore){stats.bestScore=me.total;stats.bestGame=j.match_name;}
    // arquétipos / traits / raridades / jogadores escalados (só os que entraram em campo)
    for(const v of me.view){
      if(!v||v.slot==="BENCH")continue;
      const meta=v.r&&v.r.meta;if(!meta)continue;
      const pl=ctx.byId[v.pid];
      if(meta.arch&&meta.arch!=="—"){stats.archetypes[meta.arch]=(stats.archetypes[meta.arch]||0)+1;}
      (meta.traits||[]).forEach(t=>{if(t!=="Regular"&&t!=="Não entrou em campo")stats.traits[t]=(stats.traits[t]||0)+1;});
      if(meta.rarity)stats.rarities[meta.rarity]=(stats.rarities[meta.rarity]||0)+1;
      if(pl){const key=pl.name;stats.players[key]=(stats.players[key]||0)+1;}
    }
  }
  // jogador mais escalado
  let top=null;for(const[name,n]of Object.entries(stats.players)){if(!top||n>top.n)top={name,n};}
  stats.bestPlayer=top;
  return stats;
}
// histórico de um atleta (quantas vezes teve cada arquétipo/selo) nos jogos arquivados.
// casa por NOME normalizado: os IDs são locais de cada jogo e colidem entre partidas.
function _normName(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").trim();}
function playerArchHistory(playerName){
  const hist={archetypes:{},traits:{},best:null,games:0};
  const target=_normName(playerName);
  if(!target)return hist;
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    // acha o jogador pelo nome dentro deste jogo
    const meta=ctx.prepool.players.find(p=>_normName(p.name)===target);
    if(!meta)continue; // esse atleta não está neste jogo
    const st=(ctx.match.players&&ctx.match.players[String(meta.id)])||{min:0};
    const raw=Object.assign({pos:meta.pos,team:meta.team},st);
    if(!raw.min)continue;
    const r=ctx.eng.scorePlayer(raw,null);
    if(!r.meta)continue;
    hist.games++;
    if(r.meta.arch&&r.meta.arch!=="—")hist.archetypes[r.meta.arch]=(hist.archetypes[r.meta.arch]||0)+1;
    (r.meta.traits||[]).forEach(t=>{if(t!=="Regular")hist.traits[t]=(hist.traits[t]||0)+1;});
    if(!hist.best||RARITY_ORDER.indexOf(r.meta.rarity)>RARITY_ORDER.indexOf(hist.best))hist.best=r.meta.rarity;
  }
  return hist;
}
// oculta do MEU perfil todas as minhas entries dos jogos arquivados (mantém no ranking).
// exige confirmação da senha da própria conta.
async function hideMyProfileHistory(senha){
  if(!APP.user||!APP.groupId)return;
  // valida a senha contra o hash salvo da conta
  let ok=false;
  try{
    const ex=await sb("users?username=eq."+encodeURIComponent(APP.user.username)+"&select=pass_hash");
    ok = ex&&ex[0]&&ex[0].pass_hash===hashPass(senha);
  }catch(e){toast("Erro ao validar: "+e.message);return;}
  if(!ok){toast("Senha incorreta.");return;}
  // marca hidden_profile=true nas minhas entries dos jogos arquivados deste grupo
  try{
    const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";}).map(j=>j.room_id);
    if(!arq.length){toast("Nenhum jogo encerrado pra ocultar.");return;}
    let n=0;
    for(const rid of arq){
      await sbUpdate("entries",{hidden_profile:true},
        `room_id=eq.${rid}&group_id=eq.${APP.groupId}&username=eq.${encodeURIComponent(APP.user.username)}`);
      n++;
    }
    APP.confirm=null;
    APP.profile=await loadProfileStats(APP.user.username);
    toast("Histórico ocultado do seu perfil.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
function askHideHistory(){APP.confirm={mode:"hideHistory",label:"Excluir histórico"};render();}
async function loadRounds(){
  if(!APP.groupId)return;
  try{APP.rounds=await sb("rounds?group_id=eq."+APP.groupId+"&select=*&order=created_at");}
  catch(e){APP.rounds=[];}
}
async function loadRound(roundId){
  APP.roundId=roundId;
  try{
    const rs=await sb("rounds?id=eq."+roundId+"&select=*");
    APP.round=rs&&rs[0]?rs[0]:null;
    APP.roundRooms=await sb("round_rooms?round_id=eq."+roundId+"&select=*");
    // minhas entries nesta rodada (seleção + time + confirmação)
    if(APP.user){
      APP.roundEntries=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+"&select=room_id,slots,captain,tactic,confirmed");
    }
  }catch(e){APP.round=null;APP.roundRooms=[];APP.roundEntries=[];}
  // ranking acumulado da rodada (soma dos pontos de cada um nos jogos finalizados que escolheu)
  APP.roundRanking=await computeRoundRanking(roundId);
}
// soma, por usuário, os pontos dos jogos FINALIZADOS desta rodada
async function computeRoundRanking(roundId){
  try{
    const all=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=*");
    if(!all||!all.length)return [];
    const byUser={};
    for(const rr of APP.roundRooms){
      const g=window.GAMES.data[rr.room_id];
      if(!g||!g.match||g.match.status!=="finished")continue; // só jogos já apurados
      const ctx=buildCtxFor(rr.room_id);if(!ctx)continue;
      const here=all.filter(e=>e.room_id===rr.room_id);
      for(const e of here){
        if(!e.slots||!Object.values(e.slots).some(Boolean))continue; // sem time montado
        const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
        if(!byUser[e.username])byUser[e.username]={username:e.username,total:0,games:0};
        byUser[e.username].total+=sc.total;
        byUser[e.username].games++;
      }
    }
    return Object.values(byUser).map(u=>({...u,total:Math.round(u.total*10)/10})).sort((a,b)=>b.total-a.total);
  }catch(e){return [];}
}
// ----- helpers do novo fluxo -----
function roundEntryOf(roomId){return APP.roundEntries.find(e=>e.room_id===roomId);}
function pickedRoom(roomId){return !!roundEntryOf(roomId);}                 // selecionei este jogo (Fase 1)
function hasTeam(roomId){const e=roundEntryOf(roomId);return e&&e.slots&&Object.values(e.slots).some(Boolean);} // tem escalação
function isConfirmed(roomId){const e=roundEntryOf(roomId);return e&&e.confirmed===true;}                  // usuário travou
function picksUsed(){return APP.roundEntries.length;}
function picksLeft(){return APP.round?Math.max(0,APP.round.pick_limit-picksUsed()):0;}
// FASE 1 travada? (dev fechou a seleção de jogos) — não troca mais QUAIS jogos
function picksLocked(){return APP.round&&APP.round.status&&APP.round.status!=="open";}
// jogo travado individualmente? (dev forçou OU usuário confirmou OU jogo começou/finalizou)
function roomLockedInRound(roomId){
  const rr=APP.roundRooms.find(x=>x.room_id===roomId);
  if(rr&&rr.status&&rr.status!=="open")return true;        // dev travou
  if(isConfirmed(roomId))return true;                       // usuário confirmou
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished")return true;   // jogo acabou
  return false;
}

// FASE 1 — selecionar um jogo pra jogar (cria entry vazia, sem time ainda)
async function selectRoundGame(roomId){
  if(picksLocked()){toast("A seleção de jogos já foi fechada.");return;}
  if(pickedRoom(roomId)){toast("Você já selecionou este jogo.");return;}
  if(picksLeft()<=0){toast("Você já selecionou seus "+APP.round.pick_limit+" jogos.");return;}
  try{
    await sbInsert("entries",{room_id:roomId,group_id:APP.groupId,round_id:APP.roundId,username:APP.user.username,slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},captain:null,tactic:null,confirmed:false,updated_at:new Date().toISOString()});
    await loadRound(APP.roundId);
    toast("Jogo selecionado! Agora monte o time quando quiser.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// FASE 1 — desfazer seleção (só enquanto a seleção está aberta e o jogo não travou)
async function unselectRoundGame(roomId){
  if(picksLocked()){toast("A seleção já foi fechada — não dá pra remover.");return;}
  if(roomLockedInRound(roomId)){toast("Este jogo já travou.");return;}
  try{
    await sbDelete("entries",`room_id=eq.${roomId}&group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await loadRound(APP.roundId);
    toast("Seleção desfeita.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// FASE 2 — usuário confirma a equipe de um jogo (salva slots atuais + trava)
async function confirmTeam(roomId){
  try{
    await sbUpdate("entries",{slots:APP.slots,captain:APP.captain,tactic:APP.tactic,confirmed:true,updated_at:new Date().toISOString()},`room_id=eq.${roomId}&group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await loadRound(APP.roundId);
    toast("Equipe confirmada! Esse time está travado.");
    go("round",null,APP.roundId);
  }catch(e){toast("Erro: "+e.message);}
}
// admin: força a trava da escalação de um jogo (quando a partida começa)
async function setRoundRoomStatus(roomId,status){
  if(!isAdmin()||!APP.roundId)return;
  try{
    await sbUpdate("round_rooms",{status},"round_id=eq."+APP.roundId+"&room_id=eq."+roomId);
    await loadRound(APP.roundId);
    toast(status==="locked"?"Escalação deste jogo travada (todos).":"Escalação deste jogo liberada.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// admin: criar rodada
async function createRound(name,limit){
  const rows=await sbInsert("rounds",{group_id:APP.groupId,name,pick_limit:limit,status:"open"});
  await loadRounds();
  toast("Rodada criada!");
  if(rows&&rows[0]){enterRound(rows[0].id);}else render();
}
async function addRoomToRound(roomId){
  if(!isAdmin())return;
  if(isArchived(roomId)){toast("Jogo arquivado não pode entrar em rodada.");return;}
  await sbInsert("round_rooms",{round_id:APP.roundId,room_id:roomId,status:"open"},true,"round_id,room_id");
  await loadRound(APP.roundId);render();
}
async function delRoomFromRound(roomId){
  if(!isAdmin())return;
  await sbDelete("round_rooms",`round_id=eq.${APP.roundId}&room_id=eq.${roomId}`);
  await loadRound(APP.roundId);render();
}
// admin FASE 1: trava/destrava a seleção de jogos da rodada
async function setRoundStatus(status){
  if(!isAdmin()||!APP.roundId)return;
  try{
    await sbUpdate("rounds",{status},"id=eq."+APP.roundId);
    await loadRound(APP.roundId);
    toast(status==="locked_picks"?"Seleção de jogos fechada.":"Seleção de jogos reaberta.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
function enterRound(roundId){go("round",null,roundId);}
function leaveRound(){APP.roundId=null;APP.round=null;APP.view="home";render();window.scrollTo(0,0);}
// toque num jogo da rodada → decide o que fazer
function askEnterRoundGame(roomId){
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished"){go("result",roomId);return;} // acabou → resultado
  if(!pickedRoom(roomId)){toast("Selecione este jogo primeiro (botão + Selecionar).");return;}
  // selecionado → vai montar/ver o time (o build trata se está travado)
  go("build",roomId);
}
// admin: excluir rodada
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
  if(APP.user&&SUPA.ready()){
    try{
      const filtro=inRound?("&round_id=eq."+APP.roundId):"&round_id=is.null";
      const es=await sb("entries?room_id=eq."+roomId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+filtro+"&select=*");
      if(es.length){const e=es[0];APP.slots=e.slots;APP.captain=e.captain;APP.tactic=e.tactic;}
      else{APP.slots={GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null};APP.captain=null;APP.tactic=null;}
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
function homeHTML(){
  // jogos abertos NESTE grupo (status vem de group_rooms; arquivados nunca aparecem aqui)
  const abertos=APP.groupRooms.map(gr=>{
    const cat=APP.jogos.find(j=>j.room_id===gr.room_id);
    return cat?{...cat,status:gr.status}:null;
  }).filter(Boolean).filter(j=>!isArchived(j.room_id));
  const rows=abertos.map(j=>{
    const st=j.status;
    const pill=st==="open"?'<span class="statuspill st-open">ABERTA</span>':st==="finished"?'<span class="statuspill st-finished">FINALIZADA</span>':'<span class="statuspill st-closed">FECHADA</span>';
    return `<div class="roomrow" onclick="go('room','${j.room_id}')">
      <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${esc(j.comp)} · ${esc(j.data||"")}</div></div>
      ${pill}
      ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askArchive('${j.room_id}')" title="Arquivar (mover p/ Resultados)">🗄</button>`:""}
    </div>`;
  }).join("");
  // jogos do catálogo ainda NÃO abertos neste grupo (só admin) — sem os arquivados
  const naoAbertos=APP.jogos.filter(j=>!APP.groupRooms.some(gr=>gr.room_id===j.room_id)&&!isArchived(j.room_id));
  const abrirRows=naoAbertos.map(j=>`<div class="roomrow" onclick="openRoomInGroup('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">toque para abrir neste grupo</div></div>
    <span class="statuspill st-closed">+ ABRIR</span></div>`).join("");
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:var(--amber)">${esc(APP.groupName||"Salas")}</div>
      <div class="userchip" onclick="leaveGroupView()" style="cursor:pointer">⇄ trocar grupo</div>
    </div>
    <p class="p" style="margin-bottom:14px">Jogos deste grupo. Escolha uma partida para montar seu time ou ver o resultado.</p>
    ${rows||'<p class="p">Nenhum jogo aberto neste grupo ainda.</p>'}
  </div>
  ${roundsCardHTML()}
  ${resultsCardHTML()}
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
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${esc(j.comp)} · ${esc(j.data||"")}</div></div>
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
  const rk=APP.roundRanking;
  if(!rk||!rk.length)return"";
  let html=`<div class="card"><div class="h2 disp">🏆 Classificação da rodada</div>
    <p class="p" style="margin-bottom:10px">Soma dos pontos de cada um nos jogos já encerrados desta rodada.</p>`;
  rk.forEach((u,i)=>{
    const me=u.username===APP.user?.username;
    html+=`<div class="rank${me?" me":""}"><div class="po mono">${i+1}º</div><div class="nm">${esc(u.username)}<small>${u.games} jogo${u.games>1?"s":""} apurado${u.games>1?"s":""}</small></div><div class="pt mono">${u.total.toFixed(1)}</div></div>`;
  });
  html+=`</div>`;
  return html;
}


// ----- RODADAS: card na home -----
function roundsCardHTML(){
  const rows=APP.rounds.map(r=>{
    const pill=r.status==="open"?'<span class="statuspill st-open">ABERTA</span>':'<span class="statuspill st-closed">FECHADA</span>';
    return `<div class="roomrow" onclick="enterRound('${r.id}')">
      <div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">escolha ${r.pick_limit} jogos</div></div>
      ${pill}
      ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteRound('${r.id}')">🗑</button>`:""}
    </div>`;
  }).join("");
  if(!APP.rounds.length&&!isAdmin())return"";
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--mid)">RODADAS · ESCOLHA SEUS JOGOS</div>
    <p class="p" style="margin-bottom:10px">Numa rodada você escolhe poucos jogos pra entrar. Acertar os jogos certos é a estratégia.</p>
    ${rows||'<p class="p">Nenhuma rodada ainda.</p>'}
    ${isAdmin()?`<button class="btn" style="margin-top:10px" onclick="askCreateRound()">+ Criar rodada</button>`:""}
  </div>`;
}
function askCreateRound(){APP.confirm={mode:"createRound",label:"Criar rodada"};render();}

// ----- RODADAS: tela de uma rodada -----
function roundHTML(){
  const r=APP.round;
  if(!r)return `<div class="card"><p class="p">Rodada não encontrada.</p><button class="btn ghost" onclick="leaveRound()">← Voltar</button></div>`;
  const left=picksLeft(), used=picksUsed();
  const selLocked=picksLocked(); // seleção de jogos fechada pelo dev
  const jogos=APP.roundRooms.map(rr=>APP.jogos.find(j=>j.room_id===rr.room_id)).filter(Boolean);
  const rows=jogos.map(j=>{
    const rid=j.room_id;
    const g=window.GAMES.data[rid];
    const finished=g&&g.match&&g.match.status==="finished";
    const picked=pickedRoom(rid);
    const team=hasTeam(rid);
    const confirmed=isConfirmed(rid);
    const locked=roomLockedInRound(rid);
    let tag,meta,clickable=true;
    if(finished){tag='<span class="statuspill st-finished">VER RESULTADO</span>';meta="jogo encerrado · toque p/ ver";}
    else if(!picked){
      if(selLocked){tag='<span class="statuspill st-closed">NÃO ESCOLHIDO</span>';meta="você não selecionou este jogo";clickable=false;}
      else if(left<=0){tag='<span class="statuspill st-closed">SEM VAGA</span>';meta="já selecionou seus "+r.pick_limit+" jogos";clickable=false;}
      else{tag='<span class="statuspill st-open">DISPONÍVEL</span>';meta="toque no + verde para escolher";clickable=false;}
    }
    else if(confirmed||locked){tag='<span class="statuspill st-closed">🔒 CONFIRMADO</span>';meta="time travado · toque p/ ver";}
    else if(team){tag='<span class="statuspill st-open">ESCALADO</span>';meta="toque para ajustar ou confirmar";}
    else{tag='<span class="statuspill st-finished">MONTAR TIME</span>';meta="selecionado · toque para escalar";}
    // ação principal (jogador): selecionar ou desfazer — UM botão só
    let playerBtn="";
    if(!finished&&!picked&&!selLocked&&left>0){
      playerBtn=`<button class="cbtn" style="position:static;width:34px;height:34px;color:var(--green);border-color:var(--green);font-size:18px" title="Selecionar este jogo" onclick="event.stopPropagation();selectRoundGame('${rid}')">+</button>`;
    }else if(!finished&&picked&&!confirmed&&!locked&&!selLocked){
      playerBtn=`<button class="cbtn" style="position:static;width:34px;height:34px;color:var(--red);border-color:var(--red)" title="Desfazer seleção" onclick="event.stopPropagation();unselectRoundGame('${rid}')">✕</button>`;
    }
    // bloco de admin (separado, com divisória sutil)
    let devBlock="";
    if(isAdmin()){
      const rr=APP.roundRooms.find(x=>x.room_id===rid);
      const devLocked=rr&&rr.status&&rr.status!=="open";
      devBlock=`<div style="display:flex;gap:10px;align-items:center;margin-left:10px;padding-left:10px;border-left:1px solid var(--line)">
        <span onclick="event.stopPropagation();setRoundRoomStatus('${rid}','${devLocked?"open":"locked"}')" style="cursor:pointer;font-size:17px;opacity:${devLocked?"1":".55"}" title="${devLocked?"Liberar escalação (todos)":"Travar escalação (todos)"}">${devLocked?"🔓":"🔒"}</span>
        <span onclick="event.stopPropagation();delRoomFromRound('${rid}')" style="cursor:pointer;font-size:16px;opacity:.5" title="Remover jogo da rodada">🗑</span>
      </div>`;
    }
    return `<div class="roomrow" ${clickable||finished?`onclick="askEnterRoundGame('${rid}')"`:""} style="${clickable||finished?"":"cursor:default"}">
      <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${meta}</div></div>
      ${tag}${playerBtn?`<span style="margin-left:8px">${playerBtn}</span>`:""}${devBlock}
    </div>`;
  }).join("");
  const fora=APP.jogos.filter(j=>!APP.roundRooms.some(rr=>rr.room_id===j.room_id)&&!isArchived(j.room_id));
  const foraRows=fora.map(j=>`<div class="roomrow" onclick="addRoomToRound('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">toque para adicionar à rodada</div></div>
    <span class="statuspill st-closed">+ ADD</span></div>`).join("");
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:var(--amber)">${esc(r.name)}</div>
      <div class="userchip" onclick="leaveRound()" style="cursor:pointer">← voltar</div>
    </div>
    ${selLocked
      ? `<div class="prebox" style="border-color:#3a2e10">🔒 Seleção de jogos fechada. Agora monte e <b>confirme</b> a equipe de cada jogo que escolheu, até cada partida começar.</div>`
      : `<div class="prebox">⏳ <b>Fase 1:</b> selecione <b>${r.pick_limit}</b> jogos pra disputar (toque no <b>+</b>). Dá pra trocar até a seleção fechar. Selecionados: <b style="color:var(--amber)">${used}/${r.pick_limit}</b>.</div>`}
    ${rows||'<p class="p">Nenhum jogo nesta rodada ainda.</p>'}
  </div>
  ${roundRankingHTML()}
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px">ADMIN · RODADA</div>
    <p class="p" style="margin-bottom:8px">1) Antes da 1ª partida, feche a <b>seleção de jogos</b>. 2) Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha).</p>
    ${selLocked
      ? `<button class="btn ghost" onclick="setRoundStatus('open')">🔓 Reabrir seleção de jogos</button>`
      : `<button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setRoundStatus('locked_picks')">🔒 Fechar seleção de jogos</button>`}
    ${fora.length?`<div class="tag" style="margin:14px 0 6px">ADICIONAR JOGOS À RODADA</div>${foraRows}`:""}
  </div>`:""}`;
}


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
    await sbUpdate("group_rooms",{status},`group_id=eq.${APP.groupId}&room_id=eq.${APP.roomId}`);
    APP.roomMeta.status=status;
    await loadGroupRooms();
    toast(status==="closed"?"Pool fechada. Ninguém mais edita.":"Pool reaberta.");
    render();
  }catch(e){toast("Erro ao mudar status: "+e.message);}
}

// ---------- MANUTENÇÃO / RESET (admin) ----------
// APP.confirm = {word, label, action} controla o modal de confirmação por texto
function askConfirm(word,label,action,msg){APP.confirm={word,label,action,msg,typed:""};render();}
function closeConfirm(){APP.confirm=null;render();}
function confirmInput(v){if(APP.confirm)APP.confirm.typed=v;}
function confirmModalHTML(){
  const c=APP.confirm;if(!c)return"";
  // modo: criar grupo (admin)
  if(c.mode==="createGroup"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar grupo de amigos</div>
      <p class="p" style="margin:10px 0">Dê um nome e uma senha. Você repassa a senha pros amigos entrarem.</p>
      <input id="grpName" class="input" placeholder="Nome do grupo" autocorrect="off" />
      <input id="grpPass" class="input" placeholder="Senha do grupo" autocapitalize="off" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreateGroup()">Criar grupo</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: excluir histórico do perfil (exige senha da conta)
  if(c.mode==="hideHistory"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir histórico do perfil</div>
      <p class="p" style="margin:10px 0">Isto oculta do seu perfil todos os times que você montou nos jogos encerrados. Suas medalhas e conquistas zeram. Você continua aparecendo no ranking das salas.</p>
      <p class="p" style="margin:10px 0">Digite a <b style="color:var(--chalk)">senha da sua conta</b> para confirmar.</p>
      <input id="hideHistPass" class="input" type="password" placeholder="Sua senha" autocomplete="off" autocapitalize="off" />
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="submitHideHistory()">🗑 Excluir histórico</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: arquivar jogo (admin) — move pra Resultados, global
  if(c.mode==="archive"){
    const j=APP.jogos.find(x=>x.room_id===c.roomId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--blue)">Arquivar jogo</div>
      <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">${esc(j?j.match_name:"")}</b> vai sair de todos os grupos e rodadas e passar a aparecer só em <b style="color:var(--blue)">Resultados</b>, onde todos veem como foi. Não poderá mais ser adicionado a nenhuma pool.</p>
      <p class="p" style="margin:10px 0">Os times já montados e o ranking continuam salvos. Você pode desarquivar depois.</p>
      <button class="btn" style="margin-top:4px;background:var(--blue)" onclick="closeConfirm();archiveGame('${c.roomId}')">🗄 Arquivar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: entrar num grupo com senha
  if(c.mode==="join"){
    const g=APP.groups.find(x=>x.id===c.gid);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Entrar em ${esc(g?g.name:"")}</div>
      <p class="p" style="margin:10px 0">Digite a senha que o admin passou. Você fica membro pra sempre.</p>
      <input id="joinPass" class="input" placeholder="Senha do grupo" autocapitalize="off" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitJoin()">Entrar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: criar rodada (admin)
  if(c.mode==="createRound"){
    const poolMax=(APP.jogos||[]).length;
    const defLimit=Math.min(3,poolMax||3);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar rodada</div>
      <p class="p" style="margin:10px 0">Dê um nome e quantos jogos cada um pode escolher.${poolMax?` Há <b style="color:var(--amber)">${poolMax}</b> jogo(s) no catálogo (máximo).`:""}</p>
      <input id="rndName" class="input" placeholder="Nome (ex: Rodada 1)" autocorrect="off" />
      <input id="rndLimit" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} placeholder="Quantos jogos escolher (ex: 3)" value="${defLimit}" />
      <button class="btn" style="margin-top:4px" onclick="submitCreateRound()">Criar rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: confirmar entrada num jogo da rodada (gasta ficha)
  if(c.mode==="confirmTeam"){
    const j=APP.jogos.find(x=>x.room_id===c.roomId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Confirmar equipe?</div>
      <p class="p" style="margin:10px 0">Você vai <b style="color:var(--chalk)">travar seu time</b> em ${esc(j?j.match_name:"")}. Depois de confirmar, <b>não dá mais pra editar</b> a escalação deste jogo.</p>
      <p class="p" style="margin:10px 0">Confirme só quando souber os titulares e estiver satisfeito.</p>
      <button class="btn" style="margin-top:4px" onclick="closeConfirm();confirmTeam('${c.roomId}')">✓ Confirmar e travar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Ainda não, deixa eu ajustar</button>
    </div></div>`;
  }
  // modo padrão: confirmação destrutiva por palavra (reset)
  return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
    <div class="h2 disp" style="color:var(--red)">⚠ ${esc(c.label)}</div>
    <p class="p" style="margin:10px 0">${c.msg?esc(c.msg):'Esta ação <b style="color:var(--chalk)">apaga os times e não pode ser desfeita</b>. Salas e usuários são mantidos.'} Para confirmar, digite <b style="color:var(--amber)">${c.word}</b> abaixo.</p>
    <input id="confirmField" class="input" placeholder="Digite ${c.word}" autocapitalize="characters" autocorrect="off" />
    <button class="btn" style="background:var(--red);color:#fff;margin-top:4px" onclick="runConfirm()">Apagar agora</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
  </div></div>`;
}
function submitCreateGroup(){
  const n=$("grpName"),p=$("grpPass");
  const name=n?n.value.trim():"",pass=p?p.value.trim():"";
  if(!name||!pass){toast("Preencha nome e senha.");return;}
  APP.confirm=null;createGroup(name,pass).catch(e=>toast("Erro: "+e.message));
}
function submitHideHistory(){
  const f=$("hideHistPass");
  const senha=f?f.value:"";
  if(!senha){toast("Digite sua senha.");return;}
  hideMyProfileHistory(senha).catch(e=>toast("Erro: "+e.message));
}
function submitCreateRound(){
  const n=$("rndName"),l=$("rndLimit");
  const name=n?n.value.trim():"";
  let limit=l?parseInt(l.value,10):3;
  const poolMax=(APP.jogos||[]).length;
  if(!name){toast("Dê um nome à rodada.");return;}
  if(!limit||limit<1)limit=1;
  if(poolMax>0&&limit>poolMax){toast("Só há "+poolMax+" jogo(s) no catálogo. Escolha no máximo "+poolMax+".");return;}
  APP.confirm=null;createRound(name,limit).catch(e=>toast("Erro: "+e.message));
}
function submitJoin(){
  const c=APP.confirm;const f=$("joinPass");
  const pass=f?f.value:"";
  const gid=c.gid;APP.confirm=null;
  joinGroup(gid,pass).catch(e=>toast("Erro: "+e.message));
}
const _normWord=s=>String(s||"").trim().toUpperCase();
async function runConfirm(){
  const c=APP.confirm;if(!c)return;
  // lê direto do campo (mais confiável que o estado em mobile)
  const field=$("confirmField");
  const typed=field?field.value:c.typed;
  if(_normWord(typed)!==_normWord(c.word)){toast(`Digite "${c.word}" para confirmar.`);return;}
  const action=c.action;APP.confirm=null;render();
  try{await action();}catch(e){toast("Erro: "+e.message);}
}
// reset de UMA sala
function resetRoom(){
  if(!isAdmin())return;
  askConfirm("LIMPAR","Limpar times desta sala",async()=>{
    await sbDelete("entries",`room_id=eq.${APP.roomId}&group_id=eq.${APP.groupId}`);
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
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const gameLocked=inRound&&roomLockedInRound(APP.roomId);
  const filt=pp.players.filter(p=>APP.tab==="ALL"||([pp.home.code,pp.away.code].includes(APP.tab)?p.team===APP.tab:p.pos===APP.tab));
  const ready=Object.values(s).every(Boolean)&&APP.captain&&APP.tactic&&!gameLocked;
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
    ${gameLocked
      ? `<div class="prebox" style="margin-top:12px;border-color:#3a2e10">🔒 Esta escalação está travada (confirmada ou jogo começou). Não dá mais pra editar.</div>
         <button class="btn" style="margin-top:8px" disabled>🔒 Time travado</button>`
      : inRound
        ? `<button class="btn ghost" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"💾 Salvar (ainda dá pra ajustar)":"Complete 6 slots, capitão e tática"}</button>
           <button class="btn" style="margin-top:8px" ${ready?"":"disabled"} onclick="askConfirmTeam()">✓ Confirmar equipe (trava)</button>`
        : `<button class="btn" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"Salvar time":"Complete 6 slots, capitão e tática"}</button>`}
    <button class="btn ghost" style="margin-top:8px" onclick="${APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId)?`go('round',null,'${APP.roundId}')`:"go('room')"}">← Voltar</button>
  </div>`;
}
function askConfirmTeam(){
  APP.confirm={mode:"confirmTeam",roomId:APP.roomId,label:"Confirmar equipe"};render();
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
  // está numa rodada? (roundId setado e este jogo pertence à rodada)
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  try{
    if(inRound){
      // escalação travada? (dev forçou, usuário confirmou, ou jogo começou)
      if(roomLockedInRound(APP.roomId)){toast("Este jogo já travou — não dá mais pra editar.");go("round",null,APP.roundId);return;}
      // a entry já existe (criada na seleção): só atualiza os slots/tática
      await upsertEntry(APP.roundId);
      toast("Progresso salvo. Confirme a equipe quando estiver pronto.");
      await loadRound(APP.roundId);
      go("round",null,APP.roundId);return;
    }
    // fluxo avulso
    const gr=await sb(`group_rooms?group_id=eq.${APP.groupId}&room_id=eq.${APP.roomId}&select=status`);
    if(gr&&gr[0]&&gr[0].status!=="open"){
      APP.roomMeta.status=gr[0].status;
      toast("Pool fechada — não dá mais pra editar o time.");
      go("room");return;
    }
    await upsertEntry(null);
    toast("Time salvo!");
    go("room");
  }catch(e){toast("Erro ao salvar: "+e.message);}
}
// salva a entry separando avulso (round_id null) de rodada (round_id setado).
// busca-então-decide: evita depender de índice parcial no on_conflict.
async function upsertEntry(roundId){
  const base={slots:APP.slots,captain:APP.captain,tactic:APP.tactic,updated_at:new Date().toISOString()};
  const filtroRound = roundId?("&round_id=eq."+roundId):"&round_id=is.null";
  const existing=await sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId
    +"&username=eq."+encodeURIComponent(APP.user.username)+filtroRound+"&select=id");
  if(existing&&existing.length){
    // já existe nesse contexto → atualiza pelo id (não toca na outra)
    await sbUpdate("entries",base,"id=eq."+existing[0].id);
  }else{
    // não existe → cria nova
    await sbInsert("entries",Object.assign({room_id:APP.roomId,group_id:APP.groupId,round_id:roundId,username:APP.user.username},base));
  }
}

// ============================================================
// TELA: RESULT (ranking + apuração)
// ============================================================
async function loadEntries(){
  if(!SUPA.ready())return [];
  // ranking deve refletir o contexto: se vim de uma rodada, só entries daquela rodada;
  // senão, só as avulsas (round_id null). Evita misturar/duplicar o mesmo usuário.
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const filtroRound=inRound?("&round_id=eq."+APP.roundId):"&round_id=is.null";
  return sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId+filtroRound+"&select=*");
}
function buildMatchCtx(){
  const pp=APP.prepool,m=APP.match;
  m.homeCode=pp.home.code;m.awayCode=pp.away.code;m.homeElo=pp.home.elo;m.awayElo=pp.away.elo;
  // set piece goals (pra tatica bola parada) — opcional no match.json
  if(m.team_stats)for(const tc of [pp.home.code,pp.away.code]){if(m.team_stats[tc]&&m.team_stats[tc].setPieceGoals==null)m.team_stats[tc].setPieceGoals=0;}
  return makeEngine(m);
}
function scoreEntry(entry,eng){
  return scoreEntryFor(entry,eng,{prepool:APP.prepool,match:APP.match,byId:APP._byId});
}
// versão pura: calcula um entry contra um jogo passado em ctx (não usa estado global)
function scoreEntryFor(entry,eng,ctx){
  const byId=ctx.byId,m=ctx.match;
  const slots=["GK","DEF","MID","ATT","FLEX","BENCH"];
  function rawOf(pid){const meta=byId[pid];if(!meta)return{pos:"MID",team:"?",min:0};const raw=m.players?m.players[String(pid)]:null;return Object.assign({pos:meta.pos,team:meta.team},raw||{min:0});}
  const res={};
  for(const sl of slots){const pid=entry.slots[sl];if(!pid){res[sl]=null;continue;}res[sl]=eng.scorePlayer(rawOf(pid),null);}
  let subOut=null;const benchPid=entry.slots.BENCH,benchMeta=benchPid?byId[benchPid]:null;
  if(benchMeta&&res.BENCH){
    if(benchMeta.pos==="GK"){
      const gkTitularMin=res.GK?res.GK.minutes:0;
      if(gkTitularMin===0&&res.BENCH){subOut="GK";[res.GK,res.BENCH]=[res.BENCH,res.GK];const t=entry.slots.GK;entry.slots.GK=entry.slots.BENCH;entry.slots.BENCH=t;}
    }
    else{const cand=[benchMeta.pos,"FLEX"].filter(x=>res[x]);let worst=null;for(const x of cand){if(!worst||res[x].total<res[worst].total||(res[x].total===res[worst].total&&x==="FLEX"))worst=x;}if(worst&&res.BENCH.total>res[worst].total){subOut=worst;const t=entry.slots[worst];entry.slots[worst]=entry.slots.BENCH;entry.slots.BENCH=t;[res[worst],res.BENCH]=[res.BENCH,res[worst]];}}
  }
  const titulares=["GK","DEF","MID","ATT","FLEX"].map(sl=>entry.slots[sl]).filter(Boolean).map(rawOf);
  const sq=eng.squadSum(titulares);
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
// constrói o engine + byId pra um jogo qualquer do catálogo (pra perfil/histórico)
const _ctxCache={};
function buildCtxFor(roomId){
  if(_ctxCache[roomId]!==undefined)return _ctxCache[roomId];
  const g=window.GAMES.data[roomId];if(!g){_ctxCache[roomId]=null;return null;}
  const pp=g.prepool,m=g.match;if(!m||m.status!=="finished"){_ctxCache[roomId]=null;return null;}
  m.homeCode=pp.home.code;m.awayCode=pp.away.code;m.homeElo=pp.home.elo;m.awayElo=pp.away.elo;
  if(m.team_stats)for(const tc of [pp.home.code,pp.away.code]){if(m.team_stats[tc]&&m.team_stats[tc].setPieceGoals==null)m.team_stats[tc].setPieceGoals=0;}
  const byId=Object.fromEntries(pp.players.map(p=>[p.id,p]));
  const ctx={prepool:pp,match:m,byId,eng:makeEngine(m)};
  _ctxCache[roomId]=ctx;
  return ctx;
}
// ============================================================
// MEDALHAS (derivadas das stats do perfil) + TELA DE PERFIL
// ============================================================
// cada medalha tem tiers; retorna a maior atingida (ou null)
function computeMedals(st){
  const tier=(val,steps,emoji,nameBase,unit)=>{
    let got=null;
    for(const[thr,name]of steps){if(val>=thr)got={emoji,name,desc:name+" · "+val+" "+unit};}
    return got;
  };
  const m=[];
  const archDistinct=Object.keys(st.archetypes).length;
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const add=x=>{if(x)m.push(x);};
  add(tier(st.wins,[[1,"Primeira Vitória"],[3,"Vencedor"],[7,"Campeão de Sala"],[15,"Dominador"]],"🏆","wins","vitória(s)"));
  add(tier(st.podiums,[[3,"Pódio Frequente"],[10,"Sempre no Topo"]],"🥇","pod","pódio(s)"));
  add(tier(st.games,[[1,"Estreante"],[5,"Habitual"],[15,"Veterano"],[30,"Lenda Viva"]],"🎮","games","jogo(s)"));
  add(tier(archDistinct,[[5,"Colecionador"],[12,"Curador"],[20,"Enciclopédia"]],"🃏","arch","arquétipos"));
  add(tier(rareCount,[[1,"Sortudo"],[5,"Caçador de Raros"],[12,"Lapidador"]],"💎","rare","carta(s) rara(s)"));
  add(tier(Math.floor(st.bestScore),[[20,"Boa Cartada"],[35,"Tacada de Mestre"],[50,"Jogo Perfeito"]],"📊","best","pts num jogo"));
  return m;
}
function openProfile(){go("profile");}
function profileHTML(){
  const st=APP.profile;
  if(!st)return `<div class="card"><div class="loading">Calculando seu perfil…</div></div>`;
  const medals=computeMedals(st);
  const archDistinct=Object.keys(st.archetypes).length;
  const TOTAL_ARCH=26; // total de arquétipos possíveis no engine
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  let html=`<div class="card">
    <div class="h1 disp" style="color:var(--amber)">${esc(APP.user.username)}</div>
    <p class="p" style="margin-bottom:4px">Conquistas no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  // resumo em números
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}
      ${statBox("🏆",st.wins,"vitórias")}
      ${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}
      ${statBox("🃏",archDistinct+"/"+TOTAL_ARCH,"arquétipos")}
      ${statBox("💎",rareCount,"raros")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Sua melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPlayer?`<p class="p" style="margin-top:4px">Jogador mais escalado: <b style="color:var(--amber)">${esc(st.bestPlayer.name)}</b> (${st.bestPlayer.n}×).</p>`:""}
  </div>`;
  // medalhas
  html+=`<div class="card"><div class="h2 disp">Medalhas</div>`;
  if(!medals.length)html+=`<p class="p" style="margin-top:8px">Nenhuma medalha ainda. Monte times nos jogos encerrados para começar a colecionar.</p>`;
  else html+=`<div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div>`;
  html+=`</div>`;
  // coleção de arquétipos
  if(topArch.length){
    html+=`<div class="card"><div class="h2 disp">Seus arquétipos mais frequentes</div><div style="margin-top:10px">`;
    topArch.forEach(([a,n])=>{html+=`<div class="rank" style="padding:10px 14px"><div class="nm">${esc(a)}</div><div class="pt mono" style="font-size:15px">${n}×</div></div>`;});
    html+=`</div></div>`;
  }
  html+=`<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--red)">ZONA DE RISCO</div>
    <p class="p" style="margin-bottom:10px">Excluir seu histórico oculta do seu perfil os times que você montou nos jogos já encerrados (zera medalhas e conquistas). Você continua no ranking das salas. Pede sua senha pra confirmar.</p>
    <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="askHideHistory()">🗑 Excluir histórico do perfil</button>
  </div>`;
  html+=`<button class="btn ghost" onclick="go('home')">← Voltar</button>`;
  return html;
}
function statBox(emoji,val,label){
  return `<div class="slot" style="cursor:default;text-align:center;min-height:auto;padding:12px 6px">
    <div style="font-size:20px">${emoji}</div>
    <div class="mono" style="font-size:18px;color:var(--amber);margin-top:4px">${val}</div>
    <div style="font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:2px;text-transform:uppercase">${label}</div>
  </div>`;
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
  // ranking — toque numa pessoa pra ver o time dela
  html+=`<div class="card"><div class="h2 disp">Ranking da sala</div>`;
  if(scored.length===0)html+=`<p class="p">Ninguém montou time nesta sala ainda.</p>`;
  scored.forEach((s,i)=>{
    const isMe=s.username===APP.user?.username;
    const op=_openRank[i];
    html+=`<div class="rank${isMe?" me":""}" style="cursor:pointer" onclick="toggleRank(${i})"><div class="po mono">${i+1}º</div><div class="nm">${esc(s.username)}<small>cap: ${esc(SLOT_LABEL[s.captain])} · ${TAC[s.tactic]?.name||s.tactic} · toque p/ ver time</small></div><div class="pt mono">${s.total.toFixed(1)}</div></div>`;
    if(op){
      html+=`<div style="border:1px solid var(--line);border-top:none;border-radius:0 0 12px 12px;margin:-8px 0 10px;padding:6px 12px 10px;background:var(--panel2)">`;
      s.view.filter(Boolean).forEach(v=>{
        const pl=APP._byId[v.pid];
        const capTag=v.cap?` <span class="badgeC">C</span>`:"";
        const subTag=v.subIn?` <span style="font-size:9px;color:var(--green)">↑entrou</span>`:"";
        const benchTag=v.slot==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:"";
        html+=`<div class="line" style="padding:6px 0"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[v.slot]}</b> ${esc(pl?pl.name:"?")}${capTag}${subTag}${benchTag}</span><span class="v mono ${v.pts>0?"plus":v.pts<0?"minus":""}">${v.slot==="BENCH"?"—":(v.pts>0?"+":"")+v.pts.toFixed(1)}</span></div>`;
      });
      html+=`</div>`;
    }
  });
  html+=`</div>`;
  // minha apuração detalhada
  if(mine){
    html+=`<div class="card"><div class="h2 disp">Sua apuração</div><p class="p" style="margin-bottom:10px">Toque em cada jogador para abrir o cálculo.</p>`;
    mine.view.filter(Boolean).forEach((v,idx)=>{html+=receiptHTML(v,idx);});
    html+=`<div class="line total" style="font-size:16px;padding:10px 4px 4px"><span class="disp">TOTAL</span><span class="v mono" style="color:var(--amber);font-size:22px">${mine.total.toFixed(1)}</span></div>`;
    if(mine.subOut)html+=`<p class="p" style="margin-top:8px">🔄 Substituição: banco entrou no slot ${SLOT_LABEL[mine.subOut]}.</p>`;
    html+=`</div>`;
  }
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  html+=`<button class="btn ghost" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('home')"}">← Voltar${inRound?" à rodada":" às salas"}</button>`;
  return html;
}
let _openRec={};
let _openRank={};
function toggleRank(i){_openRank[i]=!_openRank[i];render();}
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
      ${archHistoryHTML(p?p.name:"")}
    </div>`;
  }
  return `<div class="receipt"><div class="rhead" onclick="toggleRec(${idx})">
    <div class="sl mono">${SLOT_LABEL[v.slot]}</div>
    <div class="nm">${esc(p.name)}<small>${p.team} · ${p.pos}${v.subIn?' · ↑ entrou do banco':''}</small></div>
    ${v.cap?'<span class="badgeC">C ×1.20</span>':''}
    <div class="tot mono${v.pts<0?" neg":""}">${v.pts.toFixed(1)}</div></div>${body}</div>`;
}
function toggleRec(i){_openRec[i]=!_openRec[i];render();}
// histórico colecionável do atleta nos jogos JÁ encerrados (arquivados)
function archHistoryHTML(playerName){
  const h=playerArchHistory(playerName);
  if(!h||h.games<=0)return"";
  const arch=Object.entries(h.archetypes).sort((a,b)=>b[1]-a[1]);
  const traits=Object.entries(h.traits).sort((a,b)=>b[1]-a[1]);
  if(!arch.length&&!traits.length)return"";
  const fmt=arr=>arr.map(([k,n])=>`${esc(k)}${n>1?` ×${n}`:""}`).join(" · ");
  return `<div class="metricbox" style="border-color:var(--blue);color:var(--blue)">
    <div style="color:var(--dim);letter-spacing:.08em;font-size:10px;margin-bottom:4px">📚 HISTÓRICO NESTE FANTASY (${h.games} jogo${h.games>1?"s":""})</div>
    ${arch.length?`<div style="color:var(--chalk)">Arquétipos: ${fmt(arch)}</div>`:""}
    ${traits.length?`<div style="color:var(--dim);margin-top:2px">Selos: ${fmt(traits)}</div>`:""}
    ${h.best?`<div style="margin-top:2px">Melhor carta: <b>${esc(h.best)}</b></div>`:""}
  </div>`;
}

// ============================================================
// RENDER
// ============================================================
function render(){
  const root=$("root");
  if(needLogin()){root.innerHTML=topbarHTML()+loginModalHTML();return;}
  let panel="";
  if(APP.view==="groups")panel=groupsHTML();
  else if(APP.view==="home")panel=homeHTML();
  else if(APP.view==="round")panel=roundHTML();
  else if(APP.view==="room")panel=roomHTML();
  else if(APP.view==="build")panel=buildHTML();
  else if(APP.view==="result")panel=resultHTML();
  else if(APP.view==="profile")panel=profileHTML();
  root.innerHTML=topbarHTML()+panel+footHTML()+confirmModalHTML();
}
function topbarHTML(){
  const inGroup=APP.groupId&&APP.user;
  return `<div class="topbar">
    <div class="logo" onclick="go('groups')" style="cursor:pointer">FANTASY PvP<br><small>v2.4.0 · PvP</small></div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="userchip" onclick="toggleRules()" style="padding:5px 11px;font-weight:700" title="Como funciona">?</div>
      ${isDev()?`<div class="userchip" onclick="toggleDevMode()" style="cursor:pointer;border-color:${APP.devMode?"var(--amber)":"var(--line)"};color:${APP.devMode?"var(--amber)":"var(--dim)"}" title="Alternar modo DEV / jogador">${APP.devMode?"🛠 DEV":"🎮 jogador"}</div>`:""}
      ${APP.user?`<div class="userchip">${inGroup?`<span onclick="openProfile()" style="cursor:pointer" title="Meu perfil">👤 <b>${esc(APP.user.username)}</b></span>`:`👤 <b>${esc(APP.user.username)}</b>`} · <span onclick="logout()" style="cursor:pointer">sair</span></div>`:""}
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
  await loadArchived();
  await tryAutoLogin();
  // restaura preferência do modo DEV (padrão: ligado)
  const dm=localStorage_safe_get("fpvp_devmode");
  if(dm==="0")APP.devMode=false; else APP.devMode=true;
  // go central: carrega o que cada view precisa
  window.go=async function(view,roomId,roundId){
    APP.view=view;if(roomId)APP.roomId=roomId;
    if(view==="groups"){await loadGroups();}
    if(view==="home"){await loadArchived();await loadGroups();await loadGroupRooms();await loadRounds();}
    if(view==="round"){await loadRound(roundId);}
    if(view==="room"){APP.roundId=null;APP.round=null;APP.roundRooms=[];APP.roundEntries=[];}
    if(view==="room"||view==="build"||view==="result"){await loadRoom(APP.roomId);}
    if(view==="result"){APP.entries=await loadEntries();_openRec={};_openRank={};}
    if(view==="profile"){APP.profile=null;render();const ps=await loadProfileStats(APP.user.username);if(APP.view==="profile")APP.profile=ps;}
    render();window.scrollTo(0,0);
  };
  // tela inicial: grupos (se logado). carrega a lista antes.
  if(APP.user){await loadGroups();APP.view="groups";}
  render();
 }catch(err){
  var r=document.getElementById("root");
  if(r)r.innerHTML='<div style="padding:20px;color:#E0604F;font-family:monospace;font-size:13px"><b>Erro ao iniciar:</b><br>'+String(err&&err.message?err.message:err)+'<br><br><span style="color:#8FA89A">Tire um print desta tela.</span></div>';
 }
})();
