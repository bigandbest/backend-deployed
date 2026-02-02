import { supabase } from "../config/supabaseClient.js";
import ProductBrandDAO from "../dao/product-brand.dao.js";
import BrandDAO from "../dao/brand.dao.js";
import ProductDAO from "../dao/product.dao.js";
import prisma from "../config/prisma.js";

// 1️⃣ Map a single product to a Brand using IDs
export const mapProductToBrand = async (req, res) => {
  try {
    const { product_id, brand_id } = req.body;

    if (!product_id || !brand_id) {
      return res.status(400).json({ error: 'product_id and brand_id are required.' });
    }

    // Insert mapping using DAO
    await ProductBrandDAO.link(product_id, brand_id);

    res.status(201).json({ message: 'Product mapped to Brand successfully.' });
  } catch (err) {
    console.error('Map product to brand error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// 2️⃣ Remove a product from a Brand
export const removeProductFromBrand = async (req, res) => {
  try {
    const { product_id, brand_id } = req.body;

    await ProductBrandDAO.unlink(product_id, brand_id);

    res.status(200).json({ message: 'Mapping removed successfully.' });
  } catch (err) {
    console.error('Remove product from brand error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// 3️⃣ Get all Brands stocking a product
export const getBrandsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await ProductBrandDAO.listBrandsByProduct(product_id);

    // Transforming to match expected response format if needed
    const formattedData = data.map(item => ({
      brand_id: item.brand_id,
      brand: item.brand
    }));

    res.status(200).json(formattedData);
  } catch (err) {
    console.error('Get brands for product error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// 4️⃣ Get all products from a Brand
export const getProductsForBrand = async (req, res) => {
  try {
    const { brand_id } = req.params;

    const data = await ProductBrandDAO.listProductsByBrand(brand_id);

    // Extract products array
    const products = data.map(item => item.product).filter(p => p !== null);

    // Enrich with inventory
    const enrichedProducts = await ProductDAO.enrichProductsWithInventory(products);

    // Transform to match expected response format with frontend-friendly fields
    const formattedData = data.map((item, index) => {
      const product = enrichedProducts[index];
      if (!product) return null;

      const defaultVariant = product.variants?.find(v => v.is_default) || product.variants?.[0] || null;

      // Map necessary fields
      const mappedProduct = {
        ...product,
        image: product.image || product.media?.find(m => m.is_primary)?.url || product.media?.[0]?.url || "",
        images: product.media?.map(m => m.url) || [],
        price: defaultVariant ? defaultVariant.price : product.price,
        oldPrice: defaultVariant ? defaultVariant.old_price : product.old_price,
        stock: product.stock_info?.available_stock || 0,
        inStock: product.stock_info?.in_stock || false,
        weight: defaultVariant?.title || product.uom || "1 Unit",
        discount: defaultVariant?.discount_percentage || product.discount || 0,
      };

      return {
        product_id: item.product_id,
        products: mappedProduct
      };
    }).filter(item => item !== null);

    res.status(200).json(formattedData);
  } catch (err) {
    console.error('Get products for brand error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// 5️⃣ Bulk map products by names and Brand name
export const bulkMapByNames = async (req, res) => {
  try {
    const { brand_name, product_names } = req.body;

    if (!brand_name || !product_names || !Array.isArray(product_names)) {
      return res.status(400).json({ error: 'brand_name and product_names[] are required.' });
    }

    // 1. Get Brand ID from name
    const brand = await prisma.brand.findFirst({
      where: { name: brand_name },
      select: { id: true }
    });

    if (!brand) {
      return res.status(404).json({ error: 'Brand not found.' });
    }

    // 2. Get product IDs from names
    const products = await prisma.products.findMany({
      where: { name: { in: product_names } },
      select: { id: true, name: true }
    });

    if (!products.length) {
      return res.status(404).json({ error: 'No matching products found.' });
    }

    // 3. Map each product to Brand using DAO
    for (const p of products) {
      await ProductBrandDAO.link(p.id, brand.id);
    }

    res.status(201).json({
      message: `Mapped ${products.length} products to Brand "${brand_name}".`,
      mapped_products: products.map(p => p.name)
    });

  } catch (err) {
    console.error('Bulk map error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};