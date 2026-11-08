import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/components/workerPaymentForm.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');

async function form(existingTx, overrides = {}, missingGroup = false) {
  const writes = [], elements = new Map();
  let dialog, submit;
  const data = {
    workers: missingGroup ? [] : [{ id: 'team', name: 'Concrete workers', isActive: true }],
    accounts: [{ id: 'cash', name: 'Cash', isActive: !existingTx }],
    categories: [{ id: 'labor', name: 'Labour' }],
    phases: [{ id: 'roof', name: 'Roof', isActive: !existingTx }],
  };
  const values = { 'wpay-worker': 'team', 'wpay-amount': '5500', 'wpay-count': '',
    'wpay-description': '', 'wpay-date': '2026-11-08', 'wpay-account': 'cash', 'wpay-phase': 'roof', ...overrides };
  const body = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: values[selector.slice(1)] ?? '', classList: { remove() {} },
      addEventListener(event, fn) { if (event === 'submit') submit = fn; },
    });
    return elements.get(selector);
  } };
  const context = vm.createContext({
    console, Number, Timestamp: { now: () => 'now' },
    workersCol: () => 'workers', accountsCol: () => 'accounts', categoriesCol: () => 'categories', phasesCol: () => 'phases',
    transactionsCol: () => 'transactions', transactionDoc: id => id,
    getDocs: async name => ({ docs: data[name].map(item => ({ id: item.id, data: () => item })) }),
    addDoc: async (col, payload) => { writes.push({ col, payload }); return { id: 'new' }; },
    updateWithAudit: async (id, type, before, payload) => writes.push({ id, before, payload }),
    writeAudit: async () => {}, currentActor: () => ({ uid: 'admin' }),
    t: key => key, getLocale: () => 'en', toast() {},
    toDateInputValue: () => '2026-11-08', dateInputToTimestamp: value => value,
    escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    openDialog: options => { dialog = options; options.onMount(body, () => {}); },
  });
  vm.runInContext(source, context);
  await context.openWorkerPaymentForm(undefined, existingTx);
  return { dialog, writes, elements, save: () => submit({ preventDefault() {} }) };
}

test('blank optional fields save one group expense with the total amount', async () => {
  const f = await form(); await f.save();
  assert.equal(f.writes.length, 1);
  const p = f.writes[0].payload;
  assert.equal(p.amount, 5500); assert.equal(p.workerCount, null);
  assert.equal(p.description, null); assert.equal(p.workerId, 'team'); assert.equal(p.type, 'expense');
});

test('count is metadata, not an amount multiplier; descriptions are saved', async () => {
  const f = await form(undefined, { 'wpay-count': '5', 'wpay-description': 'Roof concrete\nFive people' });
  await f.save(); const p = f.writes[0].payload;
  assert.equal(p.amount, 5500); assert.equal(p.workerCount, 5);
  assert.equal(p.description, 'Roof concrete\nFive people');
});

for (const count of ['0', '-1', '2.5', 'abc', 'Infinity', '9007199254740992']) {
  test(`rejects invalid count ${count}`, async () => {
    const f = await form(undefined, { 'wpay-count': count }); await f.save(); assert.equal(f.writes.length, 0);
  });
}

test('old payment can be enriched in place without creating another expense', async () => {
  const old = { id: 'old', workerId: 'team', accountId: 'cash', phaseId: 'roof', amount: 5500,
    description: 'Original <description>', version: 2 };
  const f = await form(old, { 'wpay-count': '5', 'wpay-description': 'Updated work details' });
  assert.match(f.dialog.bodyHtml, /Original &lt;description&gt;/);
  assert.match(f.dialog.bodyHtml, /value="cash" selected/);
  assert.match(f.dialog.bodyHtml, /value="roof" selected/);
  assert.match(f.dialog.bodyHtml, /id="wpay-count"[^>]*value=""/);
  await f.save(); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].id, 'old'); assert.equal(f.writes[0].payload.version, 3);
  assert.equal(f.writes[0].payload.workerCount, 5); assert.equal(f.writes[0].payload.amount, 5500);
});

test('existing metadata can be cleared and deleted groups do not block editing', async () => {
  const f = await form({ id: 'old', workerId: 'team', workerName: 'Old team', workerCount: 5, description: 'Old', amount: 5500 }, {}, true);
  await f.save(); assert.equal(f.writes[0].payload.workerCount, null);
  assert.equal(f.writes[0].payload.description, null);
});
