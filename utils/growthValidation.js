// Pure validation contract mirrored in bbm-app/utils and frontend-deployed/src/utils.
// These deployable projects do not share a runtime package. Keep the copies identical.
export const AFFILIATE_PLATFORMS = ['Instagram', 'YouTube', 'Facebook', 'Twitter/X', 'Website/Blog', 'WhatsApp', 'Other'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const result = (data, errors) => ({ valid: Object.keys(errors).length === 0, data, errors, error: Object.values(errors)[0] || '' });
const blank = value => value == null || value === '';

function reader(input, errors) {
  return (key, label, { required = false, min = 0, max = 255 } = {}) => {
    const raw = input[key];
    if (raw != null && typeof raw !== 'string') { errors[key] = `${label} must be text`; return ''; }
    const value = (raw || '').trim();
    if (required && !value) errors[key] = `${label} is required`;
    else if (value && value.length < min) errors[key] = `${label} must contain at least ${min} characters`;
    else if (value.length > max) errors[key] = `${label} must contain no more than ${max} characters`;
    return value;
  };
}
function checkUrl(value, field, label, errors) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch { errors[field] = `${label} must be a valid http:// or https:// URL`; }
}

export function validatePaymentDetails(value) {
  const input = own(value), errors = {}, data = {}, text = reader(input, errors);
  data.payment_method = input.payment_method;
  if (!['UPI', 'BANK_TRANSFER'].includes(data.payment_method)) errors.payment_method = 'Select UPI or Bank Transfer';
  if (data.payment_method === 'UPI') {
    data.upi_id = text('upi_id', 'UPI ID', { required: true, max: 320 });
    if (data.upi_id && !/^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/i.test(data.upi_id)) errors.upi_id = 'Enter a valid UPI ID, such as yourname@upi';
  } else if (data.payment_method === 'BANK_TRANSFER') {
    data.bank_name = text('bank_name', 'Bank name', { max: 100 });
    data.account_holder_name = text('account_holder_name', 'Account holder name', { required: true, min: 2, max: 100 });
    data.bank_account_number = text('bank_account_number', 'Account number', { required: true, max: 20 });
    if (data.bank_account_number && !/^\d{6,20}$/.test(data.bank_account_number)) errors.bank_account_number = 'Account number must contain 6–20 digits';
    data.bank_ifsc_code = text('bank_ifsc_code', 'IFSC code', { required: true, max: 11 }).toUpperCase();
    if (data.bank_ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.bank_ifsc_code)) errors.bank_ifsc_code = 'Enter a valid 11-character IFSC code';
  }
  return result(data, errors);
}

export function affiliateErrorStep(errors) {
  const fields = [
    ['full_name', 'email', 'phone', 'pan_number'],
    ['primary_platform', 'estimated_audience', 'website_url', 'youtube_channel', 'instagram_handle', 'twitter_handle', 'facebook_page', 'niche_categories', 'promotion_strategy', 'previous_experience'],
    ['payment_method', 'bank_name', 'bank_account_number', 'bank_ifsc_code', 'account_holder_name', 'upi_id'],
    ['agreed_to_terms'],
  ];
  const step = fields.findIndex(group => group.some(key => errors[key]));
  return step < 0 ? 3 : step;
}

// step = 0..3 validates one form step. Omit it for complete API submission.
export function validateAffiliateApplication(value, step = null) {
  const input = own(value), errors = {}, data = {}, text = reader(input, errors);
  const includes = index => step == null || step === index;
  if (includes(0)) {
    data.full_name = text('full_name', 'Full name', { required: true, min: 2, max: 100 });
    data.email = text('email', 'Email', { max: 254 }).toLowerCase();
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Enter a valid email address';
    const phone = text('phone', 'Phone number', { required: true, max: 25 });
    const digits = phone.replace(/[ ()-]/g, '').replace(/^\+?91(?=\d{10}$)/, '');
    if (phone && !/^[6-9]\d{9}$/.test(digits)) errors.phone = 'Enter a valid 10-digit Indian mobile number';
    data.phone = /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : phone;
    data.pan_number = text('pan_number', 'PAN number', { max: 10 }).toUpperCase();
    if (data.pan_number && !/^[A-Z]{5}\d{4}[A-Z]$/.test(data.pan_number)) errors.pan_number = 'Enter a valid PAN number, such as ABCDE1234F';
  }
  if (includes(1)) {
    data.primary_platform = text('primary_platform', 'Primary platform', { required: true });
    if (data.primary_platform && !AFFILIATE_PLATFORMS.includes(data.primary_platform)) errors.primary_platform = 'Select a valid primary platform';
    const audience = input.estimated_audience;
    if (!blank(audience) && !((typeof audience === 'string' && /^\d+$/.test(audience.trim())) || (typeof audience === 'number' && Number.isInteger(audience)))) errors.estimated_audience = 'Audience size must be a non-negative whole number';
    const count = blank(audience) ? null : Number(audience);
    if (count != null && (!Number.isSafeInteger(count) || count < 0 || count > 2147483647)) errors.estimated_audience = 'Audience size must be a whole number between 0 and 2147483647';
    data.estimated_audience = count;
    for (const [field, label] of [['website_url', 'Website URL'], ['youtube_channel', 'YouTube channel URL'], ['facebook_page', 'Facebook page URL']]) {
      data[field] = text(field, label, { max: 2048 }); checkUrl(data[field], field, label, errors);
    }
    data.instagram_handle = text('instagram_handle', 'Instagram handle', { max: 31 });
    if (data.instagram_handle && !/^@?[a-z0-9._]{1,30}$/i.test(data.instagram_handle)) errors.instagram_handle = 'Enter a valid Instagram handle';
    data.twitter_handle = text('twitter_handle', 'Twitter/X handle', { max: 16 });
    if (data.twitter_handle && !/^@?[a-z0-9_]{1,15}$/i.test(data.twitter_handle)) errors.twitter_handle = 'Enter a valid Twitter/X handle';
    data.niche_categories = input.niche_categories ?? [];
    if (!Array.isArray(data.niche_categories) || data.niche_categories.length > 30 || data.niche_categories.some(id => typeof id !== 'string' || !UUID.test(id))) errors.niche_categories = 'Select valid niche categories';
    data.promotion_strategy = text('promotion_strategy', 'Promotion strategy', { required: true, min: 50, max: 5000 });
    data.previous_experience = text('previous_experience', 'Previous experience', { max: 2000 });
  }
  if (includes(2)) {
    const payment = validatePaymentDetails(input); Object.assign(data, payment.data); Object.assign(errors, payment.errors);
  }
  if (includes(3)) {
    data.agreed_to_terms = input.agreed_to_terms === true;
    if (!data.agreed_to_terms) errors.agreed_to_terms = 'Please agree to the Affiliate Program Terms & Conditions';
  }
  return result(data, errors);
}

export function validateAffiliateLink(value) {
  const input = own(value), errors = {}, data = {}, text = reader(input, errors);
  data.destination_type = input.destination_type === 'GENERAL' ? 'HOMEPAGE' : input.destination_type;
  if (!['HOMEPAGE', 'PRODUCT', 'CATEGORY', 'SEARCH'].includes(data.destination_type)) errors.destination_type = 'Select a valid link destination';
  if (data.destination_type === 'PRODUCT' || data.destination_type === 'CATEGORY') {
    const field = data.destination_type === 'PRODUCT' ? 'product_id' : 'category_id';
    const label = field === 'product_id' ? 'product' : 'category';
    data[field] = text(field, label, { required: true, max: 36 });
    if (!UUID.test(data[field])) errors[field] = `Select a valid ${label}`;
  }
  if (data.destination_type === 'SEARCH') data.search_query = text('search_query', 'Search term', { required: true, min: 2, max: 200 });
  for (const [field, label, max] of [['campaign_name', 'Campaign name', 120], ['sub_id', 'Sub ID', 100]]) {
    const val = text(field, label, { max }); if (val) data[field] = val;
  }
  return result(data, errors);
}

export function validateWithdrawal(value, limits = {}) {
  const input = own(value), payment = validatePaymentDetails(input);
  const errors = { ...payment.errors }, data = { ...payment.data };
  const raw = input.amount;
  const amount = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(raw).trim())) errors.amount = 'Enter a positive amount with no more than two decimal places';
  else if (limits.minimum != null && amount < limits.minimum) errors.amount = `Minimum withdrawal amount is ₹${limits.minimum}`;
  else if (limits.balance != null && amount > limits.balance) errors.amount = 'Amount exceeds available balance';
  data.amount = amount;
  return result(data, errors);
}

export function validateReferralInput(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const errors = /^[A-Z0-9]{4,50}$/.test(code) ? {} : { referral_code: 'Enter a referral code containing 4–50 letters and digits' };
  return result({ referral_code: code }, errors);
}
