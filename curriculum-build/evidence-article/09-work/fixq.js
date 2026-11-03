const fs=require('fs');let s=fs.readFileSync('add09.js','utf8');
const a="${J.also_used_already_in_base + (J.sources.length - fresh.length)} more that the section cites";
if(!s.includes(a))throw new Error('x');
s=s.replace(a,"${J.sources.length + J.also_used_already_in_base - fresh.length} more that the section cites");
fs.writeFileSync('add09.js',s);
