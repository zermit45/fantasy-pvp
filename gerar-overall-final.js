// ============================================================
// GERAR-OVERALL-FINAL.js — calcula ovrFinal fundindo 4 sinais
// ------------------------------------------------------------
// OVR = meio-termo entre "quanto pontua na engine" e "qualidade/fama".
// Sinais: TEMPORADA (ovrStats) + JOGOS apurados (engine) + REPUTAÇÃO (liga+clube)
//         + STATUS/MINUTOS (titular/rodízio/reserva afina o peso).
//
// REGRAS-CHAVE (decididas com o Lucchini):
//  - titular > reserva (titular de time fraco vence reserva de time forte)
//  - rodízio que PRODUZ sobe (Marmoush ~84); reserva puro cai (Trafford ~62-68)
//  - quem joga POUCO/0min CAI pro desempenho — NÃO sobe pela reputação
//    (porque a base não distingue craque-lesionado de reserva-profundo)
//  - EXCEÇÃO: lista manual LESIONADOS abaixo — craques parados por lesão que
//    você quer proteger. Edite à mão conforme aparecer no app.
//  - idade NEUTRALIZADA · posição balanceada via percentil-dentro-da-posição
//  - teto geral 94 (bônus de elite só p/ desemp alto + reputação alta)
//
// USO:  node gerar-overall-final.js          -> player-stats.NEW.json + relatório
//       node gerar-overall-final.js --write  -> sobrescreve player-stats.json
// ============================================================
'use strict';
const fs=require('fs'), path=require('path'), DIR=__dirname, P=(...a)=>path.join(DIR,...a);
const norm=s=>!s?'':s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[._\-']/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// >>> LISTA MANUAL DE LESIONADOS (craques parados que NÃO devem cair) <<<
// Use norm() do nome: minúsculas, sem acento. Ex: "donnarumma","marc andre ter stegen"
const LESIONADOS = [
  // "gianluigi donnarumma",
  // "marc andre ter stegen",
  // "alphonso davies",
];
const ehLesionado = nm => LESIONADOS.includes(norm(nm));

globalThis.window=globalThis; window.GAMES={index:[],data:{}};
require(P('club-elo-map.js')); require(P('draft-master-players.js')); require(P('engine.js'));
for(const f of fs.readdirSync(DIR).filter(x=>/^games-part\d+\.js$/.test(x))){ try{require(P(f));}catch(e){} }
const M=window.draftMasterPlayers;
const BU=JSON.parse(fs.readFileSync(P('base-unificada-2.0'),'utf8')).jogadores;
const POSCAT={Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Attacker:'ATT'};

// aliases de clube: nome curto da base-unificada -> nome no club-elo-map (verificado à mão)
const CLUB_ALIAS={
  "rb bragantino":"red bull bragantino sp","atletico-mg":"atletico mineiro","parma":"parma calcio 1913",
  "tottenham":"tottenham hotspur","vfl wolfsburg":"wolfsburg","wolfsburg":"wolfsburg","athletic club":"athletic bilbao",
  "como":"como 1907","leeds":"leeds united","wolves":"wolverhampton wanderers","west ham":"west ham united",
  "newcastle":"newcastle united","brighton":"brighton hove albion","union berlin":"1 fc union berlin",
  "fsv mainz 05":"mainz 05","1899 hoffenheim":"hoffenheim","club brugge kv":"club brugge","st truiden":"sint truiden",
  "fortaleza ec":"fortaleza esporte clube","los angeles galaxy":"la galaxy","al ahli jeddah":"al ahli",
  "stade brestois 29":"brest","roda":"roda jc kerkrade","mirassol":"mirassol futebol clube","remo":"clube do remo",
  "avs":"avs futebol sad","chapecoense-sc":"chapecoense af",
};
function clubElo(club){
  const EX=window.CLUB_ELO_EXACT,ST=window.CLUB_ELO_STRIPPED;
  let n=norm(club);
  const al=CLUB_ALIAS[n]; if(al){const a=norm(al); if(EX[a]!=null)return EX[a]; if(ST[a]!=null)return ST[a];}
  if(EX[n]!=null)return EX[n];if(ST[n]!=null)return ST[n];
  let n2=n.replace(/\b(fc|cf|sc|ac|afc|fk|club|de|the)\b/g,'').replace(/\s+/g,' ').trim();
  return ST[n2]!=null?ST[n2]:null;
}
const ligaClubs={}; M.forEach(p=>{const e=clubElo(p.club);if(e!=null)(ligaClubs[p.league]=ligaClubs[p.league]||{})[norm(p.club)]=e;});
const ligaForca={}; for(const l in ligaClubs){const v=Object.values(ligaClubs[l]);ligaForca[l]=v.reduce((a,b)=>a+b,0)/v.length;}
const clubToLeague={};
const stripClub=n=>n.replace(/\b(fc|cf|sc|ac|afc|fk|club|de|the|cd|ec|ss|us|as|sk|if|bk|ca|rc|sad)\b/g,'').replace(/\s+/g,' ').trim();
M.forEach(p=>{const n=norm(p.club);clubToLeague[n]=p.league;const st=stripClub(n);if(st)clubToLeague[st]=p.league;});
function leagueOfClub(club){const n=norm(club);const al=CLUB_ALIAS[n]?norm(CLUB_ALIAS[n]):null;if(al&&clubToLeague[al])return clubToLeague[al];if(clubToLeague[n])return clubToLeague[n];const st=stripClub(n);if(clubToLeague[st])return clubToLeague[st];const t2=st.split(' ').slice(0,2).join(' ');return clubToLeague[t2]||null;}
const eloAll=[]; BU.forEach(j=>{const e=clubElo(j.team);if(e!=null)eloAll.push(e);}); eloAll.sort((a,b)=>a-b);
const ligaVals=Object.values(ligaForca).sort((a,b)=>a-b);
const pctOf=(v,s)=>{if(!s.length)return .5;let b=0,e=0;for(const x of s){if(x<v)b++;else if(x===v)e++;}return (b+e*.5)/s.length;};
function reputacao(club,league){
  const e=clubElo(club);const lg=league||leagueOfClub(club);const lf=lg!=null?ligaForca[lg]:null;
  const pC=e!=null?pctOf(e,eloAll):null, pL=lf!=null?pctOf(lf,ligaVals):null;
  const ligaOvr=pL!=null?(62+pL*26):null, clubeOvr=pC!=null?(40+pC*59):null;
  if(ligaOvr!=null&&clubeOvr!=null)return 0.70*ligaOvr+0.30*clubeOvr;
  if(ligaOvr!=null)return ligaOvr; if(clubeOvr!=null)return clubeOvr; return 60;
}
const byPosMv={GK:[],DEF:[],MID:[],ATT:[]}; M.forEach(p=>{if(byPosMv[p.pos])byPosMv[p.pos].push(p.marketValue||0);}); for(const k in byPosMv)byPosMv[k].sort((a,b)=>a-b);

// titularidade/status da base (indexada por nome+pos)
const buIdx={}; BU.forEach(j=>{
  let pos=POSCAT[j.pos]||null;
  if((!pos||j.posSrc==='generica-naogk')&&Array.isArray(j.positionsDetailed)&&j.positionsDetailed.includes('GK'))pos='GK';
  const r={pos,minutes:j.minutes,teamGames:j.teamGames,status:j.status,team:j.team};
  [norm(j.fullName),norm(j.name)].forEach(k=>{if(k)(buIdx[k]=buIdx[k]||[]).push(r);});
});
function buData(name,pos){const a=buIdx[norm(name)];if(a)return a.find(r=>r.pos===pos)||a[0];const pa=norm(name).split(' ').filter(Boolean);if(pa.length>=2){const k=pa[0][0]+' '+pa[pa.length-1];const b=buIdx[k];if(b)return b.find(r=>r.pos===pos)||b[0];}return null;}

// jogos apurados (engine)
function buildJogos(){const acc={};for(const rid of Object.keys(window.GAMES.data)){const g=window.GAMES.data[rid];if(!g||!g.match||g.match.status!=='finished'||!g.match.players)continue;let eng;try{eng=window.makeEngine(g.match);}catch(e){continue;}const pp={};if(g.prepool&&g.prepool.players)g.prepool.players.forEach(x=>pp[x.id]={name:x.name,pos:x.pos});for(const pid in g.match.players){const p=g.match.players[pid];if(!(p.min>0))continue;const meta=pp[pid]||pp[+pid]||(p._name?{name:p._name,pos:p.pos}:null);if(!meta||!meta.name)continue;const pos=p.pos||meta.pos||'MID';let pts=0;try{pts=(eng.scorePlayer(p,'tiki',0)||{}).total||0;}catch(e){}const k=norm(meta.name)+'|'+pos;const a=acc[k]||(acc[k]={min:0,pts:0,pos});a.min+=p.min;a.pts+=pts;}}const byPos={};for(const k in acc){const a=acc[k];a.per90=a.min>0?a.pts/(a.min/90):0;(byPos[a.pos]=byPos[a.pos]||[]).push(a.per90);}for(const k in byPos)byPos[k].sort((x,y)=>x-y);return {byKey:acc,byPos};}
const jogos=buildJogos();

function calc(rec){
  const pos=rec.pos;
  const bd=buData(rec.nm||'',pos);
  const club=bd?bd.team:null;
  const rep=reputacao(club,null);
  const temp=rec.ovrStats;
  const mins=bd?bd.minutes||0:900;
  const tg=bd?bd.teamGames||0:38;
  const status=bd?bd.status:'titular';
  const minFrac=clamp(mins/Math.max(1,tg*90),0,1);
  const lesionado=ehLesionado(rec.nm);

  // desempenho = temporada + jogos apurados
  const jk=norm(rec.nm||'')+'|'+pos; const aj=jogos.byKey[jk];
  let jOvr=null,cJ=0; if(aj&&aj.min>0){jOvr=40+pctOf(aj.per90,jogos.byPos[pos])*59;cJ=aj.min/(aj.min+270);}
  let desemp; if(jOvr!=null){const wT=0.7,wJ=0.3*cJ,ws=wT+wJ;desemp=(temp*wT+jOvr*wJ)/ws;}else{desemp=temp;}

  // shrinkage por volume: pouca amostra puxa o desempenho pra um piso baixo
  const confVol = mins/(mins+250);
  const desempShr = desemp*confVol + 50*(1-confVol);

  let ovr;
  if(lesionado){
    // exceção manual: craque parado por lesão mantém reputação
    ovr = rep*0.82 + 50*0.18;
  } else if(status==='titular'){
    const repFloor = rep*0.72 + 48*0.28;
    const d = Math.max(desempShr, repFloor*0.92);
    // GK de time forte faz poucas defesas → stat enganosa; reputação compensa (peso maior)
    const wD = pos==='GK' ? 0.45 : 0.62;
    ovr = d*wD + rep*(1-wD);
  } else if(status==='rodizio'){
    const repFloor = rep*0.74 + 50*0.26;
    const d = Math.max(desempShr, repFloor*0.94);
    ovr = d*0.55 + rep*0.45;
  } else { // reserva: cai pro desempenho; reputação conta pouco
    const repBonus = Math.max(0, rep-desempShr)*0.12*minFrac;
    ovr = desempShr*0.82 + 42*0.18 + repBonus;
  }
  // bônus de elite (desemp alto + reputação alta) — teto geral 94
  const dPart=Math.max(0,(desemp-78)/(99-78)), rPart=Math.max(0,(rep-80)/(99-80));
  ovr += 12*Math.min(dPart,rPart);
  return clamp(Math.round(ovr),35,94);
}

function main(){
  const write=process.argv.includes('--write');
  const DB=JSON.parse(fs.readFileSync(P('player-stats.json'),'utf8'));
  let n=0; const deltas=[]; const dist={GK:[],DEF:[],MID:[],ATT:[]};
  for(const k in DB){const v=DB[k];if(!(v&&typeof v==='object'&&v.ovrStats!=null))continue;
    const ovr=calc(v); deltas.push(Math.abs(ovr-v.ovrStats)); if(dist[v.pos])dist[v.pos].push(ovr);
    v.ovrFinal=ovr; n++;
  }
  deltas.sort((a,b)=>a-b);
  console.log('ovrFinal calculado p/ '+n+' registros');
  console.log('|ovrFinal - ovrStats|: mediana '+deltas[deltas.length>>1]+' · p90 '+deltas[Math.floor(deltas.length*0.9)]+' · max '+deltas[deltas.length-1]);
  console.log('lesionados na lista manual: '+LESIONADOS.length);
  console.log('\ndistribuição por posição (ovrFinal):');
  for(const pos of ['GK','DEF','MID','ATT']){const a=dist[pos].sort((x,y)=>x-y);const p=f=>a[Math.floor(a.length*f)];
    console.log('  '+pos+': mediana '+p(0.5)+' · p90 '+p(0.9)+' · p99 '+p(0.99)+' · max '+a[a.length-1]);}
  const target=write?P('player-stats.json'):P('player-stats.NEW.json');
  fs.writeFileSync(target, JSON.stringify(DB));
  console.log('\nEscrito: '+path.basename(target)+'  ('+(fs.statSync(target).size/1e6).toFixed(2)+' MB)');
  if(!write)console.log('Rode com --write para sobrescrever player-stats.json.');
}
if(require.main===module) main();
module.exports={calc};
