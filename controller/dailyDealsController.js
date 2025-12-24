import { supabase } from "../config/supabaseClient.js";

// Add a Daily Deal
export async function addDailyDeal(req, res) {
  try {
    const { title, discount, badge, sort_order, banner_id } = req.body;
    const imageFile = req.file;
    let imageUrl = null;

    // Upload image to Supabase Storage if a file is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("daily-deals")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("daily-deals")
        .getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }

    // Validate banner_id if provided
    if (banner_id) {
      const { data: bannerData, error: bannerError } = await supabase
        .from("add_banner")
        .select("id, banner_type")
        .eq("id", banner_id)
        .eq("banner_type", "daily_deals")
        .single();

      if (bannerError || !bannerData) {
        return res.status(400).json({
          success: false,
          error: 'Invalid banner_id. Banner must exist and have type "daily_deals".',
        });
      }
    }

    // Insert new daily deal into the 'daily_deals' table
    const { data, error } = await supabase
      .from("daily_deals")
      .insert([{
        title,
        image_url: imageUrl,
        discount,
        badge,
        sort_order,
        banner_id: banner_id || null,
      }])
      .select()
      .single();
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, deal: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update a Daily Deal
export async function updateDailyDeal(req, res) {
  try {
    const { id } = req.params;
    const { title, discount, badge, sort_order, active, banner_id } = req.body;
    const imageFile = req.file;

    // Only include fields that are actually provided
    let updateData = {};
    if (title !== undefined) updateData.title = title;
    if (discount !== undefined) updateData.discount = discount;
    if (badge !== undefined) updateData.badge = badge;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (active !== undefined) updateData.active = active;

    // Update image if a new one is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("daily-deals")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });
      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("daily-deals")
        .getPublicUrl(fileName);
      updateData.image_url = urlData.publicUrl;
    }

    // Validate banner_id if provided
    if (banner_id !== undefined) {
      if (banner_id === null || banner_id === "") {
        // Allow removing banner by setting to null
        updateData.banner_id = null;
      } else {
        const { data: bannerData, error: bannerError } = await supabase
          .from("add_banner")
          .select("id, banner_type")
          .eq("id", banner_id)
          .eq("banner_type", "daily_deals")
          .single();

        if (bannerError || !bannerData) {
          return res.status(400).json({
            success: false,
            error: 'Invalid banner_id. Banner must exist and have type "daily_deals".',
          });
        }
        updateData.banner_id = banner_id;
      }
    }

    // Update the record in the 'daily_deals' table
    const { data, error } = await supabase
      .from("daily_deals")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error)
      return res.status(400).json({ success: false, error: error.message });

    if (!data || data.length === 0)
      return res.status(404).json({ success: false, error: "Deal not found" });

    res.json({ success: true, deal: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete a Daily Deal
export async function deleteDailyDeal(req, res) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("daily_deals").delete().eq("id", id);
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, message: "Daily deal deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Daily Deals
export async function getAllDailyDeals(req, res) {
  try {
    const { data, error } = await supabase
      .from("daily_deals")
      .select(`
        *,
        banner:add_banner(id, name, image_url, banner_type, description, link, active)
      `)
      .order("sort_order", { ascending: true });
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, deals: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Daily Deals WITH Products (Optimized - Single API Call)
export async function getAllDailyDealsWithProducts(req, res) {
  try {
    // Step 1: Fetch all active deals with banner data
    const { data: deals, error: dealsError } = await supabase
      .from("daily_deals")
      .select(`
        *,
        banner:add_banner(id, name, image_url, banner_type, description, link, active)
      `)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (dealsError) {
      return res.status(400).json({ success: false, error: dealsError.message });
    }

    if (!deals || deals.length === 0) {
      return res.json({ success: true, deals: [] });
    }

    // Step 2: Fetch all product mappings for these deals
    const dealIds = deals.map(d => d.id);
    const { data: mappings, error: mappingsError } = await supabase
      .from("daily_deals_product")
      .select("daily_deal_id, product_id")
      .in("daily_deal_id", dealIds);

    if (mappingsError) {
      console.error("Error fetching product mappings:", mappingsError);
      // Return deals without products if mapping fails
      return res.json({
        success: true,
        deals: deals.map(deal => ({ ...deal, products: [] }))
      });
    }

    // Step 3: Fetch all products with variants
    const productIds = [...new Set(mappings?.map(m => m.product_id) || [])];

    let products = [];
    if (productIds.length > 0) {
      const { fetchProductsWithVariants, transformProductWithVariants } = await import('./productHelpers.js');
      const fetchedProducts = await fetchProductsWithVariants(productIds);
      products = fetchedProducts.map(transformProductWithVariants);
    }

    // Step 4: Create a map of products by ID for quick lookup
    const productsMap = {};
    products.forEach(product => {
      productsMap[product.id] = product;
    });

    // Step 5: Group products by deal_id
    const dealProductsMap = {};
    mappings?.forEach(mapping => {
      if (!dealProductsMap[mapping.daily_deal_id]) {
        dealProductsMap[mapping.daily_deal_id] = [];
      }
      const product = productsMap[mapping.product_id];
      if (product) {
        dealProductsMap[mapping.daily_deal_id].push(product);
      }
    });

    // Step 6: Combine deals with their products
    const dealsWithProducts = deals.map(deal => ({
      ...deal,
      products: dealProductsMap[deal.id] || []
    }));

    res.json({ success: true, deals: dealsWithProducts });
  } catch (err) {
    console.error("Error in getAllDailyDealsWithProducts:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// View a Single Daily Deal
export async function getDailyDealById(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("daily_deals")
      .select("*")
      .eq("id", id)
      .single();

    if (error)
      return res.status(400).json({ success: false, error: error.message });
    if (!data)
      return res
        .status(404)
        .json({ success: false, error: "Daily deal not found" });

    res.json({ success: true, deal: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
