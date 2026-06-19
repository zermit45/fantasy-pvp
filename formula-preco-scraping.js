// ============================================================
// FÓRMULA DE PREÇO DO FANTASY (v3)  — colar no script de scraping
// ============================================================
// Preço = QUALIDADE RELATIVA do jogador DENTRO da partida.
//
// Como funciona:
//  1) score bruto = curva(valor de mercado) + ajuste de idade
//     - curva = raiz do mv (comprime a cauda: poucos craques valem MUITO)
//     - idade INVERTIDA vs mercado: jovem inflado -> desconto;
//       veterano ainda valorizado -> prêmio (qualidade real)
//  2) dentro de cada POSIÇÃO, calcula média e desvio-padrão do JOGO
//  3) preço vem do z-score (quão acima/abaixo da média dos colegas).
//     Na média -> meio da faixa; destaque sobe, fraco desce.
//
// Resultado:
//  - O melhor NÃO crava o teto: só chega perto se for MUITO destacado.
//  - Orçamento sempre bem usado (jogo forte ou fraco) — escala relativa.
//  - Goleiro tem teto menor (20): você escala só 1 e rende menos.
//
// Use: computePrices(playersDoJogo) -> grava p.price (inteiro) em cada um.

const PMIN = 3;
const PMAX = { GK: 20, DEF: 30, MID: 30, ATT: 30 };

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

function computePrices(players) {
  for (const p of players) p._s = mvCurve(p.mv) + ageAdj(p.age);
  const groups = {};
  for (const p of players) (groups[p.pos] = groups[p.pos] || []).push(p);
  for (const pos in groups) {
    const arr = groups[pos];
    const sc = arr.map(p => p._s);
    const mean = sc.reduce((a, b) => a + b, 0) / sc.length;
    const sd = Math.sqrt(sc.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sc.length) || 1;
    const top = PMAX[pos] || 30;
    const mid = (PMIN + top) / 2;
    for (const p of arr) {
      const z = (p._s - mean) / sd;
      let price = mid + z * ((top - PMIN) / 4);
      p.price = Math.max(PMIN, Math.min(top, Math.round(price)));
    }
  }
  for (const p of players) delete p._s;
  return players;
}

module.exports = { computePrices, mvCurve, ageAdj };
