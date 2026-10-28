process.env.NODE_ENV='test'; process.env.DB_FILE=require('path').join(require('os').tmpdir(),`patch-verify-${process.pid}.json`);
const db=require('./config/db');const curriculum=require('./config/curriculum');const coverage=require('./services/coverage');const mastery=require('./services/mastery');const levelEditor=require('./services/level-editor');
const grade=curriculum.getGrade('math','numbers_to_10');const m=coverage.modelFor('math','numbers_to_10');const o=m.objectives[0];
let fails=0;const ok=(l,c,d)=>{console.log((c?'  ok   ':'  FAIL ')+l+(c?'':' '+JSON.stringify(d)));if(!c)fails++;};
function setup(){const u=db.insert('users',{email:`p${Math.random()}@example.test`});const e=db.insert('enrollments',{user_id:u.id,track_id:'math',grade_id:'numbers_to_10',current_level:o.practice[1],status:'active',levels_completed:0});
 const s=db.insert('sessions',{user_id:u.id,enrollment_id:e.id,track_id:'math',grade_id:'numbers_to_10',level:o.lesson_level,kind:'lesson',ended_at:new Date().toISOString()});
 const at=Date.now()-3600000;for(let q=0;q<7;q++)db.insert('items',{session_id:s.id,user_id:u.id,skill_id:o.skill,role:q<3?'check':'focus',level:q<3?o.lesson_level:o.practice[0],choices:['a','b','c','d'],correct:true,ms:8000,answered_at:new Date(at+q*60000).toISOString()});return e;}
delete process.env.ADAPTIVE_TEACHING;
let e=setup();let to=mastery.advance(db.byId('enrollments',e.id),grade);ok('off: advance is +1',to===o.practice[2],to);
process.env.ADAPTIVE_TEACHING='on';e=setup();to=mastery.advance(db.byId('enrollments',e.id),grade);
ok('on: proven objective skips to its first retention level',to===o.retention[0],{to,ret:o.retention});
const e2=db.byId('enrollments',e.id);db.update('enrollments',e2.id,{current_level:o.retention[0]});to=mastery.advance(db.byId('enrollments',e.id),grade);ok('on: retention levels are walked',to===o.retention[1],to);
// prompt lines reach the editor prompt
const ed=require('./services/level-editor');const p=ed.buildEditorPrompt?ed.buildEditorPrompt(e.user_id,{trackId:'math',gradeId:'numbers_to_10',level:m.objectives[1].lesson_level},'none',''):null;
ok('on: the level editor prompt carries the plan and the covers text verbatim',!p||(p.includes('HOW TO TEACH THIS LEVEL')&&p.includes(m.objectives[1].covers)),p&&p.slice(0,200));
console.log(fails?`${fails} FAILED`:'patch verified');process.exit(fails?1:0);
