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
        club:p.club||null,league:p.league||null,country:p.country||null,
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
  APP.dMkt = APP.dMkt || { pos:[], team:[], league:[], club:[], pmin:"", pmax:"", amin:"", amax:"", page:1, perPage:50, panel:false };
  // migração: se vier de versão antiga com strings, converte pra array
  ["pos","team","league","club"].forEach(function(k){ if(typeof APP.dMkt[k]==="string") APP.dMkt[k]=APP.dMkt[k]?[APP.dMkt[k]]:[]; });
  if(APP.dMkt.league===undefined)APP.dMkt.league=[];
  if(APP.dMkt.club===undefined)APP.dMkt.club=[];
  if(APP.dMkt.amin===undefined)APP.dMkt.amin="";
  if(APP.dMkt.amax===undefined)APP.dMkt.amax="";

  // setters expostos pro HTML.
  // Inputs de texto: render() recria o campo (some o teclado) E reseta o scroll
  // pro topo. Resolvemos os dois: salvamos a posição do scroll do contêiner que
  // rola, redesenhamos com render(), e depois restauramos scroll + foco + cursor.
  function findScroller(){
    // o app rola no elemento da "shell"/root ou no próprio window; tentamos achar
    var cand=document.getElementById("root")||document.querySelector(".shell")||document.scrollingElement||document.documentElement;
    return cand;
  }
  function renderKeepFocus(id){
    var sc=findScroller();
    var top=sc?sc.scrollTop:0;
    var winY=window.scrollY||window.pageYOffset||0;
    (typeof render==="function"?render:renderKeepScroll)();
    requestAnimationFrame(function(){
      // restaura scroll (tanto do contêiner quanto da janela, o que estiver valendo)
      try{ if(sc)sc.scrollTop=top; }catch(e){}
      try{ window.scrollTo(0,winY); }catch(e){}
      var inp=document.getElementById(id);
      if(inp){inp.focus();try{var n=inp.value.length;inp.setSelectionRange(n,n);}catch(e){}}
    });
  }
  function reFocus(id){renderKeepFocus(id);} // alias retrocompat
  function reRender(){ (typeof render==="function"?render:renderKeepScroll)(); }
  function toggleArr(arr,v){var i=arr.indexOf(v);if(i<0)arr.push(v);else arr.splice(i,1);return arr;}
  window.dMktPos=function(v){if(v==="")APP.dMkt.pos=[];else toggleArr(APP.dMkt.pos,v);APP.dMkt.page=1;if(!liveUpdateFull())renderKeepScroll();};
  window.dMktTeamAdd=function(v){if(v&&APP.dMkt.team.indexOf(v)<0)APP.dMkt.team.push(v);APP.dMkt.page=1;reRender();};
  window.dMktTeamDel=function(v){toggleArr(APP.dMkt.team,v);APP.dMkt.page=1;if(!liveUpdateFull())reRender();};
  window.dMktLeagueAdd=function(v){if(v&&APP.dMkt.league.indexOf(v)<0)APP.dMkt.league.push(v);APP.dMkt.page=1;reRender();};
  window.dMktLeagueDel=function(v){toggleArr(APP.dMkt.league,v);APP.dMkt.page=1;if(!liveUpdateFull())reRender();};
  window.dMktClubAdd=function(v){if(v&&APP.dMkt.club.indexOf(v)<0)APP.dMkt.club.push(v);APP.dMkt.page=1;reRender();};
  window.dMktClubDel=function(v){toggleArr(APP.dMkt.club,v);APP.dMkt.page=1;if(!liveUpdateFull())reRender();};
  function liveUpdate(){
    try{
      var s=APP.draftSeason; if(!s)return false;
      var me=myDraftTeam();
      var myRoster=(APP.draftRosters||[]).filter(function(r){return APP.user&&r.username===APP.user.username;});
      var owner=draftOwnerMap();
      var r=computeResults(s,me,owner,myRoster);
      var list=document.getElementById("dMktList");
      var cnt=document.getElementById("dMktCount");
      var pg=document.getElementById("dMktPager");
      if(!list||!cnt||!pg)return false;
      list.innerHTML=r.listHTML; cnt.innerHTML=r.countHTML; pg.innerHTML=r.pagerHTML;
      return true;
    }catch(e){return false;}
  }
  // liveUpdateFull = só atualiza lista/contador/pager (usado por toggles sem input de texto)
  function liveUpdateFull(){ return liveUpdate(); }
  window.dMktMin=function(v){APP.dMkt.pmin=v;APP.dMkt.page=1;if(!liveUpdate())renderKeepFocus("dMktMinInput");};
  window.dMktMax=function(v){APP.dMkt.pmax=v;APP.dMkt.page=1;if(!liveUpdate())renderKeepFocus("dMktMaxInput");};
  window.dMktAgeMin=function(v){APP.dMkt.amin=v;APP.dMkt.page=1;if(!liveUpdate())renderKeepFocus("dMktAgeMinInput");};
  window.dMktAgeMax=function(v){APP.dMkt.amax=v;APP.dMkt.page=1;if(!liveUpdate())renderKeepFocus("dMktAgeMaxInput");};
  window.dMktPage=function(n){APP.dMkt.page=n;renderKeepScroll();
    var el=document.getElementById("dMktTop"); if(el&&el.scrollIntoView)el.scrollIntoView({block:"start"});};
  window.dMktSearch=function(v){APP.draftSearch=v;APP.dMkt.page=1;renderKeepFocus("draftSearchInput");};
  // BUSCA AO VIVO: atualiza só a lista/contador/paginação, SEM redesenhar a tela.
  window.dMktSearchLive=function(v){
    APP.draftSearch=v; APP.dMkt.page=1;
    if(!liveUpdate())renderKeepFocus("draftSearchInput");
  };
  window.dMktTogglePanel=function(){APP.dMkt.panel=!APP.dMkt.panel;reRender();};
  window.dMktClear=function(){APP.dMkt={pos:[],team:[],league:[],club:[],pmin:"",pmax:"",amin:"",amax:"",page:1,perPage:50,panel:APP.dMkt.panel};
    APP.draftSearch="";reRender();};

  function normT(s){return (typeof normTxt==="function")?normTxt(s):String(s||"").toLowerCase();}

  // computa a lista filtrada/paginada e devolve {countHTML, listHTML, pagerHTML}
  function computeResults(s,me,owner,myRoster){
    var f=APP.dMkt;
    var q=normT(APP.draftSearch||"");
    var all=draftPlayerCatalog();
    var pmin=f.pmin===""?null:Number(f.pmin), pmax=f.pmax===""?null:Number(f.pmax);
    var amin=f.amin===""?null:Number(f.amin), amax=f.amax===""?null:Number(f.amax);
    var fp=f.pos||[], ft=f.team||[], fl=f.league||[], fc=f.club||[];
    var filtered=all.filter(function(p){
      if(fp.length && fp.indexOf(p.pos)<0) return false;
      if(ft.length && ft.indexOf(p.team)<0) return false;
      if(fl.length && fl.indexOf(p.league)<0) return false;
      if(fc.length && fc.indexOf(p.club)<0) return false;
      if(pmin!=null && p.price<pmin) return false;
      if(pmax!=null && p.price>pmax) return false;
      if(amin!=null && (p.age==null||p.age<amin)) return false;
      if(amax!=null && (p.age==null||p.age>amax)) return false;
      if(q && !normT(p.name+" "+p.team+" "+p.pos+" "+(p.club||"")+" "+(p.league||"")).includes(q)) return false;
      return true;
    });
    var total=filtered.length;
    var searching=!!q;
    var perPage=f.perPage||50;
    var pages=searching?1:Math.max(1,Math.ceil(total/perPage));
    if(f.page>pages)f.page=pages;
    var start=searching?0:(f.page-1)*perPage;
    var pageItems=searching?filtered:filtered.slice(start,start+perPage);

    var rows=pageItems.map(function(p){
      var own=owner[p.key];
      var moneyOk=!draftSetting(s,"budget_enabled",true)||Number(me?me.budget_left:0)>=p.price;
      var rosterOk=!draftSetting(s,"roster_limit_enabled",true)||myRoster.length<Number(s.roster_limit||12);
      var can=me&&!own&&moneyOk&&rosterOk&&draftSetting(s,"free_market",true)&&s.market_status==="open";
      // a linha é SEMPRE clicável (a menos que já tenha dono): se não puder comprar,
      // buyDraftPlayer mostra o motivo no toast em vez de ficar "travado" sem reação.
      var clickable = !own;
      var devBtn=(own && typeof isAdmin==="function" && isAdmin())
        ? '<div style="margin-top:3px"><span class="daychip" style="border-color:var(--red);color:var(--red);font-size:9px;padding:2px 8px" onclick="event.stopPropagation();devReturnPlayer(\''+esc(p.key)+'\')">↩︎ devolver</span></div>'
        : "";
      return '<div class="prow '+(own?"dis":"")+'" style="'+(clickable?"cursor:pointer":"")+'" onclick="'+(clickable?"buyDraftPlayer('"+esc(p.key)+"')":"")+'">'+
        '<div class="posbar pb-'+p.pos+'"></div>'+
        '<div class="pos mono pc-'+p.pos+'">'+(SLOT_LABEL[p.pos]||p.pos)+'</div>'+
        '<div class="nm">'+esc(p.name)+'<span class="teamtag" style="--tc:'+teamColor(p.team)+';margin-left:6px">'+esc(p.team)+'</span>'+(own?' <span style="font-size:9px;color:var(--amber)">dono: '+esc(own)+'</span>'+devBtn:"")+'</div>'+
        '<div class="pr mono">'+p.price+'</div>'+
      '</div>';
    }).join("");
    if(!pageItems.length)rows='<p class="p" style="padding:14px;text-align:center">Nenhum jogador com esses filtros.</p>';

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
      pager=parts.join("");
    }
    var countHTML='<b style="color:var(--chalk)">'+total+'</b> '+(total===1?"jogador":"jogadores")+(searching?(total===1?" encontrado":" encontrados"):" · página "+f.page+"/"+pages);
    return {countHTML:countHTML, listHTML:rows, pagerHTML:pager};
  }

  // monta o HTML da aba mercado nova
  function marketTabHTML(s,me,owner,myRoster){
    var f=APP.dMkt;
    var q=normT(APP.draftSearch||"");
    var all=draftPlayerCatalog();
    // opções (ordenadas) para os dropdowns
    var teamSet={},leagueSet={},clubSet={};
    all.forEach(function(p){teamSet[p.team]=1;if(p.league)leagueSet[p.league]=1;if(p.club)clubSet[p.club]=1;});
    var teamOpts=Object.keys(teamSet).sort();
    var leagueOpts=Object.keys(leagueSet).sort();
    var clubOpts=Object.keys(clubSet).sort();

    // chips de posição (multi)
    var posList=[["GK","GOL"],["DEF","DEF"],["MID","MEI"],["ATT","ATA"]];
    var posChips='<div class="ptab'+(f.pos.length===0?" on":"")+'" style="min-width:46px" onclick="dMktPos(\'\')">Todas</div>'+
      posList.map(function(pp){
        var on=f.pos.indexOf(pp[0])>=0;
        return '<div class="ptab'+(on?' on':'')+'" style="min-width:46px" onclick="dMktPos(\''+pp[0]+'\')">'+pp[1]+'</div>';
      }).join("");

    // helper: dropdown "adicionar" + pílulas removíveis
    function multiBlock(label,opts,selected,addFn,delFn){
      var pills=selected.map(function(v){
        return '<span class="daychip on" style="font-size:10px;padding:3px 9px" onclick="'+delFn+'(\''+esc(v).replace(/'/g,"\\'")+'\')">'+esc(v)+' ✕</span>';
      }).join("");
      var sel='<select class="input" style="margin:0" onchange="if(this.value){'+addFn+'(this.value);this.value=\'\'}">'+
        '<option value="">'+label+'…</option>'+
        opts.filter(function(o){return selected.indexOf(o)<0;}).map(function(o){return '<option value="'+esc(o)+'">'+esc(o)+'</option>';}).join("")+
        '</select>';
      return sel+(pills?'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">'+pills+'</div>':"");
    }

    var teamBlock=multiBlock("Seleções",teamOpts,f.team,"dMktTeamAdd","dMktTeamDel");
    var leagueBlock=multiBlock("Ligas",leagueOpts,f.league,"dMktLeagueAdd","dMktLeagueDel");
    var clubBlock=multiBlock("Clubes",clubOpts,f.club,"dMktClubAdd","dMktClubDel");

    var priceRange='<div><div class="tag" style="margin-bottom:4px">PREÇO</div><div style="display:flex;gap:8px;align-items:center">'+
      '<input id="dMktMinInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="mín" value="'+(f.pmin)+'" oninput="dMktMin(this.value)" />'+
      '<span style="color:var(--dim)">até</span>'+
      '<input id="dMktMaxInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="máx" value="'+(f.pmax)+'" oninput="dMktMax(this.value)" />'+
      '</div></div>';
    var ageRange='<div><div class="tag" style="margin-bottom:4px">IDADE</div><div style="display:flex;gap:8px;align-items:center">'+
      '<input id="dMktAgeMinInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="mín" value="'+(f.amin)+'" oninput="dMktAgeMin(this.value)" />'+
      '<span style="color:var(--dim)">até</span>'+
      '<input id="dMktAgeMaxInput" class="input" style="margin:0;text-align:center" inputmode="numeric" placeholder="máx" value="'+(f.amax)+'" oninput="dMktAgeMax(this.value)" />'+
      '</div></div>';

    var search='<div style="position:relative">'+
      '<input id="draftSearchInput" class="input" style="margin:0" placeholder="🔍 Buscar (nome, clube, liga…)" value="'+esc(APP.draftSearch||"")+'" oninput="dMktSearchLive(this.value)" autocorrect="off" autocomplete="off" />'+
      '</div>';

    var nActive=(f.pos.length+f.team.length+f.league.length+f.club.length)+(f.pmin!==""?1:0)+(f.pmax!==""?1:0)+(f.amin!==""?1:0)+(f.amax!==""?1:0);
    var panelToggle='<div class="daychip'+(f.panel?" on":"")+'" style="align-self:flex-start" onclick="dMktTogglePanel()">⚙︎ Filtros'+(nActive?" ("+nActive+")":"")+(f.panel?" ▲":" ▼")+'</div>';
    var panel = f.panel ? (
      '<div class="card" style="padding:11px;margin:0;background:var(--panel2)">'+
        '<div style="display:flex;flex-direction:column;gap:10px">'+
          '<div><div class="tag" style="margin-bottom:4px">POSIÇÃO</div><div class="postabs" style="margin:0">'+posChips+'</div></div>'+
          '<div><div class="tag" style="margin-bottom:4px">SELEÇÃO</div>'+teamBlock+'</div>'+
          '<div><div class="tag" style="margin-bottom:4px">LIGA</div>'+leagueBlock+'</div>'+
          '<div><div class="tag" style="margin-bottom:4px">CLUBE</div>'+clubBlock+'</div>'+
          priceRange+ageRange+
          (nActive?'<div class="daychip" style="align-self:flex-start;border-color:var(--red);color:var(--red)" onclick="dMktClear()">✕ limpar todos os filtros</div>':"")+
        '</div>'+
      '</div>'
    ) : "";

    var r=computeResults(s,me,owner,myRoster);
    return '<div id="dMktTop"></div>'+
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">'+
        search+
        panelToggle+
        panel+
      '</div>'+
      '<p class="p" style="font-size:11px;margin-bottom:8px" id="dMktCount">'+r.countHTML+'</p>'+
      '<div class="poolbox" id="dMktList">'+r.listHTML+'</div>'+
      '<div id="dMktPager" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px">'+r.pagerHTML+'</div>';
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
