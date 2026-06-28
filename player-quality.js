/* ============================================================
   PLAYER QUALITY — overall e atributos de QUALIDADE do jogador
   Fonte: draftMasterPlayers (1251) + club-elo-map (ELO de ~3000 clubes)
   - OVERALL = Mercado 50% + Liga 30% + Clube 20% (percentil → 40..99)
   - Força da liga = ELO médio dos clubes daquela liga (robusto)
   - Atributos de qualidade por posição (pra quem não tem partidas)
   - Exposto como window.playerQuality.* — não altera nada existente.
   ============================================================ */
(function(){
  "use strict";
  if(typeof window==="undefined")return;

  function norm(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}

  // ELO de clube: tenta EXACT, depois STRIPPED, depois sem sufixos comuns
  function clubElo(club){
    var EX=window.CLUB_ELO_EXACT, ST=window.CLUB_ELO_STRIPPED;
    if(!EX||!ST)return null;
    var n=norm(club);
    if(EX[n]!=null)return EX[n];
    if(ST[n]!=null)return ST[n];
    var n2=n.replace(/\b(fc|cf|sc|ac|fk|club|de|the)\b/g,"").replace(/\s+/g," ").trim();
    if(ST[n2]!=null)return ST[n2];
    return null;
  }

  var _ready=false, _ligaForca={}, _medianaElo=1400;
  var _mvAll=[], _clubAll=[], _ligaAll=[];

  function build(){
    if(_ready)return;
    var P=window.draftMasterPlayers; if(!P||!P.length)return;
    // força da liga = média ELO dos clubes distintos
    var ligaClubs={}, allElos=[];
    P.forEach(function(p){var e=clubElo(p.club); if(e==null)return; (ligaClubs[p.league]=ligaClubs[p.league]||{})[norm(p.club)]=e;});
    for(var l in ligaClubs){var v=Object.keys(ligaClubs[l]).map(function(k){return ligaClubs[l][k];});
      _ligaForca[l]=v.reduce(function(a,b){return a+b;},0)/v.length; allElos=allElos.concat(v);}
    allElos.sort(function(a,b){return a-b;});
    _medianaElo = allElos.length? allElos[Math.floor(allElos.length/2)] : 1400;
    // arrays pra percentil
    _mvAll   = P.map(function(p){return p.marketValue||0;});
    _clubAll = P.map(clubForca);
    _ligaAll = P.map(ligaForcaOf);
    _ready=true;
  }
  function clubForca(p){var e=clubElo(p.club); if(e!=null)return e; if(_ligaForca[p.league]!=null)return _ligaForca[p.league]; return _medianaElo;}
  function ligaForcaOf(p){return _ligaForca[p.league]!=null?_ligaForca[p.league]:_medianaElo;}
  function pctRank(val, arr){var b=0,e=0; for(var i=0;i<arr.length;i++){if(arr[i]<val)b++;else if(arr[i]===val)e++;} return arr.length?(b+e*0.5)/arr.length:0.5;}

  // qualidade geral 0..1 (mercado 50 + liga 30 + clube 20)
  function qualBase(p){
    build();
    var m=pctRank(p.marketValue||0,_mvAll), c=pctRank(clubForca(p),_clubAll), l=pctRank(ligaForcaOf(p),_ligaAll);
    return 0.50*m+0.30*l+0.20*c;
  }

  // OVERALL 40..99
  function overall(p){ build(); return Math.round(40 + qualBase(p)*59); }

  // atributos de QUALIDADE por posição (pra quem não jogou): 35..99
  function qualAttrs(p){
    build();
    var q=qualBase(p), base=40+q*55;
    var B={
      ATT:{ataque:12,criacao:4,defesa:-18,fisico:0,tecnica:8},
      MID:{ataque:0,criacao:12,defesa:0,fisico:0,tecnica:8},
      DEF:{ataque:-16,criacao:-4,defesa:14,fisico:8,tecnica:-4},
      GK:{ataque:-30,criacao:-10,defesa:16,fisico:4,tecnica:0}
    }[p.pos]||{ataque:0,criacao:0,defesa:0,fisico:0,tecnica:0};
    var cl=function(x){return Math.max(35,Math.min(99,Math.round(x)));};
    return {ataque:cl(base+B.ataque),criacao:cl(base+B.criacao),defesa:cl(base+B.defesa),fisico:cl(base+B.fisico),tecnica:cl(base+B.tecnica)};
  }

  // acha o registro do master por nome (e pos opcional)
  function findMaster(name, pos){
    var P=window.draftMasterPlayers; if(!P)return null;
    var tn=norm(name);
    var hit=P.find(function(p){return norm(p.name)===tn && (!pos||p.pos===pos);});
    if(hit)return hit;
    return P.find(function(p){return norm(p.name)===tn;})||null;
  }

  window.playerQuality = {
    norm:norm, clubElo:clubElo, overall:overall, qualAttrs:qualAttrs,
    qualBase:qualBase, findMaster:findMaster, ligaForca:function(){build();return _ligaForca;}
  };
})();
