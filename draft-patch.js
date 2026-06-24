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
//      (1251 jogadores, draftPrice calibrado 3-100, independente das partidas).
//   3) mantém a MESMA chave de jogador do app, então elencos já salvos
//      no Supabase continuam compatíveis.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  // CONSERTO GLOBAL DE FONTE: o toast e os modais injetados no body herdavam a
  // fonte serif do navegador (o CSS .toast do app não define font-family).
  // Forçamos Inter em todos eles, igual ao resto do app.
  try{
    if(typeof document!=="undefined" && document.head && !document.getElementById("draftPatchFont")){
      var st=document.createElement("style");
      st.id="draftPatchFont";
      st.textContent=
        // raiz do problema: body não tinha font-family, então tudo fora de .app
        // (toasts, modais injetados) herdava a serif do navegador. Forçamos Inter.
        "body,.toast,#toast,#dMktInfoHost,#dCapsHost{font-family:Inter,system-ui,sans-serif!important}"+
        "#dMktInfoHost *,#dCapsHost *,.toast *{font-family:Inter,system-ui,sans-serif!important}"+
        // títulos display continuam Saira (proposital)
        "#dMktInfoHost .disp,#dCapsHost .disp{font-family:'Saira Condensed',Inter,sans-serif!important}";
      document.head.appendChild(st);
    }
  }catch(e){}

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
      s.src="draft-master-players.js?v=20260624-v5fatores-2";
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
      var r=await _origLoad.apply(this,arguments);
      // carrega a lista de observação do usuário pra esta temporada
      try{ if(typeof window.__loadDraftWatch==="function") await window.__loadDraftWatch(); }catch(e){}
      return r;
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

  // ── LISTA DE OBSERVAÇÃO (favoritos) ──
  // guardada em APP.draftWatch (array de player_key) + persistida no Supabase.
  APP.draftWatch = APP.draftWatch || [];
  var _watchLoadedFor=null;
  function isWatched(key){ return (APP.draftWatch||[]).indexOf(key)>=0; }
  async function loadWatch(){
    try{
      var s=APP.draftSeason; if(!s||!APP.user)return;
      if(typeof sb!=="function")return;
      var rows=await sb("draft_watchlist?season_id=eq."+s.id+"&username=eq."+encodeURIComponent(APP.user.username)+"&select=player_key");
      APP.draftWatch=(rows||[]).map(function(r){return r.player_key;});
      _watchLoadedFor=s.id;
    }catch(e){ /* tabela pode não existir ainda */ }
  }
  window.dMktToggleWatch=async function(key){
    var s=APP.draftSeason; if(!s||!APP.user){toast&&toast("Entre na temporada antes.");return;}
    var cat=(catFnSafe()||[]).find(function(p){return p.key===key;});
    var was=isWatched(key);
    // otimista: atualiza na hora
    if(was)APP.draftWatch=APP.draftWatch.filter(function(k){return k!==key;});
    else APP.draftWatch=APP.draftWatch.concat([key]);
    // atualiza a tela sem piscar
    if(!liveUpdate() && typeof renderKeepScroll==="function") renderKeepScroll();
    try{
      if(was){
        await sbDelete("draft_watchlist","season_id=eq."+s.id+"&username=eq."+encodeURIComponent(APP.user.username)+"&player_key=eq."+encodeURIComponent(key));
      }else{
        await sbInsert("draft_watchlist",{season_id:s.id,username:APP.user.username,player_key:key,
          player_name:cat?cat.name:null,player_team:cat?cat.team:null,pos:cat?cat.pos:null});
      }
    }catch(e){ toast&&toast("Erro ao salvar favorito: "+e.message); }
  };
  function catFnSafe(){ try{ return cachedCatalog(); }catch(e){ return []; } }
  window.__loadDraftWatch=loadWatch; // exposto pro wrapper de loadDraftSeason
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
  // exposto pra Camada 1 (sincronização ao vivo) atualizar a lista sem piscar.
  // também atualiza a barra de saldo se a aba mercado estiver montada.
  window.__draftLiveRefresh=function(){
    var okList=liveUpdate();
    // a barra de saldo (moedas/elenco) está fora dos contêineres da lista;
    // se ela existe, um render leve a atualiza. Mas só re-renderiza tudo se a
    // lista NÃO pôde ser atualizada isoladamente (ex: aba não é o mercado).
    return okList;
  };
  var _numTimer=null;
  function liveDeb(){ if(_numTimer)clearTimeout(_numTimer); _numTimer=setTimeout(function(){liveUpdate();},120); }
  window.dMktMin=function(v){APP.dMkt.pmin=v;APP.dMkt.page=1;liveDeb();};
  window.dMktMax=function(v){APP.dMkt.pmax=v;APP.dMkt.page=1;liveDeb();};
  window.dMktAgeMin=function(v){APP.dMkt.amin=v;APP.dMkt.page=1;liveDeb();};
  window.dMktAgeMax=function(v){APP.dMkt.amax=v;APP.dMkt.page=1;liveDeb();};
  window.dMktPage=function(n){APP.dMkt.page=n;renderKeepScroll();
    var el=document.getElementById("dMktTop"); if(el&&el.scrollIntoView)el.scrollIntoView({block:"start"});};
  window.dMktSearch=function(v){APP.draftSearch=v;APP.dMkt.page=1;renderKeepFocus("draftSearchInput");};
  // BUSCA AO VIVO: atualiza só a lista/contador/paginação, SEM redesenhar a tela.
  // NUNCA cai no render completo (que recria o input e sobe o scroll). Se os
  // contêineres não existirem, simplesmente ignora aquela tecla (raríssimo).
  var _searchTimer=null;
  window.dMktSearchLive=function(v){
    APP.draftSearch=v; APP.dMkt.page=1;
    // debounce: só recalcula 120ms após parar de digitar (evita travar a cada tecla)
    if(_searchTimer)clearTimeout(_searchTimer);
    _searchTimer=setTimeout(function(){ liveUpdate(); },120);
  };
  window.dMktTogglePanel=function(){APP.dMkt.panel=!APP.dMkt.panel;reRender();};
  // DETALHE DO JOGADOR: mostra clube, liga, nacionalidade, idade.
  // No Draft, "team" é a seleção — então clube/liga são a info principal de
  // "onde ele joga", e a seleção/nacionalidade aparece como contexto.
  window.dMktInfo=function(key){
    var cat=cachedCatalog().find(function(p){return p.key===key;});
    if(!cat){if(typeof toast==="function")toast("Jogador não encontrado.");return;}
    var line=function(label,val){return '<div class="line"><span>'+label+'</span><span class="v">'+esc(val||"—")+'</span></div>';};
    var posName={GK:"Goleiro",DEF:"Defensor",MID:"Meio-campo",ATT:"Atacante"}[cat.pos]||cat.pos;
    var box=
      '<div class="modal" onclick="dMktCloseInfo(event)" style="font-family:Inter,system-ui,sans-serif">'+
        '<div class="box" onclick="event.stopPropagation()" style="font-family:Inter,system-ui,sans-serif">'+
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
            '<span class="pchip pc-'+cat.pos+' bg-'+cat.pos+'">'+(SLOT_LABEL[cat.pos]||cat.pos)+'</span>'+
            '<div class="h2 disp" style="margin:0;color:var(--chalk)">'+esc(cat.name)+'</div>'+
          '</div>'+
          '<div style="margin:10px 0">'+
            line("🏟️ Clube", cat.club)+
            line("🏆 Liga", cat.league)+
            line("🌍 Seleção", cat.team)+
            (cat.country&&cat.country!==cat.team?line("Nacionalidade (clube)", cat.country):"")+
            line("Posição", posName)+
            line("Idade", cat.age?cat.age+" anos":"—")+
            line("💰 Valor de mercado", cat.mv?("€"+(cat.mv/1e6).toFixed(0)+"M"):"—")+
            '<div class="line total"><span>Preço no Draft</span><span class="v" style="color:var(--amber)">'+cat.price+'</span></div>'+
          '</div>'+
          '<button class="btn" onclick="dMktCloseInfo();buyDraftPlayer(\''+esc(key)+'\')">Adicionar ao meu time</button>'+
          '<button class="btn ghost" style="margin-top:8px" onclick="dMktCloseInfo()">Fechar</button>'+
        '</div>'+
      '</div>';
    var host=document.getElementById("dMktInfoHost");
    if(!host){host=document.createElement("div");host.id="dMktInfoHost";document.body.appendChild(host);}
    host.style.fontFamily="Inter,system-ui,sans-serif";
    host.innerHTML=box;
  };
  window.dMktCloseInfo=function(ev){
    if(ev&&ev.target&&ev.target.className!=="modal")return; // só fecha no fundo
    var host=document.getElementById("dMktInfoHost");if(host)host.innerHTML="";
  };
  // REDE DE SEGURANÇA: mesmo que a aba nova falhe e a busca ANTIGA do app seja
  // usada, sobrescrevemos setDraftSearch pra não redesenhar a tela inteira a cada
  // tecla (que era o que fechava o teclado e subia o scroll).
  if(typeof setDraftSearch==="function"){
    var _stTimer=null;
    window.setDraftSearch=function(v){
      APP.draftSearch=v; APP.dMkt&&(APP.dMkt.page=1);
      if(_stTimer)clearTimeout(_stTimer);
      _stTimer=setTimeout(function(){ if(!liveUpdate())renderKeepFocus("draftSearchInput"); },120);
    };
  }
  window.dMktClear=function(){APP.dMkt={pos:[],team:[],league:[],club:[],pmin:"",pmax:"",amin:"",amax:"",page:1,perPage:50,panel:APP.dMkt.panel};
    APP.draftSearch="";reRender();};

  function normT(s){return (typeof normTxt==="function")?normTxt(s):String(s||"").toLowerCase();}

  // cache do catálogo: processar 1251 jogadores a cada tecla trava. Guardamos
  // a lista pronta e só refazemos se o tamanho do banco mudar.
  var _catCache=null, _catLen=-1;
  function cachedCatalog(){
    var m=window.draftMasterPlayers;
    var len=Array.isArray(m)?m.length:0;
    if(_catCache&&_catLen===len)return _catCache;
    var fn=window.draftPlayerCatalog||(typeof draftPlayerCatalog==="function"?draftPlayerCatalog:null);
    _catCache=fn?fn():[]; _catLen=len;
    return _catCache;
  }

  // computa a lista filtrada/paginada e devolve {countHTML, listHTML, pagerHTML}
  function computeResults(s,me,owner,myRoster){
    var f=APP.dMkt;
    var q=normT(APP.draftSearch||"");
    var all=cachedCatalog();
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
      var infoBtn='<span class="daychip" style="font-size:11px;padding:2px 8px;margin-left:6px;border-color:var(--blue);color:var(--blue)" onclick="event.stopPropagation();dMktInfo(\''+esc(p.key)+'\')">ⓘ</span>';
      var starOn=isWatched(p.key);
      var starBtn='<span class="daychip" style="font-size:11px;padding:2px 8px;margin-left:4px;border-color:'+(starOn?"var(--amber)":"var(--line)")+';color:'+(starOn?"var(--amber)":"var(--dim)")+'" onclick="event.stopPropagation();dMktToggleWatch(\''+esc(p.key)+'\')">'+(starOn?"★":"☆")+'</span>';
      return '<div class="prow '+(own?"dis":"")+'" style="'+(clickable?"cursor:pointer":"")+'" onclick="'+(clickable?"buyDraftPlayer('"+esc(p.key)+"')":"")+'">'+
        '<div class="posbar pb-'+p.pos+'"></div>'+
        '<div class="pos mono pc-'+p.pos+'">'+(SLOT_LABEL[p.pos]||p.pos)+'</div>'+
        '<div class="nm">'+esc(p.name)+'<span class="teamtag" style="--tc:'+teamColor(p.team)+';margin-left:6px">'+esc(p.team)+'</span>'+infoBtn+starBtn+(own?' <span style="font-size:9px;color:var(--amber)">dono: '+esc(own)+'</span>'+devBtn:"")+'</div>'+
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

  // HTML da aba "⭐ Observação": lista os jogadores favoritados, com pickar/remover
  function watchTabHTML(s,me,owner,myRoster){
    var all=cachedCatalog()||[];
    var byKey={}; all.forEach(function(p){byKey[p.key]=p;});
    var favs=(APP.draftWatch||[]).map(function(k){return byKey[k];}).filter(Boolean);
    // ordena por preço desc
    favs.sort(function(a,b){return b.price-a.price||a.name.localeCompare(b.name);});

    if(!favs.length){
      return '<div id="dMktTop"></div>'+
        '<p class="p" style="padding:18px;text-align:center">Sua lista de observação está vazia.<br><br>'+
        'Vá no <b style="color:var(--chalk)">Mercado</b> e toque na <span style="color:var(--amber)">☆ estrela</span> ao lado de um jogador pra adicioná-lo aqui.</p>';
    }

    var rows=favs.map(function(p){
      var own=owner[p.key];
      var moneyOk=!draftSetting(s,"budget_enabled",true)||Number(me?me.budget_left:0)>=p.price;
      var rosterOk=!draftSetting(s,"roster_limit_enabled",true)||myRoster.length<Number(s.roster_limit||12);
      var can=me&&!own&&moneyOk&&rosterOk&&draftSetting(s,"free_market",true)&&s.market_status==="open";
      var pickBtn = own
        ? '<span style="font-size:9px;color:var(--amber)">dono: '+esc(own)+'</span>'
        : '<span class="daychip" style="font-size:11px;padding:3px 10px;border-color:var(--green);color:var(--green)" onclick="event.stopPropagation();buyDraftPlayer(\''+esc(p.key)+'\')">+ pickar</span>';
      var rmBtn='<span class="daychip" style="font-size:11px;padding:3px 9px;margin-left:5px;border-color:var(--red);color:var(--red)" onclick="event.stopPropagation();dMktToggleWatch(\''+esc(p.key)+'\')">✕</span>';
      return '<div class="prow '+(own?"dis":"")+'">'+
        '<div class="posbar pb-'+p.pos+'"></div>'+
        '<div class="pos mono pc-'+p.pos+'">'+(SLOT_LABEL[p.pos]||p.pos)+'</div>'+
        '<div class="nm">'+esc(p.name)+'<span class="teamtag" style="--tc:'+teamColor(p.team)+';margin-left:6px">'+esc(p.team)+'</span>'+
          '<div style="margin-top:4px">'+pickBtn+rmBtn+'</div>'+
        '</div>'+
        '<div class="pr mono">'+p.price+'</div>'+
      '</div>';
    }).join("");

    return '<div id="dMktTop"></div>'+
      '<p class="p" style="font-size:11px;margin-bottom:8px"><b style="color:var(--chalk)">'+favs.length+'</b> '+(favs.length===1?"jogador favoritado":"jogadores favoritados")+' · toque em <span style="color:var(--green)">+ pickar</span> pra comprar</p>'+
      '<div class="poolbox">'+rows+'</div>';
  }

  // monta o HTML da aba mercado nova
  function marketTabHTML(s,me,owner,myRoster){
    var f=APP.dMkt;
    var q=normT(APP.draftSearch||"");
    var all=cachedCatalog();
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
    // barra de saldo: moedas restantes + tamanho do elenco (só se entrou como manager)
    var saldoBar="";
    if(me){
      var moedas=Number(me.budget_left||0);
      var nRoster=myRoster.length;
      var limite=Number(s.roster_limit||12);
      var budgetOn=draftSetting(s,"budget_enabled",true);
      saldoBar='<div style="display:flex;gap:8px;margin-bottom:10px">'+
        (budgetOn?'<div style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;text-align:center">'+
          '<div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em">Suas moedas</div>'+
          '<div class="mono" style="font-size:20px;font-weight:800;color:var(--amber)">'+moedas+'</div>'+
        '</div>':"")+
        '<div style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:9px 12px;text-align:center">'+
          '<div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em">Elenco</div>'+
          '<div class="mono" style="font-size:20px;font-weight:800;color:var(--chalk)">'+nRoster+'<span style="font-size:13px;color:var(--dim)">/'+limite+'</span></div>'+
        '</div>'+
      '</div>';
    }
    return '<div id="dMktTop"></div>'+
      saldoBar+
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">'+
        search+
        panelToggle+
        panel+
      '</div>'+
      '<p class="p" style="font-size:11px;margin-bottom:8px" id="dMktCount">'+r.countHTML+'</p>'+
      '<div class="poolbox" id="dMktList">'+r.listHTML+'</div>'+
      '<div id="dMktPager" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px">'+r.pagerHTML+'</div>';
  }

  // intercepta draftHTML: aba "mercado" (versão nova) e aba "observacao" (favoritos)
  if(typeof draftHTML==="function"){
    var _origDraftHTML=draftHTML;
    window.draftHTML=function(){
      var html=_origDraftHTML.apply(this,arguments);
      var tab=APP.draftTab||"visao";
      if(tab!=="mercado"&&tab!=="observacao")return html;
      var s=APP.draftSeason; if(!s||APP.draftSchemaMissing)return html;
      try{
        var me=myDraftTeam();
        var myRoster=(APP.draftRosters||[]).filter(function(r){return APP.user&&r.username===APP.user.username;});
        var owner=draftOwnerMap();
        var newBody = tab==="observacao" ? watchTabHTML(s,me,owner,myRoster) : marketTabHTML(s,me,owner,myRoster);
        return draftCardWrap(s,newBody);
      }catch(e){return html;}
    };
  }

  // recria o "wrapper" do card do draft com um body custom (mesma moldura do app)
  function draftCardWrap(s,body){
    var tabs=[["visao","Visão"],["mercado","Mercado"],["observacao","⭐ Observação"],["elencos","Elencos"],["movs","Transações"]];
    var tab=APP.draftTab||"visao";
    var tabbar='<div class="postabs" style="margin:12px 0;flex-wrap:wrap">'+tabs.map(function(t){
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
      var budget=Number(s.budget||300);
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

// ============================================================
// PATCH EXTRA: senha "EXCLUIR" também na exclusão de LIGA
// (padroniza com grupos/rodadas que já pedem a palavra).
// ============================================================
(function(){
  if(typeof window==="undefined")return;
  if(typeof askConfirm!=="function"||typeof deleteLeague!=="function")return;
  // guarda referência e sobrescreve o atalho que abria o modal sem senha
  window.askDeleteLeague=function(id){
    askConfirm("EXCLUIR","Excluir esta liga/competição",function(){ deleteLeague(id); },
      "As rodadas dela NÃO são apagadas — apenas voltam a ser avulsas. Times e pontuações continuam intactos.");
  };
})();

// ============================================================
// PATCH: EXCLUIR temporada do MERCADO DRAFT (com senha "EXCLUIR")
// O Draft não tinha botão de excluir. Aqui: injeta uma lixeira em cada
// temporada (só admin) e cria deleteDraftSeason com cascata + senha.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  function reRenderSafe(){ (typeof render==="function"?render:(typeof renderKeepScroll==="function"?renderKeepScroll:function(){}))(); }

  // 1) apaga a temporada e tudo ligado a ela (cascata)
  window.deleteDraftSeason=async function(id){
    if(typeof isAdmin==="function" && !isAdmin())return;
    try{
      if(typeof sbDelete==="function"){
        try{await sbDelete("draft_rosters","season_id=eq."+id);}catch(e){}
        try{await sbDelete("draft_transactions","season_id=eq."+id);}catch(e){}
        try{await sbDelete("draft_teams","season_id=eq."+id);}catch(e){}
        try{await sbDelete("draft_status","season_id=eq."+id);}catch(e){}
        await sbDelete("draft_seasons","id=eq."+id);
      }
      if(APP.draftSeason&&APP.draftSeason.id===id){APP.draftSeason=null;APP.draftSeasonId=null;}
      if(typeof loadDraftSeasons==="function")await loadDraftSeasons();
      if(APP.view==="draft")APP.view="home";
      toast&&toast("Temporada excluída.");
      reRenderSafe();
    }catch(e){toast&&toast("Erro ao excluir: "+e.message);}
  };

  // atalho com senha EXCLUIR
  window.askDeleteDraftSeason=function(id,nome){
    if(typeof askConfirm!=="function"){ if(confirm("Excluir a temporada?"))window.deleteDraftSeason(id); return; }
    askConfirm("EXCLUIR","Excluir a temporada"+(nome?' "'+nome+'"':""),function(){ window.deleteDraftSeason(id); },
      "Isso apaga a temporada e TODOS os elencos, times e transações dela. Não pode ser desfeito.");
  };

  // 2) injeta a lixeira em cada temporada via DOM (a função é chamada direto,
  // não dá pra interceptar o HTML; então adicionamos o botão após cada render).
  function injectTrash(){
    try{
      if(typeof isAdmin==="function" && !isAdmin())return;
      var list=APP.draftSeasons||[];
      if(!list.length)return;
      // as linhas têm onclick com go('draft',...,'ID'); achamos por esse atributo
      var rows=document.querySelectorAll('.roomrow');
      rows.forEach(function(row){
        var oc=row.getAttribute("onclick")||"";
        var m=oc.match(/go\('draft',[^)]*'([^']+)'\)/);
        if(!m)return;
        var id=m[1];
        if(row.querySelector(".draft-del-btn"))return; // já injetado
        var s=null;for(var i=0;i<list.length;i++)if(list[i].id===id){s=list[i];break;}
        var nome=s?(s.name||""):"";
        var btn=document.createElement("span");
        btn.className="daychip draft-del-btn";
        btn.style.cssText="margin-left:8px;border-color:var(--red);color:var(--red);font-size:11px;padding:3px 9px";
        btn.textContent="🗑";
        btn.onclick=function(ev){ev.stopPropagation();window.askDeleteDraftSeason(id,nome);};
        row.appendChild(btn);
      });
    }catch(e){}
  }
  // roda após cada render: faz polling leve enquanto a aba é a home do draft
  var _trashTimer=setInterval(function(){
    // só injeta quando há temporadas listadas na tela
    if(document.querySelector('.roomrow'))injectTrash();
  },600);
})();

// ============================================================
// PATCH: LIMITES DE ELENCO POR CATEGORIA (país/liga/idade/seleção/clube/posição)
// Dev configura limites na temporada; a compra bloqueia ao atingir.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  // estrutura dos limites (guardada em settings.roster_caps da temporada):
  // { country:{enabled:true,max:3}, league:{...}, team:{...}, club:{...},
  //   pos:{...}, ageOver:{enabled,max,age}, ageUnder:{enabled,max,age} }
  function caps(s){ try{ return (s&&s.settings&&s.settings.roster_caps)||{}; }catch(e){ return {}; } }

  // dado um jogador (cat) e meu elenco atual (mine = draft_rosters meus),
  // conta quantos eu JÁ tenho na mesma categoria de cada tipo
  function catFn(){ return (window.draftPlayerCatalog||(typeof draftPlayerCatalog==="function"?draftPlayerCatalog:function(){return[];}))(); }
  function catalogByKey(){
    var m={}; try{ (catFn()||[]).forEach(function(p){m[p.key]=p;}); }catch(e){}
    return m;
  }
  function violacao(s, cat, mine){
    var c=caps(s); if(!c||!Object.keys(c).length)return null;
    var byKey=catalogByKey();
    // resolve os atributos dos jogadores que já tenho
    var meus=mine.map(function(r){ return byKey[r.player_key]||{team:r.player_team,pos:r.pos}; });

    function contaMesma(attr){ return meus.filter(function(p){return p&&p[attr]!=null&&p[attr]===cat[attr];}).length; }

    if(c.country&&c.country.enabled&&cat.country){
      if(contaMesma("country")>=Number(c.country.max||99)) return "país "+cat.country+" (máx "+c.country.max+")";
    }
    if(c.league&&c.league.enabled&&cat.league){
      if(contaMesma("league")>=Number(c.league.max||99)) return "liga "+cat.league+" (máx "+c.league.max+")";
    }
    if(c.team&&c.team.enabled&&cat.team){
      if(contaMesma("team")>=Number(c.team.max||99)) return "seleção "+cat.team+" (máx "+c.team.max+")";
    }
    if(c.club&&c.club.enabled&&cat.club){
      if(contaMesma("club")>=Number(c.club.max||99)) return "clube "+cat.club+" (máx "+c.club.max+")";
    }
    if(c.pos&&c.pos.enabled&&cat.pos){
      if(contaMesma("pos")>=Number(c.pos.max||99)) return "posição "+cat.pos+" (máx "+c.pos.max+")";
    }
    if(c.ageOver&&c.ageOver.enabled&&cat.age!=null){
      var lim=Number(c.ageOver.age||33);
      if(cat.age>=lim){
        var n=meus.filter(function(p){return p&&p.age!=null&&p.age>=lim;}).length;
        if(n>=Number(c.ageOver.max||99)) return "idade "+lim+"+ (máx "+c.ageOver.max+")";
      }
    }
    if(c.ageUnder&&c.ageUnder.enabled&&cat.age!=null){
      var limu=Number(c.ageUnder.age||21);
      if(cat.age<=limu){
        var nu=meus.filter(function(p){return p&&p.age!=null&&p.age<=limu;}).length;
        if(nu>=Number(c.ageUnder.max||99)) return "idade até "+limu+" (máx "+c.ageUnder.max+")";
      }
    }
    return null;
  }

  // intercepta buyDraftPlayer pra validar os limites ANTES de comprar.
  // (é chamado pelos cliques, que resolvem window.buyDraftPlayer na hora → interceptação pega)
  if(typeof buyDraftPlayer==="function"){
    var _origBuy=buyDraftPlayer;
    window.buyDraftPlayer=function(playerKey){
      try{
        var s=APP.draftSeason;
        if(s){
          var cat=(catFn()||[]).find(function(p){return p.key===playerKey;});
          var mine=(APP.draftRosters||[]).filter(function(r){return APP.user&&r.username===APP.user.username;});
          if(cat){
            var v=violacao(s,cat,mine);
            if(v){ toast&&toast("Limite de elenco atingido: "+v); return; }
          }
        }
      }catch(e){}
      return _origBuy.apply(this,arguments);
    };
  }

  // ---- PAINEL DE CONFIG DOS LIMITES (admin), salvo em settings.roster_caps ----
  window.draftCapsOpen=function(){
    var s=APP.draftSeason; if(!s){toast&&toast("Abra a temporada primeiro.");return;}
    var c=caps(s);
    function row(key,label,extra){
      var on=c[key]&&c[key].enabled;
      var max=(c[key]&&c[key].max)||"";
      return '<div style="border:1px solid var(--line);border-radius:9px;padding:9px;margin:6px 0">'+
        '<label style="display:flex;gap:8px;align-items:center">'+
          '<input type="checkbox" id="cap_'+key+'_on" '+(on?"checked":"")+' style="transform:scale(1.15)" />'+
          '<b style="flex:1;color:var(--chalk)">'+label+'</b>'+
        '</label>'+
        '<div style="display:flex;gap:8px;align-items:center;margin-top:7px">'+
          '<span style="color:var(--dim);font-size:12px">máx</span>'+
          '<input id="cap_'+key+'_max" class="input" style="margin:0;width:70px;text-align:center" inputmode="numeric" value="'+max+'" placeholder="ex 3" />'+
          (extra||"")+
        '</div>'+
      '</div>';
    }
    var ageExtra=function(key,defAge){
      var age=(c[key]&&c[key].age)||defAge;
      return '<span style="color:var(--dim);font-size:12px;margin-left:6px">idade</span>'+
        '<input id="cap_'+key+'_age" class="input" style="margin:0;width:60px;text-align:center" inputmode="numeric" value="'+age+'" />';
    };
    var box='<div class="modal" onclick="draftCapsClose(event)" style="font-family:Inter,system-ui,sans-serif"><div class="box" onclick="event.stopPropagation()" style="font-family:Inter,system-ui,sans-serif">'+
      '<div class="h2 disp" style="color:#FF8A4C">Limites de elenco</div>'+
      '<p class="p" style="margin:8px 0">Defina quantos jogadores no máximo cada manager pode ter por categoria. Deixe desmarcado pra não limitar.</p>'+
      row("country","Máx por PAÍS (onde o clube joga)")+
      row("league","Máx por LIGA")+
      row("team","Máx por SELEÇÃO")+
      row("club","Máx por CLUBE")+
      row("pos","Máx por POSIÇÃO")+
      row("ageOver","Máx VETERANOS",ageExtra("ageOver",33))+
      row("ageUnder","Máx JOVENS",ageExtra("ageUnder",21))+
      '<button class="btn" style="margin-top:6px;background:#FF8A4C;color:#0A0E1C" onclick="draftCapsSave()">Salvar limites</button>'+
      '<button class="btn ghost" style="margin-top:8px" onclick="draftCapsClose()">Cancelar</button>'+
    '</div></div>';
    var host=document.getElementById("dCapsHost");
    if(!host){host=document.createElement("div");host.id="dCapsHost";document.body.appendChild(host);}
    host.style.fontFamily="Inter,system-ui,sans-serif";
    host.innerHTML=box;
  };
  window.draftCapsClose=function(ev){
    if(ev&&ev.target&&ev.target.className!=="modal")return;
    var host=document.getElementById("dCapsHost");if(host)host.innerHTML="";
  };
  window.draftCapsSave=async function(){
    var s=APP.draftSeason; if(!s)return;
    function read(key,hasAge){
      var on=document.getElementById("cap_"+key+"_on");
      var max=document.getElementById("cap_"+key+"_max");
      var o={enabled:!!(on&&on.checked), max:Number(max&&max.value)||0};
      if(hasAge){var a=document.getElementById("cap_"+key+"_age");o.age=Number(a&&a.value)||0;}
      return o;
    }
    var capsObj={
      country:read("country"), league:read("league"), team:read("team"),
      club:read("club"), pos:read("pos"),
      ageOver:read("ageOver",true), ageUnder:read("ageUnder",true)
    };
    try{
      var st=Object.assign({}, s.settings||{}, {roster_caps:capsObj});
      await sbUpdate("draft_seasons",{settings:st},"id=eq."+s.id);
      s.settings=st; // atualiza local
      toast&&toast("Limites salvos.");
      draftCapsClose();
    }catch(e){toast&&toast("Erro ao salvar: "+e.message);}
  };

  // injeta o botão "⚖︎ Limites de elenco" no painel DEV/BETA da temporada (admin)
  function injectCapsButton(){
    try{
      if(typeof isAdmin==="function" && !isAdmin())return;
      if(!APP.draftSeason)return;
      if(document.getElementById("dCapsBtn"))return;
      // procura o painel dev do draft (tem os botões de reset). Inserimos perto.
      var anchor=document.querySelector('[onclick*="devResetSeason"]')||document.querySelector('[onclick*="devResetMyRoster"]');
      if(!anchor)return;
      var btn=document.createElement("button");
      btn.id="dCapsBtn"; btn.className="btn ghost";
      btn.style.cssText="margin-top:8px;border-color:#FF8A4C;color:#FF8A4C";
      btn.textContent="⚖︎ Limites de elenco";
      btn.onclick=function(){draftCapsOpen();};
      anchor.parentNode.insertBefore(btn, anchor);
    }catch(e){}
  }
  setInterval(injectCapsButton, 700);
})();

// ============================================================
// CAMADA 1: SINCRONIZAÇÃO AO VIVO (polling)
// Enquanto você está na temporada do Draft, o app verifica o servidor a cada
// X segundos e atualiza a tela SOZINHO se alguém comprou/devolveu — sem F5,
// sem piscar, e sem interromper se você está digitando na busca.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  // intervalo configurável: settings.live_refresh_secs (padrão 5s). 0 = desligado.
  function refreshSecs(){
    try{
      var s=APP.draftSeason;
      var v=s&&s.settings&&s.settings.live_refresh_secs;
      v=Number(v);
      if(!v||v<2)return 5; // padrão 5s; mínimo 2s pra não martelar o servidor
      return v;
    }catch(e){return 5;}
  }

  // "impressão digital" do estado: quantos rosters e suas chaves+donos + saldos.
  // Se mudar, algo aconteceu e atualizamos.
  function fingerprint(rosters,teams){
    try{
      var a=(rosters||[]).map(function(r){return r.player_key+">"+r.username;}).sort().join("|");
      var b=(teams||[]).map(function(t){return t.username+":"+t.budget_left;}).sort().join("|");
      return a+"#"+b;
    }catch(e){return "";}
  }

  var _lastFp=null, _busy=false;

  function digitando(){
    // se o foco está num input/textarea, NÃO re-renderiza (não rouba o teclado)
    try{
      var el=document.activeElement;
      if(!el)return false;
      var tag=(el.tagName||"").toLowerCase();
      return tag==="input"||tag==="textarea"||tag==="select";
    }catch(e){return false;}
  }

  async function tick(){
    try{
      if(_busy)return;
      // só roda na tela do Draft com temporada aberta
      if(APP.view!=="draft"||!APP.draftSeason||!APP.draftSeasonId)return;
      if(typeof sb!=="function")return;
      _busy=true;
      var sid=APP.draftSeasonId;
      // busca leve: só rosters e teams (o que muda em compras/devoluções)
      var rosters=await sb("draft_rosters?season_id=eq."+sid+"&select=*&order=player_name");
      var teams=await sb("draft_teams?season_id=eq."+sid+"&select=*&order=created_at");
      // se trocou de tela enquanto buscava, aborta
      if(APP.view!=="draft"||APP.draftSeasonId!==sid){_busy=false;return;}
      var fp=fingerprint(rosters,teams);
      if(_lastFp===null){ _lastFp=fp; _busy=false; return; } // primeira leitura: só registra
      if(fp!==_lastFp){
        _lastFp=fp;
        APP.draftRosters=rosters||[];
        APP.draftTeams=teams||[];
        // atualiza sem piscar: se estou na aba mercado e NÃO estou digitando,
        // tenta o update leve da lista; senão, re-render normal (mas não enquanto digita).
        if(!digitando()){
          var did=false;
          try{ if(typeof window.__draftLiveRefresh==="function"){ did=window.__draftLiveRefresh(); } }catch(e){}
          if(!did && typeof renderKeepScroll==="function") renderKeepScroll();
          else if(!did && typeof render==="function") render();
        }
      }
    }catch(e){ /* silencioso: rede instável não deve quebrar a tela */ }
    finally{ _busy=false; }
  }

  // loop com intervalo dinâmico (relê refreshSecs a cada ciclo)
  function loop(){
    tick();
    setTimeout(loop, Math.max(2000, refreshSecs()*1000));
  }
  // começa após 3s (dá tempo do app carregar)
  setTimeout(loop, 3000);

  // quando troco de temporada, zera a impressão digital
  var _lastSid=null;
  setInterval(function(){
    if(APP.draftSeasonId!==_lastSid){ _lastSid=APP.draftSeasonId; _lastFp=null; }
  }, 1000);
})();

// ============================================================
// MODO MANUTENÇÃO (site inteiro) — controlado por app_config no Supabase
// Liga/desliga por botão no painel DEV. Quando ligado, TODOS veem a tela de
// manutenção (via polling). O admin (você) continua acessando pra poder desligar.
// ============================================================
(function(){
  if(typeof window==="undefined")return;

  var _maint={on:false,msg:""}, _maintTimer=null;

  async function fetchMaint(){
    try{
      if(typeof sb!=="function")return;
      var rows=await sb("app_config?id=eq.global&select=*");
      if(rows&&rows[0]){
        var was=_maint.on;
        _maint.on=!!rows[0].maintenance;
        _maint.msg=rows[0].message||"Site em manutenção. Voltamos em instantes!";
        if(was!==_maint.on) renderMaint();
      }
    }catch(e){ /* se a tabela não existe ainda, ignora silenciosamente */ }
  }

  function isAdminNow(){ try{ return typeof isAdmin==="function" && isAdmin(); }catch(e){ return false; } }

  function renderMaint(){
    var host=document.getElementById("maintHost");
    // mostra a tela só pra NÃO-admin quando ligado
    if(_maint.on && !isAdminNow()){
      if(!host){host=document.createElement("div");host.id="maintHost";document.body.appendChild(host);}
      host.style.cssText="position:fixed;inset:0;z-index:99999;background:linear-gradient(180deg,#0A0E1C,#0B1020);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;padding:24px";
      host.innerHTML='<div style="text-align:center;max-width:340px">'+
        '<div style="font-size:54px;margin-bottom:12px">🛠️</div>'+
        '<div style="font-family:\'Saira Condensed\',Inter,sans-serif;text-transform:uppercase;letter-spacing:.05em;font-size:24px;font-weight:800;color:#EEF2FB;margin-bottom:10px">Em manutenção</div>'+
        '<p style="color:#8B97B8;font-size:14px;line-height:1.5">'+esc(_maint.msg)+'</p>'+
        '<p style="color:#586187;font-size:11px;margin-top:18px">A página volta sozinha quando terminar.</p>'+
      '</div>';
    } else {
      // desligado ou sou admin: remove a tela e (se admin) mostra um aviso discreto
      if(host)host.innerHTML="";
      renderAdminBanner();
    }
  }

  // faixa de aviso pro admin saber que a manutenção está LIGADA (senão esquece ligada)
  function renderAdminBanner(){
    var b=document.getElementById("maintAdminBanner");
    if(_maint.on && isAdminNow()){
      if(!b){b=document.createElement("div");b.id="maintAdminBanner";document.body.appendChild(b);}
      b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99998;background:#FF8A4C;color:#0A0E1C;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:12px;text-align:center;padding:5px 10px";
      b.textContent="⚠️ MANUTENÇÃO LIGADA — só você (admin) vê o site. Os outros veem a tela de manutenção.";
    } else if(b){ b.remove(); }
  }

  // ligar/desligar (admin)
  window.toggleMaintenance=async function(turnOn,msg){
    if(!isAdminNow()){toast&&toast("Só admin.");return;}
    try{
      var patch={maintenance:!!turnOn, updated_at:new Date().toISOString()};
      if(msg!=null)patch.message=msg;
      await sbUpdate("app_config",patch,"id=eq.global");
      _maint.on=!!turnOn; if(msg!=null)_maint.msg=msg;
      toast&&toast(turnOn?"Manutenção LIGADA.":"Manutenção desligada.");
      renderMaint();
    }catch(e){toast&&toast("Erro: "+e.message+" (rodou o SQL da tabela app_config?)");}
  };

  // botão no painel DEV (junto dos outros botões dev)
  function injectMaintButton(){
    try{
      if(!isAdminNow())return;
      if(document.getElementById("maintBtn"))return;
      // procura a seção de manutenção do site (botão "Limpar todos os times" = resetAll())
      var anchor=document.querySelector('[onclick*="resetAll"]')||document.querySelector('[onclick*="reboot"]')||document.querySelector('[onclick*="wipeAll"]');
      if(!anchor)return;
      var btn=document.createElement("button");
      btn.id="maintBtn"; btn.className="btn ghost";
      btn.style.cssText="margin-bottom:10px;border-color:#FF8A4C;color:#FF8A4C";
      btn.textContent=_maint.on?"🟢 Desligar manutenção":"🛠️ Ligar modo manutenção";
      btn.onclick=function(){ window.toggleMaintenance(!_maint.on); setTimeout(function(){btn.textContent=_maint.on?"🟢 Desligar manutenção":"🛠️ Ligar modo manutenção";},300); };
      anchor.parentNode.insertBefore(btn, anchor);
    }catch(e){}
  }

  // checa o estado a cada 5s (independente da tela do draft) + injeta o botão
  setTimeout(function(){ fetchMaint(); setInterval(fetchMaint, 5000); }, 2500);
  setInterval(injectMaintButton, 800);
})();
