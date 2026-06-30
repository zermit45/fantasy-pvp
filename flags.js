// ============================================================
// FLAGS — bandeira por IMAGEM a partir do código do país (3 letras).
// MUDANÇA (PC/Windows): o Windows NÃO renderiza emoji de bandeira de país
// (mostra só as 2 letras "CD", "SN"...). Por isso trocamos o emoji por uma
// <img> de bandeira (flagcdn.com, SVG). Funciona em todo lugar — PC e celular.
// Uso: flagOf("BIH") -> "<img ...bandeira BA...>"  |  window.flagOf
//
// CLUBES (Brasileirão): quando o código é de um clube com escudo cadastrado
// em window.crestOf(code) (definido em fotos-brasileirao.js), flagOf devolve
// uma <img> do escudo no lugar da bandeira. (inalterado)
// ============================================================
(function(){
"use strict";
// código de 3 letras (usado nos jogos) -> código ISO de 2 letras
var ISO3to2 = {
  ALG:"DZ", DZA:"DZ", ARG:"AR", AUS:"AU", AUT:"AT", BEL:"BE", BIH:"BA",
  BRA:"BR", CAN:"CA", CHE:"CH", SUI:"CH", CIV:"CI", COD:"CD", COL:"CO",
  CPV:"CV", CRO:"HR", CUW:"CW", CZE:"CZ", DEU:"DE", GER:"DE", ECU:"EC",
  EGY:"EG", ENG:"GB-ENG", ESP:"ES", FRA:"FR", GHA:"GH", HAI:"HT", HTI:"HT",
  IRN:"IR", IRQ:"IQ", JOR:"JO", JPN:"JP", KOR:"KR", KSA:"SA", SAU:"SA",
  MAR:"MA", MEX:"MX", NED:"NL", NLD:"NL", NOR:"NO", NZL:"NZ", PAN:"PA",
  PAR:"PY", PRY:"PY", POR:"PT", QAT:"QA", RSA:"ZA", ZAF:"ZA", SCO:"GB-SCT",
  SEN:"SN", SWE:"SE", TUN:"TN", TUR:"TR", URU:"UY", URY:"UY", USA:"US", UZB:"UZ"
};
// flagcdn usa códigos minúsculos. Inglaterra/Escócia têm slug próprio.
function cdnSlug(iso2){
  if(iso2==="GB-ENG") return "gb-eng";
  if(iso2==="GB-SCT") return "gb-sct";
  return iso2.toLowerCase();
}
// bandeira de país como <img> (SVG via flagcdn). Mesmo "espírito" visual do emoji.
function countryFlagImg(iso2, code){
  var slug = cdnSlug(iso2);
  var url = "https://flagcdn.com/" + slug + ".svg";
  return '<img src="'+url+'" alt="'+code+'" class="country-flag" '
       + 'style="height:0.95em;width:1.35em;object-fit:cover;vertical-align:-0.12em;border-radius:2px;box-shadow:0 0 0 0.5px rgba(0,0,0,.25)" '
       + 'loading="lazy" decoding="async" '
       + 'onerror="this.replaceWith(document.createTextNode(\''+code+'\'))">';
}

// escudo de clube como <img>, quando houver crestOf(code). (inalterado)
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

// API principal: code de 3 letras -> <img> de escudo OU de bandeira (string vazia se desconhecido)
window.flagOf = function(code){
  if(!code) return "";
  var c = String(code).toUpperCase().trim();
  // 1) clube com escudo cadastrado? usa o escudo
  var crest = clubCrestImg(c);
  if(crest) return crest;
  // 2) país: imagem de bandeira (flagcdn)
  var iso = ISO3to2[c];
  if(!iso) return "";
  return countryFlagImg(iso, c);
};
// monta o nome do confronto com bandeiras/escudos: "Casa 🇧🇦 × 🇶🇦 Fora".
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
