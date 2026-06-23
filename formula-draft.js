// ============================================================
//  FANTASY PvP — FÓRMULA DE PREÇO DO MODO DRAFT (Banco Master)
//  v2: preço absoluto de temporada, independente do adversário.
//
//  Base:
//  - marketValue/mv em euros
//  - curva de idade para não matar veterano validado
//  - teto linha 50 / GK 35 / piso 1
//
//  Ajuste novo:
//  - minutagem de clube
//  - titularidade no clube
//  - rating/desempenho no clube
//
//  Diferença para os modos normais:
//  - NÃO usa ELO do adversário
//  - NÃO muda por partida
//  - é preço de mercado permanente do Draft
// ============================================================

const DRAFT = (function(){
  // curva de idade — idêntica à v6.10 (jovem desce, veterano sobe)
  const CURVA_IDADE = {
    16:0.35,17:0.38,18:0.42,19:0.47,20:0.53,21:0.60,22:0.69,23:0.80,
    24:0.92,25:1.00,26:1.00,27:1.00,28:1.12,29:1.35,
    30:1.70,31:2.10,32:2.55,33:3.05,34:3.55,35:4.05,36:4.55,
    37:5.00,38:5.40,39:5.75,40:6.00
  };
  function multIdade(age){
    if(!age) return 1;
    if(age < 16) return 0.35;
    if(age > 40) return 6.00;
    return CURVA_IDADE[age] || 1;
  }
  // atenua o desconto do jovem se o mv já é alto (prodígio já validado pelo mercado)
  function multIdadeMv(age, mv){
    const base = multIdade(age);
    if(base >= 1) return base;
    const validacao = Math.min(0.7, Math.pow((mv||0)/200e6, 0.7) * 0.7);
    return base + (1 - base) * validacao;
  }

  // --- parâmetros do mapeamento mv-ajustado -> preço ---
  const TETO_LINHA = 50;
  const TETO_GK    = 35;
  const PISO       = 1;
  // âncora de topo: mv-ajustado (em M€) que corresponde ao teto.
  // o mercado de GOLEIROS é comprimido (topo ~50M vs 218M de craque de linha),
  // então o GK tem âncora própria, mais baixa, pra que goleiro de elite
  // também chegue perto do seu teto e seja uma escolha que pesa no orçamento.
  const MV_TOPO_LINHA = 210;   // M€  — âncora p/ DEF/MID/ATT
  const MV_TOPO_GK    = 52;    // M€  — âncora p/ GK (mercado deles satura ~50M)
  const EXP           = 0.62;  // <1 = estica o topo, achata a base (raiz)

  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function num(x,fb){ x=Number(x); return Number.isFinite(x) ? x : (fb||0); }
  function getMv(p){ return num(p.mv!=null?p.mv:p.marketValue, 0); }

  function clubMeta(p){
    const m = p.clubMeta || p.meta || p;
    return {
      minutes: num(m.clubMinutes!=null?m.clubMinutes:m.minutes, 0),
      apps: num(m.clubApps!=null?m.clubApps:m.apps, 0),
      lineups: num(m.clubLineups!=null?m.clubLineups:m.lineups, 0),
      teamGames: num(m.clubTeamGames!=null?m.clubTeamGames:m.teamGames, 0),
      titularRate: num(m.titularRate, 0),
      availRate: num(m.availRate, 0),
      rating: m.clubRating!=null ? num(m.clubRating, null) : (m.rating!=null ? num(m.rating, null) : null),
      maybeInjured: !!m.maybeInjured,
      status: m.clubStatus || m.status || null
    };
  }

  // Ajuste em pontos. Mantém a escala do Draft difícil, mas separa melhor:
  // jogador caro sem minutagem cai; jogador realmente usado e bem avaliado sobe.
  function ajusteClube(p, base){
    const m = clubMeta(p);
    if(!m.minutes && !m.apps && m.rating==null) return 0;

    let adj = 0;
    const min = m.minutes;
    const tit = m.titularRate || (m.teamGames ? m.lineups / m.teamGames : 0);
    const rating = m.rating;

    if(min >= 2400 && tit >= 0.65) adj += 4;
    else if(min >= 1800 && tit >= 0.55) adj += 3;
    else if(min >= 1200 && tit >= 0.35) adj += 2;
    else if(min >= 800) adj += 1;
    else if(min > 0 && min < 300) adj -= base >= 20 ? 5 : 2;
    else if(min > 0 && min < 650) adj -= base >= 20 ? 3 : 1;

    if(rating != null){
      if(rating >= 7.45) adj += 4;
      else if(rating >= 7.25) adj += 3;
      else if(rating >= 7.05) adj += 2;
      else if(rating >= 6.90) adj += 1;
      else if(rating < 6.40) adj -= 3;
      else if(rating < 6.60) adj -= 2;
    }

    if(m.maybeInjured) adj -= base >= 15 ? 3 : 1;
    return clamp(adj, -7, 7);
  }

  function capBaixaMinutagem(p, preco){
    const m = clubMeta(p);
    const mv = getMv(p);
    if(!m.minutes && !m.apps) return preco;
    if(m.minutes >= 700) return preco;
    if(mv >= 100e6) return Math.min(preco, 38);
    if(mv >= 60e6) return Math.min(preco, 32);
    if(mv >= 30e6) return Math.min(preco, 26);
    if(preco >= 18 && m.minutes < 300) return Math.min(preco, 18);
    return preco;
  }

  // preço bruto (antes do teto/piso) a partir do mv ajustado por idade
  function precoBruto(mvAdjM, pos){
    const teto    = (pos === "GK") ? TETO_GK : TETO_LINHA;
    const mvTopo  = (pos === "GK") ? MV_TOPO_GK : MV_TOPO_LINHA;
    const r = Math.max(0, mvAdjM / mvTopo);           // 0..1+
    const f = Math.pow(Math.min(1, r), EXP);          // 0..1 com saturação
    return PISO + (teto - PISO) * f;                  // PISO..teto
  }

  // calcula draftPrice de um jogador {name,team,pos,age,mv}
  function draftPrice(p){
    const mv = getMv(p);
    const mvAdj = mv * multIdadeMv(p.age || 0, mv);   // euros
    let preco = precoBruto(mvAdj / 1e6, p.pos);       // usa M€ + âncora por posição
    preco += ajusteClube(p, preco);
    preco = capBaixaMinutagem(p, preco);
    const teto = (p.pos === "GK") ? TETO_GK : TETO_LINHA;
    preco = Math.min(teto, Math.max(PISO, preco));
    return Math.round(preco);
  }

  function draftPriceDetailed(p){
    const mv = getMv(p);
    const mvAdj = mv * multIdadeMv(p.age || 0, mv);
    const base = precoBruto(mvAdj / 1e6, p.pos);
    const ajuste = ajusteClube(p, base);
    const capped = capBaixaMinutagem(p, base + ajuste);
    const teto = (p.pos === "GK") ? TETO_GK : TETO_LINHA;
    const final = Math.round(Math.min(teto, Math.max(PISO, capped)));
    return { base:Math.round(base), ajuste:Math.round(ajuste), final, meta:clubMeta(p) };
  }

  return { draftPrice, draftPriceDetailed, precoBruto, multIdadeMv, multIdade,
           ajusteClube, clubMeta,
           TETO_LINHA, TETO_GK, PISO, MV_TOPO_LINHA, MV_TOPO_GK, EXP };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DRAFT;
if (typeof window !== "undefined") window.DRAFT = DRAFT;
