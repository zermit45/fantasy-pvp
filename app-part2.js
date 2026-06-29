// BUILD: SORARE-v2-COM-STATS · app-part2 de 6 · 2026-06-25
// soma, por usuário, os pontos dos jogos FINALIZADOS desta rodada
async function computeRoundRanking(roundId){
  try{
    const all=await sb("entries?round_id=eq."+roundId+"&group_id=eq."+APP.groupId+"&select=*");
    if(!all||!all.length)return [];
    const mode=modeOf(APP.round);
    const isSelect=mode==="select";
    const isConf=mode==="confianca";
    const isPred=mode==="previsao";
    const isZebra=mode==="zebra";
    const isSurvival=mode==="sobrevivencia";
    const isCaptainDouble=mode==="capitaoduplo";
    const byUser={};
    const userGamePts={};
    // CONFIANÇA: preciso saber o total de jogos rankeados por usuário (pra escala do multiplicador)
    const confTotalByUser={};
    if(isConf){
      for(const e of all){if(e.conf_rank!=null){confTotalByUser[e.username]=(confTotalByUser[e.username]||0)+1;}}
    }
    // ── ELIMINAÇÃO (Impulso/Confiança): quem NÃO completou a estratégia zera a rodada toda.
    // Confiança: tem que ter ordenado TODOS os jogos da rodada.
    // Impulso: tem que ter gastado TODAS as fichas da pool.
    const eliminado={};
    const totalGamesRound=(APP.roundRooms||[]).length;
    const isBoostMode=mode==="boost";
    if(isConf||isBoostMode){
      // usuários que têm pelo menos um time montado na rodada
      const usuarios=[...new Set(all.filter(e=>e.slots&&Object.values(e.slots).some(Boolean)).map(e=>e.username))];
      // QUANTAS fichas a pool tem (modelo novo: boost_chips; antigo: boost_tokens)
      let poolN=0;
      if(isBoostMode){
        const r=APP.round;
        if(r&&Array.isArray(r.boost_chips)&&r.boost_chips.length)poolN=r.boost_chips.length;
        else if(r&&r.boost_tokens)poolN=r.boost_tokens;
      }
      const totalRoomsRound=(APP.roundRooms||[]).length;
      for(const u of usuarios){
        const minhas=all.filter(e=>e.username===u&&e.slots&&Object.values(e.slots).some(Boolean));
        if(isConf){
          // CONFIANÇA: a estratégia exige ter ordenado TODOS os jogos da rodada.
          // (escalar é livre jogo a jogo; quem não escalou um jogo só não pontua nele)
          const ordenados=all.filter(e=>e.username===u&&e.conf_rank!=null).length;
          if(minhas.length>0&&totalRoomsRound>0&&ordenados<totalRoomsRound)eliminado[u]=true;
        }else if(isBoostMode&&poolN>0){
          // QUANTAS fichas o usuário gastou no total, somando os DOIS modelos por entry:
          //  - novo: boost_chips (array de valores) → conta o length
          //  - antigo: boost (número de fichas naquele jogo) → conta o número
          let usadasN=0;
          for(const e of all){
            if(e.username!==u)continue;
            let c=e.boost_chips;
            if(typeof c==="string"){try{c=JSON.parse(c);}catch(_){c=null;}}
            if(Array.isArray(c)&&c.length)usadasN+=c.length;
            else usadasN+=Math.max(0,parseInt(e.boost,10)||0); // fallback modelo antigo
          }
          // elimina só se gastou MENOS fichas que a pool tem
          if(usadasN<poolN)eliminado[u]=true;
        }
      }
    }
    for(const rr of APP.roundRooms){
      const g=window.GAMES.data[rr.room_id];
      if(!g||!g.match||g.match.status!=="finished")continue; // só jogos já apurados
      const ctx=buildCtxFor(rr.room_id);if(!ctx)continue;
      const here=all.filter(e=>e.room_id===rr.room_id);
      for(const e of here){
        if(!e.slots||!Object.values(e.slots).some(Boolean))continue; // sem time montado
        if(isSelect&&e.confirmed!==true)continue; // SELECIONE: só pontua jogo travado
        if(eliminado[e.username])continue; // ELIMINADO: não completou a estratégia → zera
        const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
        let pts=sc.total;
        // CONFIANÇA: multiplica pelo peso da posição na ordem do usuário
        if(isConf&&e.conf_rank!=null){
          const tot=confTotalByUser[e.username]||1;
          pts=Math.round(pts*confMultiplier(e.conf_rank,tot)*10)/10;
        }
        if(isZebra){
          const uCode=underdogCode(ctx);
          let bonus=0;
          (sc.view||[]).forEach(v=>{
            if(!v||v.slot==="BENCH")return;
            const pl=ctx.byId&&ctx.byId[v.pid];
            if(pl&&pl.team===uCode)bonus+=Math.max(0,v.pts)*0.25;
          });
          pts=Math.round((pts+bonus)*10)/10;
        }
        if(isCaptainDouble){
          const cap=(sc.view||[]).find(v=>v&&v.cap);
          if(cap)pts=Math.round((pts+(cap.pts/6))*10)/10; // cap já tem 1.2x; +pts/6 transforma em ~1.4x
        }
        if(!byUser[e.username])byUser[e.username]={username:e.username,total:0,games:0,predBonus:0};
        byUser[e.username].total+=pts;
        byUser[e.username].games++;
        (userGamePts[e.username]=userGamePts[e.username]||[]).push(pts);
        // PREVISÃO: bônus em % sobre os pontos da escalação naquele jogo
        if(isPred&&e.pred_home!=null&&e.pred_away!=null){
          const pct=predBonusPct(e,g.match);
          const b=Math.round(sc.total*(pct/100)*10)/10;
          byUser[e.username].total+=b;
          byUser[e.username].predBonus+=b;
        }
      }
    }
    if(isSurvival){
      for(const [u,ptsList] of Object.entries(userGamePts)){
        if(!byUser[u])continue;
        if(ptsList.some(p=>p<0)){
          byUser[u].total=0;
          byUser[u].eliminated=true;
          byUser[u].survivalNote="caiu";
        }else if(ptsList.length>1){
          const cut=Math.min(...ptsList);
          byUser[u].total-=cut;
          byUser[u].survivalCut=Math.round(cut*10)/10;
        }
      }
    }
    // adiciona os eliminados ao ranking com total 0 e flag (pra mostrar "eliminado")
    for(const u in eliminado){
      if(!byUser[u])byUser[u]={username:u,total:0,games:0,predBonus:0};
      byUser[u].eliminated=true;
      byUser[u].total=0;
    }
    return Object.values(byUser).map(u=>({...u,total:Math.round(u.total*10)/10})).sort((a,b)=>{
      // eliminados sempre por último
      if(a.eliminated&&!b.eliminated)return 1;
      if(b.eliminated&&!a.eliminated)return -1;
      return b.total-a.total;
    });
  }catch(e){return [];}
}
function underdogCode(ctx){
  const pp=ctx&&ctx.prepool;
  if(!pp||!pp.home||!pp.away)return null;
  return Number(pp.home.elo||0)<=Number(pp.away.elo||0)?pp.home.code:pp.away.code;
}
// % de bônus de previsão: compara o placar cravado com o real do match
function predBonusPct(entry,match){
  const ph=entry.pred_home,pa=entry.pred_away;
  if(ph==null||pa==null||!Array.isArray(match.score))return 0;
  const rh=match.score[0],ra=match.score[1];
  if(rh==null||ra==null)return 0;
  if(ph===rh&&pa===ra)return PRED_EXACT_PCT;              // cravou o placar
  const sign=x=>x>0?1:x<0?-1:0;
  if(sign(ph-pa)===sign(rh-ra))return PRED_RESULT_PCT;    // acertou o resultado (V/E/D)
  return 0;
}
// mostra a escalação de um usuário em cada jogo FINALIZADO da rodada, com pontos por jogador
function roundUserTeamsHTML(username){
  const all=APP.roundAllEntries||[];
  const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"CURINGA",BENCH:"BANCO"};
  let html=`<div style="background:rgba(255,255,255,.03);border-radius:10px;padding:10px;margin:2px 0 8px">`;
  let achou=false;
  APP.roundRooms.forEach(rr=>{
    const g=window.GAMES.data[rr.room_id];
    if(!g||!g.match||g.match.status!=="finished")return; // só jogos apurados
    const e=all.find(x=>x.username===username&&x.room_id===rr.room_id);
    if(!e||!e.slots||!Object.values(e.slots).some(Boolean))return; // não montou esse jogo
    const ctx=buildCtxFor(rr.room_id);if(!ctx)return;
    const sc=scoreEntryFor(JSON.parse(JSON.stringify(e)),ctx.eng,ctx);
    achou=true;
    const nome=g.prepool.home.name+" "+flagOf(g.prepool.home.code)+" × "+flagOf(g.prepool.away.code)+" "+g.prepool.away.name;
    const tacName=e.tactic&&window.ENGINE_TACTICS[e.tactic]?window.ENGINE_TACTICS[e.tactic].name:"sem tática";
    html+=`<div style="margin-bottom:8px"><div class="bsub" style="border:none;padding:0;margin:0 0 4px">${esc(nome)} · <span style="color:var(--amber)">${sc.total.toFixed(1)} pts</span>${sc.boostPct?` <span class="statuspill" style="background:color-mix(in srgb,${sc.boostPct<0?"#FF6B6B":"#FFC247"} 22%,transparent);color:${sc.boostPct<0?"#FF6B6B":"#FFC247"}">⚡ ${sc.boostPct<0?"":"+"}${sc.boostPct}%</span>`:""}</div>`;
    html+=`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Tática: ${esc(tacName)} · toque num jogador p/ detalhe</div>`;
    const renderLine=(v,isBench)=>{
      const meta=ctx.byId[v.pid];if(!meta)return"";
      const pkey="t_"+username+"_"+rr.room_id+"_"+v.slot;
      const open=_openTeamPlayer[pkey];
      const r=v.r;
      const capTag=v.cap?' <span style="color:var(--amber)">©</span>':"";
      const subTag=v.subIn?' <span style="color:var(--blue);font-size:10px">entrou</span>':"";
      const benchTag=isBench?' <span style="font-size:9px;color:var(--dim)">banco</span>':"";
      let body="";
      if(open&&r){
        body=`<div style="padding:4px 0 8px 6px;border-left:2px solid var(--line);margin:2px 0 6px 4px">
          <div class="bsub" style="border:none;margin:0 0 2px;padding:0">📋 ${r.minutes}' em campo</div>
          ${(r.statLines||[]).map(([l,c,u,pts])=>`<div class="line stat" style="padding:2px 0"><span>${l}<b class="cnt">${c}×</b><i class="unit">(${u>0?"+":""}${u})</i></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${(+pts).toFixed(1)}</span></div>`).join("")}
          ${(r.lines||[]).length?`<div class="bsub" style="margin:6px 0 2px">⚙️ Modificadores</div>`:""}
          ${(r.lines||[]).map(([k,val])=>`<div class="line" style="padding:2px 0"><span>${k}${modHelpBtn(k)}</span><span class="v mono ${val>0?"plus":val<0?"minus":""}">${val>0?"+":""}${(+val).toFixed(1)}</span></div>`).join("")}
          ${r.meta?`<div class="chips" style="margin-top:6px"><span class="chip arch">⭑ ${esc(r.meta.arch)}</span>${(r.meta.traits||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="rar r-${r.meta.rarity}">${(r.meta.rarity||"").toUpperCase()}</span></div>`:""}
        </div>`;
      }
      return `<div class="line" style="padding:3px 0;cursor:pointer" onclick="toggleTeamPlayer('${pkey}')"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[v.slot]}</span> ${esc(meta.name)}${capTag}${subTag}${benchTag} <span style="color:var(--blue);font-size:10px">${open?"▲":"▼"}</span></span><span class="mono" style="color:${isBench?"var(--dim)":(v.pts>=0?"var(--green)":"var(--red)")}">${v.pts.toFixed(1)}</span></div>${body}`;
    };
    sc.view.forEach(v=>{if(!v||v.slot==="BENCH")return;html+=renderLine(v,false);});
    const b=sc.view.find(v=>v&&v.slot==="BENCH");
    if(b&&b.pid)html+=renderLine(b,true);
    if(sc.quimicaPts>0 && typeof quimicaResultBlockHTML==="function"){
      html+=quimicaResultBlockHTML(sc.quimica, sc.quimicaPts, "team_"+username+"_"+rr.room_id);
    }
    html+=`</div>`;
  });
  if(!achou)html+=`<p class="p" style="margin:0">Sem time apurado nos jogos já encerrados.</p>`;
  html+=`</div>`;
  return html;
}
let _openTeamPlayer={};
function toggleTeamPlayer(k){_openTeamPlayer[k]=!_openTeamPlayer[k];render();}
let _openPeekRound={};
function togglePeekRound(k){_openPeekRound[k]=!_openPeekRound[k];render();}
// ESPIAR a escalação de um usuário num jogo que JÁ COMEÇOU (mesmo antes de apurar).
// Se o jogo já foi apurado, mostra os pontos; se só começou, mostra os jogadores escalados.
function peekLineupHTML(entry,roomId){
  const SLOT_LABEL={GK:"GOL",DEF:"DEF",MID:"MEI",ATT:"ATA",FLEX:"CURINGA",BENCH:"BANCO"};
  const g=window.GAMES.data[roomId];
  const finished=g&&g.match&&g.match.status==="finished";
  const tacName=entry.tactic&&window.ENGINE_TACTICS[entry.tactic]?window.ENGINE_TACTICS[entry.tactic].name:"sem tática";
  const _chips=Array.isArray(entry.boost_chips)?entry.boost_chips:null;
  const tkPct=_chips&&_chips.length?_chips.reduce((s,v)=>s+(Number(v)||0),0):(parseInt(entry.boost,10)||0)*BOOST_PCT;
  const mode=modeOf(APP.round);
  let html=`<div style="background:rgba(255,255,255,.03);border-radius:10px;padding:8px 10px;margin:2px 0 8px 6px;border-left:2px solid var(--line)">`;
  html+=`<div style="font-size:11px;color:var(--dim);margin-bottom:4px">Tática: ${esc(tacName)}${tkPct?` · <span style="color:${tkPct<0?"#FF6B6B":"#FFC247"}">⚡ ${tkPct<0?"":"+"}${tkPct}%</span>`:""}</div>`;
  // ── estratégia revelada por modo ──
  if(mode==="previsao"&&entry.pred_home!=null&&entry.pred_away!=null&&g){
    let selo="";
    if(finished&&Array.isArray(g.match.score)){
      const pct=predBonusPct(entry,g.match);
      if(pct===PRED_EXACT_PCT){
        selo=` <span style="display:inline-block;font-size:10px;font-weight:900;color:#0A0E1C;background:#54E0A8;border-radius:6px;padding:2px 7px;margin-left:4px">🎯 CRAVOU! +${PRED_EXACT_PCT}%</span>`;
      }else if(pct===PRED_RESULT_PCT){
        selo=` <span style="display:inline-block;font-size:10px;font-weight:800;color:#54E0A8;border:1px solid #54E0A8;border-radius:6px;padding:2px 7px;margin-left:4px">✓ acertou o resultado · +${PRED_RESULT_PCT}%</span>`;
      }else{
        selo=` <span style="display:inline-block;font-size:10px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:2px 7px;margin-left:4px">errou o palpite</span>`;
      }
    }
    const realStr=finished&&Array.isArray(g.match.score)?` <span style="color:var(--dim);font-weight:600">(real: ${g.match.score[0]}×${g.match.score[1]})</span>`:"";
    html+=`<div style="font-size:12px;font-weight:800;color:#54E0A8;margin-bottom:6px">🔮 Palpite: ${esc(g.prepool.home.code)} ${entry.pred_home} × ${entry.pred_away} ${esc(g.prepool.away.code)}${realStr}${selo}</div>`;
  }
  if(mode==="confianca"){
    // ordem COMPLETA de confiança do amigo (todos os jogos que ele ordenou)
    const mine=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&e.conf_rank!=null).sort((a,b)=>a.conf_rank-b.conf_rank);
    if(mine.length){
      const tot=mine.length;
      const itens=mine.map(e=>{const gg=window.GAMES.data[e.room_id];const nm=gg?gg.prepool.home.code+"×"+gg.prepool.away.code:"?";const aqui=e.room_id===roomId;return `<span style="display:inline-block;font-size:10px;font-weight:800;color:#C77DFF;border:1px solid ${aqui?"#C77DFF":"rgba(199,125,255,.4)"};border-radius:6px;padding:1px 6px;margin:0 3px 3px 0;${aqui?"background:color-mix(in srgb,#C77DFF 18%,transparent)":""}">${e.conf_rank+1}º ${esc(nm)} ${confMultiplier(e.conf_rank,tot).toFixed(2)}x</span>`;}).join("");
      html+=`<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--dim);margin-bottom:3px">📊 Ordem de confiança completa:</div>${itens}</div>`;
    }
  }
  if(mode==="boost"){
    // onde o amigo gastou os impulsos (todos os jogos da rodada)
    const mineAll=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&Array.isArray(e.boost_chips)&&e.boost_chips.length);
    if(mineAll.length){
      const itens=mineAll.map(e=>{const gg=window.GAMES.data[e.room_id];const nm=gg?gg.prepool.home.code+"×"+gg.prepool.away.code:"?";const soma=e.boost_chips.reduce((s,v)=>s+(Number(v)||0),0);const aqui=e.room_id===roomId;return `<span style="display:inline-block;font-size:10px;font-weight:800;color:${soma<0?"#FF6B6B":"#FFC247"};border:1px solid ${aqui?(soma<0?"#FF6B6B":"#FFC247"):"rgba(255,194,71,.4)"};border-radius:6px;padding:1px 6px;margin:0 3px 3px 0;${aqui?"background:color-mix(in srgb,#FFC247 14%,transparent)":""}">${esc(nm)} ${soma<0?"":"+"}${soma}%</span>`;}).join("");
      html+=`<div style="margin-bottom:6px"><div style="font-size:10px;color:var(--dim);margin-bottom:3px">⚡ Onde gastou os impulsos:</div>${itens}</div>`;
    }
  }
  // catálogo de jogadores do jogo (pid → nome/pos)
  const cat={};
  if(g&&g.prepool&&g.prepool.players)for(const p of g.prepool.players)cat[p.id]={name:p.name,pos:p.pos,team:p.team};
  if(finished){
    // jogo apurado: mostra com pontos
    const ctx=buildCtxFor(roomId);
    if(ctx){
      const sc=scoreEntryFor(JSON.parse(JSON.stringify(entry)),ctx.eng,ctx);
      sc.view.filter(Boolean).forEach(v=>{
        const meta=ctx.byId[v.pid];if(!meta)return;
        const isBench=v.slot==="BENCH";
        const capTag=v.cap?' <span style="color:var(--amber)">©</span>':"";
        const subTag=v.subIn?' <span style="color:var(--blue);font-size:10px">entrou</span>':"";
        html+=`<div class="line" style="padding:3px 0"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[v.slot]}</span> ${esc(meta.name)}${capTag}${subTag}${isBench?' <span style="font-size:9px;color:var(--dim)">banco</span>':""}</span><span class="mono" style="color:${isBench?"var(--dim)":(v.pts>=0?"var(--green)":"var(--red)")}">${isBench?"—":(v.pts>=0?"+":"")+v.pts.toFixed(1)}</span></div>`;
      });
      // ── decomposição base → ajuste → total (mesmo layout nos 3 modos) ──
      // sc.total já vem COM impulso aplicado (boostMult). A base sem impulso é sc.total/boostMult.
      const baseSemBoost=sc.boostMult&&sc.boostMult!==1?Math.round((sc.total/sc.boostMult)*10)/10:sc.total;
      let ajusteLinhas="",base=sc.total,total=sc.total,baseLabel="";
      if(mode==="previsao"&&entry.pred_home!=null&&entry.pred_away!=null&&Array.isArray(g.match.score)){
        const pct=predBonusPct(entry,g.match);
        base=sc.total; total=sc.total;
        if(pct>0){
          const predB=Math.round(sc.total*(pct/100)*10)/10;
          total=Math.round((sc.total+predB)*10)/10;
          const lbl=pct===PRED_EXACT_PCT?"🎯 Bônus cravou placar":"✓ Bônus acertou resultado";
          ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:#54E0A8">${lbl} (+${pct}%)</span><span class="mono" style="color:#54E0A8">+${predB.toFixed(1)}</span></div>`;
          baseLabel="só a escalação (sem palpite)";
        }
      }else if(mode==="boost"&&sc.boostPct){
        // impulso: base (sem impulso) → ajuste ± % → total impulsionado (sc.total)
        base=baseSemBoost; total=sc.total;
        const dif=Math.round((sc.total-baseSemBoost)*10)/10;
        const pos=sc.boostPct>=0;
        ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:${pos?"#FFC247":"#FF6B6B"}">⚡ Impulso (${pos?"+":""}${sc.boostPct}%)</span><span class="mono" style="color:${pos?"#FFC247":"#FF6B6B"}">${pos?"+":""}${dif.toFixed(1)}</span></div>`;
        baseLabel="só a escalação (sem impulso)";
      }else if(mode==="confianca"&&entry.conf_rank!=null){
        // confiança: base → ×multiplicador da posição → total
        const tot=(APP.roundAllEntries||[]).filter(e=>e.username===entry.username&&e.conf_rank!=null).length||1;
        const mult=confMultiplier(entry.conf_rank,tot);
        base=sc.total; total=Math.round(sc.total*mult*10)/10;
        const dif=Math.round((total-sc.total)*10)/10;
        const pos=dif>=0;
        ajusteLinhas=`<div class="line" style="padding:3px 0"><span style="color:#C77DFF">📊 Confiança ${entry.conf_rank+1}º (${mult.toFixed(2)}x)</span><span class="mono" style="color:${pos?"#54E0A8":"#FF6B6B"}">${pos?"+":""}${dif.toFixed(1)}</span></div>`;
        baseLabel="só a escalação (sem confiança)";
      }
      html+=ajusteLinhas;
      html+=`<div class="line" style="padding:5px 0 0;border-top:1px solid var(--line);margin-top:4px"><span style="font-weight:700">Total</span><span class="mono" style="color:var(--amber);font-weight:700">${total.toFixed(1)}</span></div>`;
      if(ajusteLinhas&&baseLabel)html+=`<div class="line" style="padding:1px 0 0"><span style="font-size:10px;color:var(--dim)">${baseLabel}</span><span class="mono" style="font-size:10px;color:var(--dim)">${base.toFixed(1)}</span></div>`;
    }
  }else{
    // jogo começou mas não apurou: mostra só os jogadores escalados (sem pontos)
    const slots=entry.slots||{};
    ["GK","DEF","MID","ATT","FLEX","BENCH"].forEach(slot=>{
      const pid=slots[slot];if(!pid)return;
      const meta=cat[pid];
      const capTag=entry.captain===slot?' <span style="color:var(--amber)">©</span>':"";
      const benchTag=slot==="BENCH"?' <span style="font-size:9px;color:var(--dim)">banco</span>':"";
      html+=`<div class="line" style="padding:3px 0"><span><span style="color:var(--dim);font-size:10px">${SLOT_LABEL[slot]}</span> ${meta?esc(meta.name):"?"}${capTag}${benchTag}</span></div>`;
    });
    html+=`<p class="p" style="font-size:10px;color:var(--dim);margin:4px 0 0">Pontos aparecem quando o jogo for apurado.</p>`;
  }
  html+=`</div>`;
  return html;
}
function toggleRoundUser(u){
  const name=decodeURIComponent(u);
  APP._openRoundUser=APP._openRoundUser===name?null:name;
  render();
}
// ----- helpers do novo fluxo -----
function roundEntryOf(roomId){return APP.roundEntries.find(e=>e.room_id===roomId);}
function pickedRoom(roomId){return !!roundEntryOf(roomId);}                 // tem entry deste jogo
function hasTeam(roomId){const e=roundEntryOf(roomId);return e&&e.slots&&Object.values(e.slots).some(Boolean);} // tem escalação
function isConfirmed(roomId){const e=roundEntryOf(roomId);return e&&e.confirmed===true;}                  // jogo TRAVADO (vale)
// no modo select, "usado" = quantos jogos o usuário travou (confirmed) — não quantas entries existem
function picksUsed(){return (APP.roundEntries||[]).filter(e=>e.confirmed===true).length;}
function picksLeft(){return APP.round?Math.max(0,APP.round.pick_limit-picksUsed()):0;}
// SELEÇÃO travada? Só trava se o admin fechou a pool manualmente (nada por horário).
// EXCEÇÃO admin: se o dev reabriu manualmente (picks_reopened), destrava mesmo após o kickoff.
function picksLocked(){
  if(APP.round&&APP.round.status&&APP.round.status!=="open")return true; // admin fechou manualmente
  if(APP.round&&APP.round.picks_reopened===true)return false;            // admin reabriu (vence o tempo)
  return boostLocked(); // só trava se o dev fechou alguma pool manualmente
}
// jogo travado individualmente? (dev forçou OU usuário confirmou OU jogo começou/finalizou)
// trava por HORÁRIO (jogo começou) ou jogo finalizado — não inclui trava manual do admin
// EXCEÇÃO: se o admin REABRIU a pool daquele jogo (status "open" mesmo após o kickoff),
// a trava por horário é vencida — vale pra TODOS os modos (avulso, previsão, etc.),
// liberando só AQUELE jogo (escalação e palpite). Jogo finalizado nunca reabre.
function roomReopened(roomId){
  // só "reaberto de propósito" vence a trava por horário. A flag reopened é setada
  // pelo admin ao reabrir a pool (setPoolStatus). Um jogo que nunca foi fechado NÃO
  // conta como reaberto — ele ainda trava no kickoff (pra ninguém editar sabendo o rumo do jogo).
  const gr=(APP.groupRooms||[]).find(x=>x.room_id===roomId);
  if(gr&&gr.reopened===true&&gr.status==="open")return true;
  const rr=(APP.roundRooms||[]).find(x=>x.room_id===roomId);
  if(rr&&rr.reopened===true&&rr.status==="open")return true;
  return false;
}
function roomTimeLocked(roomId){
  // NÃO trava mais por horário/kickoff. Só o fechamento manual do dev trava (roomAdminLocked).
  // Um jogo finalizado mantém a escalação travada (o resultado já é conhecido).
  const g=window.GAMES.data[roomId];
  if(g&&g.match&&g.match.status==="finished")return true;
  return false;
}
// trava manual do admin: pool fechada na rodada (round_rooms) OU na partida avulsa (group_rooms)
function roomAdminLocked(roomId){
  const rr=APP.roundRooms.find(x=>x.room_id===roomId);
  if(rr&&rr.status&&rr.status!=="open")return true;
  // robustez: se a pool avulsa daquele jogo está fechada, a escalação também trava
  const gr=(APP.groupRooms||[]).find(x=>x.room_id===roomId);
  if(gr&&gr.status&&gr.status!=="open")return true;
  return false;
}
// escalação travada para o jogador (qualquer um dos dois)
function roomLockedInRound(roomId){
  return roomAdminLocked(roomId)||roomTimeLocked(roomId);
}
// ── MODO IMPULSO ──
// 1º kickoff da rodada (ISO mais cedo entre os jogos da rodada). Impulsos travam aqui.
// 1ª partida da rodada (a primeira que foi adicionada / ordem dos round_rooms)
// trava da parte ESTRATÉGICA (ordem de confiança / fichas de impulso / palpites globais):
// trava assim que QUALQUER partida da rodada for fechada MANUALMENTE (pool fechada pelo dev).
// (a 1ª partida a começar já dá vantagem de informação pra quem ajustaria depois.)
// ─────────────────────────────────────────────────────────────
// TRAVA DA DISTRIBUIÇÃO (fichas de impulso / ordem de confiança / palpites de previsão)
// Regras (valem igual pros 3 modos):
//  • Trava: assim que QUALQUER partida da rodada é fechada MANUALMENTE (pool). Jogo só finalizado NÃO trava.
//  • Trava MANUAL: o dev pode forçar o fechamento a qualquer momento (boost_forced_lock).
//  • REABERTURA: só o dev reabre (boost_reopened). Vale tanto contra a trava automática
//    quanto contra a manual. Enquanto não há trava nenhuma, o player edita/confirma livremente.
// Resultado: o player NUNCA reabre sozinho depois de travado; só o dev.
// ─────────────────────────────────────────────────────────────
function anyGameLockedInRound(){
  const rrs=APP.roundRooms||[];
  // SÓ fechamento manual do dev trava a parte estratégica (palpite/confiança/impulso).
  // Um jogo apenas finalizado NÃO trava — a trava é sempre uma ação manual.
  return rrs.some(rr=>roomAdminLocked(rr.room_id));
}
function boostLocked(){
  const r=APP.round; if(!r)return false;
  if(r.boost_forced_lock===true) return true;   // dev forçou fechamento → travado (prioridade)
  if(r.boost_reopened===true) return false;       // dev reabriu → liberado
  return anyGameLockedInRound();                  // automático: alguma partida fechou/finalizou
}
// === IMPULSO v2: fichas com valores específicos ===
// a pool define APP.round.boost_chips = lista de valores, ex [25,15,15,-20].
// cada entry guarda boost_chips = valores das fichas atribuídas àquele jogo.
function poolChips(){
  const r=APP.round;
  if(r&&Array.isArray(r.boost_chips)&&r.boost_chips.length)return r.boost_chips.map(v=>Number(v)||0);
  // retrocompat: pool antiga (só boost_tokens) → N fichas de BOOST_PCT
  const n=r?(r.boost_tokens||0):0;return Array(n).fill(BOOST_PCT);
}
function boostMaxPerGame(){const r=APP.round;return r&&r.boost_max_per_game?r.boost_max_per_game:(r&&r.boost_chips&&r.boost_chips.length?0:BOOST_MAX_PER_GAME);}
function boostMinGames(){const r=APP.round;return r&&r.boost_min_games?r.boost_min_games:0;}
function boostNoMix(){const r=APP.round;return !!(r&&r.boost_no_mix);}
// ===== CONFIANÇA =====
// conf_rank é 0-based: 0 = mais confia. Guardado na entry de cada jogo.
function confRankOf(roomId){const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);return e&&e.conf_rank!=null?e.conf_rank:null;}
function confRankedCount(){return (APP.roundEntries||[]).filter(e=>e.conf_rank!=null).length;}
// lista de entries rankeadas, em ordem
function confOrdered(){return (APP.roundEntries||[]).filter(e=>e.conf_rank!=null).slice().sort((a,b)=>a.conf_rank-b.conf_rank);}
function confRoomOrderIds(){
  const base=(APP.roundRooms||[]).map(rr=>rr.room_id);
  if(APP.confOrderDraft&&APP.confOrderDraft.length)return APP.confOrderDraft.slice();
  return base.slice().sort((a,b)=>{
    const ia=base.indexOf(a),ib=base.indexOf(b);
    const ra=confRankOf(a),rb=confRankOf(b);
    if(ra==null&&rb==null)return ia-ib;
    if(ra==null)return 1;
    if(rb==null)return -1;
    return ra-rb;
  });
}
async function confStartOrdering(){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  const ids=confRoomOrderIds();
  APP.confOrderMode=true;
  APP.confOrderDraft=ids.slice();
  try{
    for(let i=0;i<ids.length;i++){
      const e=await ensureEntry(ids[i]);
      if(!e)continue;
      if(e.conf_rank!==i)await sbUpdate("entries",{conf_rank:i,confirmed:false,updated_at:new Date().toISOString()},entryFilter(ids[i]));
    }
    await loadRound(APP.roundId);
    APP.confOrderDraft=confRoomOrderIds();
    render();restoreScroll(snap);
    toast("Modo ordenar ligado. Segure em ↕ e arraste.");
  }catch(e2){toast("Erro: "+e2.message);}
}
function confStopOrdering(){APP.confOrderMode=false;APP.confOrderDraft=null;confDragCancel();renderKeepScroll();}
function confPreviewMove(targetRoomId){
  if(!APP.confDrag||!targetRoomId||APP.confDrag===targetRoomId)return;
  const ids=(APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft:confRoomOrderIds()).slice();
  const src=ids.indexOf(APP.confDrag),dst=ids.indexOf(targetRoomId);
  if(src<0||dst<0||src===dst)return;
  const moved=ids.splice(src,1)[0];
  ids.splice(dst,0,moved);
  APP.confOrderDraft=ids;
  APP.confHover=targetRoomId;
  confReorderDOM(ids,moved,targetRoomId,src,dst);
}
function confReorderDOM(ids,moved,targetRoomId,src,dst){
  try{
    const moving=document.querySelector(`[data-conf-room="${moved}"]`);
    const target=document.querySelector(`[data-conf-room="${targetRoomId}"]`);
    if(moving&&target&&target.parentNode){
      if(src<dst)target.parentNode.insertBefore(moving,target.nextSibling);
      else target.parentNode.insertBefore(moving,target);
    }
    const total=ids.length;
    ids.forEach((roomId,i)=>{
      document.querySelectorAll(`[data-conf-pos="${roomId}"]`).forEach(el=>{
        el.textContent=`📊 ${i+1}º · ${confMultiplier(i,total).toFixed(2)}x`;
      });
    });
  }catch(e){}
}
async function confPersistOrder(ids){
  if(boostLocked())return;
  const order=(ids&&ids.length?ids:confRoomOrderIds()).slice();
  for(let i=0;i<order.length;i++){
    await sbUpdate("entries",{conf_rank:i,confirmed:false,updated_at:new Date().toISOString()},entryFilter(order[i]));
  }
  await loadRound(APP.roundId);
  APP.confOrderDraft=confRoomOrderIds();
}
async function confAdd(roomId){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  let e=await ensureEntry(roomId);
  if(!e){toast("Erro ao preparar este jogo.");return;}
  if(e.conf_rank!=null)return;
  const next=confRankedCount(); // entra no fim
  try{await sbUpdate("entries",{conf_rank:next,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));await loadRound(APP.roundId);render();restoreScroll(snap);}
  catch(e2){toast("Erro: "+e2.message);}
}
async function confRemove(roomId){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  const ord=confOrdered().filter(e=>e.room_id!==roomId);
  try{
    // tira este e reindexa os demais
    await sbUpdate("entries",{conf_rank:null,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    for(let i=0;i<ord.length;i++){if(ord[i].conf_rank!==i)await sbUpdate("entries",{conf_rank:i},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${ord[i].room_id}`);}
    await loadRound(APP.roundId);render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
async function confMove(roomId,delta){
  if(boostLocked()){toast("A ordem já travou (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  const ord=confOrdered();
  const idx=ord.findIndex(e=>e.room_id===roomId);
  if(idx<0)return;
  const swap=idx+delta;
  if(swap<0||swap>=ord.length)return;
  const a=ord[idx],b=ord[swap];
  try{
    await sbUpdate("entries",{conf_rank:swap,confirmed:false,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${a.room_id}`);
    await sbUpdate("entries",{conf_rank:idx,confirmed:false,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}&room_id=eq.${b.room_id}`);
    await loadRound(APP.roundId);render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
function confPick(roomId,ev){
  if(ev){ev.preventDefault&&ev.preventDefault();ev.stopPropagation&&ev.stopPropagation();}
  if(boostLocked())return;
  if(!APP.confOrderMode)APP.confOrderMode=true;
  if(!APP.confOrderDraft||!APP.confOrderDraft.length)APP.confOrderDraft=confRoomOrderIds();
  if(APP.confDrag===roomId){APP.confDrag=null;confTouchOff();renderKeepScroll();return;}
  if(APP.confDrag){confDropOn(roomId);return;}
  APP.confDrag=roomId;
  APP.confHover=null;
  confTouchOn();
  try{navigator.vibrate&&navigator.vibrate(12);}catch(e){}
  renderKeepScroll();
}
function confDragStart(roomId){
  confPick(roomId);
}
function confDragOver(roomId){
  if(!APP.confDrag||APP.confDrag===roomId)return;
  APP.confHover=roomId;
  document.querySelectorAll(".confdrop").forEach(el=>el.classList.remove("confdrop"));
  const el=document.querySelector(`[data-conf-room="${roomId}"]`);
  if(el)el.classList.add("confdrop");
}
function confDragCancel(){
  APP.confDrag=null;
  APP.confHover=null;
  confAutoScrollStop();
  confTouchOff();
  confPointerOff();
  document.querySelectorAll(".confdrop").forEach(el=>el.classList.remove("confdrop"));
}
let _confPointer={x:0,y:0}, _confAutoRAF=null, _confAutoSpeed=0;
function confAutoScrollUpdate(x,y){
  _confPointer={x,y};
  const h=window.innerHeight||document.documentElement.clientHeight||700;
  const zone=Math.min(150,Math.max(82,h*0.18));
  let speed=0;
  if(y<zone) speed=-Math.round(((zone-y)/zone)*18)-3;
  else if(y>h-zone) speed=Math.round(((y-(h-zone))/zone)*18)+3;
  _confAutoSpeed=Math.max(-24,Math.min(24,speed));
  if(_confAutoSpeed&&!_confAutoRAF)_confAutoRAF=requestAnimationFrame(confAutoScrollTick);
  if(!_confAutoSpeed)confAutoScrollStop();
}
function confAutoScrollTick(){
  _confAutoRAF=null;
  if(!APP.confDrag||!_confAutoSpeed)return;
  const before=window.scrollY||document.documentElement.scrollTop||0;
  window.scrollBy(0,_confAutoSpeed);
  const after=window.scrollY||document.documentElement.scrollTop||0;
  if(after!==before)confPointMove(_confPointer.x,_confPointer.y);
  _confAutoRAF=requestAnimationFrame(confAutoScrollTick);
}
function confAutoScrollStop(){
  _confAutoSpeed=0;
  if(_confAutoRAF){cancelAnimationFrame(_confAutoRAF);_confAutoRAF=null;}
}
let _confTouchBound=false;
function confTouchOn(){
  try{document.body.classList.add("confdragging");}catch(e){}
  if(_confTouchBound)return;
  document.addEventListener("touchmove",confTouchMove,{passive:false});
  document.addEventListener("touchend",confTouchEnd,{passive:false});
  document.addEventListener("touchcancel",confTouchEnd,{passive:false});
  _confTouchBound=true;
}
function confTouchOff(){
  try{document.body.classList.remove("confdragging");}catch(e){}
  if(!_confTouchBound)return;
  document.removeEventListener("touchmove",confTouchMove,{passive:false});
  document.removeEventListener("touchend",confTouchEnd,{passive:false});
  document.removeEventListener("touchcancel",confTouchEnd,{passive:false});
  _confTouchBound=false;
}
function confTouchMove(ev){
  if(!APP.confDrag)return;
  if(ev.cancelable)ev.preventDefault();
  const t=ev.touches&&ev.touches[0];
  if(!t)return;
  confAutoScrollUpdate(t.clientX,t.clientY);
  confPointMove(t.clientX,t.clientY);
}
function confPointMove(x,y){
  const el=document.elementFromPoint(x,y);
  const row=el&&el.closest?el.closest("[data-conf-room]"):null;
  const rid=row&&row.getAttribute("data-conf-room");
  if(rid&&rid!==APP.confDrag&&rid!==APP.confHover)confPreviewMove(rid);
}
function confTouchEnd(ev){
  if(!APP.confDrag)return;
  if(ev&&ev.cancelable)ev.preventDefault();
  const order=APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft.slice():confRoomOrderIds();
  confAutoScrollStop();
  confDragCancel();
  confPersistOrder(order).then(()=>{renderKeepScroll();}).catch(e=>toast("Erro: "+e.message));
}
let _confPointerBound=false;
function confPointerStart(roomId,ev){
  if(ev){ev.preventDefault&&ev.preventDefault();ev.stopPropagation&&ev.stopPropagation();}
  confPick(roomId,ev);
  if(_confPointerBound)return;
  document.addEventListener("pointermove",confPointerMove,{passive:false});
  document.addEventListener("pointerup",confPointerEnd,{passive:false});
  document.addEventListener("pointercancel",confPointerEnd,{passive:false});
  _confPointerBound=true;
}
function confCardPointerStart(roomId,ev){
  const t=ev&&ev.target;
  if(t&&t.closest&&t.closest("button,input,select,textarea,.statuspill,.cbtn,a"))return;
  confPointerStart(roomId,ev);
}
function confPointerOff(){
  if(!_confPointerBound)return;
  document.removeEventListener("pointermove",confPointerMove,{passive:false});
  document.removeEventListener("pointerup",confPointerEnd,{passive:false});
  document.removeEventListener("pointercancel",confPointerEnd,{passive:false});
  _confPointerBound=false;
}
function confPointerMove(ev){
  if(!APP.confDrag)return;
  if(ev.cancelable)ev.preventDefault();
  confAutoScrollUpdate(ev.clientX,ev.clientY);
  confPointMove(ev.clientX,ev.clientY);
}
function confPointerEnd(ev){
  if(!APP.confDrag){confPointerOff();return;}
  if(ev&&ev.cancelable)ev.preventDefault();
  const order=APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft.slice():confRoomOrderIds();
  confAutoScrollStop();
  confPointerOff();
  confDragCancel();
  confPersistOrder(order).then(()=>{renderKeepScroll();}).catch(e=>toast("Erro: "+e.message));
}
async function confDropOn(roomId){
  const snap=scrollSnap();
  const from=APP.confDrag;
  confDragCancel();
  if(!from||from===roomId||boostLocked())return;
  const ids=(APP.confOrderDraft&&APP.confOrderDraft.length?APP.confOrderDraft:confRoomOrderIds()).slice();
  const src=ids.indexOf(from);
  const dst=ids.indexOf(roomId);
  if(src<0||dst<0)return;
  const moved=ids.splice(src,1)[0];
  ids.splice(dst,0,moved);
  try{
    await confPersistOrder(ids);
    render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
// ===== PREVISÃO =====
function predOf(roomId){const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);if(!e)return null;if(e.pred_home==null&&e.pred_away==null)return null;return {home:e.pred_home,away:e.pred_away};}
async function predSet(roomId,homeVal,awayVal){
  if(roomLockedInRound(roomId)){toast("Esta partida já travou — o palpite dela não muda mais.");return;}
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  if(!e){toast("Monte o time deste jogo primeiro.");return;}
  const patch={confirmed:false,updated_at:new Date().toISOString()};
  if(homeVal!==null){let h=parseInt(homeVal,10);patch.pred_home=isNaN(h)?null:Math.max(0,h);}
  if(awayVal!==null){let a=parseInt(awayVal,10);patch.pred_away=isNaN(a)?null:Math.max(0,a);}
  try{await sbUpdate("entries",patch,entryFilter(roomId));await loadRound(APP.roundId);render();}
  catch(e2){toast("Erro: "+e2.message);}
}
// fichas que o jogador já atribuiu (lista achatada de valores, por todos os jogos da rodada)
function chipsAssigned(){
  const out=[];
  for(const e of (APP.roundEntries||[])){const c=e.boost_chips;if(Array.isArray(c))for(const v of c)out.push(Number(v)||0);}
  return out;
}
// fichas ainda disponíveis = pool menos as já atribuídas (casando por valor)
function chipsAvailable(){
  const pool=poolChips().slice();
  for(const v of chipsAssigned()){const i=pool.indexOf(v);if(i>=0)pool.splice(i,1);}
  return pool;
}
// fichas (valores) que ESTE usuário pôs num jogo específico
function chipsOn(roomId){
  const e=(APP.roundEntries||[]).find(x=>x.room_id===roomId);
  const c=e&&e.boost_chips;return Array.isArray(c)?c.map(v=>Number(v)||0):[];
}
// atribui uma ficha (de um valor) a um jogo; ou remove (signRemove=valor a tirar)
async function assignChip(roomId,value){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  let e=await ensureEntry(roomId);
  if(!e){toast("Erro ao preparar este jogo.");return;}
  // tem essa ficha disponível?
  const avail=chipsAvailable();
  if(avail.indexOf(value)<0){toast("Você não tem mais uma ficha de "+(value<0?value:"+"+value)+"%.");return;}
  const cur=chipsOn(roomId).slice();
  const mx=boostMaxPerGame();
  if(mx>0&&cur.length>=mx){toast("Máximo de "+mx+" ficha(s) por partida.");return;}
  // regra "não misturar": neste jogo, só positivas OU só negativas
  if(boostNoMix()&&cur.length){
    const temNeg=cur.some(v=>v<0), temPos=cur.some(v=>v>0);
    if((value<0&&temPos)||(value>0&&temNeg)){
      toast("Nesta pool não dá pra juntar fichas positivas e negativas no mesmo jogo.");return;
    }
  }
  cur.push(value);
  try{
    await sbUpdate("entries",{boost_chips:cur,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
async function unassignChip(roomId,value){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  const cur=chipsOn(roomId).slice();
  const i=cur.indexOf(value);if(i<0)return;cur.splice(i,1);
  try{
    await sbUpdate("entries",{boost_chips:cur,confirmed:false,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
// nº de tokens que ESTE usuário já gastou na rodada (retrocompat — usa a lista nova)
function boostUsed(){return chipsAssigned().length;}
function boostLeft(){return chipsAvailable().length;}
// quantos tokens ESTE usuário pôs num jogo específico
function boostOn(roomId){return chipsOn(roomId).length;}
// ajusta tokens de impulso num jogo (retrocompat para pools antigas: +1/−1 com fichas iguais)
async function changeBoost(roomId,delta){
  if(boostLocked()){toast("Os impulsos já travaram (a 1ª partida foi fechada).");return;}
  if(delta>0){
    let e=await ensureEntry(roomId);
    if(!e){toast("Erro ao preparar este jogo.");return;}
    const avail=chipsAvailable();if(!avail.length){toast("Você já gastou todas as suas fichas.");return;}
    // pega a ficha de maior valor disponível (comportamento antigo: todas iguais)
    return assignChip(roomId,avail.sort((a,b)=>b-a)[0]);
  }else{
    const cur=chipsOn(roomId);if(!cur.length)return;
    return unassignChip(roomId,cur[cur.length-1]);
  }
}
// IMPULSO — confirmar/reabrir a distribuição de tokens. Usa entry.confirmed (sem outro uso no boost).
// Reeditável até a 1ª partida ser fechada (boostLocked).
function boostConfirmed(){
  const es=(APP.roundEntries||[]);
  if(!es.length)return false;
  // confirmado = todas as entries do usuário marcadas confirmed
  return es.every(e=>e.confirmed===true);
}
async function toggleBoostConfirm(){
  if(boostLocked()){toast("Já travou (a 1ª partida foi fechada).");return;}
  const snap=scrollSnap();
  const willConfirm=!boostConfirmed();
  const mode=modeOf(APP.round);
  if(willConfirm){
    if(mode==="boost"){
      // precisa ter distribuído TODAS as fichas (inclusive as negativas obrigatórias)
      const left=chipsAvailable();
      if(left.length){
        const neg=left.filter(v=>v<0).length;
        toast(neg?`Você ainda tem ${left.length} ficha(s) por usar, incluindo ${neg} negativa(s) obrigatória(s).`:`Você ainda tem ${left.length} ficha(s) de impulso por distribuir.`);
        return;
      }
      const mg=boostMinGames();
      if(mg>0){
        const jogosComFicha=(APP.roundEntries||[]).filter(e=>Array.isArray(e.boost_chips)&&e.boost_chips.length).length;
        if(jogosComFicha<mg){toast(`Distribua suas fichas em pelo menos ${mg} partidas diferentes (hoje em ${jogosComFicha}).`);return;}
      }
    }else if(mode==="confianca"){
      // a ORDEM independe da escalação: basta ter todos os jogos da rodada na ordem de confiança.
      // (a escalação de cada jogo é livre até aquela partida começar)
      const ordenados=(APP.roundEntries||[]).filter(e=>e.conf_rank!=null).length;
      const faltam=APP.roundRooms.length-ordenados;
      if(faltam>0){toast(`Coloque todos os jogos na sua ordem de confiança (faltam ${faltam}).`);return;}
    }else if(mode==="previsao"){
      const montados=(APP.roundEntries||[]).filter(e=>e.slots&&Object.values(e.slots).some(Boolean));
      const semPalpite=montados.filter(e=>e.pred_home==null||e.pred_away==null);
      if(montados.length<APP.roundRooms.length){toast("Escale todos os jogos antes de confirmar os palpites.");return;}
      if(semPalpite.length){toast(`Crave o placar de todos os jogos (faltam ${semPalpite.length}).`);return;}
    }
    if(!APP._confirmSummaryBypass){
      APP.confirm={mode:"roundSummary",label:"Resumo da mini rodada"};
      render();
      restoreScroll(snap);
      return;
    }
  }
  const msgOn=mode==="confianca"?"Ordem confirmada! (dá pra reeditar até o 1º jogo)":mode==="previsao"?"Palpites confirmados! (dá pra reeditar até o 1º jogo)":"Impulsos confirmados! (dá pra reeditar até o 1º jogo)";
  const msgOff=mode==="confianca"?"Ordem reaberta pra edição.":mode==="previsao"?"Palpites reabertos pra edição.":"Impulsos reabertos pra edição.";
  try{
    await sbUpdate("entries",{confirmed:willConfirm,updated_at:new Date().toISOString()},`group_id=eq.${APP.groupId}&round_id=eq.${APP.roundId}&username=eq.${encodeURIComponent(APP.user.username)}`);
    await loadRound(APP.roundId);
    toast(willConfirm?msgOn:msgOff);
    render();restoreScroll(snap);
  }catch(e2){toast("Erro: "+e2.message);}
}
function confirmRoundSummary(){
  APP.confirm=null;
  APP._confirmSummaryBypass=true;
  toggleBoostConfirm().finally(()=>{APP._confirmSummaryBypass=false;});
}
async function selectRoundGame(roomId){
  if(picksLocked()){toast("A seleção de jogos já foi fechada.");return;}
  if(pickedRoom(roomId)){toast("Você já selecionou este jogo.");return;}
  if(picksLeft()<=0){toast("Você já selecionou seus "+APP.round.pick_limit+" jogos.");return;}
  try{
    await sbInsert("entries",{room_id:roomId,group_id:APP.groupId,round_id:APP.roundId,username:APP.user.username,slots:{GK:null,DEF:null,MID:null,ATT:null,FLEX:null,BENCH:null},captain:null,tactic:null,confirmed:false,updated_at:new Date().toISOString()});
    await loadRound(APP.roundId);
    toast("Jogo selecionado! Agora monte o time quando quiser.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// FASE 1 — desfazer seleção (só enquanto a seleção está aberta e o jogo não travou)
async function unselectRoundGame(roomId){
  if(picksLocked()){toast("A seleção já foi fechada — não dá pra remover.");return;}
  if(roomLockedInRound(roomId)){toast("Este jogo já travou.");return;}
  try{
    await sbDelete("entries",entryFilter(roomId));
    await loadRound(APP.roundId);
    toast("Seleção desfeita.");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
// MODO SELECIONE — travar/destravar um jogo (marca quais VALEM). Travado = confirmed=true.
// Destravar é livre enquanto a seleção estiver aberta e o jogo não tiver começado.
async function toggleSelectLock(roomId){
  const e=roundEntryOf(roomId);
  if(!e){toast("Monte o time deste jogo primeiro.");return;}
  const willLock=!(e.confirmed===true);
  if(willLock){
    if(!hasTeam(roomId)){toast("Monte o time antes de travar este jogo.");return;}
    if(picksLeft()<=0){toast("Você já travou seus "+APP.round.pick_limit+" jogos. Destrave um pra trocar.");return;}
  }else{
    // destravar: só se a seleção ainda está aberta e o jogo não começou
    if(picksLocked()){toast("A seleção já foi fechada — não dá pra destravar.");return;}
    if(roomTimeLocked(roomId)){toast("O jogo já começou — trava definitiva.");return;}
  }
  try{
    await sbUpdate("entries",{confirmed:willLock,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);
    toast(willLock?"Jogo travado — esse vale! (escalação ainda editável)":"Jogo destravado.");
    render();
  }catch(e2){toast("Erro: "+e2.message);}
}
// FASE 2 — usuário confirma a equipe de um jogo (salva slots atuais + trava)
async function confirmTeam(roomId){
  try{
    await sbUpdate("entries",{slots:APP.slots,captain:APP.captain,tactic:APP.tactic,confirmed:true,updated_at:new Date().toISOString()},entryFilter(roomId));
    await loadRound(APP.roundId);
    toast("Equipe confirmada! Esse time está travado.");
    go("round",null,APP.roundId);
  }catch(e){toast("Erro: "+e.message);}
}
// admin: força a trava da escalação de um jogo (quando a partida começa)
async function setRoundRoomStatus(roomId,status){
  if(!isAdmin()||!APP.roundId)return;
  try{
    const res=await sbUpdate("round_rooms",{status},"round_id=eq."+APP.roundId+"&room_id=eq."+encodeURIComponent(roomId));
    // se o PATCH não retornou a linha atualizada, o update não pegou (RLS ou linha inexistente)
    if(!res||!res.length){
      toast("Não consegui alterar (verifique as permissões da tabela round_rooms).");
      return;
    }
    // atualiza em memória de imediato (não depende só do reload)
    const rr=APP.roundRooms.find(x=>x.room_id===roomId);
    if(rr)rr.status=status;
    await loadRound(APP.roundId);
    toast(status==="locked"?"Escalação deste jogo travada (todos).":"Escalação deste jogo destravada (liberada).");
    render();
  }catch(e){toast("Erro: "+e.message);}
}
