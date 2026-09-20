// Canonical eligible-base formula shared by referral and affiliate — do not reimplement per module.
export const calculateEligibleOrderBase = (order) => {
  const subtotal = Number(order?.subtotal || 0);
  const couponDiscount = Number(order?.coupon_discount || 0);
  const discountCharge = Number(order?.discount_charge || 0);
  return Math.max(0, subtotal - couponDiscount - discountCharge);
};
