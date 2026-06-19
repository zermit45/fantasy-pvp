// ============================================================
// CAPTURAR "BOLA PARADA" e "CHUTE DE FORA" no scraping
// (pra ativar os arquétipos Especialista de Bola Parada e Canhão)
// ============================================================
// Esses dois arquétipos dependem de 2 campos POR JOGADOR no objeto do jogo:
//   setPieceGoals : nº de gols de falta/escanteio/jogada ensaiada
//   longGoals     : nº de gols de fora da área
//
// Os dois saem do SHOTMAP do SofaScore. Para cada chute que é gol
// (shotType === "goal"), olhe:
//   - s.situation        → "free-kick" | "corner" | "set-piece" = bola parada
//   - s.playerCoordinates.x → distância do gol; x > 18 ≈ fora da área
//     (a grande área vai até ~17 nas coordenadas do SofaScore, campo 0..100)
//
// IMPORTANTE: pule os gols-contra (ownGoal) — eles não creditam o jogador.

// Exemplo de como acumular por jogador (id = id local do jogador no seu catálogo):
function captureSetPieceAndLong(shotmap, ownGoalTimes, findId){
  const setPieceGoalsByPid = {};
  const longGoalsByPid = {};
  for (const s of shotmap) {
    if (s.shotType !== "goal") continue;
    if (ownGoalTimes.has(s.time)) continue;          // ignora gol-contra
    const pid = findId(s.player.name);
    if (pid == null) continue;

    const sit = s.situation || "";
    if (sit === "free-kick" || sit === "corner" || sit === "set-piece") {
      setPieceGoalsByPid[pid] = (setPieceGoalsByPid[pid] || 0) + 1;
    }
    const x = s.playerCoordinates && s.playerCoordinates.x;
    if (typeof x === "number" && x > 18) {
      longGoalsByPid[pid] = (longGoalsByPid[pid] || 0) + 1;
    }
  }
  return { setPieceGoalsByPid, longGoalsByPid };
}

// Depois, ao montar o objeto de cada jogador, inclua:
//   setPieceGoals: setPieceGoalsByPid[pid] || 0,
//   longGoals:     longGoalsByPid[pid]     || 0,
//
// Pronto: os arquétipos "Especialista de Bola Parada" e "Canhão" passam a ativar.

module.exports = { captureSetPieceAndLong };
