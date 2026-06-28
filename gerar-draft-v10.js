// ============================================================
// GERAR-DRAFT-v10.js — Gerador DEFINITIVO do banco master do Draft
// ------------------------------------------------------------
// Funde a fórmula v9 (5 fatores) com o fator COPA REAL ligado à engine.
// Autossuficiente: não depende de v6/v7/v8 soltos.
//
//   Copa 40% (DOMINANTE, via engine sobre jogos apurados)
//   + ELO clube 22% + desempenho clube 18% + mercado 12% + ELO seleção 8%
//   → escala 3..100, faixa saudável (~22..100), Copa por percentil+shrinkage.
//
// MUDANÇA-CHAVE vs gerador antigo:
//   - O HOOK copaScoreByPlayer() agora está LIGADO (lê games-part apurados).
//   - Peso Copa = 0.40 (cheio), com gamma 1.0 / teto 112 recalibrados para
//     NÃO achatar a escala com o peso dominante.
//
// FONTES (mesma pasta):
//   club-elo-map.js · eloratings.txt · base-unificada.json (=base-unificada-2.0)
//   draft-master-players.js (lista de entrada) · engine.js · games-part*.js
//
// USO:
//   node gerar-draft-v10.js            → gera draft-master-players.NEW.js
//   node gerar-draft-v10.js --write    → sobrescreve draft-master-players.js
//
// RECALCULAR: ao apurar novos jogos da Copa, é só rodar de novo. O fator Copa
// relê todos os games-part*.js automaticamente.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG = {
  dir: __dirname,
  clubElo:  'club-elo-map.js',
  eloSel:   'eloratings.txt',
  base:     'base-unificada.json',
  players:  'draft-master-players.js',
  engine:   'engine.js',
  out:      'draft-master-players.NEW.js',
  // pesos v10 (Copa dominante):
  W: { copa:0.40, eloClube:0.22, desempClube:0.18, mercado:0.12, eloSel:0.08 },
  // escala recalibrada p/ peso Copa 0.40 sem achatar:
  params: { piso:3, teto:112, gamma:1.0, mexp:0.5, mtopo:180 },
  COPA_NEUTRA: 0.5,
};

const norm = s => !s ? '' : s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[._\-']/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const lastTok = s => { const p = norm(s).split(' '); return p[p.length-1]||''; };
const P = (...a) => path.join(CONFIG.dir, ...a);

globalThis.window = globalThis;

// ---- FATOR 2: ELO clube ----
const { CLUB_ELO_EXACT, CLUB_ELO_STRIPPED } = require(P(CONFIG.clubElo));
const SUFFIX = /\b(fc|cf|sc|ac|club|de|the|sad|ss|us|as|afc|cd|ec|sk|fk|if|bk|ca|rc)\b/g;
function clubElo(club){
  const n = norm(club);
  if (CLUB_ELO_EXACT[n]    != null) return CLUB_ELO_EXACT[n];
  if (CLUB_ELO_STRIPPED[n] != null) return CLUB_ELO_STRIPPED[n];
  const n2 = n.replace(SUFFIX,' ').replace(/\s+/g,' ').trim();
  if (CLUB_ELO_STRIPPED[n2]!= null) return CLUB_ELO_STRIPPED[n2];
  const n3 = n2.split(' ').slice(0,2).join(' ');
  if (CLUB_ELO_STRIPPED[n3]!= null) return CLUB_ELO_STRIPPED[n3];
  return null;
}

// ---- FATOR 5: ELO seleção ----
const ISO3 = {ES:"ESP",AR:"ARG",FR:"FRA",EN:"ENG",CO:"COL",BR:"BRA",PT:"POR",NL:"NED",DE:"GER",HR:"CRO",IT:"ITA",BE:"BEL",MA:"MAR",CH:"SUI",US:"USA",MX:"MEX",UY:"URU",JP:"JPN",SN:"SEN",IR:"IRN",DZ:"ALG",KR:"KOR",EC:"ECU",AU:"AUS",NO:"NOR",EG:"EGY",PY:"PAR",CI:"CIV",QA:"QAT",SA:"KSA",GH:"GHA",CZ:"CZE",ZA:"RSA",PA:"PAN",JO:"JOR",CW:"CUW",HT:"HAI",CV:"CPV",NZ:"NZL",UZ:"UZB",CD:"COD",IQ:"IRQ",TR:"TUR",TN:"TUN",AT:"AUT",SE:"SWE"};
function loadEloSel(){
  const txt = fs.readFileSync(P(CONFIG.eloSel),'utf8');
  const m = {};
  for (const line of txt.split('\n')){
    const c = line.split('\t');
    if (c.length>4 && /^[A-Z]{2,3}$/.test(c[2])){
      const code = c[2]==='SCO' ? 'SCO' : ISO3[c[2]];
      if (code) m[code] = +c[3];
    }
  }
  return m;
}

// ---- FATOR 3: desempenho clube ----
function buildBaseIndex(){
  const base = JSON.parse(fs.readFileSync(P(CONFIG.base))).jogadores;
  const full={}, short={}, sob={};
  for (const j of base){
    (full [norm(j.fullName)] = full [norm(j.fullName)] || []).push(j);
    (short[norm(j.name)]     = short[norm(j.name)]     || []).push(j);
    (sob  [lastTok(j.name)]  = sob  [lastTok(j.name)]  || []).push(j);
  }
  return { full, short, sob };
}
function matchBase(p, B){
  const nf = norm(p.name), club = norm(p.club);
  for (const idx of [B.full, B.short]){
    const c = idx[nf];
    if (c){ if (c.length===1) return c[0];
      const bc = c.filter(r=>norm(r.team)===club);
      if (bc.length) return bc[0]; }
  }
  const c = B.sob[lastTok(p.name)];
  if (c){ if (c.length===1) return c[0];
    const bc = c.filter(r=>norm(r.team)===club);
    if (bc.length===1) return bc[0];
    return c.slice().sort((a,b)=>(b.minutes||0)-(a.minutes||0))[0]; }
  return null;
}

// ---- FATOR 4: mercado ----
const POS_MV_MULT = { GK:3.0, DEF:1.36, MID:0.81, ATT:1.00 };
const CURVA_IDADE = {16:.35,17:.38,18:.42,19:.47,20:.53,21:.60,22:.69,23:.80,24:.92,25:1,26:1,27:1,28:1.12,29:1.35,30:1.70,31:2.10,32:2.55,33:3.05,34:3.55,35:4.05,36:4.55,37:5,38:5.40,39:5.75,40:6};
const multIdade = a => !a ? 1 : a<16 ? .35 : a>40 ? 6 : (CURVA_IDADE[a]||1);
const multIdadeMv = (age,mv) => { const b=multIdade(age); return b>=1 ? b : b+(1-b)*Math.min(.7,Math.pow((mv||0)/200e6,.7)*.7); };
function fMercado(p){
  const mv = (p.marketValue||0) * (POS_MV_MULT[p.pos]||1) * multIdadeMv(p.age, p.marketValue||0);
  return clamp(Math.pow(mv/(CONFIG.params.mtopo*1e6), CONFIG.params.mexp), 0, 1);
}
const fEloClube = p => { const e=clubElo(p.club); return e==null?null:clamp((e-1100)/1000,0,1); };
const fEloSel   = (p,sel) => { const e=sel[p.team]; return e==null?null:clamp((e-1100)/1050,0,1); };
function fDesemp(p,B){
  const j = matchBase(p,B); if (!j || j.rating==null) return null;
  const r = +j.rating; if (!isFinite(r) || r<=0) return null;
  const rs = clamp((r-6.0)/1.6, 0, 1);
  const vol = Math.min(1,(j.minutes||0)/2000);
  return rs*(0.7+0.3*vol);
}

// ============================================================
// FATOR 1: COPA — LIGADO À ENGINE (v10)
// Média de pontos por jogo nos games-part apurados → percentil na posição
// → shrinkage por nº de jogos. Casa por _name (jogos novos) ou prepool[id]
// (jogos antigos sem _name).
// ============================================================
require(P(CONFIG.engine)); // expõe window.makeEngine
function parseGames(file){
  const t=fs.readFileSync(file,'utf8');const out=[];let i=0;
  while(true){
    const s=t.indexOf('__add(',i);if(s<0)break;
    if(t.slice(s+6,s+30).trimStart().startsWith('idx')){i=s+6;continue;}
    const st=t.indexOf('(',s);let depth=0,e=-1;
    for(let k=st;k<t.length;k++){const c=t[k];if(c==='(')depth++;else if(c===')'){depth--;if(depth===0){e=k;break;}}}
    if(e<0)break;
    const inner=t.slice(st+1,e);const args=[];let d=0,ins=false,esc=false,cur='';
    for(const ch of inner){
      if(esc){cur+=ch;esc=false;continue;}if(ch==='\\'){cur+=ch;esc=true;continue;}
      if(ch==='"'){ins=!ins;cur+=ch;continue;}
      if(!ins){if('{[('.includes(ch))d++;else if('}])'.includes(ch))d--;if(ch===','&&d===0){args.push(cur);cur='';continue;}}
      cur+=ch;
    }
    args.push(cur);i=e+1;
    try{out.push([JSON.parse(args[0]),JSON.parse(args[2])]);}catch(e){}
  }
  return out;
}
function copaScoreByPlayer(){
  const acc={};
  const files=fs.readdirSync(CONFIG.dir).filter(f=>/^games-part\d+\.js$/.test(f));
  let njogos=0;
  for(const fn of files){
    for(const [idx,data] of parseGames(P(fn))){
      const m=data.match;
      if(!m||m.neutral!==true||m.status!=='finished')continue; // só Copa apurada
      let eng;try{eng=window.makeEngine(m);}catch(e){continue;}
      njogos++;
      const prepool={};
      if(data.prepool&&data.prepool.players)data.prepool.players.forEach(pp=>{prepool[pp.id]={name:pp.name,pos:pp.pos};});
      for(const [pid,p] of Object.entries(m.players||{})){
        if(!(p.min>0))continue;
        const meta=p._name?{name:p._name,pos:p.pos}:(prepool[pid]||prepool[+pid]);
        if(!meta||!meta.name)continue;
        let pts=0;try{pts=eng.scorePlayer(p,'tiki',0).total||0;}catch(e){}
        const pos=p.pos||meta.pos||'MID';
        const key=norm(meta.name)+'|'+pos;
        (acc[key]=acc[key]||{name:meta.name,pos,pts:[]}).pts.push(pts);
      }
    }
  }
  // média por jogador
  const arr=Object.values(acc).map(a=>{
    const n=a.pts.length;const media=a.pts.reduce((s,v)=>s+v,0)/n;
    return {name:a.name,pos:a.pos,n,media};
  });
  // percentil na posição
  const byPos={};arr.forEach(a=>{(byPos[a.pos]=byPos[a.pos]||[]).push(a.media);});
  for(const k in byPos)byPos[k].sort((x,y)=>x-y);
  function pct(val,sorted){
    if(sorted.length<=1)return 0.5;
    let below=0,equal=0;for(const v of sorted){if(v<val)below++;else if(v===val)equal++;}
    return (below+equal*0.5)/sorted.length;
  }
  const byName={};
  for(const a of arr){
    const p=pct(a.media,byPos[a.pos]);
    const conf=a.n/(a.n+2);              // shrinkage: poucos jogos → puxa p/ 0.5
    const copaFinal=0.5*(1-conf)+p*conf;
    const nn=norm(a.name);
    (byName[nn]=byName[nn]||[]).push({pos:a.pos,copa:copaFinal,n:a.n});
  }
  byName.__njogos=njogos; byName.__nplayers=arr.length;
  return byName;
}
function copaFor(byName,name,pos){
  const nn=norm(name);const l=byName[nn];
  if(!l||!Array.isArray(l))return null;
  if(l.length===1)return l[0].copa;
  const same=l.find(x=>x.pos===pos);
  return same?same.copa:l[0].copa;
}

// ---- preço final ----
function draftPrice(p, ctx){
  const { W, params } = CONFIG;
  const cf = copaFor(ctx.copa, p.name, p.pos);
  const copa = cf!=null ? cf : CONFIG.COPA_NEUTRA;
  const comps = [
    [W.copa,        copa],
    [W.eloClube,    fEloClube(p)],
    [W.desempClube, fDesemp(p, ctx.B)],
    [W.mercado,     fMercado(p)],
    [W.eloSel,      fEloSel(p, ctx.sel)],
  ];
  let s=0,w=0;
  for (const [wt,v] of comps) if (v!=null){ s+=wt*v; w+=wt; }
  if (w===0) return params.piso;
  const score = Math.pow(s/w, params.gamma);
  return clamp(Math.round(params.piso + score*(params.teto-params.piso)), params.piso, 100);
}

function main(){
  const write = process.argv.includes('--write');
  require(P(CONFIG.players));
  const players = globalThis.draftMasterPlayers;
  const copa = copaScoreByPlayer();
  const ctx = { sel: loadEloSel(), B: buildBaseIndex(), copa };
  const njogos = copa.__njogos||0;

  let mudou=0, sumAbs=0;
  const out = players.map(p=>{
    const price = draftPrice(p, ctx);
    const old = p.draftPrice;
    if (typeof old==='number'){ if(price!==old)mudou++; sumAbs+=Math.abs(price-old); }
    return { ...p, draftPrice: price };
  });
  console.log('Copa ligada: '+njogos+' jogos apurados | '+(copa.__nplayers||0)+' jogadores pontuados');
  console.log('preços alterados vs banco anterior: '+mudou+'/'+out.length+' | variação média '+(sumAbs/out.length).toFixed(1)+' moedas');
  const pr=out.map(p=>p.draftPrice).sort((a,b)=>a-b);
  console.log('faixa final: min '+pr[0]+' · mediana '+pr[Math.floor(pr.length/2)]+' · max '+pr[pr.length-1]);

  const header =
'// ============================================================\n'+
'// FANTASY PvP — BANCO MASTER DO MODO DRAFT (draftMasterPlayers)\n'+
'// '+out.length+' jogadores · draftPrice v10 (5 fatores + Copa REAL via engine)\n'+
'// Copa 40% (DOMINANTE) + ELO clube 22% + desempenho clube 18% + mercado 12% + ELO seleção 8%\n'+
'//   - fator Copa = média de pontos/jogo nos games-part apurados (percentil+shrinkage)\n'+
'//   - escala recalibrada (gamma 1.0 / teto 112) p/ peso Copa 0.40 sem achatar\n'+
'// gerado por gerar-draft-v10.js em '+new Date().toISOString().slice(0,10)+' · '+njogos+' jogos da Copa · recalcular ao apurar novos\n'+
'// ============================================================\n'+
"if(typeof window==='undefined')var window=globalThis;\n"+
'window.draftMasterPlayers = [\n';
  const body = out.map(p =>
    '  { name:'+JSON.stringify(p.name)+', team:'+JSON.stringify(p.team)+', pos:'+JSON.stringify(p.pos)+', age:'+p.age+', marketValue:'+p.marketValue+', draftPrice:'+p.draftPrice+', club:'+JSON.stringify(p.club)+', league:'+JSON.stringify(p.league)+', country:'+JSON.stringify(p.country)+' },'
  ).join('\n');
  const text = header + body + '\n];\n';
  const target = write ? P(CONFIG.players) : P(CONFIG.out);
  fs.writeFileSync(target, text);
  console.log('Escrito: '+target+'  ('+out.length+' jogadores)');
}
if (require.main === module) main();
module.exports = { draftPrice, copaScoreByPlayer, copaFor, clubElo, loadEloSel, buildBaseIndex, matchBase, fMercado, fEloClube, fEloSel, fDesemp, norm, CONFIG };
