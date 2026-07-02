/* ============================================================
   PLAYER RADAR — radares de jogador estilo FifaPhy
   - 4 radares de linha (Ataque, Criação, Defesa, Posse), 5 eixos cada
   - 1 radar separado de Goleiro
   - cada eixo = PERCENTIL vs. jogadores da MESMA posição
   - alterna entre PARTIDA (1 jogo) e TEMPORADA (todos os jogos finalizados)
   Feature isolada: não altera nenhum arquivo existente.
   ============================================================ */
(function(){
  "use strict";
  if(typeof window==="undefined")return;

  // normalizador de nome (mesmo critério do app)
  function norm(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").trim();}

  // soma os stats crus de um player-objeto (de m.players) num acumulador
  // arrays viram contagem (goals/assists/sots); números somam.
  function addRaw(acc, p){
    if(!p)return acc;
    acc.min      += Number(p.min)||0;
    acc.games    += (p.min>0?1:0);
    acc.goals    += Array.isArray(p.goals)?p.goals.length:(Number(p.goals)||0);
    acc.assists  += Array.isArray(p.assists)?p.assists.length:(Number(p.assists)||0);
    acc.sots     += Array.isArray(p.sots)?p.sots.length:(Number(p.sots)||0);
    acc.sca      += Number(p.sca)||0;
    acc.gca      += Number(p.gca)||0;
    acc.pib      += Number(p.pib)||0;
    acc.prgp     += Number(p.prgp)||0;
    acc.tib      += Number(p.tib)||0;
    acc.prgCarry += Number(p.prgCarry)||0;
    acc.dribbles += Number(p.dribbles)||0;
    acc.tklint   += Number(p.tklint)||0;
    acc.recovery += Number(p.recovery)||0;
    acc.clearance+= Number(p.clearance)||0;
    acc.block    += Number(p.block)||0;
    acc.aerial   += Number(p.aerial)||0;
    acc.longBall += Number(p.longBall)||0;
    acc.dispossessed += Number(p.dispossessed)||0;
    acc.wasFouled+= Number(p.wasFouled)||0;
    acc.accCross += Number(p.accCross)||0;
    // goleiro
    if(p.gk){
      acc.gk=acc.gk||{saves:0,opa:0,crossStop:0,goalsPrevented:0,penSave:0,conceded:0};
      acc.gk.saves     += Array.isArray(p.gk.saves)?p.gk.saves.length:(Number(p.gk.saves)||0);
      acc.gk.opa       += Number(p.gk.opa)||0;
      acc.gk.crossStop += Number(p.gk.crossStop)||0;
      acc.gk.penSave   += Number(p.gk.penSave)||0;
      acc.gk.conceded  += Number(p.gk.conceded)||0;
      acc.gk.goalsPrevented += Number(p.gk.goalsPrevented)||0;
    }
    return acc;
  }
  function emptyAcc(){return {min:0,games:0,goals:0,assists:0,sots:0,sca:0,gca:0,pib:0,prgp:0,tib:0,
    prgCarry:0,dribbles:0,tklint:0,recovery:0,clearance:0,block:0,aerial:0,longBall:0,
    dispossessed:0,wasFouled:0,accCross:0,gk:null};}

  // converte acumulador em "por 90" (pra comparar jogadores com minutagens diferentes)
  function per90(acc){
    const m=Math.max(1,acc.min), f=90/m;
    const out={}; for(const k in acc){ if(k==="gk"||k==="min"||k==="games")continue; out[k]=acc[k]*f; }
    out._min=acc.min; out._games=acc.games;
    if(acc.gk){ out.gk={}; for(const k in acc.gk) out.gk[k]=acc.gk[k]*f; }
    return out;
  }

  // ---- coleta TODOS os jogadores (temporada) ou de UM jogo, agregados por nome+pos ----
  // retorna { byKey: {nn|pos: {name,pos,per90}}, byPos: {pos: [per90...]} }
  function collect(roomId){
    const GAMES=window.GAMES; if(!GAMES||!GAMES.data)return null;
    const rooms = roomId ? [roomId] : Object.keys(GAMES.data).filter(function(rid){
      const g=GAMES.data[rid]; return g&&g.match&&g.match.status==="finished";
    });
    const accs={}; // key = nn|pos
    rooms.forEach(function(rid){
      const g=GAMES.data[rid]; if(!g||!g.match||!g.match.players)return;
      const prepool={}; if(g.prepool&&g.prepool.players)g.prepool.players.forEach(function(pp){prepool[pp.id]={name:pp.name,pos:pp.pos,team:pp.team};});
      const players=g.match.players;
      for(const pid in players){
        const p=players[pid]; if(!(p.min>0))continue;
        const meta=prepool[pid]||prepool[+pid]||{name:p._name,pos:p.pos,team:p.team};
        if(!meta||!meta.name)continue;
        const pos=p.pos||meta.pos||"MID";
        const key=norm(meta.name)+"|"+pos;
        if(!accs[key]){accs[key]=emptyAcc();accs[key]._name=meta.name;accs[key]._pos=pos;accs[key]._team=meta.team;}
        addRaw(accs[key], p);
      }
    });
    const byKey={}, byPos={};
    for(const key in accs){
      const a=accs[key]; const p90=per90(a);
      const rec={name:a._name,pos:a._pos,team:a._team,per90:p90,games:a.games,min:a.min};
      byKey[key]=rec;
      (byPos[a._pos]=byPos[a._pos]||[]).push(rec);
    }
    return {byKey:byKey, byPos:byPos};
  }

  // percentil de um valor dentro de um array de valores (0..100)
  function pct(val, arr){
    if(!arr.length)return 50;
    let below=0, eq=0;
    for(let i=0;i<arr.length;i++){ if(arr[i]<val)below++; else if(arr[i]===val)eq++; }
    return Math.round((below+eq*0.5)/arr.length*100);
  }

  // ---- DEFINIÇÃO DOS RADARES ----
  // cada eixo: {label, key, inverse?} — key é campo do per90; inverse=true (menor é melhor)
  // radares de LINHA têm 5 eixos; goleiro tem o seu.
  var RADARS_LINE = [
    { title:"⚽ Ataque", color:"#34d399", axes:[
      {label:"Gols",          key:"goals"},
      {label:"Finalizações",  key:"sots"},
      {label:"Chances criadas",key:"sca"},
      {label:"Chances claras", key:"gca"},
      {label:"Dentro área",    key:"pib"}
    ]},
    { title:"🎨 Criação", color:"#60a5fa", axes:[
      {label:"Passes prog.",   key:"prgp"},
      {label:"Passes terço f.",key:"tib"},
      {label:"Conduções prog.",key:"prgCarry"},
      {label:"Assistências",   key:"assists"},
      {label:"Dribles",        key:"dribbles"}
    ]},
    { title:"🛡️ Defesa", color:"#f59e0b", axes:[
      {label:"Desarmes+Int.",  key:"tklint"},
      {label:"Recuperações",   key:"recovery"},
      {label:"Cortes",         key:"clearance"},
      {label:"Bloqueios",      key:"block"},
      {label:"Aéreos",         key:"aerial"}
    ]},
    { title:"🎯 Posse", color:"#a78bfa", axes:[
      {label:"Bolas longas",   key:"longBall"},
      {label:"Cruzam. certos", key:"accCross"},
      {label:"Sofreu falta",   key:"wasFouled"},
      {label:"Não perde bola", key:"dispossessed", inverse:true},
      {label:"Passes prog.",   key:"prgp"}
    ]}
  ];
  var RADAR_GK = { title:"🧤 Goleiro", color:"#22d3ee", axes:[
      {label:"Defesas",        key:"saves"},
      {label:"Saídas",         key:"opa"},
      {label:"Cortes cruz.",   key:"crossStop"},
      {label:"Gols evitados",  key:"goalsPrevented"},
      {label:"Pênaltis def.",  key:"penSave"}
  ]};

  // calcula os percentis de um eixo: valor do jogador vs. todos da mesma posição
  function axisPct(rec, axis, pool, isGK){
    var arr=[], myVal;
    pool.forEach(function(o){
      var src = isGK ? (o.per90.gk||{}) : o.per90;
      var v = Number(src[axis.key])||0;
      arr.push(v);
    });
    var mySrc = isGK ? (rec.per90.gk||{}) : rec.per90;
    myVal = Number(mySrc[axis.key])||0;
    var p = pct(myVal, arr);
    if(axis.inverse) p = 100 - p; // "não perde bola": menos perdas = melhor
    return { p:p, raw:myVal };
  }

  // monta o SVG de um radar (polígono + grelha + rótulos)
  function radarSVG(def, rec, pool, isGK){
    var n=def.axes.length, cx=150, cy=150, R=95;
    var ang=function(i){ return (-90 + i*360/n) * Math.PI/180; };
    var pt=function(i, r){ return [cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r]; };
    var rings="";
    [0.25,0.5,0.75,1].forEach(function(f){
      var pts=[]; for(var i=0;i<n;i++){var q=pt(i,R*f);pts.push(q[0].toFixed(1)+","+q[1].toFixed(1));}
      rings+='<polygon points="'+pts.join(" ")+'" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/>';
    });
    var spokes="";
    for(var i=0;i<n;i++){var q=pt(i,R);spokes+='<line x1="'+cx+'" y1="'+cy+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'" stroke="rgba(255,255,255,.08)" stroke-width="1"/>';}
    // polígono do jogador
    var poly=[], dots="", labels="", vals=[];
    for(var j=0;j<n;j++){
      var ap=axisPct(rec, def.axes[j], pool, isGK);
      vals.push({label:def.axes[j].label, p:ap.p, raw:ap.raw});
      var r=R*(ap.p/100); var q=pt(j,r);
      poly.push(q[0].toFixed(1)+","+q[1].toFixed(1));
      dots+='<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="3" fill="'+def.color+'"/>';
      // rótulo no vértice externo
      var lp=pt(j,R+18);
      var anchor = Math.abs(Math.cos(ang(j)))<0.3 ? "middle" : (Math.cos(ang(j))>0?"start":"end");
      labels+='<text x="'+lp[0].toFixed(1)+'" y="'+lp[1].toFixed(1)+'" fill="#9aa4b2" font-size="9" text-anchor="'+anchor+'" dominant-baseline="middle">'+esc(def.axes[j].label)+'</text>';
      labels+='<text x="'+lp[0].toFixed(1)+'" y="'+(lp[1]+10).toFixed(1)+'" fill="#e8edf2" font-size="9" font-weight="700" text-anchor="'+anchor+'" dominant-baseline="middle">'+ap.p+'%</text>';
    }
    var svg='<svg viewBox="0 0 300 300" style="width:100%;max-width:330px;display:block;margin:0 auto">'
      +rings+spokes
      +'<polygon points="'+poly.join(" ")+'" fill="'+def.color+'33" stroke="'+def.color+'" stroke-width="2"/>'
      +dots+labels+'</svg>';
    return {svg:svg, vals:vals};
  }

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

  // ---- estado do modal ----
  var _mode="match";   // "match" (1 jogo) ou "season" (todos)
  var _ctx=null;       // {name, pos, roomId}
  var _openAttr=null;  // área de atributo expandida (acordeão)
  var _statsPromise=null;

  // carrega player-stats.json (stats reais de 12 ligas) só uma vez, sob demanda
  function ensureStats(){
    if(window.PLAYER_STATS) return Promise.resolve(window.PLAYER_STATS);
    if(_statsPromise) return _statsPromise;
    _statsPromise = fetch("player-stats.json?v=20260702-buscafix")
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ window.PLAYER_STATS=j||{}; return window.PLAYER_STATS; })
      .catch(function(){ window.PLAYER_STATS={}; return window.PLAYER_STATS; });
    return _statsPromise;
  }
  window.ensureStatsDB = ensureStats;  // exposto pra busca da tela inicial
  // acha o registro de stats reais por nome (segue ponteiros de alias "@chave")
  function findStats(name, pos){
    var DB=window.PLAYER_STATS; if(!DB)return null;
    var deref=function(h){ if(typeof h==="string" && h.charAt(0)==="@") h=DB[h.slice(1)]; return (h&&typeof h==="object")?h:null; };
    // só aceita o registro se a posição bater (quando pos foi informada).
    // isso evita casar homônimos errados (ex.: Alisson goleiro x Alisson meia).
    var okPos=function(rec){ return rec && (!pos || !rec.pos || rec.pos===pos); };
    var tryKey=function(key){ var h=deref(DB[key]); return okPos(h)?h:null; };
    var k=norm(name);
    // 0) HOMÔNIMOS: tenta a chave "nome|pos" primeiro — separa os dois xarás
    // (ex.: "bruno henrique|ATT" do Flamengo vs "bruno henrique|MID" do Inter).
    if(pos){ var hk=deref(DB[k+"|"+pos]); if(hk && okPos(hk)) return hk; }
    // 1) match exato (nome completo) — mais confiável; aqui aceitamos mesmo sem bater posição
    var exact=deref(DB[k]);
    if(exact && okPos(exact)) return exact;
    var parts=k.split(" ").filter(Boolean);
    if(parts.length>=2){
      var first=parts[0], last=parts[parts.length-1], hit;
      // 2) "primeiro + último" sem nomes do meio
      hit=tryKey(first+" "+last); if(hit) return hit;
      // 3) "inicial + sobrenome" (Lionel Messi -> "l messi")
      hit=tryKey(first.charAt(0)+" "+last); if(hit) return hit;
      // 4) sobrenome composto (últimos 2 tokens), p/ ex. "de bruyne"
      hit=tryKey(parts[parts.length-2]+" "+last); if(hit) return hit;
      // 5) só o sobrenome — só aceita se a posição bater (senão pega homônimo)
      hit=tryKey(last); if(hit) return hit;
    }
    // se chegou aqui e havia um exato mas de outra posição, melhor não retornar nada
    return null;
  }

  // monta o conteúdo (todos os radares) pro jogador no modo atual
  // toggle partida/temporada (reutilizável)
  // detecta quais abas têm dado real para este jogador
  // match  = jogou no jogo aberto (_ctx.roomId)
  // season = tem stats reais (base) OU registros agregados de jogos finalizados
  function availModes(){
    var key = norm(_ctx.name)+"|"+_ctx.pos;
    var hasMatch=false, hasSeason=false;
    if(_ctx.roomId){
      var dm=collect(_ctx.roomId);
      hasMatch = !!(dm && dm.byKey[key]);
    }
    // temporada: stats reais da base (sempre conta)
    if(findStats(_ctx.name, _ctx.pos)) hasSeason=true;
    // ou agregado de jogos finalizados — mas só se houver dado ALÉM do jogo aberto
    if(!hasSeason){
      var ds=collect(null);
      var rs=ds && ds.byKey[key];
      if(rs){
        // se o único jogo da "temporada" é o próprio jogo aberto, não é temporada extra
        if(!hasMatch || rs.games>1) hasSeason=true;
      }
    }
    return {match:hasMatch, season:hasSeason};
  }

  function modeToggle(){
    var av=availModes();
    // se só um modo tem dado, não mostra toggle (mostra nada — o conteúdo já é daquele modo)
    if(av.match && !av.season) return "";
    if(av.season && !av.match) return "";
    if(!av.match && !av.season) return "";
    // os dois disponíveis → toggle completo
    return '<div style="display:flex;gap:6px;justify-content:center;margin:10px 0 4px">'
      +'<button onclick="window.radarSetMode(\'match\')" style="flex:1;max-width:140px;padding:8px;border-radius:9px;border:1px solid '+(_mode==="match"?"#34d399":"rgba(255,255,255,.15)")+';background:'+(_mode==="match"?"#34d39922":"transparent")+';color:'+(_mode==="match"?"#34d399":"#9aa4b2")+';font-weight:700;font-size:13px">Última partida</button>'
      +'<button onclick="window.radarSetMode(\'season\')" style="flex:1;max-width:140px;padding:8px;border-radius:9px;border:1px solid '+(_mode==="season"?"#34d399":"rgba(255,255,255,.15)")+';background:'+(_mode==="season"?"#34d39922":"transparent")+';color:'+(_mode==="season"?"#34d399":"#9aa4b2")+';font-weight:700;font-size:13px">Temporada</button>'
      +'</div>';
  }

  // popup explicativo do asterisco
  window.radarOvrInfo=function(){
    alert("OVERALL por desempenho — calculado a partir das estatísticas REAIS da temporada (gols, assistências, passes, desarmes, dribles, nota média etc.), comparado com jogadores da mesma posição nas 12 ligas. Reflete o RENDIMENTO recente, não a fama ou o valor de mercado — então um craque em má fase pode ter overall menor que o histórico dele, e um jogador em grande temporada pode aparecer acima do esperado.");
  };

  // cabeçalho OVERALL + PREÇO. Master = mercado; fora do master = overall por stats (com *)
  // formata valor de mercado: 65000000 -> "€65M", 2500000 -> "€2.5M", 800000 -> "€800K"
  function fmtMv(v){
    if(v==null||!isFinite(v)||v<=0) return null;
    if(v>=1e6){ var m=v/1e6; return "€"+(m>=10?Math.round(m):m.toFixed(1).replace(/\.0$/,""))+"M"; }
    if(v>=1e3){ return "€"+Math.round(v/1e3)+"K"; }
    return "€"+v;
  }
  // idade: se a base tiver data de nascimento (dob "YYYY-MM-DD"), calcula HOJE (atualiza no aniversário);
  // senão usa a idade fixa gravada na base.
  function ageNow(mp){
    try{
      if(mp.dob){
        var d=new Date(mp.dob); if(!isNaN(d)){
          var t=new Date(), a=t.getFullYear()-d.getFullYear();
          var m=t.getMonth()-d.getMonth();
          if(m<0||(m===0&&t.getDate()<d.getDate())) a--;
          if(a>0&&a<120) return a;
        }
      }
    }catch(e){}
    return (mp.age!=null?mp.age:null);
  }
  function ageMvLine(mp){
    var parts=[];
    var a=ageNow(mp); if(a!=null) parts.push(a+" anos");
    var mv=fmtMv(mp.marketValue!=null?mp.marketValue:mp.mv); if(mv) parts.push("💰 "+mv);
    if(!parts.length) return "";
    return '<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-bottom:6px">'+parts.join("  ·  ")+'</div>';
  }
  function headerQuality(name, pos){
    var Q=window.playerQuality;
    var mp=Q?Q.findMaster(name, pos):null;
    var col=function(v){return v>=85?"#34d399":v>=70?"#60a5fa":v>=55?"#f59e0b":"#9aa4b2";};
    var st=findStats(name, pos);
    // CASO 1: tem stats reais de desempenho (12 ligas) → overall por DESEMPENHO + preço (se no master)
    if(st && (st.ovrFinal!=null||st.ovrStats!=null)){
      var od=(st.ovrFinal!=null?st.ovrFinal:st.ovrStats);
      var priceCard = mp ? ('<div style="flex:1;max-width:130px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px">'
        +'<div style="font-size:10px;color:#9aa4b2;letter-spacing:.5px">PREÇO DRAFT</div>'
        +'<div style="font-size:26px;font-weight:800;color:#e8edf2;line-height:1.1">'+mp.draftPrice+'</div>'
        +'<div style="font-size:9px;color:#6b7280">rendimento no jogo</div></div>') : '';
      return '<div style="display:flex;gap:8px;justify-content:center;margin:8px 0 4px">'
        +'<div onclick="window.radarOvrInfo()" style="flex:1;max-width:130px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;cursor:pointer">'
        +'<div style="font-size:10px;color:#9aa4b2;letter-spacing:.5px">OVERALL</div>'
        +'<div style="font-size:26px;font-weight:800;color:'+col(od)+';line-height:1.1">'+od+'</div>'
        +'<div style="font-size:9px;color:#60a5fa">por desempenho · toque</div></div>'
        +priceCard+'</div>'
        +(mp?('<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-bottom:4px">'+esc(mp.club||"")+(mp.league?" · "+esc(mp.league):"")+'</div>'+ageMvLine(mp)):'');
    }
    // CASO 2: está no master mas SEM stats → overall de mercado + preço
    if(mp){
      var ovr=Q.overall(mp), price=mp.draftPrice;
      return '<div style="display:flex;gap:8px;justify-content:center;margin:8px 0 4px">'
        +'<div style="flex:1;max-width:130px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px">'
        +'<div style="font-size:10px;color:#9aa4b2;letter-spacing:.5px">OVERALL</div>'
        +'<div style="font-size:26px;font-weight:800;color:'+col(ovr)+';line-height:1.1">'+ovr+'</div>'
        +'<div style="font-size:9px;color:#6b7280">mercado·liga·clube</div></div>'
        +'<div style="flex:1;max-width:130px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px">'
        +'<div style="font-size:10px;color:#9aa4b2;letter-spacing:.5px">PREÇO DRAFT</div>'
        +'<div style="font-size:26px;font-weight:800;color:#e8edf2;line-height:1.1">'+price+'</div>'
        +'<div style="font-size:9px;color:#6b7280">rendimento no jogo</div></div></div>'
        +'<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-bottom:4px">'+esc(mp.club||"")+(mp.league?" · "+esc(mp.league):"")+'</div>'
        +ageMvLine(mp);
    }
    return "";
  }

  // barras de atributos de qualidade (quando não há partidas)
  // sub-atributos por área (estilo FIFA). média fica perto do valor da área.
  var SUBATTRS={
    Ataque:["Finalização","Faro de gol","Chute de fora","Pênaltis","Voleio"],
    "Criação":["Passe","Visão","Cruzamento","Passe longo","Bola parada"],
    Defesa:["Desarme","Interceptação","Marcação","Cabeceio defensivo","Antecipação"],
    "Físico":["Velocidade","Resistência","Força","Aceleração","Impulsão"],
    "Técnica":["Drible","Controle de bola","Agilidade","Finta","Equilíbrio"]
  };
  // gera sub-valores estáveis (determinísticos por nome+sub) em torno do valor da área
  function subVals(name, area, base){
    var subs=SUBATTRS[area]||[]; var out=[];
    for(var i=0;i<subs.length;i++){
      var s=subs[i]; var seed=0; var str=name+"|"+s;
      for(var k=0;k<str.length;k++){ seed=(seed*31+str.charCodeAt(k))&0xffffffff; }
      var delta=((seed>>>0)%13)-6; // -6..+6
      var v=Math.max(35,Math.min(99,Math.round(base+delta)));
      out.push([s,v]);
    }
    return out;
  }
  // toggle de expansão (acordeão)
  window.radarToggleAttr=function(area){
    var k=area; _openAttr = (_openAttr===k? null : k);
    var el=document.getElementById("subattr-"+cssId(area));
    var allSub=document.querySelectorAll('[id^="subattr-"]');
    for(var i=0;i<allSub.length;i++){ if(allSub[i]!==el) allSub[i].style.display="none"; }
    var allCar=document.querySelectorAll('[id^="caret-"]');
    for(var j=0;j<allCar.length;j++){ allCar[j].textContent="▸"; }
    if(el){ var show=(el.style.display==="none"||!el.style.display); el.style.display=show?"block":"none";
      var car=document.getElementById("caret-"+cssId(area)); if(car) car.textContent=show?"▾":"▸"; }
  };
  function cssId(s){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z]/g,""); }

  var AREA_COL={Ataque:"#34d399","Criação":"#60a5fa",Defesa:"#f59e0b","Físico":"#a78bfa","Técnica":"#22d3ee",
    Goleiro:"#34d399","Distribuição":"#60a5fa"};

  // monta UMA área (linha principal clicável + sub-atributos). subs = [[label, pct|null, txtCru|null],...]
  function attrAreaHTML(area, areaVal, subs, col){
    var cid=cssId(area), open=(_openAttr===area);
    var h='<div onclick="window.radarToggleAttr(\''+area.replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:8px;margin:7px 0;cursor:pointer">'
      +'<span id="caret-'+cid+'" style="font-size:10px;color:#6b7280;width:10px">'+(open?"▾":"▸")+'</span>'
      +'<span style="flex:1;font-size:13px;color:#cbd2da">'+area+'</span>'
      +'<div style="flex:1.6;height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:'+areaVal+'%;height:100%;background:'+col+'"></div></div>'
      +'<span style="font-size:14px;font-weight:800;color:'+col+';min-width:30px;text-align:right">'+areaVal+'</span></div>';
    var sub='<div id="subattr-'+cid+'" style="display:'+(open?"block":"none")+';margin:0 0 8px 18px;padding:8px 10px;border-left:2px solid '+col+'44;background:rgba(255,255,255,.02);border-radius:0 8px 8px 0">';
    subs.forEach(function(s){
      var label=s[0], pc=s[1], raw=s[2];
      if(pc==null){
        sub+='<div style="display:flex;align-items:center;gap:8px;margin:5px 0">'
          +'<span style="flex:1;font-size:12px;color:#6b7280">'+label+'</span>'
          +'<span style="font-size:11px;color:#6b7280">—</span></div>';
        return;
      }
      sub+='<div style="display:flex;align-items:center;gap:8px;margin:5px 0">'
        +'<span style="flex:1;font-size:12px;color:#9aa4b2">'+label+(raw?' <span style="color:#6b7280;font-size:10px">'+raw+'</span>':'')+'</span>'
        +'<div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden"><div style="width:'+pc+'%;height:100%;background:'+col+'aa"></div></div>'
        +'<span style="font-size:12px;font-weight:700;color:'+col+'cc;min-width:26px;text-align:right">'+pc+'</span></div>';
    });
    return h+sub+'</div>';
  }

  function qualityAttrsHTML(name, pos){
    var st=findStats(name, pos);
    // ── CAMINHO 1: stats REAIS (12 ligas) ──
    if(st && st.areas){
      var order = st.gk ? ["Goleiro","Distribuição","Físico"] : ["Ataque","Criação","Defesa","Físico","Técnica"];
      var h='<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin-bottom:12px">'
        +'<div style="font-size:15px;font-weight:800;color:#e8edf2;margin-bottom:2px">📊 Atributos da temporada'+(st.gk?' · 🧤 Goleiro':'')+'</div>'
        +'<p style="font-size:10px;color:#6b7280;margin:0 0 4px">'+esc(st.team||"")+' · '+(st.min||0)+'′ · percentil vs. mesma posição · toque para detalhar</p>';
      order.forEach(function(area){
        if(!st.areas[area]) return;
        var rows=st.areas[area]||[];
        var av=(st.areaScore&&st.areaScore[area]!=null)?st.areaScore[area]:50;
        h+=attrAreaHTML(area, av, rows, AREA_COL[area]||"#888");
      });
      return h+'</div>';
    }
    // ── CAMINHO 2: estimativa (jogador fora das 12 ligas) ──
    var Q=window.playerQuality; if(!Q)return "";
    var mp=Q.findMaster(name, pos); if(!mp)return '<p style="color:#9aa4b2;text-align:center;padding:16px">Jogador não encontrado na base.</p>';
    var a=Q.qualAttrs(mp);
    var rowsE=[["Ataque",a.ataque],["Criação",a.criacao],["Defesa",a.defesa],["Físico",a.fisico],["Técnica",a.tecnica]];
    var he='<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin-bottom:12px">'
      +'<div style="font-size:15px;font-weight:800;color:#e8edf2;margin-bottom:2px">📊 Atributos estimados</div>'
      +'<p style="font-size:10px;color:#6b7280;margin:0 0 10px">sem dados desta temporada — estimativa por mercado, liga, clube e posição</p>';
    rowsE.forEach(function(r){
      var area=r[0], val=r[1], col=AREA_COL[area]||"#888";
      var subs=subVals(name, area, val).map(function(s){return [s[0], s[1], null];});
      he+=attrAreaHTML(area, val, subs, col);
    });
    return he+'</div>';
  }

  // se o modo atual não tem dado, troca pro que tem (evita abrir numa aba vazia)
  function adjustMode(){
    var av=availModes();
    if(_mode==="match" && !av.match && av.season) _mode="season";
    else if(_mode==="season" && !av.season && av.match) _mode="match";
  }

  function buildContent(){
    if(!_ctx)return "";
    adjustMode();
    var roomId = _mode==="match" ? _ctx.roomId : null;
    var data = collect(roomId);
    var key = norm(_ctx.name)+"|"+_ctx.pos;
    var rec = data ? data.byKey[key] : null;

    // sem dados de desempenho neste modo → mostra qualidade (overall + atributos estimados)
    if(!rec){
      var hq='';
      hq+='<div style="text-align:center;margin-bottom:4px">'
        +'<div style="font-size:18px;font-weight:800;color:#e8edf2">'+esc(_ctx.name)+'</div>'
        +'<div style="font-size:12px;color:#9aa4b2">'+esc(_ctx.pos)+'</div></div>';
      hq+=headerQuality(_ctx.name, _ctx.pos);
      // toggle (deixa o usuário tentar o outro modo)
      hq+=modeToggle();
      if(_mode==="match"){
        hq+='<p style="color:#9aa4b2;text-align:center;padding:6px 0 12px;font-size:13px">Não atuou nesta partida. Veja os atributos estimados ou troque para Temporada.</p>';
      }
      hq+=qualityAttrsHTML(_ctx.name, _ctx.pos);
      return hq;
    }

    var pool = data.byPos[_ctx.pos] || [rec];
    var isGK = _ctx.pos==="GK";
    var defs = isGK ? [RADAR_GK] : RADARS_LINE;

    var h='';
    // cabeçalho com nome, posição, e o resumo (jogos/min)
    var posFull={GK:"goleiros",DEF:"defensores",MID:"meias",ATT:"atacantes"}[rec.pos]||(esc(rec.pos)+"s");
    // persona (estilo de química) do jogador
    var personaTag="";
    if(window.personaOf && window.QUIMICA){
      var ppk=window.personaOf(rec.name, rec.pos);
      var pper=(ppk&&ppk!=="camaleao")?window.QUIMICA.PERSONAS[ppk]:null;
      if(pper) personaTag='<div style="margin:4px 0 2px"><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#e8edf2;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px 10px"><span style="font-size:13px">'+pper.ico+'</span>'+esc(pper.nome)+'</span></div>';
    }
    h+='<div style="text-align:center;margin-bottom:6px">'
      +'<div style="font-size:18px;font-weight:800;color:#e8edf2">'+esc(rec.name)+'</div>'
      +personaTag
      +'<div style="font-size:12px;color:#9aa4b2">'+esc(rec.pos)+(rec.team?" · "+esc(rec.team):"")
      +' · '+(_mode==="season"?(rec.games+" jogo"+(rec.games>1?"s":"")+" · "+Math.round(rec.min)+"′"):"esta partida")+'</div>'
      +'<div style="font-size:10px;color:#6b7280;margin-top:2px">percentis comparados a '+pool.length+' '+posFull+'</div></div>';

    // overall + preço (qualidade)
    h+=headerQuality(_ctx.name, _ctx.pos);

    // toggle partida/temporada
    h+=modeToggle();
    h+='<p style="font-size:10px;color:#6b7280;text-align:center;margin:2px 0 10px">cada eixo = percentil vs. jogadores da mesma posição · valores por 90′</p>';

    // cada radar num card
    defs.forEach(function(def){
      var r=radarSVG(def, rec, pool, isGK);
      h+='<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin-bottom:12px">'
        +'<div style="font-size:15px;font-weight:800;color:#e8edf2;margin-bottom:4px">'+def.title+'</div>'
        +r.svg
        +'<div style="margin-top:8px">';
      // barras dos eixos (igual FifaPhy: rótulo + valor + percentil)
      r.vals.forEach(function(v){
        h+='<div style="display:flex;align-items:center;gap:8px;margin:5px 0">'
          +'<span style="flex:1;font-size:12px;color:#cbd2da">'+esc(v.label)+'</span>'
          +'<div style="flex:1.4;height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:'+v.p+'%;height:100%;background:'+def.color+'"></div></div>'
          +'<span style="font-size:12px;font-weight:800;color:'+def.color+';min-width:34px;text-align:right">'+v.p+'%</span>'
          +'</div>';
      });
      h+='</div></div>';
    });
    return h;
  }

  function paint(){
    var host=document.getElementById("radarHost"); if(!host)return;
    var box=host.querySelector(".radarBody");
    if(box) box.innerHTML=buildContent();
  }

  window.radarSetMode=function(m){ _mode=m; paint(); };

  // API pública: abre os radares de um jogador
  // openPlayerRadar(name, pos, roomId)
  window.openPlayerRadar=function(name, pos, roomId){
    _ctx={name:name, pos:pos||"MID", roomId:roomId||null};
    _mode = roomId ? "match" : "season";
    var host=document.getElementById("radarHost");
    if(!host){ host=document.createElement("div"); host.id="radarHost"; document.body.appendChild(host); }
    host.innerHTML=''
      +'<div onclick="window.closePlayerRadar(event)" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px 12px;font-family:Inter,system-ui,sans-serif">'
      +'<div onclick="event.stopPropagation()" style="background:#0e1320;border:1px solid rgba(255,255,255,.12);border-radius:18px;max-width:420px;width:100%;padding:16px;margin:auto">'
      +'<div style="display:flex;justify-content:flex-end"><button onclick="window.closePlayerRadar()" style="background:transparent;border:none;color:#9aa4b2;font-size:22px;cursor:pointer;line-height:1">×</button></div>'
      +'<div class="radarBody"></div>'
      +'</div></div>';
    paint();
    // carrega stats reais sob demanda; quando chegar, repinta (se o modal ainda estiver aberto deste jogador)
    if(!window.PLAYER_STATS){
      ensureStats().then(function(){
        if(_ctx && _ctx.name===name && document.getElementById("radarHost")) paint();
      });
    }
    // garante o mapa de personas (estilo de química); repinta quando chegar
    if(!window.PERSONA_MAP && window.ensurePersonaMap){
      window.ensurePersonaMap().then(function(){
        if(_ctx && _ctx.name===name && document.getElementById("radarHost")) paint();
      }).catch(function(){});
    }
  };
  window.closePlayerRadar=function(ev){
    if(ev&&ev.target&&!(ev.target.id==="radarHost"||ev.target.onclick))
      if(ev.currentTarget&&ev.target!==ev.currentTarget)return;
    var host=document.getElementById("radarHost"); if(host)host.innerHTML="";
  };

  // expõe internamente
  window.__radar = { norm:norm, collect:collect, pct:pct, per90:per90,
    RADARS_LINE:RADARS_LINE, RADAR_GK:RADAR_GK, axisPct:axisPct, radarSVG:radarSVG, esc:esc,
    buildContent:buildContent };
})();
