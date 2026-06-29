// ============================================================
// REIMPORTAR-POSICOES.js
// Busca a posição REAL de cada jogador na API-Football (pelo ID que já está
// na base) e corrige a base-unificada. Resolve as posições "genéricas/chutadas".
//
// >>> RODE NA SUA MÁQUINA (precisa de internet + chave da API-Football) <<<
//
// PREPARO (uma vez):
//   1. tenha o Node.js instalado
//   2. coloque este arquivo na MESMA pasta da base-unificada-2.0
//   3. tenha sua chave da API-Football em mãos
//
// USO:
//   API_KEY=sua_chave_aqui node reimportar-posicoes.js
//
// OPÇÕES (variáveis de ambiente):
//   API_KEY    (obrigatório) sua chave da API-Football
//   SEASON     (opcional) temporada, padrão 2025
//   HOST       (opcional) 'v3.football.api-sports.io' (padrão, direto)
//              ou 'api-football-v1.p.rapidapi.com' se você usa via RapidAPI
//   LIMIT      (opcional) processa só os N primeiros (pra testar; ex: LIMIT=20)
//   START      (opcional) retoma a partir do índice N (se parou no meio)
//
// O script grava:
//   - base-unificada-2.1         (base com posições corrigidas)
//   - posicoes-cache.json        (cache do que já buscou — permite retomar)
//   - relatorio-posicoes.txt     (lista do que mudou, pra você conferir)
// ============================================================
'use strict';
const fs = require('fs');
const https = require('https');

const API_KEY = process.env.API_KEY;
const SEASON  = process.env.SEASON || '2025';
const HOST    = process.env.HOST || 'v3.football.api-sports.io';
const LIMIT   = process.env.LIMIT ? parseInt(process.env.LIMIT,10) : Infinity;
const START   = process.env.START ? parseInt(process.env.START,10) : 0;

if(!API_KEY){
  console.error('ERRO: defina sua chave. Ex:  API_KEY=xxxx node reimportar-posicoes.js');
  process.exit(1);
}

const BASE_FILE = 'base-unificada-2.0';
const OUT_FILE  = 'base-unificada-2.1';
const CACHE_FILE= 'posicoes-cache.json';
const REPORT    = 'relatorio-posicoes.txt';

// mapeia o "position" da API-Football pra macro-categoria do app
function macroFromAPI(position){
  if(!position) return null;
  const p = String(position).toLowerCase();
  if(p.includes('goalkeeper')) return 'GK';
  if(p.includes('defender'))   return 'DEF';
  if(p.includes('midfielder')) return 'MID';
  if(p.includes('attacker'))   return 'ATT';
  return null;
}
const POSCAT = {Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Attacker:'ATT'};
const MACRO_TO_LONG = {GK:'Goalkeeper',DEF:'Defender',MID:'Midfielder',ATT:'Attacker'};

// chamada HTTP à API-Football (com headers conforme o host)
function apiGet(playerId){
  return new Promise((resolve,reject)=>{
    const path = `/players?id=${playerId}&season=${SEASON}`;
    const headers = HOST.includes('rapidapi')
      ? {'x-rapidapi-key':API_KEY,'x-rapidapi-host':HOST}
      : {'x-apisports-key':API_KEY};
    const req = https.request({host:HOST,path,method:'GET',headers},res=>{
      let data='';
      res.on('data',c=>data+=c);
      res.on('end',()=>{
        try{ resolve(JSON.parse(data)); }catch(e){ reject(e); }
      });
    });
    req.on('error',reject);
    req.setTimeout(15000,()=>{req.destroy(new Error('timeout'));});
    req.end();
  });
}

// extrai a posição principal da resposta da API
function posFromResponse(json){
  try{
    const r = json && json.response && json.response[0];
    if(!r) return null;
    // 1) posição "oficial" do jogador
    let pos = r.player && r.player.position;
    // 2) se faltar, pega da maior amostra de jogos nas estatísticas
    if(!pos && Array.isArray(r.statistics)){
      let best=null,bestGames=-1;
      for(const st of r.statistics){
        const g = (st.games && st.games.appearences) || 0;
        const p = st.games && st.games.position;
        if(p && g>bestGames){bestGames=g;best=p;}
      }
      pos=best;
    }
    return pos||null;
  }catch(e){ return null; }
}

const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function main(){
  const base = JSON.parse(fs.readFileSync(BASE_FILE,'utf8'));
  const jogadores = base.jogadores;
  let cache = {};
  if(fs.existsSync(CACHE_FILE)){
    try{ cache = JSON.parse(fs.readFileSync(CACHE_FILE,'utf8')); }catch(e){ cache={}; }
  }

  const total = Math.min(jogadores.length, START+LIMIT);
  console.log(`Base: ${jogadores.length} jogadores. Processando de ${START} até ${total-1}.`);
  console.log(`Season=${SEASON} Host=${HOST}`);
  console.log(`Cache: ${Object.keys(cache).length} já buscados.\n`);

  let req=0, erros=0;
  for(let i=START; i<total; i++){
    const j = jogadores[i];
    const id = j.id;
    if(!id) continue;
    if(cache[id]===undefined){
      // ainda não buscou esse id: chama a API
      try{
        const json = await apiGet(id);
        // respeita rate-limit: a API-Football free ~10 req/min; pago bem mais.
        // ajusta a pausa conforme seu plano. 6500ms = seguro pro free.
        const pos = posFromResponse(json);
        cache[id] = pos || null;
        req++;
        // salva o cache a cada 25 buscas (permite retomar se cair)
        if(req % 25 === 0){
          fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
          console.log(`  ...${i}/${total}  (${req} chamadas, ${erros} erros)`);
        }
        await sleep(parseInt(process.env.DELAY||'6500',10));
      }catch(e){
        erros++;
        cache[id] = cache[id] || null;
        await sleep(2000);
      }
    }
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  // aplica as posições do cache na base, com proteção: só corrige se a API
  // deu uma posição válida E ela difere da atual.
  const linhas = [];
  let corrigidos=0;
  for(const j of jogadores){
    const apiPos = cache[j.id];
    const macro = macroFromAPI(apiPos);
    if(!macro) continue;
    const atual = POSCAT[j.pos] || null;
    if(macro !== atual){
      linhas.push(`${(j.fullName||j.name)}  ${atual} -> ${macro}  (API: ${apiPos}, src antigo: ${j.posSrc})`);
      j.pos = MACRO_TO_LONG[macro];
      j.posCat = macro;
      j.posSrc = 'api-football';
      corrigidos++;
    } else {
      // confirma a posição (marca como confiável mesmo sem mudar)
      if(j.posSrc==='generica') j.posSrc='api-football-confirmado';
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(base));
  fs.writeFileSync(REPORT, `POSIÇÕES CORRIGIDAS: ${corrigidos}\n\n` + linhas.join('\n'));
  console.log(`\nPRONTO.`);
  console.log(`  posições corrigidas: ${corrigidos}`);
  console.log(`  base nova: ${OUT_FILE}`);
  console.log(`  relatório: ${REPORT} (confira antes de usar!)`);
  console.log(`\nDepois: rode 'node gerar-overall-final.js --write' e 'node gerar-persona.js --write'`);
  console.log(`apontando pra base-unificada-2.1 pra recalcular OVR e personas com as posições certas.`);
}

main().catch(e=>{console.error('FALHA:',e);process.exit(1);});
