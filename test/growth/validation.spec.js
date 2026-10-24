import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAffiliateApplication, validateAffiliateLink, validatePaymentDetails, validateWithdrawal, validateReferralInput, affiliateErrorStep } from '../../utils/growthValidation.js';

const productId = '11111111-1111-4111-8111-111111111111';
const valid = {
  full_name: ' Sample User ', email: ' SAMPLE@Example.com ', phone: '+91 98765 43210',
  primary_platform: 'Instagram', promotion_strategy: 'I will share honest product reviews and recommendations with my audience.',
  payment_method: 'UPI', upi_id: 'sample@upi', agreed_to_terms: true,
};

test('valid applications normalize contact data and retain explicit consent', () => {
  const result = validateAffiliateApplication({ ...valid, pan_number: 'abcde1234f', estimated_audience: '0' });
  assert.equal(result.valid, true, result.error);
  assert.equal(result.data.full_name, 'Sample User'); assert.equal(result.data.phone, '+919876543210');
  assert.equal(result.data.email, 'sample@example.com'); assert.equal(result.data.pan_number, 'ABCDE1234F');
  assert.equal(result.data.estimated_audience, 0); assert.equal(result.data.agreed_to_terms, true);
});

test('each application step validates its own fields without requiring later steps', () => {
  assert.equal(validateAffiliateApplication(valid, 0).valid, true);
  assert.equal(validateAffiliateApplication({}, 1).errors.primary_platform, 'Primary platform is required');
  assert.equal(validateAffiliateApplication({}, 3).valid, false);
  assert.equal(affiliateErrorStep({ bank_ifsc_code: 'Invalid IFSC' }), 2);
  assert.equal(affiliateErrorStep({ phone: 'Invalid phone', promotion_strategy: 'Too short' }), 0);
});

test('malformed or excessive contact data yields named errors instead of throwing', () => {
  for (const patch of [{ full_name: ' ' }, { full_name: 'x'.repeat(101) }, { phone: 9876543210 }, { phone: '1234' }, { email: 'user@' }, { pan_number: 'INVALID' }, { agreed_to_terms: 'true' }]) {
    const result = validateAffiliateApplication({ ...valid, ...patch });
    assert.equal(result.valid, false); assert.ok(result.errors[Object.keys(patch)[0]]);
  }
  for (const value of [null, [], 'text', 12]) assert.equal(validateAffiliateApplication(value).valid, false);
});

test('audience counts reject decimals, signs, scientific notation, non-finite and DB-overflow values', () => {
  for (const value of ['10.5', '-1', '1e3', Infinity, {}, '2147483648', true]) {
    assert.ok(validateAffiliateApplication({ ...valid, estimated_audience: value }).errors.estimated_audience);
  }
});

test('promotion text, platform, social handles and public URLs are checked', () => {
  for (const patch of [{ promotion_strategy: 'Too short' }, { primary_platform: 'invalid' }, { website_url: 'javascript:alert(1)' }, { website_url: 'https://user:password@example.com' }, { youtube_channel: 'not a url' }, { instagram_handle: 'bad handle!' }]) {
    assert.ok(validateAffiliateApplication({ ...valid, ...patch }).errors[Object.keys(patch)[0]]);
  }
  assert.equal(validateAffiliateApplication({ ...valid, website_url: 'https://example.com', instagram_handle: '@sample.user' }).valid, true);
});

test('selected payment method requires well-formed details and discards unused method fields', () => {
  const bank = { payment_method: 'BANK_TRANSFER', account_holder_name: 'Sample User', bank_account_number: '001234567890', bank_ifsc_code: 'hdfc0001234', upi_id: 'unused@upi' };
  const result = validatePaymentDetails(bank);
  assert.equal(result.valid, true); assert.equal(result.data.bank_ifsc_code, 'HDFC0001234');
  assert.equal(result.data.bank_account_number, '001234567890'); assert.equal('upi_id' in result.data, false);
  for (const patch of [{ bank_ifsc_code: 'INVALID' }, { bank_account_number: '123ABC' }, { account_holder_name: '' }]) assert.equal(validatePaymentDetails({ ...bank, ...patch }).valid, false);
  assert.equal(validatePaymentDetails({ payment_method: 'CASH' }).valid, false);
  for (const upi_id of ['', 'sample', 'sample@', '@upi', {}]) assert.equal(validatePaymentDetails({ payment_method: 'UPI', upi_id }).valid, false);
});

test('link generation accepts supported destinations and rejects malformed identifiers and query values', () => {
  assert.equal(validateAffiliateLink({ destination_type: 'PRODUCT', product_id: productId }).valid, true);
  assert.equal(validateAffiliateLink({ destination_type: 'GENERAL' }).data.destination_type, 'HOMEPAGE');
  assert.equal(validateAffiliateLink({ destination_type: 'HOMEPAGE', product_id: 'irrelevant' }).data.product_id, undefined);
  for (const body of [{ destination_type: 'PRODUCT', product_id: 'bad' }, { destination_type: 'CATEGORY' }, { destination_type: 'SEARCH', search_query: ' ' }, { destination_type: 'HOMEPAGE', sub_id: {} }, { destination_type: 'OTHER' }]) assert.equal(validateAffiliateLink(body).valid, false);
});

test('withdrawals reject invalid money and enforce client limits without forgiving partial parsing', () => {
  const payment = { payment_method: 'UPI', upi_id: 'sample@upi' };
  for (const amount of ['100abc', '1e3', '0x100', '1.001', Infinity, NaN, -1, 0, {}, true]) assert.ok(validateWithdrawal({ ...payment, amount }).errors.amount);
  assert.ok(validateWithdrawal({ ...payment, amount: '99.99' }, { minimum: 100 }).errors.amount);
  assert.ok(validateWithdrawal({ ...payment, amount: '100.01' }, { balance: 100 }).errors.amount);
  assert.equal(validateWithdrawal({ ...payment, amount: '100.50' }, { minimum: 100, balance: 200 }).data.amount, 100.5);
});

test('referral codes normalize safely and reject objects, whitespace, and oversized codes', () => {
  assert.equal(validateReferralInput(' test12345 ').data.referral_code, 'TEST12345');
  for (const value of [null, {}, [], 'a', 'TEST CODE', 'X'.repeat(51)]) assert.equal(validateReferralInput(value).valid, false);
});
