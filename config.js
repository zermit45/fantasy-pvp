// ============================================================
// CONFIG — cole aqui as chaves do seu projeto Supabase
// ============================================================
// Onde achar: Supabase > seu projeto > Settings > API
//   SUPABASE_URL  = "Project URL"
//   SUPABASE_KEY  = "anon public" key
// ============================================================

const SUPABASE_URL = "COLE_SUA_PROJECT_URL_AQUI";
const SUPABASE_KEY = "COLE_SUA_ANON_KEY_AQUI";

// Não precisa mexer daqui pra baixo.
const SUPA = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  ready(){ return !this.url.startsWith("COLE_") && !this.key.startsWith("COLE_"); },
  headers(){ return {
    "apikey": this.key,
    "Authorization": "Bearer "+this.key,
    "Content-Type": "application/json",
  };},
};
