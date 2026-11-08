import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/lib/retiredFields.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function');

test('cleanup removes only the retired field, batches writes, and runs once per session', async () => {
  const docs = Array.from({ length: 402 }, (_, id) => ({ ref: id, data: () => ({
    amount: 5500, workerCount: 5, createdBy: 'creator', paidByUserId: 'payer', status: id % 2 ? 'deleted' : 'active',
  }) }));
  docs.push({ ref: 'clean', data: () => ({ amount: 20 }) });
  const batches = []; let reads = 0;
  const context = vm.createContext({ console: { info() {} },
    getDocs: async () => { reads++; return { docs }; }, transactionsCol: () => 'transactions', getDb: () => 'db',
    deleteField: () => 'DELETE_FIELD', writeBatch: () => {
      const writes = []; batches.push(writes);
      return { update(ref, fields) { writes.push({ ref, fields }); }, commit: async () => {} };
    },
  });
  vm.runInContext(source, context);
  assert.equal(await context.removePaidByFromTransactions(), 402);
  assert.equal(await context.removePaidByFromTransactions(), 402);
  assert.equal(reads, 1); assert.deepEqual(batches.map(b => b.length), [400, 2]);
  for (const write of batches.flat()) {
    assert.deepEqual(Object.keys(write.fields), ['paidByUserId']);
    assert.equal(write.fields.paidByUserId, 'DELETE_FIELD');
  }
  const original = { paidByUserId: 'payer', createdBy: 'creator', amount: 5500 };
  const cleaned = context.withoutPaidBy(original);
  assert.equal(cleaned.createdBy, 'creator'); assert.equal(cleaned.amount, 5500);
  assert.equal(Object.hasOwn(cleaned, 'paidByUserId'), false);
  assert.equal(original.paidByUserId, 'payer');
});
