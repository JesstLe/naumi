'use strict';

// Fault injection for the disposable protocol fixture, not an application hook.
// pg-pool may resolve end() before a physical client's end event. Keep that
// interval observable so teardown must wait for the socket, rather than timing.
const assert = require('node:assert/strict');
const pg = require('pg');
const url = new URL(process.env.DATABASE_URL || '');
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '65298');
assert.equal(url.pathname, '/fleet_protocol_fixture');

const originalEnd = pg.Client.prototype.end;
const delayed = new WeakSet();
let injections = 0;
process.on('exit', code => {
  if (code === 0 && injections === 0) {
    console.error('FLEET_FIXTURE_DELAYED_CLOSE=NOT_EXERCISED');
    process.exitCode = 1;
  }
});
pg.Client.prototype.end = function (callback) {
  const target = this.connectionParameters;
  if (target.host !== '127.0.0.1' || Number(target.port) !== 65298
      || !/^fleet_receipt_compat_[a-f0-9]{32}$/.test(target.database)
      || delayed.has(this)) {
    return originalEnd.call(this, callback);
  }
  delayed.add(this);
  injections++;
  console.log('FLEET_FIXTURE_DELAYED_CLOSE=1 DELAY_MS=200');
  if (typeof callback === 'function') {
    setTimeout(() => originalEnd.call(this, callback), 200);
    return;
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => originalEnd.call(this).then(resolve, reject), 200);
  });
};
