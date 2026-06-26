function draftHTML(){
  const s=APP.draftSeason;
  if(APP.draftSchemaMissing)return draftSeasonsCardHTML();
  if(!s)return `<div class="card"><p class="p">Temporada não encontrada.</p><button class="btn ghost" onclick="go('home')">← Voltar</button></div>`;
  const me=myDraftTeam();
  const myRoster=(APP.draftRosters||[]).filter(r=>r.username===APP.user?.username);
  const owner=draftOwnerMap();
  const teams=APP.draftTeams||[];
  const spent=Number(s.budget||300)-Number(me?me.budget_left:s.budget||300);
  const tabs=[["visao","Visão"],["mercado","Mercado"],["elencos","Elencos"],["movs","Transações"]];
  const tab=APP.draftTab||"visao";
  const tabbar=`<div class="postabs" style="margin:12px 0">${tabs.map(([k,l])=>`<div class="ptab${tab===k?" on":""}" onclick="setDraftTab('${k}')">${l}</div>`).join("")}</div>`;
  const mod=(label,key,fb=true)=>`<span class="chip" style="border-color:${draftSetting(s,key,fb)?"var(--green)":"var(--line)"};color:${draftSetting(s,key,fb)?"var(--green)":"var(--dim)"}">${draftSetting(s,key,fb)?"✓":"×"} ${esc(label)}</span>`;
  let body="";
  if(tab==="visao"){
    body=`<div class="dashgrid">
      <div class="dashitem"><b>${teams.length}</b><span>Managers</span></div>
      <div class="dashitem"><b>${APP.draftRosters.length}</b><span>Jogadores com dono</span></div>
      <div class="dashitem"><b>${me?Number(me.budget_left||0):"-"}</b><span>Suas moedas</span></div>
      <div class="dashitem"><b>${myRoster.length}/${s.roster_limit||12}</b><span>Seu elenco</span></div>
    </div>
    ${me?`<div class="prebox" style="border-color:#FF8A4C;color:#FF8A4C;background:color-mix(in srgb,#FF8A4C 10%,transparent)">Você está dentro como <b>${esc(me.team_name)}</b>. Gastou <b>${spent}</b> de <b>${s.budget||300}</b> moedas.</div>`:
      `<button class="btn" style="background:#FF8A4C;color:#0A0E1C" onclick="joinDraftSeason()">Entrar como manager</button>`}
    <div class="card" style="margin-top:12px"><div class="h2 disp">Regras desta temporada</div>
      <p class="p">Elenco exclusivo, ranking e histórico são o núcleo obrigatório. O resto foi escolhido na criação.</p>
      <div class="chips" style="margin-top:10px">
        ${mod("jogos/rodadas","games_scope")}${mod("orçamento","budget_enabled")}${mod("draft por ordem","ordered_draft")}${mod("limite de elenco","roster_limit_enabled")}${mod("escalação","lineup_enabled")}${mod("mercado livre","free_market")}
        ${mod("valorização","dynamic_prices")}${mod("venda atualizada","sell_at_current_price")}${mod("limite compras","purchase_limit_enabled")}${mod("janela automática","auto_windows",false)}${mod("waiver","waiver_enabled")}
        ${mod("trocas","trades_enabled")}${mod("propostas","pending_offers")}${mod("veto admin","admin_veto")}${mod("empréstimos","loans_enabled",false)}${mod("multa","release_clause_enabled")}${mod("leilão","free_agent_auction",false)}
      </div>
    </div>`;
  }else if(tab==="mercado"){
    const q=normTxt(APP.draftSearch||"");
    const cat=draftPlayerCatalog().filter(p=>!q||normTxt(p.name+" "+p.team+" "+p.pos).includes(q)).slice(0,80);
    body=`<div style="position:relative;margin-bottom:10px">
      <input id="draftSearchInput" class="input" style="margin:0;padding-left:38px" placeholder="🔍 Buscar jogador no mercado…" value="${esc(APP.draftSearch||"")}" oninput="setDraftSearch(this.value)" autocorrect="off" />
    </div>
    <p class="p" style="font-size:11px;margin-bottom:8px">Preço de temporada: usa o jogador no catálogo da Copa inteira, com base no valor de mercado e aparições no pool, sem variar por partida específica.</p>
    <div class="poolbox">${cat.map(p=>{
      const own=owner[p.key];
      const moneyOk=!draftSetting(s,"budget_enabled",true)||Number(me?me.budget_left:0)>=p.price;
      const rosterOk=!draftSetting(s,"roster_limit_enabled",true)||myRoster.length<Number(s.roster_limit||12);
      const can=me&&!own&&moneyOk&&rosterOk&&draftSetting(s,"free_market",true)&&s.market_status==="open";
      return `<div class="prow ${own?"dis":""}" style="${can?"cursor:pointer":""}" onclick="${can?`buyDraftPlayer('${esc(p.key)}')`:""}">
        <div class="posbar pb-${p.pos}"></div>
        <div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div>
        ${typeof playerPortraitHTML==="function"?playerPortraitHTML({name:p.name,team:p.team,pos:p.pos},"tinyface"):""}
        <div class="nm">${esc(p.name)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${esc(p.team)}</span>${own?` <span style="font-size:9px;color:var(--amber)">dono: ${esc(own)}</span>`:""}</div>
        <div class="pr mono">${p.price}</div>
      </div>`;
    }).join("")}</div>`;
  }else if(tab==="elencos"){
    body=teams.length?teams.map(t=>{
      const rs=(APP.draftRosters||[]).filter(r=>r.username===t.username);
      return `<div class="card" style="margin-bottom:10px;border-left:3px solid ${t.username===APP.user?.username?"var(--amber)":"#FF8A4C"}">
        <div class="h2 disp">${esc(t.team_name||t.username)}</div>
        <p class="p" style="font-size:11px;margin:4px 0">${esc(t.username)} · ${Number(t.budget_left||0)} moedas · ${rs.length}/${s.roster_limit||12} jogadores</p>
        ${rs.length?rs.map(r=>`<div class="line"><span class="face-inline">${typeof playerPortraitHTML==="function"?playerPortraitHTML({name:r.player_name,team:r.player_team,pos:r.pos},"microface"):""}<span class="txt"><b style="color:var(--dim);font-size:10px">${SLOT_LABEL[r.pos]||r.pos}</b> ${esc(r.player_name)} <span class="teamtag" style="--tc:${teamColor(r.player_team)}">${esc(r.player_team)}</span></span></span><span class="mono" style="color:#FF8A4C">${r.current_price}</span></div>`).join(""):`<p class="p">Sem jogadores ainda.</p>`}
      </div>`;
    }).join(""):`<p class="p">Nenhum manager entrou ainda.</p>`;
  }else{
    body=APP.draftTransactions.length?APP.draftTransactions.map(tr=>`<div class="line"><span class="face-inline">${typeof playerPortraitHTML==="function"?playerPortraitHTML({name:tr.player_name||"",team:tr.meta&&tr.meta.team?tr.meta.team:"",pos:tr.meta&&tr.meta.pos?tr.meta.pos:""},"microface"):""}<span class="txt"><b style="color:#FF8A4C">${esc(tr.username)}</b> ${esc(tr.type)} · ${esc(tr.player_name||"")}${tr.meta&&tr.meta.team?` <span class="teamtag" style="--tc:${teamColor(tr.meta.team)}">${esc(tr.meta.team)}</span>`:""}</span></span><span class="mono">${tr.amount||0}</span></div>`).join(""):`<p class="p">Nenhuma transação ainda.</p>`;
  }
  return `<div class="card" style="border-color:#FF8A4C">
    <button class="btn ghost" style="margin-bottom:10px" onclick="go('home')">← Voltar</button>
    <div class="tag">MERCADO DRAFT · TEMPORADA</div>
    <div class="h2 disp" style="color:#FF8A4C">🏟️ ${esc(s.name)}</div>
    <p class="p" style="margin:8px 0">Status: <b style="color:var(--chalk)">${esc(s.status)}</b> · Mercado: <b style="color:${s.market_status==="open"?"var(--green)":"var(--red)"}">${esc(s.market_status)}</b></p>
    ${tabbar}
    ${body}
  </div>`;
}
// ----- LIGAS: tela de uma liga -----
function leagueHTML(){
  const l=APP.league;
  if(!l)return `<div class="card"><div class="loading">Carregando liga…</div></div>`;
  const st=APP.leagueStanding;
  const tab=APP.leagueTab||"table";
  const phases=APP.leaguePhases||[];
  const fora=(APP.phases||[]).filter(p=>!p.league_id);
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">🏆 ${esc(l.name)}</div>
      <div class="userchip" onclick="leaveLeague()" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">${phases.length} rodada${phases.length!==1?"s":""} nesta liga.</p>
  </div>`;
  html+=standingCardHTML(st,tab,"setLeagueTab","liga");
  // rodadas (phases) da liga
  html+=`<div class="card"><div class="h2 disp">Rodadas desta liga</div>`;
  if(!phases.length)html+=`<p class="p" style="margin-top:6px">Nenhuma rodada vinculada ainda.</p>`;
  else phases.forEach(p=>{
    const unlinkBtn=isAdmin()?`<span onclick="event.stopPropagation();unlinkPhaseFromLeague('${p.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.55" title="Desvincular da liga (vira avulsa)">🔗</span>`:"";
    html+=`<div class="roomrow" onclick="enterPhase('${p.id}')"><div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">toque pra ver as mini rodadas</div></div><div style="display:flex;align-items:center;gap:6px">${unlinkBtn}<span class="statuspill st-finished">VER</span></div></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreatePhase('${l.id}')">+ Criar rodada nesta liga</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Rodadas avulsas (sem liga) — toque pra adicionar, ou exclua de vez:</p>`;
      fora.forEach(p=>{html+=`<div class="roomrow"><div class="info" onclick="addPhaseToLeague('${p.id}')" style="cursor:pointer"><div class="nm">${esc(p.name)}</div><div class="meta">adicionar a esta liga</div></div><div style="display:flex;align-items:center;gap:6px"><span onclick="event.stopPropagation();addPhaseToLeague('${p.id}')" class="statuspill st-closed" style="cursor:pointer">+ ADD</span><span onclick="event.stopPropagation();askDeletePhase('${p.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir rodada de vez">🗑</span></div></div>`;});
    }
    html+=`</div>`;
  }
  return html;
}
// tela de uma RODADA (phase): classificação + suas mini rodadas
function phaseHTML(){
  const ph=APP.phase;
  if(!ph)return `<div class="card"><div class="loading">Carregando rodada…</div></div>`;
  const st=APP.phaseStanding;
  const tab=APP.phaseTab||"table";
  const minis=APP.phaseRounds||[];
  const fora=(APP.rounds||[]).filter(r=>!r.phase_id);
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">${esc(ph.name)}</div>
      <div class="userchip" onclick="${ph.league_id?`enterLeague('${ph.league_id}')`:"go('home')"}" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">${minis.length} mini rodada${minis.length!==1?"s":""} nesta rodada.</p>
  </div>`;
  html+=standingCardHTML(st,tab,"setPhaseTab","rodada");
  // mini rodadas (rounds) desta phase
  html+=`<div class="card"><div class="h2 disp">Mini rodadas</div>`;
  if(!minis.length)html+=`<p class="p" style="margin-top:6px">Nenhuma mini rodada ainda.</p>`;
  else minis.forEach(r=>{
    const unlinkBtn=isAdmin()?`<span onclick="event.stopPropagation();unlinkRoundFromPhase('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.55" title="Desvincular da rodada (vira avulsa)">🔗</span>`:"";
    const delBtn=isAdmin()?`<span onclick="event.stopPropagation();askDeleteRound('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir mini rodada de vez">🗑</span>`:"";
    html+=`<div class="roomrow" onclick="enterRound('${r.id}')"><div class="info"><div class="nm">${esc(r.name)}</div><div class="meta">escolha ${r.pick_limit} jogos</div></div><div style="display:flex;align-items:center;gap:6px">${unlinkBtn}${delBtn}<span class="statuspill ${r.status==="open"?"st-open":"st-closed"}">${r.status==="open"?"ABERTA":"FECHADA"}</span></div></div>`;
  });
  html+=`</div>`;
  if(isAdmin()){
    html+=`<div class="card"><div class="tag" style="margin-bottom:6px">ADMIN · MINI RODADAS</div>
      <button class="btn" style="margin-bottom:10px" onclick="askCreateRoundInPhase('${ph.id}')">+ Criar mini rodada aqui</button>`;
    if(fora.length){
      html+=`<p class="p" style="margin-bottom:8px">Mini rodadas avulsas — toque pra adicionar, ou exclua de vez:</p>`;
      fora.forEach(r=>{html+=`<div class="roomrow"><div class="info" onclick="addRoundToPhase('${r.id}')" style="cursor:pointer"><div class="nm">${esc(r.name)}</div><div class="meta">adicionar a esta rodada</div></div><div style="display:flex;align-items:center;gap:6px"><span onclick="event.stopPropagation();addRoundToPhase('${r.id}')" class="statuspill st-closed" style="cursor:pointer">+ ADD</span><span onclick="event.stopPropagation();askDeleteRound('${r.id}')" style="cursor:pointer;font-size:15px;padding:4px;opacity:.5" title="Excluir mini rodada de vez">🗑</span></div></div>`;});
    }
    html+=`</div>`;
  }
  return html;
}
// card de classificação reutilizável (liga ou phase)
function standingCardHTML(st,tab,tabFn,nivel){
  let html=`<div class="card"><div class="postabs" style="margin-bottom:12px">
    <div class="ptab${tab==="table"?" on":""}" onclick="${tabFn}('table')">🏁 Pontos de tabela</div>
    <div class="ptab${tab==="classic"?" on":""}" onclick="${tabFn}('classic')">📊 Pontuação clássica</div>
  </div>`;
  if(!st){html+=`<div class="loading">Calculando…</div></div>`;return html;}
  if(!st.length){
    html+=`<p class="p">⏳ Ainda não há resultados. A classificação da ${nivel} aparece conforme as mini rodadas forem apuradas.</p></div>`;
    return html;
  }
  const sorted=[...st].sort((a,b)=>tab==="table"?(b.table-a.table||b.classic-a.classic):(b.classic-a.classic));
  html+=`<p class="p" style="margin-bottom:10px">${tab==="table"?"Soma dos pontos de tabela (colocação em cada mini rodada).":"Soma da pontuação de fantasy em todas as mini rodadas."}</p>`;
  sorted.forEach((u,i)=>{
    const me=u.username===APP.user?.username;
    const val=tab==="table"?u.table:u.classic.toFixed(1);
    const sub=tab==="table"?`${u.classic.toFixed(1)} pts clássicos · ${u.roundsPlayed} mini`:`${u.table} pts de tabela · ${u.roundsPlayed} mini`;
    html+=`<div class="rank${me?" me":""}"><div class="po mono">${i+1}º</div><div class="nm">${esc(u.username)}<small>${sub}</small></div><div class="pt mono">${val}</div></div>`;
  });
  html+=`</div>`;
  return html;
}
function setLeagueTab(t){APP.leagueTab=t;render();}
function setPhaseTab(t){APP.phaseTab=t;render();}
function askCreatePhase(leagueId){APP.confirm={mode:"createPhase",leagueId,label:"Criar rodada"};render();}
function askCreateRoundInPhase(phaseId){APP.confirm={mode:"createRound",newMode:"full",phaseId,label:"Criar mini rodada"};render();}
function roundGameClick(roomId){
  if(APP.confDrag){
    if(confRankOf(roomId)!=null)confDropOn(roomId);
    else{confDragCancel();renderKeepScroll();}
    return;
  }
  askEnterRoundGame(roomId);
}
function roundStatusSnapshot(){
  const r=APP.round, mode=modeOf(r);
  const rooms=APP.roundRooms||[];
  const entries=APP.roundEntries||[];
  const total=rooms.length;
  const mounted=rooms.filter(rr=>hasTeam(rr.room_id)).length;
  const confirmed=boostConfirmed();
  const chipsLeft=mode==="boost"?chipsAvailable().length:0;
  const confDone=mode==="confianca"?confRankedCount():0;
  const predDone=mode==="previsao"?entries.filter(e=>e.pred_home!=null&&e.pred_away!=null).length:0;
  const allGamesModes=new Set(["full","zebra","sobrevivencia","capitaoduplo"]);
  const ready=mode==="boost"?mounted===total&&chipsLeft===0&&confirmed:
    mode==="confianca"?mounted===total&&confDone===total&&confirmed:
    mode==="previsao"?mounted===total&&predDone===total&&confirmed:
    allGamesModes.has(mode)?mounted===total:
    true;
  return {mode,total,mounted,confirmed,chipsLeft,confDone,predDone,ready};
}
function roundTodoHTML(){
  const s=roundStatusSnapshot(), mode=s.mode;
  if(!s.total)return"";
  const items=[];
  items.push({ok:s.mounted===s.total,label:"Escalações",value:`${s.mounted}/${s.total}`});
  if(mode==="boost")items.push({ok:s.chipsLeft===0,label:"Fichas usadas",value:s.chipsLeft===0?"tudo certo":`${s.chipsLeft} faltando`});
  if(mode==="confianca")items.push({ok:s.confDone===s.total,label:"Ordem de confiança",value:`${s.confDone}/${s.total}`});
  if(mode==="previsao")items.push({ok:s.predDone===s.total,label:"Palpites",value:`${s.predDone}/${s.total}`});
  if(mode==="boost"||mode==="confianca"||mode==="previsao")items.push({ok:s.confirmed,label:"Confirmação",value:s.confirmed?"confirmado":"pendente"});
  const missing=items.filter(i=>!i.ok).length;
  return `<div class="card" style="border-color:${missing?"var(--amber)":"var(--green)"}">
    <div class="h2 disp">${missing?"⚠️ Minhas pendências":"✅ Tudo pronto"}</div>
    <p class="p">${missing?"Resolva isso antes da trava para não zerar/ficar incompleto.":"Sua mini rodada está redonda. Só acompanhar os jogos."}</p>
    <div class="dashgrid">
      ${items.slice(0,4).map(i=>`<div class="dashitem"><b>${esc(i.value)}</b><span>${esc(i.label)}</span></div>`).join("")}
    </div>
    ${items.map(i=>`<div class="todoitem ${i.ok?"ok":"warny"}"><span>${i.ok?"✓":"!"} ${esc(i.label)}</span><b style="color:${i.ok?"var(--green)":"var(--red)"}">${esc(i.value)}</b></div>`).join("")}
  </div>`;
}
function roundFeedHTML(){
  const all=APP.roundAllEntries||[];
  const rooms=APP.roundRooms||[];
  const mode=modeOf(APP.round);
  const events=[];
  const byUser={};
  all.forEach(e=>{
    if(!e.username)return;
    byUser[e.username]=byUser[e.username]||{teams:0,conf:0,preds:0,chips:0,confirmed:false};
    if(e.slots&&Object.values(e.slots).some(Boolean))byUser[e.username].teams++;
    if(e.conf_rank!=null)byUser[e.username].conf++;
    if(e.pred_home!=null&&e.pred_away!=null)byUser[e.username].preds++;
    if(Array.isArray(e.boost_chips)&&e.boost_chips.length)byUser[e.username].chips+=e.boost_chips.length;
    if(e.confirmed)byUser[e.username].confirmed=true;
  });
  Object.entries(byUser).forEach(([u,s])=>{
    if(s.teams)events.push(`👤 ${u} montou ${s.teams}/${rooms.length} time(s)`);
    if(mode==="confianca"&&s.conf)events.push(`📊 ${u} ordenou ${s.conf}/${rooms.length} jogo(s)`);
    if(mode==="boost"&&s.chips)events.push(`⚡ ${u} distribuiu ${s.chips} ficha(s)`);
    if(mode==="previsao"&&s.preds)events.push(`🔮 ${u} cravou ${s.preds}/${rooms.length} placar(es)`);
    if(s.confirmed)events.push(`🔒 ${u} confirmou a mini rodada`);
  });
  rooms.forEach(rr=>{
    if(rr.status==="locked")events.push(`🔒 ${matchName(rr.room_id)} foi travado pelo admin`);
  });
  const last=events.slice(-6).reverse();
  if(!last.length)return"";
  return `<div class="card"><div class="h2 disp">📡 Feed do grupo</div>${last.map(e=>`<div class="feeditem">${esc(e)}</div>`).join("")}</div>`;
}
function matchName(roomId){const j=APP.jogos.find(x=>x.room_id===roomId);return j?j.match_name:roomId;}
async function addPhaseToLeague(phaseId){
  if(!isAdmin())return;
  try{await sbUpdate("phases",{league_id:APP.leagueId},`id=eq.${phaseId}`);await loadPhases();await loadLeague(APP.leagueId);toast("Rodada adicionada à liga.");render();}
  catch(e){toast("Erro: "+e.message);}
}
async function addRoundToPhase(roundId){
  if(!isAdmin())return;
  try{await sbUpdate("rounds",{phase_id:APP.phaseId},`id=eq.${roundId}`);await loadRounds();await loadPhase(APP.phaseId);toast("Mini rodada adicionada à rodada.");render();}
  catch(e){toast("Erro: "+e.message);}
}
// DESVINCULAR: tira o vínculo (NÃO apaga). O item volta pra lista de avulsos da sua aba.
async function unlinkPhaseFromLeague(phaseId){
  if(!isAdmin())return;
  try{
    await sbUpdate("phases",{league_id:null},`id=eq.${phaseId}`);
    await loadPhases();if(APP.leagueId)await loadLeague(APP.leagueId);
    toast("Rodada desvinculada — voltou a ser avulsa.");render();
  }catch(e){toast("Erro: "+e.message);}
}
async function unlinkRoundFromPhase(roundId){
  if(!isAdmin())return;
  try{
    await sbUpdate("rounds",{phase_id:null},`id=eq.${roundId}`);
    await loadRounds();if(APP.phaseId)await loadPhase(APP.phaseId);
    toast("Mini rodada desvinculada — voltou a ser avulsa.");render();
  }catch(e){toast("Erro: "+e.message);}
}

// ----- RODADAS: tela de uma rodada -----
function roundHTML(){
  const r=APP.round;
  if(!r)return `<div class="card"><p class="p">Rodada não encontrada.</p><button class="btn ghost" onclick="leaveRound()">← Voltar</button></div>`;
  const mode=modeOf(r);
  const mm=modeMeta(r);
  const isSelect=mode==="select";
  const isBoost=mode==="boost";
  const isConf=mode==="confianca";
  const isPred=mode==="previsao";
  // confiança e previsão se comportam como o impulso na escalação: escala todos, trava no 1º jogo
  const isAllGames=isBoost||isConf||isPred||mode==="full"||mode==="zebra"||mode==="sobrevivencia"||mode==="capitaoduplo";
  const left=picksLeft(), used=picksUsed();
  const selLocked=picksLocked(); // seleção de jogos fechada pelo dev
  const bLocked=boostLocked();
  const roomOrder=(isConf&&(APP.confOrderMode||APP.confOrderDraft))?confRoomOrderIds():(APP.roundRooms||[]).map(rr=>rr.room_id);
  let jogos=roomOrder.map(rid=>APP.jogos.find(j=>j.room_id===rid)).filter(Boolean);
  // ordena por horário real do jogo (mais cedo no topo); jogos sem horário vão pro fim.
  // Exceção: no modo CONFIANÇA, quando o usuário está montando/tem ordem própria, respeita a ordem dele.
  const manualConfOrder=isConf&&(APP.confOrderMode||APP.confOrderDraft);
  if(!manualConfOrder){
    const tsOf=j=>{const ki=(typeof kickoffInfo==="function")?kickoffInfo(j.kickoff):null;return ki?ki.ts:Infinity;};
    jogos=jogos.slice().sort((a,b)=>tsOf(a)-tsOf(b));
  }
  const rows=jogos.map(j=>{
    const rid=j.room_id;
    const g=window.GAMES.data[rid];
    const finished=g&&g.match&&g.match.status==="finished";
    // agora TODOS os modos deixam montar todos os jogos
    const picked=true;
    const team=hasTeam(rid);
    const locked2=isConfirmed(rid); // travado (vale) no modo select
    const timeLocked=roomTimeLocked(rid);
    const adminLocked=roomAdminLocked(rid);
    const locked=timeLocked||adminLocked;
    let tag,meta,clickable=true;
    if(finished){tag='<span class="statuspill st-finished">VER RESULTADO</span>';meta="jogo encerrado · toque p/ ver";}
    else if(isSelect){
      if(locked2){tag='<span class="statuspill st-open">🔒 VALE ✓</span>';meta="travado — este jogo conta · toque p/ ajustar o time";}
      else if(timeLocked){tag='<span class="statuspill st-closed">🔒 EM JOGO</span>';meta="o jogo começou · escalação travada";}
      else if(team){tag='<span class="statuspill st-finished">MONTADO</span>';meta="time pronto · trave se quiser que ele conte";}
      else{tag='<span class="statuspill st-open">DISPONÍVEL</span>';meta="toque p/ montar o time deste jogo";}
    }
    else if(timeLocked){tag='<span class="statuspill st-closed">🔒 EM JOGO</span>';meta="o jogo começou · escalação travada · toque p/ ver";}
    else if(adminLocked){tag='<span class="statuspill st-closed">🔒 TRAVADO</span>';meta="escalação travada pelo admin · toque p/ ver";}
    else if(team){tag='<span class="statuspill st-open">ESCALADO</span>';meta="vaga garantida · toque p/ ajustar (livre até o jogo começar)";}
    else{tag='<span class="statuspill st-finished">MONTAR TIME</span>';meta="toque p/ escalar este jogo";}
    // ação principal modo select: travar/destravar o jogo (define quais valem)
    let playerBtn="";
    if(isSelect&&!finished&&!timeLocked&&!selLocked&&team){
      if(locked2){
        playerBtn=`<span class="statuspill" style="background:transparent;border:1px solid var(--red);color:var(--red);cursor:pointer" title="Destravar (enquanto a seleção está aberta)" onclick="event.stopPropagation();toggleSelectLock('${rid}')">DESTRAVAR</span>`;
      }else if(left>0){
        playerBtn=`<span class="statuspill" style="background:var(--amber);color:#0A0E1C;cursor:pointer" title="Travar — este jogo vai contar" onclick="event.stopPropagation();toggleSelectLock('${rid}')">TRAVAR</span>`;
      }
    }
    // controle de IMPULSO (modo boost): atribuir fichas (com valores), enquanto não travou
    let boostCtrl="";
    if(isBoost&&!finished){
      const myChips=chipsOn(rid);                 // fichas neste jogo (valores)
      const sumPct=myChips.reduce((s,v)=>s+v,0);
      const chipPill=v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;return `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:800;color:${col};border:1px solid ${col};border-radius:8px;padding:3px 8px;height:26px;box-sizing:border-box;background:color-mix(in srgb,${col} 16%,transparent)">⚡${neg?v:"+"+v}%</span>`;};
      if(bLocked){
        boostCtrl=myChips.length?`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${myChips.map(chipPill).join("")}<span style="font-weight:800;color:${sumPct<0?"#FF6B6B":mm.color};font-size:13px;margin-left:2px">=${sumPct<0?"":"+"}${sumPct}%</span></div>`:"";
      }else{
        const avail=chipsAvailable();
        // fichas já neste jogo: clicáveis pra remover
        const here=myChips.map(v=>`<span onclick="event.stopPropagation();unassignChip('${rid}',${v})" style="cursor:pointer" title="Remover">${chipPill(v)}</span>`).join("");
        // valores distintos disponíveis pra adicionar
        const distinct=[...new Set(avail)].sort((a,b)=>b-a);
        const addBtns=distinct.map(v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;const n=avail.filter(x=>x===v).length;
          const label=neg?`${v}%`:`+${v}%`;
          return `<button style="display:inline-flex;align-items:center;gap:2px;border-radius:8px;border:1px dashed ${col};background:transparent;color:${col};font-size:10px;font-weight:800;padding:3px 8px;height:26px;cursor:pointer" title="Pôr ficha ${label} (${n} disponível(is))" onclick="event.stopPropagation();assignChip('${rid}',${v})">+ ⚡${label}</button>`;}).join("");
        const dica=team?"":`<span style="font-size:10px;color:var(--dim);margin-left:2px" title="Você pode gastar fichas antes de escalar; lembre de montar o time depois">escale depois</span>`;
        boostCtrl=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${here}${here&&addBtns?'<span style="opacity:.3">|</span>':""}${addBtns}
          ${myChips.length?`<span style="font-weight:800;color:${sumPct<0?"#FF6B6B":mm.color};font-size:13px;margin-left:2px">=${sumPct<0?"":"+"}${sumPct}%</span>`:""}
          ${dica}
        </div>`;
      }
    }
    // controle de CONFIANÇA: ordenar jogos por confiança (setas ↑/↓), mostra multiplicador
    // controle de PREVISÃO: cravar placar (inputs home x away)
    let extraCtrl="";
    if(isConf&&!finished){
      const visualOrder=APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft:null;
      const draftRank=visualOrder?visualOrder.indexOf(rid):null;
      const myRank=draftRank!=null&&draftRank>=0?draftRank:confRankOf(rid);                  // posição na ordem (0-based) ou null
      const total=visualOrder?visualOrder.length:confRankedCount();
      if(bLocked){
        extraCtrl=myRank!=null?`<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:${mm.color}">📊 ${myRank+1}º confiança · <span>${confMultiplier(myRank,total).toFixed(2)}x</span></span>`:`<span style="font-size:11px;color:var(--dim)">sem ordem</span>`;
      }else{
        if(myRank==null){
          extraCtrl=`<button style="border-radius:8px;border:1px dashed ${mm.color};background:transparent;color:${mm.color};font-size:11px;font-weight:800;padding:5px 10px;cursor:pointer" onclick="event.stopPropagation();confAdd('${rid}')">+ pôr na minha ordem de confiança</button>`;
        }else{
          const mult=confMultiplier(myRank,total);
          const held=APP.confDrag===rid;
          if(APP.confOrderMode){
            extraCtrl=`<div style="display:flex;flex-direction:column;gap:8px;width:100%">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span data-conf-pos="${rid}" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:${mm.color};border:1px solid ${mm.color};border-radius:8px;padding:4px 9px;background:color-mix(in srgb,${mm.color} 14%,transparent)">📊 ${myRank+1}º · ${mult.toFixed(2)}x</span>
                ${held?`<span class="confhint">arrastando...</span>`:`<span class="confhint">segure o card e arraste</span>`}
              </div>
              <div class="confgrab" style="border-color:${mm.color};color:${mm.color}">↕ Card inteiro arrastável</div>
            </div>`;
          }else{
            extraCtrl=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span data-conf-pos="${rid}" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:${mm.color};border:1px solid ${mm.color};border-radius:8px;padding:4px 9px;background:color-mix(in srgb,${mm.color} 14%,transparent)">📊 ${myRank+1}º · ${mult.toFixed(2)}x</span>
              <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Mais confiança" onclick="event.stopPropagation();confMove('${rid}',-1)">↑</button>
              <button class="cbtn" style="position:static;width:30px;height:30px;color:${mm.color};border-color:${mm.color}" title="Menos confiança" onclick="event.stopPropagation();confMove('${rid}',1)">↓</button>
              <button class="cbtn" style="position:static;width:30px;height:30px;color:var(--red);border-color:var(--red)" title="Tirar da ordem" onclick="event.stopPropagation();confRemove('${rid}')">×</button>
            </div>`;
          }
        }
      }
    }
    if(isPred&&!finished){
      const pr=predOf(rid); // {home,away} ou null
      const predLocked=locked; // trava por jogo: junto com a escalação daquele jogo
      if(predLocked){
        extraCtrl=pr?`<span style="font-size:13px;font-weight:800;color:${mm.color}">🔮 cravou ${pr.home} × ${pr.away}</span>`:`<span style="font-size:11px;color:var(--dim)">sem palpite</span>`;
      }else if(team){
        const hc=g.prepool.home.code,ac=g.prepool.away.code;
        extraCtrl=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--dim)">🔮 seu placar:</span>
          <span style="font-weight:800;font-size:12px;color:var(--chalk)">${esc(hc)}</span>
          <input type="number" inputmode="numeric" min="0" value="${pr&&pr.home!=null?pr.home:""}" placeholder="-" style="width:42px;text-align:center;padding:5px;border-radius:8px;border:1px solid ${mm.color};background:var(--panel2);color:var(--chalk);font-weight:800" onclick="event.stopPropagation()" onchange="predSet('${rid}',this.value,null)" />
          <span style="color:var(--dim)">×</span>
          <input type="number" inputmode="numeric" min="0" value="${pr&&pr.away!=null?pr.away:""}" placeholder="-" style="width:42px;text-align:center;padding:5px;border-radius:8px;border:1px solid ${mm.color};background:var(--panel2);color:var(--chalk);font-weight:800" onclick="event.stopPropagation()" onchange="predSet('${rid}',null,this.value)" />
          <span style="font-weight:800;font-size:12px;color:var(--chalk)">${esc(ac)}</span>
        </div>`;
      }else{
        extraCtrl=`<span class="statuspill st-finished" style="opacity:.7">escale p/ cravar placar</span>`;
      }
    }
    // bloco de admin (separado, com divisória sutil)
    let devBlock="";
    if(isAdmin()){
      const devLocked=adminLocked;
      // o cadeado continua clicável mesmo após o jogo começar (admin libera o espiar quando quiser)
      const lockBtn=`<span onclick="event.stopPropagation();setRoundRoomStatus('${rid}','${devLocked?"open":"locked"}')" style="cursor:pointer;font-size:19px;padding:4px;opacity:${devLocked?"1":".6"}" title="${devLocked?"Destravar escalação (liberar p/ todos)":"Travar escalação (libera o espiar p/ todos)"}">${devLocked?"🔓":"🔒"}</span>`;
      devBlock=`<div style="display:flex;gap:14px;align-items:center;margin-left:10px;padding-left:10px;border-left:1px solid var(--line);flex-shrink:0">
        ${lockBtn}
        <span onclick="event.stopPropagation();delRoomFromRound('${rid}')" style="cursor:pointer;font-size:17px;padding:4px;opacity:.45" title="Remover jogo da mini rodada">🗑</span>
      </div>`;
    }
    const confOrdering=isConf&&!finished&&!bLocked&&APP.confOrderMode;
    if(confOrdering){
      clickable=false;
      tag=`<span class="statuspill st-finished" style="cursor:pointer;color:var(--blue);border:1px solid var(--blue);background:color-mix(in srgb,var(--blue) 16%,transparent)" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation();askEnterRoundGame('${rid}')">${team?"EDITAR TIME":"MONTAR TIME"}</span>`;
      meta=team?"time montado · arraste para mudar a confiança":"toque em montar time · arraste para ordenar";
    }
    const lineCtrl=isBoost?boostCtrl:(isConf||isPred?extraCtrl:"");
    const hasLineCtrl=(isBoost||isConf||isPred)&&!finished&&lineCtrl;
    const confRanked=isConf&&confRankOf(rid)!=null&&!finished&&!bLocked;
    const confDragAttrs=confRanked?`data-conf-room="${rid}"`:"";
    return `<div class="roomrow ${confRanked?"confpick":""} ${confOrdering?"confordercard":""} ${APP.confDrag===rid?"confheld confghost":""}" ${confDragAttrs} ${confOrdering?`onpointerdown="confCardPointerStart('${rid}',event)"`:""} ${clickable||finished?`onclick="roundGameClick('${rid}')"`:""} style="border-left:3px solid ${mm.color};${clickable||finished?"":"cursor:default"};${hasLineCtrl?"flex-direction:column;align-items:stretch":""}">
      <div style="display:flex;align-items:flex-start;gap:8px;width:100%">
        <div class="info" style="flex:1;min-width:0"><div class="nm">${esc(j.match_name)}</div><div class="meta">${meta}</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">${tag}${playerBtn||""}${(!isBoost&&!isConf&&!isPred)?boostCtrl:""}${devBlock}</div>
      </div>
      ${hasLineCtrl?`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">${lineCtrl}</div>`:""}
    </div>`;
  }).join("");
  const foraAll=APP.jogos.filter(j=>!APP.roundRooms.some(rr=>rr.room_id===j.room_id)&&!isArchived(j.room_id));
  const addTab=APP.addGameTab||"open"; // 'open' | 'done'
  const foraOpen=foraAll.filter(j=>!roomIsFinished(j.room_id));
  const foraDone=foraAll.filter(j=>roomIsFinished(j.room_id));
  const fora=addTab==="done"?foraDone:foraOpen;
  const addTabsHTML=`<div style="display:flex;gap:6px;margin:14px 0 8px">
    <span onclick="setAddGameTab('open')" style="cursor:pointer;font-size:11px;font-weight:800;padding:5px 12px;border-radius:99px;border:1px solid ${addTab==="open"?mm.color:"var(--line)"};color:${addTab==="open"?mm.color:"var(--dim)"};background:${addTab==="open"?`color-mix(in srgb,${mm.color} 14%,transparent)`:"transparent"}">Em aberto (${foraOpen.length})</span>
    <span onclick="setAddGameTab('done')" style="cursor:pointer;font-size:11px;font-weight:800;padding:5px 12px;border-radius:99px;border:1px solid ${addTab==="done"?mm.color:"var(--line)"};color:${addTab==="done"?mm.color:"var(--dim)"};background:${addTab==="done"?`color-mix(in srgb,${mm.color} 14%,transparent)`:"transparent"}">Finalizadas (${foraDone.length})</span>
  </div>`;
  const foraRows=fora.map(j=>{const fin=roomIsFinished(j.room_id);return `<div class="roomrow" onclick="addRoomToRound('${j.room_id}')">
    <div class="info"><div class="nm">${esc(j.match_name)}</div><div class="meta">${fin?"jogo finalizado · ":""}toque para adicionar à mini rodada</div></div>
    <span class="statuspill ${fin?"st-finished":"st-closed"}">+ ADD</span></div>`;}).join("");
  // banner explicativo por modo
  let banner;
  if(isBoost){
    const pool=poolChips();
    const cap=pool.length;
    const bConf=boostConfirmed();
    const avail=chipsAvailable();
    const mx=boostMaxPerGame(),mg=boostMinGames();
    // mostra as fichas que ainda restam, com cor
    const availPills=avail.sort((a,b)=>b-a).map(v=>{const neg=v<0,col=neg?"#FF6B6B":mm.color;return `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:${col};border:1px solid ${col};border-radius:8px;padding:3px 8px;background:color-mix(in srgb,${col} 16%,transparent)">⚡${neg?v:"+"+v}%</span>`;}).join(" ");
    const temNeg=pool.some(v=>v<0);
    let regras=[];
    if(mx>0)regras.push(`até ${mx} por partida`);
    if(mg>0)regras.push(`gaste em pelo menos ${mg} partidas diferentes`);
    if(temNeg)regras.push(`fichas <span style="color:#FF6B6B">vermelhas são negativas</span> e também precisam ser usadas`);
    if(boostNoMix())regras.push(`<span style="color:#FF6B6B">não misture</span> positivas e negativas no mesmo jogo`);
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Impulso.</b> Escale TODOS os jogos e distribua suas <b>${cap}</b> ficha(s) nas partidas. Cada ficha aplica seu % nos pontos daquela partida.${regras.length?` Regras: ${regras.join(" · ")}.`:""} ${bLocked?"<b>Impulsos travados</b> (a 1ª partida foi fechada).":`Fichas restantes: ${availPills||"<b>nenhuma — tudo distribuído ✓</b>"}`}</div>
      ${!bLocked?`<button class="btn ${bConf?"ghost":""}" style="margin:0 0 12px;${bConf?"border-color:var(--green);color:var(--green)":"background:#FFC247;color:#0A0E1C"}" onclick="toggleBoostConfirm()">${bConf?"✓ Impulsos confirmados — toque p/ reabrir":"🔒 Confirmar distribuição de impulsos"}</button>`:""}
      ${(!bLocked&&avail.length>0)?`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 14%,transparent);color:var(--red);margin:0 0 12px;font-weight:700">⚠️ ATENÇÃO: você ainda tem <b>${avail.length}</b> ficha(s) sem usar. Se a 1ª partida for fechada antes de você gastar TODAS, você será <b>ELIMINADO</b> e zera a mini rodada inteira. Distribua tudo!</div>`:""}`;
  }else if(isConf){
    const bConf=boostConfirmed();
    const draftIds=APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft:null;
    const ranked=draftIds?draftIds.length:confRankedCount();
    const totalGames=APP.roundRooms.length;
    const ordIds=draftIds?draftIds:confOrdered().map(e=>e.room_id);
    // multiplicadores reais desta rodada (dependem de quantos jogos foram ordenados)
    const topMult=ranked>0?confMultiplier(0,ranked):1;
    const lowMult=ranked>1?confMultiplier(ranked-1,ranked):1;
    // mini resumo da ordem atual
    const ordList=ordIds.map((roomId,i)=>{const g=window.GAMES.data[roomId];const nm=g?g.prepool.home.code+"×"+g.prepool.away.code:"?";const mult=confMultiplier(i,ranked);return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;color:${mm.color};border:1px solid ${mm.color};border-radius:8px;padding:2px 7px;background:color-mix(in srgb,${mm.color} 14%,transparent)">${i+1}º ${esc(nm)} ${mult.toFixed(2)}x</span>`;}).join(" ");
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Confiança.</b> Coloque os jogos em ordem de confiança: do 1º (mais confia) ao último — dá pra ordenar antes de escalar. Os pontos de cada jogo são multiplicados pela posição — quem está no topo rende mais, quem está embaixo rende menos. A escalação de cada jogo é livre até aquela partida começar. ${ranked>1?`Nesta rodada: 1º vale <b>${topMult.toFixed(2)}x</b>, último vale <b>${lowMult.toFixed(2)}x</b>.`:""} ${bLocked?"<b>Ordem travada</b> (a 1ª partida foi fechada).":`Você ordenou <b>${ranked}/${totalGames}</b>.`}
      ${ordIds.length?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${ordList}</div>`:""}</div>
      ${!bLocked?`<div class="conforderbar">
        <div style="font-size:12px;line-height:1.35"><b>${APP.confOrderMode?"Modo ordenar ligado":"Quer ordenar mais fácil?"}</b><br><span style="color:var(--dim)">${APP.confOrderMode?"Segure qualquer card e arraste para cima/baixo.":"Toque aqui para transformar a lista em arrastável."}</span></div>
        <button class="btn sm" style="background:${APP.confOrderMode?"transparent":mm.color};color:${APP.confOrderMode?mm.color:"#0A0E1C"};border:${APP.confOrderMode?`1px solid ${mm.color}`:"none"};white-space:nowrap" onclick="${APP.confOrderMode?"confStopOrdering()":"confStartOrdering()"}">${APP.confOrderMode?"Sair":"Ordenar"}</button>
      </div>`:""}
      ${!bLocked?`<button class="btn ${bConf?"ghost":""}" style="margin:0 0 12px;${bConf?"border-color:var(--green);color:var(--green)":"background:"+mm.color+";color:#0A0E1C"}" onclick="toggleBoostConfirm()">${bConf?"✓ Ordem confirmada — toque p/ reabrir":"🔒 Confirmar ordem de confiança"}</button>`:""}
      ${(!bLocked&&ranked<totalGames)?`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 14%,transparent);color:var(--red);margin:0 0 12px;font-weight:700">⚠️ ATENÇÃO: você ordenou só <b>${ranked}/${totalGames}</b> jogos. Se a 1ª partida for fechada antes de você ordenar TODOS, você será <b>ELIMINADO</b> e zera a mini rodada inteira. Ordene todos os jogos!</div>`:""}`;
  }else if(isPred){
    const totalGames=APP.roundRooms.length;
    const feitos=(APP.roundEntries||[]).filter(e=>e.pred_home!=null&&e.pred_away!=null).length;
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">
      ${mm.icon} <b>Modo Previsão.</b> Escale TODOS os jogos e crave o placar de cada um. Além dos pontos da escalação: <b>+${PRED_RESULT_PCT}%</b> por acertar o resultado (vitória/empate/derrota) e <b>+${PRED_EXACT_PCT}%</b> por cravar o placar exato. Você cravou <b>${feitos}/${totalGames}</b>. A escalação e o palpite de cada jogo travam quando aquela partida for fechada.</div>`;
  }else if(mode==="zebra"){
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Zebra.</b> Escale TODOS os jogos. Jogadores do time com menor ELO em cada partida ganham <b>+25%</b> sobre seus pontos positivos na classificação da mini rodada.</div>`;
  }else if(mode==="sobrevivencia"){
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Sobrevivência.</b> Escale TODOS os jogos. Se algum jogo seu terminar negativo, você zera a mini rodada. Se todos sobreviverem, seu pior jogo é descartado.</div>`;
  }else if(mode==="capitaoduplo"){
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Capitão Duplo.</b> Escale TODOS os jogos. Seu capitão recebe reforço extra na classificação, funcionando como <b>1.4x</b> no total.</div>`;
  }else if(mode==="full"){
    banner=`<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Completo.</b> Escale TODOS os jogos da rodada. Sua pontuação é a soma de todos. Cada escalação trava quando aquela partida começar.</div>`;
  }else{
    banner=selLocked
      ? `<div class="prebox" style="border-color:#3a2e10">🔒 <b>Seleção fechada.</b> Os jogos que você travou estão valendo. A escalação de cada um ainda pode mudar até a partida começar.</div>`
      : `<div class="prebox" style="border-color:${mm.color};background:color-mix(in srgb,${mm.color} 10%,transparent);color:${mm.color}">${mm.icon} <b>Modo Selecione.</b> Monte o time de quantos jogos quiser, mas só <b>${r.pick_limit}</b> vão contar: <b>trave (🔒)</b> os que você quer que valham. Dá pra destravar e trocar enquanto a seleção estiver aberta. <b>${used}/${r.pick_limit}</b> travados. A escalação dos travados ainda muda até o jogo começar.</div>`;
  }
  // alerta vermelho: modo select, seleção aberta, e o usuário travou MENOS que o limite
  let selWarn="";
  if(isSelect&&!selLocked&&used<r.pick_limit){
    const faltam=r.pick_limit-used;
    selWarn=`<div class="prebox" style="border-color:var(--red);background:color-mix(in srgb,#FF6B6B 12%,transparent);color:var(--red);margin-top:-2px">⚠️ <b>Atenção:</b> você travou <b>${used}</b> de <b>${r.pick_limit}</b> jogos. ${faltam===1?"Falta travar <b>1</b> jogo":`Faltam travar <b>${faltam}</b> jogos`} pra usar todos os seus tokens. Jogos <b>não travados não pontuam</b> — trave (🔒) antes da seleção fechar!</div>`;
  }
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div class="h1 disp" style="color:${mm.color}">${esc(r.name)}</div>
      <div class="userchip" onclick="leaveRound()" style="cursor:pointer">← voltar</div>
    </div>
    <div style="margin-bottom:10px"><span style="display:inline-flex;align-items:center;gap:5px;font-family:'Saira Condensed';font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${mm.color};border:1px solid ${mm.color};background:color-mix(in srgb,${mm.color} 14%,transparent);border-radius:99px;padding:3px 10px">${mm.icon} ${mm.label}</span></div>
    ${banner}
    ${selWarn}
    ${rows||'<p class="p">Nenhum jogo nesta rodada ainda.</p>'}
  </div>
  ${roundTodoHTML()}
  ${roundFeedHTML()}
  ${roundRankingHTML()}
  ${isAdmin()?`<div class="card">
    <div class="tag" style="margin-bottom:6px">ADMIN · RODADA</div>
    <p class="p" style="margin-bottom:8px">${isSelect?"1) Antes da 1ª partida, feche a <b>seleção de jogos</b>. 2) Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha).":"Quando cada partida começar, trave a <b>escalação daquele jogo</b> (🔒 na linha). "+(isBoost?"A distribuição de impulsos trava sozinha quando a 1ª partida é fechada.":isConf?"A ordem de confiança trava sozinha quando a 1ª partida é fechada.":isPred?"No modo Previsão, o palpite de cada jogo trava junto com a escalação daquela partida.":"")}</p>
    ${isSelect?(selLocked
      ? `<button class="btn ghost" onclick="setRoundStatus('open')">🔓 Reabrir seleção de jogos</button>`
      : `<button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setRoundStatus('locked_picks')">🔒 Fechar seleção de jogos</button>`):""}
    ${(isBoost||isConf)?(()=>{
      const nome=isConf?"ordem de confiança":"distribuição de impulsos";
      const travada=boostLocked();
      const auto=anyGameLockedInRound(); // alguma partida fechou (trava automática)
      if(travada){
        // travada (auto ou forçada) → só o dev reabre
        return `<div style="margin-top:10px">
          <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="setDistribLock(false)">${mm.icon} Reabrir ${nome}</button>
          <p class="p" style="font-size:11px;color:var(--dim);margin-top:6px">A ${nome} está <b>travada</b>${auto?" (uma partida já foi fechada)":" (você fechou manualmente)"}. Os jogadores não conseguem editar. ⚠️ Reabrir após uma partida começar permite remanejar vendo como os jogos estão indo — use só se combinado com o grupo.</p>
        </div>`;
      }else{
        // aberta → dev pode forçar o fechamento antes da hora
        return `<div style="margin-top:10px">
          <button class="btn ghost" style="color:var(--amber);border-color:var(--amber)" onclick="setDistribLock(true)">🔒 Fechar ${nome} agora</button>
          <p class="p" style="font-size:11px;color:var(--dim);margin-top:6px">A ${nome} trava sozinha quando a 1ª partida for fechada. Use este botão se quiser travar antes disso.</p>
        </div>`;
      }
    })():""}
    ${foraAll.length?`<div class="tag" style="margin:14px 0 6px">ADICIONAR JOGOS À MINI RODADA</div>${addTabsHTML}${foraRows||`<p class="p" style="font-size:11px;color:var(--dim)">Nenhum jogo ${addTab==="done"?"finalizado":"em aberto"} pra adicionar.</p>`}`:""}
  </div>`:""}`;
}


function roomHTML(){
  const pp=APP.prepool, m=APP.match, meta=APP.roomMeta;
  const finished=m&&m.status==="finished";
  const open=meta.status==="open";
  return `<div class="scorebar">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="tag">${esc(pp.comp)} · ${esc(pp.venue||"")}</div>
      <div class="userchip" onclick="${APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId)?`go('round',null,'${APP.roundId}')`:"go('home')"}" style="cursor:pointer;flex-shrink:0">← voltar</div>
    </div>
    <div class="score disp">
      <div><div class="team">${esc(pp.home.name)}</div><div class="elo mono">ELO ${pp.home.elo}</div></div>
      <div class="vs mono">${finished?m.score[0]+"–"+m.score[1]:"VS"}</div>
      <div style="text-align:right"><div class="team">${esc(pp.away.name)}</div><div class="elo mono">ELO ${pp.away.elo}</div></div>
    </div></div>
  <div class="card">
    ${open?`<div class="prebox">⏳ <b>Pool aberta.</b> Monte seu time com o elenco dos dois países. Quem não entrar em campo fica com 0 pontos.</div>`:""}
    ${finished?`<div class="ok">✓ Jogo finalizado — veja o ranking e a apuração detalhada.</div>`:""}
    ${!open&&!finished?`<div class="prebox">🔒 Pool fechada, aguardando o jogo terminar.</div>`:""}
    <div style="display:flex;gap:8px;margin-top:8px">
      ${open?`<button class="btn" onclick="go('build')">${hasEntry()?"Editar meu time":"Montar meu time"}</button>`:""}
      ${!open&&!finished&&hasEntry()?`<button class="btn" onclick="go('build')">👀 Ver meu time escalado</button>`:""}
      ${finished?`<button class="btn" onclick="go('result')">Ver ranking & resultado</button>`:""}
    </div>
    ${(!finished&&open&&hasEntry())?othersEnteredHTML():""}
    ${!finished&&!open?peekTeamsHTML():""}
    ${isAdmin()&&!finished?`<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
      <div class="tag" style="margin-bottom:6px">ADMIN</div>
      ${open
        ?`<button class="btn ghost" onclick="setPoolStatus('closed')">🔒 Fechar pool (trava as escalações)</button>`
        :`<button class="btn ghost" onclick="setPoolStatus('open')">🔓 Reabrir pool</button>`}
      <button class="btn ghost" style="margin-top:8px;color:var(--red);border-color:var(--red)" onclick="resetRoom()">🧹 Limpar times desta sala</button>
      <button class="btn" style="margin-top:8px;background:var(--green);color:#04140d;font-weight:800" onclick="abrirApuracao('${APP.roomId}')">⚙️ Apurar jogo (colar resultado)</button>
    </div>`:""}
  </div>`;
}
async function setPoolStatus(status){
  if(!isAdmin())return;
  try{
    // reopened=true só quando o admin REABRE de propósito (vence a trava por horário em todos os modos).
    // ao fechar, reopened volta a false.
    const reopened = status==="open";
    await sbUpdate("group_rooms",{status,reopened},`group_id=eq.${APP.groupId}&room_id=eq.${APP.roomId}`);
    APP.roomMeta.status=status;
    // PROPAGA: travar/destravar a pool avulsa também trava/destrava o MESMO jogo nas mini rodadas DESTE grupo
    const rrStatus=status==="closed"?"locked":"open";
    let propagou=0;
    try{
      if(!APP.rounds||!APP.rounds.length){try{await loadRounds();}catch(e){}}
      const myRoundIds=(APP.rounds||[]).map(r=>r.id);
      if(myRoundIds.length){
        const inList="("+myRoundIds.join(",")+")";
        const res=await sbUpdate("round_rooms",{status:rrStatus,reopened},`room_id=eq.${encodeURIComponent(APP.roomId)}&round_id=in.${inList}`);
        propagou=(res&&res.length)||0;
      }
    }catch(e){/* se round_rooms não permitir, segue só com a avulsa */}
    await loadGroupRooms();
    toast(status==="closed"
      ? `Pool fechada.${propagou?` Este jogo também travou em ${propagou} mini rodada(s).`:""}`
      : `Pool reaberta.${propagou?` Destravado nas mini rodadas.`:""}`);
    render();
  }catch(e){toast("Erro ao mudar status: "+e.message);}
}
// ── ESPIAR TIMES DOS MEMBROS (só com pool fechada e jogo não finalizado) ──
let _openPeek={};
function togglePeek(i){_openPeek[i]=!_openPeek[i];render();}
function othersEnteredHTML(){
  const me=APP.user?.username;
  const outros=(APP.entries||[]).filter(e=>e.username!==me&&e.slots&&Object.values(e.slots).some(Boolean)).map(e=>e.username);
  if(!outros.length)return `<div class="prebox" style="margin-top:10px;font-size:12px">Você montou seu time. Ninguém mais escalou ainda — quando alguém montar, aparece aqui (sem mostrar o time).</div>`;
  const nomes=outros.map(n=>`<b style="color:var(--chalk)">${esc(n)}</b>`).join(", ");
  const verbo=outros.length===1?"também montou um time":"também montaram um time";
  return `<div class="prebox" style="margin-top:10px;font-size:12px">👥 ${nomes} ${verbo}. O time de cada um fica escondido até a partida começar — aí você pode espiar.</div>`;
}
function peekTeamsHTML(){
  const ents=(APP.entries||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean));
  const byId=APP._byId;
  const TAC=window.ENGINE_TACTICS;
  // contexto de modo: se estou vendo um jogo dentro de uma rodada, mostro a estratégia revelada
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const rmode=inRound?modeOf(APP.round):null;
  const pp=APP.prepool;
  // total de jogos ordenados por usuário (pra calcular o multiplicador de confiança exibido)
  let confTot={};
  if(rmode==="confianca"){(APP.roundAllEntries||[]).forEach(e=>{if(e.conf_rank!=null){confTot[e.username]=(confTot[e.username]||0)+1;}});}
  let html=`<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)">
    <div class="h2 disp">👀 Times dos membros</div>
    <p class="p" style="margin:6px 0 10px">O jogo foi fechado — agora dá pra ver o que cada um escalou${rmode==="confianca"?", e a posição que deram a este jogo na ordem de confiança":rmode==="previsao"?", e o placar que cada um cravou":""}. As pontuações aparecem quando o jogo acabar.</p>`;
  if(!ents.length){html+=`<p class="p">Ninguém montou time neste jogo.</p></div>`;return html;}
  ents.forEach((e,i)=>{
    const open=_openPeek[i];
    const isMe=e.username===APP.user?.username;
    // tag de estratégia revelada
    let stratTag="";
    if(rmode==="confianca"&&e.conf_rank!=null){
      const tot=confTot[e.username]||1;
      stratTag=`<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:800;color:#C77DFF;border:1px solid #C77DFF;border-radius:6px;padding:1px 6px">📊 ${e.conf_rank+1}º · ${confMultiplier(e.conf_rank,tot).toFixed(2)}x</span>`;
    }else if(rmode==="previsao"&&e.pred_home!=null&&e.pred_away!=null){
      stratTag=`<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:800;color:#54E0A8;border:1px solid #54E0A8;border-radius:6px;padding:1px 6px">🔮 ${esc(pp.home.code)} ${e.pred_home}–${e.pred_away} ${esc(pp.away.code)}</span>`;
    }
    html+=`<div class="receipt"><div class="rhead" onclick="togglePeek(${i})">
      <div class="nm">${esc(e.username)}${isMe?" <small>(você)</small>":""}${stratTag}<small>· cap ${SLOT_LABEL[e.captain]||"?"} · ${TAC[e.tactic]?.name||e.tactic||"—"}</small></div>
      <div class="tot mono" style="color:var(--dim);font-size:14px">${open?"▲":"▼"}</div></div>`;
    html+=`<div class="expandable ${open?"open":""}"><div class="rbody">`;
    if(open){
      ["GK","DEF","MID","ATT","FLEX","BENCH"].forEach(sl=>{
        const pid=e.slots[sl];const pl=pid?byId[pid]:null;
        if(!pl){html+=`<div class="line" style="padding:5px 0"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[sl]}</b> <span style="color:#46537a">—</span></span></div>`;return;}
        const isCap=e.captain===sl;
        const posKey=sl==="BENCH"?pl.pos:sl;
        html+=`<div class="line" style="padding:5px 0"><span><b class="pc-${posKey}" style="font-size:9px">${SLOT_LABEL[sl]}</b> ${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</span></div>`;
      });
    }
    html+=`</div></div>`;
    html+=`</div>`;
  });
  html+=`</div>`;
  return html;
}

// ---------- MANUTENÇÃO / RESET (admin) ----------
// APP.confirm = {word, label, action} controla o modal de confirmação por texto
function askConfirm(word,label,action,msg){APP.confirm={word,label,action,msg,typed:""};render();}
function closeConfirm(){APP.confirm=null;render();}
function confirmInput(v){if(APP.confirm)APP.confirm.typed=v;}
// editor de fichas de impulso (dev monta a economia da pool)
// valida se uma pool com 'não misturar fichas +/−' é cumprível.
// retorna {ok:true} ou {ok:false, msg:"..."}. J = nº de jogos da pool (todos, pois Impulso escala todos).
function boostFeasibility(chips,maxPerGame,noMix){
  const nPos=chips.filter(v=>v>0).length, nNeg=chips.filter(v=>v<0).length;
  const J=(APP.jogos||[]).length||0;
  const mx=maxPerGame>0?maxPerGame:Infinity;
  // sem a regra de não-misturar, basta caber o total respeitando o teto por jogo
  if(!noMix){
    const need=mx===Infinity?(chips.length?1:0):Math.ceil(chips.length/mx);
    if(J>0&&need>J)return {ok:false,msg:`Com até ${maxPerGame} ficha(s) por partida e ${chips.length} ficha(s), seriam necessárias ${need} partidas, mas a pool só tem ${J}.`};
    return {ok:true};
  }
  // com não-misturar: positivas e negativas ocupam jogos separados
  const needPos=nPos?(mx===Infinity?1:Math.ceil(nPos/mx)):0;
  const needNeg=nNeg?(mx===Infinity?1:Math.ceil(nNeg/mx)):0;
  const need=needPos+needNeg;
  if(J>0&&need>J){
    return {ok:false,msg:`Sem misturar fichas, as ${nPos} positiva(s) precisam de ${needPos} partida(s) e as ${nNeg} negativa(s) de mais ${needNeg} — total ${need}, mas a pool só tem ${J} partida(s). Aumente o "máx. por partida", reduza fichas, ou desligue "não misturar".`};
  }
  return {ok:true};
}
function boostBuilderHTML(c){
  const chips=c.chips||(c.chips=[15,15]); // default: 2 fichas de +15%
  const maxPer=c.boostMaxPerGame!=null?c.boostMaxPerGame:0;
  const minG=c.boostMinGames!=null?c.boostMinGames:0;
  const noMix=!!c.boostNoMix;
  // aviso de viabilidade (bloqueia salvar se impossível)
  const feas=boostFeasibility(chips.map(v=>Number(v)||0).filter(v=>v!==0),maxPer,noMix);
  const feasMsg=feas.ok?"":`<p class="p" style="font-size:11px;margin:8px 0 0;color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);border:1px solid var(--red);border-radius:8px;padding:7px 9px">⚠️ ${feas.msg}</p>`;
  const chipRow=chips.map((v,i)=>{
    const neg=v<0;const col=neg?"#FF6B6B":"#FFC247";
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <span style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:2px solid ${col};color:${col};background:color-mix(in srgb,${col} 16%,transparent)">⚡</span>
      <input class="input" type="number" inputmode="numeric" style="flex:1;margin:0" value="${v}" onclick="event.stopPropagation()" onchange="setChipValue(${i},this.value)" />
      <span style="font-size:11px;color:${col};width:54px">${neg?"NEGATIVA":"+"+v+"%"}</span>
      <button class="cbtn" style="position:static;width:28px;height:28px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();removeChip(${i})">×</button>
    </div>`;
  }).join("");
  const totalPos=chips.filter(v=>v>0).length, totalNeg=chips.filter(v=>v<0).length;
  return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px">
    <p class="p" style="font-size:11px;margin:0 0 8px;color:#FFC247">Monte as fichas desta pool. Cada ficha tem seu valor — use número negativo pra criar uma ficha "ruim" (vermelha) que o jogador é obrigado a gastar.</p>
    ${chipRow||'<p class="p" style="font-size:11px">Nenhuma ficha ainda.</p>'}
    <div style="display:flex;gap:6px;margin-top:6px">
      <button class="btn ghost" style="margin:0;flex:1;font-size:12px" onclick="event.stopPropagation();addChip(15)">+ Ficha positiva</button>
      <button class="btn ghost" style="margin:0;flex:1;font-size:12px;color:#FF6B6B;border-color:#FF6B6B" onclick="event.stopPropagation();addChip(-15)">+ Ficha negativa</button>
    </div>
    <p class="p" style="font-size:10px;margin:8px 0 4px;color:var(--dim)">${chips.length} ficha(s): ${totalPos} positiva(s)${totalNeg?`, ${totalNeg} negativa(s)`:""}.</p>
    <div style="display:flex;gap:8px;margin-top:6px">
      <div style="flex:1"><p class="p" style="font-size:10px;margin:0 0 2px">Máx. por partida (0=livre)</p><input class="input" type="number" inputmode="numeric" min="0" style="margin:0" value="${maxPer}" onclick="event.stopPropagation()" onchange="APP.confirm.boostMaxPerGame=parseInt(this.value,10)||0;renderKeepScroll()" /></div>
      <div style="flex:1"><p class="p" style="font-size:10px;margin:0 0 2px">Mín. de partidas (0=livre)</p><input class="input" type="number" inputmode="numeric" min="0" style="margin:0" value="${minG}" onclick="event.stopPropagation()" onchange="APP.confirm.boostMinGames=parseInt(this.value,10)||0;renderKeepScroll()" /></div>
    </div>
    ${totalNeg?`<div onclick="toggleNoMix()" style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer">
      <span style="width:34px;height:20px;border-radius:99px;background:${noMix?"#FF6B6B":"var(--line)"};position:relative;flex-shrink:0;transition:.15s"><span style="position:absolute;top:2px;left:${noMix?"16px":"2px"};width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s"></span></span>
      <span style="font-size:11px;color:${noMix?"#FF6B6B":"var(--dim)"};font-weight:${noMix?"700":"400"}">Não misturar fichas + e − no mesmo jogo</span>
    </div>${noMix?`<p class="p" style="font-size:10px;margin:4px 0 0;color:var(--dim)">Cada partida só aceita fichas positivas OU negativas. A negativa "contamina" o jogo — não dá pra anular com positiva.</p>`:""}`:""}
    ${feasMsg}
  </div>`;
}
function addChip(v){if(!APP.confirm)return;_syncCreateName();(APP.confirm.chips=APP.confirm.chips||[]).push(v);renderKeepScroll();}
function removeChip(i){if(!APP.confirm||!APP.confirm.chips)return;_syncCreateName();APP.confirm.chips.splice(i,1);renderKeepScroll();}
function setChipValue(i,val){if(!APP.confirm||!APP.confirm.chips)return;let v=parseInt(val,10);if(isNaN(v))v=0;APP.confirm.chips[i]=v;renderKeepScroll();}
function toggleNoMix(){if(!APP.confirm)return;_syncCreateName();APP.confirm.boostNoMix=!APP.confirm.boostNoMix;renderKeepScroll();}
function _syncCreateName(){if(!APP.confirm)return;const n=$("rndName")||$("renameInput");if(n){if(APP.confirm.mode==="rename")APP.confirm.cur=n.value;else APP.confirm.draftName=n.value;}}
function modePreviewHTML(mk){
  const mm=MODE_META[mk]||MODE_META.full;
  if(mk==="boost"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Impulso</div>
      <div class="pvtext">Todos os jogos valem. A decisão é onde colocar suas fichas de risco antes dos resultados.</div>
      <div class="previewgame"><div class="pvname"><div>Argentina × Áustria</div><div class="pvmeta">escalação montada · você confia no ataque</div></div><span class="previewpill" style="background:#3a2e10;color:${mm.color}">+25%</span></div>
      <div class="previewgame"><div class="pvname"><div>Espanha × Arábia Saudita</div><div class="pvmeta">favorita, mas pool caro</div></div><span class="previewpill" style="background:#3a2e10;color:${mm.color}">+15%</span></div>
      <div class="previewgame"><div class="pvname"><div>Bélgica × Irã</div><div class="pvmeta">ficha negativa para cumprir regra</div></div><span class="previewpill" style="background:#35191f;color:var(--red)">-20%</span></div>
      <div class="previewcalc">Exemplo: 42.8 pts com +25% viram <b style="color:${mm.color}">53.5 pts</b>. 31.0 pts com -20% caem para <b style="color:var(--red)">24.8 pts</b>.</div>
    </div>`;
  }
  if(mk==="confianca"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Confiança</div>
      <div class="pvtext">Você ordena os jogos do mais seguro ao mais perigoso. Essa ordem multiplica a pontuação.</div>
      <div class="previewgame"><div class="pvname"><div>1º · Espanha × Arábia Saudita</div><div class="pvmeta">seu jogo mais confiável</div></div><span class="previewpill" style="background:#281d3b;color:${mm.color}">1.36x</span></div>
      <div class="previewgame"><div class="pvname"><div>2º · Argentina × Áustria</div><div class="pvmeta">confiança média</div></div><span class="previewpill" style="background:#1b263b;color:var(--blue)">1.00x</span></div>
      <div class="previewgame"><div class="pvname"><div>3º · Bélgica × Irã</div><div class="pvmeta">mais incerteza</div></div><span class="previewpill" style="background:#35191f;color:var(--red)">0.64x</span></div>
      <div class="previewcalc">Exemplo: 40 pts no 1º jogo viram <b style="color:${mm.color}">54.4</b>. Os mesmos 40 pts no último viram <b style="color:var(--red)">25.6</b>.</div>
    </div>`;
  }
  if(mk==="previsao"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Previsão</div>
      <div class="pvtext">Você escala o time e crava o placar. O bônus entra em cima da sua pontuação naquela partida.</div>
      <div class="previewgame"><div class="pvname"><div>Espanha 3 × 0 Arábia Saudita</div><div class="pvmeta">placar exato</div></div><span class="previewpill" style="background:#123326;color:${mm.color}">+40%</span></div>
      <div class="previewgame"><div class="pvname"><div>Argentina 2 × 1 Áustria</div><div class="pvmeta">acertou só o vencedor</div></div><span class="previewpill" style="background:#123326;color:${mm.color}">+10%</span></div>
      <div class="previewgame"><div class="pvname"><div>Bélgica 1 × 0 Irã</div><div class="pvmeta">errou resultado</div></div><span class="previewpill" style="background:#35191f;color:var(--red)">+0%</span></div>
      <div class="previewcalc">Exemplo: 38.0 pts com placar exato viram <b style="color:${mm.color}">53.2 pts</b>. Com só vencedor certo, viram <b style="color:${mm.color}">41.8 pts</b>.</div>
    </div>`;
  }
  if(mk==="zebra"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Zebra</div>
      <div class="pvtext">A graça é ganhar pontos com jogador de time mais fraco. O favorito ainda vale, mas o azarão dá tempero.</div>
      <div class="previewgame"><div class="pvname"><div>França × Iraque</div><div class="pvmeta">jogadores do Iraque recebem bônus</div></div><span class="previewpill" style="background:#3b2417;color:${mm.color}">+25%</span></div>
      <div class="previewgame"><div class="pvname"><div>Noruega × Senegal</div><div class="pvmeta">quem for menor pelo ELO vira zebra</div></div><span class="previewpill" style="background:#3b2417;color:${mm.color}">azarão</span></div>
      <div class="previewgame"><div class="pvname"><div>Argentina × Áustria</div><div class="pvmeta">favorito pontua normal</div></div><span class="previewpill" style="background:#1b263b;color:var(--blue)">normal</span></div>
      <div class="previewcalc">Exemplo: um jogador da zebra fez 16.0 pts. Ele vira <b style="color:${mm.color}">20.0 pts</b> na classificação da mini rodada.</div>
    </div>`;
  }
  if(mk==="sobrevivencia"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Sobrevivência</div>
      <div class="pvtext">Aqui não basta explodir em um jogo: você precisa passar vivo por todos.</div>
      <div class="previewgame"><div class="pvname"><div>Espanha × Arábia Saudita</div><div class="pvmeta">boa escalação</div></div><span class="previewpill" style="background:#123326;color:${mm.color}">34.0</span></div>
      <div class="previewgame"><div class="pvname"><div>Bélgica × Irã</div><div class="pvmeta">jogo mais fraco, mas positivo</div></div><span class="previewpill" style="background:#123326;color:${mm.color}">8.0</span></div>
      <div class="previewgame"><div class="pvname"><div>Noruega × Senegal</div><div class="pvmeta">se ficar negativo, zera tudo</div></div><span class="previewpill" style="background:#35191f;color:var(--red)">risco</span></div>
      <div class="previewcalc">Se ninguém negativar, o pior jogo é descartado. Se um jogo fechar em negativo, a rodada vira <b style="color:var(--red)">0 pt</b>.</div>
    </div>`;
  }
  if(mk==="capitaoduplo"){
    return `<div class="modepreview" style="border-color:${mm.color}">
      <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview realista · Capitão Duplo</div>
      <div class="pvtext">O modo para quem quer braçadeira valendo mais. Errar o capitão dói; acertar vira diferencial.</div>
      <div class="previewgame"><div class="pvname"><div>Capitão marcou e assistiu</div><div class="pvmeta">pontuação do capitão recebe reforço</div></div><span class="previewpill" style="background:#331a2f;color:${mm.color}">1.4x</span></div>
      <div class="previewgame"><div class="pvname"><div>Capitão apagado</div><div class="pvmeta">o bônus quase não aparece</div></div><span class="previewpill" style="background:#35191f;color:var(--red)">risco</span></div>
      <div class="previewgame"><div class="pvname"><div>Sem craque óbvio</div><div class="pvmeta">a escolha vira parte do jogo</div></div><span class="previewpill" style="background:#1b263b;color:var(--blue)">decisão</span></div>
      <div class="previewcalc">Exemplo: capitão de 18.0 pts ganha reforço extra e adiciona mais <b style="color:${mm.color}">3.0 pts</b> na mini rodada.</div>
    </div>`;
  }
  return `<div class="modepreview" style="border-color:${mm.color}">
    <div class="pvtitle" style="color:${mm.color}">${mm.icon} Preview · Completo</div>
    <div class="pvtext">Todos escalam todos os jogos. Vence quem soma mais pontos na rodada inteira, sem bônus extra.</div>
  </div>`;
}
function confirmModalHTML(){
  const c=APP.confirm;if(!c)return"";
  if(c.mode==="roundSummary"){
    const s=roundStatusSnapshot();
    const mm=modeMeta(APP.round);
    const mode=modeOf(APP.round);
    const lines=[
      ["Escalações",`${s.mounted}/${s.total}`,s.mounted===s.total],
      mode==="boost"?["Fichas restantes",String(s.chipsLeft),s.chipsLeft===0]:null,
      mode==="confianca"?["Ordem",`${s.confDone}/${s.total}`,s.confDone===s.total]:null,
      mode==="previsao"?["Palpites",`${s.predDone}/${s.total}`,s.predDone===s.total]:null,
    ].filter(Boolean);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:${mm.color}">${mm.icon} Confirmar ${esc(mm.label)}</div>
      <p class="p" style="margin:10px 0">Revise antes de travar sua decisão estratégica. Você ainda pode reabrir até a trava da rodada.</p>
      ${lines.map(l=>`<div class="todoitem ${l[2]?"ok":"warny"}"><span>${l[2]?"✓":"!"} ${esc(l[0])}</span><b>${esc(l[1])}</b></div>`).join("")}
      <button class="btn" style="margin-top:12px;background:${mm.color};color:#0A0E1C" onclick="confirmRoundSummary()">Confirmar agora</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Revisar</button>
    </div></div>`;
  }
  // modo: criar grupo (admin)
  if(c.mode==="createGroup"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar grupo de amigos</div>
      <p class="p" style="margin:10px 0">Dê um nome e uma senha. Você repassa a senha pros amigos entrarem.</p>
      <input id="grpName" class="input" placeholder="Nome do grupo" autocorrect="off" />
      <input id="grpPass" class="input" placeholder="Senha do grupo" autocapitalize="off" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreateGroup()">Criar grupo</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: excluir histórico do perfil (exige senha da conta)
  if(c.mode==="hideHistory"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir histórico do perfil</div>
      <p class="p" style="margin:10px 0">Isto oculta do seu perfil todos os times que você montou nos jogos encerrados. Suas medalhas e conquistas zeram. Você continua aparecendo no ranking das salas.</p>
      <p class="p" style="margin:10px 0">Digite a <b style="color:var(--chalk)">senha da sua conta</b> para confirmar.</p>
      <input id="hideHistPass" class="input" type="password" placeholder="Sua senha" autocomplete="off" autocapitalize="off" />
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="submitHideHistory()">🗑 Excluir histórico</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // trocar nome de usuário (pede senha atual pra confirmar)
  if(c.mode==="changeUsername"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Mudar nome de usuário</div>
      <p class="p" style="margin:10px 0">Seu apelido atual é <b style="color:var(--chalk)">${esc(APP.user.username)}</b>. Escolha um novo — é assim que os outros vão te ver. Seu histórico e conquistas vão junto.</p>
      <input id="cu-new" class="input" placeholder="Novo apelido" autocomplete="off" />
      <div style="position:relative">
        <input id="cu-pass" class="input" type="password" placeholder="Sua senha atual (confirmar)" autocomplete="off" style="padding-right:44px" />
        <span id="cu-eye" onclick="togglePassVisib('cu-pass','cu-eye')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <button class="btn" style="margin-top:4px" onclick="submitChangeUsername()">Trocar nome</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // trocar senha (pede senha atual + nova duas vezes)
  if(c.mode==="changePassword"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Mudar senha</div>
      <p class="p" style="margin:10px 0">Digite sua senha atual e a nova senha. Você vai usar a nova senha toda vez que entrar no app.</p>
      <div style="position:relative">
        <input id="cp-old" class="input" type="password" placeholder="Senha atual" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye1" onclick="togglePassVisib('cp-old','cp-eye1')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <div style="position:relative">
        <input id="cp-new" class="input" type="password" placeholder="Nova senha (3+)" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye2" onclick="togglePassVisib('cp-new','cp-eye2')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <div style="position:relative">
        <input id="cp-new2" class="input" type="password" placeholder="Repita a nova senha" autocomplete="off" style="padding-right:44px" />
        <span id="cp-eye3" onclick="togglePassVisib('cp-new2','cp-eye3')" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:18px;user-select:none;opacity:.8">👁️</span>
      </div>
      <button class="btn" style="margin-top:4px" onclick="submitChangePassword()">Trocar senha</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: arquivar jogo (admin) — move pra Resultados, global
  if(c.mode==="archive"){
    const j=APP.jogos.find(x=>x.room_id===c.roomId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--blue)">Arquivar jogo</div>
      <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">${esc(j?j.match_name:"")}</b> vai sair de todos os grupos e rodadas e passar a aparecer só em <b style="color:var(--blue)">Resultados</b>, onde todos veem como foi. Não poderá mais ser adicionado a nenhuma pool.</p>
      <p class="p" style="margin:10px 0">Os times já montados e o ranking continuam salvos. Você pode desarquivar depois.</p>
      <button class="btn" style="margin-top:4px;background:var(--blue)" onclick="closeConfirm();archiveGame('${c.roomId}')">🗄 Arquivar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: entrar num grupo com senha
  if(c.mode==="join"){
    const g=APP.groups.find(x=>x.id===c.gid);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Entrar em ${esc(g?g.name:"")}</div>
      <p class="p" style="margin:10px 0">Digite a senha que o admin passou. Você fica membro pra sempre.</p>
      <input id="joinPass" class="input" placeholder="Senha do grupo" autocapitalize="off" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitJoin()">Entrar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: criar rodada (admin)
  if(c.mode==="replicate"){
    const pp=APP.prepool;
    const nome=pp?`${esc(pp.home.name)} × ${esc(pp.away.name)}`:"este jogo";
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--green)">Repor escalação</div>
      <p class="p" style="margin:10px 0">Tem certeza que quer <b style="color:var(--chalk)">repor as ${c.count} outra(s) aparição(ões)</b> de <b style="color:var(--chalk)">${nome}</b> com a escalação que você montou agora?</p>
      <p class="p" style="margin-bottom:12px;font-size:11px">Isso <b>sobrescreve</b> o time que você tinha montado pra este mesmo jogo nos outros modos/rodadas. As que já travaram não são afetadas.</p>
      <button class="btn" style="margin-top:4px;background:var(--green);color:#06231a" onclick="applyLineupEverywhere()">Sim, repor as ${c.count}</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createRound"){
    const poolMax=(APP.jogos||[]).length;
    const defLimit=Math.min(3,poolMax||3);
    const selMode=MODE_META[c.newMode]?c.newMode:"full";
    const modeBtns=MODE_LIST.map(mk=>{
      const mm=MODE_META[mk],on=selMode===mk;
      return `<div onclick="setCreateMode('${mk}')" style="flex:1 1 calc(50% - 3px);cursor:pointer;text-align:center;padding:9px 4px;border-radius:9px;border:1px solid ${on?mm.color:"var(--line)"};background:${on?`color-mix(in srgb,${mm.color} 18%,transparent)`:"var(--panel2)"};color:${on?mm.color:"var(--dim)"};font-size:11px;font-weight:700">${mm.icon} ${mm.label}</div>`;
    }).join("");
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar mini rodada</div>
      <p class="p" style="margin:8px 0">Escolha o modo:</p>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">${modeBtns}</div>
      <p class="p" style="font-size:11px;margin-bottom:10px;color:${MODE_META[selMode].color}">${MODE_META[selMode].desc}</p>
      ${modePreviewHTML(selMode)}
      <input id="rndName" class="input" placeholder="Nome (ex: Jogos de 18/06)" autocorrect="off" value="${esc(c.draftName||"")}" oninput="APP.confirm.draftName=this.value" />
      ${selMode==="select"?`<input id="rndLimit" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} placeholder="Quantos jogos escolher (ex: 3)" value="${defLimit}" />${poolMax?`<p class="p" style="font-size:11px;margin-bottom:8px">Há <b style="color:var(--amber)">${poolMax}</b> jogo(s) no catálogo (máximo).</p>`:""}`:""}
      ${selMode==="boost"?boostBuilderHTML(c):""}
      ${selMode==="full"?`<p class="p" style="font-size:11px;margin-bottom:8px">No modo COMPLETO o jogador escala todos os jogos da rodada — não há limite de escolha.</p>`:""}
      ${selMode==="confianca"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo e ordenam os jogos por confiança: o 1º vale 2x, o último 0,5x.</p>`:""}
      ${selMode==="previsao"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo e cravam o placar de cada jogo. Bônus: +${PRED_RESULT_PCT}% pelo resultado, +${PRED_EXACT_PCT}% pelo placar exato.</p>`:""}
      ${selMode==="zebra"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo. Em cada jogo, atletas do time com menor ELO recebem +25% em cima dos pontos positivos.</p>`:""}
      ${selMode==="sobrevivencia"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo. Negativou em qualquer jogo finalizado: zera a mini rodada. Se sobreviver, o pior jogo é descartado.</p>`:""}
      ${selMode==="capitaoduplo"?`<p class="p" style="font-size:11px;margin-bottom:8px">Os jogadores escalam tudo. O capitão recebe reforço extra na classificação da mini rodada, chegando perto de 1.4x no total.</p>`:""}
      <button class="btn" style="margin-top:4px" onclick="submitCreateRound()">Criar mini rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="rename"){
    const isRound=c.kind==="round";
    const poolMax=(APP.jogos||[]).length;
    let extra="";
    if(isRound&&c.roundMode==="select"){
      extra=`<p class="p" style="font-size:11px;margin-bottom:4px">Quantos jogos cada um escolhe:</p><input id="renamePick" class="input" type="number" inputmode="numeric" min="1"${poolMax?` max="${poolMax}"`:""} value="${c.pickLimit||3}" />`;
    }else if(isRound&&c.roundMode==="boost"){
      extra=`<p class="p" style="font-size:11px;margin-bottom:6px;color:#FFC247">Fichas de impulso desta pool:</p>${boostBuilderHTML(c)}`;
    }
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">${c.kind==="league"?"Renomear liga":c.kind==="phase"?"Renomear rodada":"Editar mini rodada"}</div>
      <p class="p" style="margin:10px 0">${isRound?"Edite o nome e os ajustes. Os times, pontos e vínculos continuam intactos.":"Escolha o novo nome. Os times, pontos e vínculos continuam intactos."}</p>
      <input id="renameInput" class="input" value="${esc(c.cur||"")}" autocorrect="off" />
      ${extra}
      <button class="btn" style="margin-top:4px" onclick="submitRename()">Salvar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createPhase"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar rodada</div>
      <p class="p" style="margin:10px 0">Uma rodada (ex: "Fase de Grupos") agrupa várias mini rodadas. Você cria as mini rodadas depois, dentro dela.</p>
      <input id="phName" class="input" placeholder="Nome (ex: Fase de Grupos)" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreatePhase()">Criar rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createLeague"){
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Criar liga</div>
      <p class="p" style="margin:10px 0">Uma liga agrupa várias rodadas numa classificação geral (pontos de tabela + pontuação clássica). Você adiciona as rodadas depois, dentro da liga.</p>
      <input id="lgName" class="input" placeholder="Nome (ex: Liga Copa 2026)" autocorrect="off" />
      <button class="btn" style="margin-top:4px" onclick="submitCreateLeague()">Criar liga</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="createDraftSeason"){
    const ck=(id,label,on=true,req=false,desc="")=>`<label style="display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:8px;background:rgba(255,255,255,.025);margin:6px 0">
      <input id="${id}" type="checkbox" ${on?"checked":""} ${req?"disabled":""} style="margin-top:3px;transform:scale(1.15)" />
      <span style="flex:1"><b style="color:${req?"var(--amber)":"var(--chalk)"}">${esc(label)}${req?" · obrigatório":""}</b>${desc?`<small style="display:block;color:var(--dim);font-size:10px;margin-top:2px">${esc(desc)}</small>`:""}</span>
    </label>`;
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:#FF8A4C">Criar Mercado Draft</div>
      <p class="p" style="margin:10px 0">Modo separado e full customizável. As opções obrigatórias são o núcleo do Draft; o resto você liga/desliga.</p>
      <input id="draftName" class="input" placeholder="Nome (ex: Mercado Copa 2026)" autocorrect="off" />
      <input id="draftBudget" class="input" type="number" inputmode="numeric" placeholder="Orçamento inicial (ex: 300)" value="300" oninput="updDraftHint()" />
      <input id="draftRoster" class="input" type="number" inputmode="numeric" placeholder="Limite de elenco (ex: 12)" value="12" oninput="updDraftHint()" />
      <div id="draftHint" style="margin:2px 0 8px;padding:10px 12px;border:1px solid #2a3550;border-radius:10px;background:#10182C;font-size:12.5px;line-height:1.5;color:#9fb0d0"></div>
      <div class="tag" style="margin:12px 0 6px;color:#FF8A4C">BASE DO MODO</div>
      ${ck("dm_create","Criar campeonato Draft",true,true,"Sem temporada não existe modo.")}
      ${ck("dm_scope","Escolher jogos/rodadas que fazem parte",true,false,"Ativa vínculo da temporada com jogos/rodadas.")}
      ${ck("dm_budget","Cada usuário tem orçamento",true,false,"Se desligar, compras não descontam moedas.")}
      ${ck("dm_unique","Cada jogador real só pode ter um dono",true,true,"Essência do Draft; o banco também protege isso.")}
      ${ck("dm_ordered","Draft inicial por ordem",true,false,"Liga a etapa de draft antes do mercado.")}
      ${ck("dm_roster","Elenco limitado",true,false,"Usa o limite acima, recomendado 8 a 12.")}
      ${ck("dm_lineup","Escalação de 5 + banco por rodada",true,false,"Base competitiva do modo temporada.")}
      ${ck("dm_market","Mercado de livres entre rodadas",true,false,"Permite comprar jogadores sem dono.")}
      ${ck("dm_ranking","Ranking geral da temporada",true,true,"Sem ranking não tem competição.")}
      ${ck("dm_history","Histórico de compras/vendas",true,true,"Ajuda auditoria e zoeira saudável.")}
      <div class="tag" style="margin:12px 0 6px;color:#FF8A4C">MERCADO AVANÇADO</div>
      ${ck("dm_dynamic","Valorização dinâmica",true,false,"Preço muda conforme desempenho e contexto.")}
      ${ck("dm_sell_current","Venda por preço atualizado",true,false,"Venda usa current_price, não preço original.")}
      ${ck("dm_buy_limit","Limite de compras por rodada",true,false,"Controla spam de mercado.")}
      <input id="draftBuyLimit" class="input" type="number" inputmode="numeric" placeholder="Compras por rodada" value="2" />
      ${ck("dm_auto_window","Janela abre/fecha automático",false,false,"Para automatizar mercado por rodada no futuro.")}
      ${ck("dm_eliminated","Eliminados perdem valor ou travam",true,false,"Seleções eliminadas sofrem regra de mercado.")}
      ${ck("dm_waiver","Waiver: pior colocado tem prioridade",true,false,"Resolve disputa por jogador concorrido.")}
      <div class="tag" style="margin:12px 0 6px;color:#FF8A4C">SOCIAL / PVP</div>
      ${ck("dm_trades","Trocas entre usuários",true,false,"Permite negociar jogador/moedas.")}
      ${ck("dm_pending","Propostas pendentes",true,false,"Troca precisa ser aceita.")}
      ${ck("dm_veto","Veto/admin",true,false,"Admin pode barrar troca suspeita.")}
      ${ck("dm_loans","Empréstimos",false,false,"Jogador vai e volta por período definido.")}
      ${ck("dm_clause","Multa rescisória",true,false,"Permite comprar pagando cláusula configurada.")}
      ${ck("dm_auction","Leilão por jogadores livres",false,false,"Ao invés de compra direta, jogador livre vai a leilão.")}
      <div class="tag" style="margin:12px 0 6px;color:#f0a830">🔨 DRAFT POR LEILÃO 2.0</div>
      ${ck("dm_auction2","Ativar Draft por Leilão 2.0",false,false,"Todos escolhem 1 jogador ao mesmo tempo. Se 2+ querem o mesmo, abre leilão; quem perde pega um jogador de faixa menor.")}
      <script>setTimeout(function(){var c=document.getElementById("dm_auction2");if(c)c.onchange=function(){var b=document.getElementById("auction2cfg");if(b)b.style.display=c.checked?"block":"none";};},0);</script>
      <div id="auction2cfg" style="display:none;border:1px solid var(--line);border-radius:10px;padding:10px;margin:4px 0 8px;background:rgba(240,168,48,.04)">
        <div style="font-size:11px;color:var(--dim);margin-bottom:6px">Como o leilão decide o vencedor:</div>
        <div class="seg" style="display:flex;gap:6px;margin-bottom:10px">
          <button type="button" id="a2_blind" class="a2mode on" onclick="setA2Mode('blind')" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent);color:var(--amber);font-size:11px;font-weight:800;cursor:pointer">🙈 Às cegas</button>
          <button type="button" id="a2_live" class="a2mode" onclick="setA2Mode('live')" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--dim);font-size:11px;font-weight:800;cursor:pointer">📣 Ao vivo</button>
          <button type="button" id="a2_priority" class="a2mode" onclick="setA2Mode('priority')" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--dim);font-size:11px;font-weight:800;cursor:pointer">🔢 Prioridade</button>
        </div>
        <input type="hidden" id="dm_auction2_mode" value="blind" />
        <div id="a2_live_cfg" style="display:none">
          <label style="font-size:11px;color:var(--dim)">Passo do lance (ao vivo)</label>
          <input id="dm_auction2_step" class="input" type="number" inputmode="numeric" value="5" min="1" style="margin:4px 0 8px" />
        </div>
        <label style="font-size:11px;color:var(--dim)">Faixa da consolação — quem perde pega jogador até esta % do preço do disputado</label>
        <input id="dm_auction2_conso" class="input" type="number" inputmode="numeric" value="70" min="10" max="100" style="margin:4px 0 0" />
        <div style="font-size:10px;color:var(--dim);margin-top:4px">Ex: 70 = perdedor só pode pegar jogadores que custam até 70% do preço do jogador disputado.</div>
      </div>
      <button class="btn" style="margin-top:4px;background:#FF8A4C;color:#0A0E1C" onclick="submitCreateDraftSeason()">Criar temporada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="deletePhase"){
    const p=(APP.phases||[]).find(x=>x.id===c.phaseId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir rodada</div>
      <p class="p" style="margin:10px 0">Excluir <b style="color:var(--chalk)">${esc(p?p.name:"")}</b>? As mini rodadas dela <b>não</b> são apagadas — voltam a ser avulsas. Times e pontuações continuam intactos.</p>
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="closeConfirm();deletePhase('${c.phaseId}')">🗑 Excluir rodada</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  if(c.mode==="deleteLeague"){
    const l=(APP.leagues||[]).find(x=>x.id===c.leagueId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--red)">Excluir liga</div>
      <p class="p" style="margin:10px 0">Excluir <b style="color:var(--chalk)">${esc(l?l.name:"")}</b>? As rodadas dela <b>não</b> são apagadas — apenas voltam a ser avulsas. Os times e pontuações continuam intactos.</p>
      <button class="btn" style="margin-top:4px;background:var(--red);color:#fff" onclick="closeConfirm();deleteLeague('${c.leagueId}')">🗑 Excluir liga</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
    </div></div>`;
  }
  // modo: confirmar entrada num jogo da rodada (gasta ficha)
  if(c.mode==="confirmTeam"){
    const j=APP.jogos.find(x=>x.room_id===c.roomId);
    return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
      <div class="h2 disp" style="color:var(--amber)">Confirmar equipe?</div>
      <p class="p" style="margin:10px 0">Você vai <b style="color:var(--chalk)">travar seu time</b> em ${esc(j?j.match_name:"")}. Depois de confirmar, <b>não dá mais pra editar</b> a escalação deste jogo.</p>
      <p class="p" style="margin:10px 0">Confirme só quando souber os titulares e estiver satisfeito.</p>
      <button class="btn" style="margin-top:4px" onclick="closeConfirm();confirmTeam('${c.roomId}')">✓ Confirmar e travar</button>
      <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Ainda não, deixa eu ajustar</button>
    </div></div>`;
  }
  // modo padrão: confirmação destrutiva por palavra (reset)
  return `<div class="modal" onclick="closeConfirm()"><div class="box" onclick="event.stopPropagation()">
    <div class="h2 disp" style="color:var(--red)">⚠ ${esc(c.label)}</div>
    <p class="p" style="margin:10px 0">${c.msg?esc(c.msg):'Esta ação <b style="color:var(--chalk)">apaga os times e não pode ser desfeita</b>. Salas e usuários são mantidos.'} Para confirmar, digite <b style="color:var(--amber)">${c.word}</b> abaixo.</p>
    <input id="confirmField" class="input" placeholder="Digite ${c.word}" autocapitalize="characters" autocorrect="off" />
    <button class="btn" style="background:var(--red);color:#fff;margin-top:4px" onclick="runConfirm()">Apagar agora</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeConfirm()">Cancelar</button>
  </div></div>`;
}
