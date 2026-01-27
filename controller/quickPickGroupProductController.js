
import quickPickGroupProductDao from "../dao/quickpick-group-product.dao.js";
import quickPickGroupDao from "../dao/quick-pick-group.dao.js";
import productDao from "../dao/product.dao.js";

// 1️⃣ Map a single product to a Quick Pick Group using IDs
export const mapProductToQuickPickGroup = async (req, res) => {
  try {
    const { product_id, quick_pick_group_id } = req.body;

    if (!product_id || !quick_pick_group_id) {
      return res.status(400).json({ error: 'product_id and quick_pick_group_id are required.' });
    }

    // Insert mapping
    await quickPickGroupProductDao.link(quick_pick_group_id, product_id);

    res.status(201).json({ message: 'Product mapped to Quick Pick Group successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 2️⃣ Remove a product from a Quick Pick Group
export const removeProductFromQuickPickGroup = async (req, res) => {
  try {
    const { product_id, quick_pick_group_id } = req.body;

    await quickPickGroupProductDao.deleteByMapping(product_id, quick_pick_group_id);

    res.status(200).json({ message: 'Mapping removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 3️⃣ Get all Quick Pick Groups stocking a product
export const getQuickPickGroupsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await quickPickGroupProductDao.listGroupsByProduct(product_id);

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 4️⃣ Get all products in a Quick Pick Group thiss
export const getProductsForQuickPickGroup = async (req, res) => {
  try {
    const { quick_pick_group_id } = req.params;

    const data = await quickPickGroupProductDao.listProductsByGroup(quick_pick_group_id);

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// 5️⃣ Bulk map products by names and Quick Pick Group name
export const bulkMapByNames = async (req, res) => {
  try {
    const { quick_pick_group_name, product_names } = req.body;

    if (!quick_pick_group_name || !product_names || !Array.isArray(product_names)) {
      return res.status(400).json({ error: 'quick_pick_group_name and product_names[] are required.' });
    }

    // 1. Get Quick Pick Group ID from name
    const quickPickGroupData = await quickPickGroupDao.getByName(quick_pick_group_name);

    if (!quickPickGroupData) {
      return res.status(404).json({ error: 'Quick Pick Group not found.' });
    }

    // 2. Get product IDs from names
    const products = await productDao.getProductsByNames(product_names);

    if (!products || !products.length) {
      return res.status(404).json({ error: 'No matching products found.' });
    }

    // 3. Map each product to Quick Pick Group
    const inserts = products.map(p => ({
      product_id: p.id,
      quick_pick_group_id: quickPickGroupData.id
    }));

    await quickPickGroupProductDao.createMany(inserts);

    res.status(201).json({
      message: `Mapped ${products.length} products to Quick Pick Group "${quick_pick_group_name}".`,
      mapped_products: products.map(p => p.name)
    });

  } catch (err) {
    console.error('Bulk map error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};