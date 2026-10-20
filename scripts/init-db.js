'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {pool} = require('../src/db');
const base = path.join(__dirname, '..');
const seed = require('../data/initial_staff.json');
const archive = require('../data/initial_archive.json');
const {uniqueNames} = require('../src/validation');

async function run() {
  if (seed.staff.length !== 140 || archive.records.length !== 708) {
    throw new Error('내장 데이터 건수가 기대값과 다릅니다. 초기화를 중단합니다.');
  }
  if (!uniqueNames(seed.staff.map(p => p.id)) || !uniqueNames(archive.records.map(r => r.archive_id))) {
    throw new Error('중복 식별자가 있습니다.');
  }
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(fs.readFileSync(path.join(base, 'src/schema.sql'), 'utf8'));
    const stat = await conn.query('SELECT count(*)::int AS n FROM employees');
    if (stat.rows[0].n !== 0) {
      await conn.query('COMMIT');
      console.log(`이미 직원 ${stat.rows[0].n}명이 등록되어 있습니다. 기존 데이터를 덮어쓰지 않았습니다.`);
      console.log('초기화 명령은 반복 실행해도 기존 명단을 재설정하지 않습니다.');
      return;
    }
    const meta = {...seed}; delete meta.staff;
    const historyMeta = {...archive}; delete historyMeta.records;
    await conn.query('INSERT INTO app_meta (key,payload) VALUES ($1,$2::jsonb)', ['root', JSON.stringify(meta)]);
    await conn.query('INSERT INTO app_meta (key,payload) VALUES ($1,$2::jsonb)', ['archive', JSON.stringify(historyMeta)]);
    const groups = ['원장','운영기획본부','역량개발본부','교육서비스본부','디지털지원센터'];
    const depts = [...groups, ...seed.departments];
    for (const [index, name] of depts.entries()) {
      const parent = name === '원장' ? null : groups.includes(name) ? '원장' : seed.parentMap[name] || null;
      await conn.query('INSERT INTO departments (name,parent_name,sort_index) VALUES ($1,$2,$3)', [name,parent,index]);
    }
    for (const [i,p] of seed.staff.entries()) {
      await conn.query('INSERT INTO employees (id,department,seed_index,payload) VALUES ($1,$2,$3,$4::jsonb)',
        [p.id,p.department,i,JSON.stringify(p)]);
    }
    for (const [i,r] of archive.records.entries()) {
      await conn.query('INSERT INTO historical_snapshots (archive_id,period,name,department,source_index,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
        [r.archive_id,r.period,r.name,r.department,i,JSON.stringify(r)]);
    }
    await conn.query('COMMIT');
    console.log(`DB 초기 등록 완료: 현행 직원 ${seed.staff.length}명, 과거 이력 ${archive.records.length}건`);
    console.log('다음 명령: npm run admin:create');
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {conn.release();}
}
run().catch(err=>{console.error('DB 초기 등록 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
