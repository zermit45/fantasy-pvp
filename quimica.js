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

// COMBOS removidos: a química agora é 100% baseada em TRIOS (3 personas de
// posições diferentes). Combos de par foram descontinuados.
var COMBOS = []; // vazio (retrocompat: computeQuimica ignora se vazio)

// REFORÇO de iguais: N+ da mesma persona dá bônus de "identidade".
var REFORCO = { 2:0.7 };  // só 2 iguais=+0.7. (3+/4+ impossíveis: max 2 da mesma persona = posição + FLEX)

// TRIOS: a química é SÓ trios — 3 personas de POSIÇÕES DIFERENTES (escaláveis num time
// GK+DEF+MID+ATT+FLEX). São 8 trios, cada persona em EXATAMENTE 2, e NENHUM par de personas
// se repete entre trios (bem espalhado). FORMAR o trio (as 3 personas escaladas) já dá o
// bônus cheio (+3.5), sem condição. Simples e direto.
var TRIOS = [
  { key:"ataque_relampago", set:["muro","maestro","matador"], pts:3.5,
    nome:"Ataque relâmpago", ico:"🧱🪄🎯",
    txt:"Muro lança, Maestro conduz, Matador conclui." },
  { key:"roubada_gol", set:["muro","motor","veloz"], pts:3.5,
    nome:"Roubada e gol", ico:"🧱🔋⚡",
    txt:"Muro rouba, Motor toca, Veloz define." },
  { key:"saida_criativa", set:["paredao","maestro","veloz"], pts:3.5,
    nome:"Saída criativa", ico:"🧤🪄⚡",
    txt:"Paredão inicia, Maestro pensa, Veloz voa." },
  { key:"muralha_ofensiva", set:["paredao","motor","matador"], pts:3.5,
    nome:"Muralha ofensiva", ico:"🧤🔋🎯",
    txt:"Paredão segura, Motor sustenta, Matador resolve." },
  { key:"eixo_construtor", set:["goleiro_linha","torre","armador_avancado"], pts:3.5,
    nome:"Eixo construtor", ico:"🦶🗼🎪",
    txt:"Sai jogando limpo, Torre e Armador finalizam." },
  { key:"trama_ponta", set:["voador","zagueiro_artista","armador_avancado"], pts:3.5,
    nome:"Trama pela ponta", ico:"🦅🎻🎪",
    txt:"Voador cobre, Zaga constrói, Armador inventa." },
  { key:"base_solida", set:["goleiro_linha","zagueiro_artista","volante"], pts:3.5,
    nome:"Base sólida", ico:"🦶🎻🛡️",
    txt:"Goleiro-Linha inicia, Zaga apoia, Volante fecha." },
  { key:"bloqueio_alto", set:["voador","torre","volante"], pts:3.5,
    nome:"Bloqueio alto", ico:"🦅🗼🛡️",
    txt:"Voador no fundo, Torre e Volante travam tudo." }
];

var QUIM_CAP = 5.0; // teto do bônus total de química por time (só trios agora)

if(typeof window!=="undefined"){
  window.QUIMICA = {PERSONAS:PERSONAS, COMBOS:COMBOS, REFORCO:REFORCO, TRIOS:TRIOS, CAP:QUIM_CAP};
}
if(typeof module!=="undefined"&&module.exports){ module.exports={PERSONAS:PERSONAS,COMBOS:COMBOS,REFORCO:REFORCO,TRIOS:TRIOS,QUIM_CAP:QUIM_CAP}; }
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
  var _prefixIdx=null;
  function buildPrefixIdx(MAP){
    var idx={};
    for(var k in MAP){
      var sep=k.lastIndexOf("|"); if(sep<0) continue;
      var nm=k.slice(0,sep), pos=k.slice(sep+1);
      var first=nm.split(" ")[0];
      if(first===nm) continue;
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
    var nn=norm(name);
    if(nn.indexOf(" ")<0){
      if(!_prefixIdx) _prefixIdx=buildPrefixIdx(MAP);
      var cands=_prefixIdx[nn+"|"+pos];
      if(cands && cands.length===1) return cands[0];
    }
    if(nn.indexOf(" ")>=0){
      var pfxHits=[], pfxSeen={};
      for(var k2 in MAP){
        var sp=k2.lastIndexOf("|"); if(sp<0) continue;
        if(k2.slice(sp+1)!==pos) continue;
        var base=k2.slice(0,sp);
        if(base===nn || base.indexOf(nn+" ")===0){
          var pv=MAP[k2];
          if(!pfxSeen[pv]){ pfxSeen[pv]=1; pfxHits.push(pv); }
          if(pfxHits.length>1) break;
        }
      }
      if(pfxHits.length===1) return pfxHits[0];
    }
    var POSES = (pos==="GK") ? ["GK"] : ["DEF","MID","ATT"];
    var hits=[];
    for(var vi=0; vi<vs.length; vi++){
      for(var pi=0; pi<POSES.length; pi++){
        var key=vs[vi]+"|"+POSES[pi];
        if(MAP[key] && hits.indexOf(MAP[key])<0) hits.push(MAP[key]);
      }
      if(hits.length>1) break;
    }
    if(hits.length===1) return hits[0];
    return "camaleao";
  };
  window.computeQuimica = function(players, ctx){
    var Q=window.QUIMICA; if(!Q) return null;
    // cada player: {name, pos, st?} onde st são os stats individuais do jogo
    // (goals, assists, sots, sca, gca, tklint, block, saves, recovery). st é opcional
    // (na montagem/previsão não existe ainda).
    var withPersona=players.map(function(p){
      return {name:p.name, pos:p.pos, st:p.st||null, persona:window.personaOf(p.name,p.pos)};
    });
    var personas=withPersona.map(function(p){return p.persona;}).filter(Boolean);
    var count={}; personas.forEach(function(pe){count[pe]=(count[pe]||0)+1;});
    var bonus=0, hits=[];
    Q.COMBOS.forEach(function(c){
      var a=c.par[0], b=c.par[1];
      if(count[a] && count[b]){
        bonus+=c.pts;
        hits.push({tipo:"combo", nome:c.nome, txt:c.txt, pts:c.pts, ico:(Q.PERSONAS[a].ico+Q.PERSONAS[b].ico)});
      }
    });
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
    // TRIOS (simples): formou as 3 personas do trio → soma o bônus cheio. Sem condição.
    // trios[] guarda as keys dos trios formados (usado pelo bônus de capitão ×1.5).
    var trios=[];
    (Q.TRIOS||[]).forEach(function(t){
      var temTodas = t.set.every(function(pe){return count[pe];});
      if(!temTodas) return;
      var pts = (t.pts!=null?t.pts:3.5);
      bonus += pts;
      trios.push(t.key);
      hits.push({tipo:"trio", key:t.key, nome:t.nome, txt:t.txt, pts:pts, ico:t.ico, set:t.set});
    });
    bonus=Math.min(bonus, Q.CAP);
    return {bonus:Math.round(bonus*10)/10, hits:hits, personas:personas, count:count, trios:trios};
  };

  window.suggestQuimica = function(players){
    var Q=window.QUIMICA; if(!Q) return [];
    var personas=players.map(function(p){return window.personaOf(p.name,p.pos);}).filter(Boolean);
    var count={}; personas.forEach(function(pe){count[pe]=(count[pe]||0)+1;});
    var sugg=[];
    // sugere TRIOS onde você já tem 2 das 3 personas (falta só 1 pra formar)
    (Q.TRIOS||[]).forEach(function(t){
      var tem=t.set.filter(function(pe){return count[pe];});
      var falta=t.set.filter(function(pe){return !count[pe];});
      if(tem.length===2 && falta.length===1){
        sugg.push({pts:(t.pts!=null?t.pts:3.5), nome:t.nome, falta:Q.PERSONAS[falta[0]], ico:t.ico});
      }
    });
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
    _p=fetch("persona-map.json?v=20260701-homonimo")
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){window.PERSONA_MAP=j||{};return window.PERSONA_MAP;})
      .catch(function(){window.PERSONA_MAP={};return window.PERSONA_MAP;});
    return _p;
  };
  if(typeof document!=="undefined" && document.addEventListener){
    document.addEventListener("DOMContentLoaded",function(){window.ensurePersonaMap();});
  } else if(typeof window!=="undefined" && window.ensurePersonaMap){ try{window.ensurePersonaMap();}catch(e){} }
})();
