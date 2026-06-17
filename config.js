const SUPABASE_URL = "https://opyegiugrwdfgzxehakd.supabase.co";
const SUPABASE_KEY = "sb_publishable_iNKuDBbIx5_PHD3_VnMhKg_aAZkFSql";

const SUPA = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  ready(){ return this.url.indexOf("supabase.co")>0 && this.key.length>15; },
  headers(){ return {
    "apikey": this.key,
    "Authorization": "Bearer "+this.key,
    "Content-Type": "application/json",
  };},
};
