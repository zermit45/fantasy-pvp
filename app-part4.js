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
        const face=typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:pl.id,team:pl.team,name:pl.name},"microface"):"";
        html+=`<div class="line" style="padding:5px 0"><span style="display:flex;align-items:center;gap:7px"><b class="pc-${posKey}" style="font-size:9px">${SLOT_LABEL[sl]}</b> ${face}<span>${esc(pl.name)}</span><span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:0">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</span></div>`;
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
      <input id="draftBudget" class="input" type="number" inputmode="numeric" placeholder="Orçamento inicial (ex: 300)" value="300" />
      <input id="draftRoster" class="input" type="number" inputmode="numeric" placeholder="Limite de elenco (ex: 12)" value="12" />
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
function submitCreateGroup(){
  const n=$("grpName"),p=$("grpPass");
  const name=n?n.value.trim():"",pass=p?p.value.trim():"";
  if(!name||!pass){toast("Preencha nome e senha.");return;}
  APP.confirm=null;createGroup(name,pass).catch(e=>toast("Erro: "+e.message));
}
function submitHideHistory(){
  const f=$("hideHistPass");
  const senha=f?f.value:"";
  if(!senha){toast("Digite sua senha.");return;}
  hideMyProfileHistory(senha).catch(e=>toast("Erro: "+e.message));
}
function submitCreateRound(){
  const c=APP.confirm||{};
  const mk=c.newMode||"select";
  const n=$("rndName");
  const name=(n?n.value:(c.draftName||"")).trim();
  const poolMax=(APP.jogos||[]).length;
  if(!name){toast("Dê um nome à mini rodada.");return;}
  let limit=poolMax||999, tokens=0;
  if(mk==="select"){
    const l=$("rndLimit");limit=l?parseInt(l.value,10):3;
    if(!limit||limit<1)limit=1;
    if(poolMax>0&&limit>poolMax){toast("Só há "+poolMax+" jogo(s) no catálogo. Escolha no máximo "+poolMax+".");return;}
  }else if(["full","zebra","sobrevivencia","capitaoduplo"].includes(mk)){
    limit=poolMax||999; // modos de rodada inteira = todos
  }else if(mk==="boost"){
    limit=poolMax||999; // impulso = escala todos
    const chips=(c.chips||[]).map(v=>Number(v)||0).filter(v=>v!==0);
    if(!chips.length){toast("Adicione pelo menos uma ficha de impulso.");return;}
    const feas=boostFeasibility(chips,c.boostMaxPerGame||0,!!c.boostNoMix);
    if(!feas.ok){toast("Configuração impossível: "+feas.msg);return;}
    const cfg={chips,maxPerGame:c.boostMaxPerGame||0,minGames:c.boostMinGames||0,noMix:!!c.boostNoMix};
    const phaseId=c.phaseId||null;
    APP.confirm=null;createRound(name,limit,phaseId,mk,chips.length,cfg).catch(e=>toast("Erro: "+e.message));
    return;
  }
  const phaseId=c.phaseId||null;
  APP.confirm=null;createRound(name,limit,phaseId,mk,tokens).catch(e=>toast("Erro: "+e.message));
}
function submitCreatePhase(){
  const n=$("phName");
  const name=n?n.value.trim():"";
  if(!name){toast("Dê um nome à rodada.");return;}
  const leagueId=APP.confirm&&APP.confirm.leagueId?APP.confirm.leagueId:null;
  APP.confirm=null;createPhase(name,leagueId).catch(e=>toast("Erro: "+e.message));
}
function submitCreateLeague(){
  const n=$("lgName");
  const name=n?n.value.trim():"";
  if(!name){toast("Dê um nome à liga.");return;}
  APP.confirm=null;createLeague(name).catch(e=>toast("Erro: "+e.message));
}
function submitCreateDraftSeason(){
  const n=$("draftName"),b=$("draftBudget"),r=$("draftRoster");
  const name=n?n.value.trim():"";
  const budget=b?parseInt(b.value,10):300;
  const roster=r?parseInt(r.value,10):12;
  const on=id=>{const el=$(id);return !!(el&&el.checked);};
  const buyLim=$("draftBuyLimit")?parseInt($("draftBuyLimit").value,10):2;
  if(!name){toast("Dê um nome à temporada.");return;}
  if(!budget||budget<20){toast("Orçamento precisa ser pelo menos 20.");return;}
  if(!roster||roster<6){toast("Elenco precisa ter pelo menos 6 jogadores.");return;}
  const settings={
    required:{create_competition:true,exclusive_players:true,season_ranking:true,transaction_history:true},
    games_scope:on("dm_scope"),
    budget_enabled:on("dm_budget"),
    ordered_draft:on("dm_ordered"),
    roster_limit_enabled:on("dm_roster"),
    lineup_enabled:on("dm_lineup"),
    free_market:on("dm_market"),
    dynamic_prices:on("dm_dynamic"),
    sell_at_current_price:on("dm_sell_current"),
    purchase_limit_enabled:on("dm_buy_limit"),
    purchases_per_round:buyLim&&buyLim>0?buyLim:2,
    auto_windows:on("dm_auto_window"),
    eliminated_player_rule:on("dm_eliminated")?"discount":"none",
    waiver_enabled:on("dm_waiver"),
    trades_enabled:on("dm_trades"),
    pending_offers:on("dm_pending"),
    admin_veto:on("dm_veto"),
    loans_enabled:on("dm_loans"),
    release_clause_enabled:on("dm_clause"),
    free_agent_auction:on("dm_auction"),
    lineup:{GK:1,DEF:1,MID:1,ATT:1,FLEX:1,BENCH:1},
    sell_tax_pct:10
  };
  APP.confirm=null;createDraftSeason(name,budget,roster,settings).catch(e=>toast("Erro: "+e.message));
}
async function deleteLeague(id){
  if(!isAdmin())return;
  try{
    await sbUpdate("phases",{league_id:null},`league_id=eq.${id}`);
    await sbDelete("leagues",`id=eq.${id}`);
    await loadPhases();await loadLeagues();
    APP.leagueId=null;APP.league=null;APP.view="home";
    toast("Liga excluída. As rodadas voltaram a ser avulsas.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
async function deletePhase(id){
  if(!isAdmin())return;
  try{
    // apaga em cascata: as mini rodadas desta rodada, com suas entries e round_rooms
    const minis=await sb("rounds?phase_id=eq."+id+"&group_id=eq."+APP.groupId+"&select=id");
    for(const m of (minis||[])){
      await sbDelete("entries",`round_id=eq.${m.id}`);
      await sbDelete("round_rooms",`round_id=eq.${m.id}`);
      await sbDelete("rounds",`id=eq.${m.id}`);
    }
    await sbDelete("phases",`id=eq.${id}`);
    await loadRounds();await loadPhases();
    APP.phaseId=null;APP.phase=null;APP.view="home";
    toast("Rodada e suas mini rodadas excluídas.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
function submitJoin(){
  const c=APP.confirm;const f=$("joinPass");
  const pass=f?f.value:"";
  const gid=c.gid;APP.confirm=null;
  joinGroup(gid,pass).catch(e=>toast("Erro: "+e.message));
}
const _normWord=s=>String(s||"").trim().toUpperCase();
async function runConfirm(){
  const c=APP.confirm;if(!c)return;
  // lê direto do campo (mais confiável que o estado em mobile)
  const field=$("confirmField");
  const typed=field?field.value:c.typed;
  if(_normWord(typed)!==_normWord(c.word)){toast(`Digite "${c.word}" para confirmar.`);return;}
  const action=c.action;APP.confirm=null;render();
  try{await action();}catch(e){toast("Erro: "+e.message);}
}
// reset de UMA sala
function resetRoom(){
  if(!isAdmin())return;
  askConfirm("LIMPAR","Limpar times desta sala",async()=>{
    await sbDelete("entries",`room_id=eq.${APP.roomId}&group_id=eq.${APP.groupId}`);
    APP.entries=[];
    toast("Times desta sala apagados.");
    render();
  });
}
// reset GERAL (todas as salas)
function resetAll(){
  if(!isAdmin())return;
  askConfirm("RESET TUDO","Manutenção: limpar TODOS os times de TODOS os jogos",async()=>{
    // deleta todas as entries (room_id sempre existe; pega todas)
    await sbDelete("entries","room_id=not.is.null");
    APP.entries=[];
    toast("Manutenção concluída. Todos os times foram apagados.");
    render();
  });
}
function hasEntry(){return APP.slots&&Object.values(APP.slots).some(Boolean);}

// ============================================================
// TELA: BUILD (montar time) — reaproveitada do chalkboard
// ============================================================
// teto de preço do banco = preço do TITULAR MAIS BARATO que o usuário escalou.
// O banco é grátis (não conta no orçamento) e só aceita quem custa <= esse teto.
// Enquanto não houver nenhum titular escalado, não há teto (banco fica bloqueado).
function benchCap(s,byId){
  const TIT=["GK","DEF","MID","ATT","FLEX"];
  let cap=null;
  for(const sl of TIT){const pid=s[sl];if(!pid)continue;const pr=byId[pid]?byId[pid].price:null;if(pr==null)continue;cap=cap==null?pr:Math.min(cap,pr);}
  return cap; // null = nenhum titular ainda
}
function buildHTML(){
  const pp=APP.prepool, byId=APP._byId, s=APP.slots;
  const used=Object.values(s).filter(Boolean);
  // orçamento NÃO conta o banco (banco é grátis, estilo Cartola)
  const spent=used.reduce((a,id)=>a+(id===s.BENCH?0:(byId[id]?byId[id].price:0)),0);
  const left=100-spent;
  const bcap=benchCap(s,byId); // teto de preço do banco = titular mais barato escalado (null se nenhum)
  const TAC=window.ENGINE_TACTICS;
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const poolClosedOutOfRound = !inRound && APP.roomMeta && APP.roomMeta.status!=="open" && !(APP.match&&APP.match.status==="finished");
  const gameLocked=(inRound&&roomLockedInRound(APP.roomId)) || poolClosedOutOfRound;
  const filt=pp.players.filter(p=>
    (APP.tabTeam==="ALL"||p.team===APP.tabTeam) &&
    (APP.tabPos==="ALL"||p.pos===APP.tabPos)
  ).sort((a,b)=>b.price-a.price);
  const ready=Object.values(s).every(Boolean)&&APP.captain&&APP.tactic&&!gameLocked;
  const hasSomeFilled=Object.values(s).some(Boolean);
  const canReplicate=hasSomeFilled&&!gameLocked;
  const filledCount=Object.values(s).filter(Boolean).length;
  const starterFilled=["GK","DEF","MID","ATT","FLEX"].filter(sl=>s[sl]).length;
  const budgetPct=Math.max(0,Math.min(100,spent));
  const capName=APP.captain&&s[APP.captain]&&byId[s[APP.captain]]?byId[s[APP.captain]].name:null;
  const tacticName=APP.tactic&&TAC[APP.tactic]?TAC[APP.tactic].name:null;
  const slotsHTML=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>{
    const pid=s[sl],pl=pid?byId[pid]:null;
    const posKey=sl==="BENCH"&&pl?pl.pos:sl; // banco herda a cor da posição real do jogador
    const face=pl&&typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:pl.id,team:pl.team,name:pl.name},"slotpic"):"";
    return `<div class="slot${pl?` filled s-${posKey}`:" empty"}${pl&&APP.captain===sl?" cap":""}" onclick="${pl?`clearSlot('${sl}')`:""}">
      <div class="lab"><span class="pc-${posKey}">${SLOT_LABEL[sl]}</span>${sl==="FLEX"?" ·DEF/MEI/ATA":""}${sl==="BENCH"?(bcap!=null?` ·grátis ≤${bcap}`:" ·grátis"):""}</div>
      <div class="nm" style="${pl?"display:flex;align-items:center;gap:8px":""}">${pl?`${face}<span>${esc(pl.name)}</span>`:"toque num jogador"}</div>
      ${pl?`<div class="pr mono"><span class="teamtag" style="--tc:${teamColor(pl.team)}">${pl.team}</span> · ${sl==="BENCH"?'<span style="color:var(--green)">grátis</span>':pl.price}</div>`:""}
      ${pl&&sl!=="BENCH"?`<button class="cbtn${APP.captain===sl?" on":""}" onclick="event.stopPropagation();toggleCap('${sl}')">C</button>`:""}
    </div>`;}).join("");
  // rótulos legíveis pras ações de buff/nerf das táticas
  const TACT_LABEL={goal:"gols",sotPts:"chutes/gols",assist:"assistências",sca:"criação",gca:"jogada do gol",
    dribbles:"dribles",prgp:"passes progressivos",pib:"passes na área",tib:"toques na área",
    tklint:"desarmes",block:"bloqueios",recovery:"recuperações",aerial:"duelos aéreos",clearance:"cortes",
    accCross:"cruzamentos",fouls:"faltas",prgCarry:"conduções",longBall:"lançamentos"};
  // cor-tema por tática (casa com as variáveis --tac-* do CSS)
  const TACT_COLOR={muralha:"var(--tac-muralha)",pressaototal:"var(--tac-pressaototal)",cerebro:"var(--tac-cerebro)",tridente:"var(--tac-tridente)",aereo:"var(--tac-aereo)",contra:"var(--tac-contra)"};
  function tactEffectHTML(t){
    const fam=(t.fam||[]).map(k=>TACT_LABEL[k]||k);
    const uniq=[...new Set(fam)];
    return `<div class="teff"><div class="up">▲ completa = bônus</div><div class="down">▼ incompleta = ônus menor</div><div class="foco">foco em <b>${uniq.join(", ")}</b></div></div>`;
  }
  const tactsHTML=Object.entries(TAC).filter(([k,t])=>!t.legacy).map(([k,t])=>{const tc=TACT_COLOR[k]||"var(--amber)";return `<div class="tact${APP.tactic===k?" on":""}" style="--tac:${tc}" onclick="setTactic('${k}')"><div class="ttop"></div><div class="tn">${t.name}</div><div class="td">${t.desc}</div>${tactEffectHTML(t)}</div>`;}).join("");
  // ── FILTROS COMBINÁVEIS: uma fileira de TIME + uma de POSIÇÃO (aplicam juntos) ──
  const teamTabs=["ALL",pp.home.code,pp.away.code];
  const teamTabsHTML=teamTabs.map(t=>{
    const on=APP.tabTeam===t;const isTeam=t!=="ALL";
    let style="";
    if(on&&isTeam)style=`style="--tc:${teamColor(t)};border-color:${teamColor(t)};color:${teamColor(t)};background:color-mix(in srgb,${teamColor(t)} 14%,transparent)"`;
    return `<div class="ptab${on?" on":""}" ${style} onclick="setTabTeam('${t}')">${t==="ALL"?"TODOS":t}</div>`;
  }).join("");
  const posTabs=["ALL","GK","DEF","MID","ATT"];
  const posTabsHTML=posTabs.map(t=>{
    const on=APP.tabPos===t;const isPos=t!=="ALL";
    let style="";
    if(on&&isPos)style=`style="border-color:var(--pos-${t});color:var(--pos-${t});background:color-mix(in srgb,var(--pos-${t}) 14%,transparent)"`;
    return `<div class="ptab${on?" on":""}" ${style} onclick="setTabPos('${t}')">${t==="ALL"?"TODAS":SLOT_LABEL[t]}</div>`;
  }).join("");
  const tabsHTML=`<div class="postabs">${teamTabsHTML}</div><div class="postabs">${posTabsHTML}</div>`;
  // destino que um jogador teria, dado o estado atual dos slots (mesma lógica do place)
  function destSlot(p){
    if(p.pos==="GK")return !s.GK?"GK":(!s.BENCH?"BENCH":null);
    if(!s[p.pos])return p.pos; if(!s.FLEX)return "FLEX"; if(!s.BENCH)return "BENCH"; return null;
  }
  const poolHTML=filt.map(p=>{
    const sel=used.includes(p.id);
    const dest=destSlot(p);
    let dis=false,reason="";
    if(!sel){
      if(!dest){dis=true;reason="";}
      else if(dest==="BENCH"){ if(bcap==null||(p.price||0)>bcap){dis=true;reason="banco";} } // banco: precisa ter titular e custar <= o teto
      else if(left-p.price<0){dis=true;reason="orc";} // titular: respeita orçamento
    }
    const tag = (!sel&&dest==="BENCH"&&!dis)?` <span style="font-size:9px;color:var(--green)">grátis</span>`:"";
    const face=typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:p.id,team:p.team,name:p.name},"pface"):"";
    return `<div class="prow playerpick ${sel?" sel":""}${dis?" dis":""}" onclick="${dis?"":`place(${p.id})`}"><div class="posbar pb-${p.pos}"></div><div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div>${face}<div class="nm">${esc(p.name)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${p.team}</span>${p.age?` <span class="age">${p.age}a</span>`:""}${tag}</div><div class="pr mono">${p.price}</div></div>`;
  }).join("");
  // ── MODO TORCIDA: jogo travado mas não finalizado → mostra resumo limpo do time escalado ──
  if(gameLocked){
    const tac=TAC[APP.tactic];
    const lineRow=(sl)=>{
      const pid=s[sl],pl=pid?byId[pid]:null;
      if(!pl)return"";
      const isCap=APP.captain===sl;
      const posKey=sl==="BENCH"&&pl?pl.pos:sl;
      const face=typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:pl.id,team:pl.team,name:pl.name},"pface"):"";
      return `<div class="prow" style="cursor:default"><div class="posbar pb-${posKey}"></div><div class="pos mono pc-${posKey}">${SLOT_LABEL[sl]}</div>${face}<div class="nm">${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</div><div class="pr mono" style="color:var(--dim)">${sl==="BENCH"?"grátis":pl.price}</div></div>`;
    };
    return `<div class="scorebar"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="tag">${esc(pp.comp)} · ⚽ EM ANDAMENTO</div><div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('room')"}" style="cursor:pointer;flex-shrink:0">← voltar</div></div>
      <div class="score disp"><div><div class="team">${esc(pp.home.name)}</div></div><div class="vs mono">×</div><div style="text-align:right"><div class="team">${esc(pp.away.name)}</div></div></div></div>
    <div class="card">
      <div class="prebox" style="border-color:#143a2a;background:#0c1f17;color:var(--green)">🔒 Time confirmado e travado. Boa sorte — agora é torcer! Você verá a pontuação quando a partida acabar.</div>
      <div class="h2 disp" style="margin-top:6px">Seu time escalado</div>
      <div class="pool" style="max-height:none;margin-top:8px">${["GK","DEF","MID","ATT","FLEX","BENCH"].map(lineRow).join("")}</div>
      <div class="bsub">⚔️ Sua tática</div>
      ${tac?`<div class="tact on" style="min-width:0;--tac:${TACT_COLOR[APP.tactic]||"var(--amber)"}"><div class="ttop"></div>${`<div class="tn">${tac.name}</div><div class="td">${tac.desc}</div>${tactEffectHTML(tac)}`}</div>`:`<p class="p">—</p>`}
      <div class="line" style="margin-top:10px"><span>Capitão (pontos ×1,20)${helpBtn("capitao")}</span><span class="v">${APP.captain?esc(byId[s[APP.captain]]?.name||SLOT_LABEL[APP.captain]):"—"}</span></div>
    </div>`;
  }
  return `<div class="card buildhero">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px">
      <div>
        <div class="tag">${esc(pp.comp)}</div>
        <div class="buildtitle disp">${esc(pp.home.name)} × ${esc(pp.away.name)}</div>
        <div class="heroSub">Monte 5 titulares, 1 banco, capitão e tática antes do jogo travar.</div>
      </div>
      <div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('room')"}" style="cursor:pointer;flex-shrink:0">← voltar</div>
    </div>
    <div class="budget"><div class="h2 disp">Seu time${helpBtn("slots")}</div><div><span class="tag">RESTANTE${helpBtn("orcamento")} </span><span class="val mono">${left}</span><span class="tag"> /100</span></div></div>
    <div class="budgetbar"><div class="fill" style="width:${budgetPct}%"></div></div>
    <div class="lineupMeta">
      <div class="mini"><b>${starterFilled}/5</b><span>titulares</span></div>
      <div class="mini"><b>${s.BENCH?"ok":"-"}</b><span>banco</span></div>
      <div class="mini"><b>${capName?esc(capName):"-"}</b><span>capitão</span></div>
      <div class="mini"><b>${tacticName?esc(tacticName):"-"}</b><span>tática</span></div>
    </div>
    <div class="slots">${slotsHTML}</div>
    <p class="p" style="font-size:11px;margin:-4px 0 10px;line-height:1.5">🪑 O <b style="color:var(--green)">BANCO é grátis</b> (não gasta moeda), mas só aceita um jogador <b>igual ou mais barato que o seu titular mais barato</b>${bcap!=null?` (hoje: até <b class="mono">${bcap}</b>)`:" (escale um titular primeiro)"}, de qualquer posição. Ele entra se um titular for mal.${helpBtn("banco")}</p>
    <div class="sectionhead"><span>Escolha 1 tática${helpBtn("tatica")}</span><span>${APP.tactic?"selecionada":"pendente"}</span></div>
    <p class="p" style="font-size:11px;margin-bottom:8px;line-height:1.5">Cada tática <b style="color:var(--green)">▲ melhora</b> certas ações e <b style="color:var(--red)">▼ enfraquece</b> outras. Ela só <b>ativa</b> se, no fim do jogo, seu time estiver entre os melhores na ação dela — então monte o time pensando na tática.</p>
    <div class="tacts">${tactsHTML}</div>
  </div>
  <div class="card">
    <div class="sectionhead"><span>Pool <span class="tag">· ${pp.players.length} JOGADORES</span>${helpBtn("pool")}</span><span>${filledCount}/6 escolhidos</span></div>
    ${tabsHTML}
    <div class="pool">${poolHTML}</div>
    ${APP.warn?`<div class="warn">${APP.warn}</div>`:""}
    ${!gameLocked&&inRound&&APP.avulsaLineup?`<button class="btn ghost" style="margin-top:12px;border-color:var(--blue);color:var(--blue)" onclick="copyLineupFromOther()">📋 Copiar escalação da partida solta</button>`:""}
    ${canReplicate?`<button class="btn ghost" style="margin-top:12px;border-color:var(--green);color:var(--green)" onclick="askReplicate()">📑 Repor esta escalação nos outros modos com este jogo</button>
       <p class="p" style="margin-top:6px;font-size:11px">Cola este time (jogadores + capitão + tática) em toda aparição de ${esc(pp.home.name)} × ${esc(pp.away.name)} nos outros modos/rodadas. Salve este jogo também.</p>`:""}
    ${gameLocked
      ? `<div class="prebox" style="margin-top:12px;border-color:#3a2e10">🔒 O jogo já começou — escalação travada. Não dá mais pra editar.</div>
         <button class="btn" style="margin-top:8px" disabled>🔒 Time travado</button>`
      : inRound
        ? `<button class="btn ${ready?"ready":""}" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"💾 Salvar escalação":"Complete 6 slots, capitão e tática"}</button>
           <p class="p" style="margin-top:8px;font-size:12px;color:var(--dim)">Pode ajustar quantas vezes quiser até o jogo começar. O que está garantido é a <b>vaga neste jogo</b> (ficha gasta) — a escalação trava sozinha no apito inicial.</p>`
        : `<button class="btn ${ready?"ready":""}" style="margin-top:12px" ${ready?"":"disabled"} onclick="saveEntry()">${ready?"Salvar time":"Complete 6 slots, capitão e tática"}</button>`}
  </div>`;
}
function askConfirmTeam(){
  APP.confirm={mode:"confirmTeam",roomId:APP.roomId,label:"Confirmar equipe"};render();
}
// copia a escalação avulsa (partida solta) que o usuário fez neste MESMO jogo
async function copyLineupFromOther(){
  const src=APP.avulsaLineup;
  if(!src){toast("Você não montou este jogo na versão solta.");return;}
  APP.slots=Object.assign({GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},src.slots);
  APP.captain=src.captain||null;
  APP.tactic=src.tactic||null;
  toast("Escalação copiada da partida solta! Revise e salve.");
  render();
}
// ── REPOR ESCALAÇÃO: copia a escalação ATUAL (deste jogo) pra todas as OUTRAS
// aparições do MESMO jogo (mesmo room_id) nos outros modos/rodadas + versão avulsa.
// Como é o mesmo jogo, os IDs dos jogadores são idênticos: copia os slots direto.
// Pula a entry atual (onde estou) e qualquer entry travada (admin ou jogo começou).
async function replicateTargets(){
  // devolve lista de {round_id|null, label, locked} — onde dá pra colar a escalação deste room_id
  const out=[];
  const inRoundNow=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  // 1) versão avulsa (round_id null) — alvo se eu NÃO estou nela agora
  if(inRoundNow) out.push({round_id:null,label:"partida solta",locked:false});
  // 2) todas as rodadas onde este jogo aparece
  try{
    const rrs=await sb("round_rooms?room_id=eq."+APP.roomId+"&select=round_id,status");
    for(const rr of (rrs||[])){
      if(inRoundNow&&rr.round_id===APP.roundId) continue; // pula a rodada atual (é onde estou)
      const locked=(rr.status&&rr.status!=="open");
      out.push({round_id:rr.round_id,label:"rodada",locked});
    }
  }catch(e){}
  return out.filter(t=>!t.locked);
}
async function askReplicate(){
  const targets=await replicateTargets();
  if(!targets.length){toast("Este jogo não aparece em outro modo/rodada pra copiar.");return;}
  APP.confirm={mode:"replicate",count:targets.length,_targets:targets,label:"Repor escalação"};render();
}
async function applyLineupEverywhere(){
  if(!APP.user){toast("Faça login.");return;}
  const slots=APP.slots;
  if(!Object.values(slots).some(Boolean)){toast("Monte o time primeiro.");return;}
  const targets=(APP.confirm&&APP.confirm._targets)||await replicateTargets();
  if(!targets.length){toast("Nada para aplicar.");APP.confirm=null;render();return;}
  const cap=(APP.captain&&slots[APP.captain])?APP.captain:null;
  const payload={slots:JSON.parse(JSON.stringify(slots)),captain:cap,tactic:APP.tactic,updated_at:new Date().toISOString()};
  let applied=0;
  for(const t of targets){
    try{
      const filtro=t.round_id?("&round_id=eq."+t.round_id):"&round_id=is.null";
      const ex=await sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId+"&username=eq."+encodeURIComponent(APP.user.username)+filtro+"&select=id");
      if(ex&&ex.length){await sbUpdate("entries",payload,"id=eq."+ex[0].id);applied++;}
      else{await sbInsert("entries",Object.assign({room_id:APP.roomId,group_id:APP.groupId,round_id:t.round_id,username:APP.user.username},payload));applied++;}
    }catch(e){}
  }
  APP.confirm=null;
  toast(applied?`Escalação copiada para ${applied} outra(s) aparição(ões) deste jogo!`:"Nada para aplicar.");
  render();
}
function place(pid){
  const byId=APP._byId,p=byId[pid],s=APP.slots,used=Object.values(s).filter(Boolean);APP.warn="";
  if(used.includes(pid)){const sl=Object.keys(s).find(k=>s[k]===pid);s[sl]=null;if(APP.captain===sl)APP.captain=null;render();return;}
  // descobre o slot de destino
  let t=null;
  if(p.pos==="GK")t=!s.GK?"GK":!s.BENCH?"BENCH":null;
  else{if(!s[p.pos])t=p.pos;else if(!s.FLEX)t="FLEX";else if(!s.BENCH)t="BENCH";}
  if(!t){APP.warn="Sem slot compatível livre.";render();return;}
  if(t==="BENCH"){
    // banco: GRÁTIS, mas só aceita quem custa <= o titular mais barato que você escalou
    const bcap=benchCap(s,byId);
    if(bcap==null){APP.warn="Escale ao menos um titular antes de escolher o banco (o teto do banco é o seu titular mais barato).";render();return;}
    if((p.price||0)>bcap){APP.warn=`No banco só entra quem custa até ${bcap} (seu titular mais barato). Esse custa ${p.price}.`;render();return;}
  }else{
    // titular: paga e respeita o orçamento (banco não conta)
    const spent=used.reduce((a,id)=>a+(id===s.BENCH?0:byId[id].price),0);
    if(100-spent-p.price<0){APP.warn="Orçamento estourado.";render();return;}
  }
  s[t]=pid;enforceBenchCap();render();
}
// se o reserva do banco ficou acima do novo teto (titular mais barato), remove e avisa
function enforceBenchCap(){
  const s=APP.slots,byId=APP._byId;const bp=s.BENCH;if(!bp)return;
  const cap=benchCap(s,byId);
  const pr=byId[bp]?byId[bp].price:null;
  if(cap==null||(pr!=null&&pr>cap)){
    s.BENCH=null;
    if(APP.captain==="BENCH")APP.captain=null;
    APP.warn=cap==null?"Banco liberado: ele depende de ter um titular escalado.":`Banco liberado: o reserva (${pr}) ficou acima do novo teto (${cap}, seu titular mais barato).`;
  }
}
function clearSlot(sl){APP.slots[sl]=null;if(APP.captain===sl)APP.captain=null;if(sl!=="BENCH")enforceBenchCap();render();}
function toggleCap(sl){APP.captain=APP.captain===sl?null:sl;render();}
function setTactic(k){APP.tactic=k;render();}
function setTabTeam(t){APP.tabTeam=t;render();}
function setTabPos(t){APP.tabPos=t;render();}

async function saveEntry(){
  if(!SUPA.ready()){toast("Supabase não configurado.");return;}
  // está numa rodada? (roundId setado e este jogo pertence à mini rodada)
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  try{
    if(inRound){
      // escalação travada? (dev forçou, usuário confirmou, ou jogo começou)
      if(roomLockedInRound(APP.roomId)){toast("Este jogo já travou — não dá mais pra editar.");go("round",null,APP.roundId);return;}
      // a entry já existe (criada na seleção): só atualiza os slots/tática
      await upsertEntry(APP.roundId);
      toast("Progresso salvo. Confirme a equipe quando estiver pronto.");
      await loadRound(APP.roundId);
      go("round",null,APP.roundId);return;
    }
    // fluxo avulso
    const gr=await sb(`group_rooms?group_id=eq.${APP.groupId}&room_id=eq.${APP.roomId}&select=status`);
    if(gr&&gr[0]&&gr[0].status!=="open"){
      APP.roomMeta.status=gr[0].status;
      toast("Pool fechada — não dá mais pra editar o time.");
      go("room");return;
    }
    await upsertEntry(null);
    toast("Time salvo!");
    go("room");
  }catch(e){toast("Erro ao salvar: "+e.message);}
}
// salva a entry separando avulso (round_id null) de rodada (round_id setado).
// busca-então-decide: evita depender de índice parcial no on_conflict.
async function upsertEntry(roundId){
  const base={slots:APP.slots,captain:APP.captain,tactic:APP.tactic,updated_at:new Date().toISOString()};
  const filtroRound = roundId?("&round_id=eq."+roundId):"&round_id=is.null";
  const existing=await sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId
    +"&username=eq."+encodeURIComponent(APP.user.username)+filtroRound+"&select=id");
  if(existing&&existing.length){
    // já existe nesse contexto → atualiza pelo id (não toca na outra)
    await sbUpdate("entries",base,"id=eq."+existing[0].id);
  }else{
    // não existe → cria nova
    await sbInsert("entries",Object.assign({room_id:APP.roomId,group_id:APP.groupId,round_id:roundId,username:APP.user.username},base));
  }
}

// ============================================================
// TELA: RESULT (ranking + apuração)
// ============================================================
async function loadEntries(){
  if(!SUPA.ready())return [];
  // ranking deve refletir o contexto: se vim de uma rodada, só entries daquela rodada;
  // senão, só as avulsas (round_id null). Evita misturar/duplicar o mesmo usuário.
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  const filtroRound=inRound?("&round_id=eq."+APP.roundId):"&round_id=is.null";
  return sb("entries?room_id=eq."+APP.roomId+"&group_id=eq."+APP.groupId+filtroRound+"&select=*");
}
function buildMatchCtx(){
  const pp=APP.prepool,m=APP.match;
  m.homeCode=pp.home.code;m.awayCode=pp.away.code;m.homeElo=pp.home.elo;m.awayElo=pp.away.elo;
  // set piece goals (pra tatica bola parada) — opcional no match.json
  if(m.team_stats)for(const tc of [pp.home.code,pp.away.code]){if(m.team_stats[tc]&&m.team_stats[tc].setPieceGoals==null)m.team_stats[tc].setPieceGoals=0;}
  return makeEngine(m);
}
function scoreEntry(entry,eng){
  return scoreEntryFor(entry,eng,{prepool:APP.prepool,match:APP.match,byId:APP._byId});
}
// versão pura: calcula um entry contra um jogo passado em ctx (não usa estado global)
function scoreEntryFor(entry,eng,ctx){
  const byId=ctx.byId,m=ctx.match;
  const slots=["GK","DEF","MID","ATT","FLEX","BENCH"];
  function rawOf(pid){const meta=byId[pid];if(!meta)return{pos:"MID",team:"?",min:0};const raw=m.players?m.players[String(pid)]:null;return Object.assign({pos:meta.pos,team:meta.team},raw||{min:0});}
  const res={};
  for(const sl of slots){const pid=entry.slots[sl];if(!pid){res[sl]=null;continue;}res[sl]=eng.scorePlayer(rawOf(pid),null);}
  let subOut=null;const benchPid=entry.slots.BENCH,benchMeta=benchPid?byId[benchPid]:null;
  const BENCH_FACTOR=0.8; // reserva que entra rende 80% (pedágio por não ser titular)
  if(benchMeta&&res.BENCH){
    if(benchMeta.pos==="GK"){
      const gkTitularMin=res.GK?res.GK.minutes:0;
      // GK reserva só entra se o titular não jogou nada; mesmo assim, com desconto
      if(gkTitularMin===0&&res.BENCH){subOut="GK";[res.GK,res.BENCH]=[res.BENCH,res.GK];const t=entry.slots.GK;entry.slots.GK=entry.slots.BENCH;entry.slots.BENCH=t;}
    }
    else{
      const cand=[benchMeta.pos,"FLEX"].filter(x=>res[x]);
      let worst=null;for(const x of cand){if(!worst||res[x].total<res[worst].total||(res[x].total===res[worst].total&&x==="FLEX"))worst=x;}
      // só troca se o reserva, JÁ COM o desconto, ainda superar o pior titular
      if(worst&&res.BENCH.total*BENCH_FACTOR>res[worst].total){subOut=worst;const t=entry.slots[worst];entry.slots[worst]=entry.slots.BENCH;entry.slots.BENCH=t;[res[worst],res.BENCH]=[res.BENCH,res[worst]];}
    }
  }
  // tática v4: conta TODOS que entraram (titulares + reserva que entrou), mesmo substituídos
  const entraram=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>entry.slots[sl]).filter(Boolean).map(rawOf).filter(r=>(r.min||0)>0);
  const sq=eng.squadSum(entraram);
  let sum=0;const view=[];
  for(const sl of slots){
    const pid=entry.slots[sl];
    if(!pid){view.push(null);continue;}
    const r=eng.scorePlayer(rawOf(pid),sl==="BENCH"?null:entry.tactic,sl==="BENCH"?null:sq);
    let pts=r.total,cap=false;
    // reserva que entrou: aplica o pedágio de 80%
    if(sl===subOut){pts=Math.round(pts*BENCH_FACTOR*10)/10;}
    if(sl===entry.captain&&sl!=="BENCH"){pts=Math.round(pts*1.2*10)/10;cap=true;}
    if(sl!=="BENCH")sum+=pts;
    view.push({slot:sl,pid:entry.slots[sl],pts,cap,subIn:sl===subOut,r});
  }
  // IMPULSO (modo boost): aplicado por ÚLTIMO, sobre o total já fechado (tática, capitão, etc.).
  // Modelo novo: entry.boost_chips = lista de valores das fichas neste jogo, ex [25,15] ou [-20].
  //   o % total é a SOMA das fichas (positivas e negativas).
  // Modelo antigo (retrocompat): entry.boost = nº de fichas × BOOST_PCT.
  let boostPct=0, boostTokens=0;
  const chips=entry.boost_chips;
  if(Array.isArray(chips)&&chips.length){
    boostPct=chips.reduce((s,v)=>s+(Number(v)||0),0);
    boostTokens=chips.length;
  }else{
    boostTokens=Math.max(0,parseInt(entry.boost,10)||0);
    boostPct=BOOST_PCT*boostTokens;
  }
  const boostMult=1+(boostPct/100);
  const finalTotal=Math.round(sum*boostMult*10)/10;
  return {username:entry.username,total:finalTotal,boost:boostTokens,boostPct,boostChips:Array.isArray(chips)?chips:null,boostMult,view,captain:entry.captain,tactic:entry.tactic,subOut,squadSum:sq};
}
