import { supabase } from "../config/supabaseClient.js";

// 1️⃣ Map a single product to a Recommended Store using IDs
export const mapProductToRecommendedStore = async (req, res) => {
  try {
    const { product_id, recommended_store_id } = req.body;

    if (!product_id || !recommended_store_id) {
      return res.status(400).json({ error: 'product_id and recommended_store_id are required.' });
    }

    // Insert mapping (ignore if duplicate)
    const { error } = await supabase
      .from('product_recommended_store')
      .insert([{ product_id, recommended_store_id }]);

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Mapping already exists.' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'Product mapped to Recommended Store successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 2️⃣ Remove a product from a Recommended Store
export const removeProductFromRecommendedStore = async (req, res) => {
  try {
    const { product_id, recommended_store_id } = req.body;

    const { error } = await supabase
      .from('product_recommended_store')
      .delete()
      .eq('product_id', product_id)
      .eq('recommended_store_id', recommended_store_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({ message: 'Mapping removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 3️⃣ Get all Recommended Stores stocking a product
export const getRecommendedStoresForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const { data, error } = await supabase
      .from('product_recommended_store')
      .select('recommended_store_id, recommended_store (id, name, image_url)')
      .eq('product_id', product_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 4️⃣ Get all products in a Recommended Store with filters
export const getProductsForRecommendedStore = async (req, res) => {
  try {
    const { recommended_store_id } = req.params;
    const {
      minPrice,
      maxPrice,
      categories,
      brands,
      sortBy = 'none'
    } = req.query;

    let query = supabase
      .from('product_recommended_store')
      .select(`
        product_id,
        products (
          id,
          name,
          description,
          price,
          old_price,
          discount,
          rating,
          review_count,
          image,
          images,
          video,
          category,
          subcategory_id,
          group_id,
          brand_name,
          stock,
          stock_quantity,
          in_stock,
          active,
          popular,
          featured,
          shipping_amount,
          specifications,
          uom,
          uom_value,
          uom_unit,
          delivery_type,
          created_at,
          product_variants (
            id,
            variant_name,
            variant_price,
            variant_old_price,
            variant_discount,
            variant_stock,
            variant_weight,
            variant_unit,
            variant_image,
            is_default,
            active
          )
        )
      `)
      .eq('recommended_store_id', recommended_store_id);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching products for store:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data || data.length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
        total: 0
      });
    }

    // Transform the data to match frontend expectations
    let transformedProducts = data
      .filter(item => item.products && item.products.active)
      .map(item => {
        const product = item.products;
        const activeVariants = (product.product_variants || []).filter(v => v.active !== false);

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
          images: product.images || [],
          video: product.video,
          inStock: (product.stock_quantity || product.stock || 0) > 0,
          stock: product.stock_quantity || product.stock || 0,
          popular: product.popular,
          featured: product.featured,
          category: product.category,
          subcategory_id: product.subcategory_id,
          group_id: product.group_id,
          weight: product.uom || `${product.uom_value || 1} ${product.uom_unit || 'kg'}`,
          brand: product.brand_name || 'BigandBest',
          shipping_amount: product.shipping_amount || 0,
          specifications: product.specifications,
          delivery_type: product.delivery_type,
          created_at: product.created_at,
          hasVariants: activeVariants.length > 0,
          variants: activeVariants,
          defaultVariant: activeVariants.find(v => v.is_default === true) || null,
        };
      });

    // Apply filters
    if (minPrice || maxPrice) {
      const min = parseFloat(minPrice) || 0;
      const max = parseFloat(maxPrice) || Infinity;
      transformedProducts = transformedProducts.filter(p => {
        const price = p.price || p.oldPrice;
        return price >= min && price <= max;
      });
    }

    if (categories) {
      const categoryList = categories.split(',');
      transformedProducts = transformedProducts.filter(p =>
        categoryList.includes(p.category)
      );
    }

    if (brands) {
      const brandList = brands.split(',');
      transformedProducts = transformedProducts.filter(p =>
        brandList.includes(p.brand)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'lowest_price':
        transformedProducts.sort((a, b) => (a.price || a.oldPrice) - (b.price || b.oldPrice));
        break;
      case 'highest_price':
        transformedProducts.sort((a, b) => (b.price || b.oldPrice) - (a.price || a.oldPrice));
        break;
      case 'highest_rating':
        transformedProducts.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'most_reviews':
        transformedProducts.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
        break;
      case 'newest':
        transformedProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      default:
        break;
    }

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length
    });
  } catch (err) {
    console.error('Server error in getProductsForRecommendedStore:', err);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// 5️⃣ Bulk map products by names and Recommended Store name
export const bulkMapByNames = async (req, res) => {
  try {
    const { recommended_store_name, product_names } = req.body;

    if (!recommended_store_name || !product_names || !Array.isArray(product_names)) {
      return res.status(400).json({ error: 'recommended_store_name and product_names[] are required.' });
    }

    // 1. Get Recommended Store ID from name
    const { data: recommendedStoreData, error: recommendedStoreError } = await supabase
      .from('recommended_store')
      .select('id')
      .eq('name', recommended_store_name)
      .single();

    if (recommendedStoreError || !recommendedStoreData) {
      return res.status(404).json({ error: 'Recommended Store not found.' });
    }

    // 2. Get product IDs from names
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name')
      .in('name', product_names);

    if (productError || !products.length) {
      return res.status(404).json({ error: 'No matching products found.' });
    }

    // 3. Map each product to Recommended Store
    const inserts = products.map(p => ({
      product_id: p.id,
      recommended_store_id: recommendedStoreData.id
    }));

    const { error: insertError } = await supabase
      .from('product_recommended_store')
      .insert(inserts, { upsert: false });

    if (insertError && insertError.code !== '23505') {
      return res.status(500).json({ error: insertError.message });
    }

    res.status(201).json({
      message: `Mapped ${products.length} products to Recommended Store "${recommended_store_name}".`,
      mapped_products: products.map(p => p.name)
    });

  } catch (err) {
    console.error('Bulk map error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};