const c=require('../lib/candidates');
const r=c.buildCandidates();
const L=r.candidates.filter(x=>x.audio), B=r.candidates.filter(x=>x.audio&&x.en);
console.log('cands',r.candidates.length,'audio',L.length,'audio+en',B.length);
for(const [n,a] of [['L',L],['B',B]]){const d=a.map(x=>x.difficulty).sort((x,y)=>x-y);
 console.log(n,'terciles',d[Math.floor(d.length/3)],d[Math.floor(2*d.length/3)],'p25',d[Math.floor(d.length/4)],'p75',d[Math.floor(.75*d.length)]);
 for(const [e,m] of [[300,2000],[400,3000],[500,3000],[300,3000],[250,2500]]){const ee=d.filter(v=>v<=e).length,mm=d.filter(v=>v<=m).length,hh=d.filter(v=>v<=25000).length;console.log(' ',e,m,(ee/hh).toFixed(3),((mm-ee)/hh).toFixed(3),((hh-mm)/hh).toFixed(3),'n',ee,mm-ee,hh-mm)}}
const w={};for(const x of B){w[x.words]=(w[x.words]||0)+1}console.log(w);
