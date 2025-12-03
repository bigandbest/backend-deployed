import { supabase } from "../config/supabaseClient.js";

// Variant join string - used consistently across all product queries
const VARIANT_JOIN = `
  product_variants!left(
    id,
    variant_name,
    variant_price,
    variant_old_price,
    variant_discount,
    variant_stock,
    variant_weight,
    variant_unit,
    variant_image_url,
    shipping_amount,
    is_default,
    active,
    created_at
  )
`;

/**
 * Fetch products with their variants for section-based queries
 * @param {Array} productIds - Array of product IDs to fetch
 * @returns {Promise<Array>} - Array of products with variants
 */
export const fetchProductsWithVariants = async (productIds) => {
  if (!productIds || productIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("products")
    .select(`*, ${VARIANT_JOIN}`)
    .in("id", productIds)
    .eq("active", true);

  if (error) {
    console.error("Error fetching products with variants:", error);
    return [];
  }

  return data || [];
};

/**
 * Transform product data to include variant information
 * @param {Object} product - Product object from database
 * @returns {Object} - Transformed product with variant data
 */
export const transformProductWithVariants = (product) => {
  const activeVariants = (product.product_variants || []).filter(
    (v) => v.active !== false
  );
  const defaultVariant = activeVariants.find((v) => v.is_default === true);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    oldPrice: product.old_price,
    rating: product.rating || 4.0,
    reviews: product.review_count || 0,
    discount: product.discount || 0,
    image: product.image,
    images: product.images,
    inStock: (product.stock_quantity || product.stock || 0) > 0,
    stock: product.stock_quantity || product.stock || 0,
    popular: product.popular,
    featured: product.featured,
    category: product.category,
    weight: product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
    brand: product.brand_name || "BigandBest",
    shipping_amount: product.shipping_amount || 0,
    specifications: product.specifications,
    created_at: product.created_at,
    hasVariants: activeVariants.length > 0,
    variants: activeVariants,
    defaultVariant: defaultVariant || null,
  };
};

export { VARIANT_JOIN };
