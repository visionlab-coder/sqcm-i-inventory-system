const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { requestContext, requestLogger, auditTrace } = require('../../src/observability');

test('요청 ID는 안전한 수신 값을 보존하고 응답·감사 추적에 연결한다', () => {
  const req = { get: () => 'test-request-123', ip: '127.0.0.1' };
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  requestContext(req, res, () => {});
  assert.equal(req.id, 'test-request-123');
  assert.equal(headers['x-request-id'], 'test-request-123');
  assert.deepEqual(auditTrace(req), { requestId: 'test-request-123', ip: '127.0.0.1' });
});
test('구조화 요청 로그는 경로·상태·지연·사용자만 JSON으로 남긴다', () => {
  const req = { id: 'request-123', startedAt: process.hrtime.bigint(), method: 'GET', path: '/api/items', user: { id: 7 } };
  const res = new EventEmitter();
  res.statusCode = 200;
  let line;
  requestLogger({ log: value => { line = value; } })(req, res, () => {});
  res.emit('finish');
  const event = JSON.parse(line);
  assert.equal(event.event, 'http_request');
  assert.equal(event.requestId, 'request-123');
  assert.equal(event.userId, 7);
  assert.equal(event.path, '/api/items');
  assert.equal('password' in event, false);
});
