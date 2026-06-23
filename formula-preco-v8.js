// ============================================================
// FÓRMULA DE PREÇO v8 — HÍBRIDA (preço-base v7 + desempenho real na Copa)
// ------------------------------------------------------------
// NÃO substitui a v7. A v7 continua intacta como fallback.
// A v8 parte do preço da v7 e o ajusta rodada a rodada conforme o
// desempenho do jogador nos jogos JÁ APURADOS da Copa.
//
// Princípio anti-circular: o preço reflete o desempenho ESPERADO na
// PRÓXIMA partida (usando a Copa como evidência), não premia o passado.
// Quanto mais jogos o jogador acumula, mais a Copa pesa sobre a base v7
// (shrinkage / "puxão para a média"): com 1 jogo o preço ~= v7; com
// muitos jogos o preço é dominado pelo desempenho real.
//
// USO:
//   const V8 = require('./formula-preco-v8.js');
//   const novoPreco = V8.priceV8({
//     basePrice,   // preço atual do jogador pela v7 (3..35). Se faltar, usa fallback por posição.
//     pos,         // 'GK'|'DEF'|'MID'|'ATT'
//     copaPts,     // array de pontuações do jogador nos jogos da Copa já apurados
//   });
//
// Ou em lote, direto sobre os arquivos games (ver applyV8ToGames mais abaixo,
// fora deste módulo, no script de build).
// ============================================================

// Pontuação média ESPERADA por posição (calibrada da distribuição real da Copa,
// engine balanceado). É a "âncora" do desvio: jogar nessa média não muda o preço.
const POS_BASELINE = { GK: 6.8, DEF: 6.1, MID: 6.7, ATT: 6.3 };

// Preço-base de fallback por posição, caso o jogador não tenha preço v7.
const POS_BASEPRICE = { GK: 11, DEF: 12, MID: 13, ATT: 13 };

// Limites da escala (mantém as 100 moedas do time).
const PRICE_MIN = 3;
const PRICE_MAX = 35;

// Sensibilidade: quantas moedas o preço se move por ponto/jogo de desvio
// sustentado (com confiança plena). Calibrável.
const COINS_PER_POINT = 1.15;

// Confiança em função do nº de jogos: shrinkage bayesiano simples.
// conf = n / (n + K). K=2 => 1 jogo=0.33, 2=0.50, 3=0.60, 5=0.71, 8=0.80.
const SHRINK_K = 2;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function mean(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Confiança [0..1] dado o nº de jogos.
function confidence(n) {
  if (!n || n <= 0) return 0;
  return n / (n + SHRINK_K);
}

// Núcleo: calcula o preço v8 de um jogador.
function priceV8({ basePrice, pos, copaPts }) {
  pos = (pos || 'MID').toUpperCase();
  const baseline = POS_BASELINE[pos] != null ? POS_BASELINE[pos] : POS_BASELINE.MID;
  let base = basePrice;
  if (base == null || isNaN(base)) base = POS_BASEPRICE[pos] != null ? POS_BASEPRICE[pos] : 12;

  const n = copaPts ? copaPts.length : 0;
  const m = mean(copaPts);

  // Sem dados de Copa: mantém o preço-base v7 inalterado.
  if (n === 0 || m == null) {
    return { price: clamp(Math.round(base), PRICE_MIN, PRICE_MAX), base, n, conf: 0, adj: 0 };
  }

  // Desvio do desempenho frente ao esperado para a posição.
  const desvio = m - baseline;            // +: acima da média; -: abaixo
  const conf = confidence(n);             // amostra pequena => ajuste suave
  const adj = desvio * COINS_PER_POINT * conf;

  const price = clamp(Math.round(base + adj), PRICE_MIN, PRICE_MAX);
  return { price, base, n, conf: +conf.toFixed(2), adj: +adj.toFixed(1), mediaCopa: +m.toFixed(1) };
}

module.exports = {
  priceV8,
  POS_BASELINE, POS_BASEPRICE, PRICE_MIN, PRICE_MAX, COINS_PER_POINT, SHRINK_K,
  confidence, mean,
};
