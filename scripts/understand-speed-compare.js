// node _us/cmp.js baseDir armDir [armDir...]  (each: DIR/s*.json shards from run.sh)  -- prints the gate table
const fs=require('fs'),path=require('path');
const X=require('./lib/extreme-learners');
const mean=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
function load(dir){const m=new Map();for(const f of fs.readdirSync(dir).filter(f=>/^s\d+\.json$/.test(f))){const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));const r=j.results||j;const mode=Object.keys(r)[0];((r[mode]||r).learner_outcomes||[]).forEach((o,i)=>m.set(f.replace('.json','')+':'+i,o));}return m;}
function dd(v){v=v.slice().sort((a,b)=>a-b);const n=v.length;const w=q=>mean(v.slice(0,Math.max(1,Math.ceil(n*q))));return{mean:mean(v),med:v[Math.floor(n/2)],w10:w(.1),w5:w(.05),w1:w(.01),min:v[0]};}
const f=(x,d=2)=>x.toFixed(d);
const B=load(process.argv[2]);
const kindOf=o=>{if(!o.ext_id)return 'ordinary';const [,s,i]=/^x(\d+)-(\d+)$/.exec(o.ext_id);const L=X.learner(+s,+i);return L.kind;};
const bandOf=o=>{if(!o.ext_id)return 'ordinary';const [,s,i]=/^x(\d+)-(\d+)$/.exec(o.ext_id);return X.learner(+s,+i).band;};
for(const dir of process.argv.slice(3)){
 const T=load(dir);const ks=[...B.keys()].filter(k=>T.has(k));
 const rows=ks.map(k=>{const b=B.get(k),t=T.get(k);return{kind:kindOf(b),band:bandOf(b),mph:(t.mastered_k/t.practice_hours)/(b.mastered_k/b.practice_hours),g30:(t.retention30-b.retention30)*100,g7:(t.retention7-b.retention7)*100,hb:b.practice_hours,ht:t.practice_hours,kb:b.mastered_k,kt:t.mastered_k,r30b:b.retention30,r30t:t.retention30,r7b:b.retention7,r7t:t.retention7,t};});
 const m=dd(rows.map(r=>r.mph)),g=dd(rows.map(r=>r.g30));
 console.log(`\n== ${path.basename(dir)} vs ${path.basename(process.argv[2])} (n ${rows.length})`);
 console.log(`understood/hour ratio: mean ${f(m.mean)} med ${f(m.med)} w10 ${f(m.w10)} w5 ${f(m.w5)} w1 ${f(m.w1)} min ${f(m.min)}; below base: ${rows.filter(r=>r.mph<1).length}`);
 console.log(`r30 gain pts: mean ${f(g.mean,1)} med ${f(g.med,1)} w10 ${f(g.w10,1)} min ${f(g.min,1)}; r30 ${f(mean(rows.map(r=>r.r30b))*100,1)}->${f(mean(rows.map(r=>r.r30t))*100,1)}; r7 ${f(mean(rows.map(r=>r.r7b))*100,1)}->${f(mean(rows.map(r=>r.r7t))*100,1)}; hours ${f(mean(rows.map(r=>r.hb)),1)}->${f(mean(rows.map(r=>r.ht)),1)}; understood ${f(mean(rows.map(r=>r.kb)),1)}->${f(mean(rows.map(r=>r.kt)),1)}`);
 for(const key of ['kind','band']){const grp={};rows.forEach(r=>(grp[r[key]]=grp[r[key]]||[]).push(r));console.log(key+': '+Object.entries(grp).map(([k,rs])=>`${k}(${rs.length}) mph ${f(mean(rs.map(r=>r.mph)))}/min ${f(Math.min(...rs.map(r=>r.mph)))} g30 ${f(mean(rs.map(r=>r.g30)),1)}`).join('; '));}
 const dg={};rows.forEach(r=>{for(const [k,v] of Object.entries(r.t))if(k.startsWith('dg_ms_'))dg[k]=(dg[k]||0)+v/rows.length;});
 console.log('hours by role (mean): '+Object.entries(dg).sort().map(([k,v])=>k.slice(6)+' '+f(v,2)).join(', '));
}
