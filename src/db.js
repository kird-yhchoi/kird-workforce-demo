'use strict';
require('dotenv').config();
const {Pool}=require('pg');
const {assertSafeDemoEnvironment}=require('./demo-safety');
assertSafeDemoEnvironment();
const useURL=Boolean(process.env.DATABASE_URL);
const pool=new Pool(useURL
  ? {connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000}
  : {host:process.env.PGHOST||'127.0.0.1',port:Number(process.env.PGPORT||5432),
     database:process.env.PGDATABASE,user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD||'',
     max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
module.exports={pool};
