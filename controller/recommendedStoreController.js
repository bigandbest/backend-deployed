import { supabase } from "../config/supabaseClient.js";

// Add Recommended Store
export async function addRecommendedStore(req, res) {
  try {
    const { name, description, is_active = false, banner_id } = req.body;
    const imageFile = req.file;
    let imageUrl = null;

    // Check if trying to activate and already 8 active
    if (is_active) {
      const { data: activeStores, error: countError } = await supabase
        .from("recommended_store")
        .select("id", { count: "exact" })
        .eq("is_active", true);
      if (countError)
        return res
          .status(400)
          .json({ success: false, error: countError.message });
      if (activeStores.length >= 8) {
        return res.status(400).json({
          success: false,
          error: "Cannot activate more than 8 stores",
        });
      }
    }

    // Upload image to Supabase Storage if a file is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("recommended_store")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("recommended_store")
        .getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }

    // Validate banner_id if provided
    if (banner_id) {
      const { data: bannerData, error: bannerError } = await supabase
        .from("add_banner")
        .select("id, banner_type")
        .eq("id", banner_id)
        .eq("banner_type", "shop_by_store")
        .single();

      if (bannerError || !bannerData) {
        return res.status(400).json({
          success: false,
          error: 'Invalid banner_id. Banner must exist and have type "shop_by_store".',
        });
      }
    }

    // Insert new Recommended Store into the 'recommended_store' table
    const { data, error } = await supabase
      .from("recommended_store")
      .insert([{ name, description, image_url: imageUrl, is_active, banner_id: banner_id || null }])
      .select()
      .single();
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.status(201).json({ success: true, recommendedStore: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Edit Recommended Store
export async function editRecommendedStore(req, res) {
  try {
    const { id } = req.params;
    const { name, description, is_active, banner_id } = req.body;
    const imageFile = req.file;
    let updateData = { name, description };

    // Handle is_active update
    if (is_active !== undefined) {
      if (is_active) {
        // Check current active count, excluding this store if it's already active
        const { data: currentStore, error: fetchError } = await supabase
          .from("recommended_store")
          .select("is_active")
          .eq("id", id)
          .single();
        if (fetchError)
          return res
            .status(400)
            .json({ success: false, error: fetchError.message });

        if (!currentStore.is_active) {
          const { data: activeStores, error: countError } = await supabase
            .from("recommended_store")
            .select("id", { count: "exact" })
            .eq("is_active", true);
          if (countError)
            return res
              .status(400)
              .json({ success: false, error: countError.message });
          if (activeStores.length >= 8) {
            return res.status(400).json({
              success: false,
              error: "Cannot activate more than 8 stores",
            });
          }
        }
      }
      updateData.is_active = is_active;
    }

    // Update image if a new one is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("recommended_store")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });
      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("recommended_store")
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
          .eq("banner_type", "shop_by_store")
          .single();

        if (bannerError || !bannerData) {
          return res.status(400).json({
            success: false,
            error: 'Invalid banner_id. Banner must exist and have type "shop_by_store".',
          });
        }
        updateData.banner_id = banner_id;
      }
    }

    // Update the record in the 'recommended_store' table
    const { data, error } = await supabase
      .from("recommended_store")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, recommendedStore: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete Recommended Store
export async function deleteRecommendedStore(req, res) {
  try {
    const { id } = req.params;
    // The foreign key constraint with ON DELETE CASCADE will handle deleting the mapping entries
    const { error } = await supabase
      .from("recommended_store")
      .delete()
      .eq("id", id);
    if (error)
      return res.status(400).json({ success: false, error: error.message });
    res.json({
      success: true,
      message: "Recommended Store deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Recommended Stores
export async function getAllRecommendedStores(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);

  try {
    console.log(`[${requestId}] === getAllRecommendedStores called ===`);
    console.log(`[${requestId}] Request headers:`, req.headers);
    console.log(`[${requestId}] Timestamp:`, new Date().toISOString());

    // Helper function to execute query with retry logic
    const executeWithRetry = async (maxRetries = 2) => {
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[${requestId}] Retry attempt ${attempt}/${maxRetries}`);
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }

          console.log(`[${requestId}] Executing Supabase query (attempt ${attempt + 1})...`);

          // Get all stores with their associated products and banner data
          const { data, error } = await supabase
            .from("recommended_store")
            .select(`
              id,
              name,
              description,
              image_url,
              is_active,
              banner:add_banner(id, name, image_url, banner_type, description, link, active),
              product_recommended_store (
                products (
                  id,
                  name,
                  image,
                  category,
                  price,
                  rating
                )
              )
            `)
            .order('id', { ascending: true }); // Add ordering for consistency

          if (error) {
            console.error(`[${requestId}] Supabase error on attempt ${attempt + 1}:`, error);
            lastError = error;

            // Don't retry on certain errors
            if (error.code === 'PGRST116' || error.message?.includes('not found')) {
              throw error; // Table/column not found - don't retry
            }

            continue; // Retry on other errors
          }

          console.log(`[${requestId}] Query successful on attempt ${attempt + 1}`);
          console.log(`[${requestId}] Raw data count:`, data?.length || 0);

          return { data, error: null };

        } catch (err) {
          console.error(`[${requestId}] Exception on attempt ${attempt + 1}:`, err.message);
          lastError = err;

          if (attempt === maxRetries) {
            throw err;
          }
        }
      }

      // If we get here, all retries failed
      throw lastError || new Error('Query failed after retries');
    };

    // Execute query with retry logic
    const { data, error } = await executeWithRetry();

    if (error) {
      console.error(`[${requestId}] Final error after retries:`, error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to fetch stores',
        requestId
      });
    }

    // Validate data
    if (!data) {
      console.warn(`[${requestId}] No data returned from query`);
      return res.json({
        success: true,
        recommendedStores: [],
        requestId
      });
    }

    console.log(`[${requestId}] Processing ${data.length} stores...`);

    // Transform the data to include products array
    const formattedStores = data.map((store, index) => {
      try {
        const products = store.product_recommended_store?.map(mapping => mapping.products).filter(p => p) || [];

        return {
          id: store.id,
          name: store.name,
          description: store.description,
          image_url: store.image_url,
          is_active: store.is_active,
          products: products,
          product_count: products.length
        };
      } catch (err) {
        console.error(`[${requestId}] Error processing store at index ${index}:`, err);
        // Return store without products if processing fails
        return {
          id: store.id,
          name: store.name,
          description: store.description,
          image_url: store.image_url,
          is_active: store.is_active,
          products: [],
          product_count: 0
        };
      }
    });

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Successfully formatted ${formattedStores.length} stores`);
    console.log(`[${requestId}] Request completed in ${duration}ms`);
    console.log(`[${requestId}] Returning success response`);

    res.json({
      success: true,
      recommendedStores: formattedStores,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Exception in getAllRecommendedStores:`, err.message);
    console.error(`[${requestId}] Error stack:`, err.stack);
    console.error(`[${requestId}] Failed after ${duration}ms`);

    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      requestId,
      duration
    });
  }
}



// Get Active Recommended Stores (for website)
export async function getActiveRecommendedStores(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);

  try {
    console.log(`[${requestId}] === getActiveRecommendedStores called ===`);
    console.log(`[${requestId}] Request headers:`, req.headers);
    console.log(`[${requestId}] Timestamp:`, new Date().toISOString());

    // Helper function to execute query with retry logic
    const executeWithRetry = async (maxRetries = 2) => {
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[${requestId}] Retry attempt ${attempt}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }

          console.log(`[${requestId}] Executing Supabase query for active stores (attempt ${attempt + 1})...`);

          // Get active stores with their associated products and banner data
          const { data, error } = await supabase
            .from("recommended_store")
            .select(`
              id,
              name,
              description,
              image_url,
              is_active,
              banner:add_banner(id, name, image_url, banner_type, description, link, active),
              product_recommended_store (
                products (
                  id,
                  name,
                  image,
                  category,
                  price,
                  rating
                )
              )
            `)
            .eq("is_active", true)
            .order('id', { ascending: true });

          if (error) {
            console.error(`[${requestId}] Supabase error on attempt ${attempt + 1}:`, error);
            lastError = error;

            if (error.code === 'PGRST116' || error.message?.includes('not found')) {
              throw error;
            }

            continue;
          }

          console.log(`[${requestId}] Query successful on attempt ${attempt + 1}`);
          console.log(`[${requestId}] Active stores count:`, data?.length || 0);

          return { data, error: null };

        } catch (err) {
          console.error(`[${requestId}] Exception on attempt ${attempt + 1}:`, err.message);
          lastError = err;

          if (attempt === maxRetries) {
            throw err;
          }
        }
      }

      throw lastError || new Error('Query failed after retries');
    };

    const { data, error } = await executeWithRetry();

    if (error) {
      console.error(`[${requestId}] Final error:`, error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to fetch active stores',
        requestId
      });
    }

    if (!data) {
      console.warn(`[${requestId}] No data returned`);
      return res.json({
        success: true,
        recommendedStores: [],
        requestId
      });
    }

    console.log(`[${requestId}] Processing ${data.length} active stores...`);

    // Transform the data to include products array
    const formattedStores = data.map((store, index) => {
      try {
        const products = store.product_recommended_store?.map(mapping => mapping.products).filter(p => p) || [];

        return {
          id: store.id,
          name: store.name,
          description: store.description,
          image_url: store.image_url,
          is_active: store.is_active,
          products: products,
          product_count: products.length
        };
      } catch (err) {
        console.error(`[${requestId}] Error processing store at index ${index}:`, err);
        return {
          id: store.id,
          name: store.name,
          description: store.description,
          image_url: store.image_url,
          is_active: store.is_active,
          products: [],
          product_count: 0
        };
      }
    });

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Successfully formatted ${formattedStores.length} active stores`);
    console.log(`[${requestId}] Request completed in ${duration}ms`);

    res.json({
      success: true,
      recommendedStores: formattedStores,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Exception in getActiveRecommendedStores:`, err.message);
    console.error(`[${requestId}] Error stack:`, err.stack);
    console.error(`[${requestId}] Failed after ${duration}ms`);

    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      requestId,
      duration
    });
  }
}

// View a Single Recommended Store
export async function getSingleRecommendedStore(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("recommended_store")
      .select(`
        *,
        banner:add_banner(id, name, image_url, banner_type, description, link, active)
      `)
      .eq("id", id)
      .single();

    if (error)
      return res.status(400).json({ success: false, error: error.message });
    if (!data)
      return res
        .status(404)
        .json({ success: false, error: "Recommended Store not found" });

    res.json({ success: true, recommendedStore: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
