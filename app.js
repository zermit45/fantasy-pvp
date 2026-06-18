// ============================================================
// FANTASY PvP — APP (navegação, Supabase, telas)
// ============================================================
const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"FLEX",BENCH:"BANCO"};
// modos de mini rodada (agrupamento + cores na home). Rodadas antigas (sem mode) = 'select'.
const MODE_META={
  select:{label:"SELECIONE",icon:"🎯",color:"#5CA8FF",desc:"Escolha poucos jogos pra entrar. Acertar os jogos certos é a estratégia."},
  full:{label:"COMPLETO",icon:"🏆",color:"#54E0A8",desc:"Jogue TODOS os jogos da mini rodada. Vale a soma de tudo."},
  boost:{label:"IMPULSO",icon:"⚡",color:"#FFC247",desc:"Estratégico impulsionado: escale todos e gaste tokens de impulso (+10% por token) nas partidas que você mais confia. Trava no 1º jogo."},
};
const modeOf=r=>(r&&r.mode)||"select";
const modeMeta=r=>MODE_META[modeOf(r)]||MODE_META.select;
// paleta de cores por seleção/clube (código → hex). Fallback para um cinza-azulado.
const TEAM_COLOR={POR:"#E63946",COD:"#5CA8FF",AUT:"#FF6B6B",JOR:"#54E0A8",NED:"#FF7A1A",JPN:"#4D7BFF",UZB:"#3DC1D3",COL:"#FFD23F",GHA:"#54E0A8",PAN:"#E63946",ENG:"#5CA8FF",CRO:"#E63946",BRA:"#FFC247",ARG:"#62C9F5",FRA:"#5C6BFF",ESP:"#E63946",GER:"#EEF2FB",
  CZE:"#5CA8FF",RSA:"#54E0A8",MEX:"#1FA85A",KOR:"#FF6B6B",SUI:"#E63946",BIH:"#FFD23F",CAN:"#FF4D4D",QAT:"#B98BFF",SCO:"#5CA8FF",MAR:"#E63946",HAI:"#5C6BFF",USA:"#5CA8FF",AUS:"#54E0A8",TUR:"#E63946",PAR:"#5CA8FF",ECU:"#FFD23F",CUW:"#3D54FF",CIV:"#FF7A1A",SWE:"#4D7BFF",TUN:"#E63946",BEL:"#E63946",IRN:"#54E0A8",NZL:"#EEF2FB",EGY:"#E63946",SAU:"#1FA85A",URU:"#62C9F5",CPV:"#3DA35D"};
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
  rounds:[], roundId:null, round:null, roundRooms:[], roundEntries:[], roundAllEntries:[], roundRanking:null,
  leagues:[], leagueId:null, league:null, leaguePhases:[], leagueStanding:null, leagueTab:"table", homeTab:"toplay", homeSearch:"", homeDay:"todos",
  phases:[], phaseId:null, phase:null, phaseRounds:[], phaseStanding:null, phaseTab:"table",
  archived:[],          // room_ids de jogos arquivados (global) — só aparecem em Resultados
  profile:null, profileHistory:null,         // estatísticas do perfil (calculadas ao vivo)
  devMode:true,         // modo DEV ligado (só afeta quem é dev); alterna admin x jogador comum
  prepool:null, match:null, roomMeta:null,
  slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},
  captain:null, tactic:null, tabTeam:"ALL", tabPos:"ALL", warn:"", showRules:false, help:null, confirm:null,
  entries:[],           // entries da sala (pro ranking)
  avulsaLineup:null, members:null, memberView:null, memberProfile:null, memberHistory:null,
  collapsedModes:{},   // {select:true} = grupo de modo recolhido na home
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
// Filtro COMPLETO e seguro pra uma entry do usuário atual num jogo+rodada específicos.
// Sempre fixa room_id + group_id + username + round_id (tratando rodada avulsa = null),
// pra nenhuma ação de uma rodada vazar pra outra. roundId opcional usa APP.roundId.
function entryFilter(roomId,roundId){
  const rid=(roundId!==undefined)?roundId:APP.roundId;
  const base=`room_id=eq.${roomId}&group_id=eq.${APP.groupId}&username=eq.${encodeURIComponent(APP.user.username)}`;
  return base+(rid?`&round_id=eq.${rid}`:`&round_id=is.null`);
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
    archetypes:{}, traits:{}, rarities:{}, players:{}, bestPlayer:null,
    playerPts:{}, topPlayer:null, bestPerf:null,
    tactics:{}, topTactic:null, capHits:0, capTotal:0,
    bestStreak:0, zebraWins:0
  };
  if(!SUPA.ready()||!APP.groupId)return stats;
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  // ordenar por ordem do catálogo pra calcular sequências de pódio
  const myResults=[]; // {pos, podium} na ordem que joguei
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    let entries;
    try{entries=await sb("entries?room_id=eq."+j.room_id+"&group_id=eq."+APP.groupId+"&select=*");}
    catch(e){continue;}
    if(!entries||!entries.length)continue;
    entries=entries.filter(e=>!(e.username===username&&e.hidden_profile===true));
    const scored=entries.map(e=>scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx)).sort((a,b)=>b.total-a.total);
    const myIdx=scored.findIndex(s=>s.username===username);
    if(myIdx<0)continue;
    const me=scored[myIdx];
    stats.games++;
    stats.totalPoints+=me.total;
    if(myIdx===0)stats.wins++;
    if(myIdx<3)stats.podiums++;
    myResults.push(myIdx<3);
    if(me.total>stats.bestScore){stats.bestScore=me.total;stats.bestGame=j.match_name;}
    // tática usada
    if(me.tactic){const tn=window.ENGINE_TACTICS[me.tactic]?window.ENGINE_TACTICS[me.tactic].name:me.tactic;stats.tactics[tn]=(stats.tactics[tn]||0)+1;}
    // zebra: venceu escalando maioria de jogadores do time underdog (menor ELO)
    if(myIdx===0){
      const m=ctx.match,homeUnder=m.homeElo<m.awayElo;
      const underCode=homeUnder?m.homeCode:m.awayCode;
      let underN=0,tot=0;
      for(const v of me.view){if(!v||v.slot==="BENCH")continue;const pl=ctx.byId[v.pid];if(pl){tot++;if(pl.team===underCode)underN++;}}
      if(tot&&underN/tot>=0.6)stats.zebraWins++;
    }
    // capitão certeiro: o capitão foi o maior pontuador (titular) do meu time?
    let capPts=null,maxTitular=-1e9;
    for(const v of me.view){
      if(!v||v.slot==="BENCH")continue;
      const meta=v.r&&v.r.meta;
      const pl=ctx.byId[v.pid];
      if(meta&&meta.arch&&meta.arch!=="—")stats.archetypes[meta.arch]=(stats.archetypes[meta.arch]||0)+1;
      if(meta)(meta.traits||[]).forEach(t=>{if(t!=="Regular"&&t!=="Não entrou em campo")stats.traits[t]=(stats.traits[t]||0)+1;});
      if(meta&&meta.rarity)stats.rarities[meta.rarity]=(stats.rarities[meta.rarity]||0)+1;
      if(pl){
        stats.players[pl.name]=(stats.players[pl.name]||0)+1;
        // pontos somados por jogador (craque favorito) e melhor atuação individual
        const base=v.cap?v.pts/1.2:v.pts; // pontos do jogador sem o bônus de capitão (pra comparar justo)
        stats.playerPts[pl.name]=(stats.playerPts[pl.name]||0)+v.pts;
        if(!stats.bestPerf||v.pts>stats.bestPerf.pts){
          stats.bestPerf={name:pl.name,team:pl.team,pts:v.pts,game:j.match_name,cap:v.cap};
        }
        if(v.cap)capPts=v.pts/1.2;
        if(v.pts>maxTitular)maxTitular=v.pts;
      }
    }
    // capitão acertou se o jogador capitão (pontos sem bônus) foi o melhor titular
    if(capPts!=null){stats.capTotal++;const capWithBonus=capPts*1.2;if(Math.abs(capWithBonus-maxTitular)<0.01||capWithBonus>=maxTitular)stats.capHits++;}
  }
  // jogador mais escalado (frequência)
  let top=null;for(const[name,n]of Object.entries(stats.players)){if(!top||n>top.n)top={name,n};}
  stats.bestPlayer=top;
  // craque favorito (mais pontos somados)
  let tp=null;for(const[name,pts]of Object.entries(stats.playerPts)){if(!tp||pts>tp.pts)tp={name,pts:Math.round(pts*10)/10};}
  stats.topPlayer=tp;
  // tática preferida
  let tt=null;for(const[name,n]of Object.entries(stats.tactics)){if(!tt||n>tt.n)tt={name,n};}
  stats.topTactic=tt;
  // melhor sequência de pódios
  let cur=0;for(const ok of myResults){if(ok){cur++;if(cur>stats.bestStreak)stats.bestStreak=cur;}else cur=0;}
  // derivados
  stats.avg=stats.games?Math.round(stats.totalPoints/stats.games*10)/10:0;
  stats.podiumRate=stats.games?Math.round(stats.podiums/stats.games*100):0;
  stats.winRate=stats.games?Math.round(stats.wins/stats.games*100):0;
  stats.capRate=stats.capTotal?Math.round(stats.capHits/stats.capTotal*100):0;
  return stats;
}
// ── MEMBROS DO GRUPO ──
async function loadGroupMembers(){
  if(!SUPA.ready()||!APP.groupId)return [];
  try{
    const rows=await sb("group_members?group_id=eq."+APP.groupId+"&select=username");
    // distintos
    return [...new Set((rows||[]).map(r=>r.username))];
  }catch(e){return [];}
}
// histórico de partidas que um membro jogou: time escalado + pontuação detalhada
async function loadMemberHistory(username){
  const out=[];
  if(!SUPA.ready()||!APP.groupId)return out;
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  // mapa round_id → modo (pra rotular cada entry)
  const roundById={};
  for(const r of (APP.rounds||[]))roundById[r.id]=r;
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    let entries;
    try{entries=await sb("entries?room_id=eq."+j.room_id+"&group_id=eq."+APP.groupId+"&select=*");}
    catch(e){continue;}
    if(!entries||!entries.length)continue;
    // ranking geral do jogo (todas as entries, pra calcular posição) — usa a melhor de cada user
    const scoredAll=entries.map(e=>scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx));
    // MINHAS entries neste jogo (pode ter várias: avulsa + rodadas), com modo+pontuação
    const mine=entries.filter(e=>e.username===username&&e.slots&&Object.values(e.slots).some(Boolean));
    if(!mine.length)continue;
    const variants=mine.map(e=>{
      const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
      const rd=e.round_id?roundById[e.round_id]:null;
      const mode=e.round_id?(rd?modeOf(rd):"select"):"avulsa";
      const roundName=rd?rd.name:null;
      // no SELECIONE, só conta se travou (confirmed); marca pra exibir
      const counts=mode!=="select"||e.confirmed===true;
      return {entry:sc,mode,roundName,roundId:e.round_id||null,counts};
    });
    // ordena: avulsa primeiro, depois por pontuação
    variants.sort((a,b)=>{if(a.mode==="avulsa"&&b.mode!=="avulsa")return -1;if(b.mode==="avulsa"&&a.mode!=="avulsa")return 1;return b.entry.total-a.entry.total;});
    // a nota PRINCIPAL: a avulsa; se não houver, a melhor de outro modo (sinalizada)
    const avulsa=variants.find(v=>v.mode==="avulsa");
    const principal=avulsa||variants[0];
    const isAvulsa=!!avulsa;
    // posição do usuário no ranking geral do jogo (pela melhor entry dele)
    const bestMine=Math.max(...variants.map(v=>v.entry.total));
    const sortedTotals=scoredAll.map(s=>s.total).sort((a,b)=>b-a);
    const pos=sortedTotals.findIndex(t=>Math.abs(t-bestMine)<0.05)+1;
    out.push({room_id:j.room_id,match_name:j.match_name,comp:j.comp,pos:pos||1,of:scoredAll.length,
      entry:principal.entry, principalMode:principal.mode, isAvulsa, variants, ctx});
  }
  return out;
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
// ── LIGAS (nível 1) > RODADAS/phases (nível 2) > MINI RODADAS/rounds (nível 3) ──
const TABLE_POINTS=[10,7,5,3]; // 1º=10, 2º=7, 3º=5, 4º=3, resto=1
function tablePointsFor(pos){return pos<=TABLE_POINTS.length?TABLE_POINTS[pos-1]:1;}
async function loadLeagues(){
  if(!APP.groupId)return;
  try{APP.leagues=await sb("leagues?group_id=eq."+APP.groupId+"&select=*&order=created_at");}
  catch(e){APP.leagues=[];}
}
async function loadPhases(){
  if(!APP.groupId)return;
  try{APP.phases=await sb("phases?group_id=eq."+APP.groupId+"&select=*&order=created_at");}
  catch(e){APP.phases=[];}
}
async function createLeague(name){
  const rows=await sbInsert("leagues",{group_id:APP.groupId,name});
  await loadLeagues();
  toast("Liga criada!");
  if(rows&&rows[0])enterLeague(rows[0].id); else render();
}
async function createPhase(name,leagueId){
  const rows=await sbInsert("phases",{group_id:APP.groupId,name,league_id:leagueId||null});
  await loadPhases();
  toast("Rodada criada!");
  render();
  return rows&&rows[0]?rows[0].id:null;
}
function enterLeague(leagueId){go("league",null,null,null,leagueId);}
function leaveLeague(){APP.leagueId=null;APP.league=null;APP.view="home";render();window.scrollTo(0,0);}
function enterPhase(phaseId){go("phase",null,null,null,null,phaseId);}
function leavePhase(){APP.phaseId=null;APP.phase=null;APP.view="home";render();window.scrollTo(0,0);}
async function loadLeague(leagueId){
  APP.leagueId=leagueId;
  try{
    const ls=await sb("leagues?id=eq."+leagueId+"&select=*");
    APP.league=ls&&ls[0]?ls[0]:null;
    APP.leaguePhases=await sb("phases?league_id=eq."+leagueId+"&group_id=eq."+APP.groupId+"&select=*&order=created_at");
  }catch(e){APP.league=null;APP.leaguePhases=[];}
  APP.leagueStanding=await computeLeagueStanding(leagueId);
}
async function loadPhase(phaseId){
  APP.phaseId=phaseId;
  try{
    const ps=await sb("phases?id=eq."+phaseId+"&select=*");
    APP.phase=ps&&ps[0]?ps[0]:null;
    // mini rodadas (rounds) desta rodada (phase)
    APP.phaseRounds=await sb("rounds?phase_id=eq."+phaseId+"&group_id=eq."+APP.groupId+"&select=*&order=created_at");
  }catch(e){APP.phase=null;APP.phaseRounds=[];}
  APP.phaseStanding=await computePhaseStanding(phaseId);
}
// soma de pontos de uma MINI RODADA → retorna {username:{classic,table}} (Opção B)
async function miniRoundPoints(roundId){
  const out={};
  const rk=await computeRoundRanking(roundId); // [{username,total,games}] ordenado desc
  rk.forEach((u,idx)=>{out[u.username]={classic:u.total,table:tablePointsFor(idx+1)};});
  return out;
}
// classificação de uma RODADA (phase): soma as mini rodadas dela (Opção B)
async function computePhaseStanding(phaseId){
  const out={};
  try{
    const rounds=APP.phaseRounds||[];
    for(const rd of rounds){
      const pts=await miniRoundPoints(rd.id);
      for(const [user,p] of Object.entries(pts)){
        if(!out[user])out[user]={username:user,classic:0,table:0,roundsPlayed:0};
        out[user].classic+=p.classic;out[user].table+=p.table;out[user].roundsPlayed++;
      }
    }
  }catch(e){}
  return Object.values(out).map(u=>({...u,classic:Math.round(u.classic*10)/10}));
}
// classificação da LIGA: soma todas as rodadas (phases) da liga, que por sua vez somam mini rodadas (Opção B)
async function computeLeagueStanding(leagueId){
  const out={};
  try{
    const phases=APP.leaguePhases||[];
    for(const ph of phases){
      // mini rodadas desta phase
      const rounds=await sb("rounds?phase_id=eq."+ph.id+"&group_id=eq."+APP.groupId+"&select=id");
      for(const rd of (rounds||[])){
        const pts=await miniRoundPoints(rd.id);
        for(const [user,p] of Object.entries(pts)){
          if(!out[user])out[user]={username:user,classic:0,table:0,roundsPlayed:0};
          out[user].classic+=p.classic;out[user].table+=p.table;out[user].roundsPlayed++;
        }
      }
    }
  }catch(e){}
  return Object.values(out).map(u=>({...u,classic:Math.round(u.classic*10)/10}));
}
async function loadRound(roundId){
  APP.roundId=roundId;
  try{
    const rs=await sb("rounds?id=eq."+roundId+"&select=*");
    APP.round=rs&&rs[0]?rs[0]:null;
    APP.roundRooms=await sb("round_rooms?round_id=eq."+roundId+"&select=*");
    // minhas entries nesta rodada (seleção + time + confirmação)
    if(APP.user){
      APP.roundEntries=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+"&select=room_id,slots,captain,tactic,boost,confirmed");
    }
    // entries de TODOS os membros nesta rodada (escalação completa pra ranking clicável)
    APP.roundAllEntries=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=room_id,username,slots,captain,tactic,boost,confirmed&limit=2000");
  }catch(e){APP.round=null;APP.roundRooms=[];APP.roundEntries=[];APP.roundAllEntries=[];}
  // ranking acumulado da rodada (soma dos pontos de cada um nos jogos finalizados que escolheu)
  APP.roundRanking=await computeRoundRanking(roundId);
}
// soma, por usuário, os pontos dos jogos FINALIZADOS desta rodada
async function computeRoundRanking(roundId){
  try{
    const all=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=*");
    if(!all||!all.length)return [];
    const isSelect=modeOf(APP.round)==="select";
    const byUser={};
    for(const rr of APP.roundRooms){
      const g=window.GAMES.data[rr.room_id];
      if(!g||!g.match||g.match.status!=="finished")continue; // só jogos já apurados
      const ctx=buildCtxFor(rr.room_id);if(!ctx)continue;
      const here=all.filter(e=>e.room_id===rr.room_id);
      for(const e of here){
        if(!e.slots||!Object.values(e.slots).some(Boolean))continue; // sem time montado
        if(isSelect&&e.confirmed!==true)continue; // SELECIONE: só pontua jogo travado
        const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
        if(!byUser[e.username])byUser[e.username]={username:e.username,total:0,games:0};
        byUser[e.username].total+=sc.total;
        byUser[e.username].games++;
      }
    }
    return Object.values(byUser).map(u=>({...u,total:Math.round(u.total*10)/10})).sort((a,b)=>b.total-a.total);
  }catch(e){return [];}
}
// mostra a escalação de um usuário em cada jogo FINALIZADO da rodada, com pontos por jogador
function roundUserTeamsHTML(username){
  const all=APP.roundAllEntries||[];
  const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"CURINGA",BENCH:"BANCO"};
  let html=`<div style="background:rgba(255,255,255,.03);border-radius:10px;padding:10px;margin:2px 0 8px">`;
  let achou=false;
  APP.roundRooms.forEach(rr=>{
    const g=window.GAMES.data[rr.room_id];
    if(!g||!g.match||g.match.status!=="finished")return; // só jogos apurados
    const e=all.find(x=>x.username===username&&x.room_id===rr.room_id);
    if(!e||!e.slots||!Object.values(e.slots).some(Boolean))return; // não montou esse jogo
    const ctx=buildCtxFor(rr.room_id);if(!ctx)return;
    const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
    achou=true;
    const nome=g.prepool.home.name+" × "+g.prepool.away.name;
    const tacName=e.tactic&&window.ENGINE_TACTICS[e.tactic]?window.ENGINE_TACTICS[e.tactic].name:"sem tática";
    html+=`<div style="margin-bottom:8px"><div class="bsub" style="border:none;padding:0;margin:0 0 4px">${esc(nome)} · <span style="color:var(--amber)">${sc.total.toFixed(1)} pts</span>${sc.boost>0?` <span class="statuspill" style="background:color-mix(in srgb,#FFC247 22%,transparent);color:#FFC247">⚡ +${sc.boost*10}%</span>`:""}</div>`;
    html+=`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Tática: ${esc(tacName)} · toque num jogador p/ detalhe</div>`;
    const renderLine=(v,isBench)=>{
      const meta=ctx.byId[v.pid];if(!meta)return"";
      const pkey="t_"+username+"_"+rr.room_id+"_"+v.slot;
      const open=_openTeamPlayer[pkey];
      const r=v.r;
      const capTag=v.cap?' <span style="color:var(--amber)">©</span>':"";
      const subTag=v.subIn?' <span style="color:var(--blue);font-size:10px">entrou</span>':"";
      const benchTag=isBench?' <span style="font-size:9px;color:var(--dim)">banco</span>':"";
      let body="";
      if(open&&r){
        body=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
          <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo</div>
          ${(r.statLines||[]).map(([l,c,u,pts])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
          ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
          ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
          ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
        </div>`;
      }
      return `<div class="line" style="padding:3px 0;cursor:pointer" onclick="toggleTeamPlayer('${pkey}')"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[v.slot]}</span> ${esc(meta.name)}${capTag}${subTag}${benchTag} <span style="color:var(--blue);font-size:10px">${open?"▲":"▼"}</span></span><span class="mono" style="color:${isBench?"var(--dim)":(v.pts>=0?"var(--green)":"var(--red)")}">${v.pts.toFixed(1)}</span></div>${body}`;
    };
    sc.view.forEach(v=>{if(!v||v.slot==="BENCH")return;html+=renderLine(v,false);});
    const b=sc.view.find(v=>v&&v.slot==="BENCH");
    if(b&&b.pid)html+=renderLine(b,true);
    html+=`</div>`;
  });
  if(!achou)html+=`<p class="p" style="margin:0">Sem time apurado nos jogos já encerrados.</p>`;
  html+=`</div>`;
  return html;
}
let _openTeamPlayer={};
function toggleTeamPlayer(k){_openTeamPlayer[k]=!_openTeamPlayer[k];render();}
let _openPeekRound={};
function togglePeekRound(k){_openPeekRound[k]=!_openPeekRound[k];render();}
// ESPIAR a escalação de um usuário num jogo que JÁ COMEÇOU (mesmo antes de apurar).
// Se o jogo já foi apurado, mostra os pontos; se só começou, mostra os jogadores escalados.
function peekLineupHTML(entry,roomId){
  const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"CURINGA",BENCH:"BANCO"};
  const g=window.GAMES.data[roomId];
  const finished=g&&g.match&&g.match.status==="finished";
  const tacName=entry.tactic&&window.ENGINE_TACTICS[entry.tactic]?window.ENGINE_TACTICS[entry.tactic].name:"sem tática";
  const tk=parseInt(entry.boost,10)||0;
  let html=`<div style="background:rgba(255,255,255,.03);border-radius:10px;padding:8px 10px;margin:2px 0 8px 6px;border-left:2px solid var(--line)">`;
  html+=`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Tática: ${esc(tacName)}${tk>0?` · <span style="color:#FFC247">⚡ +${tk*10}%</span>`:""}</div>`;
  // catálogo de jogadores do jogo (pid → nome/pos)
  const cat={};
  if(g&&g.prepool&&g.prepool.players)for(const p of g.prepool.players)cat[p.id]={name:p.name,pos:p.pos,team:p.team};
  if(finished){
    // jogo apurado: mostra com pontos
    const ctx=buildCtxFor(roomId);
    if(ctx){
      const sc=scoreEntryFor(JSON.parse(JSON.stringify(entry)),ctx.eng,ctx);
      sc.view.filter(Boolean).forEach(v=>{
        const meta=ctx.byId[v.pid];if(!meta)return;
        const isBench=v.slot==="BENCH";
        const capTag=v.cap?' <span style="color:var(--amber)">©</span>':"";
        const subTag=v.subIn?' <span style="color:var(--blue);font-size:10px">entrou</span>':"";
        html+=`<div class="line" style="padding:3px 0"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[v.slot]}</span> ${esc(meta.name)}${capTag}${subTag}${isBench?' <span style="font-size:9px;color:var(--dim)">banco</span>':""}</span><span class="mono" style="color:${isBench?"var(--dim)":(v.pts>=0?"var(--green)":"var(--red)")}">${isBench?"—":(v.pts>=0?"+":"")+v.pts.toFixed(1)}</span></div>`;
      });
      html+=`<div class="line" style="padding:5px 0 0;border-top:1px solid var(--line);margin-top:4px"><span style="font-weight:700">Total</span><span class="mono" style="color:var(--amber);font-weight:700">${sc.total.toFixed(1)}</span></div>`;
    }
  }else{
    // jogo começou mas não apurou: mostra só os jogadores escalados (sem pontos)
    const slots=entry.slots||{};
    ["GK","DEF","MID","ATT","FLEX","BENCH"].forEach(slot=>{
      const pid=slots[slot];if(!pid)return;
      const meta=cat[pid];
      const capTag=entry.captain===slot?' <span style="color:var(--amber)">©</span>':"";
      const benchTag=slot==="BENCH"?' <span style="font-size:9px;color:var(--dim)">banco</span>':"";
      html+=`<div class="line" style="padding:3px 0"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[slot]}</span> ${meta?esc(meta.name):"?"}${capTag}${benchTag}</span></div>`;
    });
    html+=`<p class="p" style="font-size:10px;color:var(--dim);margin:4px 0 0">Pontos aparecem quando o jogo for apurado.</p>`;
  }
  html+=`</div>`;
  return html;
}
function toggleRoundUser(u){
  const name=decodeURIComponent(u);
  APP._openRoundUser=APP._openRoundUser===name?null:name;
  render();
}
// ----- helpers do novo fluxo -----
function roundEntryOf(roomId){return APP.roundEntries.find(e=>e.room_id===roomId);}
function pickedRoom(roomId){return !!roundEntryOf(roomId);}                 // tem entry deste jogo
function hasTeam(roomId){const e=roundEntryOf(roomId);return e&&e.slots&&Object.values(e.slots).some(Boolean);} // tem escalação
function isConfirmed(roomId){const e=roundEntryOf(roomId);return e&&e.confirmed===true;}                  // jogo TRAVADO (vale)
// no modo select, "usado" = quantos jogos o usuário travou (confirmed) — não quantas entries existem
function picksUsed(){return (APP.roundEntries||[]).filter(e=>e.confirmed===true).length;}
function picksLeft(){return APP.round?Math.max(0,APP.round.pick_limit-picksUsed()):0;}
// SELEÇÃO travada? Trava se o admin fechou manualmente OU o 1º jogo da pool começou (automático).
// EXCEÇÃO admin: se o dev reabriu manualmente (picks_reopened), destrava mesmo após o kickoff.
function picksLocked(){
  if(APP.round&&APP.round.status&&APP.round.status!=="open")return true; // admin fechou manualmente
  if(APP.round&&APP.round.picks_reopened===true)return false;            // admin reabriu (vence o tempo)
  return boostLocked(); // 1º jogo da pool começou (trava automática por tempo)
}
// jogo travado individualmente? (dev forçou OU usuário confirmou OU jogo começou/finalizou)
// trava por HORÁRIO (jogo começou) ou jogo finalizado — não inclui trava manual do admin
function roomTimeLocked(roomId){
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished")return true;
  const idx=(APP.jogos||[]).find(j=>j.room_id===roomId);
  if(idx&&idx.kickoff){const k=new Date(idx.kickoff);if(!isNaN(k)&&Date.now()>=k.getTime())return true;}
  return false;
}
// trava manual do admin (status da round_room)
function roomAdminLocked(roomId){
  const rr=APP.roundRooms.find(x=>x.room_id===roomId);
  return !!(rr&&rr.status&&rr.status!=="open");
}
// escalação travada para o jogador (qualquer um dos dois)
function roomLockedInRound(roomId){
  return roomAdminLocked(roomId)||roomTimeLocked(roomId);
}
// ── MODO IMPULSO ──
// 1º kickoff da rodada (ISO mais cedo entre os jogos da rodada). Impulsos travam aqui.
function roundFirstKickoff(){
  let min=Infinity;
  for(const rr of (APP.roundRooms||[])){
    const j=(APP.jogos||[]).find(x=>x.room_id===rr.room_id);
    if(j&&j.kickoff){const k=new Date(j.kickoff).getTime();if(!isNaN(k)&&k<min)min=k;}
  }
  return min;
}
// impulsos travados? (passou o 1º kickoff da rodada — todos travam juntos)
// EXCEÇÃO admin: se o dev reabriu manualmente (boost_reopened), destrava mesmo após o kickoff.
function boostLocked(){
  if(APP.round&&APP.round.boost_reopened===true)return false; // admin reabriu
  const f=roundFirstKickoff();
  return isFinite(f)&&Date.now()>=f;
}
// nº de tokens que ESTE usuário já gastou na rodada (soma de entry.boost)
function boostUsed(){
  return (APP.roundEntries||[]).reduce((s,e)=>s+(parseInt(e.boost,10)||0),0);
}
function boostLeft(){
  const cap=APP.round?(APP.round.boost_tokens||0):0;
  return Math.max(0,cap-boostUsed());
}
// quantos tokens ESTE usuário pôs num jogo específico
function boostOn(roomId){
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  return e?(parseInt(e.boost,10)||0):0;
}
// ajusta tokens de impulso num jogo (delta +1/−1)
async function changeBoost(roomId,delta){
  if(boostLocked()){toast("Os impulsos já travaram (o 1º jogo começou).");return;}
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  if(!e){toast("Monte o time deste jogo primeiro.");return;}
  const cur=parseInt(e.boost,10)||0;
  let next=cur+delta;
  if(next<0)next=0;
  if(delta>0&&boostLeft()<=0){toast("Você já gastou todos os seus tokens de impulso.");return;}
  try{
    await sbUpdate("entries",{boost:next,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);
    render();
  }catch(e2){toast("Erro: "+e2.message);}
}
// IMPULSO — confirmar/reabrir a distribuição de tokens. Usa entry.confirmed (sem outro uso no boost).
// Reeditável até o 1º jogo começar (boostLocked).
function boostConfirmed(){
  const es=(APP.roundEntries||[]);
  if(!es.length)return false;
  // confirmado = todas as entries do usuário marcadas confirmed
  return es.every(e=>e.confirmed===true);
}
async function toggleBoostConfirm(){
  if(boostLocked()){toast("Os impulsos já travaram (o 1º jogo começou).");return;}
  const willConfirm=!boostConfirmed();
  try{
    await sbUpdate("entries",{confirmed:willConfirm,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await loadRound(APP.roundId);
    toast(willConfirm?"Impulsos confirmados! (dá pra reeditar até o 1º jogo)":"Impulsos reabertos pra edição.");
    render();
  }catch(e2){toast("Erro: "+e2.message);}
}
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
    await sbDelete("entries",entryFilter(roomId));
    await loadRound(APP.roundId);
    toast("Seleção desfeita.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// MODO SELECIONE — travar/destravar um jogo (marca quais VALEM). Travado = confirmed=true.
// Destravar é livre enquanto a seleção estiver aberta e o jogo não tiver começado.
async function toggleSelectLock(roomId){
  const e=roundEntryOf(roomId);
  if(!e){toast("Monte o time deste jogo primeiro.");return;}
  const willLock=!(e.confirmed===true);
  if(willLock){
    if(!hasTeam(roomId)){toast("Monte o time antes de travar este jogo.");return;}
    if(picksLeft()<=0){toast("Você já travou seus "+APP.round.pick_limit+" jogos. Destrave um pra trocar.");return;}
  }else{
    // destravar: só se a seleção ainda está aberta e o jogo não começou
    if(picksLocked()){toast("A seleção já foi fechada — não dá pra destravar.");return;}
    if(roomTimeLocked(roomId)){toast("O jogo já começou — trava definitiva.");return;}
  }
  try{
    await sbUpdate("entries",{confirmed:willLock,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);
    toast(willLock?"Jogo travado — esse vale! (escalação ainda editável)":"Jogo destravado.");
    render();
  }catch(e2){toast("Erro: "+e2.message);}
}
// FASE 2 — usuário confirma a equipe de um jogo (salva slots atuais + trava)
async function confirmTeam(roomId){
  try{
    await sbUpdate("entries",{slots:APP.slots,captain:APP.captain,tactic:APP.tactic,confirmed:true,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);
    toast("Equipe confirmada! Esse time está travado.");
    go("round",null,APP.roundId);
  }catch(e){toast("Erro: "+e.message);}
}
// admin: força a trava da escalação de um jogo (quando a partida começa)
async function setRoundRoomStatus(roomId,status){
  if(!isAdmin()||!APP.roundId)return;
  try{
    const res=await sbUpdate("round_rooms",{status},"round_id=eq."+APP.roundId+"&room_id=eq."+encodeURIComponent(roomId));
    // se o PATCH não retornou a linha atualizada, o update não pegou (RLS ou linha inexistente)
    if(!res||!res.length){
      toast("Não consegui alterar (verifique as permissões da tabela round_rooms).");
      return;
    }
    // atualiza em memória de imediato (não depende só do reload)
    const rr=APP.roundRooms.find(x=>x.room_id===roomId);
    if(rr)rr.status=status;
    await loadRound(APP.roundId);
    toast(status==="locked"?"Escalação deste jogo travada (todos).":"Escalação deste jogo destravada (liberada).");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// admin: criar rodada
async function createRound(name,limit,phaseId,mode,boostTokens){
  const row={group_id:APP.groupId,name,pick_limit:limit,status:"open",phase_id:phaseId||null,mode:mode||"select",boost_tokens:boostTokens||0};
  const rows=await sbInsert("rounds",row);
  await loadRounds();
  toast("Mini rodada criada!");
  if(rows&&rows[0]){enterRound(rows[0].id);}else render();
}
async function addRoomToRound(roomId){
  if(!isAdmin())return;
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
async function toggleBoostReopen(){
  if(!isAdmin()||!APP.roundId)return;
  const willReopen=!(APP.round&&APP.round.boost_reopened===true);
  try{
    await sbUpdate("rounds",{boost_reopened:willReopen},"id=eq."+APP.roundId);
    await loadRound(APP.roundId);
    toast(willReopen?"Impulsos REABERTOS pelo admin — todos podem reeditar.":"Impulsos travados novamente.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
function enterRound(roundId){go("round",null,roundId);}
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
function askRenameRound(id){const r=(APP.rounds||[]).find(x=>x.id===id);APP.confirm={mode:"rename",kind:"round",id,cur:r?r.name:"",roundMode:r?modeOf(r):"select",pickLimit:r?r.pick_limit:3,boostTokens:r?(r.boost_tokens||0):0,label:"Editar mini rodada"};render();}
async function submitRename(){
  const c=APP.confirm;if(!c||!isAdmin())return;
  const f=$("renameInput");const novo=f?f.value.trim():"";
  if(!novo){toast("Digite um nome.");return;}
  const tbl=c.kind==="league"?"leagues":c.kind==="phase"?"phases":"rounds";
  const patch={name:novo};
  // mini rodada: permite editar limite de jogos (select) ou tokens (boost)
  if(c.kind==="round"){
    if(c.roundMode==="select"){const li=$("renamePick");if(li){let v=parseInt(li.value,10);if(v&&v>=1)patch.pick_limit=v;}}
    if(c.roundMode==="boost"){const ti=$("renameTokens");if(ti){let v=parseInt(ti.value,10);if(v&&v>=1)patch.boost_tokens=v;}}
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
function setHomeDay(d){APP.homeDay=decodeURIComponent(d);render();}
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
  const lista=baseLista.filter(matchQ).filter(j=>diaSel==="todos"||j.dayKey===diaSel);
  const nToplay=toplay.filter(matchQ).length, nFinished=finished.filter(matchQ).length;
  let diaChips="";
  if(diasDisp.length>1){
    diaChips=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <span onclick="setHomeDay('todos')" class="daychip${diaSel==="todos"?" on":""}">Todos</span>
      ${diasDisp.map(d=>`<span onclick="setHomeDay('${encodeURIComponent(d)}')" class="daychip${diaSel===d?" on":""}">${d==="A definir"?"📅 a definir":"📅 "+esc(d)}</span>`).join("")}
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
    diasOrdenados.forEach(dia=>{
      // título do dia: usa o "rel" (Hoje/Amanhã/Ontem) do primeiro jogo do grupo
      const first=grupos[dia][0];
      const relTag=first.ki&&first.ki.rel?`<span style="color:var(--green)">${first.ki.rel}</span> · `:"";
      listaHTML+=`<div class="bsub" style="border:none;padding:0;margin:14px 0 6px;color:var(--amber);font-size:12px;letter-spacing:.5px">📅 ${relTag}${esc(dia)}${first.ki?"/"+first.ki.yr:""}</div>`;
      grupos[dia].forEach(j=>{
        const pill=j.isFinished?'<span class="statuspill st-finished">FINALIZADA</span>':(j.status==="open"?'<span class="statuspill st-open">ABERTA</span>':'<span class="statuspill st-closed">FECHADA</span>');
        const onclick=j.isFinished?`go('result','${j.room_id}')`:`go('room','${j.room_id}')`;
        let adminBtn="";
        if(isAdmin()){
          if(j.archived)adminBtn=`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px" onclick="event.stopPropagation();unarchiveGame('${j.room_id}')" title="Desarquivar">↩</button>`;
          else adminBtn=`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askArchive('${j.room_id}')" title="Arquivar">🗄</button>`;
        }
        // linha de horário: "🕐 13:00" + (Hoje/Amanhã) já no título do dia
        const hora=j.ki?`<span style="color:var(--chalk)">🕐 ${j.ki.hh}</span>`:`<span style="color:var(--dim)">horário a definir</span>`;
        listaHTML+=`<div class="roomrow" onclick="${onclick}">
          <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${hora} · ${esc(j.comp)}${j.archived?" · arquivado":""}</div></div>
          ${pill}${adminBtn}
        </div>`;
      });
    });
  }
  // jogos do catálogo ainda NÃO abertos neste grupo (só admin)
  const naoAbertos=APP.jogos.filter(j=>!APP.groupRooms.some(gr=>gr.room_id===j.room_id)&&!isArchived(j.room_id));
  const abrirRows=naoAbertos.map(j=>`<div class="roomrow" onclick="openRoomInGroup('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">toque para abrir neste grupo</div></div>
    <span class="statuspill st-closed">+ ABRIR</span></div>`).join("");
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:var(--amber)">${esc(APP.groupName||"Salas")}</div>
      <div class="userchip" onclick="leaveGroupView()" style="cursor:pointer">⇄ trocar grupo</div>
    </div>
    <p class="p" style="margin-bottom:12px">Jogos deste grupo. Escolha uma partida para montar seu time ou ver o resultado.</p>
    <div style="position:relative;margin-bottom:10px">
      <input id="homeSearchInput" class="input" style="margin:0;padding-left:38px" placeholder="🔍 Buscar partida pelo nome do time…" value="${esc(APP.homeSearch||"")}" oninput="setHomeSearch(this.value)" autocorrect="off" />
      ${q?`<span onclick="setHomeSearch('')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--dim)">✕</span>`:""}
    </div>
    <div class="postabs" style="margin-bottom:8px">
      <div class="ptab${tab==="toplay"?" on":""}" onclick="setHomeTab('toplay')">⚽ A jogar${nToplay?` (${nToplay})`:""}</div>
      <div class="ptab${tab==="finished"?" on":""}" onclick="setHomeTab('finished')">✓ Finalizados${nFinished?` (${nFinished})`:""}</div>
    </div>
    ${diaChips}
    ${listaHTML}
  </div>
  ${roundsCardHTML()}
  ${phasesCardHTML()}
  ${leaguesCardHTML()}
  <div class="card" onclick="go('members')" style="cursor:pointer">
    <div class="rhead" style="padding:0"><div class="nm disp" style="font-size:18px">👥 Membros do grupo</div><div class="tot mono" style="color:var(--dim);font-size:14px">›</div></div>
    <p class="p" style="margin-top:6px">Veja quem está no grupo, o perfil de cada um e o histórico de times que escalaram.</p>
  </div>
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
    rk.forEach((u,i)=>{
      const me=u.username===APP.user?.username;
      const open=APP._openRoundUser===u.username;
      html+=`<div class="rank${me?" me":""}" onclick="toggleRoundUser('${encodeURIComponent(u.username)}')" style="cursor:pointer"><div class="po mono">${i+1}º</div><div class="nm">${esc(u.username)}<small>${u.games} jogo${u.games>1?"s":""} apurado${u.games>1?"s":""} · toque pra ${open?"fechar":"ver time"}</small></div><div class="pt mono">${u.total.toFixed(1)}</div></div>`;
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
  const bLockedNow=boostLocked(); // impulsos revelados só depois do 1º jogo
  html+=`<div class="card"><div class="h2 disp">👥 Quem está disputando</div>`;
  if(mode==="boost")html+=`<p class="p" style="font-size:11px;margin:4px 0 0">${bLockedNow?"Impulsos travados — onde cada um gastou já está revelado.":"⚡ Os impulsos de cada um só aparecem depois que o 1º jogo começar."}</p>`;
  if(!all.length){
    html+=`<p class="p" style="margin-top:6px">Ninguém entrou nesta rodada ainda.</p></div>`;
    return html;
  }
  APP.roundRooms.forEach(rr=>{
    const g=window.GAMES.data[rr.room_id];
    const nome=g?g.prepool.home.name+" × "+g.prepool.away.name:rr.room_id;
    const started=roomTimeLocked(rr.room_id); // jogo começou (ou finalizou) → pode espiar
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
        const tk=parseInt(e.boost,10)||0;
        const showTokens=me||bLockedNow;
        const tkTag=(showTokens&&tk>0)?` · <span style="color:#FFC247">⚡ +${tk*10}%</span>`:(showTokens?"":` · <span style="color:var(--dim)">⚡ ?</span>`);
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


// ----- MINI RODADAS: card na home (só as avulsas, sem phase) -----
function roundRowHTML(r){
  const mm=modeMeta(r);
  const pill=r.status==="open"?'<span class="statuspill st-open">ABERTA</span>':'<span class="statuspill st-closed">FECHADA</span>';
  let metaTxt;
  if(modeOf(r)==="full")metaTxt="joga todos os jogos";
  else if(modeOf(r)==="boost")metaTxt=`todos os jogos · ${r.boost_tokens||0} token(s) de impulso`;
  else metaTxt=`escolha ${r.pick_limit} jogos`;
  return `<div class="roomrow" style="border-left:3px solid ${mm.color}" onclick="enterRound('${r.id}')">
    <div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">${metaTxt}</div></div>
    ${pill}
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenameRound('${r.id}')" title="Editar">✏️</button><button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteRound('${r.id}')">🗑</button>`:""}
  </div>`;
}
function roundsCardHTML(){
  const avulsas=APP.rounds.filter(r=>!r.phase_id);
  if(!avulsas.length&&!isAdmin())return"";
  // agrupar por modo, na ordem select → full → boost
  const order=["select","full","boost"];
  let groupsHTML="";
  for(const mk of order){
    const list=avulsas.filter(r=>modeOf(r)===mk);
    if(!list.length)continue;
    const mm=MODE_META[mk];
    const collapsed=!!APP.collapsedModes[mk];
    groupsHTML+=`<div onclick="toggleModeGroup('${mk}')" style="margin:14px 0 6px;display:flex;align-items:center;gap:8px;cursor:pointer">
      <span style="display:inline-flex;align-items:center;gap:6px;font-family:'Saira Condensed';font-weight:800;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${mm.color};border:1px solid ${mm.color};background:color-mix(in srgb,${mm.color} 14%,transparent);border-radius:99px;padding:4px 12px">${mm.icon} ${mm.label} <span style="font-size:10px;opacity:.8">(${list.length})</span></span>
      <span style="flex:1;height:1px;background:color-mix(in srgb,${mm.color} 30%,transparent)"></span>
      <span style="color:${mm.color};font-size:13px;transform:rotate(${collapsed?"-90deg":"0deg"});transition:transform .15s">▾</span>
    </div>
    ${collapsed?"":`<p class="p" style="font-size:11px;margin-bottom:8px;color:color-mix(in srgb,${mm.color} 70%,var(--dim))">${mm.desc}</p>
    ${list.map(roundRowHTML).join("")}`}`;
  }
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px">MINI RODADAS AVULSAS · ESCOLHA SEUS JOGOS${helpBtn("minirodada")}</div>
    ${groupsHTML||'<p class="p">Nenhuma mini rodada avulsa.</p>'}
    ${isAdmin()?`<button class="btn" style="margin-top:14px" onclick="askCreateRound()">+ Criar mini rodada avulsa</button>`:""}
  </div>`;
}
function askCreateRound(){APP.confirm={mode:"createRound",newMode:"select",label:"Criar mini rodada"};render();}
function setCreateMode(mk){if(APP.confirm){const n=$("rndName");if(n)APP.confirm.draftName=n.value;APP.confirm.newMode=mk;render();}}
function toggleModeGroup(mk){APP.collapsedModes[mk]=!APP.collapsedModes[mk];render();}

// ----- RODADAS (phases) avulsas: card na home -----
function phasesCardHTML(){
  const avulsas=(APP.phases||[]).filter(p=>!p.league_id);
  if(!avulsas.length&&!isAdmin())return"";
  const rows=avulsas.map(p=>`<div class="roomrow" onclick="enterPhase('${p.id}')">
    <div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">rodada · toque pra ver mini rodadas</div></div>
    <span class="statuspill st-finished">VER</span>
    ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenamePhase('${p.id}')" title="Renomear">✏️</button><button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeletePhase('${p.id}')">🗑</button>`:""}
  </div>`).join("");
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--mid)">RODADAS AVULSAS${helpBtn("rodada")}</div>
    <p class="p" style="margin-bottom:10px">Uma rodada (ex: "Fase de Grupos") agrupa várias mini rodadas. Fora de liga.</p>
    ${rows||'<p class="p">Nenhuma rodada avulsa.</p>'}
    ${isAdmin()?`<button class="btn" style="margin-top:10px" onclick="askCreatePhase(null)">+ Criar rodada avulsa</button>`:""}
  </div>`;
}
function askDeletePhase(id){APP.confirm={mode:"deletePhase",phaseId:id,label:"Excluir rodada"};render();}

// ----- LIGAS: card na home -----
function leaguesCardHTML(){
  const rows=(APP.leagues||[]).map(l=>{
    const nPh=(APP.phases||[]).filter(p=>p.league_id===l.id).length;
    return `<div class="roomrow" onclick="enterLeague('${l.id}')">
      <div class="info"><div class="nm">🏆 ${esc(l.name)}</div><div class="meta">${nPh} rodada${nPh!==1?"s":""} · classificação geral</div></div>
      <span class="statuspill st-finished">VER</span>
      ${isAdmin()?`<button class="cbtn" style="position:static;width:30px;height:30px;margin-left:8px;color:var(--blue);border-color:var(--blue)" onclick="event.stopPropagation();askRenameLeague('${l.id}')" title="Renomear">✏️</button><button class="cbtn" style="position:static;width:30px;height:30px;margin-left:6px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();askDeleteLeague('${l.id}')">🗑</button>`:""}
    </div>`;
  }).join("");
  if(!(APP.leagues||[]).length&&!isAdmin())return"";
  return `<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--amber)">LIGAS · TEMPORADA${helpBtn("liga")}</div>
    <p class="p" style="margin-bottom:10px">Uma liga junta várias rodadas numa classificação geral. Dois rankings: pontos de tabela (10/7/5/3/1 por colocação) e pontuação clássica acumulada.</p>
    ${rows||'<p class="p">Nenhuma liga ainda.</p>'}
    ${isAdmin()?`<button class="btn" style="margin-top:10px" onclick="askCreateLeague()">+ Criar liga</button>`:""}
  </div>`;
}
function askCreateLeague(){APP.confirm={mode:"createLeague",label:"Criar liga"};render();}
function askDeleteLeague(id){APP.confirm={mode:"deleteLeague",leagueId:id,label:"Excluir liga"};render();}
// ----- LIGAS: tela de uma liga -----
function leagueHTML(){
  const l=APP.league;
  if(!l)return `<div class="card"><div class="loading">Carregando liga…</div></div>`;
  const st=APP.leagueStanding;
  const tab=APP.leagueTab||"table";
  const phases=APP.leaguePhases||[];
  const fora=(APP.phases||[]).filter(p=>!p.league_id);
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">🏆 ${esc(l.name)}</div>
      <div class="userchip" onclick="leaveLeague()" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">${phases.length} rodada${phases.length!==1?"s":""} nesta liga.</p>
  </div>`;
  html+=standingCardHTML(st,tab,"setLeagueTab","liga");
  // rodadas (phases) da liga
  html+=`<div class="card"><div class="h2 disp">Rodadas desta liga</div>`;
  if(!phases.length)html+=`<p class="p" style="margin-top:6px">Nenhuma rodada vinculada ainda.</p>`;
  else phases.forEach(p=>{
    const nMini=(APP.phases===phases?0:0); // placeholder
    html+=`<div class="roomrow" onclick="enterPhase('${p.id}')"><div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">toque pra ver as mini rodadas</div></div><span class="statuspill st-finished">VER</span></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreatePhase('${l.id}')">+ Criar rodada nesta liga</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Rodadas avulsas (sem liga) — toque pra adicionar:</p>`;
      fora.forEach(p=>{html+=`<div class="roomrow" onclick="addPhaseToLeague('${p.id}')"><div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">adicionar a esta liga</div></div><span class="statuspill st-closed">+ ADD</span></div>`;});
    }
    html+=`</div>`;
  }
  html+=`<button class="btn ghost" onclick="leaveLeague()">← Voltar</button>`;
  return html;
}
// tela de uma RODADA (phase): classificação + suas mini rodadas
function phaseHTML(){
  const ph=APP.phase;
  if(!ph)return `<div class="card"><div class="loading">Carregando rodada…</div></div>`;
  const st=APP.phaseStanding;
  const tab=APP.phaseTab||"table";
  const minis=APP.phaseRounds||[];
  const fora=(APP.rounds||[]).filter(r=>!r.phase_id);
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">${esc(ph.name)}</div>
      <div class="userchip" onclick="${ph.league_id?`enterLeague('${ph.league_id}')`:"go('home')"}" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">${minis.length} mini rodada${minis.length!==1?"s":""} nesta rodada.</p>
  </div>`;
  html+=standingCardHTML(st,tab,"setPhaseTab","rodada");
  // mini rodadas (rounds) desta phase
  html+=`<div class="card"><div class="h2 disp">Mini rodadas</div>`;
  if(!minis.length)html+=`<p class="p" style="margin-top:6px">Nenhuma mini rodada ainda.</p>`;
  else minis.forEach(r=>{
    html+=`<div class="roomrow" onclick="enterRound('${r.id}')"><div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">escolha ${r.pick_limit} jogos</div></div><span class="statuspill ${r.status==="open"?"st-open":"st-closed"}">${r.status==="open"?"ABERTA":"FECHADA"}</span></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · MINI RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreateRoundInPhase('${ph.id}')">+ Criar mini rodada aqui</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Mini rodadas avulsas — toque pra adicionar:</p>`;
      fora.forEach(r=>{html+=`<div class="roomrow" onclick="addRoundToPhase('${r.id}')"><div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">adicionar a esta rodada</div></div><span class="statuspill st-closed">+ ADD</span></div>`;});
    }
    html+=`</div>`;
  }
  html+=`<button class="btn ghost" onclick="${ph.league_id?`enterLeague('${ph.league_id}')`:"go('home')"}">← Voltar</button>`;
  return html;
}
// card de classificação reutilizável (liga ou phase)
function standingCardHTML(st,tab,tabFn,nivel){
  let html=`<div class="card"><div class="postabs" style="margin-bottom:12px">
    <div class="ptab${tab==="table"?" on":""}" onclick="${tabFn}('table')">🏁 Pontos de tabela</div>
    <div class="ptab${tab==="classic"?" on":""}" onclick="${tabFn}('classic')">📊 Pontuação clássica</div>
  </div>`;
  if(!st){html+=`<div class="loading">Calculando…</div></div>`;return html;}
  if(!st.length){
    html+=`<p class="p">⏳ Ainda não há resultados. A classificação da ${nivel} aparece conforme as mini rodadas forem apuradas.</p></div>`;
    return html;
  }
  const sorted=[...st].sort((a,b)=>tab==="table"?(b.table-a.table||b.classic-a.classic):(b.classic-a.classic));
  html+=`<p class="p" style="margin-bottom:10px">${tab==="table"?"Soma dos pontos de tabela (colocação em cada mini rodada).":"Soma da pontuação de fantasy em todas as mini rodadas."}</p>`;
  sorted.forEach((u,i)=>{
    const me=u.username===APP.user?.username;
    const val=tab==="table"?u.table:u.classic.toFixed(1);
    const sub=tab==="table"?`${u.classic.toFixed(1)} pts clássicos · ${u.roundsPlayed} mini`:`${u.table} pts de tabela · ${u.roundsPlayed} mini`;
    html+=`<div class="rank${me?" me":""}"><div class="po mono">${i+1}º</div><div class="nm">${esc(u.username)}<small>${sub}</small></div><div class="pt mono">${val}</div></div>`;
  });
  html+=`</div>`;
  return html;
}
function setLeagueTab(t){APP.leagueTab=t;render();}
function setPhaseTab(t){APP.phaseTab=t;render();}
function askCreatePhase(leagueId){APP.confirm={mode:"createPhase",leagueId,label:"Criar rodada"};render();}
function askCreateRoundInPhase(phaseId){APP.confirm={mode:"createRound",newMode:"select",phaseId,label:"Criar mini rodada"};render();}
async function addPhaseToLeague(phaseId){
  if(!isAdmin())return;
  try{await sbUpdate("phases",{league_id:APP.leagueId},`id=eq.${phaseId}`);await loadPhases();await loadLeague(APP.leagueId);toast("Rodada adicionada à liga.");render();}
  catch(e){toast("Erro: "+e.message);}
}
async function addRoundToPhase(roundId){
  if(!isAdmin())return;
  try{await sbUpdate("rounds",{phase_id:APP.phaseId},`id=eq.${roundId}`);await loadRounds();await loadPhase(APP.phaseId);toast("Mini rodada adicionada à rodada.");render();}
  catch(e){toast("Erro: "+e.message);}
}

// ----- RODADAS: tela de uma rodada -----
function roundHTML(){
  const r=APP.round;
  if(!r)return `<div class="card"><p class="p">Rodada não encontrada.</p><button class="btn ghost" onclick="leaveRound()">← Voltar</button></div>`;
  const mode=modeOf(r);
  const mm=modeMeta(r);
  const isSelect=mode==="select";
  const isBoost=mode==="boost";
  const left=picksLeft(), used=picksUsed();
  const selLocked=picksLocked(); // seleção de jogos fechada pelo dev
  const bLocked=boostLocked();
  const jogos=APP.roundRooms.map(rr=>APP.jogos.find(j=>j.room_id===rr.room_id)).filter(Boolean);
  const rows=jogos.map(j=>{
    const rid=j.room_id;
    const g=window.GAMES.data[rid];
    const finished=g&&g.match&&g.match.status==="finished";
    // agora TODOS os modos deixam montar todos os jogos
    const picked=true;
    const team=hasTeam(rid);
    const locked2=isConfirmed(rid); // travado (vale) no modo select
    const timeLocked=roomTimeLocked(rid);
    const adminLocked=roomAdminLocked(rid);
    const locked=timeLocked||adminLocked;
    let tag,meta,clickable=true;
    if(finished){tag='<span class="statuspill st-finished">VER RESULTADO</span>';meta="jogo encerrado · toque p/ ver";}
    else if(isSelect){
      if(locked2){tag='<span class="statuspill st-open">🔒 VALE ✓</span>';meta="travado — este jogo conta · toque p/ ajustar o time";}
      else if(timeLocked){tag='<span class="statuspill st-closed">🔒 EM JOGO</span>';meta="o jogo começou · escalação travada";}
      else if(team){tag='<span class="statuspill st-finished">MONTADO</span>';meta="time pronto · trave se quiser que ele conte";}
      else{tag='<span class="statuspill st-open">DISPONÍVEL</span>';meta="toque p/ montar o time deste jogo";}
    }
    else if(timeLocked){tag='<span class="statuspill st-closed">🔒 EM JOGO</span>';meta="o jogo começou · escalação travada · toque p/ ver";}
    else if(adminLocked){tag='<span class="statuspill st-closed">🔒 TRAVADO</span>';meta="escalação travada pelo admin · toque p/ ver";}
    else if(team){tag='<span class="statuspill st-open">ESCALADO</span>';meta="vaga garantida · toque p/ ajustar (livre até o jogo começar)";}
    else{tag='<span class="statuspill st-finished">MONTAR TIME</span>';meta="toque p/ escalar este jogo";}
    // ação principal modo select: travar/destravar o jogo (define quais valem)
    let playerBtn="";
    if(isSelect&&!finished&&!timeLocked&&!selLocked&&team){
      if(locked2){
        playerBtn=`<span class="statuspill" style="background:transparent;border:1px solid var(--red);color:var(--red);cursor:pointer" title="Destravar (enquanto a seleção está aberta)" onclick="event.stopPropagation();toggleSelectLock('${rid}')">DESTRAVAR</span>`;
      }else if(left>0){
        playerBtn=`<span class="statuspill" style="background:var(--amber);color:#0A0E1C;cursor:pointer" title="Travar — este jogo vai contar" onclick="event.stopPropagation();toggleSelectLock('${rid}')">TRAVAR</span>`;
      }
    }
    // controle de IMPULSO (modo boost): +/− tokens, enquanto não travou e o time foi montado
    let boostCtrl="";
    if(isBoost&&!finished){
      const bn=boostOn(rid);
      if(bLocked){
        boostCtrl=bn>0?`<span class="statuspill" style="background:color-mix(in srgb,${mm.color} 20%,transparent);color:${mm.color}">⚡ +${bn*10}%</span>`:"";
      }else if(team){
        boostCtrl=`<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Tirar 1 token" onclick="event.stopPropagation();changeBoost('${rid}',-1)">−</button>
          <span style="min-width:46px;text-align:center;font-weight:800;color:${mm.color};font-size:13px">⚡${bn>0?` +${bn*10}%`:" 0"}</span>
          <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Pôr 1 token (+10%)" onclick="event.stopPropagation();changeBoost('${rid}',1)">+</button>
        </div>`;
      }else{
        boostCtrl=`<span class="statuspill st-finished" style="opacity:.7">escale p/ impulsionar</span>`;
      }
    }
    // bloco de admin (separado, com divisória sutil)
    let devBlock="";
    if(isAdmin()){
      const devLocked=adminLocked;
      const lockBtn=timeLocked
        ? `<span style="font-size:19px;padding:4px;opacity:.3" title="O jogo já começou — escalação travada pelo horário">🔒</span>`
        : `<span onclick="event.stopPropagation();setRoundRoomStatus('${rid}','${devLocked?"open":"locked"}')" style="cursor:pointer;font-size:19px;padding:4px;opacity:${devLocked?"1":".6"}" title="${devLocked?"Destravar escalação (liberar p/ todos)":"Travar escalação (p/ todos)"}">${devLocked?"🔓":"🔒"}</span>`;
      devBlock=`<div style="display:flex;gap:14px;align-items:center;margin-left:10px;padding-left:10px;border-left:1px solid var(--line);flex-shrink:0">
        ${lockBtn}
        <span onclick="event.stopPropagation();delRoomFromRound('${rid}')" style="cursor:pointer;font-size:17px;padding:4px;opacity:.45" title="Remover jogo da mini rodada">🗑</span>
      </div>`;
    }
    return `<div class="roomrow" ${clickable||finished?`onclick="askEnterRoundGame('${rid}')"`:""} style="border-left:3px solid ${mm.color};${clickable||finished?"":"cursor:default"}">
      <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${meta}</div></div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">${tag}${playerBtn||""}${boostCtrl}${devBlock}</div>
    </div>`;
  }).join("");
  const fora=APP.jogos.filter(j=>!APP.roundRooms.some(rr=>rr.room_id===j.room_id)&&!isArchived(j.room_id));
  const foraRows=fora.map(j=>`<div class="roomrow" onclick="addRoomToRound('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">toque para adicionar à mini rodada</div></div>
    <span class="statuspill st-closed">+ ADD</span></div>`).join("");
  // banner explicativo por modo
  let banner;
  if(isBoost){
    const cap=r.boost_tokens||0;
    const bConf=boostConfirmed();
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Impulso.</b> Escale TODOS os jogos. Você tem <b>${cap}</b> token(s) de impulso — cada um dá <b>+10%</b> nos pontos da partida onde for usado (pode empilhar vários no mesmo jogo). ${bLocked?"<b>Impulsos travados</b> (o 1º jogo começou).":`Restam <b>${boostLeft()}/${cap}</b>. Travam quando o 1º jogo começar.`}</div>
      ${!bLocked?`<button class="btn ${bConf?"ghost":""}" style="margin:0 0 12px;${bConf?"border-color:var(--green);color:var(--green)":"background:#FFC247;color:#0A0E1C"}" onclick="toggleBoostConfirm()">${bConf?"✓ Impulsos confirmados — toque p/ reabrir":"🔒 Confirmar distribuição de impulsos"}</button>`:""}`;
  }else if(mode==="full"){
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Completo.</b> Escale TODOS os jogos da rodada. Sua pontuação é a soma de todos. Cada escalação trava quando aquela partida começar.</div>`;
  }else{
    banner=selLocked
      ? `<div class="prebox" style="border-color:#3a2e10">🔒 <b>Seleção fechada.</b> Os jogos que você travou estão valendo. A escalação de cada um ainda pode mudar até a partida começar.</div>`
      : `<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Selecione.</b> Monte o time de quantos jogos quiser, mas só <b>${r.pick_limit}</b> vão contar: <b>trave (🔒)</b> os que você quer que valham. Dá pra destravar e trocar enquanto a seleção estiver aberta. <b>${used}/${r.pick_limit}</b> travados. A escalação dos travados ainda muda até o jogo começar.</div>`;
  }
  // alerta vermelho: modo select, seleção aberta, e o usuário travou MENOS que o limite
  let selWarn="";
  if(isSelect&&!selLocked&&used<r.pick_limit){
    const faltam=r.pick_limit-used;
    selWarn=`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 12%,transparent);color:var(--red);margin-top:-2px">⚠️ <b>Atenção:</b> você travou <b>${used}</b> de <b>${r.pick_limit}</b> jogos. ${faltam===1?"Falta travar <b>1</b> jogo":`Faltam travar <b>${faltam}</b> jogos`} pra usar todos os seus tokens. Jogos <b>não travados não pontuam</b> — trave (🔒) antes da seleção fechar!</div>`;
  }
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:${mm.color}">${esc(r.name)}</div>
      <div class="userchip" onclick="leaveRound()" style="cursor:pointer">← voltar</div>
    </div>
    <div style="margin-bottom:10px"><span style="display:inline-flex;align-items:center;gap:5px;font-family:'Saira Condensed';font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${mm.color};border:1px solid ${mm.color};background:color-mix(in srgb,${mm.color} 14%,transparent);border-radius:99px;padding:3px 10px">${mm.icon} ${mm.label}</span></div>
    ${banner}
    ${selWarn}
    ${rows||'<p class="p">Nenhum jogo nesta rodada ainda.</p>'}
  </div>
  ${roundRankingHTML()}
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px">ADMIN · RODADA</div>
    <p class="p" style="margin-bottom:8px">${isSelect?"1) Antes da 1ª partida, feche a <b>seleção de jogos</b>. 2) Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha).":"Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha). "+(isBoost?"Os impulsos travam sozinhos no 1º jogo.":"")}</p>
    ${isSelect?(selLocked
      ? `<button class="btn ghost" onclick="setRoundStatus('open')">🔓 Reabrir seleção de jogos</button>`
      : `<button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setRoundStatus('locked_picks')">🔒 Fechar seleção de jogos</button>`):""}
    ${isBoost?`<div style="margin-top:10px">
      ${APP.round.boost_reopened===true
        ? `<button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="toggleBoostReopen()">🔒 Fechar impulsos novamente</button>
           <p class="p" style="font-size:11px;color:var(--amber);margin-top:6px">⚠️ Impulsos reabertos — todos conseguem reeditar mesmo com jogo em andamento.</p>`
        : `<button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="toggleBoostReopen()">⚡ Reabrir distribuição de impulsos</button>
           <p class="p" style="font-size:11px;color:var(--dim);margin-top:6px">⚠️ Cuidado: reabrir após um jogo começar permite remanejar tokens vendo como a partida está indo. Use só se combinado com o grupo.</p>`}
    </div>`:""}
    ${fora.length?`<div class="tag" style="margin:14px 0 6px">ADICIONAR JOGOS À MINI RODADA</div>${foraRows}`:""}
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
      ${!open&&!finished&&hasEntry()?`<button class="btn" onclick="go('build')">👀 Ver meu time escalado</button>`:""}
      ${finished?`<button class="btn" onclick="go('result')">Ver ranking & resultado</button>`:""}
    </div>
    ${(!open&&!finished)||(roomTimeLocked(APP.roomId)&&!finished)?peekTeamsHTML():""}
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
// ── ESPIAR TIMES DOS MEMBROS (só com pool fechada e jogo não finalizado) ──
let _openPeek={};
function togglePeek(i){_openPeek[i]=!_openPeek[i];render();}
function peekTeamsHTML(){
  const ents=(APP.entries||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean));
  const byId=APP._byId;
  const TAC=window.ENGINE_TACTICS;
  let html=`<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
    <div class="h2 disp">👀 Times dos membros</div>
    <p class="p" style="margin:6px 0 10px">A pool fechou — agora dá pra ver o que cada um escalou. As pontuações aparecem quando o jogo acabar.</p>`;
  if(!ents.length){html+=`<p class="p">Ninguém montou time neste jogo.</p></div>`;return html;}
  ents.forEach((e,i)=>{
    const open=_openPeek[i];
    const isMe=e.username===APP.user?.username;
    html+=`<div class="receipt"><div class="rhead" onclick="togglePeek(${i})">
      <div class="nm">${esc(e.username)}${isMe?" <small>(você)</small>":""}<small>cap ${SLOT_LABEL[e.captain]||"?"} · ${TAC[e.tactic]?.name||e.tactic||"—"}</small></div>
      <div class="tot mono" style="color:var(--dim);font-size:14px">${open?"▲":"▼"}</div></div>`;
    if(open){
      html+=`<div class="rbody">`;
      ["GK","DEF","MID","ATT","FLEX","BENCH"].forEach(sl=>{
        const pid=e.slots[sl];const pl=pid?byId[pid]:null;
        if(!pl){html+=`<div class="line" style="padding:5px 0"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[sl]}</b> <span style="color:#46537a">—</span></span></div>`;return;}
        const isCap=e.captain===sl;
        const posKey=sl==="BENCH"?pl.pos:sl;
        html+=`<div class="line" style="padding:5px 0"><span><b class="pc-${posKey}" style="font-size:9px">${SLOT_LABEL[sl]}</b> ${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</span></div>`;
      });
      html+=`</div>`;
    }
    html+=`</div>`;
  });
  html+=`</div>`;
  return html;
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
  if(c.mode==="replicate"){
    const pp=APP.prepool;
    const nome=pp?`${esc(pp.home.name)} × ${esc(pp.away.name)}`:"este jogo";
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--green)">Repor escalação</div>
      <p class="p" style="margin:10px 0">Tem certeza que quer <b style="color:var(--chalk)">repor as ${c.count} outra(s) aparição(ões)</b> de <b style="color:var(--chalk)">${nome}</b> com a escalação que você montou agora?</p>
      <p class="p" style="margin-bottom:12px;font-size:11px">Isso <b>sobrescreve</b> o time que você tinha montado pra este mesmo jogo nos outros modos/rodadas. As que já travaram não são afetadas.</p>
      <button class="btn" style="margin-top:4px;background:var(--green);color:#06231a" onclick="applyLineupEverywhere()">Sim, repor as ${c.count}</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createRound"){
    const poolMax=(APP.jogos||[]).length;
    const defLimit=Math.min(3,poolMax||3);
    const selMode=c.newMode||"select";
    const modeBtns=["select","full","boost"].map(mk=>{
      const mm=MODE_META[mk],on=selMode===mk;
      return `<div onclick="setCreateMode('${mk}')" style="flex:1;cursor:pointer;text-align:center;padding:9px 4px;border-radius:9px;border:1px solid ${on?mm.color:"var(--line)"};background:${on?`color-mix(in srgb,${mm.color} 18%,transparent)`:"var(--panel2)"};color:${on?mm.color:"var(--dim)"};font-size:11px;font-weight:700">${mm.icon} ${mm.label}</div>`;
    }).join("");
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar mini rodada</div>
      <p class="p" style="margin:8px 0">Escolha o modo:</p>
      <div style="display:flex;gap:6px;margin-bottom:8px">${modeBtns}</div>
      <p class="p" style="font-size:11px;margin-bottom:10px;color:${MODE_META[selMode].color}">${MODE_META[selMode].desc}</p>
      <input id="rndName" class="input" placeholder="Nome (ex: Jogos de 18/06)" autocorrect="off" value="${esc(c.draftName||"")}" oninput="APP.confirm.draftName=this.value" />
      ${selMode==="select"?`<input id="rndLimit" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} placeholder="Quantos jogos escolher (ex: 3)" value="${defLimit}" />${poolMax?`<p class="p" style="font-size:11px;margin-bottom:8px">Há <b style="color:var(--amber)">${poolMax}</b> jogo(s) no catálogo (máximo).</p>`:""}`:""}
      ${selMode==="boost"?`<input id="rndTokens" class="input" type="number" inputmode="numeric" min="1" placeholder="Quantos tokens de impulso (ex: 2)" value="2" /><p class="p" style="font-size:11px;margin-bottom:8px">Cada token = +10% nos pontos da partida escolhida. Empilhável.</p>`:""}
      ${selMode==="full"?`<p class="p" style="font-size:11px;margin-bottom:8px">No modo COMPLETO o jogador escala todos os jogos da rodada — não há limite de escolha.</p>`:""}
      <button class="btn" style="margin-top:4px" onclick="submitCreateRound()">Criar mini rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="rename"){
    const isRound=c.kind==="round";
    const poolMax=(APP.jogos||[]).length;
    let extra="";
    if(isRound&&c.roundMode==="select"){
      extra=`<p class="p" style="font-size:11px;margin-bottom:4px">Quantos jogos cada um escolhe:</p><input id="renamePick" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} value="${c.pickLimit||3}" />`;
    }else if(isRound&&c.roundMode==="boost"){
      extra=`<p class="p" style="font-size:11px;margin-bottom:4px">Tokens de impulso por jogador (+10% cada):</p><input id="renameTokens" class="input" type="number" inputmode="numeric" min="1" value="${c.boostTokens||2}" />`;
    }
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">${c.kind==="league"?"Renomear liga":c.kind==="phase"?"Renomear rodada":"Editar mini rodada"}</div>
      <p class="p" style="margin:10px 0">${isRound?"Edite o nome e os ajustes. Os times, pontos e vínculos continuam intactos.":"Escolha o novo nome. Os times, pontos e vínculos continuam intactos."}</p>
      <input id="renameInput" class="input" value="${esc(c.cur||"")}" autocorrect="off" />
      ${extra}
      <button class="btn" style="margin-top:4px" onclick="submitRename()">Salvar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createPhase"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar rodada</div>
      <p class="p" style="margin:10px 0">Uma rodada (ex: "Fase de Grupos") agrupa várias mini rodadas. Você cria as mini rodadas depois, dentro dela.</p>
      <input id="phName" class="input" placeholder="Nome (ex: Fase de Grupos)" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreatePhase()">Criar rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createLeague"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar liga</div>
      <p class="p" style="margin:10px 0">Uma liga agrupa várias rodadas numa classificação geral (pontos de tabela + pontuação clássica). Você adiciona as rodadas depois, dentro da liga.</p>
      <input id="lgName" class="input" placeholder="Nome (ex: Liga Copa 2026)" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreateLeague()">Criar liga</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="deletePhase"){
    const p=(APP.phases||[]).find(x=>x.id===c.phaseId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir rodada</div>
      <p class="p" style="margin:10px 0">Excluir <b style="color:var(--chalk)">${esc(p?p.name:"")}</b>? As mini rodadas dela <b>não</b> são apagadas — voltam a ser avulsas. Times e pontuações continuam intactos.</p>
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="closeConfirm();deletePhase('${c.phaseId}')">🗑 Excluir rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="deleteLeague"){
    const l=(APP.leagues||[]).find(x=>x.id===c.leagueId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir liga</div>
      <p class="p" style="margin:10px 0">Excluir <b style="color:var(--chalk)">${esc(l?l.name:"")}</b>? As rodadas dela <b>não</b> são apagadas — apenas voltam a ser avulsas. Os times e pontuações continuam intactos.</p>
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="closeConfirm();deleteLeague('${c.leagueId}')">🗑 Excluir liga</button>
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
  const c=APP.confirm||{};
  const mk=c.newMode||"select";
  const n=$("rndName");
  const name=(n?n.value:(c.draftName||"")).trim();
  const poolMax=(APP.jogos||[]).length;
  if(!name){toast("Dê um nome à mini rodada.");return;}
  let limit=poolMax||999, tokens=0;
  if(mk==="select"){
    const l=$("rndLimit");limit=l?parseInt(l.value,10):3;
    if(!limit||limit<1)limit=1;
    if(poolMax>0&&limit>poolMax){toast("Só há "+poolMax+" jogo(s) no catálogo. Escolha no máximo "+poolMax+".");return;}
  }else if(mk==="full"){
    limit=poolMax||999; // completo = todos
  }else if(mk==="boost"){
    limit=poolMax||999; // impulso = escala todos
    const t=$("rndTokens");tokens=t?parseInt(t.value,10):2;
    if(!tokens||tokens<1)tokens=1;
  }
  const phaseId=c.phaseId||null;
  APP.confirm=null;createRound(name,limit,phaseId,mk,tokens).catch(e=>toast("Erro: "+e.message));
}
function submitCreatePhase(){
  const n=$("phName");
  const name=n?n.value.trim():"";
  if(!name){toast("Dê um nome à rodada.");return;}
  const leagueId=APP.confirm&&APP.confirm.leagueId?APP.confirm.leagueId:null;
  APP.confirm=null;createPhase(name,leagueId).catch(e=>toast("Erro: "+e.message));
}
function submitCreateLeague(){
  const n=$("lgName");
  const name=n?n.value.trim():"";
  if(!name){toast("Dê um nome à liga.");return;}
  APP.confirm=null;createLeague(name).catch(e=>toast("Erro: "+e.message));
}
async function deleteLeague(id){
  if(!isAdmin())return;
  try{
    await sbUpdate("phases",{league_id:null},`league_id=eq.${id}`);
    await sbDelete("leagues",`id=eq.${id}`);
    await loadPhases();await loadLeagues();
    APP.leagueId=null;APP.league=null;APP.view="home";
    toast("Liga excluída. As rodadas voltaram a ser avulsas.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
async function deletePhase(id){
  if(!isAdmin())return;
  try{
    await sbUpdate("rounds",{phase_id:null},`phase_id=eq.${id}`);
    await sbDelete("phases",`id=eq.${id}`);
    await loadRounds();await loadPhases();
    APP.phaseId=null;APP.phase=null;APP.view="home";
    toast("Rodada excluída. As mini rodadas voltaram a ser avulsas.");
    render();
  }catch(e){toast("Erro: "+e.message);}
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
  const poolClosedOutOfRound = !inRound && APP.roomMeta && APP.roomMeta.status!=="open" && !(APP.match&&APP.match.status==="finished");
  const gameLocked=(inRound&&roomLockedInRound(APP.roomId)) || poolClosedOutOfRound;
  const filt=pp.players.filter(p=>
    (APP.tabTeam==="ALL"||p.team===APP.tabTeam) &&
    (APP.tabPos==="ALL"||p.pos===APP.tabPos)
  ).sort((a,b)=>b.price-a.price);
  const ready=Object.values(s).every(Boolean)&&APP.captain&&APP.tactic&&!gameLocked;
  const hasSomeFilled=Object.values(s).some(Boolean);
  const canReplicate=hasSomeFilled&&!gameLocked;
  const slotsHTML=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>{
    const pid=s[sl],pl=pid?byId[pid]:null;
    const posKey=sl==="BENCH"&&pl?pl.pos:sl; // banco herda a cor da posição real do jogador
    return `<div class="slot${pl?` filled s-${posKey}`:" empty"}${pl&&APP.captain===sl?" cap":""}" onclick="${pl?`clearSlot('${sl}')`:""}">
      <div class="lab"><span class="pc-${posKey}">${SLOT_LABEL[sl]}</span>${sl==="FLEX"?" ·DEF/MEI/ATA":""}</div>
      <div class="nm">${pl?esc(pl.name):"toque num jogador"}</div>
      ${pl?`<div class="pr mono"><span class="teamtag" style="--tc:${teamColor(pl.team)}">${pl.team}</span> · ${pl.price}</div>`:""}
      ${pl&&sl!=="BENCH"?`<button class="cbtn${APP.captain===sl?" on":""}" onclick="event.stopPropagation();toggleCap('${sl}')">C</button>`:""}
    </div>`;}).join("");
  // rótulos legíveis pras ações de buff/nerf das táticas
  const TACT_LABEL={goal:"gols",sotPts:"chutes/gols",assist:"assistências",sca:"criação",gca:"jogada do gol",
    dribbles:"dribles",prgp:"passes progressivos",pib:"passes na área",tib:"toques na área",
    tklint:"desarmes",block:"bloqueios",recovery:"recuperações",aerial:"duelos aéreos",clearance:"cortes",
    accCross:"cruzamentos",fouls:"faltas"};
  // cor-tema por tática (casa com as variáveis --tac-* do CSS)
  const TACT_COLOR={muralha:"var(--tac-muralha)",pressaototal:"var(--tac-pressaototal)",cerebro:"var(--tac-cerebro)",tridente:"var(--tac-tridente)",aereo:"var(--tac-aereo)",contra:"var(--tac-contra)"};
  function tactEffectHTML(t){
    const fam=(t.fam||[]).map(k=>TACT_LABEL[k]||k);
    const uniq=[...new Set(fam)];
    return `<div class="teff"><div class="up">▲ completa = bônus</div><div class="down">▼ incompleta = ônus menor</div><div class="foco">foco em <b>${uniq.join(", ")}</b></div></div>`;
  }
  const tactsHTML=Object.entries(TAC).map(([k,t])=>{const tc=TACT_COLOR[k]||"var(--amber)";return `<div class="tact${APP.tactic===k?" on":""}" style="--tac:${tc}" onclick="setTactic('${k}')"><div class="ttop"></div><div class="tn">${t.name}</div><div class="td">${t.desc}</div>${tactEffectHTML(t)}</div>`;}).join("");
  // ── FILTROS COMBINÁVEIS: uma fileira de TIME + uma de POSIÇÃO (aplicam juntos) ──
  const teamTabs=["ALL",pp.home.code,pp.away.code];
  const teamTabsHTML=teamTabs.map(t=>{
    const on=APP.tabTeam===t;const isTeam=t!=="ALL";
    let style="";
    if(on&&isTeam)style=`style="--tc:${teamColor(t)};border-color:${teamColor(t)};color:${teamColor(t)};background:color-mix(in srgb,${teamColor(t)} 14%,transparent)"`;
    return `<div class="ptab${on?" on":""}" ${style} onclick="setTabTeam('${t}')">${t==="ALL"?"TODOS":t}</div>`;
  }).join("");
  const posTabs=["ALL","GK","DEF","MID","ATT"];
  const posTabsHTML=posTabs.map(t=>{
    const on=APP.tabPos===t;const isPos=t!=="ALL";
    let style="";
    if(on&&isPos)style=`style="border-color:var(--pos-${t});color:var(--pos-${t});background:color-mix(in srgb,var(--pos-${t}) 14%,transparent)"`;
    return `<div class="ptab${on?" on":""}" ${style} onclick="setTabPos('${t}')">${t==="ALL"?"TODAS":SLOT_LABEL[t]}</div>`;
  }).join("");
  const tabsHTML=`<div class="postabs">${teamTabsHTML}</div><div class="postabs">${posTabsHTML}</div>`;
  const poolHTML=filt.map(p=>{const sel=used.includes(p.id);const dis=!sel&&left-p.price<0;return `<div class="prow${sel?" sel":""}${dis?" dis":""}" onclick="${dis?"":`place(${p.id})`}"><div class="posbar pb-${p.pos}"></div><div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div><div class="nm">${esc(p.name)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${p.team}</span>${p.age?` <span class="age">${p.age}a</span>`:""}</div><div class="pr mono">${p.price}</div></div>`;}).join("");
  // ── MODO TORCIDA: jogo travado mas não finalizado → mostra resumo limpo do time escalado ──
  if(gameLocked){
    const tac=TAC[APP.tactic];
    const lineRow=(sl)=>{
      const pid=s[sl],pl=pid?byId[pid]:null;
      if(!pl)return"";
      const isCap=APP.captain===sl;
      const posKey=sl==="BENCH"&&pl?pl.pos:sl;
      return `<div class="prow" style="cursor:default"><div class="posbar pb-${posKey}"></div><div class="pos mono pc-${posKey}">${SLOT_LABEL[sl]}</div><div class="nm">${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</div><div class="pr mono" style="color:var(--dim)">${pl.price}</div></div>`;
    };
    return `<div class="scorebar"><div class="tag">${esc(pp.comp)} · ⚽ EM ANDAMENTO</div>
      <div class="score disp"><div><div class="team">${esc(pp.home.name)}</div></div><div class="vs mono">×</div><div style="text-align:right"><div class="team">${esc(pp.away.name)}</div></div></div></div>
    <div class="card">
      <div class="prebox" style="border-color:#143a2a;background:#0c1f17;color:var(--green)">🔒 Time confirmado e travado. Boa sorte — agora é torcer! Você verá a pontuação quando a partida acabar.</div>
      <div class="h2 disp" style="margin-top:6px">Seu time escalado</div>
      <div class="pool" style="max-height:none;margin-top:8px">${["GK","DEF","MID","ATT","FLEX","BENCH"].map(lineRow).join("")}</div>
      <div class="bsub">⚔️ Sua tática</div>
      ${tac?`<div class="tact on" style="min-width:0;--tac:${TACT_COLOR[APP.tactic]||"var(--amber)"}"><div class="ttop"></div>${`<div class="tn">${tac.name}</div><div class="td">${tac.desc}</div>${tactEffectHTML(tac)}`}</div>`:`<p class="p">—</p>`}
      <div class="line" style="margin-top:10px"><span>Capitão (pontos ×1,20)${helpBtn("capitao")}</span><span class="v">${APP.captain?esc(byId[s[APP.captain]]?.name||SLOT_LABEL[APP.captain]):"—"}</span></div>
      <button class="btn ghost" style="margin-top:12px" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('room')"}">← Voltar</button>
    </div>`;
  }
  return `<div class="card">
    <div class="budget"><div class="h2 disp">Seu time${helpBtn("slots")}</div><div><span class="tag">RESTANTE${helpBtn("orcamento")} </span><span class="val mono">${left}</span><span class="tag"> /100</span></div></div>
    <div class="slots">${slotsHTML}</div>
    <div class="tag" style="margin-bottom:4px">ESCOLHA 1 TÁTICA${helpBtn("tatica")}</div>
    <p class="p" style="font-size:11px;margin-bottom:8px;line-height:1.5">Cada tática <b style="color:var(--green)">▲ melhora</b> certas ações e <b style="color:var(--red)">▼ enfraquece</b> outras. Ela só <b>ativa</b> se, no fim do jogo, seu time estiver entre os melhores na ação dela — então monte o time pensando na tática.</p>
    <div class="tacts">${tactsHTML}</div>
  </div>
  <div class="card">
    <div class="h2 disp">Pool <span class="tag">· ${pp.players.length} JOGADORES</span>${helpBtn("pool")}</div>
    ${tabsHTML}
    <div class="pool">${poolHTML}</div>
    ${APP.warn?`<div class="warn">${APP.warn}</div>`:""}
    ${!gameLocked&&inRound&&APP.avulsaLineup?`<button class="btn ghost" style="margin-top:12px;border-color:var(--blue);color:var(--blue)" onclick="copyLineupFromOther()">📋 Copiar escalação da partida solta</button>`:""}
    ${canReplicate?`<button class="btn ghost" style="margin-top:12px;border-color:var(--green);color:var(--green)" onclick="askReplicate()">📑 Repor esta escalação nos outros modos com este jogo</button>
       <p class="p" style="margin-top:6px;font-size:11px">Cola este time (jogadores + capitão + tática) em toda aparição de ${esc(pp.home.name)} × ${esc(pp.away.name)} nos outros modos/rodadas. Salve este jogo também.</p>`:""}
    ${gameLocked
      ? `<div class="prebox" style="margin-top:12px;border-color:#3a2e10">🔒 O jogo já começou — escalação travada. Não dá mais pra editar.</div>
         <button class="btn" style="margin-top:8px" disabled>🔒 Time travado</button>`
      : inRound
        ? `<button class="btn" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"💾 Salvar escalação":"Complete 6 slots, capitão e tática"}</button>
           <p class="p" style="margin-top:8px;font-size:12px;color:var(--dim)">Pode ajustar quantas vezes quiser até o jogo começar. O que está garantido é a <b>vaga neste jogo</b> (ficha gasta) — a escalação trava sozinha no apito inicial.</p>`
        : `<button class="btn" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"Salvar time":"Complete 6 slots, capitão e tática"}</button>`}
    <button class="btn ghost" style="margin-top:8px" onclick="${APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId)?`go('round',null,'${APP.roundId}')`:"go('room')"}">← Voltar</button>
  </div>`;
}
function askConfirmTeam(){
  APP.confirm={mode:"confirmTeam",roomId:APP.roomId,label:"Confirmar equipe"};render();
}
// copia a escalação avulsa (partida solta) que o usuário fez neste MESMO jogo
async function copyLineupFromOther(){
  const src=APP.avulsaLineup;
  if(!src){toast("Você não montou este jogo na versão solta.");return;}
  APP.slots=Object.assign({GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},src.slots);
  APP.captain=src.captain||null;
  APP.tactic=src.tactic||null;
  toast("Escalação copiada da partida solta! Revise e salve.");
  render();
}
// ── REPOR ESCALAÇÃO: copia a escalação ATUAL (deste jogo) pra todas as OUTRAS
// aparições do MESMO jogo (mesmo room_id) nos outros modos/rodadas + versão avulsa.
// Como é o mesmo jogo, os IDs dos jogadores são idênticos: copia os slots direto.
// Pula a entry atual (onde estou) e qualquer entry travada (admin ou jogo começou).
async function replicateTargets(){
  // devolve lista de {round_id|null, label, locked} — onde dá pra colar a escalação deste room_id
  const out=[];
  const inRoundNow=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  // 1) versão avulsa (round_id null) — alvo se eu NÃO estou nela agora
  if(inRoundNow) out.push({round_id:null,label:"partida solta",locked:false});
  // 2) todas as rodadas onde este jogo aparece
  try{
    const rrs=await sb("round_rooms?room_id=eq."+APP.roomId+"&select=round_id,status");
    for(const rr of (rrs||[])){
      if(inRoundNow&&rr.round_id===APP.roundId) continue; // pula a rodada atual (é onde estou)
      const locked=(rr.status&&rr.status!=="open");
      out.push({round_id:rr.round_id,label:"rodada",locked});
    }
  }catch(e){}
  return out.filter(t=>!t.locked);
}
async function askReplicate(){
  const targets=await replicateTargets();
  if(!targets.length){toast("Este jogo não aparece em outro modo/rodada pra copiar.");return;}
  APP.confirm={mode:"replicate",count:targets.length,_targets:targets,label:"Repor escalação"};render();
}
async function applyLineupEverywhere(){
  if(!APP.user){toast("Faça login.");return;}
  const slots=APP.slots;
  if(!Object.values(slots).some(Boolean)){toast("Monte o time primeiro.");return;}
  const targets=(APP.confirm&&APP.confirm._targets)||await replicateTargets();
  if(!targets.length){toast("Nada para aplicar.");APP.confirm=null;render();return;}
  const cap=(APP.captain&&slots[APP.captain])?APP.captain:null;
  const payload={slots:JSON.parse(JSON.stringify(slots)),captain:cap,tactic:APP.tactic,updated_at:new Date().toISOString()};
  let applied=0;
  for(const t of targets){
    try{
      const filtro=t.round_id?("&round_id=eq."+t.round_id):"&round_id=is.null";
      const ex=await sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+filtro+"&select=id");
      if(ex&&ex.length){await sbUpdate("entries",payload,"id=eq."+ex[0].id);applied++;}
      else{await sbInsert("entries",Object.assign({room_id:APP.roomId,group_id:APP.groupId,round_id:t.round_id,username:APP.user.username},payload));applied++;}
    }catch(e){}
  }
  APP.confirm=null;
  toast(applied?`Escalação copiada para ${applied} outra(s) aparição(ões) deste jogo!`:"Nada para aplicar.");
  render();
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
function setTabTeam(t){APP.tabTeam=t;render();}
function setTabPos(t){APP.tabPos=t;render();}

async function saveEntry(){
  if(!SUPA.ready()){toast("Supabase não configurado.");return;}
  // está numa rodada? (roundId setado e este jogo pertence à mini rodada)
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
  const BENCH_FACTOR=0.8; // reserva que entra rende 80% (pedágio por não ser titular)
  if(benchMeta&&res.BENCH){
    if(benchMeta.pos==="GK"){
      const gkTitularMin=res.GK?res.GK.minutes:0;
      // GK reserva só entra se o titular não jogou nada; mesmo assim, com desconto
      if(gkTitularMin===0&&res.BENCH){subOut="GK";[res.GK,res.BENCH]=[res.BENCH,res.GK];const t=entry.slots.GK;entry.slots.GK=entry.slots.BENCH;entry.slots.BENCH=t;}
    }
    else{
      const cand=[benchMeta.pos,"FLEX"].filter(x=>res[x]);
      let worst=null;for(const x of cand){if(!worst||res[x].total<res[worst].total||(res[x].total===res[worst].total&&x==="FLEX"))worst=x;}
      // só troca se o reserva, JÁ COM o desconto, ainda superar o pior titular
      if(worst&&res.BENCH.total*BENCH_FACTOR>res[worst].total){subOut=worst;const t=entry.slots[worst];entry.slots[worst]=entry.slots.BENCH;entry.slots.BENCH=t;[res[worst],res.BENCH]=[res.BENCH,res[worst]];}
    }
  }
  // tática v4: conta TODOS que entraram (titulares + reserva que entrou), mesmo substituídos
  const entraram=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>entry.slots[sl]).filter(Boolean).map(rawOf).filter(r=>(r.min||0)>0);
  const sq=eng.squadSum(entraram);
  let sum=0;const view=[];
  for(const sl of slots){
    const pid=entry.slots[sl];
    if(!pid){view.push(null);continue;}
    const r=eng.scorePlayer(rawOf(pid),sl==="BENCH"?null:entry.tactic,sl==="BENCH"?null:sq);
    let pts=r.total,cap=false;
    // reserva que entrou: aplica o pedágio de 80%
    if(sl===subOut){pts=Math.round(pts*BENCH_FACTOR*10)/10;}
    if(sl===entry.captain&&sl!=="BENCH"){pts=Math.round(pts*1.2*10)/10;cap=true;}
    if(sl!=="BENCH")sum+=pts;
    view.push({slot:sl,pid:entry.slots[sl],pts,cap,subIn:sl===subOut,r});
  }
  // IMPULSO (modo boost): +10% por token usado nesta partida, aplicado por ÚLTIMO,
  // sobre o total já fechado (tática, capitão, reserva, tudo). entry.boost = nº de tokens.
  const boostTokens=Math.max(0,parseInt(entry.boost,10)||0);
  const boostMult=1+0.10*boostTokens;
  const finalTotal=Math.round(sum*boostMult*10)/10;
  return {username:entry.username,total:finalTotal,boost:boostTokens,boostMult,view,captain:entry.captain,tactic:entry.tactic,subOut,squadSum:sq};
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
  const tacticsUsed=Object.keys(st.tactics||{}).length;
  const add=x=>{if(x)m.push(x);};
  add(tier(st.wins,[[1,"Primeira Vitória"],[3,"Vencedor"],[7,"Campeão de Sala"],[15,"Dominador"]],"🏆","wins","vitória(s)"));
  add(tier(st.podiums,[[3,"Pódio Frequente"],[10,"Sempre no Topo"]],"🥇","pod","pódio(s)"));
  add(tier(st.games,[[1,"Estreante"],[5,"Habitual"],[15,"Veterano"],[30,"Lenda Viva"]],"🎮","games","jogo(s)"));
  add(tier(archDistinct,[[5,"Colecionador"],[12,"Curador"],[20,"Enciclopédia"]],"🃏","arch","arquétipos"));
  add(tier(rareCount,[[1,"Sortudo"],[5,"Caçador de Raros"],[12,"Lapidador"]],"💎","rare","carta(s) rara(s)"));
  add(tier(Math.floor(st.bestScore),[[20,"Boa Cartada"],[35,"Tacada de Mestre"],[50,"Jogo Perfeito"]],"📊","best","pts num jogo"));
  // NOVAS
  add(tier(st.bestStreak||0,[[2,"Embalado"],[3,"Invicto"],[5,"Imparável"]],"🔥","streak","pódios seguidos"));
  add(tier(st.zebraWins||0,[[1,"Zebra Master"],[3,"Rei da Zebra"]],"🦓","zebra","vitória(s) com zebra"));
  add(tier(tacticsUsed,[[3,"Tático"],[5,"Estrategista"],[6,"Maestro da Tática"]],"🧠","tac","táticas usadas"));
  if(st.capTotal>=4)add(tier(st.capRate,[[60,"Braçadeira de Ouro"],[80,"Capitão Certeiro"]],"🎖️","cap","% de acerto no capitão"));
  if(st.games>=4)add(tier(Math.floor(st.avg),[[20,"Regularidade"],[30,"Consistente"],[40,"Máquina de Pontos"]],"📈","avg","pts de média"));
  return m;
}
// título/nível do usuário — evolui com experiência + resultados
function userTitle(st){
  // pontuação de XP: jogos + vitórias valem mais + pódios + variedade de cartas
  const archDistinct=Object.keys(st.archetypes||{}).length;
  const xp=st.games*10 + st.wins*25 + st.podiums*8 + archDistinct*3;
  const niveis=[
    [0,  "Novato",          "🥚"],
    [40, "Escalador",       "📋"],
    [90, "Treinador",       "📣"],
    [160,"Tático",          "🧠"],
    [260,"Estrategista",    "♟️"],
    [400,"Mestre",          "🎩"],
    [600,"Lenda",           "👑"],
  ];
  let cur=niveis[0],next=null;
  for(let i=0;i<niveis.length;i++){
    if(xp>=niveis[i][0]){cur=niveis[i];next=niveis[i+1]||null;}
  }
  const prog=next?Math.round((xp-cur[0])/(next[0]-cur[0])*100):100;
  return {name:cur[1], emoji:cur[2], xp, next:next?{name:next[1],falta:next[0]-xp}:null, prog};
}
function openProfile(){go("profile");}
function profileHTML(){
  const st=APP.profile;
  if(!st)return `<div class="card"><div class="loading">Calculando seu perfil…</div></div>`;
  const medals=computeMedals(st);
  const archDistinct=Object.keys(st.archetypes).length;
  const TOTAL_ARCH=33; // total de arquétipos possíveis no engine
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const tit=userTitle(st);
  let html=`<div class="card">
    <div class="h1 disp" style="color:var(--amber)">${esc(APP.user.username)}</div>
    <div style="display:flex;align-items:center;gap:10px;margin:8px 0 4px">
      <span style="font-size:28px">${tit.emoji}</span>
      <div style="flex:1">
        <div style="font-weight:700;color:var(--chalk);font-size:17px">${tit.name}</div>
        <div style="font-size:11px;color:var(--dim)">${tit.next?`faltam ${tit.next.falta} XP pra ${tit.next.name}`:"nível máximo!"} · ${tit.xp} XP</div>
        <div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${tit.prog}%;background:var(--amber)"></div></div>
      </div>
    </div>
    <p class="p" style="margin-bottom:0">Conquistas no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  // resumo em números
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}
      ${statBox("🏆",st.wins,"vitórias")}
      ${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}
      ${statBox("📈",st.avg||0,"média/jogo")}
      ${statBox("🎯",st.podiumRate+"%","pódio")}
      ${statBox("🃏",archDistinct+"/"+TOTAL_ARCH,"arquétipos")}
      ${statBox("💎",rareCount,"raros")}
      ${statBox("🔥",st.bestStreak||0,"sequência")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Sua melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPerf?`<p class="p" style="margin-top:4px">🌟 Melhor atuação individual: <b style="color:var(--amber)">${esc(st.bestPerf.name)}</b> — ${st.bestPerf.pts.toFixed(1)} pts em ${esc(st.bestPerf.game)}${st.bestPerf.cap?" (capitão)":""}.</p>`:""}
    ${st.topPlayer?`<p class="p" style="margin-top:4px">💰 Craque favorito (mais pontos): <b style="color:var(--amber)">${esc(st.topPlayer.name)}</b> (${st.topPlayer.pts} pts somados).</p>`:""}
    ${st.bestPlayer?`<p class="p" style="margin-top:4px">📋 Mais escalado: <b style="color:var(--chalk)">${esc(st.bestPlayer.name)}</b> (${st.bestPlayer.n}×).</p>`:""}
    ${st.topTactic?`<p class="p" style="margin-top:4px">🧠 Tática preferida: <b style="color:var(--chalk)">${esc(st.topTactic.name)}</b> (${st.topTactic.n}×).</p>`:""}
    ${st.capTotal>=1?`<p class="p" style="margin-top:4px">🎖️ Capitão certeiro: <b style="color:var(--chalk)">${st.capRate}%</b> (acertou o melhor ${st.capHits}/${st.capTotal}).</p>`:""}
  </div>`;
  // medalhas
  html+=`<div class="card"><div class="h2 disp">Medalhas</div>`;
  if(!medals.length)html+=`<p class="p" style="margin-top:8px">Nenhuma medalha ainda. Monte times nos jogos encerrados para começar a colecionar.</p>`;
  else html+=`<div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div>`;
  html+=`</div>`;
  // coleção de arquétipos
  if(topArch.length){
    html+=`<div class="card"><div class="h2 disp">Seus arquétipos mais frequentes${helpBtn("arquetipo")}</div><div style="margin-top:10px">`;
    topArch.forEach(([a,n])=>{html+=`<div class="rank" style="padding:10px 14px"><div class="nm">${esc(a)}</div><div class="pt mono" style="font-size:15px">${n}×</div></div>`;});
    html+=`</div></div>`;
  }
  // histórico de partidas (clicável, com detalhe por jogador)
  const phist=APP.profileHistory;
  html+=`<div class="card"><div class="h2 disp">Últimas partidas</div>`;
  if(!phist)html+=`<div class="loading">Carregando histórico…</div>`;
  else if(!phist.length)html+=`<p class="p" style="margin-top:8px">Você ainda não jogou nenhuma partida finalizada.</p>`;
  else{html+=`<p class="p" style="margin:6px 0 4px;font-size:12px">Toque numa partida pra abrir, e num jogador pra ver os detalhes da pontuação e o arquétipo.</p>`;phist.forEach((h,hi)=>{html+=histGameHTML(h,hi,"p");});}
  html+=`</div>`;
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
// ── LISTA DE MEMBROS DO GRUPO ──
function membersHTML(){
  const list=APP.members;
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">👥 Membros</div>
      <div class="userchip" onclick="go('home')" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">Grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>. Toque num membro pra ver o perfil e o histórico de times.</p>
  </div><div class="card">`;
  if(!list)html+=`<div class="loading">Carregando membros…</div>`;
  else if(!list.length)html+=`<p class="p">Nenhum membro encontrado.</p>`;
  else html+=list.map(u=>{
    const isMe=u===APP.user?.username;
    return `<div class="rank${isMe?" me":""}" style="cursor:pointer" onclick="openMember('${encodeURIComponent(u)}')"><div class="po">👤</div><div class="nm">${esc(u)}${isMe?" <small>(você)</small>":""}</div><div class="pt mono" style="font-size:15px">›</div></div>`;
  }).join("");
  html+=`</div>`;
  return html;
}
function openMember(encU){const u=decodeURIComponent(encU);go("member",null,null,u);}
// ── PERFIL + HISTÓRICO DE UM MEMBRO ──
function memberHTML(){
  const u=APP.memberView;
  const st=APP.memberProfile;
  const hist=APP.memberHistory;
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">${esc(u||"")}</div>
      <div class="userchip" onclick="go('members')" style="cursor:pointer">← membros</div>
    </div>
    <p class="p" style="margin-top:6px">Perfil no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  if(!st){html+=`<div class="card"><div class="loading">Calculando perfil…</div></div>`;return html;}
  const archDistinct=Object.keys(st.archetypes).length;
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const medals=computeMedals(st);
  const tit=userTitle(st);
  // título/nível
  html+=`<div class="card"><div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:26px">${tit.emoji}</span>
    <div style="flex:1"><div style="font-weight:700;color:var(--chalk);font-size:16px">${tit.name}</div>
    <div style="font-size:11px;color:var(--dim)">${tit.xp} XP</div>
    <div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${tit.prog}%;background:var(--amber)"></div></div></div>
  </div></div>`;
  // resumo
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}${statBox("🏆",st.wins,"vitórias")}${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}${statBox("📈",st.avg||0,"média/jogo")}${statBox("🎯",st.podiumRate+"%","pódio")}
      ${statBox("🃏",archDistinct+"/33","arquétipos")}${statBox("💎",rareCount,"raros")}${statBox("🔥",st.bestStreak||0,"sequência")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPerf?`<p class="p" style="margin-top:4px">🌟 Melhor atuação: <b style="color:var(--amber)">${esc(st.bestPerf.name)}</b> — ${st.bestPerf.pts.toFixed(1)} pts.</p>`:""}
    ${st.topPlayer?`<p class="p" style="margin-top:4px">💰 Craque favorito: <b style="color:var(--amber)">${esc(st.topPlayer.name)}</b> (${st.topPlayer.pts} pts).</p>`:""}
    ${st.topTactic?`<p class="p" style="margin-top:4px">🧠 Tática preferida: <b style="color:var(--chalk)">${esc(st.topTactic.name)}</b>.</p>`:""}
  </div>`;
  // medalhas
  if(medals.length)html+=`<div class="card"><div class="h2 disp">Medalhas</div><div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div></div>`;
  // arquétipos
  if(topArch.length){
    html+=`<div class="card"><div class="h2 disp">Arquétipos mais frequentes</div><div style="margin-top:10px">`;
    topArch.forEach(([a,n])=>{html+=`<div class="rank" style="padding:10px 14px"><div class="nm">${esc(a)}</div><div class="pt mono" style="font-size:15px">${n}×</div></div>`;});
    html+=`</div></div>`;
  }
  // histórico de partidas com times escalados
  html+=`<div class="card"><div class="h2 disp">Últimas partidas</div>`;
  if(!hist)html+=`<div class="loading">Carregando histórico…</div>`;
  else if(!hist.length)html+=`<p class="p" style="margin-top:8px">Este membro ainda não jogou nenhuma partida finalizada.</p>`;
  else hist.forEach((h,hi)=>{html+=histGameHTML(h,hi,"m");});
  html+=`</div>`;
  html+=`<button class="btn ghost" onclick="go('members')">← Voltar aos membros</button>`;
  return html;
}
// renderiza uma partida do histórico com jogadores CLICÁVEIS (detalhe + arquétipo)
// prefix distingue contexto ("m"=membro, "p"=perfil próprio) pra estados de toggle separados
function histGameHTML(h,hi,prefix){
  const open=_openHistGame[prefix+hi];
  const MODECOLOR={avulsa:"var(--mid)",select:MODE_META.select.color,full:MODE_META.full.color,boost:MODE_META.boost.color};
  const MODELABEL={avulsa:"AVULSA",select:"🎯 SELECIONE",full:"🏆 COMPLETO",boost:"⚡ IMPULSO"};
  const e=h.entry;
  // cor da nota principal: normal se for avulsa; cor do modo + aviso se não tem avulsa
  const headColor=h.isAvulsa?(e.total<0?"var(--red)":"var(--amber)"):MODECOLOR[h.principalMode];
  const noAvulsaTag=h.isAvulsa?"":` <span style="font-size:9px;color:${MODECOLOR[h.principalMode]};border:1px solid ${MODECOLOR[h.principalMode]};border-radius:6px;padding:1px 5px">sem avulsa · ${MODELABEL[h.principalMode]}</span>`;
  let html=`<div class="receipt"><div class="rhead" onclick="toggleHistGame('${prefix}',${hi})">
    <div class="sl mono" style="width:auto;color:var(--amber)">${h.pos}º/${h.of}</div>
    <div class="nm">${esc(h.match_name)}${noAvulsaTag}<small>${esc(h.comp||"")} · ${h.variants.length} modo${h.variants.length>1?"s":""} jogado${h.variants.length>1?"s":""} · toque p/ ver</small></div>
    <div class="tot mono" style="color:${headColor}">${e.total.toFixed(1)}</div></div>`;
  if(open){
    html+=`<div class="rbody">`;
    // uma seção por modo (variante)
    h.variants.forEach((v,mi)=>{
      const col=MODECOLOR[v.mode]||"var(--mid)";
      const sc=v.entry;
      const tacName=window.ENGINE_TACTICS[sc.tactic]?.name||sc.tactic||"—";
      const descarte=(v.mode==="select"&&!v.counts)?` <span style="font-size:9px;color:var(--dim)">(não travado · não contou)</span>`:"";
      const boostTag=(v.mode==="boost"&&sc.boost>0)?` <span style="color:${col}">⚡ +${sc.boost*10}%</span>`:"";
      html+=`<div style="border-left:3px solid ${col};padding:6px 0 6px 10px;margin:8px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-family:'Saira Condensed';font-weight:800;font-size:12px;letter-spacing:.05em;color:${col}">${MODELABEL[v.mode]}${v.roundName?` · ${esc(v.roundName)}`:""}${descarte}</span>
          <span class="mono" style="color:${col};font-weight:700">${sc.total.toFixed(1)}</span>
        </div>
        <div style="font-size:10px;color:var(--dim);margin:2px 0 4px">cap ${SLOT_LABEL[sc.captain]||"?"} · ${esc(tacName)}${boostTag}</div>`;
      // jogadores clicáveis desta variante
      sc.view.filter(Boolean).forEach((vw,vi)=>{
        const pl=h.ctx.byId[vw.pid];
        const r=vw.r;
        const pkey=prefix+hi+"_"+mi+"_"+vi;
        const pOpen=_openHistPlayer[pkey];
        const capTag=vw.cap?` <span class="badgeC">C</span>`:"";
        const subTag=vw.subIn?` <span style="font-size:9px;color:var(--green)">↑entrou</span>`:"";
        const benchTag=vw.slot==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:"";
        const archTag=r&&r.meta&&r.meta.arch&&r.meta.arch!=="—"?` <span style="font-size:9px;color:var(--amber)">⭑ ${esc(r.meta.arch)}</span>`:"";
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleHistPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[vw.slot]}</b> ${esc(pl?pl.name:"?")}${capTag}${subTag}${benchTag}${archTag}</span><span class="v mono ${vw.pts>0?"plus":vw.pts<0?"minus":""}">${vw.slot==="BENCH"?"—":(vw.pts>0?"+":"")+vw.pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:8px 10px;margin:0 0 6px">`;
          html+=`<div style="font-size:10px;color:var(--dim);margin-bottom:4px">📋 ${r.minutes}' em campo</div>`;
          if(!r.statLines.length)html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`;
          r.statLines.forEach(([l,c,u,pts])=>{html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">${l} <b style="color:var(--mid)">${c}×</b> <i style="color:var(--dim);font-size:10px">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`;});
          if(r.lines.length){html+=`<div style="font-size:10px;color:var(--dim);margin:6px 0 2px">⚙️ Modificadores</div>`;
            r.lines.forEach(([k,val])=>{html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`;});}
          if(vw.cap)html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">Capitão</span><span class="v mono plus">×1.20</span></div>`;
          html+=`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span></div>`;
          html+=`</div>`;
        }
      });
      html+=`</div>`;
    });
    html+=`</div>`;
  }
  html+=`</div>`;
  return html;
}
let _openHistGame={}, _openHistPlayer={};
function toggleHistGame(prefix,i){const k=prefix+i;_openHistGame[k]=!_openHistGame[k];render();}
function toggleHistPlayer(k){_openHistPlayer[k]=!_openHistPlayer[k];render();}
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
  html+=`<div class="card"><div class="h2 disp">Ranking da sala${helpBtn("ranking")}</div>`;
  if(scored.length===0)html+=`<p class="p">Ninguém montou time nesta sala ainda.</p>`;
  scored.forEach((s,i)=>{
    const isMe=s.username===APP.user?.username;
    const op=_openRank[i];
    html+=`<div class="rank${isMe?" me":""}" style="cursor:pointer" onclick="toggleRank(${i})"><div class="po mono">${i+1}º</div><div class="nm">${esc(s.username)}<small>cap: ${esc(SLOT_LABEL[s.captain])} · ${TAC[s.tactic]?.name||s.tactic} · toque p/ ver time</small></div><div class="pt mono">${s.total.toFixed(1)}</div></div>`;
    if(op){
      html+=`<div style="border:1px solid var(--line);border-top:none;border-radius:0 0 12px 12px;margin:-8px 0 10px;padding:6px 12px 10px;background:var(--panel2)">`;
      html+=`<p class="p" style="font-size:10px;margin:0 0 4px">toque num jogador p/ ver o cálculo</p>`;
      s.view.filter(Boolean).forEach(v=>{
        const pl=APP._byId[v.pid];
        const capTag=v.cap?` <span class="badgeC">C</span>`:"";
        const subTag=v.subIn?` <span style="font-size:9px;color:var(--green)">↑entrou</span>`:"";
        const benchTag=v.slot==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:"";
        const pkey="rk_"+i+"_"+v.slot;
        const pOpen=_openRankPlayer[pkey];
        const r=v.r;
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleRankPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[v.slot]}</b> ${esc(pl?pl.name:"?")}${capTag}${subTag}${benchTag} <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${v.pts>0?"plus":v.pts<0?"minus":""}">${v.slot==="BENCH"?"—":(v.pts>0?"+":"")+v.pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
            <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo${helpBtn("apuracao")}</div>
            ${(r.statLines||[]).map(([l,c,u,pts])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
            ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
            ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
            ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
          </div>`;
        }
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
  // botão + tabela de pontuação base de TODOS os jogadores do jogo (histórico, sem cap/tática/banco)
  html+=`<div class="card"><div class="rhead" style="padding:0;cursor:pointer" onclick="toggleBaseAll()"><div class="nm disp" style="font-size:16px">📊 Base de todos os jogadores</div><div class="tot mono" style="color:var(--dim);font-size:14px">${_openBaseAll?"▲":"▼"}</div></div>`;
  if(_openBaseAll){
    html+=`<p class="p" style="margin:8px 0 10px">Nota individual de cada jogador na partida (sem capitão, tática ou banco). Só quem entrou em campo.</p>`;
    html+=baseAllHTML(eng);
  }
  html+=`</div>`;
  // admin: arquivar/desarquivar a partida
  if(isAdmin()){
    const arq=isArchived(APP.roomId);
    html+=`<button class="btn ghost" style="border-color:${arq?"var(--green)":"var(--amber)"};color:${arq?"var(--green)":"var(--amber)"};margin-bottom:10px" onclick="${arq?`unarchiveGame('${APP.roomId}')`:`askArchive('${APP.roomId}')`}">${arq?"♻️ Desarquivar partida":"📥 Arquivar partida (mandar pro histórico)"}</button>`;
  }
  html+=`<button class="btn ghost" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('home')"}">← Voltar${inRound?" à mini rodada":" às salas"}</button>`;
  return html;
}
let _openBaseAll=false;
function toggleBaseAll(){_openBaseAll=!_openBaseAll;render();}
function baseAllHTML(eng){
  const pp=APP.prepool,m=APP.match;
  const rows=pp.players.map(meta=>{
    const st=m.players[String(meta.id)];
    if(!st||!st.min)return null; // só quem jogou
    const r=eng.scorePlayer(Object.assign({pos:meta.pos},st),null,null);
    return {meta,r,name:meta.name,team:meta.team,pos:meta.pos,pts:r.total,min:r.minutes};
  }).filter(Boolean).sort((a,b)=>b.pts-a.pts);
  if(!rows.length)return `<p class="p">Sem dados de jogadores.</p>`;
  return rows.map((row,i)=>{
    const open=_openBase[i];
    const r=row.r;
    let body="";
    if(open){
      body=`<div class="rbody">
        <div class="bsub" style="border:none;margin-top:0;padding-top:0">📋 Estatísticas · ${r.minutes}' em campo${helpBtn("apuracao")}</div>
        ${r.statLines.length===0?`<div class="line"><span>Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`:""}
        ${r.statLines.map(([l,c,u,pts])=>`<div class="line stat"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
        ${r.lines.length?`<div class="bsub">⚙️ Modificadores${helpBtn("dvg")}</div>`:""}
        ${r.lines.map(([k,val])=>`<div class="line"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
        <div class="line total"><span>NOTA BASE</span><span class="v mono">${r.total.toFixed(1)}</span></div>
        ${r.evNote.length?`<div class="metricbox">${r.evNote.map(e=>`<div>${esc(e)}</div>`).join("")}</div>`:""}
        <div class="chips"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${helpBtn("arquetipo")}${r.meta.traits.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span>${helpBtn("raridade")}</div>
      </div>`;
    }
    return `<div class="receipt"><div class="rhead" onclick="toggleBase(${i})">
      <div class="sl mono pc-${row.pos}">${SLOT_LABEL[row.pos]}</div>
      <div class="nm">${esc(row.name)}<span class="teamtag" style="--tc:${teamColor(row.team)};margin-left:6px">${row.team}</span> <small>${row.min}' · toque p/ detalhe</small></div>
      <div class="tot mono${row.pts<0?" neg":""}">${row.pts>0?"+":""}${row.pts.toFixed(1)}</div></div>${body}</div>`;
  }).join("");
}
let _openBase={};
function toggleBase(i){_openBase[i]=!_openBase[i];render();}
let _openRec={};
let _openRank={};
function toggleRank(i){_openRank[i]=!_openRank[i];render();}
let _openRankPlayer={};
function toggleRankPlayer(k){_openRankPlayer[k]=!_openRankPlayer[k];render();}
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
    <div class="nm">${esc(p.name)}<small>${p.team} · ${p.pos}${v.subIn?' · ↑ entrou do banco (×0,8)':''}</small></div>
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
  else if(APP.view==="members")panel=membersHTML();
  else if(APP.view==="member")panel=memberHTML();
  else if(APP.view==="league")panel=leagueHTML();
  else if(APP.view==="phase")panel=phaseHTML();
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
  </div>${APP.showRules?rulesModalHTML():""}${APP.help?helpModalHTML():""}`;
}
function toggleRules(){APP.showRules=!APP.showRules;render();}
// ---- mini-ajudas contextuais (botão ? pequeno em vários lugares) ----
const HELP={
  minirodada:["Mini rodada","Você recebe um número de fichas (tokens) de entrada. Cada jogo que você escolher gasta 1 ficha e garante sua vaga naquele jogo. Você não precisa usar todas. Escolher os jogos certos (onde você acha que vai pontuar mais) é a estratégia. A escalação de cada jogo é montada depois e pode ser ajustada até a partida começar."],
  token:["Fichas de entrada","Cada mini rodada te dá um número fixo de fichas (ex: 2). Tocar no + verde de um jogo gasta 1 ficha e sela sua participação NAQUELE jogo. Enquanto a seleção estiver aberta, dá pra trocar à vontade. Quando o 1º jogo começa, suas escolhas travam."],
  escalacao:["Escalação","Montar o time é separado de escolher o jogo. A escalação fica salva e você pode mudá-la quantas vezes quiser até a partida começar — ela trava sozinha no apito inicial. Não existe 'confirmar equipe' aqui: o que está garantido é a vaga no jogo (a ficha)."],
  liga:["Liga","Junta várias rodadas numa classificação geral da temporada. Dois rankings: pontos de tabela (10/7/5/3/1 conforme a colocação em cada mini rodada) e pontuação clássica (soma do fantasy). Os pontos sobem somando das mini rodadas → rodadas → liga."],
  rodada:["Rodada","Uma fase que agrupa várias mini rodadas (ex: 'Fase de Grupos'). A classificação da rodada é a soma das mini rodadas dela."],
  capitao:["Capitão (×1.20)","Escolha 1 jogador (menos o banco) pra render 20% a mais. Vale a pena no jogador que você mais confia que vai pontuar."],
  banco:["Banco (reserva)","Se um titular de linha for mal, o reserva pode entrar no lugar — mas rende só 80% da nota (pedágio). Ele só substitui se, já com o desconto, superar o titular. O goleiro reserva só conta se o titular não jogar nenhum minuto."],
  tatica:["Tática","Cada tática tem um ESTILO (ex: marcação, posse, jogo aéreo). Ela fica COMPLETA (bônus) se, na partida, esse estilo for o ponto mais forte do seu time E vários dos seus jogadores produzirem nele. Se faltar um dos dois, fica incompleta (ônus, sempre menor que o bônus). Você escolhe olhando seu time: 'tenho zagueiros que desarmam muito → Muralha', 'meio-campo que toca → Tiki-Taka'. O efeito vem das ações reais deles em campo."],
  pool:["Pool de jogadores","Todos os jogadores dos dois times do confronto, com preço por qualidade. Use os filtros (time / posição) pra achar quem quer. Ordenados do mais caro pro mais barato."],
  orcamento:["Orçamento","Você tem 100 moedas pra montar os 6 slots (incluindo o banco). Cada jogador tem um preço baseado na qualidade (valor de mercado corrigido pela idade). Gastar tudo nos craques deixa o resto barato — equilibrar é parte da estratégia."],
  slots:["Os 6 slots","Seu time tem: 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX e 1 Banco. Cada slot só aceita jogadores da posição certa (o FLEX é mais livre). Quem você escalar mas não jogar a partida real fica com 0 pontos."],
  flex:["FLEX (curinga)","O slot FLEX aceita um jogador de defesa, meio OU ataque (não goleiro). Serve pra você reforçar a posição que quiser — um 2º atacante, um meia a mais, etc. Ele conta na composição do time pra valer."],
  banco:["Banco (reserva)","Se um titular de linha for mal, o reserva pode entrar no lugar — mas rende só 80% da nota (pedágio por começar fora). Ele só substitui se, já com o desconto, superar o titular. O goleiro reserva só conta se o titular não jogar nenhum minuto."],
  ranking:["Classificação","Quando o jogo acaba, todos os times da sala são pontuados e ordenados. Toque num nome pra ver a escalação e a apuração de cada jogador. Em mini rodadas/ligas, os pontos vão somando."],
  apuracao:["Apuração do jogador","Mostra de onde veio cada ponto: estatísticas (gols, defesas, desarmes...), modificadores (dificuldade, contexto de placar, clutch, tática), o bônus de capitão e o arquétipo. É a 'conta' completa da nota."],
  dvg:["Bônus de zebra (DvG)","Jogadores do time mais fraco (underdog) ganham um acréscimo. NÃO é fixo: quanto maior a diferença de força entre os times, maior o bônus — até um teto de +10%. A 'força' combina ELO + forma recente + mando de campo, então um time em boa fase 'sobe de força' e dá menos bônus de zebra. Se seu jogador é do favorito, não há bônus (×1.00). Apostar no azarão certo rende mais."],
  performance:["Performance (índices C+)","É a NOTA GERAL da atuação do jogador, de −3 a +4 pontos, separada dos eventos pontuais (gols, assists já contam antes). Combina 4 índices: (1) Envolvimento ofensivo — chutes, criação, passes progressivos, dribles; (2) Eficiência — quão difíceis eram os gols/assists/defesas pelo xG; (3) Segurança — desconta erros, faltas, cartões e ser driblado; (4) Volume defensivo — desarmes, recuperações, bloqueios, duelos aéreos. A média ponderada (ataque 30% + eficiência 30% + segurança 20% + defesa 20%) vira a nota. Jogou bem no geral = perto de +4; jogou mal/indisciplinado = negativo."],
  placar:["Placar (contexto do jogo)","Ajusta os pontos conforme o jogo estava: ações num jogo apertado (diferença de 1 gol ou empate) valem um pouco mais, porque pesam mais no resultado. 'Jogo vivo o tempo todo' = a partida ficou equilibrada do início ao fim."],
  clutch:["Clutch","Ações decisivas nos minutos finais (85'+) com o jogo apertado valem pontos extras. Um gol que decide no fim vale mais que um gol em jogo já ganho."],
  raridade:["Raridade","Selo de quão especial foi a atuação (Comum → Lendário), baseado na pontuação e no impacto do jogador naquele jogo. Quanto melhor jogou, mais rara a 'carta'."],
  arquetipo:["Arquétipos","Depois do jogo, cada jogador ganha um 'tipo' conforme a atuação (ex: Artilheiro, Muralha, Box-to-Box). É só cosmético/colecionável — não muda os pontos. Você coleciona os que escalou no seu perfil."],
};
function helpBtn(key){return `<span class="helpq" onclick="event.stopPropagation();showHelp('${key}')" title="O que é isso?">?</span>`;}
// dado o nome de um modificador (linha de r.lines), devolve a chave de HELP correspondente (ou null)
function modHelpKey(label){
  const l=(label||"").toLowerCase();
  if(l.includes("performance")||l.includes("índices")||l.includes("indices"))return "performance";
  if(l.includes("dvg")||l.includes("zebra")||l.includes("underdog"))return "dvg";
  if(l.includes("placar"))return "placar";
  if(l.includes("clutch"))return "clutch";
  if(l.includes("tática")||l.includes("tatica"))return "tatica";
  if(l.includes("dificuldade")||l.includes("xg")||l.includes("psxg"))return "apuracao";
  return null;
}
// renderiza um '?' ao lado do modificador se houver help
function modHelpBtn(label){const k=modHelpKey(label);return k?helpBtn(k):"";}
function showHelp(key){APP.help=key;render();}
function closeHelp(){APP.help=null;render();}
function helpModalHTML(){
  const h=HELP[APP.help];if(!h)return"";
  return `<div class="modal" onclick="closeHelp()"><div class="box" onclick="event.stopPropagation()">
    <div class="h2 disp" style="color:var(--amber)">${esc(h[0])}</div>
    <p class="p" style="margin:12px 0">${esc(h[1])}</p>
    <button class="btn" onclick="closeHelp()">Entendi</button>
  </div></div>`;
}
function rulesModalHTML(){
  return `<div class="modal" onclick="toggleRules()"><div class="box" onclick="event.stopPropagation()" style="max-height:80vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">Como funciona o Fantasy PvP</div>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">O jogo:</b> antes de cada partida real, abre uma "pool". Você monta um time de 6 jogadores escolhidos entre os elencos dos DOIS times que vão se enfrentar. Quando o jogo acontece, seus jogadores pontuam pelo que fizerem em campo de verdade.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Orçamento:</b> 100 moedas. Cada jogador tem um preço (calculado por qualidade técnica: valor de mercado corrigido pela idade). O banco também conta no orçamento.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Os 6 slots:</b> 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Capitão (×1.20):</b> escolha 1 jogador (qualquer um menos o banco) pra pontuar 20% a mais.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Banco:</b> se um titular de linha pontuar pouco, o reserva pode entrar no lugar dele — mas o reserva rende só <b style="color:var(--chalk)">80%</b> da nota (pedágio por começar fora). Ele só entra se, já com o desconto, ainda superar o titular. <b style="color:var(--chalk)">Exceção do goleiro:</b> o GK do banco só entra se o GK titular não jogar NENHUM minuto. Se o titular jogar, o reserva fica com 0.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Tática:</b> escolha 1. Cada tática tem um ESTILO de jogo. Ela fica <b style="color:var(--chalk)">completa (bônus)</b> se, na partida, aquele estilo for a maior fatia das ações do seu time E um número mínimo dos seus jogadores produzir nele (ex: Tiki-Taka pede que passes/criação sejam o forte do time e 4+ jogadores criando). Se faltar um dos dois, fica <b style="color:var(--chalk)">incompleta (ônus)</b> — e o ônus é sempre menor que o bônus. Todas as táticas valem o mesmo em pontos (são balanceadas), e o bônus é dividido entre os jogadores conforme quem mais produziu no estilo. Conta todos que entraram, mesmo substituídos.</p>
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
  window.go=async function(view,roomId,roundId,extra,leagueId,phaseId){
   try{
    APP.view=view;if(roomId)APP.roomId=roomId;
    if(view==="groups"){await loadGroups();}
    if(view==="home"){await loadArchived();await loadGroups();await loadGroupRooms();await loadRounds();await loadPhases();await loadLeagues();}
    if(view==="round"){await loadRound(roundId);_openPeekRound={};}
    if(view==="league"){await loadLeague(leagueId);}
    if(view==="phase"){await loadPhase(phaseId);}
    if(view==="room"){APP.roundId=null;APP.round=null;APP.roundRooms=[];APP.roundEntries=[];}
    if(view==="room"||view==="build"||view==="result"){await loadRoom(APP.roomId);}
    if(view==="room"){APP.entries=await loadEntries();_openPeek={};}
    if(view==="result"){APP.entries=await loadEntries();_openRec={};_openRank={};}
    if(view==="profile"){APP.profile=null;APP.profileHistory=null;render();const ps=await loadProfileStats(APP.user.username);if(APP.view==="profile")APP.profile=ps;render();const ph=await loadMemberHistory(APP.user.username);if(APP.view==="profile")APP.profileHistory=ph;}
    if(view==="members"){APP.members=null;render();const ms=await loadGroupMembers();if(APP.view==="members")APP.members=ms;}
    if(view==="member"){
      APP.memberView=extra;APP.memberProfile=null;APP.memberHistory=null;_openHistGame={};_openHistPlayer={};render();
      const ps=await loadProfileStats(extra);if(APP.view==="member"&&APP.memberView===extra)APP.memberProfile=ps;render();
      const h=await loadMemberHistory(extra);if(APP.view==="member"&&APP.memberView===extra)APP.memberHistory=h;
    }
    render();window.scrollTo(0,0);
   }catch(err){
    // nunca trava a navegação: mostra o erro e ainda renderiza a tela
    try{toast("Erro ao abrir: "+(err&&err.message?err.message:err));}catch(e){}
    try{render();}catch(e){}
   }
  };
  // tela inicial: grupos (se logado). carrega a lista antes.
  if(APP.user){await loadGroups();APP.view="groups";}
  render();
 }catch(err){
  var r=document.getElementById("root");
  if(r)r.innerHTML='<div style="padding:20px;color:#E0604F;font-family:monospace;font-size:13px"><b>Erro ao iniciar:</b><br>'+String(err&&err.message?err.message:err)+'<br><br><span style="color:#8FA89A">Tire um print desta tela.</span></div>';
 }
})();
