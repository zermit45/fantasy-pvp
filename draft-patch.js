// ============================================================
// FANTASY PvP — PATCH DO MODO DRAFT (banco master + preço calibrado)
// ------------------------------------------------------------
// Este arquivo é carregado DEPOIS do app.js e sobrescreve, de fora,
// o catálogo de jogadores do Draft. Não precisa editar o app.js.
// Para desativar: basta remover a linha <script src="draft-patch.js">.
//
// O QUE FAZ:
//   1) carrega dinamicamente o banco master (draft-master-players.js)
//      só quando o modo Draft é aberto (não pesa o boot do app);
//   2) substitui draftPlayerCatalog() para usar esse banco
//      (1251 jogadores, draftPrice calibrado 1-50, independente das partidas).
//   3) mantém a MESMA chave de jogador do app, então elencos já salvos
//      no Supabase continuam compatíveis.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  // mesma normalização de nome do app (fallback caso _normName não exista ainda)
  var norm = (typeof _normName==="function")
    ? _normName
    : function(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").trim();};

  function keyOf(p){return (p.team||"?")+":"+norm(p.name)+":"+(p.pos||"MID");}

  // ── carregador dinâmico do banco master ──
  var _promise=null;
  function ensureMaster(){
    if(window.draftMasterPlayers&&window.draftMasterPlayers.length)return Promise.resolve();
    if(_promise)return _promise;
    _promise=new Promise(function(res){
      var s=document.createElement("script");
      s.src="draft-master-players.js?v=20260622";
      s.onload=function(){res();};
      s.onerror=function(){_promise=null;res();}; // falhou → catálogo cai no original
      document.head.appendChild(s);
    });
    return _promise;
  }
  window.ensureDraftMaster=ensureMaster; // exposto, caso queira usar

  // ── novo catálogo: lê o banco master ──
  function catalogFromMaster(){
    var master=window.draftMasterPlayers;
    if(!Array.isArray(master)||!master.length)return null; // sinaliza p/ usar original
    var seen={},out=[];
    for(var i=0;i<master.length;i++){
      var p=master[i],k=keyOf(p);
      if(seen[k])continue;seen[k]=1;
      out.push({
        key:k,name:p.name,team:p.team,pos:p.pos,age:p.age||null,
        mv:Number(p.marketValue)||0,
        price:Math.max(1,Math.round(Number(p.draftPrice)||1)),
        room_id:null,match_name:""
      });
    }
    out.sort(function(a,b){return b.price-a.price||a.name.localeCompare(b.name);});
    return out;
  }

  // guarda o catálogo original como fallback
  var original = (typeof draftPlayerCatalog==="function") ? draftPlayerCatalog : null;
  window.draftPlayerCatalog=function(){
    var fromMaster=catalogFromMaster();
    if(fromMaster)return fromMaster;
    return original?original():[]; // banco ainda não carregou → usa o do app
  };

  // ── faz o banco carregar quando o Draft é aberto ──
  // embrulha loadDraftSeason (entrar numa temporada) para garantir o master antes.
  if(typeof loadDraftSeason==="function"){
    var _origLoad=loadDraftSeason;
    window.loadDraftSeason=async function(){
      await ensureMaster();
      return _origLoad.apply(this,arguments);
    };
  }
})();
