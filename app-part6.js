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
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleHistPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[vw.slot]}</b> ${esc(pl?pl.name:"?")}${capTag}${subTag}${benchTag}${archTag}</span><span class="v mono ${vw.pts>0?"plus":vw.pts<0?"minus":""}">${vw.slot==="BENCH"?"—":(vw.pts>0?"+":"")+vw.pts.toFixed(1)}</span></div>`;
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
    <div class="score disp"><div class="side"><div class="fl">${flagOf(pp.home.code)}</div><div class="cd">${esc(pp.home.code)}</div><div class="nmfull">${esc(pp.home.name)}</div></div><div class="vs mono">${m.score[0]}–${m.score[1]}</div><div class="side"><div class="fl">${flagOf(pp.away.code)}</div><div class="cd">${esc(pp.away.code)}</div><div class="nmfull">${esc(pp.away.name)}</div></div></div></div>`;
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
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleRankPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[v.slot]}</b> ${esc(pl?pl.name:"?")}${capTag}${subTag}${benchTag} <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${v.pts>0?"plus":v.pts<0?"minus":""}">${v.slot==="BENCH"?"—":(v.pts>0?"+":"")+v.pts.toFixed(1)}</span></div>`;
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
    return `<div class="receipt"><div class="rhead" onclick="toggleBase(${i})">
      <div class="sl mono pc-${row.pos}">${SLOT_LABEL[row.pos]}</div>
      <div class="nm">${esc(row.name)}<span class="teamtag" style="--tc:${teamColor(row.team)};margin-left:6px">${row.team}</span> <small>${row.min}' · toque p/ detalhe</small></div>
      <div class="tot mono${row.pts<0?" neg":""}">${row.pts>0?"+":""}${row.pts.toFixed(1)}</div></div><div class="expandable ${open?"open":""}"><div class="rbody">${body}</div></div></div>`;
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
        html+=`<div class="line" style="padding:6px 0;cursor:pointer" onclick="toggleDreamPlayer('${pkey}')"><span><b style="color:var(--dim);font-size:9px">${SLOT_LABEL[sl]}</b> ${esc(pl?pl.name:"?")}<span class="teamtag" style="--tc:${teamColor(pl?pl.team:"")};margin-left:6px">${pl?pl.team:""}</span>${capTag} <span style="color:var(--dim);font-size:10px">${it.price}💰</span> <span style="color:var(--blue);font-size:10px">${pOpen?"▲":"▼"}</span></span><span class="v mono ${pts>0?"plus":pts<0?"minus":""}">${pts>0?"+":""}${pts.toFixed(1)}</span></div>`;
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
  </div>${APP.showRules?rulesModalHTML():""}${APP.help?helpModalHTML():""}${APP.showManual?superManualHTML():""}`;
}
function toggleRules(){APP.showRules=!APP.showRules;render();}
function toggleManual(){APP.showManual=!APP.showManual;render();}
// ---- mini-ajudas contextuais (botão ? pequeno em vários lugares) ----
const HELP={
  minirodada:["Mini rodada","Você recebe um número de fichas (tokens) de entrada. Cada jogo que você escolher gasta 1 ficha e garante sua vaga naquele jogo. Você não precisa usar todas. Escolher os jogos certos (onde você acha que vai pontuar mais) é a estratégia. A escalação de cada jogo é montada depois e pode ser ajustada até a partida começar."],
  token:["Fichas de entrada","Cada mini rodada te dá um número fixo de fichas (ex: 2). Tocar no + verde de um jogo gasta 1 ficha e sela sua participação NAQUELE jogo. Enquanto a seleção estiver aberta, dá pra trocar à vontade. Quando a partida é fechada, suas escolhas travam."],
  escalacao:["Escalação","Montar o time é separado de escolher o jogo. A escalação fica salva e você pode mudá-la quantas vezes quiser até a partida começar — ela trava sozinha no apito inicial. Não existe 'confirmar equipe' aqui: o que está garantido é a vaga no jogo (a ficha)."],
  liga:["Liga","Junta várias rodadas numa classificação geral da temporada. Dois rankings: pontos de tabela (10/7/5/3/1 conforme a colocação em cada mini rodada) e pontuação clássica (soma do fantasy). Os pontos sobem somando das mini rodadas → rodadas → liga."],
  rodada:["Rodada","Uma fase que agrupa várias mini rodadas (ex: 'Fase de Grupos'). A classificação da rodada é a soma das mini rodadas dela."],
  capitao:["Capitão (×1.20)","Escolha 1 jogador (menos o banco) pra render 20% a mais. Vale a pena no jogador que você mais confia que vai pontuar."],
  tatica:["Tática","Cada tática tem um ESTILO (ex: marcação, posse, jogo aéreo). Ela fica COMPLETA (bônus) se, na partida, esse estilo for o ponto mais forte do seu time E vários dos seus jogadores produzirem nele. Se faltar um dos dois, fica incompleta (ônus, sempre menor que o bônus). Você escolhe olhando seu time: 'tenho zagueiros que desarmam muito → Muralha', 'meio-campo que toca → Tiki-Taka'. O efeito vem das ações reais deles em campo."],
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
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Orçamento:</b> 100 moedas. Cada jogador tem um preço (calculado por qualidade técnica: valor de mercado corrigido pela idade). O banco também conta no orçamento.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Os 6 slots:</b> 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Capitão (×1.20):</b> escolha 1 jogador (qualquer um menos o banco) pra pontuar 20% a mais.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Banco:</b> se um titular de linha pontuar pouco, o reserva pode entrar no lugar dele — mas o reserva rende só <b style="color:var(--chalk)">80%</b> da nota (pedágio por começar fora). Ele só entra se, já com o desconto, ainda superar o titular. <b style="color:var(--chalk)">Exceção do goleiro:</b> o GK do banco só entra se o GK titular não jogar NENHUM minuto. Se o titular jogar, o reserva fica com 0.</p>
    <p class="p" style="margin:10px 0"><b style="color:var(--chalk)">Tática:</b> escolha 1. Cada tática tem um ESTILO de jogo. Ela fica <b style="color:var(--chalk)">completa (bônus)</b> se, na partida, aquele estilo for a maior fatia das ações do seu time E um número mínimo dos seus jogadores produzir nele (ex: Tiki-Taka pede que passes/criação sejam o forte do time e 4+ jogadores criando). Se faltar um dos dois, fica <b style="color:var(--chalk)">incompleta (ônus)</b> — e o ônus é sempre menor que o bônus. Todas as táticas valem o mesmo em pontos (são balanceadas), e o bônus é dividido entre os jogadores conforme quem mais produziu no estilo. Conta todos que entraram, mesmo substituídos.</p>
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
      p(`${b("Orçamento:")} 100 moedas. Cada jogador tem um preço que reflete a qualidade dele. O banco também conta no orçamento.`)+
      p(`${b("Os 6 slots:")} 1 Goleiro, 1 Defensor, 1 Meia, 1 Atacante, 1 FLEX (pode ser def/mei/ata) e 1 Banco. Quem você escalar mas não entrar em campo no jogo real fica com 0 pontos.`)+
      p(`${b("Capitão (×1.20):")} escolha 1 jogador (menos o banco) pra render 20% a mais.`)+
      p(`${b("Banco:")} se um titular de linha for mal, o reserva entra no lugar — mas rende 80% da nota (pedágio). Só entra se, já com o desconto, superar o titular. O goleiro reserva só entra se o titular não jogar nenhum minuto.`)+
      p(`${b("Tática:")} escolha 1. Cada uma tem um estilo. Fica completa (bônus) se aquele estilo for a maior fatia das ações do seu time E um número mínimo dos seus jogadores produzir nele. Senão fica incompleta (ônus menor que o bônus).`))}

    ${sec("4. De onde vêm os preços",
      p(`O preço de cada jogador reflete ${b("quantos pontos ele tende a fazer na engine")} — calculado pelo histórico recente dele (gols, assistências, defesas, desarmes...) combinado com o valor de mercado, corrigido por idade e posição.`)+
      p(`Quem jogou pouco não despenca nem dispara: o mercado segura a estimativa até ele ter minutos suficientes. Cada partida é equilibrada sozinha pra que montar um time bom custe escolhas — não dá pra encher de craques.`)+
      p(`${b("Idade:")} o mercado costuma inflar jovem (por potencial) e baratear veterano (por idade). A fórmula corrige isso: ${b("jovens ficam um pouco mais baratos")} e ${b("veteranos consagrados ficam mais caros")} (um craque de 35 pode custar bem mais que um valor de mercado sugeriria). Vale lembrar: só sobe o veterano que ainda tinha valor real — não é "idoso = caro".`)+
      p(`${b("Por posição:")} o mesmo critério vale pra goleiro, defensor, meia e atacante, então um zagueiro caro tende a valer tanto quanto um atacante caro.`))}

    ${sec("5. Pontuação",
      p(`${b("Ações que somam:")} gol (+4,2), assistência (+3,3), finalização no gol (+1,7), defesa do goleiro (+1,6), pênalti defendido (+6), desarme/interceptação, drible, corte, bola recuperada. Gol difícil vale mais que fácil. Gol nos minutos finais de jogo apertado vale mais (clutch, até +8). Time mais fraco (underdog) ganha bônus, calculado por ELO, forma recente e mando de campo.`)+
      p(`${b("Clean sheet (não sofrer gol):")} goleiro ganha +2,0 por tempo sem levar gol; defensores +1,5 por tempo. Assim o goleiro favorito não pontua alto só por estar protegido — ele ainda precisa de defesas, PSxG ou clutch pra explodir.`)+
      p(`${b("Penalidades")} tiram pontos: amarelo (-2), vermelho (-7 no 1º tempo / -5 no 2º), erro que levou a gol (-5), erro que levou a finalização (-2), pênalti cometido (-4), gol contra (-6), faltas e ser driblado. O gol contra conta no placar e ainda desconta de quem o fez.`)+
      p(`${b("Construção de jogo")} também pontua (leve): faltas sofridas, lançamentos longos certos e conduções progressivas premiam quem distribui o jogo e puxa contra-ataque, não só quem finaliza.`)+
      p(`${b("Tetos por jogo:")} a nota de um jogador na partida vai de -9 (piso) a +28 (teto), pra ninguém disparar sozinho.`))}

    ${sec("6. Mini rodadas e os modos",
      p(`Uma ${b("mini rodada")} junta vários jogos. O modo dela define a estratégia. São 4:`)+
      p(`🏆 ${b("Completo:")} escale todos os jogos. Sua pontuação é a soma de todos. A escalação de cada jogo trava quando aquela partida é fechada.`)+
      p(`⚡ ${b("Impulso:")} escale todos e distribua as fichas de impulso nas partidas (cada ficha aplica um % nos pontos daquele jogo). O dev define os valores e as regras das fichas (pode ter fichas negativas obrigatórias). A distribuição trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não gastar TODAS as fichas antes da trava, é eliminado e zera a mini rodada.`)+
      p(`📊 ${b("Confiança:")} escale todos e ordene os jogos do que você mais confia (1º) ao que menos confia. O 1º multiplica os pontos pra cima, o último pra baixo. Quanto mais jogos, maior a diferença. A ordem trava quando a 1ª partida é fechada. ${b("Atenção:")} se você não ordenar TODOS os jogos antes da trava, é eliminado e zera a mini rodada.`)+
      p(`🔮 ${b("Previsão:")} escale todos e crave o placar de cada jogo. Além dos pontos da escalação, ganha bônus por acertar o resultado e um bônus maior por cravar o placar exato. Aqui o palpite trava POR JOGO, junto com a escalação daquela partida (cada jogo é independente).`))}

    ${sec("7. Como as travas funcionam",
      p(`Não há horário automático: ${b("tudo é manual")}. Quem trava é o dev, pelo botão "🔒 Fechar pool (trava as escalações)" na partida avulsa.`)+
      p(`${b("Escalação (todos os modos):")} a escalação de cada jogo pode ser editada até o dev fechar a pool daquela partida específica. Fechar uma não trava as outras.`)+
      p(`${b("Impulso e Confiança:")} a parte estratégica (fichas / ordem) trava quando QUALQUER jogo da rodada é fechado — porque é uma decisão sobre a rodada toda. O dev também pode fechar/reabrir essa distribuição manualmente no bloco ADMIN da rodada. Depois de travado, o jogador não reabre sozinho — só o dev.`)+
      p(`${b("Previsão:")} o palpite trava por jogo, junto com a escalação daquela partida (como no Completo).`))}

    ${sec("8. Espiar os adversários",
      p(`Na aba ${b("\"Quem está disputando\"")}, assim que a pool de uma partida é travada, aquele jogo vira clicável e você pode espiar o que cada um fez NELE:`)+
      p(`No Completo/Avulsa: a escalação. No Previsão: a escalação + o palpite. No Confiança: a escalação + a ordem de confiança completa do adversário. No Impulso: a escalação + onde ele gastou os impulsos. Só revela os jogos já travados.`))}

    ${sec("9. Classificação",
      p(`Quando os jogos terminam e são apurados, a ${b("Classificação da mini rodada")} soma os pontos de cada um (já com multiplicadores de confiança / bônus de previsão / impulsos aplicados) e mostra o ranking.`))}

    ${isAdmin()?sec("10. Para o admin (você)",
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
(async function boot(){
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
})();
