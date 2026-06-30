// ============================================================
// quimica.js — Personalidades de jogo + Química do time.
// Camada NOVA e independente da tática. Bônus por montagem (visível na hora).
// persona-map.json mapeia "norm(nome)|POS" -> chave da persona.
// ============================================================
(function(){
"use strict";

// as 13 personalidades
var PERSONAS = {
  // goleiros
  paredao:        {nome:"Paredão",          ico:"🧤", setor:"GK",  desc:"Defende muito, segura o time."},
  goleiro_linha:  {nome:"Goleiro-Linha",    ico:"🦶", setor:"GK",  desc:"Sai jogando, distribui como um zagueiro."},
  voador:         {nome:"Goleiro-Voador",    ico:"🦅", setor:"GK", desc:"O mais exigido: faz muitas defesas por jogo."},
  // defensores
  muro:           {nome:"Muro",             ico:"🧱", setor:"DEF", desc:"Desarma, intercepta e bloqueia tudo."},
  torre:          {nome:"Torre",            ico:"🗼", setor:"DEF", desc:"Domina o jogo aéreo dos dois lados."},
  zagueiro_artista:{nome:"Zagueiro-Artista",ico:"🎻", setor:"DEF", desc:"Sai jogando e constrói desde a defesa."},
  // meias
  maestro:        {nome:"Maestro",          ico:"🪄", setor:"MID", desc:"Cérebro criativo: passes-chave e assistências."},
  motor:          {nome:"Motor",            ico:"🔋", setor:"MID", desc:"Box-to-box: corre o jogo inteiro."},
  volante:        {nome:"Volante",          ico:"🛡️", setor:"MID", desc:"Meia defensivo, protege a zaga."},
  // atacantes
  matador:        {nome:"Matador",          ico:"🎯", setor:"ATT", desc:"Finalizador nato, vive de gol."},
  veloz:          {nome:"Veloz",            ico:"⚡", setor:"ATT", desc:"Driblador de velocidade, puxa contra-ataque."},
  armador_avancado:{nome:"Armador Avançado",ico:"🎪", setor:"ATT", desc:"Cria pros outros, falso 9."},
  // coringa
  camaleao:       {nome:"Sem estilo definido", ico:"❔", setor:"ANY", desc:"Faltam dados da temporada pra definir um estilo — não gera bônus de química."},
};

// COMBOS especiais (química entre personas que se completam). Bônus em PONTOS.
// chave = par ordenado alfabeticamente "a+b". Cada combo soma uma vez por par presente.
var COMBOS = [
  // ataque/criação
  {par:["maestro","matador"],       pts:1.8, nome:"Servido na medida", txt:"Maestro arma, Matador converte."},
  {par:["armador_avancado","matador"], pts:1.6, nome:"Referência e garçom", txt:"Armador serve, Matador empilha gol."},
  {par:["maestro","veloz"],         pts:1.4, nome:"Tabela rápida",      txt:"Maestro lança o Veloz na frente."},
  {par:["veloz","matador"],         pts:1.3, nome:"Dupla de área",      txt:"Veloz cria o espaço, Matador finaliza."},
  {par:["torre","matador"],         pts:1.1, nome:"Jogo aéreo",         txt:"Torre ganha em cima, Matador aproveita."},
  // meio
  {par:["motor","maestro"],         pts:1.3, nome:"Meio completo",      txt:"Motor recupera, Maestro cria."},
  {par:["volante","veloz"],         pts:1.2, nome:"Roubada e arranque", txt:"Volante rouba, Veloz dispara no contra."},
  // defesa
  {par:["muro","torre"],            pts:1.6, nome:"Muralha de ferro",   txt:"Muro embaixo, Torre no alto."},
  {par:["muro","volante"],          pts:1.2, nome:"Bloco defensivo",    txt:"Volante e Muro fecham o caminho."},
  {par:["zagueiro_artista","maestro"], pts:1.3, nome:"Construção",      txt:"Zaga sai jogando, Maestro conduz."},
  // goleiros (antes órfãos)
  {par:["paredao","muro"],          pts:1.4, nome:"Defesa blindada",    txt:"Paredão no gol, Muro na frente dele."},
  {par:["voador","volante"],        pts:1.1, nome:"Cofre",             txt:"Volante protege, Voador faz a defensaça."},
  {par:["goleiro_linha","zagueiro_artista"], pts:1.4, nome:"Saída de bola", txt:"Time todo sai jogando de trás."},
];

// REFORÇO de iguais: N+ da mesma persona dá bônus de "identidade".
var REFORCO = { 2:0.7, 3:1.5, 4:2.5 };  // 2 iguais=+0.7, 3=+1.5, 4+=+2.5 (no time todo)

var QUIM_CAP = 4.5; // teto do bônus total de química por time

if(typeof window!=="undefined"){
  window.QUIMICA = {PERSONAS:PERSONAS, COMBOS:COMBOS, REFORCO:REFORCO, CAP:QUIM_CAP};
}
if(typeof module!=="undefined"&&module.exports){ module.exports={PERSONAS:PERSONAS,COMBOS:COMBOS,REFORCO:REFORCO,QUIM_CAP:QUIM_CAP}; }
})();

// ====== CÁLCULO DA QUÍMICA DE UM TIME ======
(function(){
  if(typeof window==="undefined") return;
  function norm(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
  var PART={van:1,von:1,de:1,del:1,der:1,den:1,di:1,da:1,dos:1,das:1,do:1,mac:1,mc:1,la:1,le:1,el:1,al:1,bin:1,ben:1,ter:1,st:1};
  function variants(name){
    var nn=norm(name), parts=nn.split(" "), out=[nn];
    if(parts.length>=2){
      var sur=parts[parts.length-1];
      if(PART[parts[parts.length-2]]) sur=parts[parts.length-2]+" "+sur;
      if(parts.length>=3 && PART[parts[parts.length-3]]) sur=parts[parts.length-3]+" "+sur;
      out.push(parts[0][0]+" "+sur, parts[0]+" "+sur, sur);
    }
    return out;
  }
  // acha a persona de um jogador (por nome|pos, com variantes e fallback de prefixo)
  var _prefixIdx=null;
  function buildPrefixIdx(MAP){
    // indexa: "primeiranome|POS" -> [lista de personas] (pra casar nome curto tipo "Alisson")
    var idx={};
    for(var k in MAP){
      var sep=k.lastIndexOf("|"); if(sep<0) continue;
      var nm=k.slice(0,sep), pos=k.slice(sep+1);
      var first=nm.split(" ")[0];
      if(first===nm) continue; // já é nome simples, não precisa
      var pk=first+"|"+pos;
      if(!idx[pk]) idx[pk]=[];
      if(idx[pk].indexOf(MAP[k])<0) idx[pk].push(MAP[k]);
    }
    return idx;
  }
  window.personaOf = function(name, pos){
    var MAP=window.PERSONA_MAP; if(!MAP) return null;
    var vs=variants(name);
    for(var i=0;i<vs.length;i++){ if(MAP[vs[i]+"|"+pos]) return MAP[vs[i]+"|"+pos]; }
    // fallback: nome curto (uma palavra) que é o primeiro nome de alguém único na posição
    // ex: pool manda "Alisson"/GK, base tem "alisson becker|GK" → casa se for o único
    var nn=norm(name);
    if(nn.indexOf(" ")<0){
      if(!_prefixIdx) _prefixIdx=buildPrefixIdx(MAP);
      var cands=_prefixIdx[nn+"|"+pos];
      if(cands && cands.length===1) return cands[0]; // só casa se não houver ambiguidade
    }
    // fallback de PREFIXO: o nome do pool é o início de um nome mais completo na base.
    // Ex.: pool="Pau Cubarsí", base tem "pau cubarsi paredes|DEF". Casa se a posição
    // bate e há correspondência ÚNICA (evita pegar o jogador errado).
    if(nn.indexOf(" ")>=0){
      var pfxHits=[], pfxSeen={};
      for(var k2 in MAP){
        var sp=k2.lastIndexOf("|"); if(sp<0) continue;
        if(k2.slice(sp+1)!==pos) continue;            // mesma posição só
        var base=k2.slice(0,sp);
        if(base===nn || base.indexOf(nn+" ")===0){    // base começa com o nome do pool
          var pv=MAP[k2];
          if(!pfxSeen[pv]){ pfxSeen[pv]=1; pfxHits.push(pv); }
          if(pfxHits.length>1) break;                 // ambíguo, desiste
        }
      }
      if(pfxHits.length===1) return pfxHits[0];
    }
    // fallback final: o nome existe em OUTRA posição. Aceita se TODAS as chaves que
    // batem apontam pra mesma persona (sem ambiguidade entre homônimos).
    // resolve Neymar (ATT na pool, MID na base), Raphinha (MID/ATT), etc.
    // IMPORTANTE: goleiro e jogador de linha nunca se cruzam — são mundos separados.
    // Sem isso, "Alexander Schlager"/GK herdaria a persona de "Xaver Schlager"/MID.
    var POSES = (pos==="GK") ? ["GK"] : ["DEF","MID","ATT"];
    var hits=[];
    for(var vi=0; vi<vs.length; vi++){
      for(var pi=0; pi<POSES.length; pi++){
        var key=vs[vi]+"|"+POSES[pi];
        if(MAP[key] && hits.indexOf(MAP[key])<0) hits.push(MAP[key]);
      }
      if(hits.length>1) break; // ambíguo, desiste
    }
    if(hits.length===1) return hits[0];
    return "camaleao"; // sem dado ou ambíguo → coringa
  };
  // calcula química do time: recebe lista [{name,pos}] dos titulares
  window.computeQuimica = function(players){
    var Q=window.QUIMICA; if(!Q) return null;
    var personas=players.map(function(p){return window.personaOf(p.name,p.pos);}).filter(Boolean);
    // conta cada persona
    var count={}; personas.forEach(function(pe){count[pe]=(count[pe]||0)+1;});
    var bonus=0, hits=[];
    // 1) combos especiais (cada par presente conta uma vez)
    Q.COMBOS.forEach(function(c){
      var a=c.par[0], b=c.par[1];
      if(count[a] && count[b]){
        bonus+=c.pts;
        hits.push({tipo:"combo", nome:c.nome, txt:c.txt, pts:c.pts, ico:(Q.PERSONAS[a].ico+Q.PERSONAS[b].ico)});
      }
    });
    // 2) reforço de iguais (maior faixa atingida por persona) — camaleão NÃO conta (não é identidade)
    for(var pe in count){
      if(pe==="camaleao") continue;
      var nrep=count[pe];
      var add=0, faixa=0;
      Object.keys(Q.REFORCO).map(Number).sort(function(x,y){return x-y;}).forEach(function(f){
        if(nrep>=f){ add=Q.REFORCO[f]; faixa=f; }
      });
      if(add>0){
        bonus+=add;
        hits.push({tipo:"reforco", nome:nrep+"× "+Q.PERSONAS[pe].nome, txt:"Time com identidade de "+Q.PERSONAS[pe].nome+".", pts:add, ico:Q.PERSONAS[pe].ico});
      }
    }
    bonus=Math.min(bonus, Q.CAP);
    return {bonus:Math.round(bonus*10)/10, hits:hits, personas:personas, count:count};
  };

  // sugere combos que FALTAM pouco: pra cada combo não-ativo, diz se você já tem
  // uma das duas personas (falta só a outra). Retorna lista ordenada por pts.
  window.suggestQuimica = function(players){
    var Q=window.QUIMICA; if(!Q) return [];
    var personas=players.map(function(p){return window.personaOf(p.name,p.pos);}).filter(Boolean);
    var count={}; personas.forEach(function(pe){count[pe]=(count[pe]||0)+1;});
    var sugg=[];
    Q.COMBOS.forEach(function(c){
      var a=c.par[0], b=c.par[1];
      if(count[a] && count[b]) return; // já ativo
      // tem um dos dois? sugere o que falta
      if(count[a] && !count[b]){
        sugg.push({pts:c.pts, nome:c.nome, tem:Q.PERSONAS[a], falta:Q.PERSONAS[b]});
      } else if(count[b] && !count[a]){
        sugg.push({pts:c.pts, nome:c.nome, tem:Q.PERSONAS[b], falta:Q.PERSONAS[a]});
      }
    });
    // dedup por persona que falta (mostra o melhor combo por persona faltante)
    var bestByFalta={};
    sugg.forEach(function(s){
      var k=s.falta.nome;
      if(!bestByFalta[k] || s.pts>bestByFalta[k].pts) bestByFalta[k]=s;
    });
    return Object.values(bestByFalta).sort(function(x,y){return y.pts-x.pts;}).slice(0,3);
  };
})();

// ====== carrega persona-map.json sob demanda ======
(function(){
  if(typeof window==="undefined") return;
  var _p=null;
  window.ensurePersonaMap=function(){
    if(window.PERSONA_MAP) return Promise.resolve(window.PERSONA_MAP);
    if(_p) return _p;
    _p=fetch("persona-map.json?v=20260630-williams")
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){window.PERSONA_MAP=j||{};return window.PERSONA_MAP;})
      .catch(function(){window.PERSONA_MAP={};return window.PERSONA_MAP;});
    return _p;
  };
  // carrega cedo (não bloqueia): assim a química já está pronta quando o user monta
  if(typeof document!=="undefined" && document.addEventListener){
    document.addEventListener("DOMContentLoaded",function(){window.ensurePersonaMap();});
  } else if(typeof window!=="undefined" && window.ensurePersonaMap){ try{window.ensurePersonaMap();}catch(e){} }
})();
