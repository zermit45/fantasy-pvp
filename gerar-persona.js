// ============================================================
// GERAR-PERSONA.js — recria persona-map.json a partir da base-2.0
// Estilo = DESEMPENHO REAL (stats por 90). Método: afinidade por z-score
// (cada jogador compete nas dimensões de cada persona da sua posição),
// com viés calibrado pra bater a distribuição-alvo por posição.
// GK: paredao(volume normal) · voador(saves/90 no topo) · goleiro_linha(passe)
// USO: node gerar-persona.js [--write]
// ============================================================
'use strict';
const fs=require('fs'), path=require('path'), P=(...a)=>path.join(__dirname,...a);
const norm=s=>!s?'':s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[._\-']/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const BU=JSON.parse(fs.readFileSync(P('base-unificada-2.0'),'utf8')).jogadores;
const POSCAT={Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Attacker:'ATT'};

const ALVO={
  GK:{paredao:0.34, goleiro_linha:0.33, voador:0.33},
  DEF:{zagueiro_artista:0.34, muro:0.33, torre:0.33},
  MID:{maestro:0.34, volante:0.33, motor:0.33},
  ATT:{armador_avancado:0.34, matador:0.33, veloz:0.33},
};

function p90(j){const m=j.minutes||0;if(m<1)return null;const k=90/m;return{
  g:(j.goals||0)*k,a:(j.assists||0)*k,kp:(j.keyPasses||0)*k,pass:(j.passesTotal||0)*k,
  tkl:(j.tackles||0)*k,int:(j.interceptions||0)*k,blk:(j.blocks||0)*k,drb:(j.dribbleSucc||0)*k,
  dw:(j.duelsWon||0)*k,sav:(j.saves||0)*k,pen:(j.penSaved||0),sh:(j.shotsTotal||0)*k,m};}

const rows=[];
for(const j of BU){const pos=POSCAT[j.pos];if(!pos)continue;const s=p90(j);if(!s)continue;rows.push({pos,j,s});}

// z-score por posição
function mkStats(pos,sel){const arr=rows.filter(r=>r.pos===pos).map(sel);const m=arr.reduce((a,b)=>a+b,0)/(arr.length||1);const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/(arr.length||1))||1;return{m,sd};}
const Z={};
for(const pos of ['GK','DEF','MID','ATT']){
  Z[pos]={
    def:mkStats(pos,r=>r.s.tkl+r.s.int), kp:mkStats(pos,r=>r.s.kp), asi:mkStats(pos,r=>r.s.a),
    drb:mkStats(pos,r=>r.s.drb), gol:mkStats(pos,r=>r.s.g), aer:mkStats(pos,r=>r.s.dw),
    pass:mkStats(pos,r=>r.s.pass), sav:mkStats(pos,r=>r.s.sav), blk:mkStats(pos,r=>r.s.blk),
    sh:mkStats(pos,r=>r.s.sh||0),
  };
}
const z=(pos,met,v)=>(v-Z[pos][met].m)/Z[pos][met].sd;

// afinidades por persona (combinação de z-scores). B = viés calibrado.
function afins(pos,s,B){
  if(pos==='GK'){
    const zsav=z('GK','sav',s.sav), zpass=z('GK','pass',s.pass);
    return {
      voador:  1.0*zsav + (B.voador||0),                 // muitas defesas/90 (top vira voador via viés)
      goleiro_linha: 1.0*zpass - 0.5*zsav + (B.goleiro_linha||0),
      paredao: 0.3*zsav - 0.2*zpass + (B.paredao||0),     // padrão
    };
  }
  if(pos==='DEF'){
    const zdef=z('DEF','def',s.tkl+s.int), zaer=z('DEF','aer',s.dw), zblk=z('DEF','blk',s.blk),
          zkp=z('DEF','kp',s.kp), zdrb=z('DEF','drb',s.drb), zas=z('DEF','asi',s.a);
    return {
      muro: 1.0*zdef + 0.4*zblk - 0.4*zkp + (B.muro||0),
      torre: 1.0*zaer + 0.5*zblk - 0.3*zdrb + (B.torre||0),
      zagueiro_artista: 1.0*zkp + 0.8*zas + 0.7*zdrb - 0.5*zdef + (B.zagueiro_artista||0),
    };
  }
  if(pos==='MID'){
    const zdef=z('MID','def',s.tkl+s.int), zkp=z('MID','kp',s.kp), zas=z('MID','asi',s.a),
          zdrb=z('MID','drb',s.drb), zg=z('MID','gol',s.g);
    return {
      volante: 1.3*zdef - 0.35*zkp - 0.25*zas - 0.3*zdrb + (B.volante||0),
      maestro: 1.1*zkp + 0.9*zas - 0.7*zdef - 0.5*zdrb + (B.maestro||0),
      motor:   1.0*zdrb + 0.7*zg + 0.35*zas + 0.15*zdef - 0.4*zkp + (B.motor||0),
    };
  }
  // ATT
  const zg=z('ATT','gol',s.g), zsh=z('ATT','sh',s.sh||0), zdrb=z('ATT','drb',s.drb),
        zkp=z('ATT','kp',s.kp), zas=z('ATT','asi',s.a);
  return {
    matador: 1.1*zg + 0.4*z('ATT','gol',s.g) - 0.3*zkp + (B.matador||0),
    veloz: 1.2*zdrb - 0.3*zkp + (B.veloz||0),
    armador_avancado: 1.0*zkp + 0.9*zas - 0.4*zg + (B.armador_avancado||0),
  };
}
function classify(pos,s,B){const a=afins(pos,s,B);let best=null,bv=-1e9;for(const k in a)if(a[k]>bv){bv=a[k];best=k;}return best;}

// atribui por COTAS diretas: garante exatamente ALVO% em cada persona por posição.
// método: cada jogador tem um vetor de afinidades; atribuímos gulosamente respeitando as cotas,
// processando primeiro quem tem preferência mais "decidida" (maior gap entre 1ª e 2ª persona).
function assignByQuota(){
  for(const pos of ['GK','DEF','MID','ATT']){
    const rs=rows.filter(r=>r.pos===pos);
    const N=rs.length;
    const cap={}; let soma=0;
    const pers=Object.keys(ALVO[pos]);
    pers.forEach((p,i)=>{cap[p]=Math.round(N*ALVO[pos][p]); soma+=cap[p];});
    // ajuste de arredondamento na primeira persona
    cap[pers[0]] += (N - soma);
    // afinidade de cada jogador (sem viés)
    rs.forEach(r=>{r.af=afins(pos,r.s,{});});
    // ordena personas por afinidade pra cada jogador; gap = decisão
    rs.forEach(r=>{
      const arr=pers.map(p=>[p,r.af[p]]).sort((a,b)=>b[1]-a[1]);
      r.rank=arr.map(x=>x[0]);        // ordem de preferência
      r.gap=arr[0][1]-arr[1][1];      // quão decidido
    });
    // processa quem é mais "decidido" primeiro (gap alto), pra não forçar casos claros
    rs.sort((a,b)=>b.gap-a.gap);
    const usados={}; pers.forEach(p=>usados[p]=0);
    for(const r of rs){
      let posto=null;
      for(const p of r.rank){ if(usados[p]<cap[p]){posto=p;break;} }
      if(!posto){ // todas as cotas cheias (resto): pega a de maior afinidade
        posto=r.rank[0];
      }
      r.persona=posto; usados[posto]++;
    }
  }
}

function main(){
  const write=process.argv.includes('--write');
  assignByQuota();
  const PART={van:1,von:1,de:1,del:1,der:1,den:1,di:1,da:1,dos:1,das:1,do:1,mac:1,mc:1,la:1,le:1,el:1,al:1,bin:1,ben:1,ter:1,st:1};
  function variants(name){const nn=norm(name),parts=nn.split(' ').filter(Boolean),out=[nn];
    if(parts.length>=2){let sur=parts[parts.length-1];
      if(PART[parts[parts.length-2]])sur=parts[parts.length-2]+' '+sur;
      if(parts.length>=3&&PART[parts[parts.length-3]])sur=parts[parts.length-3]+' '+sur;
      out.push(parts[0][0]+' '+sur,parts[0]+' '+sur,sur);}
    return [...new Set(out)];}
  const MAP={};
  for(const r of rows){for(const nm of [r.j.fullName,r.j.name]){if(!nm)continue;
    for(const v of variants(nm)){const key=v+'|'+r.pos;if(!(key in MAP))MAP[key]=r.persona;}}}
  const cnt={},tot={};rows.forEach(r=>{cnt[r.pos+'|'+r.persona]=(cnt[r.pos+'|'+r.persona]||0)+1;tot[r.pos]=(tot[r.pos]||0)+1;});
  console.log('DISTRIBUIÇÃO (alvo):');
  for(const pos of ['GK','DEF','MID','ATT']){console.log(' '+pos+' ('+tot[pos]+'):');
    for(const per in ALVO[pos]){const fr=(cnt[pos+'|'+per]||0)/tot[pos];
      console.log('   '+per.padEnd(18)+(100*fr).toFixed(0)+'% (alvo '+(100*ALVO[pos][per]).toFixed(0)+'%)');}}
  console.log('\ntotal de chaves: '+Object.keys(MAP).length);
  const target=write?P('persona-map.json'):P('persona-map.NEW.json');
  fs.writeFileSync(target,JSON.stringify(MAP));
  console.log('Escrito: '+path.basename(target));
}
main();
