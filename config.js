// ============================================================
// CONFIG — chaves do Supabase (JÁ PREENCHIDO)
// ============================================================
// Se algum dia precisar trocar:
//   SUPABASE_URL  = Project URL (Settings > API), SEM /rest/v1 no final
//   SUPABASE_KEY  = chave "publishable" / anon (pode ser pública)
// ============================================================

const SUPABASE_URL = "https://opyegiugrwdfgzxehakd.supabase.co";
const SUPABASE_KEY = "sb_publishable_iNKuDBbIx5_PHD3_VnMhKg_aAZkFSql";

// Não precisa mexer daqui pra baixo.
const SUPA = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  ready(){ return !this.url.startsWith("COLE_") && !this.key.startsWith("COLE_") && this.url.length>10 && this.key.length>10; },
  headers(){ return {
    "apikey": this.key,
    "Authorization": "Bearer "+this.key,
    "Content-Type": "application/json",
  };},
};
