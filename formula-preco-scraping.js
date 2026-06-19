// ============================================================
// FÓRMULA DE PREÇO DO FANTASY (v4)  — colar no script de scraping
// ============================================================
// Preço = QUALIDADE do jogador, equilibrada entre os dois times.
//
// MUDANÇA v3 → v4 (equilíbrio entre times):
//   Antes, o preço comparava todos os jogadores da posição de uma vez. Em jogos
//   desequilibrados (ex: Brasil x Haiti), o time forte ficava TODO caro e o fraco
//   TODO barato — você era forçado a misturar ou pegar só os fracos do time grande.
//   Agora o preço é um BLEND:
//     60% = qualidade do jogador DENTRO DO PRÓPRIO TIME (destaque interno)
//     40% = qualidade relativa ao JOGO inteiro (mantém que o time forte é melhor)
//   Resultado: dá pra montar um time de um país só sem pegar só "bagre", mas o
//   craque do time forte ainda custa um pouco mais que o do time fraco.
//
// Como funciona:
//  1) score bruto = curva(valor de mercado) + ajuste de idade
//     - curva = raiz do mv (comprime a cauda: poucos craques valem MUITO)
//     - idade INVERTIDA vs mercado: jovem inflado -> desconto;
//       veterano ainda valorizado -> prêmio (qualidade real)
//  2) z-score POR TIME+POSIÇÃO (zTeam) e z-score POR POSIÇÃO no jogo (zGame)
//  3) z final = 0.6*zTeam + 0.4*zGame  → preço pela faixa da posição
//
//  - Goleiro tem teto menor (20): você escala só 1 e rende menos.
//
// Use: computePrices(playersDoJogo) -> grava p.price (inteiro) em cada um.

const PMIN = 3;
const PMAX = { GK: 20, DEF: 30, MID: 30, ATT: 30 };
const W_TEAM = 0.6; // peso do z-score dentro do próprio time (equilíbrio entre times)

function mvCurve(mv) {
  return Math.sqrt(Math.max(0, (mv || 0) / 1e6));
}

function ageAdj(age) {
  if (!age) return 0;
  let young = age < 24 ? -(24 - age) * 0.45 : 0;
  if (young < -3.6) young = -3.6;
  let old = age > 28 ? Math.min(3.5, (age - 28) * 0.5) : 0;
  return young + old;
}

// z-score de cada jogador dentro de um agrupamento (por uma função de chave)
function zByGroup(players, keyFn) {
  const groups = {};
  for (const p of players) {
    const k = keyFn(p);
    (groups[k] = groups[k] || []).push(p);
  }
  const z = {};
  for (const k in groups) {
    const arr = groups[k];
    const sc = arr.map(p => p._s);
    const mean = sc.reduce((a, b) => a + b, 0) / sc.length;
    const sd = Math.sqrt(sc.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sc.length) || 1;
    for (const p of arr) z[p.id != null ? p.id : p.name] = (p._s - mean) / sd;
  }
  return z;
}

function computePrices(players) {
  for (const p of players) p._s = mvCurve(p.mv) + ageAdj(p.age);
  const idOf = p => (p.id != null ? p.id : p.name);
  const zTeam = zByGroup(players, p => p.team + '|' + p.pos); // dentro do próprio time
  const zGame = zByGroup(players, p => p.pos);                // no jogo inteiro
  for (const p of players) {
    const top = PMAX[p.pos] || 30;
    const mid = (PMIN + top) / 2;
    const z = W_TEAM * zTeam[idOf(p)] + (1 - W_TEAM) * zGame[idOf(p)];
    let price = mid + z * ((top - PMIN) / 4);
    p.price = Math.max(PMIN, Math.min(top, Math.round(price)));
  }
  for (const p of players) delete p._s;
  return players;
}

module.exports = { computePrices, mvCurve, ageAdj, zByGroup };
