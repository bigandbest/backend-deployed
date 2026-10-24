import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let writes = [];
mock.module('../../config/prisma.js', { defaultExport: {} });
mock.module('../../services/referralService.js', { namedExports: {
  requestWithdrawal: async (...args) => { writes.push(args); return { id: 'withdrawal1' }; },
} });
mock.module('../../services/membershipService.js', { namedExports: {} });
const { requestWithdrawal } = await import('../../controller/referralController.js');
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

test('withdrawal endpoint rejects malformed money and payment details before wallet mutations', async () => {
  writes = [];
  for (const body of [
    { amount: '100abc', payment_method: 'UPI', upi_id: 'sample@upi' },
    { amount: '100', payment_method: 'CASH' },
    { amount: 100, payment_method: 'UPI', upi_id: 'invalid' },
    { amount: '100.001', payment_method: 'UPI', upi_id: 'sample@upi' },
    { amount: 100, payment_method: 'BANK_TRANSFER', bank_account_number: '1234567890', bank_ifsc_code: 'wrong', account_holder_name: 'Sample User' },
  ]) {
    const res = response(); await requestWithdrawal({ user: { id: 'user1' }, body }, res);
    assert.equal(res.statusCode, 400); assert.ok(res.body.fields);
  }
  assert.equal(writes.length, 0);
});

test('withdrawal endpoint forwards normalized bank details and exact numeric amount to wallet service', async () => {
  writes = [];
  const res = response();
  await requestWithdrawal({ user: { id: 'user1' }, body: {
    amount: '100.50', payment_method: 'BANK_TRANSFER', bank_account_number: '001234567890',
    bank_ifsc_code: 'hdfc0001234', account_holder_name: ' Sample User ',
  } }, res);
  assert.equal(res.statusCode, 200); assert.equal(writes.length, 1);
  assert.equal(writes[0][1], 100.5); assert.equal(writes[0][3].bank_ifsc_code, 'HDFC0001234');
  assert.equal(writes[0][3].bank_account_number, '001234567890');
  assert.equal(writes[0][3].account_holder_name, 'Sample User');
});
