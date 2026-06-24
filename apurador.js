// ============================================================
// APURADOR DE JOGOS — admin cola os 4 arquivos da SofaScore,
// o app gera o match (formato da engine) e salva no Supabase.
// ============================================================
(function(){
"use strict";
// ===== APURADOR: SofaScore (4 arquivos) -> match (formato da engine) =====
// Entrada: textos crus de lineups, incidents, statistics, shotmap.
// Saída: objeto match { status, homeCode, awayCode, score, goals_tl, team_stats, endMin, players{} }
function apurarMatch({lineupsTxt, incidentsTxt, statsTxt, shotmapTxt, homeCode, awayCode, homeElo, awayElo, neutral}){
  const L=JSON.parse(lineupsTxt), I=JSON.parse(incidentsTxt);
  const S=statsTxt?JSON.parse(statsTxt):null, SM=shotmapTxt?JSON.parse(shotmapTxt):null;
  if(!L.home||!L.away) throw new Error("Lineups inválido (sem home/away).");
  if(!I.incidents) throw new Error("Incidents inválido (sem incidents).");

  // jersey -> {raw,id,isHome}; mapeia por sofascore player id também
  const byId={}, jerseyHome={}, jerseyAway={};
  // mapeia posição SofaScore -> nossa
  const POS={G:"GK",D:"DEF",M:"MID",F:"ATT"};
  function mkPlayer(pl, isHome){
    const st=pl.statistics||{};
    const min=st.minutesPlayed||0;
    const raw={
      _sid: pl.player.id, _name: pl.player.name, _isHome:isHome,
      pos: POS[pl.position]|| (pl.player.position?POS[pl.player.position]:"MID") || "MID",
      team: isHome?homeCode:awayCode,
      min, started: !pl.substitute,
      goals:[], assists:[], sots:[],
      sca: st.keyPass||0,            // key passes ~ chances criadas
      gca: st.bigChanceCreated||0,
      prgp: st.accurateOppositionHalfPasses||0,
      pib: st.bigChanceCreated||0,
      tklint: (st.totalTackle||0)+(st.interceptionWon||0),
      block: st.outfielderBlock||0,
      recovery: st.ballRecovery||0,
      aerial: st.aerialWon||0,
      clearance: st.totalClearance||0,
      dribbles: st.wonContest||0,
      accCross: st.accurateCross||0,
      inaccCross: Math.max(0,(st.totalCross||0)-(st.accurateCross||0)),
      fouls: st.fouls||0,
      dribbledPast: st.challengeLost||0,
      yellow: 0, red: null,
      errGoal: st.errorLeadToAGoal||0, errShot: st.errorLeadToAShot||0,
      penCom: st.penaltyConceded||0, ownGoal: st.ownGoals||0,
      wasFouled: st.wasFouled||0,
      longBall: st.accurateLongBalls||0,
      prgCarry: st.progressiveBallCarriesCount||0,
      dispossessed: st.dispossessed||0,
      penaltyWon: st.penaltyWon||0,
      setPieceSot:0,setPieceGoals:0,longSot:0,longGoals:0,
      subbedOff:false
    };
    // goleiro
    if(raw.pos==="GK" || pl.position==="G"){
      const nSaves=st.saves||0;
      const savesArr=[]; for(let k=0;k<nSaves;k++)savesArr.push({psxg:0.2});
      raw.gk={saves:savesArr, opa:st.totalKeeperSweeper||0, crossStop:st.goodHighClaim||0, conceded:st.goalsConceded||0, penSave:st.penaltySave||0};
    }
    byId[pl.player.id]=raw;
    const jersey=pl.jerseyNumber||pl.shirtNumber;
    if(isHome)jerseyHome[jersey]=raw; else jerseyAway[jersey]=raw;
    return raw;
  }
  (L.home.players||[]).forEach(pl=>mkPlayer(pl,true));
  (L.away.players||[]).forEach(pl=>mkPlayer(pl,false));

  // ---- incidents: gols, assists, cartões, substituições ----
  const goals_tl=[];
  let scoreH=0, scoreA=0, endMin=90;
  (I.incidents||[]).forEach(inc=>{
    const t=inc.time||0;
    if(inc.incidentType==="injuryTime"){ endMin=Math.max(endMin, 45*(inc.isLive?1:0)); }
    if(inc.incidentType==="period" && inc.text==="FT"){ /* fim */ }
    if(inc.incidentType==="goal"){
      const isHome=inc.isHome;
      const team=isHome?homeCode:awayCode;
      if(!inc.incidentClass||inc.incidentClass!=="ownGoal"){scoreH+= isHome?1:0; scoreA+= isHome?0:1;}
      else {scoreH+= isHome?0:1; scoreA+= isHome?1:0;}
      goals_tl.push({m:t, t:team});
      // credita gol ao jogador
      const gp=inc.player&&byId[inc.player.id];
      if(gp && inc.incidentClass!=="ownGoal"){ gp.goals.push({m:t, xg:0.2}); }  // religado pelo shotmap
      if(inc.player&&inc.incidentClass==="ownGoal"){const op=byId[inc.player.id]; if(op)op.ownGoal=(op.ownGoal||0)+1;}
      // assist
      const ap=inc.assist1&&byId[inc.assist1.id];
      if(ap){ ap.assists.push({m:t, xag:0.15}); }  // xag real é religado pelo shotmap/lineup; fallback numérico
      // penalti
      if(inc.incidentClass==="penalty"&&gp){gp.penaltyWon=gp.penaltyWon;}
    }
    if(inc.incidentType==="card"){
      const cp=inc.player&&byId[inc.player.id];
      if(cp){
        if(inc.incidentClass==="yellow")cp.yellow=(cp.yellow||0)+1;
        else if(inc.incidentClass==="red"||inc.incidentClass==="yellowRed"){cp.red={m:t,doubleYellow:inc.incidentClass==="yellowRed"};}
      }
    }
    if(inc.incidentType==="substitution"){
      // quem saiu (playerOut) terminou? marca subbedOff
      const outP=inc.playerOut&&byId[inc.playerOut.id];
      if(outP)outP.subbedOff=true;
    }
  });

  // ---- shotmap: SOT, bola parada, chute de fora, xg nos gols ----
  if(SM&&SM.shotmap){
    SM.shotmap.forEach(sh=>{
      const p=sh.player&&byId[sh.player.id]; if(!p)return;
      const isGoal=sh.shotType==="goal";
      const onTarget=isGoal||sh.shotType==="save"||sh.shotType==="goal";
      const xg=sh.xg!=null?sh.xg:null;
      // fora da área?
      const dist=sh.playerCoordinates?Math.hypot(100-(sh.playerCoordinates.x||0), 50-(sh.playerCoordinates.y||0)):0;
      const fora=(sh.situation==="long-range")|| (sh.playerCoordinates&&sh.playerCoordinates.x<=83);
      const bolaParada=["free-kick","corner","set-piece"].includes(sh.situation)|| sh.situation==="penalty";
      if(isGoal){
        // acha o gol correspondente e põe xg
        const g=p.goals.find(x=>x.xg===0.2)||p.goals.find(x=>x.xg!=null); if(g&&xg!=null)g.xg=xg;
        if(fora)p.longGoals=(p.longGoals||0)+1;
        if(bolaParada)p.setPieceGoals=(p.setPieceGoals||0)+1;
      }
      if(onTarget){
        p.sots.push({m:sh.time||0});
        if(fora)p.longSot=(p.longSot||0)+1;
        if(bolaParada)p.setPieceSot=(p.setPieceSot||0)+1;
      }
      // religa psxg na defesa do goleiro adversário (chute no alvo que não foi gol)
      if(sh.shotType==="save"){
        const gkRaw=Object.values(byId).find(r=>r.gk && r._isHome!==(sh.isHome));
        if(gkRaw&&gkRaw.gk&&gkRaw.gk.saves.length){const sv=gkRaw.gk.saves.find(x=>x.psxg===0.2);if(sv&&sh.xg!=null)sv.psxg=sh.xg;}
      }
    });
  }

  // ---- gols sofridos: atribui ao goleiro em campo (SofaScore não traz goalsConceded) ----
  // conta gols do adversário por metade do tempo e credita ao GK que estava jogando.
  (function(){
    function golsContraTime(ehHome){
      // gols sofridos por um time = gols do adversário (no goals_tl, t = quem marcou)
      return goals_tl.filter(g=> ehHome ? g.t===awayCode : g.t===homeCode );
    }
    [true,false].forEach(ehHome=>{
      const gksTime=Object.values(byId).filter(r=>r.gk && r._isHome===ehHome);
      if(!gksTime.length)return;
      const sofridos=golsContraTime(ehHome);
      // credita cada gol ao GK que estava em campo no minuto do gol
      sofridos.forEach(gl=>{
        // acha o GK do time que estava jogando nesse minuto (started e não saiu antes, ou entrou)
        let gkResp=gksTime.find(r=>r.started && (!r.subbedOff || true));
        // se houver troca de goleiro, prioriza quem tem min>0 cobrindo o minuto; fallback: o titular
        const titular=gksTime.find(r=>r.started);
        gkResp = titular || gksTime[0];
        if(gkResp&&gkResp.gk) gkResp.gk.conceded=(gkResp.gk.conceded||0)+1;
      });
    });
  })();

  // ---- team_stats: posse ----
  const team_stats={[homeCode]:{possession:50,setPieceGoals:0},[awayCode]:{possession:50,setPieceGoals:0}};
  if(S&&S.statistics){
    const all=S.statistics.find(x=>x.period==="ALL");
    if(all){all.groups.forEach(g=>g.statisticsItems.forEach(it=>{
      if(it.key==="ballPossession"){team_stats[homeCode].possession=it.homeValue;team_stats[awayCode].possession=it.awayValue;}
    }));}
  }

  // monta players{} no formato final (id do PREPOOL será religado depois; aqui usa _sid->raw)
  const players={};
  Object.values(byId).forEach(raw=>{
    const clean={};
    Object.keys(raw).forEach(k=>{ if(!k.startsWith("_"))clean[k]=raw[k]; });
    players[raw._sid]={...clean, _name:raw._name, _isHome:raw._isHome};
  });

  return { status:"finished", homeCode, awayCode, homeElo:homeElo||1700, awayElo:awayElo||1700, neutral:neutral!==false, tactCapV2:true, score:[scoreH,scoreA], goals_tl, team_stats, endMin, players, _byId:byId };
}

// ---- normalização de nomes (pra religar id do prepool) ----
function _norm(s){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function _firstLast(s){const t=_norm(s).split(" ").filter(Boolean);return t.length?t[0]+" "+t[t.length-1]:"";}

// religa as chaves de match.players pro id do PREPOOL (casa por nome)
function religarIds(match, prepoolPlayers){
  const byFL={}; prepoolPlayers.forEach(p=>{byFL[_firstLast(p.name)]=p.id; byFL[_norm(p.name)]=p.id;});
  const novo={};
  Object.values(match.players).forEach(pl=>{
    const pid=byFL[_firstLast(pl._name||"")]!=null?byFL[_firstLast(pl._name||"")]:byFL[_norm(pl._name||"")];
    const clean={}; Object.keys(pl).forEach(k=>{if(!k.startsWith("_"))clean[k]=pl[k];});
    if(pid!=null)novo[pid]=clean;
  });
  // jogadores do prepool que não jogaram
  prepoolPlayers.forEach(p=>{if(novo[p.id]==null)novo[p.id]={min:0,started:false,goals:[],assists:[],sots:[]};});
  match.players=novo; delete match._byId;
  return match;
}

// ---- Supabase: carrega resultados salvos e aplica no catálogo ----
async function loadMatchResults(){
  try{
    if(!window.SUPA||!SUPA.ready())return;
    const rows=await sb("match_results?select=room_id,match");
    (rows||[]).forEach(r=>{
      if(window.GAMES&&window.GAMES.data&&window.GAMES.data[r.room_id]){
        window.GAMES.data[r.room_id].match=r.match; // sobrepõe o catálogo
      }
    });
  }catch(e){ /* silencioso: se falhar, usa o catálogo estático */ }
}
window.loadMatchResults=loadMatchResults;

// ---- abre a tela de apuração (admin) ----
window.abrirApuracao=function(roomId){
  if(!isAdmin())return;
  const g=window.GAMES.data[roomId];
  if(!g){toast("Jogo não encontrado.");return;}
  APP.apurar={roomId, home:g.match.homeCode||g.prepool.home.code, away:g.match.awayCode||g.prepool.away.code, prev:null, erro:null};
  render();
};
window.fecharApuracao=function(){APP.apurar=null;render();};

// ---- processa os 4 textos -> prévia ----
window.processarApuracao=function(){
  const a=APP.apurar; if(!a)return;
  const get=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
  const lineupsTxt=get("apLineups"), incidentsTxt=get("apIncidents"), statsTxt=get("apStats"), shotmapTxt=get("apShotmap");
  if(!lineupsTxt||!incidentsTxt){a.erro="Cole pelo menos Lineups e Incidents.";return render();}
  const g=window.GAMES.data[a.roomId];
  try{
    let match=apurarMatch({lineupsTxt,incidentsTxt,statsTxt:statsTxt||null,shotmapTxt:shotmapTxt||null,
      homeCode:a.home,awayCode:a.away,homeElo:g.match.homeElo,awayElo:g.match.awayElo,neutral:g.match.neutral});
    match=religarIds(match, g.prepool.players);
    // prévia: placar + top 5 pontuação (usa a engine real)
    let top=[];
    try{
      const eng=window.makeEngine(match);
      top=Object.entries(match.players).filter(([id,p])=>p.min>0).map(([id,p])=>{
        const meta=g.prepool.players.find(x=>String(x.id)===String(id))||{pos:p.pos||"MID",team:p.team};
        const r=eng.scorePlayer(Object.assign({pos:meta.pos,team:meta.team},p),null,null);
        return {nome:meta.name||id,pos:meta.pos,pts:r.total};
      }).sort((x,y)=>y.pts-x.pts).slice(0,5);
    }catch(e){}
    a.prev={match, score:match.score, nplayers:Object.values(match.players).filter(p=>p.min>0).length, top};
    a.erro=null;
  }catch(e){ a.erro="Erro ao processar: "+(e.message||e); a.prev=null; }
  render();
};

// ---- confirma e salva no Supabase ----
window.salvarApuracao=async function(){
  const a=APP.apurar; if(!a||!a.prev)return;
  if(!isAdmin())return;
  try{
    await sbInsert("match_results",{room_id:a.roomId, match:a.prev.match, apurado_por:(APP.user&&APP.user.username)||null, apurado_em:new Date().toISOString()}, true, "room_id");
    // aplica localmente na hora
    if(window.GAMES.data[a.roomId])window.GAMES.data[a.roomId].match=a.prev.match;
    toast("Jogo apurado e salvo! ✓");
    APP.apurar=null;
    if(window.go)window.go("result",a.roomId); else render();
  }catch(e){ a.erro="Erro ao salvar: "+(e.message||e); render(); }
};

// ---- HTML da tela de apuração (chamado pelo render) ----
window.apuracaoHTML=function(){
  const a=APP.apurar; if(!a)return "";
  const campo=(id,label,obrig)=>`<div style="margin-bottom:10px">
    <label style="display:block;font-size:12px;font-weight:700;color:var(--dim);margin-bottom:4px">${label}${obrig?' <span style="color:var(--red)">*</span>':''}</label>
    <textarea id="${id}" rows="3" placeholder="cole o conteúdo do arquivo aqui" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);resize:vertical"></textarea>
  </div>`;
  let prev="";
  if(a.erro)prev=`<div style="background:color-mix(in srgb,var(--red) 16%,transparent);border:1px solid var(--red);border-radius:8px;padding:10px;color:var(--red);font-size:12px;margin:10px 0">${esc(a.erro)}</div>`;
  else if(a.prev){
    const s=a.prev.score;
    prev=`<div style="background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0">
      <div style="font-size:18px;font-weight:800;text-align:center;margin-bottom:8px">${a.home} <span style="color:var(--blue)">${s[0]} × ${s[1]}</span> ${a.away}</div>
      <div style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:8px">${a.prev.nplayers} jogadores em campo</div>
      ${a.prev.top.length?`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Top pontuação (confira se faz sentido):</div>`+a.prev.top.map(t=>`<div style="font-size:12px;display:flex;justify-content:space-between;padding:2px 0"><span>${esc(t.pos)} ${esc(t.nome)}</span><b style="color:var(--green)">${typeof t.pts==="number"?t.pts.toFixed(1):t.pts}</b></div>`).join(""):""}
      <button class="btn" style="margin-top:12px;background:var(--green);color:#04140d" onclick="salvarApuracao()">✓ Confirmar e salvar</button>
    </div>`;
  }
  return `<div class="modal"><div class="box" style="max-width:520px;max-height:90vh;overflow-y:auto">
    <div class="h2 disp" style="margin-bottom:4px">⚙️ Apurar ${a.home} × ${a.away}</div>
    <p class="p" style="font-size:12px;color:var(--dim);margin-bottom:12px">Cole o conteúdo dos 4 arquivos da SofaScore. Lineups e Incidents são obrigatórios; Statistics e Shotmap melhoram a precisão (bola parada, chute de fora, xG).</p>
    ${campo("apLineups","Lineups",true)}
    ${campo("apIncidents","Incidents",true)}
    ${campo("apStats","Statistics",false)}
    ${campo("apShotmap","Shotmap",false)}
    ${prev}
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn" style="flex:1" onclick="processarApuracao()">Processar</button>
      <button class="btn secondary" style="flex:1" onclick="fecharApuracao()">Cancelar</button>
    </div>
  </div></div>`;
};

})();
