// ============================================================
// AUTO-CALIBRAÇÃO DAS TÁTICAS  —  fantasy-pvp
// ============================================================
// O QUE FAZ:
//   Lê todos os jogos APURADOS e LIMPOS (novos, sem NaN, sem prgp corrompido),
//   mede a distribuição real de cada família de tática num time de 5 jogadores,
//   e calcula os 4 conjuntos de constantes que o engine usa:
//      TACT_MEAN, TACT_SD, TACT_PTSREF  e  TACT_ZTHRESH (por tática)
//   Depois roda uma simulação e mostra a % de ativação resultante + o gap.
//
// COMO USAR (no ambiente Claude, com os games-part*.js e engine.js na pasta):
//   node auto-calibra-taticas.js
//   -> imprime os blocos prontos pra colar no engine.js
//   -> com a flag --apply, ele JÁ reescreve o engine.js pra você:
//   node auto-calibra-taticas.js --apply
//
// IMPORTANTE:
//   - Só usa jogos NOVOS limpos. Ignora v1 (congelados) e jogos com prgp>80 (corrompidos).
//   - O alvo de ativação é ~20% por tática (TARGET). O script acha o z-thresh
//     de cada tática que chega mais perto desse alvo (busca binária).
//   - Reveja os números antes de subir. Quanto mais jogos, mais estável.
// ============================================================

const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const DIR = __dirname;
const TARGET = 0.20;       // alvo de ativação por tática (20%)
const SAMPLES = 80000;     // amostras p/ medir distribuição (mais = mais preciso)
const SIM = 40000;         // times simulados p/ medir ativação
const PRGP_MAX_SANE = 80;  // acima disso, jogo tem prgp corrompido -> ignora

// ---- carrega catálogo de jogos ----
global.window = { index:[], data:{} };
for (const f of fs.readdirSync(DIR)) {
  if (/^games-part\d+\.js$/.test(f)) {
    try { require(path.join(DIR, f)); } catch(e){ console.error('falha ao ler', f, e.message); }
  }
}
const D = window.GAMES.data;

// ---- famílias das táticas (DEVEM espelhar TACT_FAMILIES do engine novo) ----
const FAM = {
  muralha:      p => (p.clearance||0)+(p.block||0)+(p.aerial||0),
  pressaototal: p => (p.recovery||0)+(p.tklint||0)+(p.fouls||0),
  cerebro:      p => (p.prgp||0)+(p.sca||0)+(p.gca||0)*2+((p.assists&&p.assists.length)||0),
  tridente:     p => ((p.sots&&p.sots.length)||0)+((p.goals&&p.goals.length)||0)*2,
  aereo:        p => (p.aerial||0)+(p.accCross||0)+(p.longBall||0),
  contra:       p => (p.prgCarry||0)*2+(p.dribbles||0),
};
// pesos do BASE novo (p/ TACT_PTSREF = pontos típicos da família)
const B = { goal:4.2, assist:3.3, sot:1.7, dribble:.6, prgp:.13, sca:.75, gca:2.0,
  aerial:.16, clearance:.03, block:.48, recovery:.05, tklint:.36, accCross:.2, longBall:.12, prgCarry:.10, foul:-.45 };
const PTS = {
  muralha:      p => (p.clearance||0)*B.clearance+(p.block||0)*B.block+(p.aerial||0)*B.aerial,
  pressaototal: p => (p.recovery||0)*B.recovery+(p.tklint||0)*B.tklint+(p.fouls||0)*B.foul,
  cerebro:      p => (p.prgp||0)*B.prgp+(p.sca||0)*B.sca+(p.gca||0)*B.gca+((p.assists&&p.assists.length)||0)*B.assist,
  tridente:     p => ((p.sots&&p.sots.length)||0)*B.sot+((p.goals&&p.goals.length)||0)*B.goal,
  aereo:        p => (p.aerial||0)*B.aerial+(p.accCross||0)*B.accCross+(p.longBall||0)*B.longBall,
  contra:       p => (p.prgCarry||0)*B.prgCarry+(p.dribbles||0)*B.dribble,
};
// participação (minPlayers/partMin) — espelha TACTICS do engine
const PART = {
  muralha:{minP:3,partMin:2}, pressaototal:{minP:3,partMin:2}, cerebro:{minP:3,partMin:2},
  tridente:{minP:2,partMin:1}, aereo:{minP:2,partMin:2}, contra:{minP:3,partMin:2},
};
const KEYS = Object.keys(FAM);

// ---- detecta jogos limpos automaticamente ----
const limpos = [];
for (const rid in D) {
  const m = D[rid].match;
  if (m.status!=='finished') continue;
  if (!m.players || !Object.keys(m.players).length) continue;
  if (m.tacticRules==='v1') continue;                       // congelado
  if (!m.homeCode || typeof m.homeElo!=='number' || isNaN(m.homeElo)) continue; // quebrado
  const maxPrgp = Math.max(0, ...Object.values(m.players).map(p=>p.prgp||0));
  if (maxPrgp > PRGP_MAX_SANE) { console.error('IGNORANDO', rid, '(prgp corrompido:', maxPrgp+')'); continue; }
  limpos.push(rid);
}
if (!limpos.length) { console.error('Nenhum jogo limpo encontrado.'); process.exit(1); }
console.error('Jogos limpos usados ('+limpos.length+'):', limpos.join(', '));

// ---- pool de atuações (quem entrou em campo) ----
const pool = [];
for (const rid of limpos) {
  const g = D[rid]; const byId = {}; g.prepool.players.forEach(p=>byId[p.id]=p);
  for (const id in g.match.players) {
    const p = g.match.players[id]; if (!p.min || p.min<=0) continue;
    pool.push(Object.assign({pos:byId[id].pos, team:byId[id].team}, p));
  }
}
const pick = () => pool[(Math.random()*pool.length)|0];

// ---- mede MEAN/SD/PTSREF de cada família ----
function dist(fn, n){
  const s=new Array(n);
  for(let i=0;i<n;i++){let x=0;for(let k=0;k<5;k++)x+=fn(pick());s[i]=x;}
  const mean=s.reduce((a,b)=>a+b,0)/n;
  const sd=Math.sqrt(s.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n);
  return {mean,sd};
}
const MEAN={}, SD={}, PTSREF={};
for(const k of KEYS){
  const d1=dist(FAM[k],SAMPLES); MEAN[k]=+d1.mean.toFixed(1); SD[k]=+d1.sd.toFixed(1);
  PTSREF[k]=+dist(PTS[k],SAMPLES).mean.toFixed(1);
}

// ---- mede % de ativação de uma tática dado um z-thresh ----
function ativacao(k, zt, n){
  const T=PART[k]; let full=0;
  for(let i=0;i<n;i++){
    const five=[pick(),pick(),pick(),pick(),pick()];
    let fr=0; for(const p of five) fr+=FAM[k](p);
    const z=(fr-MEAN[k])/(SD[k]||1);
    if(z<zt) continue;
    let part=0; for(const p of five) if(FAM[k](p)>=T.partMin) part++;
    if(part>=T.minP) full++;
  }
  return full/n;
}

// ---- acha o z-thresh que aproxima TARGET (busca binária) ----
function acharZ(k){
  let lo=-1.5, hi=2.5;
  for(let it=0; it<22; it++){
    const mid=(lo+hi)/2;
    const a=ativacao(k, mid, 12000);
    // ativação cai quando z sobe -> se ativou demais, sobe o z (lo=mid)
    if(a>TARGET) lo=mid; else hi=mid;
  }
  return +((lo+hi)/2).toFixed(2);
}
const ZTHRESH={};
for(const k of KEYS) ZTHRESH[k]=acharZ(k);

// ---- relatório de ativação final ----
console.error('\n=== ATIVAÇÃO RESULTANTE (alvo '+(TARGET*100)+'%) ===');
const finais={};
for(const k of KEYS){ finais[k]=+(ativacao(k, ZTHRESH[k], SIM)*100).toFixed(1); }
const vals=Object.values(finais);
for(const k of KEYS) console.error('  '+k.padEnd(13)+finais[k]+'%  (z='+ZTHRESH[k]+')');
console.error('  GAP: '+(Math.max(...vals)-Math.min(...vals)).toFixed(1)+'pp');

// ---- imprime os blocos prontos ----
const fmt = o => '{ '+KEYS.map(k=>k+':'+o[k]).join(', ')+' }';
const blocoMEAN   = 'const TACT_MEAN='+fmt(MEAN)+';';
const blocoSD     = 'const TACT_SD='+fmt(SD)+';';
const blocoPTSREF = 'const TACT_PTSREF = '+fmt(PTSREF)+';';
const blocoZT     = 'const TACT_ZTHRESH='+fmt(ZTHRESH)+';';

console.log('\n// ===== COLE NO engine.js (gerado por auto-calibra-taticas.js) =====');
console.log('// jogos usados: '+limpos.length+' ('+limpos.join(', ')+')');
console.log(blocoMEAN);
console.log(blocoSD);
console.log(blocoPTSREF);
console.log(blocoZT);

// ---- modo --apply: reescreve o engine.js ----
if (APPLY) {
  const engPath = path.join(DIR, 'engine.js');
  let s = fs.readFileSync(engPath, 'utf8');
  const subs = [
    [/const TACT_MEAN=\{[^}]*\};/, blocoMEAN],
    [/const TACT_SD=\{[^}]*\};/, blocoSD],
    [/const TACT_PTSREF = \{[^}]*\};/, blocoPTSREF],
    [/const TACT_ZTHRESH=\{[^}]*\};/, blocoZT],
  ];
  let ok=true;
  for(const [re,rep] of subs){
    if(!re.test(s)){ console.error('AVISO: não achei padrão pra', rep.slice(0,20),'— pulei.'); ok=false; continue; }
    s=s.replace(re,rep);
  }
  fs.writeFileSync(engPath, s);
  console.error('\nengine.js '+(ok?'atualizado ✓':'atualizado COM AVISOS (revise)'));
  console.error('Rode: node --check engine.js');
}
