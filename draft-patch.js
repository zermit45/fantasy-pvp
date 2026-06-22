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

  // ============================================================
  // ABA MERCADO TURBINADA — filtros (posição, faixa de preço, seleção,
  // busca) + paginação (páginas de 50). Sobrescreve só a aba "mercado"
  // do draftHTML, sem tocar no resto.
  // ============================================================
  // app usa `let APP` (não vira window.APP). Acessamos APP direto.
  if(typeof APP==="undefined") return; // app ainda não inicializou; sai sem quebrar
  // estado dos filtros do mercado (persistente entre renders)
  APP.dMkt = APP.dMkt || { pos:"", team:"", pmin:"", pmax:"", page:1, perPage:50 };

  // setters expostos pro HTML.
  // IMPORTANTE: inputs de texto NÃO podem chamar render direto, senão o campo
  // é recriado e o teclado fecha. Guardamos qual input estava focado e
  // devolvemos o foco depois do render (mesmo truque do setDraftSearch do app).
  function reFocus(id){
    requestAnimationFrame(function(){
      var inp=document.getElementById(id);
      if(inp){inp.focus();try{var n=inp.value.length;inp.setSelectionRange(n,n);}catch(e){}}
    });
  }
  function reRender(){ (typeof render==="function"?render:renderKeepScroll)(); }
  window.dMktPos=function(v){APP.dMkt.pos=(APP.dMkt.pos===v?"":v);APP.dMkt.page=1;renderKeepScroll();};
  window.dMktTeam=function(v){APP.dMkt.team=v;APP.dMkt.page=1;renderKeepScroll();};
  window.dMktMin=function(v){APP.dMkt.pmin=v;APP.dMkt.page=1;reRender();reFocus("dMktMinInput");};
  window.dMktMax=function(v){APP.dMkt.pmax=v;APP.dMkt.page=1;reRender();reFocus("dMktMaxInput");};
  window.dMktPage=function(n){APP.dMkt.page=n;renderKeepScroll();
    var el=document.getElementById("dMktTop"); if(el&&el.scrollIntoView)el.scrollIntoView({block:"start"});};
  window.dMktSearch=function(v){APP.draftSearch=v;APP.dMkt.page=1;reRender();reFocus("draftSearchInput");};
  window.dMktClear=function(){APP.dMkt={pos:"",team:"",pmin:"",pmax:"",page:1,perPage:50};
    APP.draftSearch="";reRender();};

  function normT(s){return (typeof normTxt==="function")?normTxt(s):String(s||"").toLowerCase();}

  // monta o HTML da aba mercado nova
  function marketTabHTML(s,me,owner,myRoster){
    var f=APP.dMkt;
    var q=normT(APP.draftSearch||"");
    var all=draftPlayerCatalog();
    // lista de seleções para o dropdown (ordenada)
    var teamSet={}; all.forEach(function(p){teamSet[p.team]=1;});
    var teamOpts=Object.keys(teamSet).sort();
    // aplicar filtros
    var pmin=f.pmin===""?null:Number(f.pmin), pmax=f.pmax===""?null:Number(f.pmax);
    var filtered=all.filter(function(p){
      if(f.pos && p.pos!==f.pos) return false;
      if(f.team && p.team!==f.team) return false;
      if(pmin!=null && p.price<pmin) return false;
      if(pmax!=null && p.price>pmax) return false;
      if(q && !normT(p.name+" "+p.team+" "+p.pos).includes(q)) return false;
      return true;
    });
    var total=filtered.length;
    var perPage=f.perPage||50;
    var pages=Math.max(1,Math.ceil(total/perPage));
    if(f.page>pages)f.page=pages;
    var start=(f.page-1)*perPage;
    var pageItems=filtered.slice(start,start+perPage);

    // chips de posição
    var posList=[["","Todas"],["GK","GOL"],["DEF","DEF"],["MID","MEI"],["ATT","ATA"]];
    var posChips=posList.map(function(pp){
      var on=(f.pos===pp[0]);
      return '<div class="ptab'+(on?' on':'')+'" style="min-width:46px" onclick="dMktPos(\''+pp[0]+'\')">'+pp[1]+'</div>';
    }).join("");

    // dropdown de seleção
    var teamSel='<select class="input" style="margin:0" onchange="dMktTeam(this.value)">'+
      '<option value="">Todas seleções</option>'+
      teamOpts.map(function(t){return '<option value="'+t+'"'+(f.team===t?' selected':'')+'>'+esc(t)+'</option>';}).join("")+
      '</select>';

    // faixa de preço
    var priceRange='<div style="display:flex;gap:8px;align-items:center">'+
      '<input id="dMktMinInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="mín" value="'+(f.pmin)+'" oninput="dMktMin(this.value)" />'+
      '<span style="color:var(--dim)">até</span>'+
      '<input id="dMktMaxInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="máx" value="'+(f.pmax)+'" oninput="dMktMax(this.value)" />'+
      '</div>';

    // busca
    var search='<div style="position:relative">'+
      '<input id="draftSearchInput" class="input" style="margin:0" placeholder="🔍 Buscar jogador…" value="'+esc(APP.draftSearch||"")+'" oninput="dMktSearch(this.value)" autocorrect="off" autocomplete="off" />'+
      '</div>';

    // linhas de jogador
    var rows=pageItems.map(function(p){
      var own=owner[p.key];
      var moneyOk=!draftSetting(s,"budget_enabled",true)||Number(me?me.budget_left:0)>=p.price;
      var rosterOk=!draftSetting(s,"roster_limit_enabled",true)||myRoster.length<Number(s.roster_limit||12);
      var can=me&&!own&&moneyOk&&rosterOk&&draftSetting(s,"free_market",true)&&s.market_status==="open";
      var devBtn = (own && typeof isAdmin==="function" && isAdmin())
        ? '<span class="daychip" style="border-color:var(--red);color:var(--red);font-size:9px;padding:2px 7px;margin-left:6px" onclick="event.stopPropagation();devReturnPlayer(\''+esc(p.key)+'\')">↩︎ devolver</span>'
        : "";
      return '<div class="prow '+(own?"dis":"")+'" style="'+(can?"cursor:pointer":"")+'" onclick="'+(can?"buyDraftPlayer('"+esc(p.key)+"')":"")+'">'+
        '<div class="posbar pb-'+p.pos+'"></div>'+
        '<div class="pos mono pc-'+p.pos+'">'+(SLOT_LABEL[p.pos]||p.pos)+'</div>'+
        '<div class="nm">'+esc(p.name)+'<span class="teamtag" style="--tc:'+teamColor(p.team)+';margin-left:6px">'+esc(p.team)+'</span>'+(own?' <span style="font-size:9px;color:var(--amber)">dono: '+esc(own)+'</span>'+devBtn:"")+'</div>'+
        '<div class="pr mono">'+p.price+'</div>'+
      '</div>';
    }).join("");
    if(!pageItems.length)rows='<p class="p" style="padding:14px;text-align:center">Nenhum jogador com esses filtros.</p>';

    // paginação (janela de páginas em volta da atual)
    function pageBtn(n,label,disabled){
      return '<div class="daychip'+(n===f.page?" on":"")+'" style="'+(disabled?"opacity:.35;pointer-events:none":"")+'" onclick="dMktPage('+n+')">'+(label||n)+'</div>';
    }
    var pager="";
    if(pages>1){
      var win=2, from=Math.max(1,f.page-win), to=Math.min(pages,f.page+win);
      var parts=[];
      parts.push(pageBtn(Math.max(1,f.page-1),"‹",f.page<=1));
      if(from>1){parts.push(pageBtn(1));if(from>2)parts.push('<span style="color:var(--dim);align-self:center">…</span>');}
      for(var i=from;i<=to;i++)parts.push(pageBtn(i));
      if(to<pages){if(to<pages-1)parts.push('<span style="color:var(--dim);align-self:center">…</span>');parts.push(pageBtn(pages));}
      parts.push(pageBtn(Math.min(pages,f.page+1),"›",f.page>=pages));
      pager='<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px">'+parts.join("")+'</div>';
    }

    var activeFilters=(f.pos||f.team||f.pmin!==""||f.pmax!==""||q);
    return '<div id="dMktTop"></div>'+
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">'+
        search+
        '<div class="postabs" style="margin:0">'+posChips+'</div>'+
        teamSel+
        priceRange+
        (activeFilters?'<div class="daychip" style="align-self:flex-start;border-color:var(--red);color:var(--red)" onclick="dMktClear()">✕ limpar filtros</div>':"")+
      '</div>'+
      '<p class="p" style="font-size:11px;margin-bottom:8px"><b style="color:var(--chalk)">'+total+'</b> jogadores · página '+f.page+'/'+pages+'</p>'+
      '<div class="poolbox">'+rows+'</div>'+
      pager;
  }

  // intercepta draftHTML: se a aba ativa for "mercado", injeta a versão nova
  if(typeof draftHTML==="function"){
    var _origDraftHTML=draftHTML;
    window.draftHTML=function(){
      var html=_origDraftHTML.apply(this,arguments);
      if((APP.draftTab||"visao")!=="mercado")return html;
      var s=APP.draftSeason; if(!s||APP.draftSchemaMissing)return html;
      try{
        var me=myDraftTeam();
        var myRoster=(APP.draftRosters||[]).filter(function(r){return APP.user&&r.username===APP.user.username;});
        var owner=draftOwnerMap();
        var newBody=marketTabHTML(s,me,owner,myRoster);
        // substitui o corpo: troca tudo entre a tabbar e o fechamento do card.
        // estratégia robusta: re-render do card inteiro com o body novo.
        return draftCardWrap(s,newBody);
      }catch(e){return html;}
    };
  }

  // recria o "wrapper" do card do draft com um body custom (mesma moldura do app)
  function draftCardWrap(s,body){
    var tabs=[["visao","Visão"],["mercado","Mercado"],["elencos","Elencos"],["movs","Transações"]];
    var tab=APP.draftTab||"visao";
    var tabbar='<div class="postabs" style="margin:12px 0">'+tabs.map(function(t){
      return '<div class="ptab'+(tab===t[0]?" on":"")+'" onclick="setDraftTab(\''+t[0]+'\')">'+t[1]+'</div>';
    }).join("")+'</div>';
    return '<div class="card" style="border-color:#FF8A4C">'+
      '<button class="btn ghost" style="margin-bottom:10px" onclick="go(\'home\')">← Voltar</button>'+
      '<div class="tag">MERCADO DRAFT · TEMPORADA</div>'+
      '<div class="h2 disp" style="color:#FF8A4C">🏟️ '+esc(s.name)+'</div>'+
      '<p class="p" style="margin:8px 0">Status: <b style="color:var(--chalk)">'+esc(s.status)+'</b> · Mercado: <b style="color:'+(s.market_status==="open"?"var(--green)":"var(--red)")+'">'+esc(s.market_status)+'</b></p>'+
      betaPanelHTML(s)+
      tabbar+body+
    '</div>';
  }

  // ── PAINEL BETA/DEV — só admin, só enquanto o modo está em teste ──
  // permite reverter ações que normalmente seriam definitivas.
  function betaPanelHTML(s){
    if(typeof isAdmin!=="function"||!isAdmin())return "";
    return '<div class="card" style="border:1px dashed var(--amber);background:color-mix(in srgb,var(--amber) 8%,transparent);margin:10px 0;padding:11px">'+
      '<div class="tag" style="color:var(--amber);margin-bottom:6px">🛠️ DEV · BETA — ações reversíveis</div>'+
      '<p class="p" style="font-size:10.5px;margin-bottom:9px">Só você (admin) vê isto, e só enquanto o modo está em teste. Desfaz compras e zera elencos.</p>'+
      '<div style="display:flex;flex-direction:column;gap:7px">'+
        '<button class="btn sm ghost" style="width:100%" onclick="devResetMyRoster()">↩︎ Devolver TODOS os meus jogadores</button>'+
        '<button class="btn sm ghost" style="width:100%;border-color:var(--red);color:var(--red)" onclick="devResetSeason()">⚠︎ Resetar temporada inteira (todos os managers)</button>'+
      '</div>'+
    '</div>';
  }

  // devolve UM jogador (desfaz a compra): remove do elenco, devolve moedas, loga reversão
  window.devReturnPlayer=async function(playerKey){
    if(typeof isAdmin!=="function"||!isAdmin())return;
    var s=APP.draftSeason; if(!s)return;
    var r=(APP.draftRosters||[]).find(function(x){return x.player_key===playerKey;});
    if(!r){toast&&toast("Jogador não está em nenhum elenco.");return;}
    try{
      await sbDelete("draft_rosters","season_id=eq."+s.id+"&player_key=eq."+encodeURIComponent(playerKey));
      // devolve moedas ao dono
      var team=(APP.draftTeams||[]).find(function(t){return t.username===r.username;});
      if(team&&draftSetting(s,"budget_enabled",true)){
        await sbUpdate("draft_teams",{budget_left:Number(team.budget_left||0)+Number(r.acquired_price||r.current_price||0)},
          "season_id=eq."+s.id+"&username=eq."+encodeURIComponent(r.username));
      }
      await sbInsert("draft_transactions",{season_id:s.id,username:r.username,type:"dev_return",
        player_key:r.player_key,player_name:r.player_name,amount:-(r.acquired_price||0),meta:{by:"dev"}});
      await loadDraftSeason(s.id);
      toast&&toast(r.player_name+" devolvido (DEV).");
      reRender();
    }catch(e){toast&&toast("Erro: "+e.message);}
  };

  // devolve todos os meus jogadores
  window.devResetMyRoster=async function(){
    if(typeof isAdmin!=="function"||!isAdmin())return;
    var s=APP.draftSeason; if(!s||!APP.user)return;
    var mine=(APP.draftRosters||[]).filter(function(r){return r.username===APP.user.username;});
    if(!mine.length){toast&&toast("Você não tem jogadores.");return;}
    if(typeof askConfirm==="function"){/* usa confirm nativo abaixo */}
    if(!confirm("Devolver seus "+mine.length+" jogadores e recuperar as moedas?"))return;
    try{
      for(var i=0;i<mine.length;i++)await window.devReturnPlayer(mine[i].player_key);
    }catch(e){toast&&toast("Erro: "+e.message);}
  };

  // reseta a temporada inteira (todos os elencos + zera moedas pro budget inicial)
  window.devResetSeason=async function(){
    if(typeof isAdmin!=="function"||!isAdmin())return;
    var s=APP.draftSeason; if(!s)return;
    if(!confirm("RESETAR a temporada inteira? Remove TODOS os jogadores de TODOS os managers e devolve o orçamento. Não dá pra desfazer."))return;
    try{
      await sbDelete("draft_rosters","season_id=eq."+s.id);
      // devolve budget cheio a todos os times
      var budget=Number(s.budget||100);
      var teams=APP.draftTeams||[];
      for(var i=0;i<teams.length;i++){
        await sbUpdate("draft_teams",{budget_left:budget},
          "season_id=eq."+s.id+"&username=eq."+encodeURIComponent(teams[i].username));
      }
      await sbInsert("draft_transactions",{season_id:s.id,username:(APP.user&&APP.user.username)||"dev",
        type:"dev_reset_season",amount:0,meta:{by:"dev"}});
      await loadDraftSeason(s.id);
      toast&&toast("Temporada resetada (DEV).");
      reRender();
    }catch(e){toast&&toast("Erro: "+e.message);}
  };
})();
