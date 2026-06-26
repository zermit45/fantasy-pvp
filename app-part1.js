// BUILD: SORARE-v2-COM-STATS · app-part1 de 6 · 2026-06-25
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
  zebra:{label:"ZEBRA",icon:"🐎",color:"#FF8A4C",desc:"Escale todos os jogos apostando nos azarões. Jogadores do time mais fraco pelo ELO recebem bônus extra no placar da mini rodada. Favorito ainda pontua, mas a glória mora na zebra."},
  sobrevivencia:{label:"SOBREVIVÊNCIA",icon:"🛡️",color:"#7EE787",desc:"Escale todos os jogos. Se algum jogo seu terminar negativo, você zera a mini rodada. Se sobreviver, seu pior jogo é descartado e soma o resto."},
  capitaoduplo:{label:"CAPITÃO DUPLO",icon:"👑",color:"#FF7EC4",desc:"Escale todos os jogos. O capitão fica ainda mais decisivo: na mini rodada ele recebe um reforço extra, funcionando como 1.4x no total."},
};
// modos oferecidos ao dev (select fica oculto: existe na base, mas sai do visual)
const MODE_LIST=["full","boost","confianca","previsao","zebra","sobrevivencia","capitaoduplo"];
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
  draftSeasons:[], draftSeasonId:null, draftSeason:null, draftTeams:[], draftRosters:[], draftTransactions:[], draftTab:"visao", draftSearch:"",
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
  homeNavTab:"partidas", // aba ativa da home: partidas|mini|rodadas|ligas|draft
  compTab:{round:"live",phase:"live",league:"live"}, // aba "live"(andamento)/"done"(finalizadas) por seção
  confOrderMode:false, confOrderDraft:null, confHover:null,
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
  const buckets={
    geral:_blankStats(),
    avulsa:_blankStats(),
    full:_blankStats(),
    boost:_blankStats(),
    confianca:_blankStats(),
    previsao:_blankStats(),
    zebra:_blankStats(),
    sobrevivencia:_blankStats(),
    capitaoduplo:_blankStats()
  };
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
// ── MERCADO DRAFT (modo separado de temporada) ─────────────────────────────
async function loadDraftSeasons(){
  if(!APP.groupId)return;
  try{APP.draftSeasons=await sb("draft_seasons?group_id=eq."+APP.groupId+"&select=*&order=created_at.desc");}
  catch(e){APP.draftSeasons=[];APP.draftSchemaMissing=true;}
}
async function loadDraftSeason(seasonId){
  APP.draftSeasonId=seasonId;
  APP.draftSeason=null;APP.draftTeams=[];APP.draftRosters=[];APP.draftTransactions=[];
  try{
    const ss=await sb("draft_seasons?id=eq."+seasonId+"&group_id=eq."+APP.groupId+"&select=*");
    APP.draftSeason=ss&&ss[0]?ss[0]:null;
    APP.draftTeams=await sb("draft_teams?season_id=eq."+seasonId+"&select=*&order=created_at");
    APP.draftRosters=await sb("draft_rosters?season_id=eq."+seasonId+"&select=*&order=player_name");
    APP.draftTransactions=await sb("draft_transactions?season_id=eq."+seasonId+"&select=*&order=created_at.desc&limit=40");
  }catch(e){
    APP.draftSchemaMissing=true;
    toast("Mercado Draft ainda precisa do SQL.");
  }
}
function draftPlayerKey(p){return `${p.team||"?"}:${_normName(p.name)}:${p.pos||"MID"}`;}
function draftPlayerCatalog(){
  const seen={};
  const master=Array.isArray(window.DRAFT_MASTER_PLAYERS)?window.DRAFT_MASTER_PLAYERS:[];
  master.forEach(p=>{
    const key=p.key||draftPlayerKey(p);
    if(!seen[key]){
      seen[key]={
        key,
        name:p.name,
        team:p.team,
        pos:p.pos||"MID",
        age:p.age||null,
        price:Math.max(3,Math.min(35,Number(p.price)||3)),
        mv:Number(p.mv)||0,
        club:p.club||"",
        shirt:p.shirt||null,
        source:p.source||"master",
        master:true,
        prices:[],
        rooms:[]
      };
    }
  });
  for(const j of (APP.jogos||[])){
    const g=window.GAMES&&window.GAMES.data?window.GAMES.data[j.room_id]:null;
    const pp=g&&g.prepool;
    if(!pp||!Array.isArray(pp.players))continue;
    pp.players.forEach(p=>{
      const key=draftPlayerKey(p);
      if(seen[key]?.master)return;
      if(!seen[key])seen[key]={key,name:p.name,team:p.team,pos:p.pos,age:p.age||null,mv:0,prices:[],rooms:[]};
      seen[key].mv=Math.max(seen[key].mv||0,Number(p.mv)||0);
      if(p.price!=null)seen[key].prices.push(Number(p.price)||3);
      seen[key].rooms.push({room_id:j.room_id,match_name:j.match_name});
    });
  }
  const arr=Object.values(seen);
  const mvs=arr.map(p=>p.mv||0).filter(v=>v>0).sort((a,b)=>a-b);
  const mvPrice=mv=>{
    if(!mv||!mvs.length)return null;
    let idx=mvs.findIndex(v=>v>=mv);
    if(idx<0)idx=mvs.length-1;
    const q=mvs.length<=1?1:idx/(mvs.length-1);
    return Math.round(3+Math.pow(q,0.56)*32);
  };
  arr.forEach(p=>{
    if(p.master){
      p.room_id=null;
      p.match_name="Catálogo master";
      return;
    }
    const sorted=p.prices.slice().sort((a,b)=>a-b);
    const med=sorted.length?sorted[Math.floor(sorted.length/2)]:3;
    const byMv=mvPrice(p.mv);
    p.price=Math.max(3,Math.min(35,byMv==null?med:Math.max(byMv,Math.min(35,med))));
    p.room_id=p.rooms[0]?.room_id||null;
    p.match_name=p.rooms[0]?.match_name||"";
  });
  return arr.sort((a,b)=>b.price-a.price||a.name.localeCompare(b.name));
}
function myDraftTeam(){return (APP.draftTeams||[]).find(t=>t.username===APP.user?.username)||null;}
function draftOwnerMap(){
  const out={};
  (APP.draftRosters||[]).forEach(r=>{out[r.player_key]=r.username;});
  return out;
}
function draftSettingsDefault(){
  return {
    required:{create_competition:true,exclusive_players:true,season_ranking:true,transaction_history:true},
    games_scope:true,budget_enabled:true,ordered_draft:true,roster_limit_enabled:true,lineup_enabled:true,free_market:true,
    dynamic_prices:true,sell_at_current_price:true,purchase_limit_enabled:true,purchases_per_round:2,
    auto_windows:false,eliminated_player_rule:"discount",waiver_enabled:true,
    trades_enabled:true,pending_offers:true,admin_veto:true,loans_enabled:false,release_clause_enabled:true,free_agent_auction:false,
    lineup:{GK:1,DEF:1,MID:1,ATT:1,FLEX:1,BENCH:1},sell_tax_pct:10
  };
}
function draftSetting(s,key,fb){
  const st=(s&&s.settings)||{};
  return st[key]!==undefined?st[key]:fb;
}
async function createDraftSeason(name,budget,rosterLimit,settings){
  const st={...draftSettingsDefault(),...(settings||{})};
  const row={
    group_id:APP.groupId,
    name,
    status:"setup",
    market_status:"open",
    draft_status:"setup",
    budget:Number(budget)||300,
    roster_limit:Number(rosterLimit)||12,
    created_by:APP.user.username,
    settings:st
  };
  const rows=await sbInsert("draft_seasons",row);
  await loadDraftSeasons();
  toast("Temporada Mercado Draft criada!");
  if(rows&&rows[0])go("draft",null,null,null,null,null,rows[0].id);
  else render();
}
async function joinDraftSeason(){
  const s=APP.draftSeason;if(!s||!APP.user)return;
  const name=`${APP.user.username} FC`;
  try{
    await sbInsert("draft_teams",{season_id:s.id,username:APP.user.username,team_name:name,budget_left:s.budget,waiver_priority:(APP.draftTeams||[]).length+1},true,"season_id,username");
    await loadDraftSeason(s.id);
    toast("Você entrou no Mercado Draft.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
async function buyDraftPlayer(playerKey){
  const s=APP.draftSeason, me=myDraftTeam();
  if(!s||!me){toast("Entre na temporada antes.");return;}
  if(!draftSetting(s,"free_market",true)){toast("Mercado de livres desligado nesta temporada.");return;}
  if(s.market_status!=="open"){toast("Mercado fechado.");return;}
  // com Leilão 2.0 ativo, NÃO existe compra direta — jogadores só são adquiridos via leilão
  if(draftSetting(s,"auction2_enabled",false)){
    toast("Esta temporada usa Draft por Leilão 2.0. Jogadores só podem ser adquiridos pelo leilão, não por compra direta.");return;
  }
  const owner=draftOwnerMap()[playerKey];
  if(owner){toast("Esse jogador já tem dono.");return;}
  const cat=draftPlayerCatalog().find(p=>p.key===playerKey);
  if(!cat){toast("Jogador não encontrado.");return;}
  const mine=(APP.draftRosters||[]).filter(r=>r.username===APP.user.username);
  if(draftSetting(s,"roster_limit_enabled",true)&&mine.length>=Number(s.roster_limit||12)){toast("Elenco cheio.");return;}
  if(draftSetting(s,"budget_enabled",true)&&Number(me.budget_left||0)<cat.price){toast("Sem moedas suficientes.");return;}
  try{
    await sbInsert("draft_rosters",{
      season_id:s.id,username:APP.user.username,player_key:cat.key,player_name:cat.name,
      player_team:cat.team,pos:cat.pos,base_price:cat.price,current_price:cat.price,acquired_price:cat.price,status:"owned"
    });
    if(draftSetting(s,"budget_enabled",true))await sbUpdate("draft_teams",{budget_left:Number(me.budget_left||0)-cat.price},`season_id=eq.${s.id}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await sbInsert("draft_transactions",{season_id:s.id,username:APP.user.username,type:"buy",player_key:cat.key,player_name:cat.name,amount:cat.price,meta:{team:cat.team,pos:cat.pos}});
    await loadDraftSeason(s.id);
    toast(`${cat.name} comprado!`);
    render();
  }catch(e){toast("Erro: "+e.message);}
}
function askCreateDraftSeason(){APP.confirm={mode:"createDraftSeason",label:"Criar Mercado Draft"};render();}
// confirmação ao sair do Draft (sair pode atrapalhar um leilão em andamento)
function confirmLeaveDraft(){
  var s=APP.draftSeason;
  var emLeilao = s && draftSetting(s,"auction2_enabled",false) && APP.a2Round && APP.a2Round.status && APP.a2Round.status!=="done";
  var msg = emLeilao
    ? "Há um round de leilão EM ANDAMENTO. Se você sair agora, pode atrapalhar a rodada para todos.\n\nTem certeza que deseja voltar e sair do Draft?"
    : "Tem certeza que deseja voltar e sair do Draft?";
  if(typeof confirm==="function" && !confirm(msg)) return;
  go("home");
}
// Ajuda visual: sugere o teto ideal do craque a partir do orçamento + elenco.
// Regra: craque ideal ≈ 1/3 do orçamento (25%–33%); banco de jogadores vai até 100.
function updDraftHint(){
  var el=document.getElementById("draftHint"); if(!el) return;
  var orc=parseInt((document.getElementById("draftBudget")||{}).value,10);
  var elenco=parseInt((document.getElementById("draftRoster")||{}).value,10);
  if(!orc||orc<=0||!elenco||elenco<=0){ el.innerHTML="💡 Preencha orçamento e elenco para ver a sugestão de teto."; return; }
  var media=Math.round(orc/elenco);
  var tetoMin=Math.round(orc*0.25), tetoMax=Math.round(orc*0.33);
  // o banco do draft vai até 100
  var TETO_BANCO=100;
  var razao=TETO_BANCO/orc; // quanto o craque de 100 representa do orçamento
  var msg="💡 Média por jogador: <b>"+media+"</b> moedas. "
        +"Teto ideal do craque: <b style='color:#FFC247'>"+tetoMin+"–"+tetoMax+"</b> (≈ 1/3 do orçamento).";
  // diagnóstico pela razão teto-do-banco / orçamento:
  //  - equilíbrio bom quando o craque de 100 custa ~28% a 40% do orçamento
  if(razao>=0.28 && razao<=0.42){
    msg+="<br>✅ Equilíbrio ideal: dá para ter <b>1–2 estrelas + resto barato</b>. O teto de 100 do banco encaixa bem aqui.";
  } else if(razao>0.42){
    // orçamento baixo: craque come muito do orçamento
    msg+="<br>⚠️ Orçamento baixo para o teto do banco (100): o craque sozinho come mais de 40% do orçamento — "
       +"tende a sobrar pouco (<b>1 estrela + resto bem barato</b>, escolha dura). "
       +"Para 1–2 estrelas com folga, suba para ~<b>300</b>.";
  } else {
    // orçamento alto: craque é barato demais em proporção
    msg+="<br>⚠️ Orçamento alto para o teto do banco (100): o craque custa menos de ~28% do orçamento — "
       +"fica fácil ter <b>2–3 estrelas</b>. Para deixar mais disputado, baixe para ~<b>300</b> ou aumente o elenco.";
  }
  el.innerHTML=msg;
}
function setDraftTab(t){APP.draftTab=t;renderKeepScroll();}
function setDraftSearch(v){
  APP.draftSearch=v;
  render();
  requestAnimationFrame(()=>{
    const inp=document.getElementById("draftSearchInput");
    if(inp){inp.focus();const n=inp.value.length;try{inp.setSelectionRange(n,n);}catch(e){}}
  });
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
