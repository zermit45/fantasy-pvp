// ============================================================
// FANTASY PvP ENGINE v2.4.0 — motor de pontuação isolado
// Não depende de nenhum jogo específico: recebe (player, match, tactic)
// e devolve a pontuação detalhada. Mesmo motor pra todas as salas.
// ============================================================

const BASE = { goal:2, assist:1.5, sot:.6, dribble:.35, prgp:.12, pib:.35, tib:.06, sca:.45, gca:1.25,
  tklint:.9, block:.9, recovery:.22, aerial:.22, clearance:.1,
  save:.7, penSave:4.5, opa:.85, crossStop:.45, accCross:.2, inaccCross:-.08,
  yellow:-2, redH1:-10, redH2:-6, errGoal:-5, penCom:-4, dribbledPast:-1, foul:-.45, concededGk:-2 };
const CAPS = { MATCH:28, FLOOR:-9, CLUTCH:6, TACT:4 };
const TIER_EMO = {1:0,2:.4,3:.9,4:1.6};
const r1 = x => Math.round(x*10)/10;
const tierXG = v => v>0.5?{b:0,t:1} : v>=0.2?{b:1.2,t:2} : v>=0.08?{b:2.6,t:3} : {b:4.2,t:4};
const tierSV = v => v<0.1?{b:0,t:1} : v<=0.3?{b:1.2,t:2} : v<=0.6?{b:2.6,t:3} : {b:4.2,t:4};

// ---- TÁTICAS v3.0 — baseadas na SUA escalação ----
// A condição olha squadSum = soma das stats dos SEUS jogadores que TERMINARAM
// a partida em campo (titular não-substituído OU reserva que entrou e terminou).
// Se ativar: buff ×1.18 nas ações premiadas, nerf ×0.90 nas penalizadas.
// buffs/nerfs aplicam a CADA jogador do seu time individualmente.
const TACTICS = {
  muralha:{name:"Estacionar o Ônibus",desc:"Seu time fica entre os melhores do jogo em desarmes + interceptações + cortes",
    cond:(sq,base)=>(sq.tklint+sq.clearance)>=(base?base.tklintClr:20), buffs:{tklint:1.18,clearance:1.18,block:1.18}, nerfs:{prgp:0.90,dribbles:0.90}},
  pressaototal:{name:"Gegenpress",desc:"Seu time fica entre os melhores do jogo em recuperações de bola",
    cond:(sq,base)=>sq.recovery>=(base?base.recovery:20), buffs:{recovery:1.18,tklint:1.18}, nerfs:{fouls:1.15,aerial:0.90}},
  cerebro:{name:"Tiki-Taka",desc:"Seu time fica entre os melhores do jogo em passes progressivos",
    cond:(sq,base)=>sq.prgp>=(base?base.prgp:60), buffs:{assist:1.18,sca:1.18,gca:1.18}, nerfs:{aerial:0.90,clearance:0.90}},
  tridente:{name:"Ataque Total",desc:"Seu time fica entre os melhores do jogo em volume ofensivo (chutes no gol + gols valendo dobro)",
    cond:(sq,base)=>(sq.sot+sq.goals*2)>=(base?base.sotGoals:6), buffs:{goal:1.18,sotPts:1.18}, nerfs:{recovery:0.90,tklint:0.90}},
  aereo:{name:"Chuveiro na Área",desc:"Seu time fica entre os melhores do jogo em duelos aéreos vencidos",
    cond:(sq,base)=>sq.aerial>=(base?base.aerial:6), buffs:{aerial:1.18,accCross:1.18}, nerfs:{dribbles:0.90,prgp:0.90}},
  contra:{name:"Contra-Ataque",desc:"Seu time fica entre os melhores do jogo em dribles + passes na área (transição rápida)",
    cond:(sq,base)=>(sq.dribbles+sq.pib*0.5)>=(base?base.dribPib:5), buffs:{dribbles:1.18,goal:1.18,pib:1.18}, nerfs:{tklint:0.90,recovery:0.90}},
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
    return 1+Math.min(0.10,Math.max(0,edge/1800));
  }
  function minFactor(p){if(p.started||p.min>=45)return 1.0;return p.min/90;}
  function redPenalty(red){if(!red)return 0;const h1=red.m<=50;if(red.doubleYellow)return h1?-3.0:-2.0;return h1?BASE.redH1:BASE.redH2;}

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
    else if(clutch>=2) arch="Herói de Clutch";
    else if(G>=1&&golaco) arch="Finalizador Frio";
    else if(G>=1&&A>=1) arch="Decisivo";                                   // gol + assist
    else if(A>=2) arch="Garçom";
    else if((p.sca+p.gca*2)>=6&&p.pib>=3) arch="Maestro Criador";
    else if(p.pos==="ATT"&&p.sots.length>=3) arch="Lobo Solitário";        // muito chute
    else if(p.pos==="ATT"&&p.aerial>=4) arch="Pivô de Área";
    else if(p.pos==="ATT") arch="Homem de Frente";                         // atacante padrão
    else if(p.pos==="DEF"&&(p.aerial+p.block+p.clearance)>=10) arch="Muralha Aérea";
    else if(p.pos==="DEF"&&p.prgp>=3&&ix.sec>=70) arch="Zagueiro Construtor";
    else if(p.pos==="DEF"&&ix.iui>=60) arch="Lateral de Corredor";
    else if(p.pos==="MID"&&ix.iui>=70&&ix.tw>=70) arch="Box-to-Box";        // completo de verdade
    else if(p.pos==="MID"&&(p.sca+p.gca*2)>=4) arch="Camisa 10";
    else if((p.tklint+p.recovery)>=8&&ix.tw>=65) arch="Volante";
    else if(ix.tw>=65&&p.recovery>=6) arch="Motor";
    else if(ix.tw>=60&&ix.sec>=70&&p.pos!=="ATT") arch="Cão de Guarda";
    else if(ix.iui>=65&&ix.sec<45) arch="Ponta Caótico";

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
    ["Gols",BASE.goal,p=>p.goals.length],["Assistências",BASE.assist,p=>p.assists.length],
    ["Finalizações no gol",BASE.sot,p=>p.sots.length],["Dribles certos",BASE.dribble,p=>p.dribbles],
    ["Passes progressivos",BASE.prgp,p=>p.prgp],["Passes na área",BASE.pib,p=>p.pib],
    ["Toques na área",BASE.tib,p=>p.tib],["Cruzamentos certos",BASE.accCross,p=>p.accCross],
    ["Cruzamentos errados",BASE.inaccCross,p=>p.inaccCross],["Desarmes + interceptações",BASE.tklint,p=>p.tklint],
    ["Bloqueios",BASE.block,p=>p.block],["Recuperações de bola",BASE.recovery,p=>p.recovery],
    ["Duelos aéreos vencidos",BASE.aerial,p=>p.aerial],["Cortes",BASE.clearance,p=>p.clearance],
    ["Defesas",BASE.save,p=>p.gk?p.gk.saves.length:0],["Defesa de pênalti",BASE.penSave,p=>p.gk?p.gk.penSave:0],
    ["Saídas (sweeper)",BASE.opa,p=>p.gk?p.gk.opa:0],["Cruzamentos cortados",BASE.crossStop,p=>p.gk?p.gk.crossStop:0],
    ["Gols sofridos",BASE.concededGk,p=>p.gk?p.gk.conceded:0],["Cartão amarelo",BASE.yellow,p=>p.yellow],
    ["Faltas",BASE.foul,p=>p.fouls],["Vezes driblado",BASE.dribbledPast,p=>p.dribbledPast],
    ["Erro → gol",BASE.errGoal,p=>p.errGoal],["Pênalti cometido",BASE.penCom,p=>p.penCom],
  ];
  function statLines(p){const o=[];for(const[l,v,c]of STAT_DEFS){const n=c(p);if(n)o.push([l,n,v,r1(n*v)]);}return o;}

  function scorePlayer(p, tacticKey, squadSum){
    p=normP(p);
    if(p.min===0)return{total:0,minutes:0,statLines:[],lines:[],evNote:[],labels:[],meta:archetype(p,null,0,0)};
    const ts=match.team_stats?match.team_stats[p.team]:null;
    const lines=[];const push=(k,v,n)=>{if(Math.abs(v)>=0.05)lines.push([k+(n?` ${n}`:""),v]);};
    const mf=minFactor(p);
    const comp={
      goal:p.goals.length*BASE.goal,assist:p.assists.length*BASE.assist,sotPts:p.sots.length*BASE.sot,
      dribbles:r1(p.dribbles*mf)*BASE.dribble,prgp:r1(p.prgp*mf)*BASE.prgp,pib:r1(p.pib*mf)*BASE.pib,tib:r1(p.tib*mf)*BASE.tib,
      sca:r1(p.sca*mf)*BASE.sca,gca:p.gca*BASE.gca,tklint:r1(p.tklint*mf)*BASE.tklint,block:r1(p.block*mf)*BASE.block,
      recovery:r1(p.recovery*mf)*BASE.recovery,aerial:r1(p.aerial*mf)*BASE.aerial,clearance:r1(p.clearance*mf)*BASE.clearance,
      accCross:r1(p.accCross*mf)*BASE.accCross,inaccCross:r1(p.inaccCross*mf)*BASE.inaccCross,
    };
    let cs=0;const csEl=p.gk||(p.pos==="DEF"&&p.min>=60);
    if(csEl){const c=cleanSheetHalves(p.team);if(c.h1)cs+=1.5;if(c.h2)cs+=1.5;}
    let gkB=0,conc=0;
    if(p.gk){gkB=p.gk.saves.length*BASE.save+p.gk.opa*BASE.opa+p.gk.crossStop*BASE.crossStop+p.gk.penSave*BASE.penSave;conc=p.gk.conceded*BASE.concededGk;}
    const negRed=redPenalty(p.red);
    const neg=p.yellow*BASE.yellow+negRed+p.errGoal*BASE.errGoal+p.penCom*BASE.penCom+r1(p.dribbledPast*mf)*BASE.dribbledPast+r1(p.fouls*mf)*BASE.foul;
    const baseTot=Object.values(comp).reduce((a,b)=>a+b,0)+gkB+conc+neg+cs;
    if(mf<1)push(`Stats escalonados (${p.min}', fator ${mf.toFixed(2)})`,0);
    if(cs>0)push(`Clean sheet ${cs===3?"completo":"(1 metade)"}`,cs);
    if(p.red)push(`Vermelho${p.red.doubleYellow?" 2º amarelo":""} ${p.red.m<=50?"(1ºT)":"(2ºT)"}`,negRed);
    const sl=statLines(p);
    let dif=0,ctx=0,clutch=0;const ev=[];
    for(const g of p.goals){const t=tierXG(g.xg),d=diffAt(g.m);dif+=t.b;ctx+=(BASE.goal+t.b)*(ctxDecisive(d)-1);if(g.m>=85&&d<=1){const x=extendsLead(p.team,g.m);clutch+=x?0:t.b*0.25+1.0+TIER_EMO[t.t];ev.push(`⚽ Gol ${g.m}' xG ${g.xg.toFixed(2)} (T${t.t}${x?", ampliou":", clutch!"})`);}else ev.push(`⚽ Gol ${g.m}' xG ${g.xg.toFixed(2)} (T${t.t})`);}
    for(const a of p.assists){const t=tierXG(a.xag),d=diffAt(a.m);dif+=t.b;ctx+=(BASE.assist+t.b)*(ctxDecisive(d)-1);if(a.m>=85&&d<=1&&!extendsLead(p.team,a.m))clutch+=t.b*0.25+1.0+TIER_EMO[t.t];ev.push(`🅰️ Assist ${a.m}' xAG ${a.xag.toFixed(2)} (T${t.t})`);}
    for(const s of p.sots){const d=diffAt(s.m);ctx+=BASE.sot*(ctxDecisive(d)-1);if(s.m>=85&&d<=1)clutch+=0.6;}
    if(p.gk)for(const s of p.gk.saves){const t=tierSV(s.psxg),d=diffAt(s.m);dif+=t.b;ctx+=(BASE.save+t.b)*(ctxDefEvt(d)-1);if(s.m>=85&&d<=1){clutch+=t.b*0.25+0.6+TIER_EMO[t.t];ev.push(`🧤 Defesa ${s.m}' PSxG ${s.psxg.toFixed(2)} (T${t.t}) clutch`);}else if(t.t>=3)ev.push(`🧤 Defesa ${s.m}' PSxG ${s.psxg.toFixed(2)} (T${t.t})`);}
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
    if(T&&squadSum&&T.cond(squadSum,MATCH_BASE)){
      for(const[k,m]of Object.entries(T.buffs)){
        const base=k==="cleanSheet"?cs:(comp[k]??0);
        tact+=base*(m-1);
      }
      for(const[k,m]of Object.entries(T.nerfs)){
        const b=k==="fouls"?p.fouls*BASE.foul:k==="dribbledPast"?p.dribbledPast*BASE.dribbledPast:(comp[k]??0);
        tact+=b*(m-1);
      }
      tact=Math.max(-CAPS.TACT,Math.min(CAPS.TACT,tact));
      if(Math.abs(tact)>=0.05)push(`Tática ${T.name} ativada (cap ±${CAPS.TACT})`,r1(tact));
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

  // Soma as stats dos jogadores que TERMINARAM a partida em campo.
  // 'finishers' = array de objetos player (já com stats do match). Quem foi
  // substituído (subbedOff:true) ou não jogou (min=0) NÃO entra.
  function squadSum(finishers){
    const s={goals:0,assists:0,sot:0,prgp:0,pib:0,tklint:0,recovery:0,aerial:0,clearance:0,block:0,dribbles:0,setPieceSot:0,setPieceGoals:0,longSot:0,longGoals:0};
    for(const raw of finishers){
      const p=normP(raw);
      if(p.min===0||p.subbedOff) continue; // não terminou em campo
      s.goals+=p.goals.length; s.assists+=p.assists.length; s.sot+=p.sots.length;
      s.prgp+=p.prgp; s.pib+=p.pib; s.tklint+=p.tklint; s.recovery+=p.recovery;
      s.aerial+=p.aerial; s.clearance+=p.clearance; s.block+=p.block; s.dribbles+=p.dribbles;
      s.setPieceSot+=p.setPieceSot||0; s.setPieceGoals+=p.setPieceGoals||0;
      s.longSot+=p.longSot||0; s.longGoals+=p.longGoals||0;
    }
    return s;
  }

  return { scorePlayer, squadSum, TACTICS, matchBase:MATCH_BASE };
}

if (typeof module!=="undefined" && module.exports) module.exports={makeEngine,TACTICS};
if (typeof window!=="undefined"){ window.makeEngine=makeEngine; window.ENGINE_TACTICS=TACTICS; }
