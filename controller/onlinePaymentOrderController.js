import { supabase } from "../config/supabaseClient.js";

// Create Online Payment Order (Razorpay, etc.) - No amount limit
export const createOnlinePaymentOrder = async (req, res) => {
  try {
    console.log('Online Payment Order Creation Request:', req.body);
    
    const {
      user_id,
      items,
      subtotal,
      shipping = 0,
      total,
      detailedAddress,
      payment_method = "Razorpay",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Validate required fields
    if (!user_id || !items || !Array.isArray(items) || items.length === 0) {
      console.log('Validation Error: Missing required fields');
      return res.status(400).json({
        success: false,
        error: "Missing required fields: user_id, items"
      });
    }

    if (!detailedAddress) {
      return res.status(400).json({
        success: false,
        error: "Delivery address is required"
      });
    }

    // Build address string
    const addressString = [
      detailedAddress.houseNumber && detailedAddress.streetAddress
        ? `${detailedAddress.houseNumber} ${detailedAddress.streetAddress}`
        : detailedAddress.streetAddress,
      detailedAddress.suiteUnitFloor,
      detailedAddress.locality,
      detailedAddress.area,
      detailedAddress.city,
      detailedAddress.state,
      detailedAddress.postalCode,
      detailedAddress.country || "India",
      detailedAddress.landmark ? `Near ${detailedAddress.landmark}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const orderData = {
      user_id,
      subtotal: parseFloat(subtotal || total),
      shipping: parseFloat(shipping),
      total: parseFloat(total),
      address: addressString,
      payment_method,
      status: 'confirmed', // Online payments are pre-paid
      shipping_house_number: detailedAddress.houseNumber,
      shipping_street_address: detailedAddress.streetAddress,
      shipping_suite_unit_floor: detailedAddress.suiteUnitFloor,
      shipping_locality: detailedAddress.locality,
      shipping_area: detailedAddress.area,
      shipping_city: detailedAddress.city,
      shipping_state: detailedAddress.state,
      shipping_postal_code: detailedAddress.postalCode,
      shipping_country: detailedAddress.country || "India",
      shipping_landmark: detailedAddress.landmark,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    };

    console.log('Creating online payment order:', orderData);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return res.status(500).json({
        success: false,
        error: orderError.message
      });
    }

    // Process order items with bulk order detection
    const orderItemsToInsert = [];
    let hasBulkOrder = false;

    for (const item of items) {
      const productId = item.product_id || item.id;
      const quantity = item.quantity;
      let finalPrice = item.price;
      let isBulkOrder = false;
      let bulkRange = null;
      let originalPrice = item.price;

      // Check if this item qualifies for bulk pricing
      try {
        const { data: bulkSettings, error: bulkError } = await supabase
          .from('bulk_product_settings')
          .select('*')
          .eq('product_id', productId)
          .is('variant_id', null)
          .eq('is_bulk_enabled', true)
          .maybeSingle();

        if (!bulkError && bulkSettings && quantity >= bulkSettings.min_quantity) {
          isBulkOrder = true;
          hasBulkOrder = true;
          finalPrice = bulkSettings.bulk_price;
          bulkRange = bulkSettings.max_quantity 
            ? `${bulkSettings.min_quantity}-${bulkSettings.max_quantity}`
            : `${bulkSettings.min_quantity}+`;
          
          console.log(`Bulk pricing applied for product ${productId}: ${quantity} units at ₹${finalPrice}`);
        }
      } catch (bulkCheckError) {
        console.error('Error checking bulk settings:', bulkCheckError);
      }

      orderItemsToInsert.push({
        order_id: order.id,
        product_id: productId,
        quantity: quantity,
        price: finalPrice,
        is_bulk_order: isBulkOrder,
        bulk_range: bulkRange,
        original_price: isBulkOrder ? originalPrice : null,
      });
    }

    // Update order with bulk flag if needed
    if (hasBulkOrder) {
      await supabase
        .from('orders')
        .update({ is_bulk_order: true })
        .eq('id', order.id);
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsToInsert);

    if (itemsError) {
      console.error('Order items error:', itemsError);
      // Rollback order
      await supabase.from("orders").delete().eq("id", order.id);
      return res.status(500).json({
        success: false,
        error: itemsError.message
      });
    }

    // Reduce inventory from warehouses and products
    for (const item of items) {
      const productId = item.product_id || item.id;
      const quantity = item.quantity;

      try {
        // Reduce from warehouse stock
        const { data: warehouseStock, error: warehouseError } = await supabase
          .from('product_warehouse_stock')
          .select('*')
          .eq('product_id', productId)
          .gt('stock_quantity', 0)
          .order('stock_quantity', { ascending: false })
          .limit(1)
          .single();

        if (!warehouseError && warehouseStock) {
          const newWarehouseStock = Math.max(0, warehouseStock.stock_quantity - quantity);
          await supabase
            .from('product_warehouse_stock')
            .update({ stock_quantity: newWarehouseStock })
            .eq('id', warehouseStock.id);
          
          console.log(`Reduced warehouse stock for product ${productId}: ${quantity} units`);
        }

        // Reduce from products table
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('stock_quantity, stock')
          .eq('id', productId)
          .single();

        if (!productError && product) {
          const currentStock = product.stock_quantity || product.stock || 0;
          const newStock = Math.max(0, currentStock - quantity);
          
          await supabase
            .from('products')
            .update({ 
              stock_quantity: newStock,
              stock: newStock
            })
            .eq('id', productId);
          
          console.log(`Reduced product stock for ${productId}: ${currentStock} -> ${newStock}`);
        }
      } catch (stockError) {
        console.error(`Error reducing stock for product ${productId}:`, stockError);
      }
    }

    // Clear cart
    await supabase.from("cart_items").delete().eq("user_id", user_id);

    console.log('Online payment order created successfully:', order.id);
    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: order
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
