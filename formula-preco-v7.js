// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FANTASY PvP — FÓRMULA DE PREÇO OFICIAL  ·  VERSÃO 6.10 (2026-06-21) · peso mercado por mv + trava anti-ruim-caro (margem 11) · regra automática  ║
// ║  PATCH 7.1 (2026-06-23): minutagem, titularidade, disponibilidade e rating de clube  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Arquivo único e autossuficiente (sem require externo). Contém as 3 etapas:
//   1) parseApiFull(texto)        — lê o texto do dashboard API-Football
//   2) computePricesEngine(api)   — pontos esperados na engine (preço-base)
//   3) computeHybrid(sofa, api)   — mistura com mercado/idade/confiança
//      + normalizeDream(jogo)     — normaliza o JOGO inteiro (curva + teto)
//
// ─── COMO USAR ───────────────────────────────────────────────────────────────
//   const F = require('./formula-preco-v6.js');
//   const time1 = F.parseApiFull('texto_time1.txt');  // ou já no formato API
//   const apiT1 = F.toResponse(time1, 'NOME_TIME');
//   // ... idem time2 ...
//   let a = F.computeHybrid(sofaTime1, apiT1);
//   let b = F.computeHybrid(sofaTime2, apiT2);
//   let jogo = [...a, ...b];
//   F.normalizeDream(jogo);            // crava o jogo (dream ~140, teto 35/22)
//   // jogo[i].price = preço final
//
// ─── FILOSOFIA (por que cada parâmetro existe) ───────────────────────────────
//   • PREÇO-POR-ENGINE: o preço-base é "quantos pontos o jogador faz na NOSSA
//     engine" (gol, assist, desarme, defesa, clean sheet...). Justo entre
//     posições — zagueiro, meia e atacante medidos pela mesma régua do jogo.
//   • MERCADO 60%: amostra de seleção é curta e engana. O valor de mercado
//     (corrigido por idade/posição) ancora a QUALIDADE REAL. Craque que jogou
//     pouco (Marmoush, reserva do City) não despenca; veterano é resgatado.
//   • CURVA DE IDADE: o mercado é enviesado — INFLA o jovem (paga fortuna por
//     potencial) e SUBVALORIZA o veterano (desconta por idade mesmo jogando bem).
//     A fórmula corrige na direção oposta, multiplicando o mv por idade:
//       - jovem (16-24): multiplicador <1 (ex: 16a ×0.35, 20a ×0.53) → fica mais
//         barato, pois o mv dele já vinha inflado pelo hype de potencial.
//       - pico (25-27): ×1.00, onde o mv é justo.
//       - veterano (28-40): multiplicador >1 crescente (32a ×2.55, 35a ×4.05,
//         40a ×6.00) → resgata o consagrado que o mercado descontou por idade.
//     Obs: o resgate só infla quem AINDA tem mv razoável; veterano de mv miúdo
//     (ex: 1.4M) sobe pouco — a régua é "craque subvalorizado", não "idoso".
//     A saturação (raiz) e os tetos por posição limitam o quanto isso dispara.
//   • CONFIANÇA POR MINUTOS: quem jogou pouquíssimo tem desempenho instável;
//     o peso do mercado sobe (até 88%) pra não deixar nota de 13 min virar teto.
//   • NORMALIZAÇÃO POR JOGO: cada partida é um mundo fechado. CURVA 0.85 (<1)
//     deixa a BASE CARA (muita gente 22-35, poucos baratos) — difícil "encher
//     o time de bons". Dream team ~140; teto de linha 35; GK 22 (escala só 1).
//
// ─── PARÂMETROS (v6.0) ───────────────────────────────────────────────────────
//   W_MERC_BASE   = 0.75   peso do mercado com volume de minutos
//   W_MERC_POUCO  = 0.90   peso do mercado com pouquíssimos minutos
//   CONF_MIN      = 270    minutos (≈3 jogos) p/ confiança plena no desempenho
//   CURVA         = 0.85   <1 infla o meio (base cara); =1 linear; >1 comprime
//   DREAM_ALVO    = 140    soma do dream team (GK+DEF+MID+ATT+FLEX)
//   TETO_LINHA    = 35     teto de DEF/MID/ATT
//   TETO_GK       = 26     teto do goleiro (menor: força escolher 1)
//   CURVA_IDADE   = mult. por idade individual no mv (16a ×0.35 … 27a ×1.00 …
//                   32a ×2.55 … 35a ×4.05 … 40a ×6.00). jovem↓, veterano↑.
//
// ─── HISTÓRICO ───────────────────────────────────────────────────────────────
//   v5   rating normalizado + produção + peso de liga
//   v6.1 = v6.0 + curva de idade (jovem<1, veterano até x6)
// ══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');

// ─────────── MÓDULO 1: PARSER DO TEXTO DA API ───────────
// Parser COMPLETO do texto do dashboard API-Football (players/statistics).
// Captura TODOS os stats que a engine usa, por bloco de liga, pra alimentar o
// preço-por-engine. Lê o texto colado (com bullets/tabs) e devolve no formato
// padrão da API: [{player:{id,name}, statistics:[{league, games, shots, goals,
// passes, tackles, duels, dribbles, fouls, cards, penalty}]}].

function parseApiFull(path) {
  let t = fs.readFileSync(path, 'utf8');
  t = t.replace(/\u2022/g, '').replace(/\t/g, ' ').replace(/\r/g, '');
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);

  const players = [];
  let cur = null;       // jogador atual
  let stat = null;      // bloco de liga atual
  let section = null;   // sub-objeto atual: games/shots/goals/passes/tackles/duels/dribbles/fouls/cards/penalty/league
  let inPlayerHeader = false; // dentro do player:{} (pra pegar id/name uma vez)

  const num = v => {
    if (v == null) return null;
    v = v.replace(/"/g, '').trim();
    if (v === 'null' || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  function newStat() {
    return {
      league: { id: null }, games: { minutes: null, position: null, rating: null, appearences: null },
      shots: { total: null, on: null }, goals: { total: 0, conceded: 0, assists: 0, saves: null },
      passes: { key: null }, tackles: { total: null, blocks: null, interceptions: null },
      duels: { total: null, won: null }, dribbles: { success: null },
      fouls: { drawn: null, committed: null }, cards: { yellow: 0, yellowred: 0, red: 0 },
      penalty: { won: null, saved: null, scored: 0 },
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];

    // novo jogador
    if (/^player:\s*\{/.test(L)) {
      if (cur) players.push(cur);
      cur = { player: { id: null, name: null }, statistics: [] };
      stat = null; section = 'playerHeader'; inPlayerHeader = true;
      continue;
    }
    if (!cur) continue;

    // dentro do header do player: pegar id e name (primeiros)
    if (inPlayerHeader) {
      let m;
      if (cur.player.id == null && (m = L.match(/^id:\s*([0-9]+)/))) { cur.player.id = +m[1]; continue; }
      if (cur.player.name == null && (m = L.match(/^name:\s*"([^"]*)"/))) { cur.player.name = m[1]; continue; }
      // sai do header quando começa statistics
      if (/^statistics:\s*\[/.test(L)) { inPlayerHeader = false; section = null; }
      continue;
    }

    // novo bloco de liga começa com "team: {" ou "league: {"
    if (/^league:\s*\{/.test(L)) {
      // se ainda não há stat aberto (ou o anterior já tem league), abre novo
      if (!stat || stat.league.id != null) { stat = newStat(); cur.statistics.push(stat); }
      section = 'league';
      const m = lines[i + 1] && lines[i + 1].match(/^id:\s*([0-9]+)/);
      if (m) stat.league.id = +m[1];
      continue;
    }
    if (/^team:\s*\{/.test(L)) {
      // marca início de um novo bloco de estatística (team vem antes de league)
      stat = newStat(); cur.statistics.push(stat); section = 'team';
      continue;
    }
    if (!stat) continue;

    // entrar em sub-seções
    let mm;
    if ((mm = L.match(/^(games|shots|goals|passes|tackles|duels|dribbles|fouls|cards|penalty|substitutes):\s*\{/))) {
      section = mm[1];
      continue;
    }

    // capturar campos conforme a seção
    let m;
    if (section === 'games') {
      if ((m = L.match(/^minutes:\s*(null|[0-9]+)/))) stat.games.minutes = num(m[1]);
      else if ((m = L.match(/^position:\s*"([^"]*)"/))) stat.games.position = m[1];
      else if ((m = L.match(/^rating:\s*(null|"[0-9.]+")/))) stat.games.rating = m[1] === 'null' ? null : m[1].replace(/"/g, '');
      else if ((m = L.match(/^appearences:\s*([0-9]+)/))) stat.games.appearences = +m[1];
    } else if (section === 'shots') {
      if ((m = L.match(/^total:\s*(null|[0-9]+)/))) stat.shots.total = num(m[1]);
      else if ((m = L.match(/^on:\s*(null|[0-9]+)/))) stat.shots.on = num(m[1]);
    } else if (section === 'goals') {
      if ((m = L.match(/^total:\s*(null|[0-9]+)/))) stat.goals.total = num(m[1]) || 0;
      else if ((m = L.match(/^conceded:\s*(null|[0-9]+)/))) stat.goals.conceded = num(m[1]) || 0;
      else if ((m = L.match(/^assists:\s*(null|[0-9]+)/))) stat.goals.assists = num(m[1]) || 0;
      else if ((m = L.match(/^saves:\s*(null|[0-9]+)/))) stat.goals.saves = num(m[1]);
    } else if (section === 'passes') {
      if ((m = L.match(/^key:\s*(null|[0-9]+)/))) stat.passes.key = num(m[1]);
    } else if (section === 'tackles') {
      if ((m = L.match(/^total:\s*(null|[0-9]+)/))) stat.tackles.total = num(m[1]);
      else if ((m = L.match(/^blocks:\s*(null|[0-9]+)/))) stat.tackles.blocks = num(m[1]);
      else if ((m = L.match(/^interceptions:\s*(null|[0-9]+)/))) stat.tackles.interceptions = num(m[1]);
    } else if (section === 'duels') {
      if ((m = L.match(/^total:\s*(null|[0-9]+)/))) stat.duels.total = num(m[1]);
      else if ((m = L.match(/^won:\s*(null|[0-9]+)/))) stat.duels.won = num(m[1]);
    } else if (section === 'dribbles') {
      if ((m = L.match(/^success:\s*(null|[0-9]+)/))) stat.dribbles.success = num(m[1]);
    } else if (section === 'fouls') {
      if ((m = L.match(/^drawn:\s*(null|[0-9]+)/))) stat.fouls.drawn = num(m[1]);
      else if ((m = L.match(/^committed:\s*(null|[0-9]+)/))) stat.fouls.committed = num(m[1]);
    } else if (section === 'cards') {
      if ((m = L.match(/^yellow:\s*([0-9]+)/))) stat.cards.yellow = +m[1];
      else if ((m = L.match(/^yellowred:\s*([0-9]+)/))) stat.cards.yellowred = +m[1];
      else if ((m = L.match(/^red:\s*([0-9]+)/))) stat.cards.red = +m[1];
    } else if (section === 'penalty') {
      if ((m = L.match(/^won:\s*(null|[0-9]+)/))) stat.penalty.won = num(m[1]);
      else if ((m = L.match(/^saved:\s*(null|[0-9]+)/))) stat.penalty.saved = num(m[1]);
      else if ((m = L.match(/^scored:\s*([0-9]+)/))) stat.penalty.scored = +m[1];
    }
  }
  if (cur) players.push(cur);
  // limpar blocos vazios (team sem league)
  players.forEach(p => { p.statistics = p.statistics.filter(s => s.league.id != null); });
  return players;
}




// ─────────── MÓDULO 2: PREÇO-POR-ENGINE ───────────
// ============================================================================
// PREÇO POR PONTOS ESPERADOS NA ENGINE (v6)
// ----------------------------------------------------------------------------
// Em vez de "rating + produção" com pesos chutados, estimamos quantos PONTOS o
// jogador faz por jogo NA NOSSA ENGINE (mesma régua do jogo, equilibrada entre
// posições via POS_MULT). Assim um zagueiro que desarma, um meia que dá assist
// e um atacante que faz gol são medidos pela mesma vara: pontos no nosso jogo.
//
// Os stats vêm da API-Football (players/statistics, agregados na temporada).
// A API tem os stats que MAIS pontuam (gol, assist, defesa, desarme, chute,
// bloqueio, drible, passe-chave, cartões, gol sofrido). Stats granulares que a
// engine usa mas a API não fornece (prgp, recovery, aerial, clearance, gca, xAG)
// são pequenos e ficam de fora — a estimativa fica levemente conservadora, mas
// fiel à hierarquia de pontuação do jogo.
// ============================================================================

// Tabela BASE da engine (espelha engine.js; só os eventos que a API fornece).
const B = {
  goal: 4.2, assist: 3.3, sot: 1.7, dribble: .6, sca: .75,
  tklint: .36, block: .48,
  save: 1.35, penSave: 6,
  wasFouled: .08, penaltyWon: 2.5,
  yellow: -2, red: -6, concededGk: -2, foul: -.45,
};
const POS_MULT = { GK: 1.02, DEF: 1.077, MID: 1.005, ATT: 1.032 };

// peso de liga (v6.3: ranking IFFHS "Strongest National League" 2025, top100 países)
// peso = piso + (1-piso)*(pts/2359)^0.62 ; England 1ª div = 1.00
// divisões inferiores (2ª/3ª/4ª) = país × fator (0.62/0.42/0.30) sobre o excedente
// seleções (1,2,3,10,29-37) mantidas. 205 ligas no total. fora da tabela: DEFAULT.
const LEAGUE_WEIGHT = {
  1: 0.92, 2: 0.95, 3: 0.85, 10: 0.8, 29: 0.74, 30: 0.74, 31: 0.74, 32: 0.74, 33: 0.74,
  34: 0.74, 37: 0.74, 39: 1, 40: 0.79, 41: 0.68, 42: 0.61, 43: 0.57, 61: 0.89, 62: 0.72,
  63: 0.63, 71: 0.96, 72: 0.76, 75: 0.66, 76: 0.6, 78: 0.94, 79: 0.75, 80: 0.66, 88: 0.83,
  89: 0.68, 94: 0.84, 95: 0.69, 98: 0.76, 99: 0.64, 100: 0.58, 103: 0.72, 104: 0.62,
  106: 0.75, 107: 0.64, 110: 0.63, 113: 0.67, 114: 0.59, 116: 0.66, 119: 0.74, 120: 0.63,
  128: 0.83, 129: 0.68, 135: 0.95, 136: 0.76, 138: 0.66, 140: 0.97, 141: 0.77, 144: 0.81,
  145: 0.67, 162: 0.73, 164: 0.65, 165: 0.58, 166: 0.54, 169: 0.68, 172: 0.71, 173: 0.61,
  179: 0.75, 180: 0.64, 183: 0.58, 184: 0.54, 186: 0.69, 187: 0.6, 188: 0.65, 197: 0.77,
  200: 0.71, 201: 0.61, 202: 0.68, 203: 0.81, 204: 0.67, 205: 0.6, 207: 0.72, 208: 0.62,
  210: 0.73, 211: 0.62, 218: 0.72, 219: 0.61, 233: 0.77, 234: 0.67, 239: 0.82, 240: 0.68,
  242: 0.78, 243: 0.66, 244: 0.66, 245: 0.58, 250: 0.76, 251: 0.64, 252: 0.76, 253: 0.71,
  255: 0.61, 261: 0.64, 262: 0.75, 263: 0.64, 265: 0.72, 266: 0.62, 268: 0.75, 269: 0.64,
  271: 0.7, 272: 0.61, 274: 0.64, 275: 0.57, 278: 0.64, 281: 0.72, 282: 0.61, 283: 0.73,
  284: 0.62, 286: 0.72, 287: 0.62, 288: 0.69, 289: 0.6, 290: 0.67, 292: 0.71, 293: 0.61,
  296: 0.69, 297: 0.6, 299: 0.66, 300: 0.58, 301: 0.7, 303: 0.61, 304: 0.64, 305: 0.66,
  306: 0.58, 307: 0.79, 308: 0.66, 309: 0.59, 310: 0.66, 312: 0.64, 315: 0.69, 316: 0.55,
  317: 0.55, 318: 0.75, 319: 0.64, 322: 0.66, 326: 0.57, 327: 0.65, 328: 0.59, 329: 0.67,
  330: 0.64, 331: 0.57, 332: 0.64, 333: 0.72, 334: 0.62, 339: 0.66, 342: 0.67, 344: 0.69,
  345: 0.76, 346: 0.65, 355: 0.64, 357: 0.69, 358: 0.6, 361: 0.57, 362: 0.64, 364: 0.59,
  365: 0.68, 366: 0.57, 367: 0.65, 368: 0.64, 369: 0.64, 371: 0.66, 373: 0.7, 374: 0.6,
  382: 0.61, 383: 0.7, 386: 0.64, 388: 0.57, 389: 0.65, 393: 0.65, 394: 0.65, 396: 0.68,
  397: 0.64, 399: 0.64, 400: 0.64, 404: 0.65, 407: 0.59, 408: 0.67, 412: 0.64, 418: 0.61,
  419: 0.71, 424: 0.66, 435: 0.67, 436: 0.67, 473: 0.56, 474: 0.56, 489: 0.56, 494: 0.65,
  506: 0.57, 542: 0.64, 563: 0.54, 564: 0.54, 567: 0.68, 570: 0.63, 598: 0.65, 636: 0.65,
  664: 0.68, 710: 0.6, 711: 0.56, 828: 0.6, 844: 0.66, 865: 0.61, 942: 0.66, 943: 0.66,
  1087: 0.58, 1126: 0.59,
};
const LEAGUE_WEIGHT_DEFAULT = 0.55;
function leagueWeight(id) { return LEAGUE_WEIGHT[id] != null ? LEAGUE_WEIGHT[id] : LEAGUE_WEIGHT_DEFAULT; }

const POS_MAP = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'ATT' };

// ---- soma os eventos de todas as ligas de um jogador, ponderando liga ----
function aggregate(statsArray) {
  const acc = {
    minutes: 0, apps: 0, goals: 0, assists: 0, sot: 0, saves: 0, conceded: 0,
    tklint: 0, blocks: 0, dribbles: 0, keyPasses: 0, foulsDrawn: 0, foulsComm: 0,
    yellow: 0, red: 0, penWon: 0, penSaved: 0,
  };
  let bestLeague = 0, posCount = {}, lwMinSum = 0, minSum = 0;
  for (const s of statsArray) {
    const g = s.games || {};
    const min = g.minutes || 0;
    if (min <= 0) { // ainda conta posição declarada pra reservas
      if (g.position) posCount[g.position] = (posCount[g.position] || 0);
      continue;
    }
    const lw = leagueWeight(s.league && s.league.id);
    // os eventos são ponderados pelo peso da liga (gol em liga fraca vale menos
    // "nível", como no resto do sistema). Mantém o equilíbrio entre seleções.
    acc.minutes += min;
    acc.apps += g.appearences || 0;
    acc.goals += ((s.goals && s.goals.total) || 0) * lw;
    acc.assists += ((s.goals && s.goals.assists) || 0) * lw;
    acc.sot += ((s.shots && s.shots.on) || 0) * lw;
    acc.saves += ((s.goals && s.goals.saves) || 0) * lw;
    acc.conceded += ((s.goals && s.goals.conceded) || 0) * lw;
    const tk = s.tackles || {};
    acc.tklint += (((tk.total) || 0) + ((tk.interceptions) || 0)) * lw;
    acc.blocks += ((tk.blocks) || 0) * lw;
    acc.dribbles += ((s.dribbles && s.dribbles.success) || 0) * lw;
    acc.keyPasses += ((s.passes && s.passes.key) || 0) * lw;
    acc.foulsDrawn += ((s.fouls && s.fouls.drawn) || 0) * lw;
    acc.foulsComm += ((s.fouls && s.fouls.committed) || 0) * lw;
    acc.yellow += ((s.cards && s.cards.yellow) || 0) * lw;
    acc.red += (((s.cards && s.cards.red) || 0) + ((s.cards && s.cards.yellowred) || 0)) * lw;
    acc.penWon += ((s.penalty && s.penalty.won) || 0) * lw;
    acc.penSaved += ((s.penalty && s.penalty.saved) || 0) * lw;
    if (lw > bestLeague) bestLeague = lw;
    if (g.position) posCount[g.position] = (posCount[g.position] || 0) + min;
    lwMinSum += min * lw; minSum += min;
  }
  let pos = null, mx = -1;
  for (const k in posCount) if (posCount[k] > mx) { mx = posCount[k]; pos = k; }
  return { acc, pos: POS_MAP[pos] || 'MID', bestLeague: bestLeague || LEAGUE_WEIGHT_DEFAULT,
           avgLw: minSum > 0 ? lwMinSum / minSum : LEAGUE_WEIGHT_DEFAULT };
}

// ---- pontos esperados POR JOGO (90 min) na engine ----
// teamCleanSheetRate: taxa estimada de jogos sem sofrer gol do TIME (0..1),
// usada pra dar pontos de clean sheet a GK e DEF (como na engine real).
function expectedPointsPer90(agg, teamCleanSheetRate) {
  const a = agg.acc;
  const min = a.minutes;
  if (min <= 0) return null; // sem jogos: sem estimativa
  // soma de pontos de todos os eventos (já ponderados por liga)
  let pts = 0;
  pts += a.goals * B.goal;
  pts += a.assists * B.assist;
  pts += a.sot * B.sot;
  pts += a.saves * B.save;
  pts += a.penSaved * B.penSave;
  pts += a.tklint * B.tklint;
  pts += a.blocks * B.block;
  pts += a.dribbles * B.dribble;
  pts += a.keyPasses * B.sca;       // passe-chave ~ ação que cria chance (SCA)
  pts += a.foulsDrawn * B.wasFouled;
  pts += a.penWon * B.penaltyWon;
  pts += a.conceded * B.concededGk; // só GK tem conceded; negativo
  pts += a.yellow * B.yellow;
  pts += a.red * B.red;
  pts += a.foulsComm * B.foul;
  // por-jogo dos eventos acima
  let per90 = pts / min * 90;
  // CLEAN SHEET estimado (GK e DEF): a engine premia manter o gol zero.
  // GK ganha ~3.0 por tempo sem gol, DEF ~1.5 por tempo. Aproximamos por jogo:
  // 2 tempos × valor × taxa de clean sheet do time.
  if (teamCleanSheetRate != null && (agg.pos === 'GK' || agg.pos === 'DEF')) {
    const perHalf = agg.pos === 'GK' ? 3.0 : 1.5;
    per90 += 2 * perHalf * teamCleanSheetRate;
  }
  // POS_MULT (equilíbrio entre posições, igual à engine)
  return per90 * (POS_MULT[agg.pos] || 1);
}

// estima a taxa de clean sheet do time a partir dos GKs (gols sofridos / jogos).
function teamCleanSheetRate(apiPlayers) {
  let apps = 0, conceded = 0;
  for (const p of apiPlayers) {
    for (const s of (p.statistics || [])) {
      const isGK = s.games && s.games.position === 'Goalkeeper';
      if (isGK && s.games.minutes > 0) {
        apps += s.games.appearences || Math.round(s.games.minutes / 90) || 1;
        conceded += (s.goals && s.goals.conceded) || 0;
      }
    }
  }
  if (apps === 0) return 0.3; // default neutro
  // gols por jogo do time
  const gpg = conceded / apps;
  // taxa aproximada de clean sheet via Poisson: P(0 gols) = e^-gpg
  return Math.exp(-gpg);
}

// ---- converte pontos/jogo em preço (escala calibrável) ----
// EP_REF = pontos/jogo que corresponde ao teto de preço da posição.
function priceFromEP(ep, pos, cfg) {
  const PMIN = 3;
  const top = cfg.PMAX[pos] || cfg.PMAX.MID;
  const ref = cfg.EP_REF;          // pontos/jogo -> preço-topo
  const q = Math.max(0, Math.min(1, ep / ref));
  return Math.round(PMIN + (top - PMIN) * Math.pow(q, cfg.CURVE));
}

// ---- API pública: computa preço-por-engine de uma lista de jogadores da API ----
function computePricesEngine(apiPlayers, cfg) {
  cfg = Object.assign({
    PMAX: { GK: 26, DEF: 42, MID: 42, ATT: 42 },
    EP_REF: 9.0,   // ~9 pts/jogo (ponderado) = topo. Calibrável.
    CURVE: 1.0,
  }, cfg || {});
  const csRate = teamCleanSheetRate(apiPlayers);
  return apiPlayers.map(p => {
    const agg = aggregate(p.statistics || []);
    const ep = expectedPointsPer90(agg, csRate);
    const pos = agg.pos;
    const price = ep == null ? null : priceFromEP(ep, pos, cfg);
    return {
      name: p.player && p.player.name, id: p.player && p.player.id,
      pos, ep, min: agg.acc.minutes, goals: agg.acc.goals, assists: agg.acc.assists,
      price, bestLeague: agg.bestLeague, avgLw: agg.avgLw,
    };
  });
}



// ─────────── MÓDULO 3: HÍBRIDA + NORMALIZAÇÃO ───────────
// ============================================================
// FÓRMULA HÍBRIDA — combina SofaScore (lista oficial do jogo) com
// API-Football (rating/desempenho). Para cada jogador da pool:
//   - tem rating na API-Football?  -> preço v5 (desempenho real)
//   - não tem (estreante)?         -> preço v4 (valor de mercado SofaScore)
//
// A SofaScore é a FONTE DA VERDADE de quem está no jogo.
// A API-Football é consultada por nome aproximado para pegar o rating.
// ============================================================


// ---- normalização de nome para casar fontes diferentes ----
// Remove acentos, pontuação, baixa caixa. Mantém só letras e espaços.
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// tokens do sobrenome (parte mais estável entre fontes)
function lastToken(s) {
  const t = norm(s).split(' ').filter(Boolean);
  return t.length ? t[t.length - 1] : '';
}

// ─────────── v6.6: ELO DE CLUBE + LIGA (multiplicador combinado) ───────────
// Banco de elo (footballdatabase.com, ~3000 clubes). Carrega lazy (se existir).
let _CLUB_ELO = null;
function _loadElo() {
  if (_CLUB_ELO !== null) return _CLUB_ELO;
  try { _CLUB_ELO = require('./club-elo-map.js'); }
  catch (_) { _CLUB_ELO = { CLUB_ELO_EXACT: {}, CLUB_ELO_STRIPPED: {} }; }
  return _CLUB_ELO;
}
// normaliza nome de clube p/ casar com o banco (igual ao gerador do mapa)
function normClub(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
// busca elo de um clube pelo nome; null se não casar
function eloDeClube(clubName) {
  if (!clubName) return null;
  const E = _loadElo();
  const k = normClub(clubName);
  if (E.CLUB_ELO_EXACT[k] != null) return E.CLUB_ELO_EXACT[k];
  // tenta sem sufixos (fc, cf, kv, sk...)
  const sk = k.replace(/\b(fc|cf|sc|ac|fk|sk|cd|ca|sv|afc|ssc|as|us|ud|kv|bk|if|ff|cs|rc|sd|club|kff|vc)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (E.CLUB_ELO_STRIPPED[sk] != null) return E.CLUB_ELO_STRIPPED[sk];
  return null;
}
// elo -> multiplicador [0.55..1.0] (Bayern 2085=1.0; <=1400 piso 0.55)
function eloMult(e) {
  const lo = 1400, hi = 2085;
  if (e <= lo) return 0.55;
  return 0.55 + 0.45 * Math.pow((e - lo) / (hi - lo), 0.85);
}
// COMBINA liga (60%) + elo (40%). Se não tem elo do clube, usa só a liga.
// ligaLw: peso da liga de clube (0.55..1.0). clubName: nome do clube (SofaScore).
function clubMultiplier(ligaLw, clubName) {
  const base = (ligaLw != null ? ligaLw : 1);
  const e = eloDeClube(clubName);
  if (e == null) return base;            // sem elo -> só liga
  return 0.6 * base + 0.4 * eloMult(e);  // combinado 60/40
}
// inicial + sobrenome, ex "K. Mbappé" -> "k mbappe"
function initialLast(s) {
  const t = norm(s).split(' ').filter(Boolean);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  return t[0][0] + ' ' + t[t.length - 1];
}

// Apelidos para transliterações divergentes entre SofaScore e API-Football.
// chave = nome normalizado da SofaScore -> valor = nome normalizado da API.
const ALIASES = {
  'firas al buraikan': 'feras al brikan',
  'f al buraikan': 'feras al brikan',
  'h altambakti': 'hassan tambakti',
  'z aljohani': 'ziyad al johani',
  'ala a al hejji': 'ala al hajji',
  'a al hejji': 'ala al hajji',
  'pau cubarsi': 'pau cubarsi paredes',
  'p cubarsi': 'pau cubarsi paredes',
  // Irã
  'ehsan hajsafi': 'e hajisafi',
  'e hajsafi': 'e hajisafi',
  'mehdi ghayedi': 'm ghaedi',
  'm ghayedi': 'm ghaedi',
  'hossein kanaani': 'h kanani',
  'h kanaani': 'h kanani',
};

// Tenta casar um nome da SofaScore com a lista da API-Football.
// Retorna o objeto da API (com rating já computado) ou null.
function matchApi(sofaName, apiByKey) {
  const candidates = [
    norm(sofaName),
    initialLast(sofaName),
    lastToken(sofaName),
  ];
  // apelido conhecido?
  const aliasKey = ALIASES[initialLast(sofaName)] || ALIASES[norm(sofaName)];
  if (aliasKey) {
    candidates.unshift(aliasKey, initialLast(aliasKey), lastToken(aliasKey));
  }
  for (const c of candidates) {
    if (c && apiByKey[c]) return apiByKey[c];
  }
  return null;
}

// ---- principal ----
// sofaPlayers: [{ name, team, pos:'GK|DEF|MID|ATT', number, age, mv }]
//   (extraído do endpoint players da SofaScore — pos já mapeada e mv em unidades)
// apiResponse: array cru da API-Football (response) com os 2 times juntos,
//   OU já separado por time. Aqui esperamos o array bruto de players da API.
// Retorna sofaPlayers com { price, priceSource:'v5'|'v4' } preenchidos.
// v7: multiplicadores que corrigem o viés de POSIÇÃO do valor de mercado.
// O mercado (Transfermarkt) precifica por revenda: ATT>MID>DEF>GK. No fantasy
// todas as posições pontuam igual, então escalamos o mv pra mesma régua.
// GK usa 3.0 (não os ~3.9 que igualariam de fato) pra ficar UM POUCO abaixo.
const POS_MV_MULT = { GK: 3.0, DEF: 1.36, MID: 0.81, ATT: 1.00 };

function computeHybrid(sofaPlayers, apiResponse) {
  // 1) roda o PREÇO-POR-ENGINE na resposta da API e indexa por chaves de nome.
  // (pontos esperados na nossa engine — justo entre posições, reflete o que o
  //  jogador realmente pontua no jogo, não um rating genérico).
  const apiPriced = computePricesEngine(apiResponse || []);
  // apiPriced tem { name, pos, price, ep, min, goals, assists }
  const apiByKey = {};
  apiPriced.forEach((p, i) => {
    const raw = (apiResponse[i] && apiResponse[i].player && apiResponse[i].player.name) || p.name;
    p.clubMeta = apiResponse[i] && apiResponse[i].clubMeta ? apiResponse[i].clubMeta : null;
    [norm(raw), initialLast(raw), lastToken(raw)].forEach(k => {
      if (k && !(k in apiByKey)) apiByKey[k] = p; // 1ª ocorrência vence
    });
  });

  // 2) separa quem casou (tem desempenho na API) de quem não casou (estreante)
  const matched = [];
  const unmatched = [];
  for (const sp of sofaPlayers) {
    const hit = matchApi(sp.name, apiByKey);
    if (hit && hit.price != null && hit.min > 0) {
      sp._apiPrice = hit.price;
      sp._min = hit.min;
      sp._clubMeta = hit.clubMeta || null;
      matched.push(sp);
    } else {
      unmatched.push(sp);
    }
  }

  // preço-âncora pelo valor de mercado, com CORREÇÃO DE IDADE bidirecional.
  // O valor de mercado (ajustado por idade e posição) é o melhor termômetro da
  // QUALIDADE REAL do jogador — captura o craque que a amostra curta de uma
  // temporada não mostra (ex: Lamine, 19a, melhor do mundo, mas poucos jogos).
  // - Jovem (<=23): mercado SOBE 15% (o pico está à frente; mv já é alto).
  // - Veterano (>29): mercado sobe ~6%/ano (teto +60%) para desfazer a deflação
  //   por idade que a SofaScore aplica (resgata o veterano consagrado, ex: Salah).
  // CURVA DE IDADE (multiplicador por idade individual, RAMPA forte):
  // corrige o viés do mercado, que infla jovem (potencial) e subvaloriza veterano.
  // jovem DESCE (mv inflado), pico 25-27 neutro, veterano SOBE (resgate do consagrado).
  const CURVA_IDADE = {
    16:0.35, 17:0.38, 18:0.42, 19:0.47, 20:0.53, 21:0.60, 22:0.69, 23:0.80,
    24:0.92, 25:1.00, 26:1.00, 27:1.00, 28:1.12, 29:1.35,
    30:1.70, 31:2.10, 32:2.55, 33:3.05, 34:3.55, 35:4.05, 36:4.55,
    37:5.00, 38:5.40, 39:5.75, 40:6.00
  };
  function multIdade(age){
    if(!age) return 1;
    if(age < 16) return 0.35;
    if(age > 40) return 6.00;
    return CURVA_IDADE[age] || 1;
  }
  // v6.7: para jovens, o desconto de idade é ATENUADO se o mv já é alto. Um prodígio
  // (ex: Yamal 215M aos 19) vale tanto JUSTAMENTE por ser jovem — o mercado já validou
  // o talento. Penalizar com ×0.47 dupla-conta. A atenuação devolve parte do desconto
  // proporcional ao mv: jovem comum (mv baixo) quase não muda; prodígio recupera quase tudo.
  function multIdadeMv(age, mv){
    const base = multIdade(age);
    if(base >= 1) return base;                 // só atenua descontos (jovens < 25a)
    const validacao = Math.min(0.7, Math.pow((mv||0)/200e6, 0.7) * 0.7);
    return base + (1 - base) * validacao;
  }
  function precoMercado(sp){
    // v7: TETO único pra todas as posições. O equilíbrio de posição agora é feito
    // ESCALANDO o mv (POS_MV_MULT), não pelo teto. Goleiro fica um degrau abaixo
    // porque seu multiplicador (3.0) não chega ao que igualaria de fato (~3.9).
    const top = 42;
    let mv = sp.mv || 0;
    // v7: corrige o VIÉS DE POSIÇÃO do mercado. No Transfermarkt GK<DEF<MID<ATT por
    // valor de revenda; no fantasy todas pontuam igual. Escala o mv de cada posição
    // pra mesma régua (GK propositalmente um pouco abaixo).
    mv = mv * (POS_MV_MULT[sp.pos] || 1);
    mv = mv * multIdadeMv(sp.age || 0, sp.mv || 0);
    // v6.4: peso da LIGA DE CLUBE escala o mv (liga forte = mv vale cheio; fraca = desconto)
    const clubLw = (sp.clubLw != null ? sp.clubLw : 1);
    mv = mv * clubLw;
    // v6.5: curva de mercado sem saturação precoce. Antes: sqrt(mv/80M) saturava aos 80M
    // (Mbappé 191M = jogador de 80M). Agora: (mv/250M)^0.62 — mv alto descola de verdade.
    const q = Math.min(1, Math.pow(mv / 250e6, 0.62));
    return Math.round(3 + (top - 3) * q);
  }

  // 3) MIX para os que casaram. Base: 40% mercado(idade/pos) + 60% desempenho.
  // PORÉM o peso do desempenho depende da CONFIANÇA (minutos jogados): com poucos
  // minutos, o desempenho-por-engine é instável (ex: nota alta em 22 min vira
  // preço-teto, injusto), então o MERCADO pesa mais e segura o preço num patamar
  // realista. Com volume de minutos, vale o desempenho. Isso resolve de uma vez:
  //  - amostra pequena (Elliot 22min não dispara pro teto);
  //  - craque que jogou pouco (Marmoush/Salah sustentados pelo mercado do City);
  //  - quem jogou muito e rendeu (Wood) vale o desempenho cheio.
  // v6.10: peso do mercado depende de DUAS coisas:
  //  (a) confiança no desempenho (minutos jogados) — quem jogou pouco é ancorado no mv;
  //  (b) o próprio valor de mercado — craque caro (mv alto) é avaliação madura e confiável,
  //      então o mv manda quase tudo (95%); jogador de mv baixo deixa o desempenho diferenciar (68%).
  // Isso corrige BONS-BARATOS (craque que rendeu pouco na seleção não é derrubado pelo desempenho).
  const W_BASE_LO = 0.68;   // peso de mercado para mv baixo (<=10M) com volume de minutos
  const W_BASE_HI = 0.95;   // peso de mercado para mv alto (>=60M)
  const W_MERC_POUCO = 0.92; // peso de mercado quando jogou pouquíssimo (qualquer mv)
  // trava anti-RUIM-CARO: o desempenho de seleção pode somar no máximo MARGEM acima do
  // preço de mercado do jogador. Impede que 1-2 amistosos bons inflem quem o mercado diz fraco.
  const MARGEM_DESEMP = 11;
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function wBaseDeMv(mv){
    const lo = 10e6, hi = 60e6;
    if (mv <= lo) return W_BASE_LO;
    if (mv >= hi) return W_BASE_HI;
    return W_BASE_LO + (W_BASE_HI - W_BASE_LO) * ((mv - lo) / (hi - lo));
  }
  function clubMetaFallback(sp){
    return sp._clubMeta || {
      clubMinutes: sp._min || 0,
      clubApps: 0,
      clubLineups: 0,
      clubTeamGames: 0,
      titularRate: 0,
      availRate: 0,
      clubStatus: 'sem_status',
      clubRating: null,
      maybeInjured: false,
    };
  }
  function clubUsageMult(meta, mv){
    const min = meta.clubMinutes || 0;
    const titular = clamp(meta.titularRate || 0, 0, 1);
    const avail = clamp(meta.availRate || 0, 0, 1);
    const volume = clamp(Math.sqrt(min / 1200), 0, 1);
    let mult = 0.86 + titular * 0.13 + avail * 0.07;
    if(meta.clubStatus === 'titular') mult += 0.04;
    else if(meta.clubStatus === 'rodizio') mult -= 0.03;
    else if(meta.clubStatus === 'reserva') mult -= 0.12;
    else if(meta.clubStatus === 'ausente') mult -= 0.18;
    if(meta.maybeInjured) mult -= 0.10;
    if(min < 180) mult -= 0.10;
    else if(min < 450) mult -= 0.05;
    const floor = mv >= 80e6 ? 0.82 : (mv >= 35e6 ? 0.76 : 0.66);
    return clamp(1 + (mult - 1) * (0.45 + 0.55 * volume), floor, 1.12);
  }
  function clubFormAdj(meta){
    const rating = meta.clubRating;
    if(rating == null || !isFinite(rating)) return 0;
    const minConf = clamp(Math.sqrt((meta.clubMinutes || 0) / 900), 0, 1);
    const roleConf = clamp(((meta.titularRate || 0) * 0.65) + ((meta.availRate || 0) * 0.35), 0.25, 1);
    return clamp((rating - 6.75) * 3.4, -3.0, 4.0) * minConf * roleConf;
  }
  function clubLowUsageCap(meta, pMercado, mv){
    const min = meta.clubMinutes || 0;
    const avail = meta.availRate || 0;
    if(min < 120 || avail < 0.15) return Math.max(8, Math.min(pMercado + 1, mv >= 80e6 ? 28 : 18));
    if(min < 300 || avail < 0.30) return Math.max(10, Math.min(pMercado + 3, mv >= 80e6 ? 32 : 22));
    return null;
  }
  for (const sp of matched) {
    const pDesempenho = sp._apiPrice;
    const meta = clubMetaFallback(sp);
    const pMercadoBruto = precoMercado(sp);
    const pMercado = pMercadoBruto * clubUsageMult(meta, sp.mv || 0);
    // confiança 0..1. Como agora a fonte é temporada de CLUBE, a régua é maior:
    // 900 min (~10 jogos) = amostra confiável; abaixo disso o mercado segura mais.
    const conf = Math.max(0, Math.min(1, (meta.clubMinutes || sp._min || 0) / 900));
    // peso-base do mercado conforme o mv (craque caro -> mercado manda mais)
    const wBase = wBaseDeMv(sp.mv || 0);
    // peso do mercado decresce conforme a confiança no desempenho cresce
    const wMerc = W_MERC_POUCO + (wBase - W_MERC_POUCO) * conf;
    let preco = wMerc * pMercado + (1 - wMerc) * pDesempenho;
    preco += clubFormAdj(meta);
    // trava: desempenho não pode empurrar o preço muito acima do mercado do jogador
    const tetoDesemp = pMercado + MARGEM_DESEMP;
    if (preco > tetoDesemp) preco = tetoDesemp;
    const capUso = clubLowUsageCap(meta, pMercadoBruto, sp.mv || 0);
    if (capUso != null && preco > capUso) preco = capUso;
    sp.price = Math.round(preco);
    sp.priceSource = 'v5';
    sp.priceMeta = {
      clubMinutes: meta.clubMinutes || sp._min || 0,
      clubStatus: meta.clubStatus || 'sem_status',
      titularRate: meta.titularRate || 0,
      availRate: meta.availRate || 0,
      clubRating: meta.clubRating,
    };
    delete sp._apiPrice; delete sp._min; delete sp._clubMeta;
  }

  // 4) fallback (valor de mercado) para os estreantes/sem histórico.
  // IMPORTANTE: não usar a v4 com z-score (ela infla num grupo pequeno isolado).
  // Ancorar no valor de mercado ABSOLUTO via curva raiz, com teto por posição e
  // um teto extra baixo: quem não tem nenhum jogo registrado é reserva.
  if (unmatched.length) {
    const PMIN = 3;
    const PMAX = { GK: 42, DEF: 42, MID: 42, ATT: 42 }; // v7: teto único (equilíbrio via mv)
    const CAP_SEM_JOGO = 18;
    for (const sp of unmatched) {
      const top = PMAX[sp.pos] || 35;
      let mv = sp.mv || 0;
      mv = mv * (POS_MV_MULT[sp.pos] || 1);            // v7: corrige viés de posição
      mv = mv * (sp.clubLw != null ? sp.clubLw : 1); // v6.4: peso liga de clube
      const q = Math.min(1, Math.pow(mv / 250e6, 0.62)); // v6.5: curva sem saturação precoce
      let price = Math.round(PMIN + (top - PMIN) * q);
      if (price > CAP_SEM_JOGO) price = CAP_SEM_JOGO;
      if (price < PMIN) price = PMIN;
      sp.price = price;
      sp.priceSource = 'v4';
    }
  }

  // NOTA: a normalização do dream team para 140 NÃO é feita aqui (esta função
  // roda por TIME). Ela é aplicada ao jogo inteiro via normalizeDream(), depois
  // de juntar os dois times — senão cada time normalizaria pra 140 sozinho e o
  // jogo somado ficaria inflado.
  return sofaPlayers;
}

// Normaliza os preços de um JOGO (os dois times juntos). Objetivo de design:
//  - dream team ~140 antes do ajuste de piso (dificuldade consistente);
//  - teto de linha 35 (craque destacado do jogo pode bater, mas sem disparar);
//  - piso real 3 para o jogador mais barato do confronto;
//  - escala mais aberta: mantém a hierarquia/qualidade, mas evita todo mundo grudado
//    em 18-24 quando o jogo tem elencos parelhos.
// A curva também dilui craque-fantasma (jogador caro por mercado mas com pouquíssimos
// minutos): ele fica no meio do pelotão de caros, não é coroado sozinho no topo.
function normalizeDream(players, alvo) {
  const ALVO = alvo || 140;
  const TETO_LINHA = 35;
  const TETO_GK = 26;
  const PMIN = 3;
  // v6.9: curva FIXA 0.75 — meio-termo entre destaque do craque (0.85 deixava o top
  // bem destacado mas jogos contra fracos ficavam fáceis) e dilema de escolha (0.55-0.60
  // criava muitos caros mas achatava tudo perto demais). 0.75 dá algum destaque ao topo
  // E algum dilema de orçamento.
  const CURVA = 0.85;

  function dreamDe(arr) {
    const bp = { GK: [], DEF: [], MID: [], ATT: [] };
    arr.forEach(p => { if (bp[p.pos]) bp[p.pos].push(Math.round(p._tmp != null ? p._tmp : (p.price || 0))); });
    Object.keys(bp).forEach(k => bp[k].sort((a, b) => b - a));
    const flex = Math.max(bp.DEF[1] || 0, bp.MID[1] || 0, bp.ATT[1] || 0);
    return (bp.GK[0] || 0) + (bp.DEF[0] || 0) + (bp.MID[0] || 0) + (bp.ATT[0] || 0) + flex;
  }

  const linhaPrices = players.filter(p => p.pos !== 'GK' && p.price != null).map(p => p.price);
  const maxLinha = linhaPrices.length ? Math.max(...linhaPrices) : 0;
  if (maxLinha <= 0) return players;

  // 1) aplica a curva (infla o meio), guarda em _tmp
  players.forEach(p => { p._tmp = Math.pow((p.price || 0) / maxLinha, CURVA) * maxLinha; });
  // 2) escala pra cravar o dream em 140
  const dream = dreamDe(players);
  const fator = dream > 0 ? ALVO / dream : 1;
  players.forEach(p => {
    let np = Math.round((p._tmp || 0) * fator);
    const teto = p.pos === 'GK' ? TETO_GK : TETO_LINHA;
    if (np < PMIN) np = PMIN;
    if (np > teto) np = teto;
    p.price = np;
    delete p._tmp;
  });

  // 3) ancora o piso real do jogo. Em jogos EQUILIBRADOS o pior jogador fica ~3.
  // Em jogos DESIGUAIS (um time muito mais fraco), há muitos jogadores amontoados
  // baratíssimos (3-4), o que permite "encher o time de graça" e concentrar o
  // orçamento nos craques do favorito — deixando o jogo fácil demais. Por isso o
  // PISO é ADAPTATIVO: quanto mais jogadores baratos amontoados, mais alto o piso
  // (de 3 até ~5), encarecendo o enchimento SEM mexer no topo (craques seguem no teto).
  const finais = players.map(p => p.price).filter(v => v != null);
  const minFinal = finais.length ? Math.min(...finais) : PMIN;
  const maxFinal = finais.length ? Math.max(...finais) : PMIN;
  if (minFinal >= PMIN && maxFinal > minFinal) {
    // mede o "enchimento barato": fração de jogadores no terço inferior de preço.
    const corte = minFinal + (maxFinal - minFinal) * 0.33;
    const fracBaratos = finais.filter(v => v <= corte).length / finais.length;
    // jogo equilibrado ~0.33 dos jogadores no terço de baixo; desigual » 0.5+.
    // piso efetivo: 3 (equilibrado) → até 5 (muito desigual).
    const PISO_EFETIVO = Math.round(PMIN + Math.max(0, Math.min(1, (fracBaratos - 0.40) / 0.30)) * 2);
    const CURVA_PISO = 0.72; // <1 preserva o meio/topo enquanto ancora o pior no piso
    players.forEach(p => {
      const q = ((p.price || 0) - minFinal) / (maxFinal - minFinal);
      p.price = Math.round(PISO_EFETIVO + Math.pow(q, CURVA_PISO) * (maxFinal - PISO_EFETIVO));
    });
  }

  // 4) PATCH 7.2: espalha o miolo da pool.
  // A v7.1 acertou melhor quem merece subir/descer por clube, mas deixava muitos
  // jogadores honestos presos em 10-15. Aqui criamos mais "degraus de decisão"
  // na faixa 16/19 sem baratear craques e sem promover reserva sem minutagem.
  players.forEach(p => {
    const meta = p.priceMeta || {};
    const min = meta.clubMinutes || 0;
    const titular = meta.titularRate || 0;
    const avail = meta.availRate || 0;
    const rating = meta.clubRating;
    const reliable = p.priceSource === 'v5' && min >= 700 && avail >= 0.45;
    const solid = reliable && (titular >= 0.45 || (rating != null && rating >= 6.72));
    const verySolid = reliable && (titular >= 0.62 || (rating != null && rating >= 7.00) || (p.mv || 0) >= 15e6);
    let lift = 0;
    if (p.price >= 11 && p.price <= 13 && solid) lift = 3;
    else if (p.price >= 14 && p.price <= 15 && solid) lift = verySolid ? 2 : 1;
    else if (p.price >= 16 && p.price <= 18 && verySolid) lift = p.price >= 17 ? 2 : 1;
    if (lift) {
      const teto = p.pos === 'GK' ? TETO_GK : TETO_LINHA;
      p.price = Math.max(PMIN, Math.min(teto, p.price + lift));
    }
  });

  // 5) PATCH 7.3: mais jogadores na dezena (10-19).
  // Evita que jogo com favorito forte vire "4 escolhas e acabou o orçamento".
  // Craques continuam caros, mas o alto-medio (20-25) desce quando o jogador
  // nao tem perfil de estrela absoluta.
  players.forEach(p => {
    const meta = p.priceMeta || {};
    const mv = p.mv || 0;
    const rating = meta.clubRating;
    const titular = meta.titularRate || 0;
    const min = meta.clubMinutes || 0;
    const elite =
      p.price >= 30 ||
      mv >= 95e6 ||
      (mv >= 65e6 && rating != null && rating >= 7.20 && titular >= 0.55);
    const estrela =
      elite ||
      mv >= 75e6 ||
      (p.price >= 26 && rating != null && rating >= 7.10 && min >= 1500);
    let drop = 0;
    if (!estrela && p.price >= 25 && p.price <= 29) drop = 3;
    else if (!estrela && p.price >= 23 && p.price <= 24) drop = 3;
    else if (!estrela && p.price >= 21 && p.price <= 22) drop = 2;
    else if (!estrela && p.price === 20) drop = 1;
    if (drop) p.price = Math.max(19, p.price - drop);
  });
  return players;
}



// ─────────── HELPER: parser -> formato API (com nome do time) ───────────
function toResponse(players, teamName) {
  players.forEach(p => (p.statistics || []).forEach(s => { s.team = { name: teamName }; }));
  return { response: players };
}

module.exports = { parseApiFull, toResponse, computePricesEngine, computeHybrid, normalizeDream, aggregate, expectedPointsPer90, B, POS_MULT, LEAGUE_WEIGHT, norm, initialLast, lastToken, clubMultiplier, eloDeClube, eloMult, normClub };
