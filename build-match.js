// ============================================================
// FANTASY PvP — BUILDER DE JOGO (SofaScore → formato da engine)
// ------------------------------------------------------------
// Pega os 4 arquivos exportados do SofaScore e monta o "match"
// no formato que o engine.js entende (campos goals, sots, tklint,
// prgp, gk, penMiss, etc.). Depois é só rodar a engine pra pontuar.
//
// OS 4 ARQUIVOS (renomeie como quiser, ajuste os caminhos abaixo):
//   a1.txt → SHOTMAP    (chutes: xG, tipo, situação, coordenadas)
//   b2.txt → STATISTICS (estatísticas gerais do jogo: posse, xG, etc.)
//   c3.txt → INCIDENTS  (lances: gols, assistências, cartões)
//   d4.txt → LINEUPS    (escalações + estatísticas individuais)
//
// COMO USAR:
//   1) Coloque os 4 arquivos numa pasta.
//   2) Ajuste CONFIG abaixo (caminhos + códigos dos times + ELOs).
//   3) node build-match.js  →  gera match.json
//   4) Rode a engine sobre o match.json pra ter a pontuação.
//
// IMPORTANTE: alguns campos do SofaScore são MAPEADOS POR APROXIMAÇÃO
// (marcados com "~aprox" nos comentários). Eles são a melhor tradução
// disponível dos dados, mas se você tiver a regra exata, ajuste ali.
// ============================================================

const fs = require("fs");

// ─────────────────── CONFIG (edite por jogo) ───────────────────
const CONFIG = {
  dir: "./",            // pasta onde estão os 4 arquivos
  files: { shotmap:"a1.txt", statistics:"b2.txt", incidents:"c3.txt", lineups:"d4.txt" },
  homeCode: "ARG",      // sigla do time da casa
  awayCode: "AUT",      // sigla do visitante
  homeElo: 1950,        // força ELO (afeta bônus underdog; chute aproximado serve)
  awayElo: 1750,
  neutral: true,        // copa do mundo = campo neutro (sem mando)
  endMin: 96,           // minuto final (com acréscimos do 2ºT)
  out: "match.json",    // arquivo de saída
};
// ────────────────────────────────────────────────────────────────

const U = CONFIG.dir.endsWith("/") ? CONFIG.dir : CONFIG.dir + "/";
const shotmap   = JSON.parse(fs.readFileSync(U + CONFIG.files.shotmap, "utf8")).shotmap;
const incidents = JSON.parse(fs.readFileSync(U + CONFIG.files.incidents, "utf8")).incidents;
const lineups   = JSON.parse(fs.readFileSync(U + CONFIG.files.lineups, "utf8"));
// statistics (b2) é lido só se você quiser usar team_stats; a engine funciona sem.

const HOME = CONFIG.homeCode, AWAY = CONFIG.awayCode;

// ── timeline de gols (a engine usa pra contexto de placar / clutch) ──
const goals_tl = [];
for (const i of incidents) {
  if (i.incidentType === "goal") goals_tl.push({ m: i.time, t: i.isHome ? HOME : AWAY });
}

// ── shotmap por jogador: gols (com xG), chutes no gol, pênalti perdido,
//    gol de fora da área e gol de bola parada ──
function shotsOf(name) {
  const arr = shotmap.filter(s => s.player && s.player.name === name);
  const goals = [], sots = [];
  let setPieceSot = 0, setPieceGoals = 0, longSot = 0, longGoals = 0, penMiss = 0;
  for (const s of arr) {
    const isGoal   = s.shotType === "goal";
    const onTarget = s.shotType === "goal" || s.shotType === "save"; // foi no gol
    const longRange = s.playerCoordinates && s.playerCoordinates.x <= 35; // ~fora da área
    const setPiece  = s.situation === "set-piece" || s.situation === "free-kick" || s.situation === "corner";
    // PÊNALTI PERDIDO: cobrança de pênalti que não virou gol (fora OU defendida)
    if (s.situation === "penalty" && !isGoal) penMiss++;
    if (isGoal) {
      goals.push({ m: s.time, xg: s.xg || 0.1 });
      if (setPiece)  setPieceGoals++;
      if (longRange) longGoals++;
    } else if (onTarget) {
      sots.push({ m: s.time });
      if (setPiece)  setPieceSot++;
      if (longRange) longSot++;
    }
  }
  return { goals, sots, setPieceSot, setPieceGoals, longSot, longGoals, penMiss };
}

// ── assistências (com xAG) — vêm do incidents (quem deu o passe do gol) ──
function assistsOf(name) {
  const a = [];
  for (const i of incidents) {
    if (i.incidentType === "goal" && i.assist1 && i.assist1.name === name) {
      a.push({ m: i.time, xag: 0.2 }); // ~aprox: arquivo não traz xAG exato; 0.2 é média
    }
  }
  return a;
}

// ── cartões / vermelho — do incidents ──
function cardsOf(name) {
  let yellow = 0, red = null;
  for (const i of incidents) {
    if (i.incidentType === "card" && i.player && i.player.name === name) {
      if (i.incidentClass === "yellow") yellow++;
      else if (i.incidentClass === "red" || i.incidentClass === "yellowRed")
        red = { m: i.time, doubleYellow: i.incidentClass === "yellowRed" };
    }
  }
  return { yellow, red };
}

// ── traduz a posição do SofaScore (G/D/M/F) pra da engine (GK/DEF/MID/ATT) ──
function mapPos(sofaPos) {
  return sofaPos === "G" ? "GK" : sofaPos === "D" ? "DEF" : sofaPos === "F" ? "ATT" : "MID";
}

// ── mapeia UM jogador do lineup pro formato da engine ──
function mapPlayer(pp, teamCode) {
  const st = pp.statistics || {};
  const name = pp.player.name;
  const min = st.minutesPlayed || 0;
  const isGK = pp.player.position === "G";
  const sh = shotsOf(name);
  const cards = cardsOf(name);
  const started = pp.substitute !== true;

  const out = {
    name, team: teamCode, pos: mapPos(pp.player.position), min, started,
    // ── ataque ──
    goals: sh.goals, assists: assistsOf(name), sots: sh.sots,
    setPieceSot: sh.setPieceSot, setPieceGoals: sh.setPieceGoals,
    longSot: sh.longSot, longGoals: sh.longGoals,
    penMiss: Math.max(sh.penMiss, st.penaltyMiss || 0),  // shotmap e stat são o MESMO pênalti — usa o maior, não soma
    dribbles: st.wonContest || 0,                     // dribles certos
    prgp: st.accurateOppositionHalfPasses || 0,       // ~aprox: passes certos no ataque (NÃO totalProgression, que é distância em metros e infla tudo)
    pib: Math.round((st.accurateOppositionHalfPasses || 0) * 0.18), // ~aprox: passes na área
    sca: st.keyPass || 0,                             // ~aprox: criação ~ passes-chave
    gca: st.goalAssist || 0,                          // ~aprox: criação de gol ~ assists
    // ── defesa ──
    tklint: (st.totalTackle || 0) + (st.interceptionWon || 0),
    block: (st.outfielderBlock || 0) + (st.blockedScoringAttempt || 0),
    recovery: st.ballRecovery || 0,
    aerial: st.aerialWon || 0,
    clearance: st.totalClearance || 0,
    // ── disciplina / erros ──
    fouls: st.fouls || 0,
    dribbledPast: st.challengeLost || 0,
    yellow: cards.yellow, red: cards.red,
    errGoal: 0,                                       // SofaScore não marca erro→gol direto
    errShot: st.errorLeadToAShot || 0,
    penCom: st.penaltyConceded || 0,
    ownGoal: 0,                                       // raro; ajuste manual se houver
    // ── passe / posse ──
    accCross: st.accurateCross || 0,
    inaccCross: (st.totalCross || 0) - (st.accurateCross || 0),
    wasFouled: st.wasFouled || 0,
    longBall: st.accurateLongBalls || 0,
    prgCarry: st.progressiveBallCarriesCount || 0,
    dispossessed: st.dispossessed || 0,
    penaltyWon: st.penaltyWon || 0,
  };

  // ── goleiro: bloco gk com defesas (PSxG), gols sofridos, saídas ──
  if (isGK) {
    const conceded = teamCode === HOME
      ? goals_tl.filter(g => g.t === AWAY).length
      : goals_tl.filter(g => g.t === HOME).length;
    // defesas = chutes do adversário marcados como "save" no shotmap (com PSxG = xgot)
    const savesArr = shotmap
      .filter(s => s.shotType === "save" && ((teamCode === HOME && !s.isHome) || (teamCode === AWAY && s.isHome)))
      .map(s => ({ m: s.time, psxg: s.xgot || s.xg || 0.2 }));
    out.gk = {
      saves: savesArr,
      penSave: 0,                       // ajuste manual se houve defesa de pênalti
      opa: 0,                           // saídas (sweeper) — não vem fácil; deixa 0
      crossStop: st.goodHighClaim || 0, // cruzamentos cortados ~ high claims
      conceded,
    };
  }
  return out;
}

// ── monta o objeto match completo ──
const players = {};
let idx = 0;
for (const pp of lineups.home.players) players["h" + idx++] = mapPlayer(pp, HOME);
for (const pp of lineups.away.players) players["a" + idx++] = mapPlayer(pp, AWAY);

const match = {
  homeCode: HOME, awayCode: AWAY,
  homeElo: CONFIG.homeElo, awayElo: CONFIG.awayElo, neutral: CONFIG.neutral,
  endMin: CONFIG.endMin,
  goals_tl, players,
  team_stats: { [HOME]: {}, [AWAY]: {} },
  tactCapV2: true,   // jogo NOVO (usa o teto de tática novo e os pesos BASE atuais)
};

fs.writeFileSync(U + CONFIG.out, JSON.stringify(match, null, 1));
console.log("✓ " + CONFIG.out + " gerado · " + Object.keys(players).length + " jogadores");
console.log("  gols:", JSON.stringify(goals_tl));

// ── BÔNUS: se engine.js estiver na mesma pasta, já pontua e imprime o ranking ──
try {
  const { makeEngine } = require(U + "engine.js");
  const eng = makeEngine(match);
  const rows = [];
  for (const id of Object.keys(players)) {
    const p = players[id];
    if (p.min > 0) rows.push({ ...eng.scorePlayer(p, null, null), nome: p.name, team: p.team, pos: p.pos, min: p.min });
  }
  for (const [team, label] of [[HOME, "CASA"], [AWAY, "VISITANTE"]]) {
    console.log("\n=== " + label + " (" + team + ") ===");
    rows.filter(r => r.team === team).sort((a, b) => b.total - a.total)
      .forEach(r => console.log("  " + String(r.total).padStart(5) + " pts | " + r.pos + " " + r.nome + " (" + r.min + "')"));
  }
} catch (e) {
  console.log("\n(engine.js não encontrado na pasta — só gerei o match.json. Coloque engine.js junto pra pontuar automático.)");
}
