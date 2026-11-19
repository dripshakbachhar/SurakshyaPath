'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createStorage,
  LocalJsonStorage,
  ReadOnlyStorage
} = require('../storage/json-storage');
const ImportLimits = require('../public/js/import-limits');

function temporaryStorage(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surakshyapath-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new LocalJsonStorage({ root, ...options });
}

test('local JSON storage reads, writes, and updates isolated files', t => {
  const storage = temporaryStorage(t);
  assert.deepEqual(storage.status(), {
    mode: 'local-json',
    available: true,
    writable: true,
    durable: true,
    reason: null
  });
  assert.equal(storage.read('incidents'), null);
  const first = [{ id: 'one' }];
  storage.write('incidents', first);
  const updated = storage.update('incidents', current => current.concat({ id: 'two' }), []);
  assert.deepEqual(updated, [{ id: 'one' }, { id: 'two' }]);
  assert.deepEqual(storage.read('incidents'), updated);
  assert.deepEqual(fs.readdirSync(storage.root), ['incidents.json']);
});

test('malformed JSON and null stored values are reported instead of replaced', t => {
  const storage = temporaryStorage(t);
  fs.writeFileSync(storage.filePath('incidents'), '{invalid');
  assert.throws(() => storage.read('incidents'), { code: 'STORAGE_INVALID_JSON' });
  fs.writeFileSync(storage.filePath('incidents'), 'null');
  assert.throws(() => storage.read('incidents'), { code: 'STORAGE_INVALID_DATA' });
});

test('failed reads surface an explicit storage error', t => {
  const rootStorage = temporaryStorage(t);
  rootStorage.write('incidents', []);
  const failingFs = Object.create(fs);
  failingFs.readFileSync = () => { throw new Error('read denied'); };
  const storage = new LocalJsonStorage({ root: rootStorage.root, fsImpl: failingFs });
  assert.throws(() => storage.read('incidents'), { code: 'STORAGE_READ_FAILED' });
});

test('failed atomic writes preserve the previous stored value', t => {
  const original = temporaryStorage(t);
  original.write('incidents', [{ id: 'preserved' }]);
  const failingFs = Object.create(fs);
  failingFs.renameSync = () => { throw new Error('disk unavailable'); };
  const storage = new LocalJsonStorage({ root: original.root, fsImpl: failingFs });
  assert.throws(() => storage.write('incidents', [{ id: 'replacement' }]), { code: 'STORAGE_WRITE_FAILED' });
  assert.deepEqual(original.read('incidents'), [{ id: 'preserved' }]);
  assert.deepEqual(fs.readdirSync(original.root), ['incidents.json']);
});

test('failed update callbacks leave the stored value unchanged', t => {
  const storage = temporaryStorage(t);
  storage.write('incidents', [{ id: 'preserved' }]);
  assert.throws(() => storage.update('incidents', () => { throw new Error('update rejected'); }));
  assert.deepEqual(storage.read('incidents'), [{ id: 'preserved' }]);
});

test('separate dataset stores remain intact when incident state changes', t => {
  const storage = temporaryStorage(t);
  const dataset = { name: 'Research import', records: [{ id: 'imported' }] };
  storage.write('incidents', [{ id: 'community' }]);
  storage.write('importedDataset', dataset);
  storage.write('activeMode', { mode: 'imported' });

  storage.update('incidents', current => current.concat({ id: 'new-community' }));

  assert.deepEqual(storage.read('importedDataset'), dataset);
  assert.deepEqual(storage.read('activeMode'), { mode: 'imported' });
  assert.deepEqual(storage.read('incidents'), [{ id: 'community' }, { id: 'new-community' }]);
});

test('deployment without a durable provider selects an unavailable read-only adapter', t => {
  const storage = createStorage({ env: { VERCEL: '1' } });
  assert.ok(storage instanceof ReadOnlyStorage);
  assert.deepEqual(storage.status(), {
    mode: 'read-only',
    available: false,
    writable: false,
    durable: false,
    reason: 'Persistent storage is not configured for this Vercel deployment. Dashboard data is read-only.'
  });
  assert.throws(() => storage.write('incidents', []), { code: 'STORAGE_UNAVAILABLE' });
  assert.throws(() => storage.update('incidents', value => value), { code: 'STORAGE_UNAVAILABLE' });
});

test('import request sizing uses UTF-8 bytes and enforces the request boundary', () => {
  assert.equal(ImportLimits.payloadByteLength('é'), 2);
  assert.equal(ImportLimits.isPayloadWithinLimit('x'.repeat(ImportLimits.MAX_IMPORT_PAYLOAD_BYTES)), true);
  assert.equal(ImportLimits.isPayloadWithinLimit('x'.repeat(ImportLimits.MAX_IMPORT_PAYLOAD_BYTES + 1)), false);
});
