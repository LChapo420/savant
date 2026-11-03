const fs=require('fs'); const r=require('./resolved09.json');
const keys=process.argv.slice(2);
(async()=>{
 for(const k of keys){const o=r[k]; if(!o||o.abstract) continue;
  for(const url of [`https://api.semanticscholar.org/graph/v1/paper/DOI:${o.doi}?fields=abstract,title`,`https://api.crossref.org/works/${encodeURIComponent(o.doi)}`,`https://api.openalex.org/works?search=${encodeURIComponent(o.title)}&per-page=3`]){
   try{const res=await fetch(url,{headers:{'User-Agent':'savant-evidence-audit (mailto:savant-audit@example.invalid)'}}); if(!res.ok){console.log(k,res.status,url.slice(8,30));await new Promise(s=>setTimeout(s,3000));continue;} const j=await res.json();
    let a=j.abstract||(j.message&&j.message.abstract)||'';
    if(!a&&j.results){const h=j.results.find(x=>x.doi&&x.doi.toLowerCase().includes(o.doi)&&x.abstract_inverted_index)||j.results.find(x=>x.abstract_inverted_index&&(x.display_name||'').toLowerCase().slice(0,30)===o.title.toLowerCase().slice(0,30)); if(h){const w=[];for(const [t,ps] of Object.entries(h.abstract_inverted_index))for(const p of ps)w[p]=t;a=w.join(' ');}}
    a=String(a).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); if(a){o.abstract=a;o.abstract_from='fill:'+url.slice(8,28);console.log('FILLED',k,a.length);break;}
   }catch(e){console.log(k,'err',e.message);}
   await new Promise(s=>setTimeout(s,2500));
  }
  if(!o.abstract)console.log('still none',k);
 }
 fs.writeFileSync('resolved09.json',JSON.stringify(r,null,1));
})();
