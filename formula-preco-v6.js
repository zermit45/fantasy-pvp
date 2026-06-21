// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  FANTASY PvP — FÓRMULA DE PREÇO OFICIAL  ·  VERSÃO 6.0  (2026-06-21)        ║
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
//   • CONFIANÇA POR MINUTOS: quem jogou pouquíssimo tem desempenho instável;
//     o peso do mercado sobe (até 88%) pra não deixar nota de 13 min virar teto.
//   • NORMALIZAÇÃO POR JOGO: cada partida é um mundo fechado. CURVA 0.85 (<1)
//     deixa a BASE CARA (muita gente 22-35, poucos baratos) — difícil "encher
//     o time de bons". Dream team ~140; teto de linha 35; GK 22 (escala só 1).
//
// ─── PARÂMETROS (v6.0) ───────────────────────────────────────────────────────
//   W_MERC_BASE   = 0.60   peso do mercado com volume de minutos
//   W_MERC_POUCO  = 0.88   peso do mercado com pouquíssimos minutos
//   CONF_MIN      = 270    minutos (≈3 jogos) p/ confiança plena no desempenho
//   CURVA         = 0.85   <1 infla o meio (base cara); =1 linear; >1 comprime
//   DREAM_ALVO    = 140    soma do dream team (GK+DEF+MID+ATT+FLEX)
//   TETO_LINHA    = 35     teto de DEF/MID/ATT
//   TETO_GK       = 22     teto do goleiro (menor: força escolher 1)
//
// ─── HISTÓRICO ───────────────────────────────────────────────────────────────
//   v5   rating normalizado + produção + peso de liga
//   v6.0 preço-por-engine + mercado 60% + confiança + curva 0.85 + dream 140
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

// peso de liga (mesma tabela da v5; liga fraca rende menos "nível")
const LEAGUE_WEIGHT = {
  1: 0.92, 2: 0.95, 3: 0.85, 10: 0.8, 29: 0.74, 30: 0.74, 31: 0.78, 32: 0.82,
  33: 0.82, 34: 0.74, 39: 1, 61: 0.9, 71: 0.76, 78: 0.94, 88: 0.78, 94: 0.78,
  128: 0.72, 135: 0.95, 140: 0.97, 144: 0.75, 179: 0.68, 197: 0.65, 203: 0.74,
  218: 0.62, 253: 0.7, 307: 0.7,
};
const LEAGUE_WEIGHT_DEFAULT = 0.6;
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
function computeHybrid(sofaPlayers, apiResponse) {
  // 1) roda o PREÇO-POR-ENGINE na resposta da API e indexa por chaves de nome.
  // (pontos esperados na nossa engine — justo entre posições, reflete o que o
  //  jogador realmente pontua no jogo, não um rating genérico).
  const apiPriced = computePricesEngine(apiResponse || []);
  // apiPriced tem { name, pos, price, ep, min, goals, assists }
  const apiByKey = {};
  apiPriced.forEach((p, i) => {
    const raw = (apiResponse[i] && apiResponse[i].player && apiResponse[i].player.name) || p.name;
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
  function precoMercado(sp){
    const top = ({ GK: 26, DEF: 42, MID: 42, ATT: 42 })[sp.pos] || 42;
    let mv = sp.mv || 0;
    const age = sp.age || 0;
    if (age <= 23) mv = mv * 1.15;
    else if (age > 29) mv = mv * Math.min(1.6, 1 + (age - 29) * 0.06);
    const q = Math.min(1, Math.sqrt(mv / 80e6));
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
  const W_MERC_BASE = 0.60;   // peso de mercado quando há volume de minutos
  const W_MERC_POUCO = 0.88;  // peso de mercado quando jogou pouquíssimo
  for (const sp of matched) {
    const pDesempenho = sp._apiPrice;
    const pMercado = precoMercado(sp);
    // confiança 0..1 (plena a partir de ~270 min = 3 jogos)
    const conf = Math.max(0, Math.min(1, sp._min / 270));
    // peso do mercado decresce conforme a confiança no desempenho cresce
    const wMerc = W_MERC_POUCO + (W_MERC_BASE - W_MERC_POUCO) * conf;
    sp.price = Math.round(wMerc * pMercado + (1 - wMerc) * pDesempenho);
    sp.priceSource = 'v5';
    delete sp._apiPrice; delete sp._min;
  }

  // 4) fallback (valor de mercado) para os estreantes/sem histórico.
  // IMPORTANTE: não usar a v4 com z-score (ela infla num grupo pequeno isolado).
  // Ancorar no valor de mercado ABSOLUTO via curva raiz, com teto por posição e
  // um teto extra baixo: quem não tem nenhum jogo registrado é reserva.
  if (unmatched.length) {
    const PMIN = 3;
    const PMAX = { GK: 26, DEF: 42, MID: 42, ATT: 42 };
    const CAP_SEM_JOGO = 18;
    for (const sp of unmatched) {
      const top = PMAX[sp.pos] || 35;
      const mv = sp.mv || 0;
      const q = Math.min(1, Math.sqrt(mv / 80e6)); // 80M ~ topo absoluto
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
//  - dream team ~140 (dificuldade consistente);
//  - teto de linha 35 (craque destacado do jogo pode bater, mas sem disparar);
//  - BASE CARA: muitos jogadores na faixa 22-35 e poucos baratos, pra ser difícil
//    "encher o time de bons" — você é forçado a aceitar alguns fracos. Isso se faz
//    com CURVA < 1 (infla o meio: puxa medianos pra cima, deixa poucos lá embaixo).
//  - GK teto menor (22): você escala só 1 GK por jogo, força a escolha.
// A curva também dilui craque-fantasma (jogador caro por mercado mas com pouquíssimos
// minutos): ele fica no meio do pelotão de caros, não é coroado sozinho no topo.
function normalizeDream(players, alvo) {
  const ALVO = alvo || 140;
  const TETO_LINHA = 35;
  const TETO_GK = 22;
  const CURVA = 0.85;   // <1 = base cara (mais gente na faixa alta)
  const PMIN = 3;

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
  return players;
}



// ─────────── HELPER: parser -> formato API (com nome do time) ───────────
function toResponse(players, teamName) {
  players.forEach(p => (p.statistics || []).forEach(s => { s.team = { name: teamName }; }));
  return { response: players };
}

module.exports = { parseApiFull, toResponse, computePricesEngine, computeHybrid, normalizeDream, aggregate, expectedPointsPer90, B, POS_MULT, LEAGUE_WEIGHT, norm, initialLast, lastToken };
