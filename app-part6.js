// renderiza uma partida do histórico com jogadores CLICÁVEIS (detalhe + arquétipo)
// prefix distingue contexto ("m"=membro, "p"=perfil próprio) pra estados de toggle separados
function histGameHTML(h,hi,prefix){
  const open=_openHistGame[prefix+hi];
  const MODECOLOR={
    avulsa:"var(--mid)",
    select:"#5CA8FF",
    full:MODE_META.full.color,
    boost:MODE_META.boost.color,
    confianca:MODE_META.confianca.color,
    previsao:MODE_META.previsao.color,
    zebra:MODE_META.zebra.color,
    sobrevivencia:MODE_META.sobrevivencia.color,
    capitaoduplo:MODE_META.capitaoduplo.color
  };
  const MODELABEL={
    avulsa:"AVULSA",
    select:"🎯 SELECIONE",
    full:"🏆 COMPLETO",
    boost:"⚡ IMPULSO",
    confianca:"📊 CONFIANÇA",
    previsao:"🔮 PREVISÃO",
    zebra:"🐎 ZEBRA",
    sobrevivencia:"🛡️ SOBREVIVÊNCIA",
    capitaoduplo:"👑 CAPITÃO DUPLO"
  };
  const e=h.entry;
  // cor da nota principal: normal se for avulsa; cor do modo + aviso se não tem avulsa
  const headColor=h.isAvulsa?(e.total<0?"var(--red)":"var(--amber)"):MODECOLOR[h.principalMode];
  const noAvulsaTag=h.isAvulsa?"":` <span style="font-size:9px;color:${MODECOLOR[h.principalMode]};border:1px solid ${MODECOLOR[h.principalMode]};border-radius:6px;padding:1px 5px">sem avulsa · ${MODELABEL[h.principalMode]}</span>`;
  let html=`<div class="receipt"><div class="rhead" onclick="toggleHistGame('${prefix}',${hi})">
    <div class="sl mono" style="width:auto;color:var(--amber)">${h.pos}º/${h.of}</div>
    <div class="nm">${esc(h.match_name)}${noAvulsaTag}<small>${esc(h.comp||"")} · ${h.variants.length} modo${h.variants.length>1?"s":""} jogado${h.variants.length>1?"s":""} · toque p/ ver</small></div>
    <div class="tot mono" style="color:${headColor}">${e.total.toFixed(1)}</div></div>`;
  html+=`<div class="expandable ${open?"open":""}"><div class="rbody">`;
  if(open){
    // uma seção por modo (variante)
    h.variants.forEach((v,mi)=>{
      const col=MODECOLOR[v.mode]||"var(--mid)";
      const sc=v.entry;
      const tacName=window.ENGINE_TACTICS[sc.tactic]?.name||sc.tactic||"—";
      const descarte=(v.mode==="select"&&!v.counts)?` <span style="font-size:9px;color:var(--dim)">(não travado · não contou)</span>`:"";
      const boostTag=(v.mode==="boost"&&sc.boostPct)?` <span style="color:${sc.boostPct<0?"#FF6B6B":col}">⚡ ${sc.boostPct<0?"":"+"}${sc.boostPct}%</span>`:"";
      html+=`<div style="border-left:3px solid ${col};padding:6px 0 6px 10px;margin:8px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-family:'Saira Condensed';font-weight:800;font-size:12px;letter-spacing:.05em;color:${col}">${MODELABEL[v.mode]}${v.roundName?` · ${esc(v.roundName)}`:""}${descarte}</span>
          <span class="mono" style="color:${col};font-weight:700">${sc.total.toFixed(1)}</span>
        </div>
        <div style="font-size:10px;color:var(--dim);margin:2px 0 4px">cap ${SLOT_LABEL[sc.captain]||"?"} · ${esc(tacName)}${boostTag}</div>`;
      // jogadores clicáveis desta variante
      sc.view.filter(Boolean).forEach((vw,vi)=>{
        const pl=h.ctx.byId[vw.pid];
        const r=vw.r;
        const pkey=prefix+hi+"_"+mi+"_"+vi;
        const pOpen=_openHistPlayer[pkey];
        const capTag=vw.cap?` <span class="badgeC">C</span>`:"";
        const subTag=vw.subIn?` <span style="font-size:9px;color:var(--green)">↑entrou</span>`:"";
        const benchTag=vw.slot==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:"";
        const archTag=r&&r.meta&&r.meta.arch&&r.meta.arch!=="—"?` <span style="font-size:9px;color:var(--amber)">⭑ ${esc(r.meta.arch)}</span>`:"";
        const face=pl&&typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:h.roomId,id:pl.id,team:pl.team,name:pl.name},"microface"):"";
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleHistPlayer('${pkey}')"><span style="display:flex;align-items:center;gap:7px"><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[vw.slot]}</b> ${face}<span>${esc(pl?pl.name:"?")}</span>${capTag}${subTag}${benchTag}${archTag}</span><span class="v mono ${vw.pts>0?"plus":vw.pts<0?"minus":""}">${vw.slot==="BENCH"?"—":(vw.pts>0?"+":"")+vw.pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:8px 10px;margin:0 0 6px">`;
          html+=`<div style="font-size:10px;color:var(--dim);margin-bottom:4px">📋 ${r.minutes}' em campo</div>`;
          if(!r.statLines.length)html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`;
          r.statLines.forEach(([l,c,u,pts])=>{html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">${l} <b style="color:var(--mid)">${c}×</b> <i style="color:var(--dim);font-size:10px">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`;});
          if(r.lines.length){html+=`<div style="font-size:10px;color:var(--dim);margin:6px 0 2px">⚙️ Modificadores</div>`;
            r.lines.forEach(([k,val])=>{html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`;});}
          if(vw.cap)html+=`<div class="line" style="padding:3px 0"><span style="font-size:12px">Capitão</span><span class="v mono plus">×1.20</span></div>`;
          html+=`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span></div>`;
          html+=`</div>`;
        }
      });
      html+=`</div>`;
    });
  }
  html+=`</div></div>`;
  html+=`</div>`;
  return html;
}
let _openHistGame={}, _openHistPlayer={};
function toggleHistGame(prefix,i){const k=prefix+i;_openHistGame[k]=!_openHistGame[k];render();}
function toggleHistPlayer(k){_openHistPlayer[k]=!_openHistPlayer[k];render();}
function resultHTML(){
  const pp=APP.prepool,m=APP.match;
  if(!m||m.status!=="finished")return `<div class="card"><p class="p">O jogo ainda não foi finalizado.</p><button class="btn ghost" onclick="go('room')">← Voltar</button></div>`;
  const eng=buildMatchCtx();
  const scored=APP.entries.map(e=>scoreEntry(JSON.parse(JSON.stringify(e)),eng)).sort((a,b)=>b.total-a.total);
  const mine=scored.find(s=>s.username===APP.user?.username);
  const TAC=window.ENGINE_TACTICS;
  const inRound=APP.roundId&&APP.roundRooms.some(rr=>rr.room_id===APP.roomId);
  let html=`<div class="scorebar"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="tag">${esc(pp.comp)} · FINALIZADO</div><div class="userchip" onclick="${inRound?`go('round',null,'${APP.roundId}')`:"go('home')"}" style="cursor:pointer;flex-shrink:0">← voltar</div></div>
    <div class="score disp"><div><div class="team">${esc(pp.home.name)}</div></div><div class="vs mono">${m.score[0]}–${m.score[1]}</div><div style="text-align:right"><div class="team">${esc(pp.away.name)}</div></div></div></div>`;
  // ranking — toque numa pessoa pra ver o time dela
  html+=`<div class="card"><div class="h2 disp">Ranking da sala${helpBtn("ranking")}</div>`;
  if(scored.length===0)html+=`<p class="p">Ninguém montou time nesta sala ainda.</p>`;
  scored.forEach((s,i)=>{
    const isMe=s.username===APP.user?.username;
    const op=_openRank[i];
    html+=`<div class="rank${isMe?" me":""}" style="cursor:pointer" onclick="toggleRank(${i})"><div class="po mono">${i+1}º</div><div class="nm">${esc(s.username)}<small>cap: ${esc(SLOT_LABEL[s.captain])} · ${TAC[s.tactic]?.name||s.tactic} · toque p/ ver time</small></div><div class="pt mono">${s.total.toFixed(1)}</div></div>`;
    html+=`<div class="expandable ${op?"open":""}"><div style="border:1px solid var(--line);border-top:none;border-radius:0 0 12px 12px;margin:-8px 0 10px;padding:6px 12px 10px;background:var(--panel2)">`;
    if(op){
      html+=`<p class="p" style="font-size:10px;margin:0 0 4px">toque num jogador p/ ver o cálculo</p>`;
      s.view.filter(Boolean).forEach(v=>{
        const pl=APP._byId[v.pid];
        const capTag=v.cap?` <span class="badgeC">C</span>`:"";
        const subTag=v.subIn?` <span style="font-size:9px;color:var(--green)">↑entrou</span>`:"";
        const benchTag=v.slot==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:"";
        const pkey="rk_"+i+"_"+v.slot;
        const pOpen=_openRankPlayer[pkey];
        const r=v.r;
        const face=pl&&typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:pl.id,team:pl.team,name:pl.name},"microface"):"";
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleRankPlayer('${pkey}')"><span style="display:flex;align-items:center;gap:7px"><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[v.slot]}</b> ${face}<span>${esc(pl?pl.name:"?")}</span>${capTag}${subTag}${benchTag} <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${v.pts>0?"plus":v.pts<0?"minus":""}">${v.slot==="BENCH"?"—":(v.pts>0?"+":"")+v.pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
            <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo${helpBtn("apuracao")}</div>
            ${(r.statLines||[]).map(([l,c,u,pts])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
            ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
            ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
            ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
          </div>`;
        }
      });
    }
    html+=`</div></div>`;
  });
  html+=`</div>`;
  html+=resultBadgesHTML(scored);
  html+=resultDuelHTML(scored,mine);
  // TIME IDEAL — escalação que teria dado a maior pontuação possível
  html+=dreamTeamHTML();
  // minha apuração detalhada
  if(mine){
    html+=`<div class="card"><div class="h2 disp">Sua apuração</div><p class="p" style="margin-bottom:10px">Toque em cada jogador para abrir o cálculo.</p>`;
    mine.view.filter(Boolean).forEach((v,idx)=>{html+=receiptHTML(v,idx);});
    html+=`<div class="line total" style="font-size:16px;padding:10px 4px 4px"><span class="disp">TOTAL</span><span class="v mono" style="color:var(--amber);font-size:22px">${mine.total.toFixed(1)}</span></div>`;
    if(mine.subOut)html+=`<p class="p" style="margin-top:8px">🔄 Substituição: banco entrou no slot ${SLOT_LABEL[mine.subOut]}.</p>`;
    html+=`</div>`;
  }
  // botão + tabela de pontuação base de TODOS os jogadores do jogo (histórico, sem cap/tática/banco)
  html+=`<div class="card"><div class="rhead" style="padding:0;cursor:pointer" onclick="toggleBaseAll()"><div class="nm disp" style="font-size:16px">📊 Base de todos os jogadores</div><div class="tot mono" style="color:var(--dim);font-size:14px">${_openBaseAll?"▲":"▼"}</div></div>`;
  if(_openBaseAll){
    html+=`<p class="p" style="margin:8px 0 10px">Nota individual de cada jogador na partida (sem capitão, tática ou banco). Só quem entrou em campo.</p>`;
    html+=baseAllHTML(eng);
  }
  html+=`</div>`;
  // admin: arquivar/desarquivar a partida
  if(isAdmin()){
    const arq=isArchived(APP.roomId);
    html+=`<button class="btn ghost" style="border-color:${arq?"var(--green)":"var(--amber)"};color:${arq?"var(--green)":"var(--amber)"};margin-bottom:10px" onclick="${arq?`unarchiveGame('${APP.roomId}')`:`askArchive('${APP.roomId}')`}">${arq?"♻️ Desarquivar partida":"📥 Arquivar partida (mandar pro histórico)"}</button>`;
  }
  return html;
}
function resultBadgesHTML(scored){
  if(!scored||!scored.length)return"";
  const medals=[];
  const winner=scored[0];
  medals.push({icon:"🏆",title:"Maior pontuação",text:`${winner.username} fez ${winner.total.toFixed(1)} pts.`});
  let bestCap=null,bestPlayer=null,biggestBench=null;
  scored.forEach(s=>{
    (s.view||[]).forEach(v=>{
      if(v.slot==="BENCH"&&v.pts>0){if(!biggestBench||v.pts>biggestBench.pts)biggestBench={user:s.username,pts:v.pts};}
      if(v.cap){if(!bestCap||v.pts>bestCap.pts)bestCap={user:s.username,pts:v.pts};}
      if(v.slot!=="BENCH"&&(!bestPlayer||v.pts>bestPlayer.pts)){
        const pl=APP._byId&&APP._byId[v.pid];
        bestPlayer={user:s.username,pts:v.pts,name:pl?pl.name:"jogador"};
      }
    });
  });
  if(bestCap)medals.push({icon:"👑",title:"Melhor capitão",text:`${bestCap.user} tirou ${bestCap.pts.toFixed(1)} pts do capitão.`});
  if(bestPlayer)medals.push({icon:"⭐",title:"Melhor carta",text:`${bestPlayer.name} carregou ${bestPlayer.user} com ${bestPlayer.pts.toFixed(1)} pts.`});
  if(biggestBench)medals.push({icon:"🪑",title:"Banco salvou",text:`${biggestBench.user} ganhou ${biggestBench.pts.toFixed(1)} pts vindos do banco.`});
  return `<div class="card"><div class="h2 disp">🏅 Medalhas da partida</div><div class="medalgrid">${medals.map(m=>`<div class="medalcard"><b>${m.icon} ${esc(m.title)}</b><small>${esc(m.text)}</small></div>`).join("")}</div></div>`;
}
function resultDuelHTML(scored,mine){
  if(!mine||!scored||scored.length<2)return"";
  const rival=scored[0].username===mine.username?scored[1]:scored[0];
  if(!rival)return"";
  const slots=["GK","DEF","MID","ATT","FLEX","BENCH"];
  const row=(sl)=>{
    const a=(mine.view||[]).find(v=>v.slot===sl);
    const b=(rival.view||[]).find(v=>v.slot===sl);
    const ap=a?Number(a.pts)||0:0,bp=b?Number(b.pts)||0:0;
    const an=a&&APP._byId&&APP._byId[a.pid]?APP._byId[a.pid].name:"—";
    const bn=b&&APP._byId&&APP._byId[b.pid]?APP._byId[b.pid].name:"—";
    return `<div class="line" style="gap:8px"><span style="width:42%;color:${ap>=bp?"var(--green)":"var(--dim)"}"><b>${SLOT_LABEL[sl]}</b> ${esc(an)} (${ap.toFixed(1)})</span><span style="color:var(--dim)">×</span><span style="width:42%;text-align:right;color:${bp>ap?"var(--green)":"var(--dim)"}">${esc(bn)} (${bp.toFixed(1)})</span></div>`;
  };
  return `<div class="card"><div class="h2 disp">⚔️ Seu duelo contra ${esc(rival.username)}</div><p class="p" style="margin-bottom:8px">Comparação slot por slot contra ${rival.username===scored[0].username?"o líder":"o próximo rival"}.</p>${slots.map(row).join("")}</div>`;
}
let _openBaseAll=false;
function toggleBaseAll(){_openBaseAll=!_openBaseAll;render();}
function baseAllHTML(eng){
  const pp=APP.prepool,m=APP.match;
  const rows=pp.players.map(meta=>{
    const st=m.players[String(meta.id)];
    if(!st||!st.min)return null; // só quem jogou
    const r=eng.scorePlayer(Object.assign({pos:meta.pos,team:meta.team},st),null,null);
    return {meta,r,name:meta.name,team:meta.team,pos:meta.pos,pts:r.total,min:r.minutes};
  }).filter(Boolean).sort((a,b)=>b.pts-a.pts);
  if(!rows.length)return `<p class="p">Sem dados de jogadores.</p>`;
  return rows.map((row,i)=>{
    const open=_openBase[i];
    const r=row.r;
    let body="";
    if(open){
      body=`
        <div class="bsub" style="border:none;margin-top:0;padding-top:0">📋 Estatísticas · ${r.minutes}' em campo${helpBtn("apuracao")}</div>
        ${r.statLines.length===0?`<div class="line"><span>Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`:""}
        ${r.statLines.map(([l,c,u,pts])=>`<div class="line stat"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
        ${r.lines.length?`<div class="bsub">⚙️ Modificadores${helpBtn("dvg")}</div>`:""}
        ${r.lines.map(([k,val])=>`<div class="line"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
        <div class="line total"><span>NOTA BASE</span><span class="v mono">${r.total.toFixed(1)}</span></div>
        ${r.evNote.length?`<div class="metricbox">${r.evNote.map(e=>`<div>${esc(e)}</div>`).join("")}</div>`:""}
        <div class="chips"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${helpBtn("arquetipo")}${r.meta.traits.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span>${helpBtn("raridade")}</div>
      `;
    }
    const face=typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:row.meta.id,team:row.team,name:row.name},"pface"):"";
    const nmJs=esc(row.name).replace(/'/g,"\\'");
    const infoBtn=`<button class="radarbtn" onclick="event.stopPropagation();window.openPlayerRadar&&window.openPlayerRadar('${nmJs}','${row.pos}','${APP.roomId}')" title="Ver perfil completo">ℹ️</button>`;
    // persona (estilo de química) do jogador
    let personaTag="";
    if(typeof window!=="undefined"&&window.personaOf&&window.QUIMICA){
      const pk=window.personaOf(row.name,row.pos);
      const per=pk&&pk!=="camaleao"?window.QUIMICA.PERSONAS[pk]:null;
      if(per) personaTag=`<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;color:var(--chalk);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:1px 6px;margin-left:6px"><span style="font-size:10px">${per.ico}</span>${esc(per.nome)}</span>`;
    }
    return `<div class="receipt"><div class="rhead" onclick="toggleBase(${i})">
      <div class="sl mono pc-${row.pos}">${SLOT_LABEL[row.pos]}</div>
      ${face}<div class="nm">${esc(row.name)}<span class="teamtag" style="--tc:${teamColor(row.team)};margin-left:6px">${row.team}</span>${personaTag} <small>${row.min}' · toque p/ detalhe</small></div>
      ${infoBtn}<div class="tot mono${row.pts<0?" neg":""}">${row.pts>0?"+":""}${row.pts.toFixed(1)}</div></div><div class="expandable ${open?"open":""}"><div class="rbody">${body}</div></div></div>`;
  }).join("");
}
let _openBase={};
function toggleBase(i){_openBase[i]=!_openBase[i];render();}
// ── TIME IDEAL (dream team) ──
let _dreamCache={};          // roomId → resultado de computeDreamTeam
let _dreamOpen=false;        // card aberto?
let _dreamPlayer={};         // jogadores expandidos no time ideal
let _dreamCalc={};           // roomId → "calculando"
function toggleDream(){
  _dreamOpen=!_dreamOpen;
  // calcula sob demanda (assíncrono pra não travar a UI), só na 1ª vez
  if(_dreamOpen&&_dreamCache[APP.roomId]===undefined&&!_dreamCalc[APP.roomId]){
    _dreamCalc[APP.roomId]=true;
    render();
    setTimeout(()=>{
      try{_dreamCache[APP.roomId]=computeDreamTeam(APP.roomId);}
      catch(e){_dreamCache[APP.roomId]=null;}
      _dreamCalc[APP.roomId]=false;render();
    },30);
    return;
  }
  render();
}
function toggleDreamPlayer(k){_dreamPlayer[k]=!_dreamPlayer[k];render();}
function dreamTeamHTML(){
  const roomId=APP.roomId;
  const calc=_dreamCalc[roomId];
  const best=_dreamCache[roomId];
  let html=`<div class="card"><div class="rhead" style="padding:0;cursor:pointer" onclick="toggleDream()"><div class="nm disp" style="font-size:16px">🧠 Time ideal da partida</div><div class="tot mono" style="color:var(--dim);font-size:14px">${_dreamOpen?"▲":"▼"}</div></div>`;
  if(_dreamOpen){
    if(calc){
      html+=`<p class="p" style="margin:10px 0"><span class="loading">Calculando a escalação perfeita…</span></p>`;
    }else if(!best){
      html+=`<p class="p" style="margin:10px 0">Não foi possível calcular (jogo sem dados suficientes).</p>`;
    }else{
      const ctx=buildCtxFor(roomId);
      const TAC=window.ENGINE_TACTICS;
      html+=`<p class="p" style="margin:8px 0 4px">A escalação que teria feito a <b style="color:var(--amber)">maior pontuação possível</b> nesta partida, respeitando as ${BUDGET_IDEAL} moedas.</p>`;
      html+=`<div class="slots" style="grid-template-columns:repeat(3,1fr);margin:10px 0">
        ${statBox("🏆",best.total.toFixed(1),"pontos")}
        ${statBox("🧠",TAC[best.tactic]?.name||best.tactic,"tática")}
        ${statBox("💰",best.spend+"/"+BUDGET_IDEAL,"gasto")}
      </div>`;
      html+=`<p class="p" style="font-size:10px;margin:0 0 6px">toque num jogador p/ ver o cálculo</p>`;
      const order=["GK","DEF","MID","ATT","FLEX"];
      for(const sl of order){
        const it=best.picks[sl];
        const pl=ctx.byId[it.id];
        const isCap=it.id===best.captainId;
        // pontua o jogador no contexto do time ideal (com a tática vencedora)
        const r=ctx.eng.scorePlayer(it.raw,best.tactic,best.sq);
        let pts=r.total; if(isCap)pts=Math.round(pts*1.2*10)/10;
        const capTag=isCap?` <span class="badgeC">C</span>`:"";
        const pkey="dream_"+sl;
        const pOpen=_dreamPlayer[pkey];
        const face=pl&&typeof playerPortraitHTML==="function"?playerPortraitHTML({roomId:APP.roomId,id:pl.id,team:pl.team,name:pl.name},"pface"):"";
        const dNmJs=esc(pl?pl.name:"").replace(/'/g,"\\'");
        const dInfoBtn=(pl&&typeof window!=="undefined"&&window.openPlayerRadar)?`<button class="radarbtn" onclick="event.stopPropagation();window.openPlayerRadar('${dNmJs}','${pl.pos}','${APP.roomId}')" title="Ver perfil completo">ℹ️</button>`:"";
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleDreamPlayer('${pkey}')"><span style="display:flex;align-items:center;gap:8px;min-width:0"><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[sl]}</b> ${face}<span>${esc(pl?pl.name:"?")}</span><span class="teamtag" style="--tc:${teamColor(pl?pl.team:"")};margin-left:0">${pl?pl.team:""}</span>${capTag}${dInfoBtn} <span style="color:var(--dim);font-size:10px">${it.price}💰</span> <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${pts.toFixed(1)}</span></div>`;
        if(pOpen&&r){
          html+=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
            <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo</div>
            ${(r.statLines||[]).map(([l,c,u,p2])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${p2>0?"plus":p2<0?"minus":""}">${p2>0?"+":""}${(+p2).toFixed(1)}</span></div>`).join("")}
            ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
            ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
            ${isCap?`<div class="line" style="padding:2px 0"><span>👑 Capitão (×1.2)</span><span class="v mono plus">+${(r.total*0.2).toFixed(1)}</span></div>`:""}
            ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
          </div>`;
        }
      }
      if(best.quimicaPts>0){
        html+=`<div class="line" style="padding:6px 4px;border-top:1px solid var(--line);margin-top:4px"><span style="display:flex;align-items:center;gap:6px"><span style="font-size:13px">🧬</span><span style="color:var(--chalk);font-size:12px">Química do time</span><span style="color:var(--dim);font-size:10px">(personalidades entrosadas)</span></span><span class="v mono plus">+${best.quimicaPts.toFixed(1)}</span></div>`;
      }
      html+=`<div class="line total" style="font-size:15px;padding:10px 4px 4px"><span class="disp">TOTAL IDEAL</span><span class="v mono" style="color:var(--amber);font-size:20px">${best.total.toFixed(1)}</span></div>`;
    }
  }
  html+=`</div>`;
  return html;
}
let _openRec={};
let _openRank={};
function toggleRank(i){_openRank[i]=!_openRank[i];render();}
let _openRankPlayer={};
function toggleRankPlayer(k){_openRankPlayer[k]=!_openRankPlayer[k];render();}
function receiptHTML(v,idx){
  const byId=APP._byId,p=byId[v.pid],r=v.r,open=_openRec[idx];
  let body="";
  if(open){
    body=`
      <div class="bsub" style="border:none;margin-top:0;padding-top:0">📋 Estatísticas · ${r.minutes}' em campo</div>
      ${r.statLines.length===0?`<div class="line"><span>Sem ações pontuáveis</span><span class="v mono">0.0</span></div>`:""}
      ${r.statLines.map(([l,c,u,pts])=>`<div class="line stat"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
      ${r.lines.length?`<div class="bsub">⚙️ Modificadores</div>`:""}
      ${r.lines.map(([k,val])=>`<div class="line"><span>${k}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
      ${v.cap?`<div class="line"><span>Capitão</span><span class="v mono plus">×1.20</span></div>`:""}
      <div class="line total"><span>TOTAL DO SLOT</span><span class="v mono">${v.pts.toFixed(1)}</span></div>
      ${r.evNote.length?`<div class="metricbox">${r.evNote.map(e=>`<div>${esc(e)}</div>`).join("")}</div>`:""}
      <div class="chips"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${r.meta.traits.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${r.meta.rarity.toUpperCase()}</span></div>
      ${archHistoryHTML(p?p.name:"")}
    `;
  }
  return `<div class="receipt"><div class="rhead" onclick="toggleRec(${idx})">
    <div class="sl mono">${SLOT_LABEL[v.slot]}</div>
    <div class="nm">${esc(p.name)}<small>${p.team} · ${p.pos}${v.subIn?' · ↑ entrou do banco (×0,8)':''}</small></div>
    ${v.cap?'<span class="badgeC">C ×1.20</span>':''}
    <div class="tot mono${v.pts<0?" neg":""}">${v.pts.toFixed(1)}</div></div><div class="expandable ${open?"open":""}"><div class="rbody">${body}</div></div></div>`;
}
function toggleRec(i){_openRec[i]=!_openRec[i];render();}
// histórico colecionável do atleta nos jogos JÁ encerrados (arquivados)
function archHistoryHTML(playerName){
  const h=playerArchHistory(playerName);
  if(!h||h.games<=0)return"";
  const arch=Object.entries(h.archetypes).sort((a,b)=>b[1]-a[1]);
  const traits=Object.entries(h.traits).sort((a,b)=>b[1]-a[1]);
  if(!arch.length&&!traits.length)return"";
  const fmt=arr=>arr.map(([k,n])=>`${esc(k)}${n>1?` ×${n}`:""}`).join(" · ");
  return `<div class="metricbox" style="border-color:var(--blue);color:var(--blue)">
    <div style="color:var(--dim);letter-spacing:.08em;font-size:10px;margin-bottom:4px">📚 HISTÓRICO NESTE FANTASY (${h.games} jogo${h.games>1?"s":""})</div>
    ${arch.length?`<div style="color:var(--chalk)">Arquétipos: ${fmt(arch)}</div>`:""}
    ${traits.length?`<div style="color:var(--dim);margin-top:2px">Selos: ${fmt(traits)}</div>`:""}
    ${h.best?`<div style="margin-top:2px">Melhor carta: <b>${esc(h.best)}</b></div>`:""}
  </div>`;
}

// ============================================================
// RENDER
// ============================================================
function render(){
  const root=$("root");
  if(needLogin()){root.innerHTML=topbarHTML()+loginModalHTML();return;}
  let panel="";
  if(APP.view==="groups")panel=groupsHTML();
  else if(APP.view==="home")panel=homeHTML();
  else if(APP.view==="round")panel=roundHTML();
  else if(APP.view==="room")panel=roomHTML();
  else if(APP.view==="build")panel=buildHTML();
  else if(APP.view==="result")panel=resultHTML();
  else if(APP.view==="profile")panel=profileHTML();
  else if(APP.view==="members")panel=membersHTML();
  else if(APP.view==="member")panel=memberHTML();
  else if(APP.view==="league")panel=leagueHTML();
  else if(APP.view==="phase")panel=phaseHTML();
  else if(APP.view==="draft")panel=draftHTML();
  root.innerHTML=topbarHTML()+panel+footHTML()+confirmModalHTML();
  // ajuda visual do teto do draft: preenche assim que o modal renderiza
  if(APP.confirm&&APP.confirm.mode==="createDraftSeason"){ try{ requestAnimationFrame(updDraftHint); }catch(e){ try{updDraftHint();}catch(_){} } }
}
function topbarHTML(){
  const inGroup=APP.groupId&&APP.user;
  return `<div class="topbar">
    <div class="logo" onclick="go('groups')" style="cursor:pointer">FANTASY PvP<br><small>v2.6.0 · PvP</small></div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="userchip" onclick="toggleRules()" style="padding:5px 11px;font-weight:700" title="Como funciona">?</div>
      <div class="userchip" onclick="toggleManual()" style="padding:5px 11px;font-weight:700;cursor:pointer" title="Manual completo">📖 MANUAL</div>
      ${isDev()?`<div class="userchip" onclick="toggleDevMode()" style="cursor:pointer;border-color:${APP.devMode?"var(--amber)":"var(--line)"};color:${APP.devMode?"var(--amber)":"var(--dim)"}" title="Alternar modo DEV / jogador">${APP.devMode?"🛠 DEV":"🎮 jogador"}</div>`:""}
      ${APP.user?`<div class="userchip">${inGroup?`<span onclick="openProfile()" style="cursor:pointer" title="Meu perfil">👤 <b>${esc(APP.user.username)}</b></span>`:`👤 <b>${esc(APP.user.username)}</b>`} · <span onclick="logout()" style="cursor:pointer">sair</span></div>`:""}
    </div>
  </div>${APP.showRules?rulesModalHTML():""}${APP.help?helpModalHTML():""}${APP.showManual?superManualHTML():""}${APP.showQuimica?quimicaGuideHTML():""}${APP.calOpen?calModalHTML():""}`;
}
function toggleRules(){APP.showRules=!APP.showRules;render();}
function toggleManual(){APP.showManual=!APP.showManual;render();}
function toggleQuimicaGuide(){APP.showQuimica=!APP.showQuimica;render();}
function quimicaGuideHTML(){
  if(typeof window==="undefined"||!window.QUIMICA) return "";
  const Q=window.QUIMICA, P=Q.PERSONAS;
  const SETOR={GK:"Goleiros",DEF:"Defensores",MID:"Meio-campo",ATT:"Ataque",ANY:"Coringa"};
  const SETCOL={GK:"var(--pos-gk)",DEF:"var(--pos-def)",MID:"var(--pos-mid)",ATT:"var(--pos-att)",ANY:"var(--pos-flex)"};
  // personas agrupadas por setor
  let personasHTML="";
  ["GK","DEF","MID","ATT","ANY"].forEach(setor=>{
    const list=Object.entries(P).filter(([k,v])=>v.setor===setor);
    if(!list.length) return;
    const col=SETCOL[setor];
    personasHTML+=`<div style="font-size:11px;font-weight:800;letter-spacing:.04em;color:${col};margin:12px 0 6px;text-transform:uppercase">${SETOR[setor]}</div>`;
    list.forEach(([k,v])=>{
      personasHTML+=`<div style="display:flex;align-items:center;gap:10px;margin:6px 0;padding:8px;background:color-mix(in srgb,${col} 7%,transparent);border:1px solid color-mix(in srgb,${col} 22%,transparent);border-radius:10px">`
        +`<span style="font-size:22px;line-height:1">${v.ico}</span>`
        +`<div><div style="font-weight:700;color:var(--chalk);font-size:13px">${v.nome}</div>`
        +`<div style="color:var(--dim);font-size:11px;line-height:1.4">${v.desc}</div></div></div>`;
    });
  });
  // combos
  const comboHTML=Q.COMBOS.slice().sort((a,b)=>b.pts-a.pts).map(c=>{
    const a=P[c.par[0]], b=P[c.par[1]];
    return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0;padding:9px;background:color-mix(in srgb,#34d399 7%,transparent);border:1px solid color-mix(in srgb,#34d399 18%,transparent);border-radius:10px">`
      +`<span style="font-size:17px;white-space:nowrap">${a.ico}${b.ico}</span>`
      +`<div style="flex:1"><div style="font-weight:700;color:var(--chalk);font-size:13px">${c.nome}</div>`
      +`<div style="color:var(--dim);font-size:11px;line-height:1.4">${a.nome} + ${b.nome} — ${c.txt}</div></div>`
      +`<span class="mono" style="color:#34d399;font-weight:800;font-size:14px">+${c.pts.toFixed(1)}</span></div>`;
  }).join("");
  // reforço
  const rf=Q.REFORCO;
  const reforcoHTML=Object.keys(rf).map(Number).sort((x,y)=>x-y).map(n=>
    `<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;padding:7px 10px;background:rgba(255,255,255,.03);border-radius:8px;font-size:12px">`
    +`<span style="color:var(--chalk)"><b>${n}+</b> jogadores da mesma personalidade</span>`
    +`<span class="mono" style="color:#FFC247;font-weight:700">+${rf[n].toFixed(1)}</span></div>`).join("");

  const sec=(t)=>`<div style="font-family:'Saira Condensed';font-weight:800;font-size:15px;letter-spacing:.03em;text-transform:uppercase;color:var(--amber);margin:16px 0 4px">${t}</div>`;
  return `<div class="modal" onclick="toggleQuimicaGuide()"><div class="box" onclick="event.stopPropagation()" style="max-height:85vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">🧬 Guia de Química</div>
    <p class="p" style="margin:4px 0 2px;font-size:12px;line-height:1.5">Cada jogador tem uma <b style="color:var(--chalk)">personalidade</b> derivada do estilo dele na temporada. Você ganha <b style="color:var(--green)">bônus de química</b> de dois jeitos: <b>combinando</b> personalidades que se completam, ou <b>repetindo</b> a mesma. O bônus soma no total do time (teto de +${Q.CAP.toFixed(0)}), separado da tática.</p>

    ${sec("🧮 Como a conta funciona")}
    <p class="p" style="font-size:11.5px;line-height:1.55;margin:2px 0 6px">É um bônus <b style="color:var(--chalk)">por time</b>, não por jogador — soma <b>uma vez só</b> no seu total, não multiplica nada em cada carta.</p>
    <p class="p" style="font-size:11.5px;line-height:1.55;margin:2px 0 6px"><b style="color:var(--chalk)">A ordem não importa:</b> o jogo olha os 5 titulares de uma vez e soma <b>todos</b> os combos e reforços que existirem ao mesmo tempo. Não é em sequência.</p>
    <p class="p" style="font-size:11.5px;line-height:1.55;margin:2px 0 6px"><b style="color:var(--amber)">Teto de +${Q.CAP.toFixed(1)}:</b> se a soma passar disso, o excedente é cortado. Ex: 4 combos somando +5.6 viram +${Q.CAP.toFixed(1)} na pontuação. Acima do teto não adianta empilhar mais.</p>
    <p class="p" style="font-size:11.5px;line-height:1.55;margin:2px 0 10px">Esse bônus entra no total <b>antes</b> do impulso, e é <b>separado da tática</b> (a tática depende do que seus jogadores produzem no jogo real; a química você já vê na montagem).</p>

    ${sec("⚡ Combos (personalidades que se completam)")}
    <p class="p" style="font-size:11px;color:var(--dim);margin:2px 0 6px">Tenha um de cada personalidade do par no seu time pra ativar:</p>
    ${comboHTML}

    ${sec("🔁 Reforço (repetir identidade)")}
    <p class="p" style="font-size:11px;color:var(--dim);margin:2px 0 6px">Escalar vários da mesma personalidade dá bônus de identidade (quem está "sem estilo definido" não conta):</p>
    ${reforcoHTML}

    ${sec("🎭 Todas as personalidades")}
    ${personasHTML}

    <button class="btn" style="margin-top:14px" onclick="toggleQuimicaGuide()">Fechar guia</button>
  </div></div>`;
}
// ---- mini-ajudas contextuais (botão ? pequeno em vários lugares) ----
const HELP={
  minirodada:["Mini rodada","Você recebe um número de fichas (tokens) de entrada. Cada jogo que você escolher gasta 1 ficha e garante sua vaga naquele jogo. Você não precisa usar todas. Escolher os jogos certos (onde você acha que vai pontuar mais) é a estratégia. A escalação de cada jogo é montada depois e pode ser ajustada até a partida começar."],
  token:["Fichas de entrada","Cada mini rodada te dá um número fixo de fichas (ex: 2). Tocar no + verde de um jogo gasta 1 ficha e sela sua participação NAQUELE jogo. Enquanto a seleção estiver aberta, dá pra trocar à vontade. Quando a partida é fechada, suas escolhas travam."],
  escalacao:["Escalação","Montar o time é separado de escolher o jogo. A escalação fica salva e você pode mudá-la quantas vezes quiser até a partida começar — ela trava sozinha no apito inicial. Não existe 'confirmar equipe' aqui: o que está garantido é a vaga no jogo (a ficha)."],
  liga:["Liga","Junta várias rodadas numa classificação geral da temporada. Dois rankings: pontos de tabela (10/7/5/3/1 conforme a colocação em cada mini rodada) e pontuação clássica (soma do fantasy). Os pontos sobem somando das mini rodadas → rodadas → liga."],
  rodada:["Rodada","Uma fase que agrupa várias mini rodadas (ex: 'Fase de Grupos'). A classificação da rodada é a soma das mini rodadas dela."],
  capitao:["Capitão (×1.20)","Escolha 1 jogador (menos o banco) pra render 20% a mais. Vale a pena no jogador que você mais confia que vai pontuar."],
  tatica:["Tática","Escolha 1. Cada tática tem um ESTILO de jogo (marcação, posse, jogo aéreo, contra-ataque, finalização...) e dá um BÔNUS se, no fim da partida, o seu time se sair bem naquele estilo — e é só bônus, errar não tira pontos. Como o resultado depende do que rola em campo, na hora de montar mostramos uma TENDÊNCIA pelo perfil das posições que você escalou (e do capitão): o selo indica se seu time tem cara daquele estilo (✅ tende a ativar / ➖ pode / ⬜ pouco provável). Não é garantia, é um guia: monte na posição certa pra aumentar a chance. Ex: FLEX e capitão no ataque → Contra-Ataque tende a ativar."],
  quimica:["Química do time","Cada jogador tem uma PERSONALIDADE de jogo (Maestro, Matador, Muro, Torre, Motor, Veloz...) derivada do estilo dele na temporada. A Química é um BÔNUS POR TIME, separado da tática, que vem da MONTAGEM (você vê na hora, não depende do que rola no jogo): some personalidades que se COMPLETAM (ex: 🪄 Maestro que arma + 🎯 Matador que finaliza = bônus) ou REPITA uma identidade (vários do mesmo tipo = time com DNA). O jogo soma TODOS os combos e reforços de uma vez (a ordem não importa) e adiciona ao total do seu time, até um TETO pequeno — passou do teto, o excedente é cortado. É um bônus único do time, não multiplica por jogador. Personalidades aparecem como etiqueta em cada titular."],
  pool:["Pool de jogadores","Todos os jogadores dos dois times do confronto, com preço por qualidade. Use os filtros (time / posição) pra achar quem quer. Ordenados do mais caro pro mais barato."],
  orcamento:["Orçamento","Você tem 100 moedas pra montar os 5 TITULARES (Goleiro, Defensor, Meia, Atacante e FLEX). O BANCO é à parte: ele NÃO gasta moeda (é grátis). Cada jogador tem um preço pela qualidade (valor de mercado corrigido pela idade). Gastar tudo nos craques deixa o resto barato — equilibrar é parte da estratégia."],
  slots:["Os slots do time","Você monta 5 TITULARES — 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante e 1 FLEX (curinga de linha) — que gastam do seu orçamento. Mais o BANCO, que é grátis (regra à parte, toque no '?' do banco). Cada slot só aceita a posição certa; o FLEX é mais livre. Quem você escalar mas não entrar em campo fica com 0."],
  banco:["Banco (reserva grátis)","O banco é GRÁTIS — não gasta moeda do seu orçamento. Em troca, ele só aceita um jogador BARATO: o limite é o preço do SEU TITULAR MAIS BARATO (entre os 5 que você escalou). Ex: se seu titular mais barato custa 15, o banco aceita qualquer um que custe até 15, de qualquer posição. Conforme você troca os titulares, esse teto muda. Se o reserva ficar acima do novo teto, ele é liberado. Na partida, se um titular de linha for mal, o reserva pode entrar no lugar — mas rende só 80% da nota (pedágio por começar fora) e só substitui se, já com o desconto, superar o titular. Goleiro reserva só conta se o titular não jogar nenhum minuto."],
  flex:["FLEX (curinga)","O slot FLEX aceita um jogador de defesa, meio OU ataque (não goleiro). Serve pra você reforçar a posição que quiser — um 2º atacante, um meia a mais, etc. Ele conta na composição do time pra valer."],
  ranking:["Classificação","Quando o jogo acaba, todos os times da sala são pontuados e ordenados. Toque num nome pra ver a escalação e a apuração de cada jogador. Em mini rodadas/ligas, os pontos vão somando."],
  apuracao:["Apuração do jogador","Mostra de onde veio cada ponto: estatísticas (gols, defesas, desarmes...), modificadores (dificuldade, contexto de placar, clutch, tática), o bônus de capitão e o arquétipo. É a 'conta' completa da nota."],
  dvg:["Bônus de zebra (DvG)","Jogadores do time mais fraco (underdog) ganham um acréscimo. NÃO é fixo: quanto maior a diferença de força entre os times, maior o bônus — até um teto de +10%. A 'força' combina ELO + forma recente + mando de campo, então um time em boa fase 'sobe de força' e dá menos bônus de zebra. Se seu jogador é do favorito, não há bônus (×1.00). Apostar no azarão certo rende mais."],
  performance:["Performance (índices C+)","É a NOTA GERAL da atuação do jogador, de −3 a +4 pontos, separada dos eventos pontuais (gols, assists já contam antes). Combina 4 índices: (1) Envolvimento ofensivo — chutes, criação, passes progressivos, dribles; (2) Eficiência — quão difíceis eram os gols/assists/defesas pelo xG; (3) Segurança — desconta erros, faltas, cartões e ser driblado; (4) Volume defensivo — desarmes, recuperações, bloqueios, duelos aéreos. A média ponderada (ataque 30% + eficiência 30% + segurança 20% + defesa 20%) vira a nota. Jogou bem no geral = perto de +4; jogou mal/indisciplinado = negativo."],
  placar:["Placar (contexto do jogo)","Ajusta os pontos conforme o jogo estava: ações num jogo apertado (diferença de 1 gol ou empate) valem um pouco mais, porque pesam mais no resultado. 'Jogo vivo o tempo todo' = a partida ficou equilibrada do início ao fim."],
  clutch:["Clutch","Ações decisivas nos minutos finais (85'+) com o jogo apertado valem pontos extras. Um gol que decide no fim vale mais que um gol em jogo já ganho."],
  raridade:["Raridade","Selo de quão especial foi a atuação (Comum → Lendário), baseado na pontuação e no impacto do jogador naquele jogo. Quanto melhor jogou, mais rara a 'carta'."],
  arquetipo:["Arquétipos","Depois do jogo, cada jogador ganha um 'tipo' conforme a atuação (ex: Artilheiro, Muralha, Box-to-Box). É só cosmético/colecionável — não muda os pontos. Você coleciona os que escalou no seu perfil."],
};
function helpBtn(key){return `<span class="helpq" onclick="event.stopPropagation();showHelp('${key}')" title="O que é isso?">?</span>`;}
// dado o nome de um modificador (linha de r.lines), devolve a chave de HELP correspondente (ou null)
function modHelpKey(label){
  const l=(label||"").toLowerCase();
  if(l.includes("performance")||l.includes("índices")||l.includes("indices"))return "performance";
  if(l.includes("dvg")||l.includes("zebra")||l.includes("underdog"))return "dvg";
  if(l.includes("placar"))return "placar";
  if(l.includes("clutch"))return "clutch";
  if(l.includes("tática")||l.includes("tatica"))return "tatica";
  if(l.includes("dificuldade")||l.includes("xg")||l.includes("psxg"))return "apuracao";
  return null;
}
// renderiza um '?' ao lado do modificador se houver help
function modHelpBtn(label){const k=modHelpKey(label);return k?helpBtn(k):"";}
function showHelp(key){APP.help=key;render();}
function closeHelp(){APP.help=null;render();}
function calModalHTML(){
  const _DOWs=["dom","seg","ter","qua","qui","sex","sáb"];
  const _MONs=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  // mês visível
  let p=(APP.calMonth||"").split("-"); let Y=+p[0], M=+p[1];
  if(!Y||!M){const n=new Date();Y=n.getFullYear();M=n.getMonth()+1;}
  // mapa de dias com jogos a partir dos jogos do grupo
  const all=[];
  (APP.groupRooms||[]).forEach(gr=>{const cat=(APP.jogos||[]).find(j=>j.room_id===gr.room_id);if(cat)all.push(cat);});
  (APP.jogos||[]).forEach(j=>{if(isArchived(j.room_id))all.push(j);});
  // indexar por data exata: "YYYY-MM-DD" -> {n, dayKey}
  const mapaDia={};
  all.forEach(j=>{const ki=kickoffInfo(j.kickoff);if(!ki||!ki.dayKey||ki.dayKey.indexOf(" ")<0)return;
    const parts=ki.dayKey.split(" ")[1].split("/"); // dd/mm
    const k=ki.yr+"-"+parts[1]+"-"+parts[0];
    if(!mapaDia[k])mapaDia[k]={n:0,dayKey:ki.dayKey};
    mapaDia[k].n++;
  });
  // grade do mês
  const primeiro=new Date(Date.UTC(Y,M-1,1));
  const inicioDow=primeiro.getUTCDay();
  const diasNoMes=new Date(Date.UTC(Y,M,0)).getUTCDate();
  let celulas="";
  for(let i=0;i<inicioDow;i++) celulas+=`<div></div>`;
  for(let d=1; d<=diasNoMes; d++){
    const k=Y+"-"+String(M).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const info=mapaDia[k];
    const tem=!!info;
    const dowIdx=new Date(Date.UTC(Y,M-1,d)).getUTCDay();
    const dk=_DOWs[dowIdx]+" "+String(d).padStart(2,"0")+"/"+String(M).padStart(2,"0");
    const sel=(APP.homeDay===dk);
    const style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:10px;font-size:15px;"+
      (sel?"background:#7C6CF0;color:#fff;font-weight:800;":(tem?"background:#222C49;color:#fff;cursor:pointer;font-weight:700;":"color:#445566;"));
    celulas+=`<div ${tem?`onclick="pickCalDay('${encodeURIComponent(dk)}')"`:""} style="${style}">
      ${d}${tem?`<span style="width:5px;height:5px;border-radius:50%;background:${sel?"#fff":"#7C6CF0"};margin-top:3px"></span>`:""}
    </div>`;
  }
  return `<div class="modalwrap" onclick="closeCal()" style="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:40px 14px">
    <div onclick="event.stopPropagation()" style="background:#0E1525;border:1px solid #28324f;border-radius:18px;max-width:440px;width:100%;padding:16px;color:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <b style="font-size:17px">Calendário</b>
        <span onclick="closeCal()" style="cursor:pointer;font-size:20px;color:#8aa">✕</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span onclick="calNav(-1)" style="cursor:pointer;font-size:20px;padding:4px 12px">‹</span>
        <b style="font-size:15px">${_MONs[M-1]} ${Y}</b>
        <span onclick="calNav(1)" style="cursor:pointer;font-size:20px;padding:4px 12px">›</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:6px;color:#7d8aaa;font-size:11px;text-align:center">
        ${_DOWs.map(d=>`<div>${d}</div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${celulas}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;color:#7d8aaa;font-size:12px">
        <span style="width:7px;height:7px;border-radius:50%;background:#7C6CF0;display:inline-block"></span> dias com partidas
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="setHomeDay('todos')" style="flex:1;background:#222C49;color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;cursor:pointer">Ver recentes</button>
        <button onclick="APP.homeShowAll=true;APP.homeDay='todos';closeCal()" style="flex:1;background:#7C6CF0;color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;cursor:pointer">Ver todos</button>
      </div>
    </div>
  </div>`;
}
function helpModalHTML(){
  const h=HELP[APP.help];if(!h)return"";
  return `<div class="modal" onclick="closeHelp()"><div class="box" onclick="event.stopPropagation()">
    <div class="h2 disp" style="color:var(--amber)">${esc(h[0])}</div>
    <p class="p" style="margin:12px 0">${esc(h[1])}</p>
    <button class="btn" onclick="closeHelp()">Entendi</button>
  </div></div>`;
}
function rulesModalHTML(){
  return `<div class="modal" onclick="toggleRules()"><div class="box" onclick="event.stopPropagation()" style="max-height:80vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">Como funciona o Fantasy PvP</div>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">O jogo:</b> antes de cada partida real, abre uma "pool". Você monta um time de 6 jogadores escolhidos entre os elencos dos DOIS times que vão se enfrentar. Quando o jogo acontece, seus jogadores pontuam pelo que fizerem em campo de verdade.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Orçamento:</b> 100 moedas. Cada jogador tem um preço (qualidade técnica: valor de mercado corrigido pela idade). O BANCO é à parte: NÃO gasta moeda (é grátis).</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Os 6 slots:</b> 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Capitão (×1.20):</b> escolha 1 jogador (qualquer um menos o banco) pra pontuar 20% a mais.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Banco:</b> se um titular de linha pontuar pouco, o reserva pode entrar no lugar dele — mas o reserva rende só <b style="color:var(--chalk)">80%</b> da nota (pedágio por começar fora). Ele só entra se, já com o desconto, ainda superar o titular. <b style="color:var(--chalk)">Exceção do goleiro:</b> o GK do banco só entra se o GK titular não jogar NENHUM minuto. Se o titular jogar, o reserva fica com 0.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Tática:</b> escolha 1. Cada tática premia um ESTILO de jogo (marcação, posse, jogo aéreo, contra-ataque...). Ela <b style="color:var(--chalk)">ativa (bônus)</b> se, na partida, seus jogadores produzirem bastante naquele estilo — e é <b style="color:var(--chalk)">só bônus: errar não tira pontos</b>, no pior caso a tática só não ativa. Na hora de montar, um selo mostra a <b style="color:var(--chalk)">tendência</b> do seu time pra cada tática (✅ tende a ativar / ➖ pode / ⬜ pouco provável), olhando as posições que você escalou e o capitão — é um guia, não garantia. Todas as táticas são balanceadas: bater 1 das 2 metas dá +6 fixo no time (dividido entre os titulares). Conta todos que entraram, mesmo substituídos.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Pontuação:</b> gols, assistências, defesas, desarmes etc. somam pontos. Gol difícil vale mais que fácil. Gol nos minutos finais de jogo apertado vale mais (clutch). Time mais fraco (underdog) ganha um bônus — calculado por ELO, forma recente e mando de campo.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Penalidades:</b> o jogador perde pontos por cartão amarelo (-2), vermelho (-10 no 1º tempo / -6 no 2º), erro que levou a gol (-5), erro que levou a finalização (-2), pênalti cometido (-4), <b style="color:#FF6B6B">gol contra (-5)</b>, faltas e ser driblado. Um gol contra conta no placar do jogo e ainda desconta 5 pontos de quem o fez — pesa como um gol ao contrário.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Outras ações que pontuam:</b> além de gols e defesas, o jogo recompensa quem constrói: faltas sofridas, lançamentos longos certos e conduções progressivas (carregar a bola pra frente) dão pontos leves, premiando armadores e quem puxa contra-ataque.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Ranking:</b> quando o jogo acaba, todos os times da sala são pontuados e o ranking aparece, com a apuração detalhada de cada jogador.</p>
    <button class="btn" style="margin-top:8px" onclick="toggleRules()">Entendi</button>
  </div></div>`;
}
function superManualHTML(){
  const sec=(titulo,corpo)=>`<div style="margin:14px 0 4px"><div style="font-family:'Saira Condensed';font-weight:800;font-size:15px;letter-spacing:.03em;text-transform:uppercase;color:var(--amber)">${titulo}</div></div>${corpo}`;
  const p=(t)=>`<p class="p" style="margin:6px 0;font-size:13px;line-height:1.5">${t}</p>`;
  const b=(t)=>`<b style="color:var(--chalk)">${t}</b>`;
  return `<div class="modal" onclick="toggleManual()"><div class="box" onclick="event.stopPropagation()" style="max-height:85vh;overflow:auto">
    <div class="h2 disp" style="color:var(--amber)">📖 Manual completo</div>
    <p class="p" style="margin:4px 0 2px;font-size:11px;color:var(--dim)">Tudo que você precisa saber pra jogar e pra administrar. Toque fora ou no botão no fim pra fechar.</p>

    ${sec("1. A ideia do jogo",
      p(`Antes de cada partida real, abre uma ${b("pool")}. Você monta um time de 6 jogadores escolhidos entre os elencos dos ${b("dois")} times que vão se enfrentar. Quando o jogo acontece de verdade, seus jogadores pontuam pelo que fizerem em campo (gols, assistências, defesas, desarmes etc.).`))}

    ${sec("2. Como navegar",
      p(`A tela inicial tem 4 abas no topo:`)+
      p(`⚽ ${b("Partidas:")} os jogos avulsos. Monte time jogo a jogo, sem estar numa competição.`)+
      p(`🎯 ${b("Mini-rodadas:")} grupos de jogos com um modo (Completo, Impulso, Confiança ou Previsão). É onde mora a estratégia.`)+
      p(`📅 ${b("Rodadas:")} agrupam várias mini rodadas (ex: "Fase de Grupos"). Fora de liga.`)+
      p(`🏆 ${b("Ligas:")} juntam várias rodadas numa classificação geral da temporada.`)+
      p(`Toque numa aba pra abrir. O ${b("?")} ao lado de cada bloco explica os detalhes daquela parte.`))}

    ${sec("3. Montar seu time",
      p(`${b("Orçamento:")} 100 moedas. Cada jogador tem um preço que reflete a qualidade dele. O BANCO é à parte: NÃO gasta moeda (é grátis).`)+
      p(`${b("Os 6 slots:")} 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (pode ser def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.`)+
      p(`${b("Capitão (×1.20):")} escolha 1 jogador (menos o banco) pra render 20% a mais.`)+
      p(`${b("Banco:")} se um titular de linha for mal, o reserva entra no lugar — mas rende 80% da nota (pedágio). Só entra se, já com o desconto, superar o titular. O goleiro reserva só entra se o titular não jogar nenhum minuto.`)+
      p(`${b("Tática:")} escolha 1. Cada uma premia um estilo (marcação, posse, jogo aéreo, contra-ataque...) e dá um ${b("bônus")} nas ações dela se seus jogadores produzirem bastante naquilo no jogo — ${b("só bônus, errar não tira pontos")}. Na montagem, um selo mostra a ${b("tendência")} do seu time pra cada tática (✅ tende a ativar / ➖ pode / ⬜ pouco provável), calculada pelas posições escaladas e pelo capitão. É um guia, não garantia: o resultado real vem do que acontece em campo.`))}

    ${sec("4. De onde vêm os preços",
      p(`O preço de cada jogador reflete ${b("quantos pontos ele tende a fazer na engine")} — calculado pelo histórico recente dele (gols, assistências, defesas, desarmes...) combinado com o valor de mercado, corrigido por idade e posição.`)+
      p(`Quem jogou pouco não despenca nem dispara: o mercado segura a estimativa até ele ter minutos suficientes. Cada partida é equilibrada sozinha pra que montar um time bom custe escolhas — não dá pra encher de craques.`)+
      p(`${b("Idade:")} o mercado costuma inflar jovem (por potencial) e baratear veterano (por idade). A fórmula corrige isso: ${b("jovens ficam um pouco mais baratos")} e ${b("veteranos consagrados ficam mais caros")} (um craque de 35 pode custar bem mais que um valor de mercado sugeriria). Vale lembrar: só sobe o veterano que ainda tinha valor real — não é "idoso = caro".`)+
      p(`${b("Por posição:")} o mesmo critério vale pra goleiro, defensor, meia e atacante, então um zagueiro caro tende a valer tanto quanto um atacante caro.`))}

    ${sec("5. Perfil do jogador (radares e overall)",
      p(`Na tela inicial, a busca ${b("📊 Perfil de jogador")} abre a ficha de qualquer um dos milhares de jogadores da base — não só os do confronto. Digite o nome e toque.`)+
      p(`${b("OVERALL:")} quem está na base de mercado do app mostra OVERALL (de valor de mercado, liga e clube) + o PREÇO de draft. Quem não está mostra ${b("OVERALL*")} — calculado pelo ${b("desempenho real")} da temporada (gols, passes, desarmes...), não pelo mercado. O asterisco é clicável e explica isso.`)+
      p(`${b("Atributos e radares:")} a ficha traz os atributos da temporada por área (Ataque, Criação, Defesa, Físico, Técnica) em ${b("percentil vs. jogadores da mesma posição")}, com o número real ao lado. Goleiros têm áreas próprias (Defesas, Gols sofridos, Distribuição). Toque numa área pra abrir os sub-atributos.`)+
      p(`${b("Última partida × Temporada:")} se o jogador atuou no jogo aberto E tem dados de temporada, aparece um botão pra alternar. Se só tem um dos dois, mostra direto o que existe.`))}

    ${sec("6. Pontuação",
      p(`${b("Ações que somam:")} gol (+4,6), assistência (+3,6), finalização no gol (+2,2), defesa do goleiro (+1,4), pênalti defendido (+6), desarme/interceptação, drible, corte, bola recuperada. Gol difícil vale mais que fácil. Gol nos minutos finais de jogo apertado vale mais (clutch, até +8). Time mais fraco (underdog) ganha bônus, calculado por ELO, forma recente e mando de campo.`)+
      p(`${b("Clean sheet (não sofrer gol):")} goleiro ganha +1,2 por tempo sem levar gol; defensores +0,9 por tempo. Assim o goleiro favorito não pontua alto só por estar protegido — ele ainda precisa de defesas, PSxG ou clutch pra explodir.`)+
      p(`${b("Penalidades")} tiram pontos: amarelo (-2), vermelho (-7 no 1º tempo / -5 no 2º), erro que levou a gol (-5), erro que levou a finalização (-2), pênalti cometido (-4), gol contra (-6), faltas e ser driblado. O gol contra conta no placar e ainda desconta de quem o fez.`)+
      p(`${b("Construção de jogo")} também pontua (leve): faltas sofridas, lançamentos longos certos e conduções progressivas premiam quem distribui o jogo e puxa contra-ataque, não só quem finaliza.`)+
      p(`${b("Tática:")} se a tática que você escolheu ${b("ativar")} (seus jogadores produziram no estilo dela), o time ganha um bônus de até +4 pontos distribuído entre quem mais produziu. Errar a tática não tira pontos — no pior caso, ela só não ativa.`)+
      p(`${b("Química:")} um bônus ${b("por time")} (não por jogador) que você já vê na ${b("montagem")}, separado da tática. Cada titular tem uma personalidade (Maestro, Matador, Muro...); o jogo soma de uma vez ${b("todos")} os combos (personalidades que se completam) e reforços (repetir a mesma), sem importar a ordem, e adiciona ao total — até um ${b("teto de +4,5")}. Passou do teto, o excedente é cortado. Detalhes e a lista completa no 🧬 Guia de Química.`)+
      p(`${b("Tetos por jogo:")} a nota de um jogador na partida vai de -9 (piso) a +28 (teto), pra ninguém disparar sozinho.`))}

    ${sec("7. Mini rodadas e os modos",
      p(`Uma ${b("mini rodada")} junta vários jogos. O modo dela define a estratégia. São 4:`)+
      p(`🏆 ${b("Completo:")} escale todos os jogos. Sua pontuação é a soma de todos. A escalação de cada jogo trava quando aquela partida é fechada.`)+
      p(`⚡ ${b("Impulso:")} escale todos e distribua as fichas de impulso nas partidas (cada ficha aplica um % nos pontos daquele jogo). O dev define os valores e as regras das fichas (pode ter fichas negativas obrigatórias). A distribuição trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não gastar TODAS as fichas antes da trava, é eliminado e zera a mini rodada.`)+
      p(`📊 ${b("Confiança:")} escale todos e ordene os jogos do que você mais confia (1º) ao que menos confia. O 1º multiplica os pontos pra cima, o último pra baixo. Quanto mais jogos, maior a diferença. A ordem trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não ordenar TODOS os jogos antes da trava, é eliminado e zera a mini rodada.`)+
      p(`🔮 ${b("Previsão:")} escale todos e crave o placar de cada jogo. Além dos pontos da escalação, ganha bônus por acertar o resultado e um bônus maior por cravar o placar exato. Aqui o palpite trava POR JOGO, junto com a escalação daquela partida (cada jogo é independente).`))}

    ${sec("8. Como as travas funcionam",
      p(`Não há horário automático: ${b("tudo é manual")}. Quem trava é o dev, pelo botão "🔒 Fechar pool (trava as escalações)" na partida avulsa.`)+
      p(`${b("Escalação (todos os modos):")} a escalação de cada jogo pode ser editada até o dev fechar a pool daquela partida específica. Fechar uma não trava as outras.`)+
      p(`${b("Impulso e Confiança:")} a parte estratégica (fichas / ordem) trava quando QUALQUER jogo da rodada é fechado — porque é uma decisão sobre a rodada toda. O dev também pode fechar/reabrir essa distribuição manualmente no bloco ADMIN da rodada. Depois de travado, o jogador não reabre sozinho — só o dev.`)+
      p(`${b("Previsão:")} o palpite trava por jogo, junto com a escalação daquela partida (como no Completo).`))}

    ${sec("9. Espiar os adversários",
      p(`Na aba ${b("\"Quem está disputando\"")}, assim que a pool de uma partida é travada, aquele jogo vira clicável e você pode espiar o que cada um fez NELE:`)+
      p(`No Completo/Avulsa: a escalação. No Previsão: a escalação + o palpite. No Confiança: a escalação + a ordem de confiança completa do adversário. No Impulso: a escalação + onde ele gastou os impulsos. Só revela os jogos já travados.`))}

    ${sec("10. Classificação",
      p(`Quando os jogos terminam e são apurados, a ${b("Classificação da mini rodada")} soma os pontos de cada um (já com multiplicadores de confiança / bônus de previsão / impulsos aplicados) e mostra o ranking.`))}

    ${isAdmin()?sec("11. Para o admin (você)",
      p(`${b("Criar:")} use "Criar mini rodada", escolha o modo e adicione os jogos (há abas Em aberto / Finalizadas).`)+
      p(`${b("Durante:")} quando cada partida real começar, vá na partida avulsa e clique "Fechar pool". Isso trava a escalação daquele jogo em todas as rodadas, e — no Impulso/Confiança — trava a estratégia da rodada inteira.`)+
      p(`${b("Apurar:")} suba o resultado do jogo (scraping). A classificação se atualiza sozinha conforme os jogos são apurados.`)+
      p(`${b("Reabrir:")} se precisar, dá pra reabrir a pool de uma partida ou a distribuição estratégica — mas combine com o grupo, porque reabrir depois de um jogo começar dá vantagem de informação.`)):""}

    <button class="btn" style="margin-top:14px" onclick="toggleManual()">Fechar manual</button>
  </div></div>`;
}
function footHTML(){
  return `<div class="foot">Motor v2.6.0 · ELO eloratings + FootballDatabase<br>Dados FotMob + SofaScore · ${SUPA.ready()?"Supabase conectado":"⚠ configure o config.js"}</div>`;
}

// ============================================================
// BOOT
// ============================================================
// ENGINE_TACTICS já é definido por engine.js no navegador
if(typeof window.ENGINE_TACTICS==="undefined"){window.ENGINE_TACTICS={};}
async function boot(){
 try{
  try{
    APP.jogos=window.GAMES.index;
  }catch(e){APP.jogos=[];}
  await loadArchived();
  await tryAutoLogin();
  // restaura preferência do modo DEV (padrão: ligado)
  const dm=localStorage_safe_get("fpvp_devmode");
  if(dm==="0")APP.devMode=false; else APP.devMode=true;
  // go central: carrega o que cada view precisa
  window.go=async function(view,roomId,roundId,extra,leagueId,phaseId){
   try{
    APP.view=view;if(roomId)APP.roomId=roomId;
    if(view==="groups"){await loadGroups();}
    if(view==="home"){await loadArchived();await loadGroups();await loadGroupRooms();await loadRounds();await loadPhases();await loadLeagues();await loadDraftSeasons();}
    if(view==="round"){APP.confOrderMode=false;APP.confOrderDraft=null;APP.confDrag=null;APP.confHover=null;await loadRound(roundId);_openPeekRound={};}
    if(view==="league"){await loadLeague(leagueId);}
    if(view==="phase"){await loadPhase(phaseId);}
    if(view==="draft"){await loadDraftSeason(arguments[6]);}
    if(view==="room"){APP.roundId=null;APP.round=null;APP.roundRooms=[];APP.roundEntries=[];}
    if(view==="room"||view==="build"||view==="result"){await loadRoom(APP.roomId);}
    if(view==="room"){APP.entries=await loadEntries();_openPeek={};}
    if(view==="result"){APP.entries=await loadEntries();_openRec={};_openRank={};_dreamOpen=false;_dreamPlayer={};}
    if(view==="profile"){clearEntriesCache();APP.profile=null;APP.profileHistory=null;render();const ps=await loadProfileStats(APP.user.username);if(APP.view==="profile")APP.profile=ps;render();const ph=await loadMemberHistory(APP.user.username);if(APP.view==="profile")APP.profileHistory=ph;}
    if(view==="members"){APP.members=null;render();const ms=await loadGroupMembers();if(APP.view==="members")APP.members=ms;}
    if(view==="member"){
      clearEntriesCache();APP.memberView=extra;APP.memberProfile=null;APP.memberHistory=null;_openHistGame={};_openHistPlayer={};render();
      const ps=await loadProfileStats(extra);if(APP.view==="member"&&APP.memberView===extra)APP.memberProfile=ps;render();
      const h=await loadMemberHistory(extra);if(APP.view==="member"&&APP.memberView===extra)APP.memberHistory=h;
    }
    render();window.scrollTo(0,0);
   }catch(err){
    // nunca trava a navegação: mostra o erro e ainda renderiza a tela
    try{toast("Erro ao abrir: "+(err&&err.message?err.message:err));}catch(e){}
    try{render();}catch(e){}
   }
  };
  // tela inicial: grupos (se logado). carrega a lista antes.
  if(APP.user){await loadGroups();APP.view="groups";}
  render();
 }catch(err){
  var r=document.getElementById("root");
  if(r)r.innerHTML='<div style="padding:20px;color:#E0604F;font-family:monospace;font-size:13px"><b>Erro ao iniciar:</b><br>'+String(err&&err.message?err.message:err)+'<br><br><span style="color:#8FA89A">Tire um print desta tela.</span></div>';
 }
}
window.__APP_READY=true;
