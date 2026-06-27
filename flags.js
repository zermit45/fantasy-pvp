// ============================================================
// FLAGS — bandeira por emoji a partir do código do país (3 letras).
// Sem arquivos de imagem: usa emoji nativo (🇧🇷🇳🇱🇯🇵).
// Uso: flagOf("BIH") -> "🇧🇦"  |  window.flagOf
//
// CLUBES (Brasileirão): quando o código é de um clube com escudo cadastrado
// em window.crestOf(code) (definido em fotos-brasileirao.js), flagOf devolve
// uma <img> do escudo no lugar do emoji. Como flaggedName e flagsOf chamam
// flagOf internamente, os escudos aparecem em TODOS os lugares onde antes
// só havia bandeira de país.
// ============================================================
(function(){
"use strict";
// código de 3 letras (usado nos jogos) -> código ISO de 2 letras (base do emoji)
var ISO3to2 = {
  ALG:"DZ", DZA:"DZ",            // Argélia
  ARG:"AR",                       // Argentina
  AUS:"AU",                       // Austrália
  AUT:"AT",                       // Áustria
  BEL:"BE",                       // Bélgica
  BIH:"BA",                       // Bósnia e Herzegovina
  BRA:"BR",                       // Brasil
  CAN:"CA",                       // Canadá
  CHE:"CH", SUI:"CH",            // Suíça
  CIV:"CI",                       // Costa do Marfim
  COD:"CD",                       // Congo (RD)
  COL:"CO",                       // Colômbia
  CPV:"CV",                       // Cabo Verde
  CRO:"HR",                       // Croácia
  CUW:"CW",                       // Curaçao
  CZE:"CZ",                       // Tchéquia
  DEU:"DE", GER:"DE",            // Alemanha
  ECU:"EC",                       // Equador
  EGY:"EG",                       // Egito
  ENG:"GB-ENG",                   // Inglaterra (tratado abaixo)
  ESP:"ES",                       // Espanha
  FRA:"FR",                       // França
  GHA:"GH",                       // Gana
  HAI:"HT", HTI:"HT",            // Haiti
  IRN:"IR",                       // Irã
  IRQ:"IQ",                       // Iraque
  JOR:"JO",                       // Jordânia
  JPN:"JP",                       // Japão
  KOR:"KR",                       // Coreia do Sul
  KSA:"SA", SAU:"SA",            // Arábia Saudita
  MAR:"MA",                       // Marrocos
  MEX:"MX",                       // México
  NED:"NL", NLD:"NL",            // Holanda
  NOR:"NO",                       // Noruega
  NZL:"NZ",                       // Nova Zelândia
  PAN:"PA",                       // Panamá
  PAR:"PY", PRY:"PY",            // Paraguai
  POR:"PT",                       // Portugal
  QAT:"QA",                       // Catar
  RSA:"ZA", ZAF:"ZA",            // África do Sul
  SCO:"GB-SCT",                   // Escócia (tratado abaixo)
  SEN:"SN",                       // Senegal
  SWE:"SE",                       // Suécia
  TUN:"TN",                       // Tunísia
  TUR:"TR",                       // Turquia
  URU:"UY", URY:"UY",            // Uruguai
  USA:"US",                       // EUA
  UZB:"UZ"                        // Uzbequistão
};
// países sem emoji de bandeira nacional (Inglaterra/Escócia são sub-regiões do GB):
// usam emoji especial de subdivisão quando suportado; senão caem no fallback.
var SUBFLAG = {
  "GB-ENG":"\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F", // 🏴󠁧󠁢󠁥󠁮󠁧󠁿
  "GB-SCT":"\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F"  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿
};
// converte 2 letras (AR) em emoji de bandeira (🇦🇷), via Regional Indicator Symbols
function iso2toEmoji(cc){
  if(cc.length!==2)return "";
  var A=0x1F1E6, base="A".charCodeAt(0);
  return String.fromCodePoint(A+(cc.charCodeAt(0)-base)) + String.fromCodePoint(A+(cc.charCodeAt(1)-base));
}

// escudo de clube como <img>, quando houver crestOf(code). Pequeno, alinhado ao
// texto, com o mesmo "espírito" visual do emoji de bandeira.
function clubCrestImg(code){
  try{
    if(typeof window.crestOf !== "function") return "";
    var url = window.crestOf(code);
    if(!url) return "";
    return '<img src="'+url+'" alt="'+code+'" class="club-crest" '
         + 'style="height:1.05em;width:1.05em;object-fit:contain;vertical-align:-0.18em;border-radius:3px" '
         + 'loading="lazy" decoding="async" '
         + 'onerror="this.style.display=\'none\'">';
  }catch(e){ return ""; }
}

// API principal: code de 3 letras -> emoji OU <img> de escudo (string vazia se desconhecido)
window.flagOf = function(code){
  if(!code) return "";
  var c = String(code).toUpperCase().trim();
  // 1) clube com escudo cadastrado? usa o escudo
  var crest = clubCrestImg(c);
  if(crest) return crest;
  // 2) país: emoji de bandeira
  var iso = ISO3to2[c];
  if(!iso) return "";
  if(SUBFLAG[iso]) return SUBFLAG[iso];
  return iso2toEmoji(iso);
};
// monta o nome do confronto com bandeiras/escudos: "Casa 🇧🇦 × 🇶🇦 Fora".
// roomId -> usa o prepool do jogo pra achar os codes. Se não achar, usa fallbackName.
window.flaggedName = function(roomId, fallbackName){
  try{
    var g = window.GAMES && window.GAMES.data ? window.GAMES.data[roomId] : null;
    if(g && g.prepool && g.prepool.home && g.prepool.away){
      var h=g.prepool.home, a=g.prepool.away;
      var hf=window.flagOf(h.code), af=window.flagOf(a.code);
      return (h.name||"") + (hf?" "+hf:"") + " × " + (af?af+" ":"") + (a.name||"");
    }
  }catch(e){}
  return fallbackName||"";
};

// retorna partes do confronto pra montar cards: bandeiras/escudos, nomes e codes.
window.flagsOf = function(roomId){
  try{
    var g = window.GAMES && window.GAMES.data ? window.GAMES.data[roomId] : null;
    if(g && g.prepool && g.prepool.home && g.prepool.away){
      var h=g.prepool.home, a=g.prepool.away;
      return {hf:window.flagOf(h.code), af:window.flagOf(a.code), hn:h.name||"", an:a.name||"", hc:h.code||"", ac:a.code||""};
    }
  }catch(e){}
  return {hf:"",af:"",hn:"",an:"",hc:"",ac:""};
};
})();
