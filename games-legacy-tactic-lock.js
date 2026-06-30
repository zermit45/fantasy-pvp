// ============================================================
// games-legacy-tactic-lock.js
// Trava o SISTEMA DE TÁTICAS ANTIGO (z-score) nos jogos que já
// foram apurados antes do Modo B. Eles NÃO recalculam.
// Jogos novos (sem estar nesta lista) usam o Modo B automaticamente.
// Gerado em 2026-06-30. Total travado: 54 jogos.
// Carregue este arquivo DEPOIS de todos os games-part no index.html.
// ============================================================
(function(){
  if(!window.GAMES||!window.GAMES.data) return;
  var LEGACY=["alg-aut-2026","arg-dza-2026","atm-mir-2026","aus-tur-2026","bah-bot-2026","bel-egy-2026","bih-qat-2026","can-bih-2026","civ-ecu-2026","cod-uzb-2026","col-por-2026","cpv-ksa-2026","cro-gha-2026","cru-flu-2026","cuw-civ-2026b","cze-mex-2026","deu-cuw-2026","ecu-deu-2026b","egy-irn-2026","esp-cpv-2026","fla-cor-2026","fra-sen-2026","gre-cor-2026","hti-sco-2026","irn-nzl-2026","irq-nor-2026","jor-arg-2026","jpn-swe-2026b","kor-cze-2026","mar-hai-2026","mex-zaf-2026","nld-jpn-2026","nld-mar-2026","nor-fra-2026","nzl-bel-2026","pal-cha-2026","pan-eng-2026","pry-aus-2026b","qat-che-2026","rbb-int-2026","rem-sao-2026","rsa-can-2026","rsa-kor-2026","san-vit-2026","sau-ury-2026","sco-bra-2026","sen-irq-2026","sui-can-2026","swe-tun-2026","tun-nld-2026b","tur-usa-2026","uru-esp-2026","usa-pry-2026","vas-cam-2026"];
  for(var i=0;i<LEGACY.length;i++){
    var d=window.GAMES.data[LEGACY[i]];
    if(d&&d.match){ d.match.tactModeB=false; } // força sistema antigo
  }
})();