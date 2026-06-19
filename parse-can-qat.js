// Apura can-qat-2026 a partir dos 4 endpoints SofaScore.
// ORDEM NESTE JOGO: 1=statistics, 2=lineups, 3=incidents, 4=shotmap (DIFERENTE!)
const fs=require('fs');
const UP='/mnt/user-data/uploads';
const lineups=JSON.parse(fs.readFileSync(UP+'/2.txt','utf8'));
const statsRaw=JSON.parse(fs.readFileSync(UP+'/1.txt','utf8')).statistics;
const incidents=JSON.parse(fs.readFileSync(UP+'/3.txt','utf8')).incidents;
const shotmap=JSON.parse(fs.readFileSync(UP+'/4.txt','utf8')).shotmap;

// carrega o catálogo a partir do games-part3.js
const win={};
new Function('window',fs.readFileSync(UP+'/games-part3.js','utf8'))(win);
const pp=win.GAMES.data['can-qat-2026'].prepool;
const HOME='CAN', AWAY='QAT';

function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,'').trim();}
const nameToId={};
for(const p of pp.players){nameToId[norm(p.name)]=p.id;}
function findId(sofaName){
  const n=norm(sofaName);
  if(nameToId[n]!=null)return nameToId[n];
  const parts=n.split(' ');const last=parts[parts.length-1];
  for(const p of pp.players){const pn=norm(p.name);if(pn.endsWith(' '+last)||pn===last)return p.id;}
  for(const p of pp.players){const pn=norm(p.name);if(parts[0]&&pn.includes(parts[0])&&pn.includes(last))return p.id;}
  return null;
}

const goalsByPid={}, assistsByPid={}, sotByPid={};
const setPieceGoalsByPid={}, longGoalsByPid={};  // bola parada / chute de fora da área
// tempos dos gols-contra (ownGoal): contam no placar mas não creditam o jogador
const ownGoalTimes=new Set();
for(const inc of incidents){
  if(inc.incidentType==='goal'&&inc.incidentClass==='ownGoal')ownGoalTimes.add(inc.time);
}
for(const s of shotmap){
  const pid=findId(s.player.name);if(pid==null)continue;
  const team=s.isHome?HOME:AWAY;
  if(s.shotType==='goal'){
    // gol contra: conta no placar (goals_tl, abaixo) mas NÃO credita ao jogador individual
    if(ownGoalTimes.has(s.time)) {} 
    else {
      (goalsByPid[pid]=goalsByPid[pid]||[]).push({xg:s.xg||0,m:s.time,team});
      (sotByPid[pid]=sotByPid[pid]||[]).push({m:s.time});
      // bola parada: gol de falta, escanteio ou jogada ensaiada
      const sit=s.situation||"";
      if(sit==="free-kick"||sit==="corner"||sit==="set-piece")setPieceGoalsByPid[pid]=(setPieceGoalsByPid[pid]||0)+1;
      // chute de fora da área: coordenada x do chute > 18 (área vai até ~17)
      const x=s.playerCoordinates&&s.playerCoordinates.x;
      if(typeof x==="number"&&x>18)longGoalsByPid[pid]=(longGoalsByPid[pid]||0)+1;
    }
  }else if(s.shotType==='save'){
    (sotByPid[pid]=sotByPid[pid]||[]).push({m:s.time});
  }
}
for(const inc of incidents){
  if(inc.incidentType==='goal'&&inc.assist1){
    const aId=findId(inc.assist1.name);if(aId==null)continue;
    const goalShot=shotmap.find(s=>s.shotType==='goal'&&s.time===inc.time&&norm(s.player.name)===norm(inc.player.name));
    const xag=goalShot?goalShot.xg:0.1;
    const team=inc.isHome?HOME:AWAY;
    (assistsByPid[aId]=assistsByPid[aId]||[]).push({xag,m:inc.time,team});
  }
}

const cardByPid={};
for(const inc of incidents){
  if(inc.incidentType==='card'){
    const pid=findId(inc.player&&inc.player.name);if(pid==null)continue;
    cardByPid[pid]=cardByPid[pid]||{yellow:0,red:null};
    if(inc.incidentClass==='yellow')cardByPid[pid].yellow++;
    else if(inc.incidentClass==='red'||inc.incidentClass==='yellowRed')cardByPid[pid].red=inc.time;
  }
}

const goals_tl=shotmap.filter(s=>s.shotType==='goal').map(s=>({m:s.time,t:s.isHome?HOME:AWAY})).sort((a,b)=>a.m-b.m);
const concededHome=goals_tl.filter(g=>g.t===AWAY).length;
const concededAway=goals_tl.filter(g=>g.t===HOME).length;

const players={};
for(const side of ['home','away']){
  const team=side==='home'?HOME:AWAY;
  for(const pl of lineups[side].players){
    const st=pl.statistics;if(!st)continue;
    const min=st.minutesPlayed||0;if(min<=0)continue;
    const pid=findId(pl.player.name);
    if(pid==null){console.error('SEM MATCH:',pl.player.name,team);continue;}
    const meta=pp.players.find(p=>p.id===pid);
    const isGK=(pl.position==='G'||meta.pos==='GK');
    const tklint=(st.totalTackle||0)+(st.interceptionWon||0);
    const accOpp=st.accurateOppositionHalfPasses||0;
    const obj={
      min, started:!pl.substitute,
      goals:goalsByPid[pid]||[], assists:assistsByPid[pid]||[], sots:sotByPid[pid]||[],
      setPieceGoals:setPieceGoalsByPid[pid]||0, longGoals:longGoalsByPid[pid]||0,
      sca:st.keyPass||0, gca:st.bigChanceCreated||0,
      prgp:Math.round(accOpp), pib:Math.round(accOpp/6), tib:accOpp,
      tklint, block:st.outfielderBlock||0, recovery:st.ballRecovery||0,
      aerial:st.aerialWon||0, clearance:st.totalClearance||0,
      dribbles:st.wonContest||0,
      accCross:st.accurateCross||0, inaccCross:(st.totalCross||0)-(st.accurateCross||0),
      fouls:st.fouls||0, dribbledPast:st.challengeLost||0,
      yellow:(cardByPid[pid]&&cardByPid[pid].yellow)||0,
      red:(cardByPid[pid]&&cardByPid[pid].red)||null,
      errGoal:st.errorLeadToAGoal||0, penCom:st.penaltyConceded||0,
    };
    if(isGK){
      const savesArr=shotmap.filter(s=>s.shotType==='save'&&(s.isHome?HOME:AWAY)!==team).map(s=>({psxg:s.xgot||0,m:s.time}));
      obj.gk={
        saves:savesArr,
        opa:st.totalKeeperSweeper||0,
        crossStop:(st.goodHighClaim||0)+(st.punches||0),
        conceded: team===HOME?concededHome:concededAway,
        penSave:0
      };
    }
    players[String(pid)]=obj;
  }
}

function findStat(name){
  for(const grp of statsRaw[0].groups){for(const it of grp.statisticsItems){if(it.name===name)return it;}}
  return null;
}
const team_stats={};
const poss=findStat('Ball possession');
team_stats[HOME]={possession:poss?parseInt(poss.home):50, setPieceGoals:0};
team_stats[AWAY]={possession:poss?parseInt(poss.away):50, setPieceGoals:0};

const match={
  status:'finished', neutral:true,
  homeCode:HOME, awayCode:AWAY, homeElo:pp.home.elo, awayElo:pp.away.elo,
  score:[goals_tl.filter(g=>g.t===HOME).length, goals_tl.filter(g=>g.t===AWAY).length],
  goals_tl, team_stats, endMin:90, players
};

console.log('Placar:',match.score[0],'x',match.score[1]);
console.log('goals_tl:',JSON.stringify(goals_tl));
console.log('Jogadores apurados:',Object.keys(players).length);
console.log('GKs:',Object.keys(players).filter(id=>players[id].gk).map(id=>pp.players.find(p=>p.id==id).name).join(', '));
fs.writeFileSync('/home/claude/fantasy-pvp/can-qat-match.json',JSON.stringify(match,null,0));
console.log('\nmatch salvo.');
