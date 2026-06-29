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
    auction2_enabled:on("dm_auction2"),
    auction2_mode:($("dm_auction2_mode")?$("dm_auction2_mode").value:"blind"),
    auction2_step:($("dm_auction2_step")?Math.max(1,parseInt($("dm_auction2_step").value,10)||5):5),
    auction2_consolation_pct:($("dm_auction2_conso")?Math.min(100,Math.max(10,parseInt($("dm_auction2_conso").value,10)||70)):70),
    auction2_min_bid_pct:($("dm_auction2_minbid")?Math.min(100,Math.max(0,parseInt($("dm_auction2_minbid").value,10)||0)):0),
    auction2_timer_secs:($("dm_auction2_timer")?Math.max(0,parseInt($("dm_auction2_timer").value,10)||0):0),
    auction2_per_round:($("dm_auction2_perround")?Math.min(5,Math.max(1,parseInt($("dm_auction2_perround").value,10)||1)):1),
    auction2_tiebreak:($("dm_auction2_tiebreak")?$("dm_auction2_tiebreak").value:"reauction"),
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
  ).sort((a,b)=>(b.price-a.price)||String(a.name||"").localeCompare(String(b.name||""))||(a.id>b.id?1:a.id<b.id?-1:0));
  const ready=Object.values(s).every(Boolean)&&APP.captain&&APP.tactic&&!gameLocked;
  const hasSomeFilled=Object.values(s).some(Boolean);
  const canReplicate=hasSomeFilled&&!gameLocked;
  const filledCount=Object.values(s).filter(Boolean).length;
  const starterFilled=["GK","DEF","MID","ATT","FLEX"].filter(sl=>s[sl]).length;
  const budgetPct=Math.max(0,Math.min(100,spent));
  const capName=APP.captain&&s[APP.captain]&&byId[s[APP.captain]]?byId[s[APP.captain]].name:null;
  const tacticName=APP.tactic&&TAC[APP.tactic]?TAC[APP.tactic].name:null;
  const playerImg=(p,cls)=>{
    if(!p)return "";
    const url=(typeof photoOf==="function")?photoOf(APP.roomId,p.team,p.id):null;
    const direct=(typeof photoOfDirect==="function")?photoOfDirect(APP.roomId,p.team,p.id):url;
    const ini=(p.name||"").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
    const attr=v=>String(v||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
    if(!url)return `<span class="${cls||"pface"} ph">${ini}</span>`;
    return `<span class="${cls||"pface"}"><img src="${attr(url)}" data-direct="${attr(direct)}" loading="lazy" decoding="async" onerror="if(!this.dataset.triedDirect&&this.dataset.direct&&this.src!==this.dataset.direct){this.dataset.triedDirect='1';this.src=this.dataset.direct}else{this.parentNode.classList.add('ph');this.parentNode.textContent='${ini}'}"></span>`;
  };
  const slotPersonaHTML=(pl,posKey)=>{
    if(!pl||typeof window==="undefined"||!window.personaOf||!window.QUIMICA) return "";
    const pk=window.personaOf(pl.name,pl.pos); if(!pk) return "";
    const per=window.QUIMICA.PERSONAS[pk]; if(!per) return "";
    const col=({GK:"var(--pos-gk)",DEF:"var(--pos-def)",MID:"var(--pos-mid)",ATT:"var(--pos-att)",FLEX:"var(--pos-flex)"})[posKey]||"var(--dim)";
    return `<div class="slotpersona" style="display:inline-flex;align-items:center;justify-content:center;gap:3px;max-width:100%;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,${col} 14%,transparent);border:1px solid color-mix(in srgb,${col} 30%,transparent);font-size:9px;font-weight:700;color:var(--chalk);line-height:1.15">`
      +`<span style="font-size:11px;flex:none">${per.ico}</span><span style="min-width:0">${esc(per.nome)}</span></div>`;
  };
  const slotsHTML=["GK","DEF","MID","ATT","FLEX","BENCH"].map(sl=>{
    const pid=s[sl],pl=pid?byId[pid]:null;
    const posKey=sl==="BENCH"&&pl?pl.pos:sl; // banco herda a cor da posição real do jogador
    return `<div class="slot${pl?` filled s-${posKey}`:" empty"}${pl&&APP.captain===sl?" cap":""}" onclick="${pl?`slotClick(event,'${sl}')`:""}">
      <div class="lab"><span class="pc-${posKey}">${SLOT_LABEL[sl]}</span>${sl==="FLEX"?" ·DEF/MEI/ATA":""}${sl==="BENCH"?(bcap!=null?` ·grátis ≤${bcap}`:" ·grátis"):""}</div>
      ${pl?playerImg(pl,"slotpic"):""}
      <div class="nm">${pl?esc(pl.name):"toque num jogador"}</div>
      ${pl?slotPersonaHTML(pl,posKey):""}
      ${pl?`<div class="pr mono" style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;max-width:100%">${typeof window!=="undefined"&&window.openPlayerRadar?`<button class="ibtn" onclick="event.stopPropagation();window.openPlayerRadar('${esc(pl.name).replace(/'/g,"\\'")}','${pl.pos}')" title="Ver perfil completo">ℹ️</button>`:""}<span class="teamtag" style="--tc:${teamColor(pl.team)}">${pl.team}</span><span style="color:var(--amber)">${sl==="BENCH"?'<span style="color:var(--green)">grátis</span>':pl.price}</span></div>`:""}
      ${pl&&sl!=="BENCH"?`<button class="cbtn${APP.captain===sl?" on":""}" onclick="event.stopPropagation();toggleCap('${sl}')">C</button>`:""}
    </div>`;}).join("");
  // rótulos legíveis pras ações de buff/nerf das táticas
  const TACT_LABEL={goal:"gols",sotPts:"chutes/gols",assist:"assistências",sca:"criação",gca:"jogada do gol",
    dribbles:"dribles",prgp:"passes progressivos",pib:"passes na área",tib:"toques na área",
    tklint:"desarmes",block:"bloqueios",recovery:"recuperações",aerial:"duelos aéreos",clearance:"cortes",
    accCross:"cruzamentos",fouls:"faltas",prgCarry:"conduções",longBall:"lançamentos"};
  // cor-tema por tática (casa com as variáveis --tac-* do CSS)
  const TACT_COLOR={muralha:"var(--tac-muralha)",pressaototal:"var(--tac-pressaototal)",cerebro:"var(--tac-cerebro)",tridente:"var(--tac-tridente)",aereo:"var(--tac-aereo)",contra:"var(--tac-contra)"};
  // ── BLOCO DE QUÍMICA (montagem) ──
  function quimicaBlockHTML(s, byId){
    if(typeof window==="undefined"||!window.computeQuimica||!window.QUIMICA) return "";
    const tits=["GK","DEF","MID","ATT","FLEX"].map(sl=>s[sl]).filter(Boolean)
      .map(pid=>byId[pid]).filter(Boolean);
    const P=window.QUIMICA.PERSONAS;
    const POSCOL={GK:"var(--pos-gk)",DEF:"var(--pos-def)",MID:"var(--pos-mid)",ATT:"var(--pos-att)",FLEX:"var(--pos-flex)"};
    // CARDS visuais de personalidade (ícone grande + nome + cor por setor)
    let cards="";
    ["GK","DEF","MID","ATT","FLEX"].forEach(sl=>{
      const pid=s[sl]; const pl=pid?byId[pid]:null;
      const col=POSCOL[sl]||"#888";
      if(!pl){
        cards+=`<div style="flex:1;min-width:62px;text-align:center;background:rgba(255,255,255,.02);border:1px dashed rgba(255,255,255,.1);border-radius:12px;padding:8px 4px;opacity:.5">`
          +`<div style="font-size:22px;line-height:1">·</div><div style="font-size:9px;color:var(--dim);margin-top:3px">${SLOT_LABEL[sl]}</div></div>`;
        return;
      }
      const pk=window.personaOf(pl.name,pl.pos)||"camaleao";
      const per=P[pk]||P.camaleao;
      cards+=`<div title="${esc(per.desc)}" style="flex:1;min-width:62px;text-align:center;background:color-mix(in srgb,${col} 10%,transparent);border:1px solid color-mix(in srgb,${col} 35%,transparent);border-radius:12px;padding:8px 4px">`
        +`<div style="font-size:24px;line-height:1">${per.ico}</div>`
        +`<div style="font-size:11px;font-weight:700;color:var(--chalk);margin-top:4px;line-height:1.1">${esc(per.nome)}</div>`
        +`<div style="font-size:9px;color:${col};font-weight:700;margin-top:2px">${SLOT_LABEL[sl]}</div></div>`;
    });

    let body, headRight;
    if(tits.length<3){
      body=`<div style="display:flex;gap:6px;margin:10px 0">${cards}</div><p class="p" style="font-size:11px;color:var(--dim);margin:2px 0 0">Escale os titulares pra ver a química do time.</p>`;
      headRight=`<span class="tag">—</span>`;
    }else{
      const q=window.computeQuimica(tits.map(m=>({name:m.name,pos:m.pos})));
      const sugg=window.suggestQuimica?window.suggestQuimica(tits.map(m=>({name:m.name,pos:m.pos}))):[];
      headRight=`<span class="mono" style="color:${q.bonus>0?"#34d399":"var(--dim)"};font-weight:800;font-size:16px">+${q.bonus.toFixed(1)}</span>`;
      // combos ATIVOS
      let activeHTML="";
      if(q.hits.length){
        activeHTML=`<div style="font-size:10px;color:var(--dim);font-weight:700;letter-spacing:.04em;margin:10px 0 4px">✅ ATIVOS</div>`
          +q.hits.map(h=>`<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;background:color-mix(in srgb,#34d399 8%,transparent);border-radius:8px;padding:6px 8px">`
            +`<span style="font-size:15px">${h.ico}</span>`
            +`<span style="flex:1;color:var(--chalk);font-weight:600">${esc(h.nome)} <span style="color:var(--dim);font-size:10px;font-weight:400">${esc(h.txt)}</span></span>`
            +`<span class="mono" style="color:#34d399;font-weight:800">+${h.pts.toFixed(1)}</span></div>`).join("");
      }
      // SUGESTÕES (o que falta)
      let suggHTML="";
      if(sugg.length && q.bonus<window.QUIMICA.CAP){
        suggHTML=`<div style="font-size:10px;color:var(--dim);font-weight:700;letter-spacing:.04em;margin:10px 0 4px">💡 PRA GANHAR MAIS</div>`
          +sugg.map(sg=>`<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;border:1px dashed rgba(255,255,255,.12);border-radius:8px;padding:6px 8px">`
            +`<span style="font-size:14px;opacity:.85">${sg.falta.ico}</span>`
            +`<span style="flex:1;color:var(--dim)">Escale um <b style="color:var(--chalk)">${esc(sg.falta.nome)}</b> → ativa <b style="color:var(--chalk)">${esc(sg.nome)}</b></span>`
            +`<span class="mono" style="color:#FFC247;font-weight:700">+${sg.pts.toFixed(1)}</span></div>`).join("");
      }
      if(!q.hits.length && !sugg.length){
        activeHTML=`<p class="p" style="font-size:11px;color:var(--dim);margin:8px 0 0">Junte personalidades que se completam (ex: 🪄 Maestro + 🎯 Matador) ou repita uma identidade pra ganhar bônus.</p>`;
      }
      body=`<div style="display:flex;gap:6px;margin:10px 0">${cards}</div>${activeHTML}${suggHTML}`;
    }
    return `<div class="card">
      <div class="sectionhead"><span>🧬 Química do time${helpBtn("quimica")}</span>${headRight}</div>
      <p class="p" style="font-size:11px;margin-bottom:2px;line-height:1.5">Cada jogador tem uma <b>personalidade</b>. Personalidades que se completam (ou se repetem) geram <b style="color:var(--green)">bônus de química</b> — somado ao seu time, separado da tática.</p>
      ${body}
      <div onclick="toggleQuimicaGuide()" style="margin-top:10px;text-align:center;cursor:pointer;font-size:12px;font-weight:700;color:var(--blue);padding:8px;border:1px solid color-mix(in srgb,var(--blue) 30%,transparent);border-radius:10px">📖 Ver todas as combinações de química</div>
    </div>`;
  }

  function tactEffectHTML(t){
    const fam=(t.fam||[]).map(k=>TACT_LABEL[k]||k);
    const uniq=[...new Set(fam)];
    return `<div class="teff"><div class="up">▲ ativa = bônus nas ações dela</div><div class="foco">depende de: <b>${uniq.join(", ")}</b></div></div>`;
  }

  // ── TENDÊNCIA DE ATIVAÇÃO (estimativa pré-jogo) ──
  // O engine decide pela produção REAL no jogo. Aqui estimamos a TENDÊNCIA pelas
  // posições escaladas: cada tática é alimentada naturalmente por certas posições.
  // Não é garantia — é "seu time tem cara de" tal estilo.
  const TACT_POS = {
    muralha:      {DEF:1.0, GK:0.6, MID:0.3, ATT:0.0},  // bloqueios/cortes/aéreo
    pressaototal: {DEF:0.8, MID:1.0, ATT:0.4, GK:0.0},  // recuperações/desarmes
    cerebro:      {MID:1.0, DEF:0.4, ATT:0.5, GK:0.0},  // criação/passes
    contra:       {ATT:1.0, MID:0.8, DEF:0.2, GK:0.0},  // conduções/dribles
    aereo:        {ATT:0.9, DEF:0.9, MID:0.2, GK:0.0},  // duelos aéreos/cruzamentos
  };
  // estima a tendência: normaliza o score do time contra o melhor caso possível da tática
  function tacticTendency(tacKey, s, byId){
    const w=TACT_POS[tacKey]; if(!w) return null;
    const TIT=["GK","DEF","MID","ATT","FLEX"];
    let score=0, filled=0;
    for(const sl of TIT){
      const pid=s[sl]; if(!pid) continue;
      const pl=byId[pid]; if(!pl) continue;
      filled++;
      let wt=w[pl.pos]||0;
      if(APP.captain===sl) wt*=1.5; // capitão puxa o estilo do time
      score+=wt;
    }
    if(filled<5) return {level:"?", txt:"escale os 5 titulares", pct:0};
    // baseline: GK+DEF+MID+ATT sempre presentes (formação fixa)
    const base=(w.GK||0)+(w.DEF||0)+(w.MID||0)+(w.ATT||0);
    const bestFlex=Math.max(w.DEF||0,w.MID||0,w.ATT||0);   // melhor FLEX possível
    const maxWt=Math.max(w.DEF||0,w.MID||0,w.ATT||0);
    const max=base+bestFlex+maxWt*0.5;  // teto (melhor FLEX + capitão ideal)
    const min=base;                      // piso (FLEX inútil, sem capitão)
    const pct=(max>min)?Math.max(0,Math.min(100,Math.round((score-min)/(max-min)*100))):50;
    let level, txt;
    if(pct>=66){ level="alta"; txt="✅ tende a ativar"; }
    else if(pct>=33){ level="media"; txt="➖ pode ativar"; }
    else { level="baixa"; txt="⬜ pouco provável"; }
    return {level, txt, pct};
  }
  const TEND_COL={alta:"#34d399",media:"#FFC247",baixa:"#7C879E","?":"#7C879E"};
  function tendBadgeHTML(tend){
    if(!tend) return "";
    const c=TEND_COL[tend.level]||"#7C879E";
    return `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:11px">`
      +`<span style="color:${c};font-weight:700">${tend.txt}</span>`
      +(tend.pct?`<div style="flex:1;height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${tend.pct}%;height:100%;background:${c}"></div></div>`:``)
      +`</div>`;
  }
  const tactsHTML=Object.entries(TAC).filter(([k,t])=>!t.legacy).map(([k,t])=>{const tc=TACT_COLOR[k]||"var(--amber)";const tend=tacticTendency(k,s,byId);return `<div class="tact${APP.tactic===k?" on":""}" style="--tac:${tc}" onclick="setTactic('${k}')"><div class="ttop"></div><div class="tn">${t.name}</div><div class="td">${t.desc}</div>${tactEffectHTML(t)}${tendBadgeHTML(tend)}</div>`;}).join("");
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
  const poolPersonaIco=(p)=>{
    if(typeof window==="undefined"||!window.personaOf||!window.QUIMICA) return "";
    const pk=window.personaOf(p.name,p.pos); if(!pk) return "";
    const per=window.QUIMICA.PERSONAS[pk]; if(!per) return "";
    return `<span title="${esc(per.nome)}" style="margin-left:5px;font-size:12px;opacity:.95">${per.ico}</span>`;
  };
  // botão ℹ️ que abre o perfil completo (overall + stats + radar). stopPropagation pra não disparar o clique da linha.
  const radarBtn=(p)=>{
    if(typeof window==="undefined"||!window.openPlayerRadar) return "";
    const nm=esc(p.name).replace(/'/g,"\\'");
    return `<button class="radarbtn" onclick="event.stopPropagation();window.openPlayerRadar('${nm}','${p.pos}')" title="Ver perfil completo">ℹ️</button>`;
  };
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
    return `<div class="prow playerpick ${sel?" sel":""}${dis?" dis":""}"${dis?"":` data-pid="${p.id}"`}><div class="posbar pb-${p.pos}"></div>${playerImg(p,"pface")}<div class="pos mono pc-${p.pos}">${SLOT_LABEL[p.pos]}</div><div class="nm">${esc(p.name)}${poolPersonaIco(p)}<span class="teamtag" style="--tc:${teamColor(p.team)};margin-left:6px">${p.team}</span>${p.age?` <span class="age">${p.age}a</span>`:""}${tag}</div>${radarBtn(p)}<div class="pr mono">${p.price}</div></div>`;
  }).join("");
  // ── MODO TORCIDA: jogo travado mas não finalizado → mostra resumo limpo do time escalado ──
  if(gameLocked){
    const tac=TAC[APP.tactic];
    const lineRow=(sl)=>{
      const pid=s[sl],pl=pid?byId[pid]:null;
      if(!pl)return"";
      const isCap=APP.captain===sl;
      const posKey=sl==="BENCH"&&pl?pl.pos:sl;
      return `<div class="prow" style="cursor:default"><div class="posbar pb-${posKey}"></div>${playerImg(pl,"pface")}<div class="pos mono pc-${posKey}">${SLOT_LABEL[sl]}</div><div class="nm">${esc(pl.name)}<span class="teamtag" style="--tc:${teamColor(pl.team)};margin-left:6px">${pl.team}</span>${isCap?` <span class="badgeC">C</span>`:""}${sl==="BENCH"?` <span style="font-size:9px;color:var(--dim)">banco</span>`:""}</div>${radarBtn(pl)}<div class="pr mono" style="color:var(--dim)">${sl==="BENCH"?"grátis":pl.price}</div></div>`;
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
    <p class="p" style="font-size:11px;margin-bottom:8px;line-height:1.5">Cada tática dá um <b style="color:var(--green)">bônus</b> nas ações dela se, no fim do jogo, seus jogadores produzirem bastante naquilo. O selo abaixo mostra a <b>tendência</b> do seu time pelas posições escaladas — não é garantia, mas indica pra qual estilo ele tem cara. Capitão puxa o estilo.</p>
    <div class="tacts">${tactsHTML}</div>
  </div>
  ${quimicaBlockHTML(s,byId)}
  <div class="card">
    <div class="sectionhead"><span>Pool <span class="tag">· ${pp.players.length} JOGADORES</span>${helpBtn("pool")}</span><span>${filledCount}/6 escolhidos</span></div>
    ${(function(){
      // DIAGNÓSTICO: detecta jogadores diferentes com o MESMO id (causa de escalar o jogador errado)
      const seen={},dups=[];
      pp.players.forEach(p=>{ if(seen[p.id]&&seen[p.id]!==p.name)dups.push(`#${p.id}: ${seen[p.id]} ≟ ${p.name}`); seen[p.id]=p.name; });
      return dups.length?`<div class="warn" style="background:#3a1414;border-color:#5a2020;color:#ff8a8a">⚠️ IDs duplicados no pool (isso faz escalar o jogador errado):<br>${dups.map(esc).join("<br>")}</div>`:"";
    })()}
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
  const byId=APP._byId,s=APP.slots;APP.warn="";
  // pid pode chegar como string (data-pid) ou número (chamada antiga). Resolve o
  // jogador testando os dois tipos e passa a usar SEMPRE o id real (byId/slots usam o tipo original).
  let p=byId[pid];
  if(!p&&typeof pid==="string"&&pid!==""&&!isNaN(pid))p=byId[Number(pid)];
  if(!p)return;
  pid=p.id; // id no tipo original (igual ao guardado nos slots)
  const used=Object.values(s).filter(Boolean);
  if(used.includes(pid)){const sl=Object.keys(s).find(k=>s[k]===pid);s[sl]=null;if(APP.captain===sl)APP.captain=null;renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();return;}
  // descobre o slot de destino
  let t=null;
  if(p.pos==="GK")t=!s.GK?"GK":!s.BENCH?"BENCH":null;
  else{if(!s[p.pos])t=p.pos;else if(!s.FLEX)t="FLEX";else if(!s.BENCH)t="BENCH";}
  if(!t){APP.warn="Sem slot compatível livre.";renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();return;}
  if(t==="BENCH"){
    // banco: GRÁTIS, mas só aceita quem custa <= o titular mais barato que você escalou
    const bcap=benchCap(s,byId);
    if(bcap==null){APP.warn="Escale ao menos um titular antes de escolher o banco (o teto do banco é o seu titular mais barato).";renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();return;}
    if((p.price||0)>bcap){APP.warn=`No banco só entra quem custa até ${bcap} (seu titular mais barato). Esse custa ${p.price}.`;renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();return;}
  }else{
    // titular: paga e respeita o orçamento (banco não conta)
    const spent=used.reduce((a,id)=>a+(id===s.BENCH?0:byId[id].price),0);
    if(100-spent-p.price<0){APP.warn="Orçamento estourado.";renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();return;}
  }
  s[t]=pid;enforceBenchCap();renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();
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
function slotClick(ev,sl){
  // se o toque veio de um botão dentro do slot (ℹ️ perfil, C capitão), não limpa o slot
  try{ if(ev&&ev.target&&ev.target.closest&&ev.target.closest("button")) return; }catch(e){}
  clearSlot(sl);
}
function clearSlot(sl){APP.slots[sl]=null;if(APP.captain===sl)APP.captain=null;if(sl!=="BENCH")enforceBenchCap();renderKeepScroll&&typeof renderKeepScroll==="function"?renderKeepScroll():render();}
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
  // QUÍMICA (camada nova, independente da tática): bônus por entrosamento das
  // personalidades dos 5 TITULARES escalados. É da montagem — vale mesmo sem o jogador
  // ter atuado, e soma uma vez no total do time (antes do impulso).
  let quimica=null, quimicaPts=0;
  if(typeof window!=="undefined" && window.computeQuimica){
    const tits=["GK","DEF","MID","ATT","FLEX"].map(sl=>entry.slots[sl]).filter(Boolean)
      .map(pid=>byId[pid]).filter(Boolean).map(mm=>({name:mm.name,pos:mm.pos}));
    if(tits.length>=3){
      quimica=window.computeQuimica(tits);
      quimicaPts=quimica?quimica.bonus:0;
      sum+=quimicaPts;
    }
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
  return {username:entry.username,total:finalTotal,boost:boostTokens,boostPct,boostChips:Array.isArray(chips)?chips:null,boostMult,view,captain:entry.captain,tactic:entry.tactic,subOut,squadSum:sq,quimica,quimicaPts};
}
// ============================================================
// TIME IDEAL — a escalação que teria dado a MAIOR pontuação possível
// (respeita 100 moedas, formação GK/DEF/MID/ATT/FLEX, melhor tática e capitão)
// ============================================================
const BUDGET_IDEAL=100;
function computeDreamTeam(roomId){
  const ctx=buildCtxFor(roomId);if(!ctx)return null;
  const pp=ctx.prepool,eng=ctx.eng,m=ctx.match;
  const rawOf=(p)=>{const r=m.players?m.players[String(p.id)]:null;return Object.assign({pos:p.pos,team:p.team},r||{min:0});};
  const cand={GK:[],DEF:[],MID:[],ATT:[]};
  for(const p of pp.players){
    const raw=rawOf(p);
    if(!(raw.min>0))continue;
    const item={id:p.id,pos:p.pos,price:p.price||0,raw};
    if(cand[p.pos])cand[p.pos].push(item);
  }
  if(!cand.GK.length||!cand.DEF.length||!cand.MID.length||!cand.ATT.length)return null;
  const tactics=Object.keys(eng.TACTICS).filter(t=>!eng.TACTICS[t].legacy);
  // PRÉ-COMPUTA pontos de cada jogador por tática nos 2 cenários (full/fail) — evita recalcular no loop
  const fakeFull={},fakeFail={};
  for(const t of tactics){fakeFull[t]="full";fakeFail[t]="fail";}
  const pts={}, bestPossible={};
  const all=cand.GK.concat(cand.DEF,cand.MID,cand.ATT);
  for(const it of all){
    pts[it.id]={};let bp=0;
    for(const t of tactics){
      const f=eng.scorePlayer(it.raw,t,{status:fakeFull}).total;
      const x=eng.scorePlayer(it.raw,t,{status:fakeFail}).total;
      pts[it.id][t]={full:f,fail:x};
      if(f>bp)bp=f;
    }
    bestPossible[it.id]=bp; // melhor pontuação que esse jogador pode ter em qualquer tática
  }
  // ordena por melhor pontuação possível (poda mais cedo)
  for(const k in cand)cand[k].sort((a,b)=>bestPossible[b.id]-bestPossible[a.id]);
  const POOL=all.slice().sort((a,b)=>bestPossible[b.id]-bestPossible[a.id]);

  let best=null;
  for(const gk of cand.GK){
    if(gk.price>BUDGET_IDEAL)continue;
    for(const df of cand.DEF){
      if(gk.price+df.price>BUDGET_IDEAL)continue;
      for(const mf of cand.MID){
        const p3=gk.price+df.price+mf.price; if(p3>BUDGET_IDEAL)continue;
        for(const at of cand.ATT){
          const p4=p3+at.price; if(p4>BUDGET_IDEAL)continue;
          const usados=new Set([gk.id,df.id,mf.id,at.id]);
          // teto otimista dos 4 já escolhidos (com capitão no melhor deles)
          const base4=bestPossible[gk.id]+bestPossible[df.id]+bestPossible[mf.id]+bestPossible[at.id];
          for(const fx of POOL){
            if(usados.has(fx.id))continue;
            const p5=p4+fx.price; if(p5>BUDGET_IDEAL)continue;
            // PODA: teto otimista (5 melhores possíveis + 20% no maior + teto da química) não supera o best? pula squadSum
            if(best){
              const tetoFive=base4+bestPossible[fx.id];
              const maxInd=Math.max(bestPossible[gk.id],bestPossible[df.id],bestPossible[mf.id],bestPossible[at.id],bestPossible[fx.id]);
              const quimCap=(typeof window!=="undefined"&&window.QUIMICA&&window.QUIMICA.CAP)?window.QUIMICA.CAP:0;
              if(tetoFive+maxInd*0.2+quimCap<=best.total)continue;
            }
            const five=[gk,df,mf,at,fx];
            const sq=eng.squadSum(five.map(x=>x.raw));
            // química do quinteto (depende só das personalidades, não da tática): calcula 1x
            let quimicaPts=0, quimicaObj=null;
            if(typeof window!=="undefined"&&window.computeQuimica){
              try{
                quimicaObj=window.computeQuimica(five.map(x=>({name:ctx.byId[x.id]?ctx.byId[x.id].name:"",pos:x.pos})));
                quimicaPts=quimicaObj?quimicaObj.bonus:0;
              }catch(e){quimicaPts=0;}
            }
            for(const tac of tactics){
              const stt=sq.status[tac];
              let sum=0;const arr=[];
              for(const it of five){const v=pts[it.id][tac][stt];arr.push(v);sum+=v;}
              let capBonus=0,capIx=-1;
              for(let i=0;i<arr.length;i++){const e=arr[i]*0.2;if(e>capBonus){capBonus=e;capIx=i;}}
              const total=Math.round((sum+capBonus+quimicaPts)*10)/10;
              if(!best||total>best.total){
                best={total,tactic:tac,captainId:five[capIx].id,spend:p5,
                  picks:{GK:gk,DEF:df,MID:mf,ATT:at,FLEX:fx},sq,quimicaPts,quimica:quimicaObj};
              }
            }
          }
        }
      }
    }
  }
  return best;
}
// constrói o engine + byId pra um jogo qualquer do catálogo (pra perfil/histórico)
const _ctxCache={};
function buildCtxFor(roomId){
  if(_ctxCache[roomId]!==undefined)return _ctxCache[roomId];
  const g=window.GAMES.data[roomId];if(!g){_ctxCache[roomId]=null;return null;}
  const pp=g.prepool,m=g.match;if(!m||m.status!=="finished"){_ctxCache[roomId]=null;return null;}
  m.homeCode=pp.home.code;m.awayCode=pp.away.code;m.homeElo=pp.home.elo;m.awayElo=pp.away.elo;
  if(m.team_stats)for(const tc of [pp.home.code,pp.away.code]){if(m.team_stats[tc]&&m.team_stats[tc].setPieceGoals==null)m.team_stats[tc].setPieceGoals=0;}
  const byId=Object.fromEntries(pp.players.map(p=>[p.id,p]));
  const ctx={prepool:pp,match:m,byId,eng:makeEngine(m)};
  _ctxCache[roomId]=ctx;
  return ctx;
}
// ============================================================
// MEDALHAS (derivadas das stats do perfil) + TELA DE PERFIL
// ============================================================
// cada medalha tem tiers; retorna a maior atingida (ou null)
function computeMedals(st){
  const tier=(val,steps,emoji,nameBase,unit)=>{
    let got=null;
    for(const[thr,name]of steps){if(val>=thr)got={emoji,name,desc:name+" · "+val+" "+unit};}
    return got;
  };
  const m=[];
  const archDistinct=Object.keys(st.archetypes).length;
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const tacticsUsed=Object.keys(st.tactics||{}).length;
  const add=x=>{if(x)m.push(x);};
  add(tier(st.wins,[[1,"Primeira Vitória"],[3,"Vencedor"],[7,"Campeão de Sala"],[15,"Dominador"]],"🏆","wins","vitória(s)"));
  add(tier(st.podiums,[[3,"Pódio Frequente"],[10,"Sempre no Topo"]],"🥇","pod","pódio(s)"));
  add(tier(st.games,[[1,"Estreante"],[5,"Habitual"],[15,"Veterano"],[30,"Lenda Viva"]],"🎮","games","jogo(s)"));
  add(tier(archDistinct,[[5,"Colecionador"],[12,"Curador"],[20,"Enciclopédia"]],"🃏","arch","arquétipos"));
  add(tier(rareCount,[[1,"Sortudo"],[5,"Caçador de Raros"],[12,"Lapidador"]],"💎","rare","carta(s) rara(s)"));
  add(tier(Math.floor(st.bestScore),[[20,"Boa Cartada"],[35,"Tacada de Mestre"],[50,"Jogo Perfeito"]],"📊","best","pts num jogo"));
  // NOVAS
  add(tier(st.bestStreak||0,[[2,"Embalado"],[3,"Invicto"],[5,"Imparável"]],"🔥","streak","pódios seguidos"));
  add(tier(st.zebraWins||0,[[1,"Zebra Master"],[3,"Rei da Zebra"]],"🦓","zebra","vitória(s) com zebra"));
  add(tier(tacticsUsed,[[3,"Tático"],[5,"Estrategista"],[6,"Maestro da Tática"]],"🧠","tac","táticas usadas"));
  if(st.capTotal>=4)add(tier(st.capRate,[[60,"Braçadeira de Ouro"],[80,"Capitão Certeiro"]],"🎖️","cap","% de acerto no capitão"));
  if(st.games>=4)add(tier(Math.floor(st.avg),[[20,"Regularidade"],[30,"Consistente"],[40,"Máquina de Pontos"]],"📈","avg","pts de média"));
  return m;
}
// título/nível do usuário — evolui com experiência + resultados
function userTitle(st){
  // pontuação de XP: jogos + vitórias valem mais + pódios + variedade de cartas
  const archDistinct=Object.keys(st.archetypes||{}).length;
  const xp=st.games*10 + st.wins*25 + st.podiums*8 + archDistinct*3;
  const niveis=[
    [0,  "Novato",          "🥚"],
    [40, "Escalador",       "📋"],
    [90, "Treinador",       "📣"],
    [160,"Tático",          "🧠"],
    [260,"Estrategista",    "♟️"],
    [400,"Mestre",          "🎩"],
    [600,"Lenda",           "👑"],
  ];
  let cur=niveis[0],next=null;
  for(let i=0;i<niveis.length;i++){
    if(xp>=niveis[i][0]){cur=niveis[i];next=niveis[i+1]||null;}
  }
  const prog=next?Math.round((xp-cur[0])/(next[0]-cur[0])*100):100;
  return {name:cur[1], emoji:cur[2], xp, next:next?{name:next[1],falta:next[0]-xp}:null, prog};
}
function collectionHTML(archObj){
  const tem=archObj||{};
  const total=ARCH_CATALOG.length;
  const got=ARCH_CATALOG.filter(a=>tem[a.name]>0).length;
  let html=`<div class="card"><div class="h2 disp">🃏 Coleção de arquétipos</div>
    <p class="p" style="margin:6px 0 10px">Você desbloqueou <b style="color:var(--amber)">${got}/${total}</b> arquétipos. Cada um é um papel que um jogador seu desempenhou numa partida. Toque pra ver como conseguir os que faltam.</p>`;
  // agrupa por categoria
  const cats=["Goleiro","Defesa","Meio","Criação","Ataque","Outros"];
  for(const cat of cats){
    const arr=ARCH_CATALOG.filter(a=>a.cat===cat);
    if(!arr.length)continue;
    html+=`<div class="bsub" style="margin:10px 0 4px">${cat}</div>`;
    for(const a of arr){
      const has=tem[a.name]>0;
      const col=RAR_COLOR[a.rar]||"#9aa6b2";
      const n=tem[a.name]||0;
      html+=`<div class="line" style="padding:8px 0;align-items:flex-start;${has?"":"opacity:.5"}">
        <span style="flex:1">
          <b style="color:${has?"var(--chalk)":"var(--dim)"}">${has?"":"🔒 "}${esc(a.name)}</b>
          <span style="font-size:9px;color:${col};border:1px solid ${col};border-radius:6px;padding:1px 5px;margin-left:6px">${a.rar}</span>
          ${has?`<span style="font-size:9px;color:var(--green);margin-left:4px">✓ ${n}×</span>`:""}
          <br><i style="font-size:11px;color:var(--dim)">${esc(a.how)}</i>
        </span>
      </div>`;
    }
  }
  html+=`</div>`;
  return html;
}
function profileTabsHTML(active,onclickFn){
  const tabs=[
    ["geral","Geral"],
    ["avulsa","Avulsa"],
    ["full","🏆 Completo"],
    ["boost","⚡ Impulso"],
    ["confianca","📊 Confiança"],
    ["previsao","🔮 Previsão"],
    ["zebra","🐎 Zebra"],
    ["sobrevivencia","🛡️ Sobrevivência"],
    ["capitaoduplo","👑 Capitão Duplo"]
  ];
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs.map(([k,l])=>`<button class="statuspill ${k===active?"st-open":""}" style="cursor:pointer;${k===active?"border-color:var(--amber);color:var(--amber)":""}" onclick="${onclickFn}('${k}')">${l}</button>`).join("")}</div>`;
}
function setProfileTab(t){APP.profileTab=t;render();}
function setMemberProfileTab(t){APP.memberProfileTab=t;render();}
function openProfile(){go("profile");}
function profileHTML(){
  const prof=APP.profile;
  if(!prof)return `<div class="card"><div class="loading">Calculando seu perfil…</div></div>`;
  const st=prof._byMode?(prof[APP.profileTab]||prof.geral):prof;
  const medals=computeMedals(prof._byMode?prof.geral:prof);
  const archDistinct=Object.keys(st.archetypes).length;
  const TOTAL_ARCH=ARCH_CATALOG.length; // total de arquétipos possíveis no engine
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const tit=userTitle(prof._byMode?prof.geral:prof);
  let html=`<div class="card">
    <div class="h1 disp" style="color:var(--amber)">${esc(APP.user.username)}</div>
    <div style="display:flex;align-items:center;gap:10px;margin:8px 0 4px">
      <span style="font-size:28px">${tit.emoji}</span>
      <div style="flex:1">
        <div style="font-weight:700;color:var(--chalk);font-size:17px">${tit.name}</div>
        <div style="font-size:11px;color:var(--dim)">${tit.next?`faltam ${tit.next.falta} XP pra ${tit.next.name}`:"nível máximo!"} · ${tit.xp} XP</div>
        <div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${tit.prog}%;background:var(--amber)"></div></div>
      </div>
    </div>
    <p class="p" style="margin-bottom:0">Conquistas no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  // resumo em números
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    ${profileTabsHTML(APP.profileTab,"setProfileTab")}
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}
      ${statBox("🏆",st.wins,"vitórias")}
      ${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}
      ${statBox("📈",st.avg||0,"média/jogo")}
      ${statBox("🎯",st.podiumRate+"%","pódio")}
      ${statBox("🃏",archDistinct+"/"+TOTAL_ARCH,"arquétipos")}
      ${statBox("💎",rareCount,"raros")}
      ${statBox("🔥",st.bestStreak||0,"sequência")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Sua melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPerf?`<p class="p" style="margin-top:4px">🌟 Melhor atuação individual: <b style="color:var(--amber)">${esc(st.bestPerf.name)}</b> — ${st.bestPerf.pts.toFixed(1)} pts em ${esc(st.bestPerf.game)}${st.bestPerf.cap?" (capitão)":""}.</p>`:""}
    ${st.topPlayer?`<p class="p" style="margin-top:4px">💰 Craque favorito (mais pontos): <b style="color:var(--amber)">${esc(st.topPlayer.name)}</b> (${st.topPlayer.pts} pts somados).</p>`:""}
    ${st.bestPlayer?`<p class="p" style="margin-top:4px">📋 Mais escalado: <b style="color:var(--chalk)">${esc(st.bestPlayer.name)}</b> (${st.bestPlayer.n}×).</p>`:""}
    ${st.topTactic?`<p class="p" style="margin-top:4px">🧠 Tática preferida: <b style="color:var(--chalk)">${esc(st.topTactic.name)}</b> (${st.topTactic.n}×).</p>`:""}
    ${st.capTotal>=1?`<p class="p" style="margin-top:4px">🎖️ Capitão certeiro: <b style="color:var(--chalk)">${st.capRate}%</b> (acertou o melhor ${st.capHits}/${st.capTotal}).</p>`:""}
  </div>`;
  // medalhas
  html+=`<div class="card"><div class="h2 disp">Medalhas</div>`;
  if(!medals.length)html+=`<p class="p" style="margin-top:8px">Nenhuma medalha ainda. Monte times nos jogos encerrados para começar a colecionar.</p>`;
  else html+=`<div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div>`;
  html+=`</div>`;
  // COLEÇÃO completa de arquétipos (usa o geral: tudo que já desbloqueou)
  html+=collectionHTML((APP.profile._byMode?APP.profile.geral:APP.profile).archetypes);
  // coleção de arquétipos
  if(topArch.length){
    html+=`<div class="card"><div class="h2 disp">Seus arquétipos mais frequentes${helpBtn("arquetipo")}</div><div style="margin-top:10px">`;
    topArch.forEach(([a,n])=>{html+=`<div class="rank" style="padding:10px 14px"><div class="nm">${esc(a)}</div><div class="pt mono" style="font-size:15px">${n}×</div></div>`;});
    html+=`</div></div>`;
  }
  // histórico de partidas (clicável, com detalhe por jogador)
  const phist=APP.profileHistory;
  html+=`<div class="card"><div class="h2 disp">Últimas partidas</div>`;
  if(!phist)html+=`<div class="loading">Carregando histórico…</div>`;
  else if(!phist.length)html+=`<p class="p" style="margin-top:8px">Você ainda não jogou nenhuma partida finalizada.</p>`;
  else{html+=`<p class="p" style="margin:6px 0 4px;font-size:12px">Toque numa partida pra abrir, e num jogador pra ver os detalhes da pontuação e o arquétipo.</p>`;phist.forEach((h,hi)=>{html+=histGameHTML(h,hi,"p");});}
  html+=`</div>`;
  html+=`<div class="card">
    <div class="tag" style="margin-bottom:6px">CONTA</div>
    <p class="p" style="margin-bottom:10px;font-size:12px">Seu apelido é como os outros te veem. A senha é o que você usa pra entrar no app.</p>
    <button class="btn ghost" style="margin-bottom:8px" onclick="askChangeUsername()">✏️ Mudar nome de usuário</button>
    <button class="btn ghost" onclick="askChangePassword()">🔑 Mudar senha</button>
  </div>`;
  html+=`<div class="card">
    <div class="tag" style="margin-bottom:6px;color:var(--red)">ZONA DE RISCO</div>
    <p class="p" style="margin-bottom:10px">Excluir seu histórico oculta do seu perfil os times que você montou nos jogos já encerrados (zera medalhas e conquistas). Você continua no ranking das salas. Pede sua senha pra confirmar.</p>
    <button class="btn ghost" style="color:var(--red);border-color:var(--red)" onclick="askHideHistory()">🗑 Excluir histórico do perfil</button>
  </div>`;
  return html;
}
function statBox(emoji,val,label){
  return `<div class="slot" style="cursor:default;text-align:center;min-height:auto;padding:12px 6px">
    <div style="font-size:20px">${emoji}</div>
    <div class="mono" style="font-size:18px;color:var(--amber);margin-top:4px">${val}</div>
    <div style="font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:2px;text-transform:uppercase">${label}</div>
  </div>`;
}
// ── LISTA DE MEMBROS DO GRUPO ──
function membersHTML(){
  const list=APP.members;
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">👥 Membros</div>
      <div class="userchip" onclick="go('home')" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">Grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>. Toque num membro pra ver o perfil e o histórico de times.</p>
  </div><div class="card">`;
  if(!list)html+=`<div class="loading">Carregando membros…</div>`;
  else if(!list.length)html+=`<p class="p">Nenhum membro encontrado.</p>`;
  else html+=list.map(u=>{
    const isMe=u===APP.user?.username;
    return `<div class="rank${isMe?" me":""}" style="cursor:pointer" onclick="openMember('${encodeURIComponent(u)}')"><div class="po">👤</div><div class="nm">${esc(u)}${isMe?" <small>(você)</small>":""}</div><div class="pt mono" style="font-size:15px">›</div></div>`;
  }).join("");
  html+=`</div>`;
  return html;
}
function openMember(encU){const u=decodeURIComponent(encU);go("member",null,null,u);}
// ── PERFIL + HISTÓRICO DE UM MEMBRO ──
function memberHTML(){
  const u=APP.memberView;
  const prof=APP.memberProfile;
  const hist=APP.memberHistory;
  let html=`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1 disp" style="color:var(--amber)">${esc(u||"")}</div>
      <div class="userchip" onclick="go('members')" style="cursor:pointer">← voltar</div>
    </div>
    <p class="p" style="margin-top:6px">Perfil no grupo <b style="color:var(--chalk)">${esc(APP.groupName||"")}</b>.</p>
  </div>`;
  if(!prof){html+=`<div class="card"><div class="loading">Calculando perfil…</div></div>`;return html;}
  const st=prof._byMode?(prof[APP.memberProfileTab]||prof.geral):prof;
  const stGeral=prof._byMode?prof.geral:prof;
  const archDistinct=Object.keys(st.archetypes).length;
  const rareCount=(st.rarities["Épico"]||0)+(st.rarities["Mítico"]||0)+(st.rarities["Lendário"]||0);
  const topArch=Object.entries(st.archetypes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const medals=computeMedals(stGeral);
  const tit=userTitle(stGeral);
  // título/nível
  html+=`<div class="card"><div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:26px">${tit.emoji}</span>
    <div style="flex:1"><div style="font-weight:700;color:var(--chalk);font-size:16px">${tit.name}</div>
    <div style="font-size:11px;color:var(--dim)">${tit.xp} XP</div>
    <div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${tit.prog}%;background:var(--amber)"></div></div></div>
  </div></div>`;
  // resumo
  html+=`<div class="card"><div class="h2 disp">Resumo</div>
    ${profileTabsHTML(APP.memberProfileTab,"setMemberProfileTab")}
    <div class="slots" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${statBox("🎮",st.games,"jogos")}${statBox("🏆",st.wins,"vitórias")}${statBox("🥇",st.podiums,"pódios")}
      ${statBox("📊",st.bestScore.toFixed(1),"recorde")}${statBox("📈",st.avg||0,"média/jogo")}${statBox("🎯",st.podiumRate+"%","pódio")}
      ${statBox("🃏",archDistinct+"/"+ARCH_CATALOG.length,"arquétipos")}${statBox("💎",rareCount,"raros")}${statBox("🔥",st.bestStreak||0,"sequência")}
    </div>
    ${st.bestGame?`<p class="p" style="margin-top:10px">Melhor partida: <b style="color:var(--chalk)">${esc(st.bestGame)}</b> (${st.bestScore.toFixed(1)} pts).</p>`:""}
    ${st.bestPerf?`<p class="p" style="margin-top:4px">🌟 Melhor atuação: <b style="color:var(--amber)">${esc(st.bestPerf.name)}</b> — ${st.bestPerf.pts.toFixed(1)} pts${st.bestPerf.game?` em ${esc(st.bestPerf.game)}`:""}.</p>`:""}
    ${st.topPlayer?`<p class="p" style="margin-top:4px">💰 Craque favorito: <b style="color:var(--amber)">${esc(st.topPlayer.name)}</b> (${st.topPlayer.pts} pts somados).</p>`:""}
    ${st.bestPlayer?`<p class="p" style="margin-top:4px">📋 Mais escalado: <b style="color:var(--chalk)">${esc(st.bestPlayer.name)}</b> (${st.bestPlayer.n}×).</p>`:""}
    ${st.topTactic?`<p class="p" style="margin-top:4px">🧠 Tática preferida: <b style="color:var(--chalk)">${esc(st.topTactic.name)}</b> (${st.topTactic.n}×).</p>`:""}
    ${st.capTotal>=1?`<p class="p" style="margin-top:4px">🎖️ Capitão certeiro: <b style="color:var(--chalk)">${st.capRate}%</b> (acertou o melhor ${st.capHits}/${st.capTotal}).</p>`:""}
  </div>`;
  // medalhas
  if(medals.length)html+=`<div class="card"><div class="h2 disp">Medalhas</div><div class="chips" style="margin-top:10px">${medals.map(md=>`<span class="chip arch" style="font-size:12px;padding:6px 11px">${md.emoji} ${esc(md.name)}</span>`).join("")}</div></div>`;
  // coleção de arquétipos do membro (geral)
  html+=collectionHTML(stGeral.archetypes);
  // arquétipos
  if(topArch.length){
    html+=`<div class="card"><div class="h2 disp">Arquétipos mais frequentes</div><div style="margin-top:10px">`;
    topArch.forEach(([a,n])=>{html+=`<div class="rank" style="padding:10px 14px"><div class="nm">${esc(a)}</div><div class="pt mono" style="font-size:15px">${n}×</div></div>`;});
    html+=`</div></div>`;
  }
  // histórico de partidas com times escalados
  html+=`<div class="card"><div class="h2 disp">Últimas partidas</div>`;
  if(!hist)html+=`<div class="loading">Carregando histórico…</div>`;
  else if(!hist.length)html+=`<p class="p" style="margin-top:8px">Este membro ainda não jogou nenhuma partida finalizada.</p>`;
  else hist.forEach((h,hi)=>{html+=histGameHTML(h,hi,"m");});
  html+=`</div>`;
  return html;
}

// === FIX clique-fantasma do pool ===
// O render() recria todo o DOM via innerHTML. Com onclick inline, no mobile o
// "click" sintético podia cair no elemento errado (o DOM era trocado durante o
// gesto), escalando o jogador de cima/baixo. Aqui usamos UM listener delegado no
// document (sobrevive ao re-render) que lê o id do elemento realmente tocado.
// Trava anti-duplo-disparo: o iOS às vezes dispara o evento mais de uma vez no
// mesmo toque; ignoramos repetições do mesmo jogador dentro de 350ms.
if(!window._poolPickDelegate){
  window._poolPickDelegate=true;
  window._poolLastPick={pid:null,t:0};
  document.addEventListener("click",function(ev){
    // se clicou num botão dentro da linha (ℹ️ perfil), deixa o botão agir e NÃO seleciona o jogador
    if(ev.target&&ev.target.closest&&ev.target.closest("button,.radarbtn")) return;
    const row=ev.target&&ev.target.closest?ev.target.closest(".playerpick[data-pid]"):null;
    if(!row)return;
    if(row.classList.contains("dis"))return;
    const pid=row.getAttribute("data-pid");
    if(pid==null||pid==="")return;
    ev.preventDefault();
    ev.stopPropagation();
    const now=Date.now();
    if(window._poolLastPick.pid===pid&&(now-window._poolLastPick.t)<350)return; // ignora duplo disparo
    window._poolLastPick={pid:pid,t:now};
    if(typeof place==="function")place(pid);
  },true); // captura: roda antes de qualquer handler remanescente
}
