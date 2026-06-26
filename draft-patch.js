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
      s.src="draft-master-players.js?v=20260627-precos-espalhados";
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
  window.__draftCatFn=catFnSafe;
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
      // modo leilão: se há round em picking e o usuário ainda não escolheu, o clique vira "escolher pro leilão"
      var a2pickMode=false;
      try{ a2pickMode = !!(s&&s.settings&&s.settings.auction2_enabled) && APP.a2Round && APP.a2Round.status==="picking" &&
        !(APP.a2Picks||[]).some(function(x){return x.username===(APP.user&&APP.user.username)&&!x.is_consolation;}); }catch(e){}
      var clickAction = a2pickMode ? ("a2Pick('"+esc(p.key)+"')") : (clickable?("buyDraftPlayer('"+esc(p.key)+"')"):"");
      var rowClickable = a2pickMode ? !own : clickable;
      return '<div class="prow '+(own?"dis":"")+'" style="'+(rowClickable?"cursor:pointer":"")+'" onclick="'+(rowClickable?clickAction:"")+'">'+
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
  window.__draftMarketHTML=function(s,me,owner,myRoster){ return marketTabHTML(s,me,owner,myRoster); };
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
      if(tab==="leilao"){
        var s0=APP.draftSeason; if(!s0)return html;
        if(typeof window.a2PanelHTML!=="function") return draftCardWrap(s0,'<p class="p">Carregando leilão…</p>');
        try{ return draftCardWrap(s0, window.a2PanelHTML(s0)); }catch(e){ return draftCardWrap(s0,'<p class="p">Leilão: '+esc(e.message)+'</p>'); }
      }
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
    if(s&&s.settings&&s.settings.auction2_enabled) tabs.splice(1,0,["leilao","🔨 Leilão"]);
    var tab=APP.draftTab||"visao";
    var tabbar='<div class="postabs" style="margin:12px 0;flex-wrap:wrap">'+tabs.map(function(t){
      return '<div class="ptab'+(tab===t[0]?" on":"")+'" onclick="setDraftTab(\''+t[0]+'\')">'+t[1]+'</div>';
    }).join("")+'</div>';
    return '<div class="card" style="border-color:#FF8A4C">'+
      '<button class="btn ghost" style="margin-bottom:10px" onclick="confirmLeaveDraft()">← Voltar</button>'+
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

  // ============================================================
  // 🔨 DRAFT LEILÃO 2.0 — pick simultâneo + leilão + consolação
  // Tabelas: draft_auction_rounds, draft_picks (ver SQL).
  // ============================================================
  function a2on(s){ return !!(s&&s.settings&&s.settings.auction2_enabled); }
  // redesenha a tela (render é global, definido no app-part)
  function reRender(){ try{ (typeof render==="function"?render:(typeof renderKeepScroll==="function"?renderKeepScroll:function(){}))(); }catch(e){} }
  // versão que PRESERVA o scroll (usada pelo polling automático, pra tela não pular)
  function reRenderKeep(){ try{ if(typeof renderKeepScroll==="function") renderKeepScroll(); else if(typeof render==="function") render(); }catch(e){} }
  // catálogo de jogadores (vem do IIFE do mercado via window.__draftCatFn)
  function catFnSafe(){ try{ return (typeof window.__draftCatFn==="function")?(window.__draftCatFn()||[]):[]; }catch(e){ return []; } }
  function a2mode(s){ return (s&&s.settings&&s.settings.auction2_mode)||"blind"; }
  function a2step(s){ return Number(s&&s.settings&&s.settings.auction2_step)||5; }
  function a2conso(s){ return Number(s&&s.settings&&s.settings.auction2_consolation_pct)||70; }
  function a2me(){ return APP.user?APP.user.username:null; }
  // quem controla o leilão: o DONO da temporada OU um admin (não precisa do modo DEV)
  function a2CanManage(){
    try{
      var s=APP.draftSeason;
      if(isAdminNow()) return true;
      if(s && APP.user && s.created_by===APP.user.username) return true;
    }catch(e){}
    return false;
  }
  function a2teams(){ return APP.draftTeams||[]; }
  function a2budget(u){ var t=a2teams().find(function(x){return x.username===u;}); return t?Number(t.budget_left||0):0; }
  function a2prio(u){ var t=a2teams().find(function(x){return x.username===u;}); return t?Number(t.waiver_priority||999):999; }
  // jogadores ainda sem dono (livres), do catálogo
  function a2freeAgents(){
    var owned={}; (APP.draftRosters||[]).forEach(function(r){owned[r.player_key]=1;});
    return (catFnSafe()||[]).filter(function(p){return !owned[p.key];});
  }

  // ---- carregar o round atual da temporada ----
  APP.a2Round=APP.a2Round||null; APP.a2Picks=APP.a2Picks||[];
  async function a2Load(){
    var s=APP.draftSeason; if(!s||!a2on(s))return null;
    try{
      var rounds=await sb("draft_auction_rounds?season_id=eq."+s.id+"&order=round_no.desc&limit=1");
      APP.a2Round=(rounds&&rounds[0])||null;
      if(APP.a2Round){
        APP.a2Picks=await sb("draft_picks?round_id=eq."+APP.a2Round.id+"&select=*&order=created_at")||[];
      } else { APP.a2Picks=[]; }
      // assinatura do estado: muda quando alguém escolhe, dá lance, ou a fase muda
      var fp=(APP.a2Round?(APP.a2Round.id+":"+APP.a2Round.status):"none")+"|"+
        (APP.a2Picks||[]).map(function(p){return p.id+":"+p.state+":"+(p.bid||0)+":"+(p.player_key||"")+":"+(p.conflict_key||"");}).join(",");
      APP.a2Fingerprint=fp;
      return fp;
    }catch(e){ APP.a2SchemaMissing=/relation|does not exist|42P01/i.test(e.message); return null; }
  }

  // ---- admin abre um novo round ----
  window.a2OpenRound=async function(){
    var s=APP.draftSeason; if(!s||!a2CanManage())return;
    try{
      var prev=await sb("draft_auction_rounds?season_id=eq."+s.id+"&order=round_no.desc&limit=1");
      var no=(prev&&prev[0])?Number(prev[0].round_no)+1:1;
      await sbInsert("draft_auction_rounds",{season_id:s.id,round_no:no,status:"picking",
        mode:a2mode(s),step:a2step(s),conso_pct:a2conso(s)});
      await a2Load(); reRenderKeep();
      toast&&toast("Round "+no+" aberto — todos podem escolher.");
    }catch(e){ toast&&toast("Erro ao abrir round: "+e.message); }
  };

  // ---- manager faz a escolha simultânea (segredo) ----
  window.a2Pick=async function(playerKey){
    var s=APP.draftSeason, r=APP.a2Round, u=a2me();
    if(!s||!r||!u||r.status!=="picking")return;
    var p=(catFnSafe()||[]).find(function(x){return x.key===playerKey;}); if(!p)return;
    if(p.price>a2budget(u)){ toast&&toast("Saldo insuficiente para "+p.name+"."); return; }
    // confirmação antes de registrar (escolha é secreta e trava até revelar)
    if(typeof confirm==="function" && !confirm("Confirmar escolha secreta: "+p.name+" ("+p.price+")?\n\nSe mais ninguém escolher ele, vai direto pro seu elenco. Se houver disputa, abre leilão.")) return;
    try{
      await sbInsert("draft_picks",{round_id:r.id,season_id:s.id,username:u,
        player_key:p.key,player_name:p.name,player_pos:p.pos,player_price:p.price,
        bid:(a2mode(s)==="priority"?null:p.price),state:"picked",is_consolation:false},
        true,"round_id,username,is_consolation");
      await a2Load(); reRenderKeep();
      toast&&toast("✓ Escolha registrada em segredo: "+p.name);
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  // ---- admin revela e resolve (agrupa conflitos) ----
  window.a2Reveal=async function(){
    var s=APP.draftSeason, r=APP.a2Round; if(!s||!r||!a2CanManage())return;
    try{
      var picks=(APP.a2Picks||[]).filter(function(x){return !x.is_consolation && x.player_key;});
      var byPlayer={}; picks.forEach(function(x){(byPlayer[x.player_key]=byPlayer[x.player_key]||[]).push(x);});
      for(var pk in byPlayer){
        var grp=byPlayer[pk];
        if(grp.length===1){
          await a2GrantPlayer(grp[0], grp[0].player_price);
          await sbUpdate("draft_picks",{state:"won"},"id=eq."+grp[0].id);
        } else {
          for(var i=0;i<grp.length;i++)
            await sbUpdate("draft_picks",{conflict_key:pk},"id=eq."+grp[i].id);
        }
      }
      await sbUpdate("draft_auction_rounds",{status:"resolving"},"id=eq."+r.id);
      if(typeof loadDraftSeason==="function") await loadDraftSeason(s.id); // recarrega elencos
      await a2Load(); reRenderKeep();
    }catch(e){ toast&&toast("Erro ao revelar: "+e.message); }
  };

  // ---- concede o jogador ao manager (roster + desconto + transação) ----
  async function a2GrantPlayer(pick, paid){
    var s=APP.draftSeason;
    // pega o time real do jogador do catálogo (a tabela usa player_team + pos)
    var cat=(catFnSafe()||[]).find(function(p){return p.key===pick.player_key;});
    var team=(cat&&(cat.team||cat.player_team))||"";
    var pos=pick.player_pos||(cat&&cat.pos)||"";
    await sbInsert("draft_rosters",{season_id:s.id,username:pick.username,
      player_key:pick.player_key,player_name:pick.player_name,
      player_team:team,pos:pos,base_price:paid,current_price:paid,acquired_price:paid,status:"owned"});
    if(draftSetting(s,"budget_enabled",true)){
      var cur=a2budget(pick.username);
      await sbUpdate("draft_teams",{budget_left:cur-paid},
        "season_id=eq."+s.id+"&username=eq."+encodeURIComponent(pick.username));
    }
    await sbInsert("draft_transactions",{season_id:s.id,username:pick.username,type:"auction",
      player_key:pick.player_key,player_name:pick.player_name,amount:paid,meta:{pos:pos,team:team,via:"leilao2.0"}});
  }

  // ---- resolver UM conflito (admin), conforme o modo ----
  window.a2ResolveConflict=async function(conflictKey){
    var s=APP.draftSeason, r=APP.a2Round; if(!s||!r||!a2CanManage())return;
    var grp=(APP.a2Picks||[]).filter(function(x){return x.conflict_key===conflictKey && !x.is_consolation;});
    if(grp.length<2)return;
    var mode=r.mode||"blind", winner=null, paid=0;
    if(mode==="priority"){
      grp.sort(function(a,b){return a2prio(a.username)-a2prio(b.username);});
      winner=grp[0]; paid=winner.player_price;
    } else {
      // maior lance vence; empate decidido pela regra configurada
      var tb=(s.settings&&s.settings.auction2_tiebreak)||"budget";
      var maxBid=0;
      grp.forEach(function(x){ var b=Number(x.bid||x.player_price); if(b>maxBid)maxBid=b; });
      var tied=grp.filter(function(x){return Number(x.bid||x.player_price)===maxBid;});
      if(tied.length===1){ winner=tied[0]; }
      else if(tb==="priority"){ tied.sort(function(a,b){return a2prio(a.username)-a2prio(b.username);}); winner=tied[0]; }
      else if(tb==="random"){ winner=tied[Math.floor(Math.random()*tied.length)]; }
      else { tied.sort(function(a,b){return a2budget(b.username)-a2budget(a.username);}); winner=tied[0]; } // budget
      paid=maxBid;
    }
    try{
      await a2GrantPlayer(winner, paid);
      await sbUpdate("draft_picks",{state:"won",bid:paid},"id=eq."+winner.id);
      for(var i=0;i<grp.length;i++){ if(grp[i].id!==winner.id)
        await sbUpdate("draft_picks",{state:"lost"},"id=eq."+grp[i].id); }
      if(typeof loadDraftSeason==="function") await loadDraftSeason(s.id); // recarrega elencos
      await a2Load(); reRenderKeep();
      toast&&toast(winner.username+" venceu por "+paid+".");
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  // ---- manager dá lance num conflito (blind = secreto; live = cobre o passo) ----
  window.a2Bid=async function(pickId, value){
    var s=APP.draftSeason; var pk=(APP.a2Picks||[]).find(function(x){return String(x.id)===String(pickId);});
    if(!pk)return;
    var minPct=Number(s&&s.settings&&s.settings.auction2_min_bid_pct)||0;
    var minBid=Math.ceil(Number(pk.player_price)*(1+minPct/100));
    var v=Math.max(minBid, parseInt(value,10)||minBid);
    if(v>a2budget(pk.username)){ toast&&toast("Lance acima do seu saldo."); return; }
    try{ await sbUpdate("draft_picks",{bid:v},"id=eq."+pk.id); await a2Load(); reRenderKeep();
      toast&&toast("Lance registrado."); }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  // ---- admin move o round pra fase de consolação ----
  window.a2ToConsolation=async function(){
    var r=APP.a2Round; if(!r||!a2CanManage())return;
    try{ await sbUpdate("draft_auction_rounds",{status:"consolation"},"id=eq."+r.id);
      await a2Load(); reRenderKeep(); }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  // ---- perdedor escolhe na consolação (faixa <= conso_pct do disputado) ----
  window.a2ConsoPick=async function(lostPickId, playerKey){
    var s=APP.draftSeason, r=APP.a2Round, u=a2me();
    var lost=(APP.a2Picks||[]).find(function(x){return String(x.id)===String(lostPickId);});
    if(!s||!r||!lost||lost.username!==u)return;
    var p=(a2freeAgents()).find(function(x){return x.key===playerKey;}); if(!p)return;
    var cap=Math.floor(Number(lost.player_price)*(r.conso_pct/100));
    if(p.price>cap){ toast&&toast("Acima da faixa de consolação ("+cap+")."); return; }
    if(p.price>a2budget(u)){ toast&&toast("Saldo insuficiente."); return; }
    try{
      await sbInsert("draft_picks",{round_id:r.id,season_id:s.id,username:u,
        player_key:p.key,player_name:p.name,player_pos:p.pos,player_price:p.price,
        bid:(r.mode==="priority"?null:p.price),state:"picked",is_consolation:true},
        true,"round_id,username,is_consolation");
      await a2Load();
      var same=(APP.a2Picks||[]).filter(function(x){return x.is_consolation&&x.player_key===p.key&&x.state==="picked";});
      if(same.length>1){
        for(var i=0;i<same.length;i++) await sbUpdate("draft_picks",{conflict_key:"conso:"+p.key},"id=eq."+same[i].id);
        toast&&toast("Disputa na consolação! Abriu mini-leilão por "+p.name+".");
      } else {
        await a2GrantPlayer({username:u,player_key:p.key,player_name:p.name,player_pos:p.pos}, p.price);
        var mine=(APP.a2Picks||[]).find(function(x){return x.is_consolation&&x.player_key===p.key&&x.username===u;});
        if(mine) await sbUpdate("draft_picks",{state:"consoled"},"id=eq."+mine.id);
      }
      if(typeof loadDraftSeason==="function" && APP.draftSeason) await loadDraftSeason(APP.draftSeason.id); // recarrega elencos
      await a2Load(); reRenderKeep();
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  // ---- admin encerra o round ----
  window.a2CloseRound=async function(){
    var r=APP.a2Round; if(!r||!a2CanManage())return;
    try{ await sbUpdate("draft_auction_rounds",{status:"done"},"id=eq."+r.id);
      await a2Load(); reRenderKeep(); toast&&toast("Round encerrado."); }catch(e){ toast&&toast("Erro: "+e.message); }
  };

  window.a2Load=a2Load;

  // ============================================================
  // 🤖 DEV — SIMULAR MANAGERS (testar o leilão sozinho)
  // Só admin. Cria bots, faz eles escolherem e darem lance.
  // ============================================================
  var A2_BOTS=["🤖 Bot Ana","🤖 Bot Bia"];
  window.a2AddBots=async function(){
    var s=APP.draftSeason; if(!s||!a2CanManage())return;
    try{
      var base=(APP.draftTeams||[]).length;
      for(var i=0;i<A2_BOTS.length;i++){
        await sbInsert("draft_teams",{season_id:s.id,username:A2_BOTS[i],team_name:A2_BOTS[i]+" FC",
          budget_left:s.budget,waiver_priority:base+i+1},true,"season_id,username");
      }
      if(typeof loadDraftSeason==="function") await loadDraftSeason(s.id);
      await a2Load(); reRenderKeep();
      toast&&toast("2 managers de teste adicionados.");
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };
  window.a2RemoveBots=async function(){
    var s=APP.draftSeason; if(!s||!a2CanManage())return;
    try{
      for(var i=0;i<A2_BOTS.length;i++){
        await sbDelete("draft_teams","season_id=eq."+s.id+"&username=eq."+encodeURIComponent(A2_BOTS[i]));
        await sbDelete("draft_rosters","season_id=eq."+s.id+"&username=eq."+encodeURIComponent(A2_BOTS[i]));
      }
      if(typeof loadDraftSeason==="function") await loadDraftSeason(s.id);
      await a2Load(); reRenderKeep();
      toast&&toast("Managers de teste removidos.");
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };
  // bots escolhem na fase de pick (miram os mais caros que cabem → tende a colidir com você)
  window.a2BotsPick=async function(){
    var s=APP.draftSeason, r=APP.a2Round; if(!s||!r||!a2CanManage()||r.status!=="picking")return;
    var feitos=0, jaTinha=0, erros=[];
    try{
      // recarrega antes pra ter o estado atual dos picks
      await a2Load();
      for(var i=0;i<A2_BOTS.length;i++){
        var u=A2_BOTS[i];
        if((APP.a2Picks||[]).some(function(x){return x.username===u&&!x.is_consolation;})){ jaTinha++; continue; }
        // o bot precisa existir como manager (draft_teams); se não existe, cria
        if(!(a2teams()||[]).some(function(t){return t.username===u;})){
          try{ await sbInsert("draft_teams",{season_id:s.id,username:u,team_name:u+" FC",budget_left:s.budget,waiver_priority:(a2teams()||[]).length+1},true,"season_id,username"); }catch(e){}
        }
        var bud=a2budget(u)||Number(s.budget)||300;
        var free=a2freeAgents().filter(function(p){return p.price<=bud;}).sort(function(a,b){return b.price-a.price;});
        if(!free.length){ erros.push(u+": sem jogador na faixa"); continue; }
        var pick=free[Math.floor(Math.random()*Math.min(3,free.length))];
        try{
          var res=await sbInsert("draft_picks",{round_id:r.id,season_id:s.id,username:u,
            player_key:pick.key,player_name:pick.name,player_pos:pick.pos,player_price:pick.price,
            bid:(r.mode==="priority"?null:pick.price),state:"picked",is_consolation:false},
            true,"round_id,username,is_consolation");
          feitos++;
        }catch(e){
          // fallback: se o upsert por constraint falhar, tenta insert simples
          try{
            await sbInsert("draft_picks",{round_id:r.id,season_id:s.id,username:u,
              player_key:pick.key,player_name:pick.name,player_pos:pick.pos,player_price:pick.price,
              bid:(r.mode==="priority"?null:pick.price),state:"picked",is_consolation:false});
            feitos++;
          }catch(e2){ erros.push(u+": "+e2.message); }
        }
      }
      await a2Load(); reRenderKeep();
      if(erros.length) toast&&toast("Bots: "+feitos+" ok, problema: "+erros[0]);
      else toast&&toast("Bots escolheram ("+feitos+" novo(s)"+(jaTinha?", "+jaTinha+" já tinha":"")+").");
    }catch(e){ toast&&toast("Erro bots: "+e.message); }
  };
  // bots dão lance num conflito (blind: 5-25% acima; live: cobre se valer)
  window.a2BotsBid=async function(){
    var s=APP.draftSeason, r=APP.a2Round; if(!s||!r||!a2CanManage())return;
    if(r.mode==="priority"){ toast&&toast("Modo prioridade não tem lance."); return; }
    try{
      var picks=APP.a2Picks||[];
      var cks=[]; picks.forEach(function(x){ if(x.conflict_key&&!x.is_consolation&&cks.indexOf(x.conflict_key)<0&&!picks.some(function(y){return y.conflict_key===x.conflict_key&&y.state==="won";})) cks.push(x.conflict_key); });
      for(var c=0;c<cks.length;c++){
        var grp=picks.filter(function(x){return x.conflict_key===cks[c]&&!x.is_consolation;});
        for(var i=0;i<grp.length;i++){
          var pk=grp[i]; if(A2_BOTS.indexOf(pk.username)<0) continue;
          var cur=Number(pk.bid||pk.player_price), bud=a2budget(pk.username);
          var novo;
          if(r.mode==="blind"){ novo=Math.min(bud, Math.round(pk.player_price*(1.05+Math.random()*0.20))); }
          else { novo=(cur+r.step<=Math.min(bud, pk.player_price*1.3) && Math.random()>0.3) ? cur+r.step : cur; }
          if(novo>cur) await sbUpdate("draft_picks",{bid:novo},"id=eq."+pk.id);
        }
      }
      await a2Load(); reRenderKeep();
      toast&&toast("Bots deram lance.");
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };
  // bots escolhem na consolação (pegam o melhor da faixa)
  window.a2BotsConso=async function(){
    var s=APP.draftSeason, r=APP.a2Round; if(!s||!r||!a2CanManage())return;
    var feitos=0, erros=[];
    try{
      await a2Load();
      var losers=(APP.a2Picks||[]).filter(function(x){return x.state==="lost"&&A2_BOTS.indexOf(x.username)>=0;});
      for(var i=0;i<losers.length;i++){
        var lost=losers[i], u=lost.username;
        // já fez a consolação?
        if((APP.a2Picks||[]).some(function(x){return x.is_consolation&&x.username===u&&x.state==="consoled";})) continue;
        var cap=Math.floor(Number(lost.player_price)*(r.conso_pct/100));
        var opts=a2freeAgents().filter(function(p){return p.price<=cap&&p.price<=a2budget(u);}).sort(function(a,b){return b.price-a.price;});
        if(!opts.length){ erros.push(u+": sem jogador na faixa "+cap); continue; }
        var p=opts[0];
        try{
          // insere a escolha de consolação do bot
          await sbInsert("draft_picks",{round_id:r.id,season_id:s.id,username:u,
            player_key:p.key,player_name:p.name,player_pos:p.pos,player_price:p.price,
            bid:(r.mode==="priority"?null:p.price),state:"picked",is_consolation:true},
            true,"round_id,username,is_consolation");
          // concede direto ao bot (sem passar pelo a2ConsoPick que checa usuário logado)
          await a2GrantPlayer({username:u,player_key:p.key,player_name:p.name,player_pos:p.pos}, p.price);
          await a2Load();
          var mine=(APP.a2Picks||[]).find(function(x){return x.is_consolation&&x.player_key===p.key&&x.username===u;});
          if(mine) await sbUpdate("draft_picks",{state:"consoled"},"id=eq."+mine.id);
          feitos++;
        }catch(e){ erros.push(u+": "+e.message); }
      }
      if(typeof loadDraftSeason==="function") await loadDraftSeason(s.id);
      await a2Load(); reRenderKeep();
      if(erros.length) toast&&toast("Consolação: "+feitos+" ok · "+erros[0]);
      else toast&&toast("Bots escolheram a consolação ("+feitos+").");
    }catch(e){ toast&&toast("Erro: "+e.message); }
  };
  // polling do leilão: a cada 4s checa o banco; só redesenha se o estado MUDOU
  // de verdade. Não redesenha enquanto você navega o mercado pra escolher.
  var _a2LastFp=null, _a2Polling=false;
  setInterval(function(){
    var s=APP.draftSeason;
    if(!(s&&a2on(s)&&APP.view==="draft"&&APP.draftTab==="leilao"))return;
    var ae=document.activeElement;
    if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; // não mexe enquanto digita/seleciona
    // se você está na fase de escolher e ainda não escolheu, PAUSA total do polling
    // (você está navegando o mercado; qualquer redesenho joga o scroll). Volta após escolher.
    try{
      var r=APP.a2Round;
      if(r && r.status==="picking" && !(APP.a2Picks||[]).some(function(x){return x.username===(APP.user&&APP.user.username)&&!x.is_consolation;})){
        return; // não faz nada enquanto escolhe
      }
    }catch(e){}
    if(_a2Polling)return; _a2Polling=true;
    a2Load().then(function(fp){
      _a2Polling=false;
      if(fp==null)return;
      if(_a2LastFp===null){ _a2LastFp=fp; return; }
      if(fp!==_a2LastFp){
        _a2LastFp=fp;
        reRenderKeep();
      }
    }).catch(function(){ _a2Polling=false; });
  }, 4000);

  // ---- UI do painel de leilão (depende da fase) ----
  function a2chip(pos){ return '<span style="font-size:10px;font-weight:800;border-radius:6px;padding:2px 6px;background:rgba(240,168,48,.16);color:var(--amber)">'+esc(pos||"?")+'</span>'; }
  window.a2PanelHTML=function(s){ return a2PanelHTML(s); };
  function a2PanelHTML(s){
    if(APP.a2SchemaMissing) return '<div class="card"><p class="p">⚠️ Faltam as tabelas do Leilão 2.0 no banco. Rode o arquivo <b>draft-leilao-2.0-supabase.sql</b> no Supabase.</p></div>';
    var r=APP.a2Round, me=a2me(), admin=a2CanManage();
    var modeName={blind:"🙈 Às cegas",live:"📣 Ao vivo",priority:"🔢 Prioridade"}[a2mode(s)]||a2mode(s);
    var h='<div class="card"><div class="tag" style="color:var(--amber)">🔨 DRAFT LEILÃO 2.0 · '+modeName+'</div>';
    if(!r||r.status==="done"){
      h+='<p class="p" style="margin:8px 0">'+(r?("Round "+r.round_no+" encerrado."):"Nenhum round aberto ainda.")+'</p>';
      if(admin) h+='<button class="btn" style="background:var(--amber);color:#1a1206" onclick="a2OpenRound()">▶ Abrir novo round</button>';
      else h+='<p class="p" style="color:var(--dim)">Aguarde o admin abrir um round.</p>';
      return h+'</div>';
    }
    h+='<p class="p" style="margin:8px 0">Round <b>'+r.round_no+'</b> · fase: <b style="color:var(--amber)">'+esc(r.status)+'</b></p></div>';
    // faixa DEV (só admin): simular managers de teste
    if(admin){
      var nBots=(a2teams()||[]).filter(function(t){return A2_BOTS.indexOf(t.username)>=0;}).length;
      h+='<div class="card" style="border:1px dashed var(--amber);background:color-mix(in srgb,var(--amber) 6%,transparent)">';
      h+='<div class="tag" style="color:var(--amber);margin-bottom:6px">🤖 DEV · SIMULAR MANAGERS</div>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
      if(nBots<A2_BOTS.length) h+='<button class="btn sm" style="width:auto;background:var(--amber);color:#1a1206" onclick="a2AddBots()">+ 2 bots de teste</button>';
      else h+='<button class="btn sm ghost" style="width:auto" onclick="a2RemoveBots()">remover bots</button>';
      if(r.status==="picking") h+='<button class="btn sm" style="width:auto;background:var(--amber);color:#1a1206" onclick="a2BotsPick()">🤖 bots escolhem</button>';
      if(r.status==="resolving"&&r.mode!=="priority") h+='<button class="btn sm" style="width:auto;background:var(--amber);color:#1a1206" onclick="a2BotsBid()">🤖 bots dão lance</button>';
      if(r.status==="consolation") h+='<button class="btn sm" style="width:auto;background:var(--amber);color:#1a1206" onclick="a2BotsConso()">🤖 bots na consolação</button>';
      h+='</div><p class="p" style="font-size:10px;color:var(--dim);margin-top:6px">Pra testar o leilão sozinho: adicione os bots, abra um round e use estes botões em cada fase.</p></div>';
    }
    if(r.status==="picking") h+=a2PickPhase(s,r,me,admin);
    else if(r.status==="resolving") h+=a2ResolvePhase(s,r,me,admin);
    else if(r.status==="consolation") h+=a2ConsoPhase(s,r,me,admin);
    return h;
  }
  function a2PickPhase(s,r,me,admin){
    var picks=(APP.a2Picks||[]).filter(function(x){return !x.is_consolation;});
    var mine=picks.find(function(x){return x.username===me;});
    var nPicked=picks.length;
    var teams=a2teams()||[];
    var nTeams=teams.length;
    var pickedSet={}; picks.forEach(function(x){pickedSet[x.username]=1;});
    var h='<div class="card"><div class="lbl" style="font-size:11px;color:var(--dim);text-transform:uppercase">① escolha simultânea · '+nPicked+'/'+nTeams+' escolheram</div>';
    // barra de status dos managers (mostra QUEM já escolheu, NÃO o que escolheu)
    if(nTeams){
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px">'+teams.map(function(t){
        var ok=pickedSet[t.username];
        return '<span style="font-size:10px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid '+(ok?"var(--green)":"var(--line)")+';color:'+(ok?"var(--green)":"var(--dim)")+'">'+(ok?"✓ ":"⏳ ")+esc(t.username)+'</span>';
      }).join("")+'</div>';
    }
    if(mine){
      h+='<div class="prow" style="border-color:var(--amber)">'+a2chip(mine.player_pos)+' <b style="flex:1;margin:0 8px">'+esc(mine.player_name)+'</b> <span style="color:var(--gold);font-weight:800">'+mine.player_price+'</span> <span style="font-size:10px;color:var(--green);margin-left:6px">✓ sua escolha</span></div>';
      var faltam=nTeams-nPicked;
      h+='<p class="p" style="font-size:12px;color:var(--dim);text-align:center;margin:10px 0 2px">'+(faltam>0?("🔒 Escolha guardada em segredo. Esperando "+faltam+" manager"+(faltam>1?"s":"")+"…"):"✅ Todos escolheram! "+(admin?"Pode revelar.":"Aguarde o admin revelar."))+'</p>';
    } else {
      // botão de revelar (admin) aparece ANTES do mercado, pra não sumir
      if(admin){
        var allIn0=nPicked>=nTeams && nTeams>0;
        h+='<button class="btn" style="margin:4px 0 8px;background:'+(allIn0?"var(--amber)":"var(--panel2)")+';color:'+(allIn0?"#1a1206":"var(--dim)")+'" onclick="a2Reveal()">🔓 Revelar escolhas e resolver'+(allIn0?"":" (faltam "+(nTeams-nPicked)+")")+'</button>';
      }
      h+='<p class="p" style="font-size:12px;color:var(--amber);margin:6px 0;font-weight:700">🔨 Escolha 1 jogador pro leilão (em segredo) · saldo <span style="color:var(--gold)">'+a2budget(me)+'</span></p>';
      h+='</div>';
      // usa a tela COMPLETA do mercado (cor por posição, busca, filtros, info, paginação)
      try{
        var owner={}; (APP.draftRosters||[]).forEach(function(rr){owner[rr.player_key]=rr.username;});
        var myRoster=(APP.draftRosters||[]).filter(function(rr){return APP.user&&rr.username===APP.user.username;});
        if(typeof window.__draftMarketHTML==="function"){
          return h+window.__draftMarketHTML(s,(a2teams()||[]).find(function(t){return t.username===me;}),owner,myRoster);
        }
      }catch(e){}
      // fallback: lista simples
      var free=a2freeAgents().filter(function(p){return p.price<=a2budget(me);}).sort(function(a,b){return b.price-a.price;}).slice(0,40);
      return h+'<div class="card">'+free.map(function(p){return '<div class="prow" style="cursor:pointer" onclick="a2Pick(\''+esc(p.key)+'\')">'+a2chip(p.pos)+' <b style="flex:1;margin:0 8px">'+esc(p.name)+'</b> <span style="color:var(--gold);font-weight:800">'+p.price+'</span></div>';}).join("")+'</div>';
    }
    if(admin){
      var allIn=nPicked>=nTeams && nTeams>0;
      h+='<button class="btn" style="margin-top:10px;background:'+(allIn?"var(--amber)":"var(--panel2)")+';color:'+(allIn?"#1a1206":"var(--dim)")+'" onclick="a2Reveal()">🔓 Revelar escolhas e resolver'+(allIn?"":" (faltam "+(nTeams-nPicked)+")")+'</button>';
    }
    return h+'</div>';
  }
  function a2ResolvePhase(s,r,me,admin){
    var picks=APP.a2Picks||[];
    var solos=picks.filter(function(x){return x.state==="won" && !x.is_consolation && !x.conflict_key;});
    var conflictKeys=[]; picks.forEach(function(x){ if(x.conflict_key && !x.is_consolation && conflictKeys.indexOf(x.conflict_key)<0) conflictKeys.push(x.conflict_key); });
    var h='<div class="card"><div class="lbl" style="font-size:11px;color:var(--dim);text-transform:uppercase">② revelação & leilões</div>';
    if(solos.length){ h+='<p class="p" style="font-size:11px;color:var(--dim);margin:6px 0">Sem disputa:</p>';
      solos.forEach(function(x){ h+='<div class="prow" style="border-color:var(--green)">'+a2chip(x.player_pos)+' <b style="flex:1;margin:0 8px">'+esc(x.player_name)+'</b> <span style="font-size:11px;color:var(--green)">'+esc(x.username)+' levou por '+x.player_price+'</span></div>'; }); }
    conflictKeys.forEach(function(ck){
      var grp=picks.filter(function(x){return x.conflict_key===ck && !x.is_consolation;});
      var p0=grp[0]; var done=grp.some(function(x){return x.state==="won";});
      h+='<div style="border:1px solid var(--red);border-radius:11px;padding:10px;margin:8px 0;background:color-mix(in srgb,var(--red) 7%,transparent)">';
      h+='<div style="display:flex;align-items:center;gap:6px">'+a2chip(p0.player_pos)+' <b style="flex:1">'+esc(p0.player_name)+'</b> <span style="color:var(--gold);font-weight:800">'+p0.player_price+'</span></div>';
      h+='<div style="font-size:11px;color:var(--dim);margin:4px 0">disputado por: '+grp.map(function(x){return esc(x.username)+(x.bid&&r.mode!=="priority"?(" ("+x.bid+")"):"");}).join(", ")+'</div>';
      if(done){ var w=grp.find(function(x){return x.state==="won";});
        h+='<div style="font-size:12px;color:var(--green);font-weight:700">🔨 '+esc(w.username)+' venceu por '+w.bid+'</div>';
      } else {
        // lance do próprio usuário (blind/live)
        var mine=grp.find(function(x){return x.username===me;});
        if(mine && r.mode!=="priority"){
          if(r.mode==="blind"){
            var minPct0=Number(s.settings&&s.settings.auction2_min_bid_pct)||0;
            var minBid0=Math.ceil(Number(p0.player_price)*(1+minPct0/100));
            h+='<div style="display:flex;gap:6px;margin-top:6px"><input id="a2bid_'+mine.id+'" type="number" inputmode="numeric" value="'+(mine.bid||minBid0)+'" min="'+minBid0+'" style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px;color:var(--chalk);font-weight:700;text-align:center"><button class="btn sm" style="width:auto;background:var(--amber);color:#1a1206" onclick="a2Bid('+mine.id+',document.getElementById(\'a2bid_'+mine.id+'\').value)">Dar lance</button></div>'+(minPct0>0?'<div style="font-size:10px;color:var(--dim);margin-top:3px">Lance mínimo: '+minBid0+' (+'+minPct0+'%)</div>':"");
          } else { // live
            h+='<button class="btn sm" style="width:auto;margin-top:6px;background:var(--amber);color:#1a1206" onclick="a2Bid('+mine.id+','+((mine.bid||p0.player_price)+r.step)+')">Cobrir → '+((mine.bid||p0.player_price)+r.step)+'</button>';
          }
        }
        if(admin) h+='<button class="btn sm" style="width:100%;margin-top:8px;background:var(--amber);color:#1a1206" onclick="a2ResolveConflict(\''+esc(ck)+'\')">Resolver este leilão ('+ (r.mode==="priority"?"prioridade":"maior lance") +')</button>';
      }
      h+='</div>';
    });
    var allResolved=conflictKeys.every(function(ck){return picks.some(function(x){return x.conflict_key===ck&&x.state==="won";});});
    if(admin && allResolved){
      var hasLosers=picks.some(function(x){return x.state==="lost";});
      h+= hasLosers
        ? '<button class="btn" style="margin-top:10px;background:var(--amber);color:#1a1206" onclick="a2ToConsolation()">→ Ir para consolação</button>'
        : '<button class="btn" style="margin-top:10px;background:var(--green);color:#06210f" onclick="a2CloseRound()">✓ Encerrar round</button>';
    }
    return h+'</div>';
  }
  function a2ConsoPhase(s,r,me,admin){
    var losers=(APP.a2Picks||[]).filter(function(x){return x.state==="lost";});
    var h='<div class="card"><div class="lbl" style="font-size:11px;color:var(--dim);text-transform:uppercase">③ consolação · faixa até '+r.conso_pct+'%</div>';
    losers.forEach(function(lost){
      var alreadyConsoled=(APP.a2Picks||[]).some(function(x){return x.is_consolation&&x.username===lost.username&&(x.state==="consoled");});
      var cap=Math.floor(Number(lost.player_price)*(r.conso_pct/100));
      h+='<div style="border:1px solid var(--line);border-radius:11px;padding:10px;margin:8px 0">';
      h+='<div style="font-size:12px;color:var(--dim)">'+esc(lost.username)+' perdeu <b style="color:var(--chalk)">'+esc(lost.player_name)+'</b> → pega até <b style="color:var(--gold)">'+cap+'</b></div>';
      if(alreadyConsoled){ h+='<div style="font-size:11px;color:var(--green);margin-top:4px">✓ já escolheu na consolação</div>'; }
      else if(lost.username===me){
        var opts=a2freeAgents().filter(function(p){return p.price<=cap && p.price<=a2budget(me);}).sort(function(a,b){return b.price-a.price;}).slice(0,25);
        if(!opts.length) h+='<div style="font-size:11px;color:var(--dim);margin-top:4px">Sem jogadores na sua faixa/saldo.</div>';
        h+='<div style="margin-top:6px">'+opts.map(function(p){return '<div class="prow" style="cursor:pointer" onclick="a2ConsoPick('+lost.id+',\''+esc(p.key)+'\')">'+a2chip(p.pos)+' <b style="flex:1;margin:0 8px">'+esc(p.name)+'</b> <span style="color:var(--gold);font-weight:800">'+p.price+'</span></div>';}).join("")+'</div>';
      } else { h+='<div style="font-size:11px;color:var(--dim);margin-top:4px">aguardando '+esc(lost.username)+' escolher...</div>'; }
      h+='</div>';
    });
    var allConsoled=losers.every(function(l){return (APP.a2Picks||[]).some(function(x){return x.is_consolation&&x.username===l.username&&x.state==="consoled";});});
    if(admin && allConsoled) h+='<button class="btn" style="margin-top:10px;background:var(--green);color:#06210f" onclick="a2CloseRound()">✓ Encerrar round</button>';
    return h+'</div>';
  }
})();
