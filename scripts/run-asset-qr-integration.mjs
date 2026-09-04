import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const request = require('supertest');
const { getConfig } = require('../src/config');
const { createPool, initializeDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { loadOperationalAdapters } = require('../src/adapters/loader');

const required = ['DATABASE_URL','SESSION_SECRET','SEED_MANAGER_PASSWORD'];
if(required.some(key=>!process.env[key])) throw new Error('Local integration environment is incomplete.');
process.env.NODE_ENV='development';process.env.DB_AUTO_MIGRATE='false';process.env.DB_RUN_SEEDS='false';process.env.PUBLIC_BASE_URL='http://127.0.0.1:59214';
const config=getConfig();const pool=createPool(config.databaseUrl);let assetId;let sessionId;
try {
  await initializeDatabase(pool,config);const adapters=await loadOperationalAdapters(config,{pool});const app=createApp({pool,config,...adapters});const agent=request.agent(app);
  const csrf=await agent.get('/api/auth/csrf').expect(200);const login=await agent.post('/api/auth/login').send({_csrf:csrf.body.csrfToken,email:'manager@seowon.local',password:config.seedManagerPassword}).expect(200);const token=login.body.csrfToken;
  const sessionCookie=login.headers['set-cookie']?.find(value=>value.startsWith('connect.sid='));
  if(sessionCookie){const encoded=sessionCookie.split(';',1)[0].slice('connect.sid='.length);const decoded=decodeURIComponent(encoded);sessionId=(decoded.startsWith('s:')?decoded.slice(2):decoded).split('.',1)[0];}
  const reference=await agent.get('/api/enterprise/reference').expect(200);const marker=Date.now().toString().slice(-9);
  const created=await agent.post('/api/enterprise/assets').set('idempotency-key',`qr-create-${marker}`).send({_csrf:token,organizationId:login.body.user.organizationId,assetTag:`QR-${marker}`,name:'QR 통합 시험 자산',departmentId:reference.body.departments[0]?.id||null,locationId:reference.body.locations[0]?.id||null,statusCode:'AVAILABLE'}).expect(201);
  const asset=created.body.asset;assetId=asset.id;assert.match(asset.qr_public_id,/^[0-9a-f-]{36}$/i);
  await request(app).get(`/api/enterprise/assets/qr/${asset.qr_public_id}`).expect(401);
  const scanned=await agent.get(`/api/enterprise/assets/qr/${asset.qr_public_id}`).expect('cache-control','no-store').expect(200);assert.equal(scanned.body.asset.id,assetId);
  await agent.get('/api/enterprise/assets/qr/not-a-uuid').expect(400);
  const svg=await agent.get(`/api/enterprise/assets/${assetId}/qr.svg`).buffer(true).parse((response,callback)=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>callback(null,Buffer.concat(chunks)));}).expect('content-type',/image\/svg\+xml/).expect(200);const svgText=Buffer.from(svg.body).toString('utf8');assert.match(svgText,/^<svg/);assert.doesNotMatch(svgText,new RegExp(asset.asset_tag));
  assert.equal((await pool.query("SELECT count(*)::int count FROM audit_logs WHERE action='ASSET_QR_SCANNED' AND entity_id=$1",[String(assetId)])).rows[0].count,1);
  console.log(JSON.stringify({status:'PASS',transport:'supertest-in-process',tests:8,assetCleanup:true}));
} finally {
  if(assetId){await pool.query("DELETE FROM api_idempotency_keys WHERE idempotency_key LIKE 'qr-create-%'");await pool.query("DELETE FROM outbox_events WHERE aggregate_type='ASSET' AND aggregate_id=$1",[String(assetId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(assetId)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);}
  if(sessionId){await pool.query('DELETE FROM user_sessions WHERE sid=$1',[sessionId]);}
  await pool.end();
}
