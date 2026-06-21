// ============================================================
// FANTASY PvP — APP (navegação, Supabase, telas)
// ============================================================
const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"FLEX",BENCH:"BANCO"};
// modos de mini rodada (agrupamento + cores na home). Rodadas antigas (sem mode) = 'select'.
const MODE_META={
  full:{label:"COMPLETO",icon:"🏆",color:"#5CA8FF",desc:"Jogue TODOS os jogos da mini rodada. Vale a soma de tudo."},
  boost:{label:"IMPULSO",icon:"⚡",color:"#FFC247",desc:"Estratégico impulsionado: distribua suas fichas de impulso nas partidas (pode fazer isso antes mesmo de escalar) e monte o time de cada jogo. Cada pool tem suas próprias fichas (valores e regras definidos pelo dev — pode até ter fichas negativas). A escalação de cada jogo trava quando aquele jogo é fechado; a distribuição de fichas trava quando a 1ª partida da rodada é fechada."},
  confianca:{label:"CONFIANÇA",icon:"📊",color:"#C77DFF",desc:"Coloque os jogos em ordem: do que você MAIS confia (1º) pro que menos confia (último) — dá pra ordenar antes mesmo de escalar. Os primeiros da sua ordem multiplicam os pontos pra cima; os últimos, pra baixo. Quanto mais jogos na rodada, maior a diferença entre o 1º e o último. A escalação de cada jogo é livre e trava quando aquele jogo é fechado; a ordem de confiança trava quando a 1ª partida da rodada é fechada."},
  previsao:{label:"PREVISÃO",icon:"🔮",color:"#54E0A8",desc:"Escale todos os jogos e crave o placar de cada um. Além dos pontos da escalação, ganhe um bônus por acertar o resultado — e um maior por cravar o placar exato. A escalação e o palpite de cada jogo travam quando aquela partida for fechada (cada jogo é independente)."},
};
// modos oferecidos ao dev (select fica oculto: existe na base, mas sai do visual)
const MODE_LIST=["full","boost","confianca","previsao"];
const modeOf=r=>(r&&r.mode)||"full";
const modeMeta=r=>MODE_META[modeOf(r)]||MODE_META.full;
// multiplicador de confiança: alcance cresce com o nº de jogos (poucos jogos = suave).
// piso 0.5x. quanto mais jogos, mais o topo se destaca (até ~1.8x).
function confMultiplier(rank,total){
  if(total<=1)return 1;
  const spread=Math.min(0.8, 0.18*(total-1));
  const t=rank/(total-1);
  const m=1+spread - t*(2*spread);
  return Math.max(0.5, Math.round(m*100)/100);
}
// bônus de previsão em PORCENTAGEM (escala com os pontos do time naquele jogo)
const PRED_EXACT_PCT=40;   // cravou o placar exato → +40%
const PRED_RESULT_PCT=10;  // acertou só o resultado (V/E/D) → +10%
// Catálogo dos 33 arquétipos: categoria, raridade típica e como conseguir.
// (a raridade real varia por atuação; aqui é a faixa típica de quem ativa o arquétipo)
const ARCH_CATALOG=[
  // Goleiros
  {name:"GK Seguro",cat:"Goleiro",rar:"Comum",how:"Goleiro que cumpriu seu papel sem grandes sustos."},
  {name:"GK Muralha",cat:"Goleiro",rar:"Incomum",how:"Goleiro com muitas defesas ou uma defesa difícil."},
  {name:"GK Paredão",cat:"Goleiro",rar:"Épico",how:"Muitas defesas (ou uma defesaça) E sem sofrer gol."},
  {name:"GK Líbero",cat:"Goleiro",rar:"Incomum",how:"Goleiro que saiu jogando: cortes fora da área e cruzamentos, jogando muito tempo."},
  {name:"GK Pegador de Pênalti",cat:"Goleiro",rar:"Lendário",how:"Defendeu pelo menos um pênalti."},
  // Ataque — gol
  {name:"GOAT",cat:"Ataque",rar:"Lendário",how:"Pontuação máxima — a melhor atuação possível no jogo (28+ pts). O teto."},
  {name:"Matador",cat:"Ataque",rar:"Lendário",how:"Marcou 3+ gols (hat-trick)."},
  {name:"Artilheiro",cat:"Ataque",rar:"Épico",how:"Marcou 2 gols."},
  {name:"Carrasco",cat:"Ataque",rar:"Épico",how:"Marcou o gol que tirou o time do empate/derrota e o colocou na frente (virada ou desempate decisivo)."},
  {name:"Super Sub",cat:"Ataque",rar:"Raro",how:"Entrou do banco e marcou gol."},
  {name:"Especialista de Bola Parada",cat:"Ataque",rar:"Raro",how:"Marcou gol de falta, escanteio ou bola parada."},
  {name:"Canhão",cat:"Ataque",rar:"Épico",how:"Marcou um gol de fora da área."},
  {name:"Finalizador Frio",cat:"Ataque",rar:"Épico",how:"Marcou um gol que foi um golaço improvável."},
  {name:"Decisivo",cat:"Ataque",rar:"Raro",how:"Marcou gol E deu assistência no mesmo jogo."},
  {name:"Herói de Clutch",cat:"Ataque",rar:"Épico",how:"2+ ações decisivas nos minutos finais com jogo apertado."},
  // Criação / assistência
  {name:"Rei das Assistências",cat:"Criação",rar:"Épico",how:"Deu 3+ assistências."},
  {name:"Garçom",cat:"Criação",rar:"Raro",how:"Deu 2 assistências."},
  {name:"Cérebro do Time",cat:"Criação",rar:"Épico",how:"Criação excepcional de chances (muitas chances claras criadas)."},
  {name:"Maestro Criador",cat:"Criação",rar:"Raro",how:"Criou muitas chances de gol ao longo do jogo."},
  {name:"Maestro de Cruzamentos",cat:"Criação",rar:"Incomum",how:"Acertou 4+ cruzamentos na área."},
  // Atacantes
  {name:"Driblador",cat:"Ataque",rar:"Raro",how:"Atacante com 6+ dribles certos."},
  {name:"Lobo Solitário",cat:"Ataque",rar:"Incomum",how:"Atacante com 4+ finalizações no alvo."},
  {name:"Pivô de Área",cat:"Ataque",rar:"Incomum",how:"Atacante com 5+ duelos aéreos ganhos."},
  {name:"Camisa 10",cat:"Criação",rar:"Incomum",how:"Meia ou atacante que criou bastante (chances de gol)."},
  {name:"Homem de Frente",cat:"Ataque",rar:"Comum",how:"Atacante que atuou sem grande destaque estatístico."},
  // Defensores
  {name:"Xerife",cat:"Defesa",rar:"Raro",how:"Defensor dominante: muitos desarmes, cortes e bloqueios (16+)."},
  {name:"Muralha Aérea",cat:"Defesa",rar:"Incomum",how:"Defensor forte no alto: aéreos, bloqueios e cortes (12+)."},
  {name:"Ala Moderno",cat:"Defesa",rar:"Incomum",how:"Lateral ofensivo: 4+ dribles e muito envolvimento no jogo."},
  {name:"Zagueiro Construtor",cat:"Defesa",rar:"Incomum",how:"Zagueiro que saiu jogando: muitos passes progressivos com segurança."},
  {name:"Lateral de Corredor",cat:"Defesa",rar:"Comum",how:"Lateral com muito envolvimento ofensivo e passes pra frente."},
  // Meio-campo
  {name:"Box-to-Box",cat:"Meio",rar:"Raro",how:"Meia que defende E cria: recuperações + criação, muito envolvido."},
  {name:"Volante",cat:"Meio",rar:"Incomum",how:"10+ desarmes/recuperações com muito envolvimento."},
  {name:"Motor",cat:"Meio",rar:"Incomum",how:"Muito envolvimento no jogo + 8+ recuperações."},
  {name:"Condutor",cat:"Meio",rar:"Incomum",how:"Meia com 5+ dribles certos (conduz a bola)."},
  {name:"Cão de Guarda",cat:"Defesa",rar:"Incomum",how:"Muito trabalho defensivo (12+ ações) com segurança, fora do ataque."},
  {name:"Ponta Caótico",cat:"Meio",rar:"Comum",how:"Muito envolvimento ofensivo, mas pouca segurança (joga solto)."},
  {name:"Articulador",cat:"Meio",rar:"Comum",how:"Meia que distribui o jogo: 8+ passes progressivos."},
  {name:"Engrenagem",cat:"Meio",rar:"Comum",how:"Meio-campista trabalhador: 6+ desarmes/recuperações."},
  {name:"Conector",cat:"Meio",rar:"Comum",how:"Atuação equilibrada sem um destaque específico (arquétipo base)."},
  // Outros
  {name:"Vilão",cat:"Outros",rar:"Comum",how:"Cometeu um pênalti, errou levando a gol, ou foi expulso (sem compensar com gol)."},
];
const RAR_COLOR={Comum:"#9aa6b2",Incomum:"#54E0A8",Raro:"#5CA8FF",Épico:"#C77DFF",Mítico:"#FFC247",Lendário:"#FF6B6B"};
// IMPULSO: cada ficha vale +BOOST_PCT% nos pontos da partida; teto de BOOST_MAX_PER_GAME fichas por jogo.
const BOOST_PCT=15;            // % por ficha
const BOOST_MAX_PER_GAME=2;    // máximo de fichas empilháveis numa mesma partida
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
  compArchived:[],      // "kind:id" de competições arquivadas manualmente (mini rodada/rodada/liga)
  roundRoomsByRound:{}, // round_id → [round_rooms] (pra detectar rodada finalizada)
  profile:null, profileHistory:null, profileTab:"geral", memberProfileTab:"geral",
  devMode:true,         // modo DEV ligado (só afeta quem é dev); alterna admin x jogador comum
  prepool:null, match:null, roomMeta:null,
  slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},
  captain:null, tactic:null, tabTeam:"ALL", tabPos:"ALL", warn:"", showRules:false, help:null, confirm:null,
  entries:[],           // entries da sala (pro ranking)
  avulsaLineup:null, members:null, memberView:null, memberProfile:null, memberHistory:null,
  collapsedModes:{},   // (legado)
  openModes:{},        // {full:true} = grupo de modo EXPANDIDO (padrão: fechado)
  homeNavTab:"partidas", // aba ativa da home: partidas|mini|rodadas|ligas
  compTab:{round:"live",phase:"live",league:"live"}, // aba "live"(andamento)/"done"(finalizadas) por seção
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
// Garante que existe uma entry (mesmo vazia, sem escalação) pra este jogo na rodada.
// Permite ordenar (confiança) ou gastar fichas (impulso) ANTES de montar o time.
// Retorna a entry local após recarregar; cria no banco se ainda não existir.
async function ensureEntry(roomId){
  let e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  if(e)return e;
  await sbInsert("entries",{room_id:roomId,group_id:APP.groupId,round_id:APP.roundId,username:APP.user.username,slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},captain:null,tactic:null,confirmed:false,updated_at:new Date().toISOString()});
  await loadRound(APP.roundId);
  return (APP.roundEntries||[]).find(x=>x.room_id===roomId);
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
  // arquivamento manual de competições (mini rodada / rodada / liga)
  try{const rows=await sb("archived_comps?group_id=eq."+APP.groupId+"&select=comp_kind,comp_id");
    APP.compArchived=(rows||[]).map(r=>r.comp_kind+":"+r.comp_id);}
  catch(e){APP.compArchived=APP.compArchived||[];}
}
function isArchived(roomId){return APP.archived.includes(roomId);}
async function archiveComp(kind,id){
  if(!isAdmin())return;
  try{
    await sbInsert("archived_comps",{group_id:APP.groupId,comp_kind:kind,comp_id:id},true,"group_id,comp_kind,comp_id");
    await loadArchived();
    toast("Movido para Finalizadas.");
    render();
  }catch(e){toast("Erro (verifique a tabela archived_comps): "+e.message);}
}
async function unarchiveComp(kind,id){
  if(!isAdmin())return;
  try{
    await sbDelete("archived_comps",`group_id=eq.${APP.groupId}&comp_kind=eq.${kind}&comp_id=eq.${id}`);
    await loadArchived();
    toast("Movido para Em andamento.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
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
function _blankStats(){
  return {
    games:0, wins:0, podiums:0, bestScore:0, bestGame:null, totalPoints:0,
    archetypes:{}, traits:{}, rarities:{}, players:{}, bestPlayer:null,
    playerPts:{}, topPlayer:null, bestPerf:null,
    tactics:{}, topTactic:null, capHits:0, capTotal:0,
    bestStreak:0, zebraWins:0, _results:[]
  };
}
// acumula UMA participação (entry pontuada "me") no balde de stats, na posição myIdx do ranking
function _accumStats(stats,me,myIdx,j,ctx){
  stats.games++;
  stats.totalPoints+=me.total;
  if(myIdx===0)stats.wins++;
  if(myIdx<3)stats.podiums++;
  stats._results.push(myIdx<3);
  if(me.total>stats.bestScore){stats.bestScore=me.total;stats.bestGame=j.match_name;}
  if(me.tactic){const tn=window.ENGINE_TACTICS[me.tactic]?window.ENGINE_TACTICS[me.tactic].name:me.tactic;stats.tactics[tn]=(stats.tactics[tn]||0)+1;}
  if(myIdx===0){
    const m=ctx.match,homeUnder=m.homeElo<m.awayElo;
    const underCode=homeUnder?m.homeCode:m.awayCode;
    let underN=0,tot=0;
    for(const v of me.view){if(!v||v.slot==="BENCH")continue;const pl=ctx.byId[v.pid];if(pl){tot++;if(pl.team===underCode)underN++;}}
    if(tot&&underN/tot>=0.6)stats.zebraWins++;
  }
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
      stats.playerPts[pl.name]=(stats.playerPts[pl.name]||0)+v.pts;
      if(!stats.bestPerf||v.pts>stats.bestPerf.pts)stats.bestPerf={name:pl.name,team:pl.team,pts:v.pts,game:j.match_name,cap:v.cap};
      if(v.cap)capPts=v.pts/1.2;
      if(v.pts>maxTitular)maxTitular=v.pts;
    }
  }
  if(capPts!=null){stats.capTotal++;const capWithBonus=capPts*1.2;if(Math.abs(capWithBonus-maxTitular)<0.01||capWithBonus>=maxTitular)stats.capHits++;}
}
// finaliza derivados de um balde
function _finalizeStats(stats){
  let top=null;for(const[name,n]of Object.entries(stats.players)){if(!top||n>top.n)top={name,n};}
  stats.bestPlayer=top;
  let tp=null;for(const[name,pts]of Object.entries(stats.playerPts)){if(!tp||pts>tp.pts)tp={name,pts:Math.round(pts*10)/10};}
  stats.topPlayer=tp;
  let tt=null;for(const[name,n]of Object.entries(stats.tactics)){if(!tt||n>tt.n)tt={name,n};}
  stats.topTactic=tt;
  let cur=0;for(const ok of stats._results){if(ok){cur++;if(cur>stats.bestStreak)stats.bestStreak=cur;}else cur=0;}
  stats.avg=stats.games?Math.round(stats.totalPoints/stats.games*10)/10:0;
  stats.podiumRate=stats.games?Math.round(stats.podiums/stats.games*100):0;
  stats.winRate=stats.games?Math.round(stats.wins/stats.games*100):0;
  stats.capRate=stats.capTotal?Math.round(stats.capHits/stats.capTotal*100):0;
  return stats;
}

// cache de entries dos jogos finalizados — busca TODAS de uma vez (1 consulta em vez de N)
let _entriesCache=null;       // { room_id: [entries] }
let _entriesCacheKey=null;    // pra invalidar quando muda de grupo
async function loadAllFinishedEntries(){
  const key=APP.groupId;
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  const roomIds=arq.map(j=>j.room_id);
  // cache válido se mesmo grupo e cobre os mesmos jogos
  if(_entriesCache&&_entriesCacheKey===key+"|"+roomIds.sort().join(",")) return _entriesCache;
  const byRoom={};
  if(SUPA.ready()&&APP.groupId&&roomIds.length){
    try{
      // uma consulta só pra todos os jogos
      const rows=await sb("entries?room_id=in.("+roomIds.join(",")+")&group_id=eq."+APP.groupId+"&select=*&limit=5000");
      for(const e of (rows||[])){(byRoom[e.room_id]=byRoom[e.room_id]||[]).push(e);}
    }catch(e){ /* fallback: deixa vazio, funções tratam */ }
  }
  _entriesCache=byRoom;_entriesCacheKey=key+"|"+roomIds.sort().join(",");
  return byRoom;
}
function clearEntriesCache(){_entriesCache=null;_entriesCacheKey=null;}
async function loadProfileStats(username){
  // baldes: geral + por modo. modo: avulsa | select | full | boost
  const buckets={geral:_blankStats(),avulsa:_blankStats(),full:_blankStats(),boost:_blankStats(),confianca:_blankStats(),previsao:_blankStats()};
  if(!SUPA.ready()||!APP.groupId)return _finalizeStats(buckets.geral)&&{...buckets,_byMode:true};
  // mapa round_id → modo
  const roundById={};
  for(const r of (APP.rounds||[]))roundById[r.id]=r;
  const arq=APP.jogos.filter(j=>{const g=window.GAMES.data[j.room_id];return g&&g.match&&g.match.status==="finished";});
  const allEntries=await loadAllFinishedEntries();
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    let entries=allEntries[j.room_id];
    if(!entries||!entries.length)continue;
    entries=entries.filter(e=>!(e.username===username&&e.hidden_profile===true));
    // separa minhas entries por modo (pode ter várias por jogo)
    const minhas=entries.filter(e=>e.username===username&&e.slots&&Object.values(e.slots).some(Boolean));
    if(!minhas.length)continue;
    for(const myEntry of minhas){
      const mode=myEntry.round_id?(roundById[myEntry.round_id]?modeOf(roundById[myEntry.round_id]):"full"):"avulsa";
      // SELECIONE (legado): só conta entries travadas (confirmed)
      if(mode==="select"&&myEntry.confirmed!==true)continue;
      // ranking do jogo NAQUELE modo (pra posição): compara entries do mesmo round_id
      const rid=myEntry.round_id||null;
      const sameScope=entries.filter(e=>(e.round_id||null)===rid&&e.slots&&Object.values(e.slots).some(Boolean));
      const scored=sameScope.map(e=>scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx)).sort((a,b)=>b.total-a.total);
      const myIdx=scored.findIndex(s=>s.username===username);
      const me=scored[myIdx]||scoreEntryFor(JSON.parse(JSON.stringify(myEntry)),ctx.eng,ctx);
      _accumStats(buckets[mode]||buckets.geral,me,myIdx<0?0:myIdx,j,ctx);
      _accumStats(buckets.geral,me,myIdx<0?0:myIdx,j,ctx);
    }
  }
  for(const k in buckets)_finalizeStats(buckets[k]);
  buckets._byMode=true;
  return buckets;
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
  const allEntries=await loadAllFinishedEntries();
  for(const j of arq){
    const ctx=buildCtxFor(j.room_id);if(!ctx)continue;
    let entries=allEntries[j.room_id];
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
  // modo Selecione foi descontinuado: esconde qualquer rodada select remanescente da UI
  APP.rounds=(APP.rounds||[]).filter(r=>modeOf(r)!=="select");
  // carrega os jogos (round_rooms) de TODAS as mini rodadas de uma vez,
  // pra saber quais rodadas já terminaram (todos os jogos finalizados).
  try{
    const ids=(APP.rounds||[]).map(r=>r.id);
    if(ids.length){
      const rrs=await sb("round_rooms?round_id=in.("+ids.join(",")+")&select=round_id,room_id,status");
      const byRound={};
      for(const rr of (rrs||[])){(byRound[rr.round_id]=byRound[rr.round_id]||[]).push(rr);}
      APP.roundRoomsByRound=byRound;
    }else APP.roundRoomsByRound={};
  }catch(e){APP.roundRoomsByRound=APP.roundRoomsByRound||{};}
}
// ── DETECÇÃO DE "FINALIZADA" (todos os jogos com resultado) ──
// um jogo está finalizado se o match no catálogo está finished
function roomIsFinished(roomId){const g=window.GAMES.data[roomId];return !!(g&&g.match&&g.match.status==="finished");}
// mini rodada finalizada: tem jogos E todos finalizados
function roundIsFinished(roundId){
  const rrs=(APP.roundRoomsByRound&&APP.roundRoomsByRound[roundId])||null;
  if(!rrs||!rrs.length)return false;
  return rrs.every(rr=>roomIsFinished(rr.room_id));
}
// rodada (phase) finalizada: tem mini rodadas E todas finalizadas
function phaseIsFinished(phaseId){
  const rounds=(APP.rounds||[]).filter(r=>r.phase_id===phaseId);
  if(!rounds.length)return false;
  return rounds.every(r=>roundIsFinished(r.id));
}
// liga finalizada: tem rodadas E todas finalizadas
function leagueIsFinished(leagueId){
  const phases=(APP.phases||[]).filter(p=>p.league_id===leagueId);
  if(!phases.length)return false;
  return phases.every(p=>phaseIsFinished(p.id));
}
// arquivamento MANUAL do admin (sobrepõe a detecção automática)
function compIsArchived(kind,id){return (APP.compArchived||[]).includes(kind+":"+id);}
function compIsFinishedView(kind,id){
  if(compIsArchived(kind,id))return true; // admin forçou
  if(kind==="round")return roundIsFinished(id);
  if(kind==="phase")return phaseIsFinished(id);
  if(kind==="league")return leagueIsFinished(id);
  return false;
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
      APP.roundEntries=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+"&select=room_id,slots,captain,tactic,boost,boost_chips,confirmed,conf_rank,pred_home,pred_away");
    }
    // entries de TODOS os membros nesta rodada (escalação completa pra ranking clicável)
    APP.roundAllEntries=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=room_id,username,slots,captain,tactic,boost,boost_chips,confirmed,conf_rank,pred_home,pred_away&limit=2000");
    // status das pools avulsas (pra trava por jogo refletir "Fechar pool" feito na partida avulsa)
    try{APP.groupRooms=await sb("group_rooms?group_id=eq."+APP.groupId+"&select=*");}catch(e){}
  }catch(e){APP.round=null;APP.roundRooms=[];APP.roundEntries=[];APP.roundAllEntries=[];}
  // ranking acumulado da rodada (soma dos pontos de cada um nos jogos finalizados que escolheu)
  APP.roundRanking=await computeRoundRanking(roundId);
}
// soma, por usuário, os pontos dos jogos FINALIZADOS desta rodada
async function computeRoundRanking(roundId){
  try{
    const all=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=*");
    if(!all||!all.length)return [];
    const mode=modeOf(APP.round);
    const isSelect=mode==="select";
    const isConf=mode==="confianca";
    const isPred=mode==="previsao";
    const byUser={};
    // CONFIANÇA: preciso saber o total de jogos rankeados por usuário (pra escala do multiplicador)
    const confTotalByUser={};
    if(isConf){
      for(const e of all){if(e.conf_rank!=null){confTotalByUser[e.username]=(confTotalByUser[e.username]||0)+1;}}
    }
    // ── ELIMINAÇÃO (Impulso/Confiança): quem NÃO completou a estratégia zera a rodada toda.
    // Confiança: tem que ter ordenado TODOS os jogos da rodada.
    // Impulso: tem que ter gastado TODAS as fichas da pool.
    const eliminado={};
    const totalGamesRound=(APP.roundRooms||[]).length;
    const isBoostMode=mode==="boost";
    if(isConf||isBoostMode){
      // usuários que têm pelo menos um time montado na rodada
      const usuarios=[...new Set(all.filter(e=>e.slots&&Object.values(e.slots).some(Boolean)).map(e=>e.username))];
      // QUANTAS fichas a pool tem (modelo novo: boost_chips; antigo: boost_tokens)
      let poolN=0;
      if(isBoostMode){
        const r=APP.round;
        if(r&&Array.isArray(r.boost_chips)&&r.boost_chips.length)poolN=r.boost_chips.length;
        else if(r&&r.boost_tokens)poolN=r.boost_tokens;
      }
      const totalRoomsRound=(APP.roundRooms||[]).length;
      for(const u of usuarios){
        const minhas=all.filter(e=>e.username===u&&e.slots&&Object.values(e.slots).some(Boolean));
        if(isConf){
          // CONFIANÇA: a estratégia exige ter ordenado TODOS os jogos da rodada.
          // (escalar é livre jogo a jogo; quem não escalou um jogo só não pontua nele)
          const ordenados=all.filter(e=>e.username===u&&e.conf_rank!=null).length;
          if(minhas.length>0&&totalRoomsRound>0&&ordenados<totalRoomsRound)eliminado[u]=true;
        }else if(isBoostMode&&poolN>0){
          // QUANTAS fichas o usuário gastou no total, somando os DOIS modelos por entry:
          //  - novo: boost_chips (array de valores) → conta o length
          //  - antigo: boost (número de fichas naquele jogo) → conta o número
          let usadasN=0;
          for(const e of all){
            if(e.username!==u)continue;
            let c=e.boost_chips;
            if(typeof c==="string"){try{c=JSON.parse(c);}catch(_){c=null;}}
            if(Array.isArray(c)&&c.length)usadasN+=c.length;
            else usadasN+=Math.max(0,parseInt(e.boost,10)||0); // fallback modelo antigo
          }
          // elimina só se gastou MENOS fichas que a pool tem
          if(usadasN<poolN)eliminado[u]=true;
        }
      }
    }
    for(const rr of APP.roundRooms){
      const g=window.GAMES.data[rr.room_id];
      if(!g||!g.match||g.match.status!=="finished")continue; // só jogos já apurados
      const ctx=buildCtxFor(rr.room_id);if(!ctx)continue;
      const here=all.filter(e=>e.room_id===rr.room_id);
      for(const e of here){
        if(!e.slots||!Object.values(e.slots).some(Boolean))continue; // sem time montado
        if(isSelect&&e.confirmed!==true)continue; // SELECIONE: só pontua jogo travado
        if(eliminado[e.username])continue; // ELIMINADO: não completou a estratégia → zera
        const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
        let pts=sc.total;
        // CONFIANÇA: multiplica pelo peso da posição na ordem do usuário
        if(isConf&&e.conf_rank!=null){
          const tot=confTotalByUser[e.username]||1;
          pts=Math.round(pts*confMultiplier(e.conf_rank,tot)*10)/10;
        }
        if(!byUser[e.username])byUser[e.username]={username:e.username,total:0,games:0,predBonus:0};
        byUser[e.username].total+=pts;
        byUser[e.username].games++;
        // PREVISÃO: bônus em % sobre os pontos da escalação naquele jogo
        if(isPred&&e.pred_home!=null&&e.pred_away!=null){
          const pct=predBonusPct(e,g.match);
          const b=Math.round(sc.total*(pct/100)*10)/10;
          byUser[e.username].total+=b;
          byUser[e.username].predBonus+=b;
        }
      }
    }
    // adiciona os eliminados ao ranking com total 0 e flag (pra mostrar "eliminado")
    for(const u in eliminado){
      if(!byUser[u])byUser[u]={username:u,total:0,games:0,predBonus:0};
      byUser[u].eliminated=true;
      byUser[u].total=0;
    }
    return Object.values(byUser).map(u=>({...u,total:Math.round(u.total*10)/10})).sort((a,b)=>{
      // eliminados sempre por último
      if(a.eliminated&&!b.eliminated)return 1;
      if(b.eliminated&&!a.eliminated)return -1;
      return b.total-a.total;
    });
  }catch(e){return [];}
}
// % de bônus de previsão: compara o placar cravado com o real do match
function predBonusPct(entry,match){
  const ph=entry.pred_home,pa=entry.pred_away;
  if(ph==null||pa==null||!Array.isArray(match.score))return 0;
  const rh=match.score[0],ra=match.score[1];
  if(rh==null||ra==null)return 0;
  if(ph===rh&&pa===ra)return PRED_EXACT_PCT;              // cravou o placar
  const sign=x=>x>0?1:x<0?-1:0;
  if(sign(ph-pa)===sign(rh-ra))return PRED_RESULT_PCT;    // acertou o resultado (V/E/D)
  return 0;
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
    html+=`<div style="margin-bottom:8px"><div class="bsub" style="border:none;padding:0;margin:0 0 4px">${esc(nome)} · <span style="color:var(--amber)">${sc.total.toFixed(1)} pts</span>${sc.boostPct?` <span class="statuspill" style="background:color-mix(in srgb,${sc.boostPct<0?"#FF6B6B":"#FFC247"} 22%,transparent);color:${sc.boostPct<0?"#FF6B6B":"#FFC247"}">⚡ ${sc.boostPct<0?"":"+"}${sc.boostPct}%</span>`:""}</div>`;
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
  const _chips=Array.isArray(entry.boost_chips)?entry.boost_chips:null;
  const tkPct=_chips&&_chips.length?_chips.reduce((s,v)=>s+(Number(v)||0),0):(parseInt(entry.boost,10)||0)*BOOST_PCT;
  const mode=modeOf(APP.round);
  let html=`<div style="background:rgba(255,255,255,.03);border-radius:10px;padding:8px 10px;margin:2px 0 8px 6px;border-left:2px solid var(--line)">`;
  html+=`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Tática: ${esc(tacName)}${tkPct?` · <span style="color:${tkPct<0?"#FF6B6B":"#FFC247"}">⚡ ${tkPct<0?"":"+"}${tkPct}%</span>`:""}</div>`;
  // ── estratégia revelada por modo ──
  if(mode==="previsao"&&entry.pred_home!=null&&entry.pred_away!=null&&g){
    let selo="";
    if(finished&&Array.isArray(g.match.score)){
      const pct=predBonusPct(entry,g.match);
      if(pct===PRED_EXACT_PCT){
        selo=` <span style="display:inline-block;font-size:10px;font-weight:900;color:#0A0E1C;background:#54E0A8;border-radius:6px;padding:2px 7px;margin-left:4px">🎯 CRAVOU! +${PRED_EXACT_PCT}%</span>`;
      }else if(pct===PRED_RESULT_PCT){
        selo=` <span style="display:inline-block;font-size:10px;font-weight:800;color:#54E0A8;border:1px solid #54E0A8;border-radius:6px;padding:2px 7px;margin-left:4px">✓ acertou o resultado · +${PRED_RESULT_PCT}%</span>`;
      }else{
        selo=` <span style="display:inline-block;font-size:10px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:2px 7px;margin-left:4px">errou o palpite</span>`;
      }
    }
    const realStr=finished&&Array.isArray(g.match.score)?` <span style="color:var(--dim);font-weight:600">(real: ${g.match.score[0]}×${g.match.score[1]})</span>`:"";
    html+=`<div style="font-size:12px;font-weight:800;color:#54E0A8;margin-bottom:6px">🔮 Palpite: ${esc(g.prepool.home.code)} ${entry.pred_home} × ${entry.pred_away} ${esc(g.prepool.away.code)}${realStr}${selo}</div>`;
  }
  if(mode==="confianca"){
    // ordem COMPLETA de confiança do amigo (todos os jogos que ele ordenou)
    const mine=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&e.conf_rank!=null).sort((a,b)=>a.conf_rank-b.conf_rank);
    if(mine.length){
      const tot=mine.length;
      const itens=mine.map(e=>{const gg=window.GAMES.data[e.room_id];const nm=gg?gg.prepool.home.code+"×"+gg.prepool.away.code:"?";const aqui=e.room_id===roomId;return `<span style="display:inline-block;font-size:10px;font-weight:800;color:#C77DFF;border:1px solid ${aqui?"#C77DFF":"rgba(199,125,255,.4)"};border-radius:6px;padding:1px 6px;margin:0 3px 3px 0;${aqui?"background:color-mix(in srgb,#C77DFF 18%,transparent)":""}">${e.conf_rank+1}º ${esc(nm)} ${confMultiplier(e.conf_rank,tot).toFixed(2)}x</span>`;}).join("");
      html+=`<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--dim);margin-bottom:3px">📊 Ordem de confiança completa:</div>${itens}</div>`;
    }
  }
  if(mode==="boost"){
    // onde o amigo gastou os impulsos (todos os jogos da rodada)
    const mineAll=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&Array.isArray(e.boost_chips)&&e.boost_chips.length);
    if(mineAll.length){
      const itens=mineAll.map(e=>{const gg=window.GAMES.data[e.room_id];const nm=gg?gg.prepool.home.code+"×"+gg.prepool.away.code:"?";const soma=e.boost_chips.reduce((s,v)=>s+(Number(v)||0),0);const aqui=e.room_id===roomId;return `<span style="display:inline-block;font-size:10px;font-weight:800;color:${soma<0?"#FF6B6B":"#FFC247"};border:1px solid ${aqui?(soma<0?"#FF6B6B":"#FFC247"):"rgba(255,194,71,.4)"};border-radius:6px;padding:1px 6px;margin:0 3px 3px 0;${aqui?"background:color-mix(in srgb,#FFC247 14%,transparent)":""}">${esc(nm)} ${soma<0?"":"+"}${soma}%</span>`;}).join("");
      html+=`<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--dim);margin-bottom:3px">⚡ Onde gastou os impulsos:</div>${itens}</div>`;
    }
  }
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
      // ── decomposição base → ajuste → total (mesmo layout nos 3 modos) ──
      // sc.total já vem COM impulso aplicado (boostMult). A base sem impulso é sc.total/boostMult.
      const baseSemBoost=sc.boostMult&&sc.boostMult!==1?Math.round((sc.total/sc.boostMult)*10)/10:sc.total;
      let ajusteLinhas="",base=sc.total,total=sc.total,baseLabel="";
      if(mode==="previsao"&&entry.pred_home!=null&&entry.pred_away!=null&&Array.isArray(g.match.score)){
        const pct=predBonusPct(entry,g.match);
        base=sc.total; total=sc.total;
        if(pct>0){
          const predB=Math.round(sc.total*(pct/100)*10)/10;
          total=Math.round((sc.total+predB)*10)/10;
          const lbl=pct===PRED_EXACT_PCT?"🎯 Bônus cravou placar":"✓ Bônus acertou resultado";
          ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:#54E0A8">${lbl} (+${pct}%)</span><span class="mono" style="color:#54E0A8">+${predB.toFixed(1)}</span></div>`;
          baseLabel="só a escalação (sem palpite)";
        }
      }else if(mode==="boost"&&sc.boostPct){
        // impulso: base (sem impulso) → ajuste ± % → total impulsionado (sc.total)
        base=baseSemBoost; total=sc.total;
        const dif=Math.round((sc.total-baseSemBoost)*10)/10;
        const pos=sc.boostPct>=0;
        ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:${pos?"#FFC247":"#FF6B6B"}">⚡ Impulso (${pos?"+":""}${sc.boostPct}%)</span><span class="mono" style="color:${pos?"#FFC247":"#FF6B6B"}">${pos?"+":""}${dif.toFixed(1)}</span></div>`;
        baseLabel="só a escalação (sem impulso)";
      }else if(mode==="confianca"&&entry.conf_rank!=null){
        // confiança: base → ×multiplicador da posição → total
        const tot=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&e.conf_rank!=null).length||1;
        const mult=confMultiplier(entry.conf_rank,tot);
        base=sc.total; total=Math.round(sc.total*mult*10)/10;
        const dif=Math.round((total-sc.total)*10)/10;
        const pos=dif>=0;
        ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:#C77DFF">📊 Confiança ${entry.conf_rank+1}º (${mult.toFixed(2)}x)</span><span class="mono" style="color:${pos?"#54E0A8":"#FF6B6B"}">${pos?"+":""}${dif.toFixed(1)}</span></div>`;
        baseLabel="só a escalação (sem confiança)";
      }
      html+=ajusteLinhas;
      html+=`<div class="line" style="padding:5px 0 0;border-top:1px solid var(--line);margin-top:4px"><span style="font-weight:700">Total</span><span class="mono" style="color:var(--amber);font-weight:700">${total.toFixed(1)}</span></div>`;
      if(ajusteLinhas&&baseLabel)html+=`<div class="line" style="padding:1px 0 0"><span style="font-size:10px;color:var(--dim)">${baseLabel}</span><span class="mono" style="font-size:10px;color:var(--dim)">${base.toFixed(1)}</span></div>`;
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
// EXCEÇÃO: se o admin REABRIU a pool daquele jogo (status "open" mesmo após o kickoff),
// a trava por horário é vencida — vale pra TODOS os modos (avulso, previsão, etc.),
// liberando só AQUELE jogo (escalação e palpite). Jogo finalizado nunca reabre.
function roomReopened(roomId){
  // só "reaberto de propósito" vence a trava por horário. A flag reopened é setada
  // pelo admin ao reabrir a pool (setPoolStatus). Um jogo que nunca foi fechado NÃO
  // conta como reaberto — ele ainda trava no kickoff (pra ninguém editar sabendo o rumo do jogo).
  const gr=(APP.groupRooms||[]).find(x=>x.room_id===roomId);
  if(gr&&gr.reopened===true&&gr.status==="open")return true;
  const rr=(APP.roundRooms||[]).find(x=>x.room_id===roomId);
  if(rr&&rr.reopened===true&&rr.status==="open")return true;
  return false;
}
function roomTimeLocked(roomId){
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished")return true; // finalizado nunca reabre
  // se o admin reabriu/manteve a pool aberta, a trava por horário não se aplica a este jogo
  if(roomReopened(roomId))return false;
  const idx=(APP.jogos||[]).find(j=>j.room_id===roomId);
  if(idx&&idx.kickoff){const k=new Date(idx.kickoff);if(!isNaN(k)&&Date.now()>=k.getTime())return true;}
  return false;
}
// trava manual do admin: pool fechada na rodada (round_rooms) OU na partida avulsa (group_rooms)
function roomAdminLocked(roomId){
  const rr=APP.roundRooms.find(x=>x.room_id===roomId);
  if(rr&&rr.status&&rr.status!=="open")return true;
  // robustez: se a pool avulsa daquele jogo está fechada, a escalação também trava
  const gr=(APP.groupRooms||[]).find(x=>x.room_id===roomId);
  if(gr&&gr.status&&gr.status!=="open")return true;
  return false;
}
// escalação travada para o jogador (qualquer um dos dois)
function roomLockedInRound(roomId){
  return roomAdminLocked(roomId)||roomTimeLocked(roomId);
}
// ── MODO IMPULSO ──
// 1º kickoff da rodada (ISO mais cedo entre os jogos da rodada). Impulsos travam aqui.
// 1ª partida da rodada (a primeira que foi adicionada / ordem dos round_rooms)
// trava da parte ESTRATÉGICA (ordem de confiança / fichas de impulso / palpites globais):
// trava assim que QUALQUER partida da rodada for fechada MANUALMENTE (pool fechada pelo dev).
// (a 1ª partida a começar já dá vantagem de informação pra quem ajustaria depois.)
// ─────────────────────────────────────────────────────────────
// TRAVA DA DISTRIBUIÇÃO (fichas de impulso / ordem de confiança / palpites de previsão)
// Regras (valem igual pros 3 modos):
//  • Trava: assim que QUALQUER partida da rodada é fechada MANUALMENTE (pool). Jogo só finalizado NÃO trava.
//  • Trava MANUAL: o dev pode forçar o fechamento a qualquer momento (boost_forced_lock).
//  • REABERTURA: só o dev reabre (boost_reopened). Vale tanto contra a trava automática
//    quanto contra a manual. Enquanto não há trava nenhuma, o player edita/confirma livremente.
// Resultado: o player NUNCA reabre sozinho depois de travado; só o dev.
// ─────────────────────────────────────────────────────────────
function anyGameLockedInRound(){
  const rrs=APP.roundRooms||[];
  // SÓ fechamento manual do dev trava a parte estratégica (palpite/confiança/impulso).
  // Um jogo apenas finalizado NÃO trava — a trava é sempre uma ação manual.
  return rrs.some(rr=>roomAdminLocked(rr.room_id));
}
function boostLocked(){
  const r=APP.round; if(!r)return false;
  if(r.boost_forced_lock===true) return true;   // dev forçou fechamento → travado (prioridade)
  if(r.boost_reopened===true) return false;       // dev reabriu → liberado
  return anyGameLockedInRound();                  // automático: alguma partida fechou/finalizou
}
// === IMPULSO v2: fichas com valores específicos ===
// a pool define APP.round.boost_chips = lista de valores, ex [25,15,15,-20].
// cada entry guarda boost_chips = valores das fichas atribuídas àquele jogo.
function poolChips(){
  const r=APP.round;
  if(r&&Array.isArray(r.boost_chips)&&r.boost_chips.length)return r.boost_chips.map(v=>Number(v)||0);
  // retrocompat: pool antiga (só boost_tokens) → N fichas de BOOST_PCT
  const n=r?(r.boost_tokens||0):0;return Array(n).fill(BOOST_PCT);
}
function boostMaxPerGame(){const r=APP.round;return r&&r.boost_max_per_game?r.boost_max_per_game:(r&&r.boost_chips&&r.boost_chips.length?0:BOOST_MAX_PER_GAME);}
function boostMinGames(){const r=APP.round;return r&&r.boost_min_games?r.boost_min_games:0;}
function boostNoMix(){const r=APP.round;return !!(r&&r.boost_no_mix);}
// ===== CONFIANÇA =====
// conf_rank é 0-based: 0 = mais confia. Guardado na entry de cada jogo.
function confRankOf(roomId){const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);return e&&e.conf_rank!=null?e.conf_rank:null;}
function confRankedCount(){return (APP.roundEntries||[]).filter(e=>e.conf_rank!=null).length;}
// lista de entries rankeadas, em ordem
function confOrdered(){return (APP.roundEntries||[]).filter(e=>e.conf_rank!=null).slice().sort((a,b)=>a.conf_rank-b.conf_rank);}
async function confAdd(roomId){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  let e=await ensureEntry(roomId);
  if(!e){toast("Erro ao preparar este jogo.");return;}
  if(e.conf_rank!=null)return;
  const next=confRankedCount(); // entra no fim
  try{await sbUpdate("entries",{conf_rank:next,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));await loadRound(APP.roundId);render();}
  catch(e2){toast("Erro: "+e2.message);}
}
async function confRemove(roomId){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const ord=confOrdered().filter(e=>e.room_id!==roomId);
  try{
    // tira este e reindexa os demais
    await sbUpdate("entries",{conf_rank:null,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    for(let i=0;i<ord.length;i++){if(ord[i].conf_rank!==i)await sbUpdate("entries",{conf_rank:i},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${ord[i].room_id}`);}
    await loadRound(APP.roundId);render();
  }catch(e2){toast("Erro: "+e2.message);}
}
async function confMove(roomId,delta){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const ord=confOrdered();
  const idx=ord.findIndex(e=>e.room_id===roomId);
  if(idx<0)return;
  const swap=idx+delta;
  if(swap<0||swap>=ord.length)return;
  const a=ord[idx],b=ord[swap];
  try{
    await sbUpdate("entries",{conf_rank:swap,confirmed:false,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${a.room_id}`);
    await sbUpdate("entries",{conf_rank:idx,confirmed:false,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${b.room_id}`);
    await loadRound(APP.roundId);render();
  }catch(e2){toast("Erro: "+e2.message);}
}
// ===== PREVISÃO =====
function predOf(roomId){const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);if(!e)return null;if(e.pred_home==null&&e.pred_away==null)return null;return {home:e.pred_home,away:e.pred_away};}
async function predSet(roomId,homeVal,awayVal){
  if(roomLockedInRound(roomId)){toast("Esta partida já travou — o palpite dela não muda mais.");return;}
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  if(!e){toast("Monte o time deste jogo primeiro.");return;}
  const patch={confirmed:false,updated_at:new Date().toISOString()};
  if(homeVal!==null){let h=parseInt(homeVal,10);patch.pred_home=isNaN(h)?null:Math.max(0,h);}
  if(awayVal!==null){let a=parseInt(awayVal,10);patch.pred_away=isNaN(a)?null:Math.max(0,a);}
  try{await sbUpdate("entries",patch,entryFilter(roomId));await loadRound(APP.roundId);render();}
  catch(e2){toast("Erro: "+e2.message);}
}
// fichas que o jogador já atribuiu (lista achatada de valores, por todos os jogos da rodada)
function chipsAssigned(){
  const out=[];
  for(const e of (APP.roundEntries||[])){const c=e.boost_chips;if(Array.isArray(c))for(const v of c)out.push(Number(v)||0);}
  return out;
}
// fichas ainda disponíveis = pool menos as já atribuídas (casando por valor)
function chipsAvailable(){
  const pool=poolChips().slice();
  for(const v of chipsAssigned()){const i=pool.indexOf(v);if(i>=0)pool.splice(i,1);}
  return pool;
}
// fichas (valores) que ESTE usuário pôs num jogo específico
function chipsOn(roomId){
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  const c=e&&e.boost_chips;return Array.isArray(c)?c.map(v=>Number(v)||0):[];
}
// atribui uma ficha (de um valor) a um jogo; ou remove (signRemove=valor a tirar)
async function assignChip(roomId,value){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  let e=await ensureEntry(roomId);
  if(!e){toast("Erro ao preparar este jogo.");return;}
  // tem essa ficha disponível?
  const avail=chipsAvailable();
  if(avail.indexOf(value)<0){toast("Você não tem mais uma ficha de "+(value<0?value:"+"+value)+"%.");return;}
  const cur=chipsOn(roomId).slice();
  const mx=boostMaxPerGame();
  if(mx>0&&cur.length>=mx){toast("Máximo de "+mx+" ficha(s) por partida.");return;}
  // regra "não misturar": neste jogo, só positivas OU só negativas
  if(boostNoMix()&&cur.length){
    const temNeg=cur.some(v=>v<0), temPos=cur.some(v=>v>0);
    if((value<0&&temPos)||(value>0&&temNeg)){
      toast("Nesta pool não dá pra juntar fichas positivas e negativas no mesmo jogo.");return;
    }
  }
  cur.push(value);
  try{
    await sbUpdate("entries",{boost_chips:cur,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);render();
  }catch(e2){toast("Erro: "+e2.message);}
}
async function unassignChip(roomId,value){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  const cur=chipsOn(roomId).slice();
  const i=cur.indexOf(value);if(i<0)return;cur.splice(i,1);
  try{
    await sbUpdate("entries",{boost_chips:cur,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);render();
  }catch(e2){toast("Erro: "+e2.message);}
}
// nº de tokens que ESTE usuário já gastou na rodada (retrocompat — usa a lista nova)
function boostUsed(){return chipsAssigned().length;}
function boostLeft(){return chipsAvailable().length;}
// quantos tokens ESTE usuário pôs num jogo específico
function boostOn(roomId){return chipsOn(roomId).length;}
// ajusta tokens de impulso num jogo (retrocompat para pools antigas: +1/−1 com fichas iguais)
async function changeBoost(roomId,delta){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  if(delta>0){
    let e=await ensureEntry(roomId);
    if(!e){toast("Erro ao preparar este jogo.");return;}
    const avail=chipsAvailable();if(!avail.length){toast("Você já gastou todas as suas fichas.");return;}
    // pega a ficha de maior valor disponível (comportamento antigo: todas iguais)
    return assignChip(roomId,avail.sort((a,b)=>b-a)[0]);
  }else{
    const cur=chipsOn(roomId);if(!cur.length)return;
    return unassignChip(roomId,cur[cur.length-1]);
  }
}
// IMPULSO — confirmar/reabrir a distribuição de tokens. Usa entry.confirmed (sem outro uso no boost).
// Reeditável até a 1ª partida ser fechada (boostLocked).
function boostConfirmed(){
  const es=(APP.roundEntries||[]);
  if(!es.length)return false;
  // confirmado = todas as entries do usuário marcadas confirmed
  return es.every(e=>e.confirmed===true);
}
async function toggleBoostConfirm(){
  if(boostLocked()){toast("Já travou (a 1ª partida foi fechada).");return;}
  const willConfirm=!boostConfirmed();
  const mode=modeOf(APP.round);
  if(willConfirm){
    if(mode==="boost"){
      // precisa ter distribuído TODAS as fichas (inclusive as negativas obrigatórias)
      const left=chipsAvailable();
      if(left.length){
        const neg=left.filter(v=>v<0).length;
        toast(neg?`Você ainda tem ${left.length} ficha(s) por usar, incluindo ${neg} negativa(s) obrigatória(s).`:`Você ainda tem ${left.length} ficha(s) de impulso por distribuir.`);
        return;
      }
      const mg=boostMinGames();
      if(mg>0){
        const jogosComFicha=(APP.roundEntries||[]).filter(e=>Array.isArray(e.boost_chips)&&e.boost_chips.length).length;
        if(jogosComFicha<mg){toast(`Distribua suas fichas em pelo menos ${mg} partidas diferentes (hoje em ${jogosComFicha}).`);return;}
      }
    }else if(mode==="confianca"){
      // a ORDEM independe da escalação: basta ter todos os jogos da rodada na ordem de confiança.
      // (a escalação de cada jogo é livre até aquela partida começar)
      const ordenados=(APP.roundEntries||[]).filter(e=>e.conf_rank!=null).length;
      const faltam=APP.roundRooms.length-ordenados;
      if(faltam>0){toast(`Coloque todos os jogos na sua ordem de confiança (faltam ${faltam}).`);return;}
    }else if(mode==="previsao"){
      const montados=(APP.roundEntries||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean));
      const semPalpite=montados.filter(e=>e.pred_home==null||e.pred_away==null);
      if(montados.length<APP.roundRooms.length){toast("Escale todos os jogos antes de confirmar os palpites.");return;}
      if(semPalpite.length){toast(`Crave o placar de todos os jogos (faltam ${semPalpite.length}).`);return;}
    }
  }
  const msgOn=mode==="confianca"?"Ordem confirmada! (dá pra reeditar até o 1º jogo)":mode==="previsao"?"Palpites confirmados! (dá pra reeditar até o 1º jogo)":"Impulsos confirmados! (dá pra reeditar até o 1º jogo)";
  const msgOff=mode==="confianca"?"Ordem reaberta pra edição.":mode==="previsao"?"Palpites reabertos pra edição.":"Impulsos reabertos pra edição.";
  try{
    await sbUpdate("entries",{confirmed:willConfirm,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await loadRound(APP.roundId);
    toast(willConfirm?msgOn:msgOff);
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
function setAddGameTab(t){APP.addGameTab=t;render();}
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
function setHomeNav(t){APP.homeNavTab=t;render();window.scrollTo(0,0);}
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
  const navTab=APP.homeNavTab||"partidas";
  const nMini=APP.rounds.filter(r=>!r.phase_id).length;
  const nRod=(APP.phases||[]).filter(p=>!p.league_id).length;
  const nLig=(APP.leagues||[]).length;
  const navBtn=(t,ic,label,n)=>`<div class="navtab${navTab===t?" on":""}" onclick="setHomeNav('${t}')"><span class="ic">${ic}</span> ${label}${n?` <span class="ct">(${n})</span>`:""}</div>`;
  // painel da aba PARTIDAS (busca + lista de jogos)
  const partidasPanel=`<div class="card">
    <div style="position:relative;margin-bottom:10px">
      <input id="homeSearchInput" class="input" style="margin:0;padding-left:38px" placeholder="🔍 Buscar partida pelo nome do time…" value="${esc(APP.homeSearch||"")}" oninput="setHomeSearch(this.value)" autocorrect="off" />
      ${q?`<span onclick="setHomeSearch('')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--dim)">✕</span>`:""}
    </div>
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
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:var(--amber)">${esc(APP.groupName||"Salas")}</div>
      <div class="userchip" onclick="leaveGroupView()" style="cursor:pointer">⇄ trocar grupo</div>
    </div>
    <div onclick="event.stopPropagation();go('members')" style="display:flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--line);background:var(--panel2);border-radius:99px;padding:6px 12px;width:fit-content">
      <span style="font-size:13px">👥</span><span style="font-size:12px;font-weight:700;color:var(--chalk)">Membros do grupo</span><span style="color:var(--dim);font-size:12px">›</span>
    </div>
  </div>
  <div class="navtabs">
    ${navBtn("partidas","⚽","Partidas",0)}
    ${navBtn("mini","🎯","Mini-rodadas",nMini)}
    ${navBtn("rodadas","📅","Rodadas",nRod)}
    ${navBtn("ligas","🏆","Ligas",nLig)}
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
    let posN=0;
    rk.forEach((u,i)=>{
      const me=u.username===APP.user?.username;
      const open=APP._openRoundUser===u.username;
      if(u.eliminated){
        const motivo=modeOf(APP.round)==="confianca"?"não ordenou todos os jogos":"não distribuiu todas as fichas";
        html+=`<div class="rank${me?" me":""}" style="opacity:.7"><div class="po mono" style="color:var(--red)">✗</div><div class="nm">${esc(u.username)}<small style="color:var(--red)">eliminado · ${motivo}</small></div><div class="pt mono" style="color:var(--red)">0.0</div></div>`;
        return;
      }
      posN++;
      html+=`<div class="rank${me?" me":""}" onclick="toggleRoundUser('${encodeURIComponent(u.username)}')" style="cursor:pointer"><div class="po mono">${posN}º</div><div class="nm">${esc(u.username)}<small>${u.games} jogo${u.games>1?"s":""} apurado${u.games>1?"s":""} · toque pra ${open?"fechar":"ver time"}</small></div><div class="pt mono">${u.total.toFixed(1)}</div></div>`;
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
    const nome=g?g.prepool.home.name+" × "+g.prepool.away.name:rr.room_id;
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
function setCompTab(kind,k){APP.compTab[kind]=k;render();}
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
  const order=["full","boost","confianca","previsao"];
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
function setCreateMode(mk){if(APP.confirm){const n=$("rndName");if(n)APP.confirm.draftName=n.value;APP.confirm.newMode=mk;render();}}
function toggleModeGroup(mk){APP.openModes[mk]=!APP.openModes[mk];render();}

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
    const unlinkBtn=isAdmin()?`<span onclick="event.stopPropagation();unlinkPhaseFromLeague('${p.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.55" title="Desvincular da liga (vira avulsa)">🔗</span>`:"";
    html+=`<div class="roomrow" onclick="enterPhase('${p.id}')"><div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">toque pra ver as mini rodadas</div></div><div style="display:flex;align-items:center;gap:6px">${unlinkBtn}<span class="statuspill st-finished">VER</span></div></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreatePhase('${l.id}')">+ Criar rodada nesta liga</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Rodadas avulsas (sem liga) — toque pra adicionar, ou exclua de vez:</p>`;
      fora.forEach(p=>{html+=`<div class="roomrow"><div class="info" onclick="addPhaseToLeague('${p.id}')" style="cursor:pointer"><div class="nm">${esc(p.name)}</div><div class="meta">adicionar a esta liga</div></div><div style="display:flex;align-items:center;gap:6px"><span onclick="event.stopPropagation();addPhaseToLeague('${p.id}')" class="statuspill st-closed" style="cursor:pointer">+ ADD</span><span onclick="event.stopPropagation();askDeletePhase('${p.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir rodada de vez">🗑</span></div></div>`;});
    }
    html+=`</div>`;
  }
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
    const unlinkBtn=isAdmin()?`<span onclick="event.stopPropagation();unlinkRoundFromPhase('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.55" title="Desvincular da rodada (vira avulsa)">🔗</span>`:"";
    const delBtn=isAdmin()?`<span onclick="event.stopPropagation();askDeleteRound('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir mini rodada de vez">🗑</span>`:"";
    html+=`<div class="roomrow" onclick="enterRound('${r.id}')"><div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">escolha ${r.pick_limit} jogos</div></div><div style="display:flex;align-items:center;gap:6px">${unlinkBtn}${delBtn}<span class="statuspill ${r.status==="open"?"st-open":"st-closed"}">${r.status==="open"?"ABERTA":"FECHADA"}</span></div></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · MINI RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreateRoundInPhase('${ph.id}')">+ Criar mini rodada aqui</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Mini rodadas avulsas — toque pra adicionar, ou exclua de vez:</p>`;
      fora.forEach(r=>{html+=`<div class="roomrow"><div class="info" onclick="addRoundToPhase('${r.id}')" style="cursor:pointer"><div class="nm">${esc(r.name)}</div><div class="meta">adicionar a esta rodada</div></div><div style="display:flex;align-items:center;gap:6px"><span onclick="event.stopPropagation();addRoundToPhase('${r.id}')" class="statuspill st-closed" style="cursor:pointer">+ ADD</span><span onclick="event.stopPropagation();askDeleteRound('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir mini rodada de vez">🗑</span></div></div>`;});
    }
    html+=`</div>`;
  }
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
function askCreateRoundInPhase(phaseId){APP.confirm={mode:"createRound",newMode:"full",phaseId,label:"Criar mini rodada"};render();}
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
// DESVINCULAR: tira o vínculo (NÃO apaga). O item volta pra lista de avulsos da sua aba.
async function unlinkPhaseFromLeague(phaseId){
  if(!isAdmin())return;
  try{
    await sbUpdate("phases",{league_id:null},`id=eq.${phaseId}`);
    await loadPhases();if(APP.leagueId)await loadLeague(APP.leagueId);
    toast("Rodada desvinculada — voltou a ser avulsa.");render();
  }catch(e){toast("Erro: "+e.message);}
}
async function unlinkRoundFromPhase(roundId){
  if(!isAdmin())return;
  try{
    await sbUpdate("rounds",{phase_id:null},`id=eq.${roundId}`);
    await loadRounds();if(APP.phaseId)await loadPhase(APP.phaseId);
    toast("Mini rodada desvinculada — voltou a ser avulsa.");render();
  }catch(e){toast("Erro: "+e.message);}
}

// ----- RODADAS: tela de uma rodada -----
function roundHTML(){
  const r=APP.round;
  if(!r)return `<div class="card"><p class="p">Rodada não encontrada.</p><button class="btn ghost" onclick="leaveRound()">← Voltar</button></div>`;
  const mode=modeOf(r);
  const mm=modeMeta(r);
  const isSelect=mode==="select";
  const isBoost=mode==="boost";
  const isConf=mode==="confianca";
  const isPred=mode==="previsao";
  // confiança e previsão se comportam como o impulso na escalação: escala todos, trava no 1º jogo
  const isAllGames=isBoost||isConf||isPred||mode==="full";
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
    // controle de IMPULSO (modo boost): atribuir fichas (com valores), enquanto não travou
    let boostCtrl="";
    if(isBoost&&!finished){
      const myChips=chipsOn(rid);                 // fichas neste jogo (valores)
      const sumPct=myChips.reduce((s,v)=>s+v,0);
      const chipPill=v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;return `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:800;color:${col};border:1px solid ${col};border-radius:8px;padding:3px 8px;height:26px;box-sizing:border-box;background:color-mix(in srgb,${col} 16%,transparent)">⚡${neg?v:"+"+v}%</span>`;};
      if(bLocked){
        boostCtrl=myChips.length?`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${myChips.map(chipPill).join("")}<span style="font-weight:800;color:${sumPct<0?"#FF6B6B":mm.color};font-size:13px;margin-left:2px">=${sumPct<0?"":"+"}${sumPct}%</span></div>`:"";
      }else{
        const avail=chipsAvailable();
        // fichas já neste jogo: clicáveis pra remover
        const here=myChips.map(v=>`<span onclick="event.stopPropagation();unassignChip('${rid}',${v})" style="cursor:pointer" title="Remover">${chipPill(v)}</span>`).join("");
        // valores distintos disponíveis pra adicionar
        const distinct=[...new Set(avail)].sort((a,b)=>b-a);
        const addBtns=distinct.map(v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;const n=avail.filter(x=>x===v).length;
          const label=neg?`${v}%`:`+${v}%`;
          return `<button style="display:inline-flex;align-items:center;gap:2px;border-radius:8px;border:1px dashed ${col};background:transparent;color:${col};font-size:10px;font-weight:800;padding:3px 8px;height:26px;cursor:pointer" title="Pôr ficha ${label} (${n} disponível(is))" onclick="event.stopPropagation();assignChip('${rid}',${v})">+ ⚡${label}</button>`;}).join("");
        const dica=team?"":`<span style="font-size:10px;color:var(--dim);margin-left:2px" title="Você pode gastar fichas antes de escalar; lembre de montar o time depois">escale depois</span>`;
        boostCtrl=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${here}${here&&addBtns?'<span style="opacity:.3">|</span>':""}${addBtns}
          ${myChips.length?`<span style="font-weight:800;color:${sumPct<0?"#FF6B6B":mm.color};font-size:13px;margin-left:2px">=${sumPct<0?"":"+"}${sumPct}%</span>`:""}
          ${dica}
        </div>`;
      }
    }
    // controle de CONFIANÇA: ordenar jogos por confiança (setas ↑/↓), mostra multiplicador
    // controle de PREVISÃO: cravar placar (inputs home x away)
    let extraCtrl="";
    if(isConf&&!finished){
      const myRank=confRankOf(rid);                  // posição na ordem (0-based) ou null
      const total=confRankedCount();
      if(bLocked){
        extraCtrl=myRank!=null?`<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:${mm.color}">📊 ${myRank+1}º confiança · <span>${confMultiplier(myRank,total).toFixed(2)}x</span></span>`:`<span style="font-size:11px;color:var(--dim)">sem ordem</span>`;
      }else{
        if(myRank==null){
          extraCtrl=`<button style="border-radius:8px;border:1px dashed ${mm.color};background:transparent;color:${mm.color};font-size:11px;font-weight:800;padding:5px 10px;cursor:pointer" onclick="event.stopPropagation();confAdd('${rid}')">+ pôr na minha ordem de confiança</button>`;
        }else{
          const mult=confMultiplier(myRank,total);
          extraCtrl=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:${mm.color};border:1px solid ${mm.color};border-radius:8px;padding:4px 9px;background:color-mix(in srgb,${mm.color} 14%,transparent)">📊 ${myRank+1}º · ${mult.toFixed(2)}x</span>
            <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Mais confiança" onclick="event.stopPropagation();confMove('${rid}',-1)">↑</button>
            <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Menos confiança" onclick="event.stopPropagation();confMove('${rid}',1)">↓</button>
            <button class="cbtn" style="position:static;width:30px;height:30px;color:var(--red);border-color:var(--red)" title="Tirar da ordem" onclick="event.stopPropagation();confRemove('${rid}')">×</button>
          </div>`;
        }
      }
    }
    if(isPred&&!finished){
      const pr=predOf(rid); // {home,away} ou null
      const predLocked=locked; // trava por jogo: junto com a escalação daquele jogo
      if(predLocked){
        extraCtrl=pr?`<span style="font-size:13px;font-weight:800;color:${mm.color}">🔮 cravou ${pr.home} × ${pr.away}</span>`:`<span style="font-size:11px;color:var(--dim)">sem palpite</span>`;
      }else if(team){
        const hc=g.prepool.home.code,ac=g.prepool.away.code;
        extraCtrl=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--dim)">🔮 seu placar:</span>
          <span style="font-weight:800;font-size:12px;color:var(--chalk)">${esc(hc)}</span>
          <input type="number" inputmode="numeric" min="0" value="${pr&&pr.home!=null?pr.home:""}" placeholder="-" style="width:42px;text-align:center;padding:5px;border-radius:8px;border:1px solid ${mm.color};background:var(--panel2);color:var(--chalk);font-weight:800" onclick="event.stopPropagation()" onchange="predSet('${rid}',this.value,null)" />
          <span style="color:var(--dim)">×</span>
          <input type="number" inputmode="numeric" min="0" value="${pr&&pr.away!=null?pr.away:""}" placeholder="-" style="width:42px;text-align:center;padding:5px;border-radius:8px;border:1px solid ${mm.color};background:var(--panel2);color:var(--chalk);font-weight:800" onclick="event.stopPropagation()" onchange="predSet('${rid}',null,this.value)" />
          <span style="font-weight:800;font-size:12px;color:var(--chalk)">${esc(ac)}</span>
        </div>`;
      }else{
        extraCtrl=`<span class="statuspill st-finished" style="opacity:.7">escale p/ cravar placar</span>`;
      }
    }
    // bloco de admin (separado, com divisória sutil)
    let devBlock="";
    if(isAdmin()){
      const devLocked=adminLocked;
      // o cadeado continua clicável mesmo após o jogo começar (admin libera o espiar quando quiser)
      const lockBtn=`<span onclick="event.stopPropagation();setRoundRoomStatus('${rid}','${devLocked?"open":"locked"}')" style="cursor:pointer;font-size:19px;padding:4px;opacity:${devLocked?"1":".6"}" title="${devLocked?"Destravar escalação (liberar p/ todos)":"Travar escalação (libera o espiar p/ todos)"}">${devLocked?"🔓":"🔒"}</span>`;
      devBlock=`<div style="display:flex;gap:14px;align-items:center;margin-left:10px;padding-left:10px;border-left:1px solid var(--line);flex-shrink:0">
        ${lockBtn}
        <span onclick="event.stopPropagation();delRoomFromRound('${rid}')" style="cursor:pointer;font-size:17px;padding:4px;opacity:.45" title="Remover jogo da mini rodada">🗑</span>
      </div>`;
    }
    const lineCtrl=isBoost?boostCtrl:(isConf||isPred?extraCtrl:"");
    const hasLineCtrl=(isBoost||isConf||isPred)&&!finished&&lineCtrl;
    return `<div class="roomrow" ${clickable||finished?`onclick="askEnterRoundGame('${rid}')"`:""} style="border-left:3px solid ${mm.color};${clickable||finished?"":"cursor:default"};${hasLineCtrl?"flex-direction:column;align-items:stretch":""}">
      <div style="display:flex;align-items:flex-start;gap:8px;width:100%">
        <div class="info" style="flex:1;min-width:0"><div class="nm">${esc(j.match_name)}</div><div class="meta">${meta}</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">${tag}${playerBtn||""}${(!isBoost&&!isConf&&!isPred)?boostCtrl:""}${devBlock}</div>
      </div>
      ${hasLineCtrl?`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">${lineCtrl}</div>`:""}
    </div>`;
  }).join("");
  const foraAll=APP.jogos.filter(j=>!APP.roundRooms.some(rr=>rr.room_id===j.room_id)&&!isArchived(j.room_id));
  const addTab=APP.addGameTab||"open"; // 'open' | 'done'
  const foraOpen=foraAll.filter(j=>!roomIsFinished(j.room_id));
  const foraDone=foraAll.filter(j=>roomIsFinished(j.room_id));
  const fora=addTab==="done"?foraDone:foraOpen;
  const addTabsHTML=`<div style="display:flex;gap:6px;margin:14px 0 8px">
    <span onclick="setAddGameTab('open')" style="cursor:pointer;font-size:11px;font-weight:800;padding:5px 12px;border-radius:99px;border:1px solid ${addTab==="open"?mm.color:"var(--line)"};color:${addTab==="open"?mm.color:"var(--dim)"};background:${addTab==="open"?`color-mix(in srgb,${mm.color} 14%,transparent)`:"transparent"}">Em aberto (${foraOpen.length})</span>
    <span onclick="setAddGameTab('done')" style="cursor:pointer;font-size:11px;font-weight:800;padding:5px 12px;border-radius:99px;border:1px solid ${addTab==="done"?mm.color:"var(--line)"};color:${addTab==="done"?mm.color:"var(--dim)"};background:${addTab==="done"?`color-mix(in srgb,${mm.color} 14%,transparent)`:"transparent"}">Finalizadas (${foraDone.length})</span>
  </div>`;
  const foraRows=fora.map(j=>{const fin=roomIsFinished(j.room_id);return `<div class="roomrow" onclick="addRoomToRound('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${fin?"jogo finalizado · ":""}toque para adicionar à mini rodada</div></div>
    <span class="statuspill ${fin?"st-finished":"st-closed"}">+ ADD</span></div>`;}).join("");
  // banner explicativo por modo
  let banner;
  if(isBoost){
    const pool=poolChips();
    const cap=pool.length;
    const bConf=boostConfirmed();
    const avail=chipsAvailable();
    const mx=boostMaxPerGame(),mg=boostMinGames();
    // mostra as fichas que ainda restam, com cor
    const availPills=avail.sort((a,b)=>b-a).map(v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;return `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:${col};border:1px solid ${col};border-radius:8px;padding:3px 8px;background:color-mix(in srgb,${col} 16%,transparent)">⚡${neg?v:"+"+v}%</span>`;}).join(" ");
    const temNeg=pool.some(v=>v<0);
    let regras=[];
    if(mx>0)regras.push(`até ${mx} por partida`);
    if(mg>0)regras.push(`gaste em pelo menos ${mg} partidas diferentes`);
    if(temNeg)regras.push(`fichas <span style="color:#FF6B6B">vermelhas são negativas</span> e também precisam ser usadas`);
    if(boostNoMix())regras.push(`<span style="color:#FF6B6B">não misture</span> positivas e negativas no mesmo jogo`);
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Impulso.</b> Escale TODOS os jogos e distribua suas <b>${cap}</b> ficha(s) nas partidas. Cada ficha aplica seu % nos pontos daquela partida.${regras.length?` Regras: ${regras.join(" · ")}.`:""} ${bLocked?"<b>Impulsos travados</b> (a 1ª partida foi fechada).":`Fichas restantes: ${availPills||"<b>nenhuma — tudo distribuído ✓</b>"}`}</div>
      ${!bLocked?`<button class="btn ${bConf?"ghost":""}" style="margin:0 0 12px;${bConf?"border-color:var(--green);color:var(--green)":"background:#FFC247;color:#0A0E1C"}" onclick="toggleBoostConfirm()">${bConf?"✓ Impulsos confirmados — toque p/ reabrir":"🔒 Confirmar distribuição de impulsos"}</button>`:""}
      ${(!bLocked&&avail.length>0)?`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 14%,transparent);color:var(--red);margin:0 0 12px;font-weight:700">⚠️ ATENÇÃO: você ainda tem <b>${avail.length}</b> ficha(s) sem usar. Se a 1ª partida for fechada antes de você gastar TODAS, você será <b>ELIMINADO</b> e zera a mini rodada inteira. Distribua tudo!</div>`:""}`;
  }else if(isConf){
    const bConf=boostConfirmed();
    const ranked=confRankedCount();
    const totalGames=APP.roundRooms.length;
    const ord=confOrdered();
    // multiplicadores reais desta rodada (dependem de quantos jogos foram ordenados)
    const topMult=ranked>0?confMultiplier(0,ranked):1;
    const lowMult=ranked>1?confMultiplier(ranked-1,ranked):1;
    // mini resumo da ordem atual
    const ordList=ord.map((e,i)=>{const g=window.GAMES.data[e.room_id];const nm=g?g.prepool.home.code+"×"+g.prepool.away.code:"?";const mult=confMultiplier(i,ranked);return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;color:${mm.color};border:1px solid ${mm.color};border-radius:8px;padding:2px 7px;background:color-mix(in srgb,${mm.color} 14%,transparent)">${i+1}º ${esc(nm)} ${mult.toFixed(2)}x</span>`;}).join(" ");
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Confiança.</b> Coloque os jogos em ordem de confiança: do 1º (mais confia) ao último — dá pra ordenar antes de escalar. Os pontos de cada jogo são multiplicados pela posição — quem está no topo rende mais, quem está embaixo rende menos. A escalação de cada jogo é livre até aquela partida começar. ${ranked>1?`Nesta rodada: 1º vale <b>${topMult.toFixed(2)}x</b>, último vale <b>${lowMult.toFixed(2)}x</b>.`:""} ${bLocked?"<b>Ordem travada</b> (a 1ª partida foi fechada).":`Você ordenou <b>${ranked}/${totalGames}</b>.`}
      ${ord.length?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${ordList}</div>`:""}</div>
      ${!bLocked?`<button class="btn ${bConf?"ghost":""}" style="margin:0 0 12px;${bConf?"border-color:var(--green);color:var(--green)":"background:"+mm.color+";color:#0A0E1C"}" onclick="toggleBoostConfirm()">${bConf?"✓ Ordem confirmada — toque p/ reabrir":"🔒 Confirmar ordem de confiança"}</button>`:""}
      ${(!bLocked&&ranked<totalGames)?`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 14%,transparent);color:var(--red);margin:0 0 12px;font-weight:700">⚠️ ATENÇÃO: você ordenou só <b>${ranked}/${totalGames}</b> jogos. Se a 1ª partida for fechada antes de você ordenar TODOS, você será <b>ELIMINADO</b> e zera a mini rodada inteira. Ordene todos os jogos!</div>`:""}`;
  }else if(isPred){
    const totalGames=APP.roundRooms.length;
    const feitos=(APP.roundEntries||[]).filter(e=>e.pred_home!=null&&e.pred_away!=null).length;
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Previsão.</b> Escale TODOS os jogos e crave o placar de cada um. Além dos pontos da escalação: <b>+${PRED_RESULT_PCT}%</b> por acertar o resultado (vitória/empate/derrota) e <b>+${PRED_EXACT_PCT}%</b> por cravar o placar exato. Você cravou <b>${feitos}/${totalGames}</b>. A escalação e o palpite de cada jogo travam quando aquela partida for fechada.</div>`;
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
    <p class="p" style="margin-bottom:8px">${isSelect?"1) Antes da 1ª partida, feche a <b>seleção de jogos</b>. 2) Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha).":"Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha). "+(isBoost?"A distribuição de impulsos trava sozinha quando a 1ª partida é fechada.":isConf?"A ordem de confiança trava sozinha quando a 1ª partida é fechada.":isPred?"No modo Previsão, o palpite de cada jogo trava junto com a escalação daquela partida.":"")}</p>
    ${isSelect?(selLocked
      ? `<button class="btn ghost" onclick="setRoundStatus('open')">🔓 Reabrir seleção de jogos</button>`
      : `<button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setRoundStatus('locked_picks')">🔒 Fechar seleção de jogos</button>`):""}
    ${(isBoost||isConf)?(()=>{
      const nome=isConf?"ordem de confiança":"distribuição de impulsos";
      const travada=boostLocked();
      const auto=anyGameLockedInRound(); // alguma partida fechou (trava automática)
      if(travada){
        // travada (auto ou forçada) → só o dev reabre
        return `<div style="margin-top:10px">
          <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="setDistribLock(false)">${mm.icon} Reabrir ${nome}</button>
          <p class="p" style="font-size:11px;color:var(--dim);margin-top:6px">A ${nome} está <b>travada</b>${auto?" (uma partida já foi fechada)":" (você fechou manualmente)"}. Os jogadores não conseguem editar. ⚠️ Reabrir após uma partida começar permite remanejar vendo como os jogos estão indo — use só se combinado com o grupo.</p>
        </div>`;
      }else{
        // aberta → dev pode forçar o fechamento antes da hora
        return `<div style="margin-top:10px">
          <button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setDistribLock(true)">🔒 Fechar ${nome} agora</button>
          <p class="p" style="font-size:11px;color:var(--dim);margin-top:6px">A ${nome} trava sozinha quando a 1ª partida for fechada. Use este botão se quiser travar antes disso.</p>
        </div>`;
      }
    })():""}
    ${foraAll.length?`<div class="tag" style="margin:14px 0 6px">ADICIONAR JOGOS À MINI RODADA</div>${addTabsHTML}${foraRows||`<p class="p" style="font-size:11px;color:var(--dim)">Nenhum jogo ${addTab==="done"?"finalizado":"em aberto"} pra adicionar.</p>`}`:""}
  </div>`:""}`;
}


function roomHTML(){
  const pp=APP.prepool, m=APP.match, meta=APP.roomMeta;
  const finished=m&&m.status==="finished";
  const open=meta.status==="open";
  return `<div class="scorebar">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="tag">${esc(pp.comp)} · ${esc(pp.venue||"")}</div>
      <div class="userchip" onclick="${APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId)?`go('round',null,'${APP.roundId}')`:"go('home')"}" style="cursor:pointer;flex-shrink:0">← voltar</div>
    </div>
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
    ${(!finished&&open&&hasEntry())?othersEnteredHTML():""}
    ${!finished&&!open?peekTeamsHTML():""}
    ${isAdmin()&&!finished?`<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
      <div class="tag" style="margin-bottom:6px">ADMIN</div>
      ${open
        ?`<button class="btn ghost" onclick="setPoolStatus('closed')">🔒 Fechar pool (trava as escalações)</button>`
        :`<button class="btn ghost" onclick="setPoolStatus('open')">🔓 Reabrir pool</button>`}
      <button class="btn ghost" style="margin-top:8px;color:var(--red);border-color:var(--red)" onclick="resetRoom()">🧹 Limpar times desta sala</button>
    </div>`:""}
  </div>`;
}
async function setPoolStatus(status){
  if(!isAdmin())return;
  try{
    // reopened=true só quando o admin REABRE de propósito (vence a trava por horário em todos os modos).
    // ao fechar, reopened volta a false.
    const reopened = status==="open";
    await sbUpdate("group_rooms",{status,reopened},`group_id=eq.${APP.groupId}&room_id=eq.${APP.roomId}`);
    APP.roomMeta.status=status;
    // PROPAGA: travar/destravar a pool avulsa também trava/destrava o MESMO jogo nas mini rodadas DESTE grupo
    const rrStatus=status==="closed"?"locked":"open";
    let propagou=0;
    try{
      if(!APP.rounds||!APP.rounds.length){try{await loadRounds();}catch(e){}}
      const myRoundIds=(APP.rounds||[]).map(r=>r.id);
      if(myRoundIds.length){
        const inList="("+myRoundIds.join(",")+")";
        const res=await sbUpdate("round_rooms",{status:rrStatus,reopened},`room_id=eq.${encodeURIComponent(APP.roomId)}&round_id=in.${inList}`);
        propagou=(res&&res.length)||0;
      }
    }catch(e){/* se round_rooms não permitir, segue só com a avulsa */}
    await loadGroupRooms();
    toast(status==="closed"
      ? `Pool fechada.${propagou?` Este jogo também travou em ${propagou} mini rodada(s).`:""}`
      : `Pool reaberta.${propagou?` Destravado nas mini rodadas.`:""}`);
    render();
  }catch(e){toast("Erro ao mudar status: "+e.message);}
}
// ── ESPIAR TIMES DOS MEMBROS (só com pool fechada e jogo não finalizado) ──
let _openPeek={};
function togglePeek(i){_openPeek[i]=!_openPeek[i];render();}
function othersEnteredHTML(){
  const me=APP.user?.username;
  const outros=(APP.entries||[]).filter(e=>e.username!==me&&e.slots&&Object.values(e.slots).some(Boolean)).map(e=>e.username);
  if(!outros.length)return `<div class="prebox" style="margin-top:10px;font-size:12px">Você montou seu time. Ninguém mais escalou ainda — quando alguém montar, aparece aqui (sem mostrar o time).</div>`;
  const nomes=outros.map(n=>`<b style="color:var(--chalk)">${esc(n)}</b>`).join(", ");
  const verbo=outros.length===1?"também montou um time":"também montaram um time";
  return `<div class="prebox" style="margin-top:10px;font-size:12px">👥 ${nomes} ${verbo}. O time de cada um fica escondido até a partida começar — aí você pode espiar.</div>`;
}
function peekTeamsHTML(){
  const ents=(APP.entries||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean));
  const byId=APP._byId;
  const TAC=window.ENGINE_TACTICS;
  // contexto de modo: se estou vendo um jogo dentro de uma rodada, mostro a estratégia revelada
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const rmode=inRound?modeOf(APP.round):null;
  const pp=APP.prepool;
  // total de jogos ordenados por usuário (pra calcular o multiplicador de confiança exibido)
  let confTot={};
  if(rmode==="confianca"){(APP.roundAllEntries||[]).forEach(e=>{if(e.conf_rank!=null){confTot[e.username]=(confTot[e.username]||0)+1;}});}
  let html=`<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
    <div class="h2 disp">👀 Times dos membros</div>
    <p class="p" style="margin:6px 0 10px">O jogo foi fechado — agora dá pra ver o que cada um escalou${rmode==="confianca"?", e a posição que deram a este jogo na ordem de confiança":rmode==="previsao"?", e o placar que cada um cravou":""}. As pontuações aparecem quando o jogo acabar.</p>`;
  if(!ents.length){html+=`<p class="p">Ninguém montou time neste jogo.</p></div>`;return html;}
  ents.forEach((e,i)=>{
    const open=_openPeek[i];
    const isMe=e.username===APP.user?.username;
    // tag de estratégia revelada
    let stratTag="";
    if(rmode==="confianca"&&e.conf_rank!=null){
      const tot=confTot[e.username]||1;
      stratTag=`<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:800;color:#C77DFF;border:1px solid #C77DFF;border-radius:6px;padding:1px 6px">📊 ${e.conf_rank+1}º · ${confMultiplier(e.conf_rank,tot).toFixed(2)}x</span>`;
    }else if(rmode==="previsao"&&e.pred_home!=null&&e.pred_away!=null){
      stratTag=`<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:800;color:#54E0A8;border:1px solid #54E0A8;border-radius:6px;padding:1px 6px">🔮 ${esc(pp.home.code)} ${e.pred_home}–${e.pred_away} ${esc(pp.away.code)}</span>`;
    }
    html+=`<div class="receipt"><div class="rhead" onclick="togglePeek(${i})">
      <div class="nm">${esc(e.username)}${isMe?" <small>(você)</small>":""}${stratTag}<small>· cap ${SLOT_LABEL[e.captain]||"?"} · ${TAC[e.tactic]?.name||e.tactic||"—"}</small></div>
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
// editor de fichas de impulso (dev monta a economia da pool)
// valida se uma pool com 'não misturar fichas +/−' é cumprível.
// retorna {ok:true} ou {ok:false, msg:"..."}. J = nº de jogos da pool (todos, pois Impulso escala todos).
function boostFeasibility(chips,maxPerGame,noMix){
  const nPos=chips.filter(v=>v>0).length, nNeg=chips.filter(v=>v<0).length;
  const J=(APP.jogos||[]).length||0;
  const mx=maxPerGame>0?maxPerGame:Infinity;
  // sem a regra de não-misturar, basta caber o total respeitando o teto por jogo
  if(!noMix){
    const need=mx===Infinity?(chips.length?1:0):Math.ceil(chips.length/mx);
    if(J>0&&need>J)return {ok:false,msg:`Com até ${maxPerGame} ficha(s) por partida e ${chips.length} ficha(s), seriam necessárias ${need} partidas, mas a pool só tem ${J}.`};
    return {ok:true};
  }
  // com não-misturar: positivas e negativas ocupam jogos separados
  const needPos=nPos?(mx===Infinity?1:Math.ceil(nPos/mx)):0;
  const needNeg=nNeg?(mx===Infinity?1:Math.ceil(nNeg/mx)):0;
  const need=needPos+needNeg;
  if(J>0&&need>J){
    return {ok:false,msg:`Sem misturar fichas, as ${nPos} positiva(s) precisam de ${needPos} partida(s) e as ${nNeg} negativa(s) de mais ${needNeg} — total ${need}, mas a pool só tem ${J} partida(s). Aumente o "máx. por partida", reduza fichas, ou desligue "não misturar".`};
  }
  return {ok:true};
}
function boostBuilderHTML(c){
  const chips=c.chips||(c.chips=[15,15]); // default: 2 fichas de +15%
  const maxPer=c.boostMaxPerGame!=null?c.boostMaxPerGame:0;
  const minG=c.boostMinGames!=null?c.boostMinGames:0;
  const noMix=!!c.boostNoMix;
  // aviso de viabilidade (bloqueia salvar se impossível)
  const feas=boostFeasibility(chips.map(v=>Number(v)||0).filter(v=>v!==0),maxPer,noMix);
  const feasMsg=feas.ok?"":`<p class="p" style="font-size:11px;margin:8px 0 0;color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);border:1px solid var(--red);border-radius:8px;padding:7px 9px">⚠️ ${feas.msg}</p>`;
  const chipRow=chips.map((v,i)=>{
    const neg=v<0;const col=neg?"#FF6B6B":"#FFC247";
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <span style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:2px solid ${col};color:${col};background:color-mix(in srgb,${col} 16%,transparent)">⚡</span>
      <input class="input" type="number" inputmode="numeric" style="flex:1;margin:0" value="${v}" onchange="setChipValue(${i},this.value)" />
      <span style="font-size:11px;color:${col};width:54px">${neg?"NEGATIVA":"+"+v+"%"}</span>
      <button class="cbtn" style="position:static;width:28px;height:28px;color:var(--red);border-color:var(--red)" onclick="removeChip(${i})">×</button>
    </div>`;
  }).join("");
  const totalPos=chips.filter(v=>v>0).length, totalNeg=chips.filter(v=>v<0).length;
  return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px">
    <p class="p" style="font-size:11px;margin:0 0 8px;color:#FFC247">Monte as fichas desta pool. Cada ficha tem seu valor — use número negativo pra criar uma ficha "ruim" (vermelha) que o jogador é obrigado a gastar.</p>
    ${chipRow||'<p class="p" style="font-size:11px">Nenhuma ficha ainda.</p>'}
    <div style="display:flex;gap:6px;margin-top:6px">
      <button class="btn ghost" style="margin:0;flex:1;font-size:12px" onclick="addChip(15)">+ Ficha positiva</button>
      <button class="btn ghost" style="margin:0;flex:1;font-size:12px;color:#FF6B6B;border-color:#FF6B6B" onclick="addChip(-15)">+ Ficha negativa</button>
    </div>
    <p class="p" style="font-size:10px;margin:8px 0 4px;color:var(--dim)">${chips.length} ficha(s): ${totalPos} positiva(s)${totalNeg?`, ${totalNeg} negativa(s)`:""}.</p>
    <div style="display:flex;gap:8px;margin-top:6px">
      <div style="flex:1"><p class="p" style="font-size:10px;margin:0 0 2px">Máx. por partida (0=livre)</p><input class="input" type="number" inputmode="numeric" min="0" style="margin:0" value="${maxPer}" onchange="APP.confirm.boostMaxPerGame=parseInt(this.value,10)||0;render()" /></div>
      <div style="flex:1"><p class="p" style="font-size:10px;margin:0 0 2px">Mín. de partidas (0=livre)</p><input class="input" type="number" inputmode="numeric" min="0" style="margin:0" value="${minG}" onchange="APP.confirm.boostMinGames=parseInt(this.value,10)||0" /></div>
    </div>
    ${totalNeg?`<div onclick="toggleNoMix()" style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer">
      <span style="width:34px;height:20px;border-radius:99px;background:${noMix?"#FF6B6B":"var(--line)"};position:relative;flex-shrink:0;transition:.15s"><span style="position:absolute;top:2px;left:${noMix?"16px":"2px"};width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s"></span></span>
      <span style="font-size:11px;color:${noMix?"#FF6B6B":"var(--dim)"};font-weight:${noMix?"700":"400"}">Não misturar fichas + e − no mesmo jogo</span>
    </div>${noMix?`<p class="p" style="font-size:10px;margin:4px 0 0;color:var(--dim)">Cada partida só aceita fichas positivas OU negativas. A negativa "contamina" o jogo — não dá pra anular com positiva.</p>`:""}`:""}
    ${feasMsg}
  </div>`;
}
function addChip(v){if(!APP.confirm)return;_syncCreateName();(APP.confirm.chips=APP.confirm.chips||[]).push(v);render();}
function removeChip(i){if(!APP.confirm||!APP.confirm.chips)return;_syncCreateName();APP.confirm.chips.splice(i,1);render();}
function setChipValue(i,val){if(!APP.confirm||!APP.confirm.chips)return;let v=parseInt(val,10);if(isNaN(v))v=0;APP.confirm.chips[i]=v;render();}
function toggleNoMix(){if(!APP.confirm)return;_syncCreateName();APP.confirm.boostNoMix=!APP.confirm.boostNoMix;render();}
function _syncCreateName(){if(!APP.confirm)return;const n=$("rndName")||$("renameInput");if(n){if(APP.confirm.mode==="rename")APP.confirm.cur=n.value;else APP.confirm.draftName=n.value;}}
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
  // trocar nome de usuário (pede senha atual pra confirmar)
  if(c.mode==="changeUsername"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Mudar nome de usuário</div>
      <p class="p" style="margin:10px 0">Seu apelido atual é <b style="color:var(--chalk)">${esc(APP.user.username)}</b>. Escolha um novo — é assim que os outros vão te ver. Seu histórico e conquistas vão junto.</p>
      <input id="cu-new" class="input" placeholder="Novo apelido" autocomplete="off" />
      <div style="position:relative">
        <input id="cu-pass" class="input" type="password" placeholder="Sua senha atual (confirmar)" autocomplete="off" style="padding-right:44px" />
        <span id="cu-eye" onclick="togglePassVisib('cu-pass','cu-eye')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <button class="btn" style="margin-top:4px" onclick="submitChangeUsername()">Trocar nome</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // trocar senha (pede senha atual + nova duas vezes)
  if(c.mode==="changePassword"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Mudar senha</div>
      <p class="p" style="margin:10px 0">Digite sua senha atual e a nova senha. Você vai usar a nova senha toda vez que entrar no app.</p>
      <div style="position:relative">
        <input id="cp-old" class="input" type="password" placeholder="Senha atual" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye1" onclick="togglePassVisib('cp-old','cp-eye1')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <div style="position:relative">
        <input id="cp-new" class="input" type="password" placeholder="Nova senha (3+)" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye2" onclick="togglePassVisib('cp-new','cp-eye2')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <div style="position:relative">
        <input id="cp-new2" class="input" type="password" placeholder="Repita a nova senha" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye3" onclick="togglePassVisib('cp-new2','cp-eye3')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <button class="btn" style="margin-top:4px" onclick="submitChangePassword()">Trocar senha</button>
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
    const selMode=MODE_META[c.newMode]?c.newMode:"full";
    const modeBtns=MODE_LIST.map(mk=>{
      const mm=MODE_META[mk],on=selMode===mk;
      return `<div onclick="setCreateMode('${mk}')" style="flex:1 1 calc(50% - 3px);cursor:pointer;text-align:center;padding:9px 4px;border-radius:9px;border:1px solid ${on?mm.color:"var(--line)"};background:${on?`color-mix(in srgb,${mm.color} 18%,transparent)`:"var(--panel2)"};color:${on?mm.color:"var(--dim)"};font-size:11px;font-weight:700">${mm.icon} ${mm.label}</div>`;
    }).join("");
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar mini rodada</div>
      <p class="p" style="margin:8px 0">Escolha o modo:</p>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">${modeBtns}</div>
      <p class="p" style="font-size:11px;margin-bottom:10px;color:${MODE_META[selMode].color}">${MODE_META[selMode].desc}</p>
      <input id="rndName" class="input" placeholder="Nome (ex: Jogos de 18/06)" autocorrect="off" value="${esc(c.draftName||"")}" oninput="APP.confirm.draftName=this.value" />
      ${selMode==="select"?`<input id="rndLimit" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} placeholder="Quantos jogos escolher (ex: 3)" value="${defLimit}" />${poolMax?`<p class="p" style="font-size:11px;margin-bottom:8px">Há <b style="color:var(--amber)">${poolMax}</b> jogo(s) no catálogo (máximo).</p>`:""}`:""}
      ${selMode==="boost"?boostBuilderHTML(c):""}
      ${selMode==="full"?`<p class="p" style="font-size:11px;margin-bottom:8px">No modo COMPLETO o jogador escala todos os jogos da rodada — não há limite de escolha.</p>`:""}
      ${selMode==="confianca"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo e ordenam os jogos por confiança: o 1º vale 2x, o último 0,5x.</p>`:""}
      ${selMode==="previsao"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo e cravam o placar de cada jogo. Bônus: +${PRED_RESULT_PCT}% pelo resultado, +${PRED_EXACT_PCT}% pelo placar exato.</p>`:""}
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
      extra=`<p class="p" style="font-size:11px;margin-bottom:6px;color:#FFC247">Fichas de impulso desta pool:</p>${boostBuilderHTML(c)}`;
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
    const chips=(c.chips||[]).map(v=>Number(v)||0).filter(v=>v!==0);
    if(!chips.length){toast("Adicione pelo menos uma ficha de impulso.");return;}
    const feas=boostFeasibility(chips,c.boostMaxPerGame||0,!!c.boostNoMix);
    if(!feas.ok){toast("Configuração impossível: "+feas.msg);return;}
    const cfg={chips,maxPerGame:c.boostMaxPerGame||0,minGames:c.boostMinGames||0,noMix:!!c.boostNoMix};
    const phaseId=c.phaseId||null;
    APP.confirm=null;createRound(name,limit,phaseId,mk,chips.length,cfg).catch(e=>toast("Erro: "+e.message));
    return;
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
    // apaga em cascata: as mini rodadas desta rodada, com suas entries e round_rooms
    const minis=await sb("rounds?phase_id=eq."+id+"&group_id=eq."+APP.groupId+"&select=id");
    for(const m of (minis||[])){
      await sbDelete("entries",`round_id=eq.${m.id}`);
      await sbDelete("round_rooms",`round_id=eq.${m.id}`);
      await sbDelete("rounds",`id=eq.${m.id}`);
    }
    await sbDelete("phases",`id=eq.${id}`);
    await loadRounds();await loadPhases();
    APP.phaseId=null;APP.phase=null;APP.view="home";
    toast("Rodada e suas mini rodadas excluídas.");
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
// teto de preço do banco = preço do TITULAR MAIS BARATO que o usuário escalou.
// O banco é grátis (não conta no orçamento) e só aceita quem custa <= esse teto.
// Enquanto não houver nenhum titular escalado, não há teto (banco fica bloqueado).
function benchCap(s,byId){
  const TIT=["GK","DEF","MID","ATT","FLEX"];
  let cap=null;
  for(const sl of TIT){const pid=s[sl];if(!pid)continue;const pr=byId[pid]?byId[pid].price:null;if(pr==null)continue;cap=cap==null?pr:Math.min(cap,pr);}
  return cap; // null = nenhum titular ainda
}
function buildHTML(){
  const pp=APP.prepool, byId=APP._byId, s=APP.slots;
  const used=Object.values(s).filter(Boolean);
  // orçamento NÃO conta o banco (banco é grátis, estilo Cartola)
  const spent=used.reduce((a,id)=>a+(id===s.BENCH?0:(byId[id]?byId[id].price:0)),0);
  const left=100-spent;
  const bcap=benchCap(s,byId); // teto de preço do banco = titular mais barato escalado (null se nenhum)
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
      <div class="lab"><span class="pc-${posKey}">${SLOT_LABEL[sl]}</span>${sl==="FLEX"?" ·DEF/MEI/ATA":""}${sl==="BENCH"?(bcap!=null?` ·grátis ≤${bcap}`:" ·grátis"):""}</div>
      <div class="nm">${pl?esc(pl.name):"toque num jogador"}</div>
      ${pl?`<div class="pr mono"><span class="teamtag" style="--tc:${teamColor(pl.team)}">${pl.team}</span> · ${sl==="BENCH"?'<span style="color:var(--green)">grátis</span>':pl.price}</div>`:""}
      ${pl&&sl!=="BENCH"?`<button class="cbtn${APP.captain===sl?" on":""}" onclick="event.stopPropagation();toggleCap('${sl}')">C</button>`:""}
    </div>`;}).join("");
  // rótulos legíveis pras ações de buff/nerf das táticas
  const TACT_LABEL={goal:"gols",sotPts:"chutes/gols",assist:"assistências",sca:"criação",gca:"jogada do gol",
    dribbles:"dribles",prgp:"passes progressivos",pib:"passes na área",tib:"toques na área",
    tklint:"desarmes",block:"bloqueios",recovery:"recuperações",aerial:"duelos aéreos",clearance:"cortes",
    accCross:"cruzamentos",fouls:"faltas",prgCarry:"conduções",longBall:"lançamentos"};
  // cor-tema por tática (casa com as variáveis --tac-* do CSS)
  const TACT_COLOR={muralha:"var(--tac-muralha)",pressaototal:"var(--tac-pressaototal)",cerebro:"var(--tac-cerebro)",tridente:"var(--tac-tridente)",aereo:"var(--tac-aereo)",contra:"var(--tac-contra)"};
  function tactEffectHTML(t){
    const fam=(t.fam||[]).map(k=>TACT_LABEL[k]||k);
    const uniq=[...new Set(fam)];
    return `<div class="teff"><div class="up">▲ completa = bônus</div><div class="down">▼ incompleta = ônus menor</div><div class="foco">foco em <b>${uniq.join(", ")}</b></div></div>`;
  }
  const tactsHTML=Object.entries(TAC).filter(([k,t])=>!t.legacy).map(([k,t])=>{const tc=TACT_COLOR[k]||"var(--amber)";return `<div class="tact${APP.tactic===k?" on":""}" style="--tac:${tc}" onclick="setTactic('${k}')"><div class="ttop"></div><div class="tn">${t.name}</div><div class="td">${t.desc}</div>${tactEffectHTML(t)}</div>`;}).join("");
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
  // destino que um jogador teria, dado o estado atual dos slots (mesma lógica do place)
  function destSlot(p){
    if(p.pos==="GK")return !s.GK?"GK":(!s.BENCH?"BENCH":null);
    if(!s[p.pos])return p.pos; if(!s.FLEX)return "FLEX"; if(!s.BENCH)return "BENCH"; return null;
  }
  const poolHTML=filt.map(p=>{
    const sel=used.includes(p.id);
    const dest=destSlot(p);
    let dis=false,reason="";
    if(!sel){
      if(!dest){dis=true;reason="";}
      else if(dest==="BENCH"){ if(bcap==null||(p.price||0)>bcap){dis=true;reason="banco";} } // banco: precisa ter titular e custar <= o teto
      else if(left-p.price<0){dis=true;reason="orc";} // titular: respeita orçamento
    }
    const tag = (!sel&&dest==="BENCH"&&!dis)?` <span style="font-size:9px;color:var(--green)">grátis</span>`:"";
    return `<div class="prow${sel?" sel":""}${dis?" dis":""}" onclick="${dis?"":`place(${p.id})`}"><div class="posbar pb-${p.pos}"></div><div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div><div class="nm">${esc(p.name)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${p.team}</span>${p.age?` <span class="age">${p.age}a</span>`:""}${tag}</div><div class="pr mono">${p.price}</div></div>`;
  }).join("");
  // ── MODO TORCIDA: jogo travado mas não finalizado → mostra resumo limpo do time escalado ──
  if(gameLocked){
    const tac=TAC[APP.tactic];
    const lineRow=(sl)=>{
      const pid=s[sl],pl=pid?byId[pid]:null;
      if(!pl)return"";
      const isCap=APP.captain===sl;
      const posKey=sl==="BENCH"&&pl?pl.pos:sl;
      return `<div class="prow" style="cursor:default"><div class="posbar pb-${posKey}"></div><div class="pos mono pc-${posKey}">${SLOT_LABEL[sl]}</div><div class="nm">${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</div><div class="pr mono" style="color:var(--dim)">${sl==="BENCH"?"grátis":pl.price}</div></div>`;
    };
    return `<div class="scorebar"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="tag">${esc(pp.comp)} · ⚽ EM ANDAMENTO</div><div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('room')"}" style="cursor:pointer;flex-shrink:0">← voltar</div></div>
      <div class="score disp"><div><div class="team">${esc(pp.home.name)}</div></div><div class="vs mono">×</div><div style="text-align:right"><div class="team">${esc(pp.away.name)}</div></div></div></div>
    <div class="card">
      <div class="prebox" style="border-color:#143a2a;background:#0c1f17;color:var(--green)">🔒 Time confirmado e travado. Boa sorte — agora é torcer! Você verá a pontuação quando a partida acabar.</div>
      <div class="h2 disp" style="margin-top:6px">Seu time escalado</div>
      <div class="pool" style="max-height:none;margin-top:8px">${["GK","DEF","MID","ATT","FLEX","BENCH"].map(lineRow).join("")}</div>
      <div class="bsub">⚔️ Sua tática</div>
      ${tac?`<div class="tact on" style="min-width:0;--tac:${TACT_COLOR[APP.tactic]||"var(--amber)"}"><div class="ttop"></div>${`<div class="tn">${tac.name}</div><div class="td">${tac.desc}</div>${tactEffectHTML(tac)}`}</div>`:`<p class="p">—</p>`}
      <div class="line" style="margin-top:10px"><span>Capitão (pontos ×1,20)${helpBtn("capitao")}</span><span class="v">${APP.captain?esc(byId[s[APP.captain]]?.name||SLOT_LABEL[APP.captain]):"—"}</span></div>
    </div>`;
  }
  return `<div class="card">
    <div style="display:flex;justify-content:flex-end;margin-bottom:4px"><div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('room')"}" style="cursor:pointer">← voltar</div></div>
    <div class="budget"><div class="h2 disp">Seu time${helpBtn("slots")}</div><div><span class="tag">RESTANTE${helpBtn("orcamento")} </span><span class="val mono">${left}</span><span class="tag"> /100</span></div></div>
    <div class="slots">${slotsHTML}</div>
    <p class="p" style="font-size:11px;margin:-4px 0 10px;line-height:1.5">🪑 O <b style="color:var(--green)">BANCO é grátis</b> (não gasta moeda), mas só aceita um jogador <b>igual ou mais barato que o seu titular mais barato</b>${bcap!=null?` (hoje: até <b class="mono">${bcap}</b>)`:" (escale um titular primeiro)"}, de qualquer posição. Ele entra se um titular for mal.${helpBtn("banco")}</p>
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
  // descobre o slot de destino
  let t=null;
  if(p.pos==="GK")t=!s.GK?"GK":!s.BENCH?"BENCH":null;
  else{if(!s[p.pos])t=p.pos;else if(!s.FLEX)t="FLEX";else if(!s.BENCH)t="BENCH";}
  if(!t){APP.warn="Sem slot compatível livre.";render();return;}
  if(t==="BENCH"){
    // banco: GRÁTIS, mas só aceita quem custa <= o titular mais barato que você escalou
    const bcap=benchCap(s,byId);
    if(bcap==null){APP.warn="Escale ao menos um titular antes de escolher o banco (o teto do banco é o seu titular mais barato).";render();return;}
    if((p.price||0)>bcap){APP.warn=`No banco só entra quem custa até ${bcap} (seu titular mais barato). Esse custa ${p.price}.`;render();return;}
  }else{
    // titular: paga e respeita o orçamento (banco não conta)
    const spent=used.reduce((a,id)=>a+(id===s.BENCH?0:byId[id].price),0);
    if(100-spent-p.price<0){APP.warn="Orçamento estourado.";render();return;}
  }
  s[t]=pid;enforceBenchCap();render();
}
// se o reserva do banco ficou acima do novo teto (titular mais barato), remove e avisa
function enforceBenchCap(){
  const s=APP.slots,byId=APP._byId;const bp=s.BENCH;if(!bp)return;
  const cap=benchCap(s,byId);
  const pr=byId[bp]?byId[bp].price:null;
  if(cap==null||(pr!=null&&pr>cap)){
    s.BENCH=null;
    if(APP.captain==="BENCH")APP.captain=null;
    APP.warn=cap==null?"Banco liberado: ele depende de ter um titular escalado.":`Banco liberado: o reserva (${pr}) ficou acima do novo teto (${cap}, seu titular mais barato).`;
  }
}
function clearSlot(sl){APP.slots[sl]=null;if(APP.captain===sl)APP.captain=null;if(sl!=="BENCH")enforceBenchCap();render();}
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
  // IMPULSO (modo boost): aplicado por ÚLTIMO, sobre o total já fechado (tática, capitão, etc.).
  // Modelo novo: entry.boost_chips = lista de valores das fichas neste jogo, ex [25,15] ou [-20].
  //   o % total é a SOMA das fichas (positivas e negativas).
  // Modelo antigo (retrocompat): entry.boost = nº de fichas × BOOST_PCT.
  let boostPct=0, boostTokens=0;
  const chips=entry.boost_chips;
  if(Array.isArray(chips)&&chips.length){
    boostPct=chips.reduce((s,v)=>s+(Number(v)||0),0);
    boostTokens=chips.length;
  }else{
    boostTokens=Math.max(0,parseInt(entry.boost,10)||0);
    boostPct=BOOST_PCT*boostTokens;
  }
  const boostMult=1+(boostPct/100);
  const finalTotal=Math.round(sum*boostMult*10)/10;
  return {username:entry.username,total:finalTotal,boost:boostTokens,boostPct,boostChips:Array.isArray(chips)?chips:null,boostMult,view,captain:entry.captain,tactic:entry.tactic,subOut,squadSum:sq};
}
// ============================================================
// TIME IDEAL — a escalação que teria dado a MAIOR pontuação possível
// (respeita 100 moedas, formação GK/DEF/MID/ATT/FLEX, melhor tática e capitão)
// ============================================================
const BUDGET_IDEAL=100;
function computeDreamTeam(roomId){
  const ctx=buildCtxFor(roomId);if(!ctx)return null;
  const pp=ctx.prepool,eng=ctx.eng,m=ctx.match;
  const rawOf=(p)=>{const r=m.players?m.players[String(p.id)]:null;return Object.assign({pos:p.pos,team:p.team},r||{min:0});};
  const cand={GK:[],DEF:[],MID:[],ATT:[]};
  for(const p of pp.players){
    const raw=rawOf(p);
    if(!(raw.min>0))continue;
    const item={id:p.id,pos:p.pos,price:p.price||0,raw};
    if(cand[p.pos])cand[p.pos].push(item);
  }
  if(!cand.GK.length||!cand.DEF.length||!cand.MID.length||!cand.ATT.length)return null;
  const tactics=Object.keys(eng.TACTICS).filter(t=>!eng.TACTICS[t].legacy);
  // PRÉ-COMPUTA pontos de cada jogador por tática nos 2 cenários (full/fail) — evita recalcular no loop
  const fakeFull={},fakeFail={};
  for(const t of tactics){fakeFull[t]="full";fakeFail[t]="fail";}
  const pts={}, bestPossible={};
  const all=cand.GK.concat(cand.DEF,cand.MID,cand.ATT);
  for(const it of all){
    pts[it.id]={};let bp=0;
    for(const t of tactics){
      const f=eng.scorePlayer(it.raw,t,{status:fakeFull}).total;
      const x=eng.scorePlayer(it.raw,t,{status:fakeFail}).total;
      pts[it.id][t]={full:f,fail:x};
      if(f>bp)bp=f;
    }
    bestPossible[it.id]=bp; // melhor pontuação que esse jogador pode ter em qualquer tática
  }
  // ordena por melhor pontuação possível (poda mais cedo)
  for(const k in cand)cand[k].sort((a,b)=>bestPossible[b.id]-bestPossible[a.id]);
  const POOL=all.slice().sort((a,b)=>bestPossible[b.id]-bestPossible[a.id]);

  let best=null;
  for(const gk of cand.GK){
    if(gk.price>BUDGET_IDEAL)continue;
    for(const df of cand.DEF){
      if(gk.price+df.price>BUDGET_IDEAL)continue;
      for(const mf of cand.MID){
        const p3=gk.price+df.price+mf.price; if(p3>BUDGET_IDEAL)continue;
        for(const at of cand.ATT){
          const p4=p3+at.price; if(p4>BUDGET_IDEAL)continue;
          const usados=new Set([gk.id,df.id,mf.id,at.id]);
          // teto otimista dos 4 já escolhidos (com capitão no melhor deles)
          const base4=bestPossible[gk.id]+bestPossible[df.id]+bestPossible[mf.id]+bestPossible[at.id];
          for(const fx of POOL){
            if(usados.has(fx.id))continue;
            const p5=p4+fx.price; if(p5>BUDGET_IDEAL)continue;
            // PODA: teto otimista (5 melhores possíveis + 20% no maior) não supera o best? pula squadSum
            if(best){
              const tetoFive=base4+bestPossible[fx.id];
              const maxInd=Math.max(bestPossible[gk.id],bestPossible[df.id],bestPossible[mf.id],bestPossible[at.id],bestPossible[fx.id]);
              if(tetoFive+maxInd*0.2<=best.total)continue;
            }
            const five=[gk,df,mf,at,fx];
            const sq=eng.squadSum(five.map(x=>x.raw));
            for(const tac of tactics){
              const stt=sq.status[tac];
              let sum=0;const arr=[];
              for(const it of five){const v=pts[it.id][tac][stt];arr.push(v);sum+=v;}
              let capBonus=0,capIx=-1;
              for(let i=0;i<arr.length;i++){const e=arr[i]*0.2;if(e>capBonus){capBonus=e;capIx=i;}}
              const total=Math.round((sum+capBonus)*10)/10;
              if(!best||total>best.total){
                best={total,tactic:tac,captainId:five[capIx].id,spend:p5,
                  picks:{GK:gk,DEF:df,MID:mf,ATT:at,FLEX:fx},sq};
              }
            }
          }
        }
      }
    }
  }
  return best;
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
function collectionHTML(archObj){
  const tem=archObj||{};
  const total=ARCH_CATALOG.length;
  const got=ARCH_CATALOG.filter(a=>tem[a.name]>0).length;
  let html=`<div class="card"><div class="h2 disp">🃏 Coleção de arquétipos</div>
    <p class="p" style="margin:6px 0 10px">Você desbloqueou <b style="color:var(--amber)">${got}/${total}</b> arquétipos. Cada um é um papel que um jogador seu desempenhou numa partida. Toque pra ver como conseguir os que faltam.</p>`;
  // agrupa por categoria
  const cats=["Goleiro","Defesa","Meio","Criação","Ataque","Outros"];
  for(const cat of cats){
    const arr=ARCH_CATALOG.filter(a=>a.cat===cat);
    if(!arr.length)continue;
    html+=`<div class="bsub" style="margin:10px 0 4px">${cat}</div>`;
    for(const a of arr){
      const has=tem[a.name]>0;
      const col=RAR_COLOR[a.rar]||"#9aa6b2";
      const n=tem[a.name]||0;
      html+=`<div class="line" style="padding:8px 0;align-items:flex-start;${has?"":"opacity:.5"}">
        <span style="flex:1">
          <b style="color:${has?"var(--chalk)":"var(--dim)"}">${has?"":"🔒 "}${esc(a.name)}</b>
          <span style="font-size:9px;color:${col};border:1px solid ${col};border-radius:6px;padding:1px 5px;margin-left:6px">${a.rar}</span>
          ${has?`<span style="font-size:9px;color:var(--green);margin-left:4px">✓ ${n}×</span>`:""}
          <br><i style="font-size:11px;color:var(--dim)">${esc(a.how)}</i>
        </span>
      </div>`;
    }
  }
  html+=`</div>`;
  return html;
}
function profileTabsHTML(active,onclickFn){
  const tabs=[["geral","Geral"],["avulsa","Avulsa"],["full","🏆 Completo"],["boost","⚡ Impulso"],["confianca","📊 Confiança"],["previsao","🔮 Previsão"]];
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs.map(([k,l])=>`<button class="statuspill ${k===active?"st-open":""}" style="cursor:pointer;${k===active?"border-color:var(--amber);color:var(--amber)":""}" onclick="${onclickFn}('${k}')">${l}</button>`).join("")}</div>`;
}
function setProfileTab(t){APP.profileTab=t;render();}
function setMemberProfileTab(t){APP.memberProfileTab=t;render();}
function openProfile(){go("profile");}
function profileHTML(){
  const prof=APP.profile;
  if(!prof)return `<div class="card"><div class="loading">Calculando seu perfil…</div></div>`;
  const st=prof._byMode?(prof[APP.profileTab]||prof.geral):prof;
  const medals=computeMedals(prof._byMode?prof.geral:prof);
  const archDistinct=Object.keys(st.archetypes).length;
  const TOTAL_ARCH=ARCH_CATALOG.length; // total de arquétipos possíveis no engine
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const tit=userTitle(prof._byMode?prof.geral:prof);
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
    ${profileTabsHTML(APP.profileTab,"setProfileTab")}
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
  // COLEÇÃO completa de arquétipos (usa o geral: tudo que já desbloqueou)
  html+=collectionHTML((APP.profile._byMode?APP.profile.geral:APP.profile).archetypes);
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
    <div class="tag" style="margin-bottom:6px">CONTA</div>
    <p class="p" style="margin-bottom:10px;font-size:12px">Seu apelido é como os outros te veem. A senha é o que você usa pra entrar no app.</p>
    <button class="btn ghost" style="margin-bottom:8px" onclick="askChangeUsername()">✏️ Mudar nome de usuário</button>
    <button class="btn ghost" onclick="askChangePassword()">🔑 Mudar senha</button>
  </div>`;
  html+=`<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--red)">ZONA DE RISCO</div>
    <p class="p" style="margin-bottom:10px">Excluir seu histórico oculta do seu perfil os times que você montou nos jogos já encerrados (zera medalhas e conquistas). Você continua no ranking das salas. Pede sua senha pra confirmar.</p>
    <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="askHideHistory()">🗑 Excluir histórico do perfil</button>
  </div>`;
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
  const prof=APP.memberProfile;
  const hist=APP.memberHistory;
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">${esc(u||"")}</div>
      <div class="userchip" onclick="go('members')" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">Perfil no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  if(!prof){html+=`<div class="card"><div class="loading">Calculando perfil…</div></div>`;return html;}
  const st=prof._byMode?(prof[APP.memberProfileTab]||prof.geral):prof;
  const stGeral=prof._byMode?prof.geral:prof;
  const archDistinct=Object.keys(st.archetypes).length;
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const medals=computeMedals(stGeral);
  const tit=userTitle(stGeral);
  // título/nível
  html+=`<div class="card"><div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:26px">${tit.emoji}</span>
    <div style="flex:1"><div style="font-weight:700;color:var(--chalk);font-size:16px">${tit.name}</div>
    <div style="font-size:11px;color:var(--dim)">${tit.xp} XP</div>
    <div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${tit.prog}%;background:var(--amber)"></div></div></div>
  </div></div>`;
  // resumo
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    ${profileTabsHTML(APP.memberProfileTab,"setMemberProfileTab")}
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}${statBox("🏆",st.wins,"vitórias")}${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}${statBox("📈",st.avg||0,"média/jogo")}${statBox("🎯",st.podiumRate+"%","pódio")}
      ${statBox("🃏",archDistinct+"/"+ARCH_CATALOG.length,"arquétipos")}${statBox("💎",rareCount,"raros")}${statBox("🔥",st.bestStreak||0,"sequência")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPerf?`<p class="p" style="margin-top:4px">🌟 Melhor atuação: <b style="color:var(--amber)">${esc(st.bestPerf.name)}</b> — ${st.bestPerf.pts.toFixed(1)} pts${st.bestPerf.game?` em ${esc(st.bestPerf.game)}`:""}.</p>`:""}
    ${st.topPlayer?`<p class="p" style="margin-top:4px">💰 Craque favorito: <b style="color:var(--amber)">${esc(st.topPlayer.name)}</b> (${st.topPlayer.pts} pts somados).</p>`:""}
    ${st.bestPlayer?`<p class="p" style="margin-top:4px">📋 Mais escalado: <b style="color:var(--chalk)">${esc(st.bestPlayer.name)}</b> (${st.bestPlayer.n}×).</p>`:""}
    ${st.topTactic?`<p class="p" style="margin-top:4px">🧠 Tática preferida: <b style="color:var(--chalk)">${esc(st.topTactic.name)}</b> (${st.topTactic.n}×).</p>`:""}
    ${st.capTotal>=1?`<p class="p" style="margin-top:4px">🎖️ Capitão certeiro: <b style="color:var(--chalk)">${st.capRate}%</b> (acertou o melhor ${st.capHits}/${st.capTotal}).</p>`:""}
  </div>`;
  // medalhas
  if(medals.length)html+=`<div class="card"><div class="h2 disp">Medalhas</div><div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div></div>`;
  // coleção de arquétipos do membro (geral)
  html+=collectionHTML(stGeral.archetypes);
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
  return html;
}
// renderiza uma partida do histórico com jogadores CLICÁVEIS (detalhe + arquétipo)
// prefix distingue contexto ("m"=membro, "p"=perfil próprio) pra estados de toggle separados
function histGameHTML(h,hi,prefix){
  const open=_openHistGame[prefix+hi];
  const MODECOLOR={avulsa:"var(--mid)",select:"#5CA8FF",full:MODE_META.full.color,boost:MODE_META.boost.color,confianca:MODE_META.confianca.color,previsao:MODE_META.previsao.color};
  const MODELABEL={avulsa:"AVULSA",select:"🎯 SELECIONE",full:"🏆 COMPLETO",boost:"⚡ IMPULSO",confianca:"📊 CONFIANÇA",previsao:"🔮 PREVISÃO"};
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
      const boostTag=(v.mode==="boost"&&sc.boostPct)?` <span style="color:${sc.boostPct<0?"#FF6B6B":col}">⚡ ${sc.boostPct<0?"":"+"}${sc.boostPct}%</span>`:"";
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
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  let html=`<div class="scorebar"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="tag">${esc(pp.comp)} · FINALIZADO</div><div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('home')"}" style="cursor:pointer;flex-shrink:0">← voltar</div></div>
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
  // TIME IDEAL — escalação que teria dado a maior pontuação possível
  html+=dreamTeamHTML();
  // minha apuração detalhada
  if(mine){
    html+=`<div class="card"><div class="h2 disp">Sua apuração</div><p class="p" style="margin-bottom:10px">Toque em cada jogador para abrir o cálculo.</p>`;
    mine.view.filter(Boolean).forEach((v,idx)=>{html+=receiptHTML(v,idx);});
    html+=`<div class="line total" style="font-size:16px;padding:10px 4px 4px"><span class="disp">TOTAL</span><span class="v mono" style="color:var(--amber);font-size:22px">${mine.total.toFixed(1)}</span></div>`;
    if(mine.subOut)html+=`<p class="p" style="margin-top:8px">🔄 Substituição: banco entrou no slot ${SLOT_LABEL[mine.subOut]}.</p>`;
    html+=`</div>`;
  }
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
  return html;
}
let _openBaseAll=false;
function toggleBaseAll(){_openBaseAll=!_openBaseAll;render();}
function baseAllHTML(eng){
  const pp=APP.prepool,m=APP.match;
  const rows=pp.players.map(meta=>{
    const st=m.players[String(meta.id)];
    if(!st||!st.min)return null; // só quem jogou
    const r=eng.scorePlayer(Object.assign({pos:meta.pos,team:meta.team},st),null,null);
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
// ── TIME IDEAL (dream team) ──
let _dreamCache={};          // roomId → resultado de computeDreamTeam
let _dreamOpen=false;        // card aberto?
let _dreamPlayer={};         // jogadores expandidos no time ideal
let _dreamCalc={};           // roomId → "calculando"
function toggleDream(){
  _dreamOpen=!_dreamOpen;
  // calcula sob demanda (assíncrono pra não travar a UI), só na 1ª vez
  if(_dreamOpen&&_dreamCache[APP.roomId]===undefined&&!_dreamCalc[APP.roomId]){
    _dreamCalc[APP.roomId]=true;
    render();
    setTimeout(()=>{
      try{_dreamCache[APP.roomId]=computeDreamTeam(APP.roomId);}
      catch(e){_dreamCache[APP.roomId]=null;}
      _dreamCalc[APP.roomId]=false;render();
    },30);
    return;
  }
  render();
}
function toggleDreamPlayer(k){_dreamPlayer[k]=!_dreamPlayer[k];render();}
function dreamTeamHTML(){
  const roomId=APP.roomId;
  const calc=_dreamCalc[roomId];
  const best=_dreamCache[roomId];
  let html=`<div class="card"><div class="rhead" style="padding:0;cursor:pointer" onclick="toggleDream()"><div class="nm disp" style="font-size:16px">🧠 Time ideal da partida</div><div class="tot mono" style="color:var(--dim);font-size:14px">${_dreamOpen?"▲":"▼"}</div></div>`;
  if(_dreamOpen){
    if(calc){
      html+=`<p class="p" style="margin:10px 0"><span class="loading">Calculando a escalação perfeita…</span></p>`;
    }else if(!best){
      html+=`<p class="p" style="margin:10px 0">Não foi possível calcular (jogo sem dados suficientes).</p>`;
    }else{
      const ctx=buildCtxFor(roomId);
      const TAC=window.ENGINE_TACTICS;
      html+=`<p class="p" style="margin:8px 0 4px">A escalação que teria feito a <b style="color:var(--amber)">maior pontuação possível</b> nesta partida, respeitando as ${BUDGET_IDEAL} moedas.</p>`;
      html+=`<div class="slots" style="grid-template-columns:repeat(3,1fr);margin:10px 0">
        ${statBox("🏆",best.total.toFixed(1),"pontos")}
        ${statBox("🧠",TAC[best.tactic]?.name||best.tactic,"tática")}
        ${statBox("💰",best.spend+"/"+BUDGET_IDEAL,"gasto")}
      </div>`;
      html+=`<p class="p" style="font-size:10px;margin:0 0 6px">toque num jogador p/ ver o cálculo</p>`;
      const order=["GK","DEF","MID","ATT","FLEX"];
      for(const sl of order){
        const it=best.picks[sl];
        const pl=ctx.byId[it.id];
        const isCap=it.id===best.captainId;
        // pontua o jogador no contexto do time ideal (com a tática vencedora)
        const r=ctx.eng.scorePlayer(it.raw,best.tactic,best.sq);
        let pts=r.total; if(isCap)pts=Math.round(pts*1.2*10)/10;
        const capTag=isCap?` <span class="badgeC">C</span>`:"";
        const pkey="dream_"+sl;
        const pOpen=_dreamPlayer[pkey];
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleDreamPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[sl]}</b> ${esc(pl?pl.name:"?")}<span class="teamtag" style="--tc:${teamColor(pl?pl.team:"")};margin-left:6px">${pl?pl.team:""}</span>${capTag} <span style="color:var(--dim);font-size:10px">${it.price}💰</span> <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
            <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo</div>
            ${(r.statLines||[]).map(([l,c,u,p2])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${p2>0?"plus":p2<0?"minus":""}">${p2>0?"+":""}${(+p2).toFixed(1)}</span></div>`).join("")}
            ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
            ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
            ${isCap?`<div class="line" style="padding:2px 0"><span>👑 Capitão (×1.2)</span><span class="v mono plus">+${(r.total*0.2).toFixed(1)}</span></div>`:""}
            ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
          </div>`;
        }
      }
      html+=`<div class="line total" style="font-size:15px;padding:10px 4px 4px"><span class="disp">TOTAL IDEAL</span><span class="v mono" style="color:var(--amber);font-size:20px">${best.total.toFixed(1)}</span></div>`;
    }
  }
  html+=`</div>`;
  return html;
}
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
    <div class="logo" onclick="go('groups')" style="cursor:pointer">FANTASY PvP<br><small>v2.6.0 · PvP</small></div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="userchip" onclick="toggleRules()" style="padding:5px 11px;font-weight:700" title="Como funciona">?</div>
      <div class="userchip" onclick="toggleManual()" style="padding:5px 11px;font-weight:700;cursor:pointer" title="Manual completo">📖 MANUAL</div>
      ${isDev()?`<div class="userchip" onclick="toggleDevMode()" style="cursor:pointer;border-color:${APP.devMode?"var(--amber)":"var(--line)"};color:${APP.devMode?"var(--amber)":"var(--dim)"}" title="Alternar modo DEV / jogador">${APP.devMode?"🛠 DEV":"🎮 jogador"}</div>`:""}
      ${APP.user?`<div class="userchip">${inGroup?`<span onclick="openProfile()" style="cursor:pointer" title="Meu perfil">👤 <b>${esc(APP.user.username)}</b></span>`:`👤 <b>${esc(APP.user.username)}</b>`} · <span onclick="logout()" style="cursor:pointer">sair</span></div>`:""}
    </div>
  </div>${APP.showRules?rulesModalHTML():""}${APP.help?helpModalHTML():""}${APP.showManual?superManualHTML():""}`;
}
function toggleRules(){APP.showRules=!APP.showRules;render();}
function toggleManual(){APP.showManual=!APP.showManual;render();}
// ---- mini-ajudas contextuais (botão ? pequeno em vários lugares) ----
const HELP={
  minirodada:["Mini rodada","Você recebe um número de fichas (tokens) de entrada. Cada jogo que você escolher gasta 1 ficha e garante sua vaga naquele jogo. Você não precisa usar todas. Escolher os jogos certos (onde você acha que vai pontuar mais) é a estratégia. A escalação de cada jogo é montada depois e pode ser ajustada até a partida começar."],
  token:["Fichas de entrada","Cada mini rodada te dá um número fixo de fichas (ex: 2). Tocar no + verde de um jogo gasta 1 ficha e sela sua participação NAQUELE jogo. Enquanto a seleção estiver aberta, dá pra trocar à vontade. Quando a partida é fechada, suas escolhas travam."],
  escalacao:["Escalação","Montar o time é separado de escolher o jogo. A escalação fica salva e você pode mudá-la quantas vezes quiser até a partida começar — ela trava sozinha no apito inicial. Não existe 'confirmar equipe' aqui: o que está garantido é a vaga no jogo (a ficha)."],
  liga:["Liga","Junta várias rodadas numa classificação geral da temporada. Dois rankings: pontos de tabela (10/7/5/3/1 conforme a colocação em cada mini rodada) e pontuação clássica (soma do fantasy). Os pontos sobem somando das mini rodadas → rodadas → liga."],
  rodada:["Rodada","Uma fase que agrupa várias mini rodadas (ex: 'Fase de Grupos'). A classificação da rodada é a soma das mini rodadas dela."],
  capitao:["Capitão (×1.20)","Escolha 1 jogador (menos o banco) pra render 20% a mais. Vale a pena no jogador que você mais confia que vai pontuar."],
  tatica:["Tática","Cada tática tem um ESTILO (ex: marcação, posse, jogo aéreo). Ela fica COMPLETA (bônus) se, na partida, esse estilo for o ponto mais forte do seu time E vários dos seus jogadores produzirem nele. Se faltar um dos dois, fica incompleta (ônus, sempre menor que o bônus). Você escolhe olhando seu time: 'tenho zagueiros que desarmam muito → Muralha', 'meio-campo que toca → Tiki-Taka'. O efeito vem das ações reais deles em campo."],
  pool:["Pool de jogadores","Todos os jogadores dos dois times do confronto, com preço por qualidade. Use os filtros (time / posição) pra achar quem quer. Ordenados do mais caro pro mais barato."],
  orcamento:["Orçamento","Você tem 100 moedas pra montar os 5 TITULARES (Goleiro, Defensor, Meia, Atacante e FLEX). O BANCO é à parte: ele NÃO gasta moeda (é grátis). Cada jogador tem um preço pela qualidade (valor de mercado corrigido pela idade). Gastar tudo nos craques deixa o resto barato — equilibrar é parte da estratégia."],
  slots:["Os slots do time","Você monta 5 TITULARES — 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante e 1 FLEX (curinga de linha) — que gastam do seu orçamento. Mais o BANCO, que é grátis (regra à parte, toque no '?' do banco). Cada slot só aceita a posição certa; o FLEX é mais livre. Quem você escalar mas não entrar em campo fica com 0."],
  banco:["Banco (reserva grátis)","O banco é GRÁTIS — não gasta moeda do seu orçamento. Em troca, ele só aceita um jogador BARATO: o limite é o preço do SEU TITULAR MAIS BARATO (entre os 5 que você escalou). Ex: se seu titular mais barato custa 15, o banco aceita qualquer um que custe até 15, de qualquer posição. Conforme você troca os titulares, esse teto muda. Se o reserva ficar acima do novo teto, ele é liberado. Na partida, se um titular de linha for mal, o reserva pode entrar no lugar — mas rende só 80% da nota (pedágio por começar fora) e só substitui se, já com o desconto, superar o titular. Goleiro reserva só conta se o titular não jogar nenhum minuto."],
  flex:["FLEX (curinga)","O slot FLEX aceita um jogador de defesa, meio OU ataque (não goleiro). Serve pra você reforçar a posição que quiser — um 2º atacante, um meia a mais, etc. Ele conta na composição do time pra valer."],
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
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Penalidades:</b> o jogador perde pontos por cartão amarelo (-2), vermelho (-10 no 1º tempo / -6 no 2º), erro que levou a gol (-5), erro que levou a finalização (-2), pênalti cometido (-4), <b style="color:#FF6B6B">gol contra (-5)</b>, faltas e ser driblado. Um gol contra conta no placar do jogo e ainda desconta 5 pontos de quem o fez — pesa como um gol ao contrário.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Outras ações que pontuam:</b> além de gols e defesas, o jogo recompensa quem constrói: faltas sofridas, lançamentos longos certos e conduções progressivas (carregar a bola pra frente) dão pontos leves, premiando armadores e quem puxa contra-ataque.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Ranking:</b> quando o jogo acaba, todos os times da sala são pontuados e o ranking aparece, com a apuração detalhada de cada jogador.</p>
    <button class="btn" style="margin-top:8px" onclick="toggleRules()">Entendi</button>
  </div></div>`;
}
function superManualHTML(){
  const sec=(titulo,corpo)=>`<div style="margin:14px 0 4px"><div style="font-family:'Saira Condensed';font-weight:800;font-size:15px;letter-spacing:.03em;text-transform:uppercase;color:var(--amber)">${titulo}</div></div>${corpo}`;
  const p=(t)=>`<p class="p" style="margin:6px 0;font-size:13px;line-height:1.5">${t}</p>`;
  const b=(t)=>`<b style="color:var(--chalk)">${t}</b>`;
  return `<div class="modal" onclick="toggleManual()"><div class="box" onclick="event.stopPropagation()" style="max-height:85vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">📖 Manual completo</div>
    <p class="p" style="margin:4px 0 2px;font-size:11px;color:var(--dim)">Tudo que você precisa saber pra jogar e pra administrar. Toque fora ou no botão no fim pra fechar.</p>

    ${sec("1. A ideia do jogo",
      p(`Antes de cada partida real, abre uma ${b("pool")}. Você monta um time de 6 jogadores escolhidos entre os elencos dos ${b("dois")} times que vão se enfrentar. Quando o jogo acontece de verdade, seus jogadores pontuam pelo que fizerem em campo (gols, assistências, defesas, desarmes etc.).`))}

    ${sec("2. Como navegar",
      p(`A tela inicial tem 4 abas no topo:`)+
      p(`⚽ ${b("Partidas:")} os jogos avulsos. Monte time jogo a jogo, sem estar numa competição.`)+
      p(`🎯 ${b("Mini-rodadas:")} grupos de jogos com um modo (Completo, Impulso, Confiança ou Previsão). É onde mora a estratégia.`)+
      p(`📅 ${b("Rodadas:")} agrupam várias mini rodadas (ex: "Fase de Grupos"). Fora de liga.`)+
      p(`🏆 ${b("Ligas:")} juntam várias rodadas numa classificação geral da temporada.`)+
      p(`Toque numa aba pra abrir. O ${b("?")} ao lado de cada bloco explica os detalhes daquela parte.`))}

    ${sec("3. Montar seu time",
      p(`${b("Orçamento:")} 100 moedas. Cada jogador tem um preço que reflete a qualidade dele. O banco também conta no orçamento.`)+
      p(`${b("Os 6 slots:")} 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (pode ser def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.`)+
      p(`${b("Capitão (×1.20):")} escolha 1 jogador (menos o banco) pra render 20% a mais.`)+
      p(`${b("Banco:")} se um titular de linha for mal, o reserva entra no lugar — mas rende 80% da nota (pedágio). Só entra se, já com o desconto, superar o titular. O goleiro reserva só entra se o titular não jogar nenhum minuto.`)+
      p(`${b("Tática:")} escolha 1. Cada uma tem um estilo. Fica completa (bônus) se aquele estilo for a maior fatia das ações do seu time E um número mínimo dos seus jogadores produzir nele. Senão fica incompleta (ônus menor que o bônus).`))}

    ${sec("4. De onde vêm os preços",
      p(`O preço de cada jogador reflete ${b("quantos pontos ele tende a fazer na engine")} — calculado pelo histórico recente dele (gols, assistências, defesas, desarmes...) combinado com o valor de mercado, corrigido por idade e posição.`)+
      p(`Quem jogou pouco não despenca nem dispara: o mercado segura a estimativa até ele ter minutos suficientes. Cada partida é equilibrada sozinha pra que montar um time bom custe escolhas — não dá pra encher de craques.`)+
      p(`${b("Por posição:")} o mesmo critério vale pra goleiro, defensor, meia e atacante, então um zagueiro caro tende a valer tanto quanto um atacante caro.`))}

    ${sec("5. Pontuação",
      p(`${b("Ações que somam:")} gol (+4,2), assistência (+3,3), finalização no gol (+1,7), defesa do goleiro (+1,35), pênalti defendido (+6), desarme/interceptação, drible, corte, bola recuperada. Gol difícil vale mais que fácil. Gol nos minutos finais de jogo apertado vale mais (clutch, até +8). Time mais fraco (underdog) ganha bônus, calculado por ELO, forma recente e mando de campo.`)+
      p(`${b("Clean sheet (não sofrer gol):")} goleiro ganha +3,0 por tempo sem levar gol; defensores +1,5 por tempo.`)+
      p(`${b("Penalidades")} tiram pontos: amarelo (-2), vermelho (-7 no 1º tempo / -5 no 2º), erro que levou a gol (-5), erro que levou a finalização (-2), pênalti cometido (-4), gol contra (-6), faltas e ser driblado. O gol contra conta no placar e ainda desconta de quem o fez.`)+
      p(`${b("Construção de jogo")} também pontua (leve): faltas sofridas, lançamentos longos certos e conduções progressivas premiam quem distribui o jogo e puxa contra-ataque, não só quem finaliza.`)+
      p(`${b("Tetos por jogo:")} a nota de um jogador na partida vai de -9 (piso) a +28 (teto), pra ninguém disparar sozinho.`))}

    ${sec("6. Mini rodadas e os modos",
      p(`Uma ${b("mini rodada")} junta vários jogos. O modo dela define a estratégia. São 4:`)+
      p(`🏆 ${b("Completo:")} escale todos os jogos. Sua pontuação é a soma de todos. A escalação de cada jogo trava quando aquela partida é fechada.`)+
      p(`⚡ ${b("Impulso:")} escale todos e distribua as fichas de impulso nas partidas (cada ficha aplica um % nos pontos daquele jogo). O dev define os valores e as regras das fichas (pode ter fichas negativas obrigatórias). A distribuição trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não gastar TODAS as fichas antes da trava, é eliminado e zera a mini rodada.`)+
      p(`📊 ${b("Confiança:")} escale todos e ordene os jogos do que você mais confia (1º) ao que menos confia. O 1º multiplica os pontos pra cima, o último pra baixo. Quanto mais jogos, maior a diferença. A ordem trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não ordenar TODOS os jogos antes da trava, é eliminado e zera a mini rodada.`)+
      p(`🔮 ${b("Previsão:")} escale todos e crave o placar de cada jogo. Além dos pontos da escalação, ganha bônus por acertar o resultado e um bônus maior por cravar o placar exato. Aqui o palpite trava POR JOGO, junto com a escalação daquela partida (cada jogo é independente).`))}

    ${sec("7. Como as travas funcionam",
      p(`Não há horário automático: ${b("tudo é manual")}. Quem trava é o dev, pelo botão "🔒 Fechar pool (trava as escalações)" na partida avulsa.`)+
      p(`${b("Escalação (todos os modos):")} a escalação de cada jogo pode ser editada até o dev fechar a pool daquela partida específica. Fechar uma não trava as outras.`)+
      p(`${b("Impulso e Confiança:")} a parte estratégica (fichas / ordem) trava quando QUALQUER jogo da rodada é fechado — porque é uma decisão sobre a rodada toda. O dev também pode fechar/reabrir essa distribuição manualmente no bloco ADMIN da rodada. Depois de travado, o jogador não reabre sozinho — só o dev.`)+
      p(`${b("Previsão:")} o palpite trava por jogo, junto com a escalação daquela partida (como no Completo).`))}

    ${sec("8. Espiar os adversários",
      p(`Na aba ${b("\"Quem está disputando\"")}, assim que a pool de uma partida é travada, aquele jogo vira clicável e você pode espiar o que cada um fez NELE:`)+
      p(`No Completo/Avulsa: a escalação. No Previsão: a escalação + o palpite. No Confiança: a escalação + a ordem de confiança completa do adversário. No Impulso: a escalação + onde ele gastou os impulsos. Só revela os jogos já travados.`))}

    ${sec("9. Classificação",
      p(`Quando os jogos terminam e são apurados, a ${b("Classificação da mini rodada")} soma os pontos de cada um (já com multiplicadores de confiança / bônus de previsão / impulsos aplicados) e mostra o ranking.`))}

    ${isAdmin()?sec("10. Para o admin (você)",
      p(`${b("Criar:")} use "Criar mini rodada", escolha o modo e adicione os jogos (há abas Em aberto / Finalizadas).`)+
      p(`${b("Durante:")} quando cada partida real começar, vá na partida avulsa e clique "Fechar pool". Isso trava a escalação daquele jogo em todas as rodadas, e — no Impulso/Confiança — trava a estratégia da rodada inteira.`)+
      p(`${b("Apurar:")} suba o resultado do jogo (scraping). A classificação se atualiza sozinha conforme os jogos são apurados.`)+
      p(`${b("Reabrir:")} se precisar, dá pra reabrir a pool de uma partida ou a distribuição estratégica — mas combine com o grupo, porque reabrir depois de um jogo começar dá vantagem de informação.`)):""}

    <button class="btn" style="margin-top:14px" onclick="toggleManual()">Fechar manual</button>
  </div></div>`;
}
function footHTML(){
  return `<div class="foot">Motor v2.6.0 · ELO eloratings + FootballDatabase<br>Dados FotMob + SofaScore · ${SUPA.ready()?"Supabase conectado":"⚠ configure o config.js"}</div>`;
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
    if(view==="result"){APP.entries=await loadEntries();_openRec={};_openRank={};_dreamOpen=false;_dreamPlayer={};}
    if(view==="profile"){clearEntriesCache();APP.profile=null;APP.profileHistory=null;render();const ps=await loadProfileStats(APP.user.username);if(APP.view==="profile")APP.profile=ps;render();const ph=await loadMemberHistory(APP.user.username);if(APP.view==="profile")APP.profileHistory=ph;}
    if(view==="members"){APP.members=null;render();const ms=await loadGroupMembers();if(APP.view==="members")APP.members=ms;}
    if(view==="member"){
      clearEntriesCache();APP.memberView=extra;APP.memberProfile=null;APP.memberHistory=null;_openHistGame={};_openHistPlayer={};render();
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
