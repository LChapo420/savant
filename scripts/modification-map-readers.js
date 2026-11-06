#!/usr/bin/env node
/** Which computed spec fields have a reader in services or routes, and which levers have a sentence (docs/MODIFICATION-MAP.md section 2). Reads the code, no model. */
const path=require('path');const fs=require('fs');const root=require('path').join(__dirname,'..');process.chdir(root);
const ls=require('../services/learning-spec');
const spec=ls.buildSpecFrom({metrics:{}});
function paths(o,p){let out=[];for(const[k,v]of Object.entries(o||{})){const q=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))out.push(...paths(v,q));else out.push(q)}return out}
const skip=/^(levers|provenance|depth|learning|version|ownerBase|isDefault)/;
const fields=paths(spec).filter(p=>!skip.test(p));
const files=[];function walk(d){for(const f of fs.readdirSync(d)){const fp=path.join(d,f);if(fs.statSync(fp).isDirectory())walk(fp);else if(f.endsWith('.js'))files.push(fp)}};walk('services');walk('routes');
const raw=fs.readFileSync('services/learning-spec.js','utf8');
const a=raw.indexOf('function derive('),b=raw.indexOf('function defaultSpec');
const specBody=raw.slice(0,a)+raw.slice(b);
const blob=files.filter(f=>!/learning-spec\.js$/.test(f)).map(f=>[path.basename(f),fs.readFileSync(f,'utf8')]);
const rows=fields.map(f=>{const leaf=f.split('.').pop();const dot='.'+leaf;
 const m=(t)=>{const re=new RegExp('[.]'+leaf+'(?![A-Za-z0-9_])');return re.test(t)};
 return{f,inPrompt:m(specBody),out:blob.filter(([n,t])=>m(t)).map(([n])=>n.replace('.js',''))}});
const dead=rows.filter(r=>!r.inPrompt&&!r.out.length).map(r=>r.f);
console.log('dead',dead);
console.log('PROMPT ONLY (read in specToLines, no code reader)',rows.filter(r=>r.inPrompt&&!r.out.length).length,rows.filter(r=>r.inPrompt&&!r.out.length).map(r=>r.f).join(' '));
console.log('NO PROMPT, code only');for(const r of rows.filter(r=>!r.inPrompt&&r.out.length))console.log(' ',r.f,r.out.slice(0,5).join(','));
console.log('both',rows.filter(r=>r.inPrompt&&r.out.length).length);
