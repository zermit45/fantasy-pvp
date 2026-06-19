// ============================================================
// FANTASY PvP ENGINE v2.4.0 — motor de pontuação isolado
// Não depende de nenhum jogo específico: recebe (player, match, tactic)
// e devolve a pontuação detalhada. Mesmo motor pra todas as salas.
// ============================================================

// Pesos de pontuação. BASE = rebalanceado (gol/assist valem mais, passe/desarme menos).
// BASE_V1 = pesos antigos, usados SÓ pelos jogos já apurados (match.tacticRules==="v1"),
// pra não recalcular pontuações que já valeram.
const BASE = { goal:4, assist:3, sot:.7, dribble:.4, prgp:.06, pib:.35, tib:.05, sca:.5, gca:1.5,
  tklint:.6, block:.8, recovery:.14, aerial:.25, clearance:.1,
  save:.7, penSave:4.5, opa:.85, crossStop:.45, accCross:.2, inaccCross:-.08,
  yellow:-2, redH1:-10, redH2:-6, errGoal:-5, penCom:-4, dribbledPast:-1, foul:-.45, concededGk:-2 };
// pesos ANTIGOS (jogos já apurados / tacticRules v1) — diferem só nas ações rebalanceadas
const BASE_V1 = Object.assign({}, BASE, { goal:2, assist:1.5, sot:.6, dribble:.35, prgp:.12, tib:.06, sca:.45, gca:1.25,
  tklint:.9, block:.9, recovery:.22, aerial:.22 });
const CAPS = { MATCH:28, FLOOR:-9, CLUTCH:8, TACT:13 };
const TIER_EMO = {1:0,2:.4,3:.9,4:1.6};
const r1 = x => Math.round(x*10)/10;
const tierXG = v => v>0.5?{b:0,t:1} : v>=0.2?{b:1.2,t:2} : v>=0.08?{b:2.6,t:3} : {b:4.2,t:4};
const tierSV = v => v<0.1?{b:0,t:1} : v<=0.3?{b:1.2,t:2} : v<=0.6?{b:2.6,t:3} : {b:4.2,t:4};

// ---- TÁTICAS v3.0 — baseadas na SUA escalação ----
// A condição olha squadSum = soma das stats dos SEUS jogadores que TERMINARAM
// a partida em campo (titular não-substituído OU reserva que entrou e terminou).
// Se ativar: buff ×1.18 nas ações premiadas, nerf ×0.90 nas penalizadas.
// buffs/nerfs aplicam a CADA jogador do seu time individualmente.
// ─────────────────────────────────────────────────────────────
// TÁTICAS v3 — SKILL, não sorte.
// A condição olha a COMPOSIÇÃO do time que você montou (posições + preços
// dos titulares que terminaram em campo), não o que aconteceu na partida.
// Você controla 100% se a tática ativa, montando o time do jeito certo.
// Efeito liga/desliga: se a composição bate, todos ganham o buff (×1.18).
// SEM nerfs — errar a tática só significa não ganhar o bônus, sem punição.
// `comp` traz: nGK,nDEF,nMID,nATT (titulares por posição, FLEX conta na sua),
//   spend (soma de preço dos titulares), priceOf{pos:[precos]}, maxPrice, avgPrice.
// ─────────────────────────────────────────────────────────────
// TÁTICAS v4 — ativação pelas AÇÕES dos seus jogadores na partida.
// Cada tática tem uma FAMÍLIA de ações (a "cara" daquela tática).
// Dois testes:
//   1) ESTILO DOMINANTE: a família da tática é a maior fatia das ações
//      ofensivas/defensivas do seu time (proporção interna — não compara com
//      o adversário nem com a média do jogo).
//   2) PARTICIPAÇÃO: pelo menos `minPlayers` dos seus jogadores que entraram
//      contribuíram de verdade naquela família.
// Passou nos 2 → COMPLETA → +12% nas ações da família.
// Falhou em 1 → INCOMPLETA → −5% nas ações da família (ônus < bônus).
// `fam` = chaves de comp (pontuação) que recebem o efeito.
// `metric(p)` = quanto ESTE jogador produziu na família (pra dominância e participação).
// `partMin` = mínimo de produção individual pra contar como "participou".
// Alvos de PONTOS no time todo (normalização): toda tática vale o mesmo, independente
// da família. Completa soma ~+2.5 pts distribuídos entre os jogadores; incompleta tira
// ~−1.0 pt (ônus sempre menor que o bônus). A distribuição é proporcional ao quanto
// cada jogador produziu na família, então quem "fez a tática acontecer" leva mais.
const TACT_BONUS_PTS = 10;
const TACT_ONUS_PTS  = -4.0;
// soma de PONTOS típica de cada família num time (medida nos jogos reais) — usada
// como divisor pra igualar a escala entre táticas de famílias grandes e pequenas.
const TACT_PTSREF = { muralha:29.1, pressaototal:31.2, cerebro:22.6, tridente:12.6, aereo:6.7, contra:11.8 };
const TACTICS = {
  muralha:{name:"Estacionar o Ônibus",
    desc:"Defesa em bloco. Ativa se a marcação (desarmes, cortes, bloqueios) for o ponto forte do seu time e 3+ jogadores defenderem bem.",
    fam:["tklint","clearance","block"], minPlayers:3,
    metric:p=>p.tklint+p.clearance+p.block, partMin:2},
  pressaototal:{name:"Gegenpress",
    desc:"Pressão alta. Ativa se recuperar a bola (recuperações + desarmes) for o ponto forte do seu time e 3+ jogadores pressionarem.",
    fam:["recovery","tklint"], minPlayers:3,
    metric:p=>p.recovery+p.tklint, partMin:2},
  cerebro:{name:"Tiki-Taka",
    desc:"Posse e troca de passes. Ativa se a construção (passes progressivos + criação de chances) for o forte do seu time e 3+ jogadores criarem.",
    fam:["prgp","sca","gca","assist"], minPlayers:3,
    metric:p=>p.prgp+p.sca+p.gca*2, partMin:2},
  tridente:{name:"Ataque Total",
    desc:"Bombardeio ao gol. Ativa se finalizar (chutes no gol + gols) for o forte do seu time e 2+ jogadores finalizarem.",
    fam:["goal","sotPts"], minPlayers:2,
    metric:p=>p.sots.length+p.goals.length*2, partMin:1},
  aereo:{name:"Chuveiro na Área",
    desc:"Jogo aéreo e cruzamentos. Ativa se o jogo pelo alto (duelos aéreos + cruzamentos certos) for o forte do seu time e 2+ jogadores brigarem por cima.",
    fam:["aerial","accCross","goal"], minPlayers:2,
    metric:p=>p.aerial+p.accCross, partMin:2},
  contra:{name:"Contra-Ataque",
    desc:"Transição rápida. Ativa se conduzir e infiltrar (dribles + passes na área) for o forte do seu time e 3+ jogadores conduzirem.",
    fam:["dribbles","goal","pib"], minPlayers:3,
    metric:p=>p.dribbles+p.pib, partMin:2},
};
// famílias de referência pra calcular a DOMINÂNCIA (proporção interna do time).
// IMPORTANTE: cada ação tem volume natural muito diferente (passes >> dribles >>
// cruzamentos). Por isso normalizamos cada família por um divisor de referência,
// para que "dominante" signifique "o time se destacou NAQUILO relativo ao normal
// daquela ação", e não simplesmente a ação de maior volume bruto (passe sempre venceria).
const TACT_NORM={ muralha:65, pressaototal:87, cerebro:226, tridente:9, aereo:17, contra:39 };
// MINI REBOOT do balanceamento de táticas (z-score):
// cada família tem distribuição muito diferente (passe >> finalização). Em vez de
// comparar famílias entre si (o que sempre favorecia as de ação comum), medimos quão
// ACIMA DA MÉDIA daquela família o time está, em desvios-padrão (z-score). Assim toda
// tática ativa com frequência parecida — "dominante" = o time se destacou NAQUILO.
// Média e desvio medidos em milhares de times reais de 5 jogadores nos jogos apurados.
const TACT_MEAN={ muralha:16.1, pressaototal:20, cerebro:57.1, tridente:2.3, aereo:4.8, contra:9.4 };
const TACT_SD={ muralha:7.7, pressaototal:7.7, cerebro:29.4, tridente:2.7, aereo:2.6, contra:5.6 };
const TACT_ZTHRESH=0.5; // z-score mínimo pra a família contar como "estilo do time"
// REGRA ANTIGA (v1): usada SÓ pelos jogos já apurados antes do reboot (match.tacticRules==="v1"),
// pra não recalcular pontuações que já valeram. Jogos novos usam o z-score acima.
// v1 = top-3 famílias dominantes + NORM antigo + participação antiga (tridente/aereo pediam 3 jogadores).
const TACT_NORM_V1={ muralha:45, pressaototal:70, cerebro:113, tridente:11, aereo:26, contra:28 };
const TACT_PART_V1={ tridente:{minPlayers:3,partMin:2}, aereo:{minPlayers:3,partMin:2} }; // antes do afrouxamento
const TACT_FAMILIES={
  muralha:p=>p.tklint+p.clearance+p.block,
  pressaototal:p=>p.recovery+p.tklint,
  cerebro:p=>p.prgp+p.sca+p.gca*2,
  tridente:p=>(p.sots?p.sots.length:0)+(p.goals?p.goals.length:0)*2,
  aereo:p=>p.aerial+p.accCross,
  contra:p=>p.dribbles+p.pib,
};

// normaliza um player do match.json pra um objeto completo de stats
function normP(raw){
  return Object.assign({
    min:0, started:false, goals:[], assists:[], sots:[], dribbles:0, prgp:0, pib:0, tib:0,
    sca:0, gca:0, tklint:0, block:0, recovery:0, aerial:0, clearance:0, fouls:0, dribbledPast:0,
    yellow:0, red:null, errGoal:0, penCom:0, accCross:0, inaccCross:0, gk:null,
    // dados de finalização (capturados do shotmap): bola parada e chute de fora
    setPieceSot:0, setPieceGoals:0, longSot:0, longGoals:0
  }, raw||{});
}

function makeEngine(match){
  const B = match.tacticRules==="v1" ? BASE_V1 : BASE; // pesos antigos p/ jogos já apurados
  const GOALS_TL = match.goals_tl||[];
  const endMin = match.endMin||96;
  function scoreAt(min){let h=0,a=0;for(const g of GOALS_TL){if(g.m<min){g.t===match.homeCode?h++:a++;}}return [h,a];}
  function diffAt(min){const[h,a]=scoreAt(min);return Math.abs(h-a);}
  function extendsLead(team,min){const[h,a]=scoreAt(min);const lead=team===match.homeCode?h-a:a-h;return lead>=1;}
  function cleanSheetHalves(team){const g=GOALS_TL.filter(x=>x.t!==team);return{h1:!g.some(x=>x.m>=1&&x.m<=45),h2:!g.some(x=>x.m>=46&&x.m<=endMin)};}
  function liveShare(){let live=0;for(let m=0;m<endMin;m++){if(diffAt(m+0.5)<=1)live++;}return live/endMin;}
  const LIVE=liveShare();
  const ctxDecisive=d=>d<=1?1.06:0.92;
  const ctxDefEvt=d=>d<=1?1.08:0.94;
  const ctxDefAgg=LIVE*1.08+(1-LIVE)*0.94;
  const ctxSmallAgg=LIVE*1.00+(1-LIVE)*0.90;
  // ── BASELINE RELATIVO AO JOGO (táticas equilibradas) ──
  // Cada tática ativa quando o time do usuário está entre os ~TOP38% daquele jogo
  // na métrica da tática. Assim TODAS têm a mesma chance de ativar em QUALQUER jogo
  // (um threshold fixo favoreceria jogos de muita posse, muito chute, etc).
  const TACT_PCTL = 0.62; // alvo: ~38% dos times montados ativam (equilíbrio entre as táticas)
  function _metricsOf(p){return {
    tklintClr: p.tklint+p.clearance,
    sotGoals : p.sots.length + p.goals.length*2,
    prgp     : p.prgp,
    recovery : p.recovery,
    aerial   : p.aerial,
    sot      : p.sots.length,
    dribPib  : p.dribbles + p.pib*0.5,                 // contra-ataque: dribles + passes na área
    setPiece : (p.setPieceSot||0) + (p.setPieceGoals||0)*2 + p.aerial*0.5, // bola parada
    longShot : (p.longSot||0) + (p.longGoals||0)*2,    // meia-lua: chutes de fora
  };}
  function computeMatchBase(){
    const all=[]; const src=match.players||{};
    for(const id of Object.keys(src)){
      const p=normP(src[id]);
      if(p.min===0||p.subbedOff) continue; // só quem terminou em campo
      all.push(_metricsOf(p));
    }
    const keys=["tklintClr","sotGoals","prgp","recovery","aerial","sot","dribPib","setPiece","longShot"];
    const fallback={tklintClr:14,sotGoals:6,prgp:50,recovery:18,aerial:6,sot:4,dribPib:5,setPiece:4,longShot:2};
    if(all.length<6) return fallback;
    const N=4000, SIZE=5, sums={}; keys.forEach(k=>sums[k]=[]);
    for(let i=0;i<N;i++){
      const acc={}; keys.forEach(k=>acc[k]=0);
      for(let j=0;j<SIZE;j++){ const r=all[(Math.random()*all.length)|0]; keys.forEach(k=>acc[k]+=r[k]); }
      keys.forEach(k=>sums[k].push(acc[k]));
    }
    const base={};
    for(const k of keys){ const arr=sums[k].sort((a,b)=>a-b); base[k]=arr[Math.floor(TACT_PCTL*(arr.length-1))]; }
    // piso mínimo: evita que jogos de poucos eventos zerem o limiar (tática ativaria sempre)
    const PISO={tklintClr:8,sotGoals:3,prgp:30,recovery:12,aerial:4,sot:3,dribPib:4,setPiece:3,longShot:2};
    for(const k of keys){ if(base[k]<PISO[k]) base[k]=PISO[k]; }
    return base;
  }
  const MATCH_BASE = computeMatchBase();
  // ── DvG COMPLETO (4 fatores) ──
  // Força ajustada de um time = ELO×0.55 + Forma×0.30 + Mando×0.15  (+Tabela só p/ clubes)
  // O bônus underdog vem da diferença de FORÇA AJUSTADA, não só do ELO cru.
  // Boa forma sobe a força → reduz o bônus de underdog (o time não está tão por baixo).
  // Forma de cada time vem opcional em match.form[team] (array dos últimos 5):
  //   [{res:"W"|"D"|"L", oppElo:NNNN}, ...]  — calculado na captura.
  function formaIndex(team){
    const f=match.form&&match.form[team];
    if(!f||!f.length) return null; // sem dados de forma
    let soma=0;
    for(const g of f){
      const base=g.res==="W"?1.0:g.res==="D"?0.5:0.0;
      const pesoOpp=Math.max(0.7,Math.min(1.3,(g.oppElo||1700)/1800));
      soma+=base*pesoOpp;
    }
    // média 0..~1.3 → converte p/ "equivalente ELO" relativo (centrado em 0)
    const media=soma/f.length;          // 0 (péssima) .. ~1.3 (ótima)
    return (media-0.5)*600;             // -300 (frio) .. +480 (em chamas)
  }
  function posTabelaAdj(team){
    // só clubes: match.standing[team] = {pos:N, total:M} (posição na liga)
    const s=match.standing&&match.standing[team];
    if(!s||!s.total) return null;
    // 1º lugar = +200, último = -200 (linear)
    const frac=1-(s.pos-1)/Math.max(1,s.total-1); // 1.0 (líder)..0 (lanterna)
    return (frac-0.5)*400;
  }
  function forcaAjustada(team){
    const elo=team===match.homeCode?match.homeElo:match.awayElo;
    const mando=match.neutral?0:(team===match.homeCode?+40:-40); // casa vale ~+40 ELO
    const forma=formaIndex(team);
    const tabela=posTabelaAdj(team);
    // pesos: ELO .55 / forma .30 / mando .15  (clubes c/ tabela: .50/.25/.10/.15)
    if(tabela!==null){
      const fAdj=(forma!==null?forma:0);
      return elo*0.50 + fAdj*0.25 + mando*0.10 + tabela*0.15 + elo*(forma!==null?0:0.25);
    }
    if(forma!==null) return elo*0.55 + forma*0.30 + mando*0.15;
    return elo + mando; // sem forma: cai no modo simples (só ELO+mando)
  }
  function dvgMult(team){
    const opp=team===match.homeCode?match.awayCode:match.homeCode;
    const edge=forcaAjustada(opp)-forcaAjustada(team); // quão + forte é o oponente
    return 1+Math.min(0.14,Math.max(0,edge/1450));
  }
  function minFactor(p){if(p.started||p.min>=45)return 1.0;return p.min/90;}
  function redPenalty(red){if(!red)return 0;const h1=red.m<=50;if(red.doubleYellow)return h1?-3.0:-2.0;return h1?B.redH1:B.redH2;}

  function indices(p){
    if(p.min===0)return null;
    const per90=v=>v/p.min*90;const pct=(v,c)=>Math.max(0,Math.min(100,v/c*100));
    let iui,tw;
    if(p.gk){const g=p.gk;iui=pct(per90(g.opa+g.crossStop*0.7),2.5);tw=pct(per90(g.opa*1.2+g.crossStop+g.saves.length*0.3),5);}
    else{iui=pct(per90(p.sots.length+p.goals.length+p.sca*1.2+p.gca*2+p.prgp*.5+p.pib*.7+p.tib*.25+p.dribbles*.6),{DEF:5,MID:8,ATT:9}[p.pos]||8);
         tw=pct(per90(p.tklint+p.block+p.recovery*.5+p.aerial*.5+p.clearance*.3+p.prgp*.35+p.sca*.35),{DEF:10,MID:9,ATT:5}[p.pos]||9);}
    const ev=[...p.goals.map(g=>tierXG(g.xg).b),...p.assists.map(a=>tierXG(a.xag).b),...(p.gk?p.gk.saves.map(s=>tierSV(s.psxg).b):[])];
    let eff=ev.length?ev.reduce((a,b)=>a+b,0)/ev.length/4.2*100:50;
    if(p.gk)eff=Math.max(0,eff-p.gk.conceded*8);
    const fW=p.pos==="DEF"?3:4,dW=p.pos==="DEF"?4:6;
    const sec=Math.max(0,100-(p.errGoal*45+p.penCom*35+(p.red?40:0)+p.yellow*12+p.fouls*fW+p.dribbledPast*dW));
    return{iui,eff,sec,tw};
  }
  const lab3=(v,lo,mid,hi)=>v>=65?hi:v>=35?mid:lo;

  // ============================================================
  // CAMADA COLECIONÁVEL (cosmética — não altera pontuação)
  //   arch   = 1 papel principal do jogador na partida
  //   traits = até 3 selos de momentos especiais
  //   rarity = raridade da "carta", de Comum a Lendário
  // ============================================================
  function archetype(p,ix,clutch,total){
    if(!ix)return{arch:"—",traits:["Não entrou em campo"],rarity:"Comum"};
    const G=p.goals.length, A=p.assists.length;
    const golaco = p.goals.some(g=>tierXG(g.xg).t===4);           // xg<0.08
    const golDificil = p.goals.some(g=>tierXG(g.xg).t>=3);
    const defLimpa = p.gk && p.gk.conceded===0 && p.min>=60;
    // CARRASCO: marcou um gol que tirou o time do empate/derrota e o colocou na frente
    // (desempate pra liderança ou virada). Avalia o placar logo após cada gol do jogador.
    const isCarrasco = p.goals.some(g=>{
      const before=scoreAt(g.m);            // placar imediatamente antes do gol
      const my=p.team===match.homeCode?0:1, op=my===0?1:0;
      // antes do gol o time estava empatado ou perdendo, e o gol coloca na frente
      return before[my]<=before[op] && (before[my]+1)>before[op];
    });
    let arch="Conector"; const traits=[];

    // ---------- ARQUÉTIPO (prioridade do mais raro/marcante ao mais comum) ----------
    if(p.gk){
      const bigSave = p.gk.saves.some(s=>tierSV(s.psxg).t===4);
      const manySaves = p.gk.saves.length>=5;
      if(p.gk.penSave>0) arch="GK Pegador de Pênalti";
      else if((manySaves||bigSave)&&p.gk.conceded===0) arch="GK Paredão";
      else if(manySaves||bigSave) arch="GK Muralha";
      else if((p.gk.opa+p.gk.crossStop)>=3&&ix.sec>=60) arch="GK Líbero";
      else arch="GK Seguro";
    }
    else if(G>=3) arch="Matador";                                          // hat-trick
    else if(G>=2) arch="Artilheiro";                                       // 2 gols
    else if(!p.gk&&total>=28) arch="GOAT";                                 // pontuação máxima do balanceamento
    else if(G>=1&&isCarrasco&&G===1&&total>=10) arch="Carrasco";           // gol decisivo (virada/desempate) numa boa atuação
    else if(G>=1&&!p.started) arch="Super Sub";                            // entrou do banco e marcou
    else if(G>=1&&p.setPieceGoals>=1) arch="Especialista de Bola Parada";  // gol de falta/escanteio
    else if(G>=1&&p.longGoals>=1) arch="Canhão";                           // gol de fora da área
    else if(clutch>=2) arch="Herói de Clutch";
    else if(G>=1&&golaco) arch="Finalizador Frio";
    else if(G>=1&&A>=1) arch="Decisivo";                                   // gol + assist
    else if(A>=3) arch="Rei das Assistências";                             // 3+ assists
    else if(A>=2) arch="Garçom";
    // ---- criação (específicos primeiro, limiares altos) ----
    else if((p.sca+p.gca*2)>=9&&p.pib>=5) arch="Cérebro do Time";          // criação excepcional
    else if((p.sca+p.gca*2)>=7&&p.pib>=3) arch="Maestro Criador";
    // ---- ataque ----
    else if(p.pos==="ATT"&&p.dribbles>=6) arch="Driblador";                // drible em série
    else if(p.pos==="ATT"&&p.sots.length>=4) arch="Lobo Solitário";        // muito chute
    else if(p.pos==="ATT"&&p.aerial>=5) arch="Pivô de Área";
    else if(p.pos==="ATT"&&(p.sca+p.gca*2)>=5) arch="Camisa 10";           // atacante criador
    else if(p.pos==="ATT") arch="Homem de Frente";                         // atacante padrão (fallback)
    // ---- defesa (específicos primeiro) ----
    else if(p.pos==="DEF"&&(p.tklint+p.clearance+p.block)>=16) arch="Xerife";  // defensor dominante
    else if(p.pos==="DEF"&&(p.aerial+p.block+p.clearance)>=12) arch="Muralha Aérea";
    else if(p.pos==="DEF"&&p.dribbles>=4&&ix.iui>=72) arch="Ala Moderno";   // lateral ofensivo
    else if(p.pos==="DEF"&&p.prgp>=9&&p.pib>=2&&ix.sec>=72) arch="Zagueiro Construtor"; // muita saída de bola
    else if(p.pos==="DEF"&&ix.iui>=78&&p.prgp>=4) arch="Lateral de Corredor";
    // ---- meio-campo (Box-to-Box agora exige contribuição REAL nas duas fases) ----
    else if(p.pos==="MID"&&(p.tklint+p.recovery)>=7&&(p.sca+p.gca*2+p.dribbles+p.prgp*0.3)>=6&&ix.tw>=78) arch="Box-to-Box"; // defende E cria
    else if(p.pos==="MID"&&(p.sca+p.gca*2)>=5) arch="Camisa 10";
    else if(p.pos==="MID"&&p.dribbles>=5) arch="Condutor";                  // conduz a bola
    else if((p.tklint+p.recovery)>=10&&ix.tw>=70) arch="Volante";
    else if(ix.tw>=72&&p.recovery>=8) arch="Motor";
    else if((p.tklint+p.recovery+p.clearance)>=12&&ix.sec>=74&&p.pos!=="ATT") arch="Cão de Guarda";  // muito trabalho defensivo
    else if(p.accCross>=4) arch="Maestro de Cruzamentos";                  // muitos cruzamentos certos
    else if(ix.iui>=72&&ix.sec<42) arch="Ponta Caótico";
    else if(p.pos==="MID"&&p.prgp>=8&&ix.iui>=55) arch="Articulador";       // distribui jogo (acessível)
    else if(p.pos==="MID"&&(p.tklint+p.recovery)>=6) arch="Engrenagem";     // meio-campo trabalhador comum
    else if((p.red||p.penCom>=1||p.errGoal>=1)&&G===0) arch="Vilão";        // fez besteira (e não compensou com gol)

    // ---------- TRAITS (selos de momento — até 3) ----------
    if(G>=3) traits.push("Hat-trick");
    else if(G>=2) traits.push("Dobradinha");
    if(A>=2) traits.push("Garçom");
    if(golaco) traits.push("Carrasco");                 // golaço improvável
    if(clutch>0) traits.push("Mente Fria");
    if(p.gk&&p.gk.penSave>0) traits.push("Pega-Pênalti");
    if(defLimpa) traits.push("Cadeado");                // goleiro/zaga sem sofrer gol
    if(!p.gk&&p.sots.length>=3) traits.push("Pé Quente");
    if((p.sca+p.gca*2)>=5) traits.push("Maestro");
    if(!p.gk&&p.dribbles>=5) traits.push("Pernas de Pau Quebradas");  // drible em série
    if(G>=1&&A>=1) traits.push("Mão na Massa");                        // participou de 2 gols
    if(p.pos==="DEF"&&G>=1) traits.push("Zagueiro Artilheiro");
    if(p.recovery>=10) traits.push("Aspirador");                       // recupera muita bola
    if(p.aerial>=6) traits.push("Dono do Ar");
    if(p.gk&&p.gk.saves.some(s=>s.psxg>0.6)) traits.push("Paredão");
    if(ix.tw>=88&&p.pos!=="ATT") traits.push("Monstro Defensivo");
    if(!p.red&&!p.yellow&&p.fouls===0&&p.dribbledPast===0&&ix.sec>=92) traits.push("Seguro");
    if(p.red||(p.yellow>=1&&p.fouls>=3)) traits.push("Indisciplinado");
    if(total<1&&p.min>=45) traits.push("Fantasma");
    if(!traits.length) traits.push("Regular");

    // ---------- RARIDADE (mais difícil chegar ao topo) ----------
    let r=0;
    if(p.goals.some(g=>tierXG(g.xg).t===4&&g.m>=85)) r+=5;   // golaço decisivo no fim
    if(golaco) r+=3;                                          // golaço improvável
    if(golDificil) r+=1;
    if(G>=3) r+=4; else if(G>=2) r+=2; else if(G>=1) r+=1;   // gols
    if(A>=2) r+=2; else if(A>=1) r+=1;
    if(p.gk&&p.gk.penSave>0) r+=3;
    if(p.gk&&p.gk.saves.some(s=>tierSV(s.psxg).t===4)) r+=2;
    if(defLimpa) r+=1;
    if(clutch>=2) r+=2; else if(clutch>0) r+=1;
    if(total>=20) r+=3; else if(total>=15) r+=2; else if(total>=10) r+=1;
    if(traits.includes("Monstro Defensivo")) r+=1;
    if(p.red) r=Math.max(0,r-2);
    if(traits.includes("Fantasma")) r=Math.max(0,r-1);
    const rarity = r>=13?"Lendário":r>=10?"Mítico":r>=7?"Épico":r>=4?"Raro":r>=2?"Incomum":"Comum";

    return{arch,traits:traits.slice(0,3),rarity};
  }

  const STAT_DEFS=[
    ["Gols",B.goal,p=>p.goals.length],["Assistências",B.assist,p=>p.assists.length],
    ["Finalizações no gol",B.sot,p=>p.sots.length],["Dribles certos",B.dribble,p=>p.dribbles],
    ["Passes progressivos",B.prgp,p=>p.prgp],["Passes na área",B.pib,p=>p.pib],
    ["Toques na área",B.tib,p=>p.tib],["Cruzamentos certos",B.accCross,p=>p.accCross],
    ["Cruzamentos errados",B.inaccCross,p=>p.inaccCross],["Desarmes + interceptações",B.tklint,p=>p.tklint],
    ["Bloqueios",B.block,p=>p.block],["Recuperações de bola",B.recovery,p=>p.recovery],
    ["Duelos aéreos vencidos",B.aerial,p=>p.aerial],["Cortes",B.clearance,p=>p.clearance],
    ["Defesas",B.save,p=>p.gk?p.gk.saves.length:0],["Defesa de pênalti",B.penSave,p=>p.gk?p.gk.penSave:0],
    ["Saídas (sweeper)",B.opa,p=>p.gk?p.gk.opa:0],["Cruzamentos cortados",B.crossStop,p=>p.gk?p.gk.crossStop:0],
    ["Gols sofridos",B.concededGk,p=>p.gk?p.gk.conceded:0],["Cartão amarelo",B.yellow,p=>p.yellow],
    ["Faltas",B.foul,p=>p.fouls],["Vezes driblado",B.dribbledPast,p=>p.dribbledPast],
    ["Erro → gol",B.errGoal,p=>p.errGoal],["Pênalti cometido",B.penCom,p=>p.penCom],
  ];
  function statLines(p){const o=[];for(const[l,v,c]of STAT_DEFS){const n=c(p);if(n)o.push([l,n,v,r1(n*v)]);}return o;}

  function scorePlayer(p, tacticKey, squadSum){
    p=normP(p);
    if(p.min===0)return{total:0,minutes:0,statLines:[],lines:[],evNote:[],labels:[],meta:archetype(p,null,0,0)};
    const ts=match.team_stats?match.team_stats[p.team]:null;
    const lines=[];const push=(k,v,n)=>{if(Math.abs(v)>=0.05)lines.push([k+(n?` ${n}`:""),v]);};
    const mf=minFactor(p);
    const comp={
      goal:p.goals.length*B.goal,assist:p.assists.length*B.assist,sotPts:p.sots.length*B.sot,
      dribbles:r1(p.dribbles*mf)*B.dribble,prgp:r1(p.prgp*mf)*B.prgp,pib:r1(p.pib*mf)*B.pib,tib:r1(p.tib*mf)*B.tib,
      sca:r1(p.sca*mf)*B.sca,gca:p.gca*B.gca,tklint:r1(p.tklint*mf)*B.tklint,block:r1(p.block*mf)*B.block,
      recovery:r1(p.recovery*mf)*B.recovery,aerial:r1(p.aerial*mf)*B.aerial,clearance:r1(p.clearance*mf)*B.clearance,
      accCross:r1(p.accCross*mf)*B.accCross,inaccCross:r1(p.inaccCross*mf)*B.inaccCross,
    };
    let cs=0;const csEl=p.gk||(p.pos==="DEF"&&p.min>=60);
    if(csEl){const c=cleanSheetHalves(p.team);if(c.h1)cs+=1.5;if(c.h2)cs+=1.5;}
    let gkB=0,conc=0;
    if(p.gk){gkB=p.gk.saves.length*B.save+p.gk.opa*B.opa+p.gk.crossStop*B.crossStop+p.gk.penSave*B.penSave;conc=p.gk.conceded*B.concededGk;}
    const negRed=redPenalty(p.red);
    const neg=p.yellow*B.yellow+negRed+p.errGoal*B.errGoal+p.penCom*B.penCom+r1(p.dribbledPast*mf)*B.dribbledPast+r1(p.fouls*mf)*B.foul;
    const baseTot=Object.values(comp).reduce((a,b)=>a+b,0)+gkB+conc+neg+cs;
    if(mf<1)push(`Stats escalonados (${p.min}', fator ${mf.toFixed(2)})`,0);
    if(cs>0)push(`Clean sheet ${cs===3?"completo":"(1 metade)"}`,cs);
    if(p.red)push(`Vermelho${p.red.doubleYellow?" 2º amarelo":""} ${p.red.m<=50?"(1ºT)":"(2ºT)"}`,negRed);
    const sl=statLines(p);
    let dif=0,ctx=0,clutch=0;const ev=[];
    for(const g of p.goals){const t=tierXG(g.xg),d=diffAt(g.m);dif+=t.b;ctx+=(B.goal+t.b)*(ctxDecisive(d)-1);if(g.m>=85&&d<=1){const x=extendsLead(p.team,g.m);clutch+=x?0:t.b*0.25+1.0+TIER_EMO[t.t];ev.push(`⚽ Gol ${g.m}' xG ${g.xg.toFixed(2)} (T${t.t}${x?", ampliou":", clutch!"})`);}else ev.push(`⚽ Gol ${g.m}' xG ${g.xg.toFixed(2)} (T${t.t})`);}
    for(const a of p.assists){const t=tierXG(a.xag),d=diffAt(a.m);dif+=t.b;ctx+=(B.assist+t.b)*(ctxDecisive(d)-1);if(a.m>=85&&d<=1&&!extendsLead(p.team,a.m))clutch+=t.b*0.25+1.0+TIER_EMO[t.t];ev.push(`🅰️ Assist ${a.m}' xAG ${a.xag.toFixed(2)} (T${t.t})`);}
    for(const s of p.sots){const d=diffAt(s.m);ctx+=B.sot*(ctxDecisive(d)-1);if(s.m>=85&&d<=1)clutch+=0.6;}
    if(p.gk)for(const s of p.gk.saves){const t=tierSV(s.psxg),d=diffAt(s.m);dif+=t.b;ctx+=(B.save+t.b)*(ctxDefEvt(d)-1);if(s.m>=85&&d<=1){clutch+=t.b*0.25+0.6+TIER_EMO[t.t];ev.push(`🧤 Defesa ${s.m}' PSxG ${s.psxg.toFixed(2)} (T${t.t}) clutch`);}else if(t.t>=3)ev.push(`🧤 Defesa ${s.m}' PSxG ${s.psxg.toFixed(2)} (T${t.t})`);}
    const defAgg=comp.tklint+comp.block+comp.recovery+comp.aerial+comp.clearance;
    const smallAgg=comp.prgp+comp.pib+comp.tib+comp.sca+comp.dribbles+comp.accCross;
    ctx+=defAgg*(ctxDefAgg-1)+smallAgg*(ctxSmallAgg-1);
    clutch=Math.min(clutch,CAPS.CLUTCH);
    push("Dificuldade (xG·xAG·PSxG)",r1(dif));
    push(LIVE>=0.99?"Placar — jogo vivo o tempo todo":"Contexto de placar",r1(ctx));
    if(clutch>0)push(`Clutch 85'+ (cap +${CAPS.CLUTCH})`,r1(clutch));
    const posSub=Math.max(0,baseTot-conc-neg)+dif+Math.max(0,ctx)+clutch;
    const dm=dvgMult(p.team);const dvg=posSub*(dm-1);
    if(dvg>0.05)push(`DvG underdog ×${dm.toFixed(3)}`,r1(dvg));
    let tact=0;const T=TACTICS[tacticKey];
    // squadSum.status[tacticKey] diz se a tática ficou completa ('full') ou não ('fail').
    // O efeito é NORMALIZADO: cada tática rende o mesmo em pontos no time todo,
    // independente de quantas/quais ações a família tem. TACT_PTSREF = soma de pontos
    // TÍPICA daquela família num time (medida nos jogos reais). O bônus-alvo é dividido
    // entre os jogadores conforme a fatia de cada um na família.
    if(T&&squadSum&&squadSum.status){
      const st=squadSum.status[tacticKey];
      const alvo=st==="full"?TACT_BONUS_PTS:TACT_ONUS_PTS; // +10 completa / -4 incompleta (no time todo) — tática é o fator decisivo
      let famPts=0; for(const k of T.fam){famPts+=(comp[k]??0);}
      const ref=TACT_PTSREF[tacticKey]||10;
      tact=alvo*(famPts/ref); // a fatia deste jogador no bônus do time
      tact=Math.max(-CAPS.TACT,Math.min(CAPS.TACT,tact));
      if(Math.abs(tact)>=0.05)push(`Tática ${T.name} ${st==="full"?"completa":"incompleta"}`,r1(tact));
    }
    const ix=indices(p);const avg=ix.iui*.3+ix.eff*.3+ix.sec*.2+ix.tw*.2;const perf=r1(Math.max(-3,Math.min(4,-3+avg/100*7)));
    push("Performance (índices C+)",perf);
    let total=baseTot+dif+ctx+clutch+dvg+tact+perf;
    const cap=Math.max(CAPS.FLOOR,Math.min(CAPS.MATCH,total));
    if(cap!==total)push(`Cap (${CAPS.FLOOR}/+${CAPS.MATCH})`,r1(cap-total));
    total=r1(cap);
    const meta=archetype(p,ix,clutch,total);
    const labels=[`Envolvimento: ${lab3(ix.iui,"discreto","participativo","onipresente")}`,`Eficiência: ${lab3(ix.eff,"abaixo","dentro","acima do esperado")}`,`Segurança: ${lab3(ix.sec,"instável","controlada","impecável")}`,`Duas fases: ${lab3(ix.tw,"unidimensional","equilibrado","completo")}`];
    return{total,minutes:p.min,statLines:sl,lines:lines.map(([k,v])=>[k,r1(v)]),evNote:ev,labels,meta};
  }

  // Avalia a TÁTICA pelas ações dos jogadores que ENTRARAM (min>0), incluindo
  // os que foram substituídos. Retorna, para cada tática, o status:
  //   'full'  → estilo dominante E participação atingida  → bônus
  //   'fail'  → faltou um dos dois                          → ônus
  // (a tática escolhida pelo usuário é lida deste mapa no scorePlayer)
  function squadSum(players){
    const ps=[];
    for(const raw of players){const p=normP(raw);if(p.min>0)ps.push(p);}
    const useV1 = match.tacticRules==="v1"; // jogos já apurados antes do reboot
    // soma bruta de cada família no time
    const famRaw={},famNorm={},famZ={};
    for(const k of Object.keys(TACT_FAMILIES)){famRaw[k]=0;}
    for(const p of ps){for(const k of Object.keys(TACT_FAMILIES))famRaw[k]+=TACT_FAMILIES[k](p);}
    const NORMSET = useV1?TACT_NORM_V1:TACT_NORM;
    for(const k of Object.keys(TACT_FAMILIES)){
      famNorm[k]=famRaw[k]/(NORMSET[k]||1);
      famZ[k]=(famRaw[k]-(TACT_MEAN[k]||0))/(TACT_SD[k]||1);
    }
    // v1: dominante = estar entre as 3 famílias mais fortes (normalizadas)
    let topSet=null;
    if(useV1){
      const ranked=Object.entries(famNorm).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
      topSet=new Set(ranked.slice(0,3));
    }
    const status={};
    for(const[key,T]of Object.entries(TACTICS)){
      let dominant, minP=T.minPlayers, partMin=T.partMin;
      if(useV1){
        // regra antiga: top-3 + participação antiga (tridente/aereo pediam mais gente)
        dominant = (famNorm[key]>0) && topSet.has(key);
        const pv=TACT_PART_V1[key]; if(pv){minP=pv.minPlayers;partMin=pv.partMin;}
      }else{
        // regra nova: z-score acima do limiar (régua justa entre todas)
        dominant = (famZ[key]||0)>=TACT_ZTHRESH;
      }
      let part=0; for(const p of ps){ if(T.metric(p)>=partMin) part++; }
      const enough = part>=minP;
      status[key] = (dominant&&enough) ? "full" : "fail";
    }
    return {status, famSum:famRaw, famNorm, famZ, n:ps.length};
  }

  return { scorePlayer, squadSum, TACTICS, matchBase:MATCH_BASE };
}

if (typeof module!=="undefined" && module.exports) module.exports={makeEngine,TACTICS};
if (typeof window!=="undefined"){ window.makeEngine=makeEngine; window.ENGINE_TACTICS=TACTICS; }
