'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const seed=require('../data/initial_staff.json');
const history=require('../data/initial_archive.json');
const permitted=new Set(['data/initial_staff.json','data/initial_archive.json']);
const bad=[];
function walk(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git'].includes(item.name))continue;
    const absolute=path.join(dir,item.name);
    const relative=path.relative(root,absolute).replaceAll(path.sep,'/');
    if(item.isDirectory())walk(absolute);
    else if(relative.startsWith('data/')&&!permitted.has(relative))bad.push('Unexpected data file: '+relative);
    else if(/\.(?:hwp|hwpx|pdf|xlsx|xls|backup|dump|sqlite|db)$/i.test(relative))bad.push('Unexpected data/document file: '+relative);
    else if(['.env','.env.local'].includes(item.name))bad.push('Secrets file must not be uploaded: '+relative);
    else if(/\.(?:js|json|html|md|txt|sql)$/i.test(relative) || relative==='.env.example'){
      const t=fs.readFileSync(absolute,'utf8');
      if(/@kird\.re\.kr/i.test(t))bad.push('Real mail domain: '+relative);
      // Organization names are deliberately kept; real people and contacts must never be included.
    }
  }
}
walk(root);
assert.equal(seed.demo_mode,'contest_synthetic_v1');
assert.equal(history.demo_mode,'contest_synthetic_v1');
assert.equal(seed.staff.length,140);
assert.equal(history.records.length,708);
for(const p of seed.staff){
  if(!/^가상직원\d{3}$/.test(p.name)||!/^staff\d{3}@example\.com$/.test(p.email)||!/^0(42|43)-000-\d{4}$/.test(p.phone))bad.push('Not synthetic employee '+p.id);
  if(!p.note.includes('가상'))bad.push('Employee not marked synthetic '+p.id);
}
for(const p of history.records){
  if(!/^가상직원\d{3}$/.test(p.name) || !p.notes?.[0]?.includes('가상'))bad.push('Not synthetic history '+p.archive_id);
}
if(bad.length){console.error(bad.join('\n'));process.exitCode=1;}else{console.log('PASS: fictional 140 employees and 708 historical rows, KIRD org and task labels, example.com contacts, no secrets or original files');}
