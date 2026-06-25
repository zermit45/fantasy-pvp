// Flags helper gerado para o Fantasy PvP.
window.TEAM_FLAGS = Object.assign({"ENG": "🇬🇧", "CRO": "🇭🇷", "GHA": "🇬🇭", "PAN": "🇵🇦", "UZB": "🇺🇿", "COL": "🇨🇴", "FRA": "🇫🇷", "SEN": "🇸🇳", "BIH": "🇧🇦", "QAT": "🇶🇦", "ESP": "🇪🇸", "KSA": "🇸🇦", "CHE": "🇨🇭", "HTI": "🇭🇹", "HAI": "🇭🇹", "SCO": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "CZE": "🇨🇿", "RSA": "🇿🇦", "BRA": "🇧🇷", "NED": "🇳🇱", "NLD": "🇳🇱", "SWE": "🇸🇪", "TUN": "🇹🇳", "JOR": "🇯🇴", "ALG": "🇩🇿", "TUR": "🇹🇷", "USA": "🇺🇸", "EUA": "🇺🇸", "PAR": "🇵🇾", "PRY": "🇵🇾", "AUS": "🇦🇺", "JPN": "🇯🇵", "MEX": "🇲🇽", "ARG": "🇦🇷", "POR": "🇵🇹", "NOR": "🇳🇴", "ECU": "🇪🇨", "GER": "🇩🇪", "ITA": "🇮🇹", "MAR": "🇲🇦", "BEL": "🇧🇪", "DEN": "🇩🇰", "POL": "🇵🇱", "KOR": "🇰🇷", "IRN": "🇮🇷", "CAN": "🇨🇦", "CMR": "🇨🇲", "CRC": "🇨🇷", "URU": "🇺🇾", "CHI": "🇨🇱", "PER": "🇵🇪", "UKR": "🇺🇦", "AUT": "🇦🇹", "WAL": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "IRE": "🇮🇪", "NGA": "🇳🇬", "EGY": "🇪🇬", "MLI": "🇲🇱", "CIV": "🇨🇮", "CPV": "🇨🇻", "NZL": "🇳🇿", "IRQ": "🇮🇶", "UAE": "🇦🇪", "OMA": "🇴🇲"}, window.TEAM_FLAGS||{});
window.flagOf = function(code){ code=String(code||'').toUpperCase(); return window.TEAM_FLAGS[code] || '🏳️'; };
window.flagsOf = function(roomId){
  try{ var g=window.GAMES&&window.GAMES.data&&window.GAMES.data[roomId]; var pp=g&&g.prepool;
    if(!pp) return {hf:'🏳️',af:'🏳️',hc:'',ac:'',hn:'',an:''};
    return {hf:flagOf(pp.home.code),af:flagOf(pp.away.code),hc:pp.home.code,ac:pp.away.code,hn:pp.home.name,an:pp.away.name};
  }catch(e){ return {hf:'🏳️',af:'🏳️',hc:'',ac:'',hn:'',an:''}; }
};
