import BulkOrderEnquiryDAO from "../dao/bulk-order-enquiry.dao.js";
import WholesaleBulkOrderDAO from "../dao/wholesale-bulk-order.dao.js";
import WholesaleBulkOrderItemDAO from "../dao/wholesale-bulk-order-item.dao.js";
import OrderDAO from "../dao/order.dao.js";
import OrderItemDAO from "../dao/order-item.dao.js";
import CartDAO from "../dao/cart.dao.js";

// B2B Bulk Order Enquiry Functions
export const createBulkOrderEnquiry = async (req, res) => {
  try {
    console.log('Creating bulk order enquiry:', req.body);

    const {
      companyName,
      contactPerson,
      email,
      phone,
      productName,
      quantity,
      description,
      expectedPrice,
      deliveryTimeline,
      gstNumber,
      address,
      variant_id,
      variant_details
    } = req.body;

    // Validation
    if (!companyName || !contactPerson || !email || !phone || !productName || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: companyName, contactPerson, email, phone, productName, quantity'
      });
    }

    const enquiryData = {
      company_name: String(companyName),
      contact_person: String(contactPerson),
      email: String(email),
      phone: String(phone),
      product_name: String(productName),
      quantity: parseInt(quantity),
      description: description ? String(description) : null,
      expected_price: expectedPrice ? parseFloat(expectedPrice) : null,
      delivery_timeline: deliveryTimeline ? String(deliveryTimeline) : null,
      gst_number: gstNumber ? String(gstNumber) : null,
      address: address ? String(address) : null,
      variant_id: variant_id || null,
      variant_details: variant_details ? String(variant_details) : null,
      status: 'Pending'
    };

    const data = await BulkOrderEnquiryDAO.create(enquiryData);

    console.log('Bulk order enquiry created successfully:', data);
    return res.status(201).json({
      success: true,
      message: 'Bulk order enquiry submitted successfully',
      enquiry: data
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBulkOrderEnquiries = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    console.log('Fetching bulk order enquiries - Page:', page, 'Limit:', limit, 'Status:', status);

    const { data, count } = await BulkOrderEnquiryDAO.list(
      { status, page: parseInt(page), limit: parseInt(limit) }
    );

    console.log(`Found ${count} total enquiries, returning ${data.length} for page ${page}`);

    return res.json({
      success: true,
      enquiries: data || [],
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBulkOrderEnquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    console.log(`Updating bulk enquiry ${id} - Status: ${status}`);

    // Validate status
    const validStatuses = ['Pending', 'In Progress', 'Quoted', 'Approved', 'Rejected', 'Completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
      });
    }

    const updateData = {
      last_updated: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

    const data = await BulkOrderEnquiryDAO.update(parseInt(id), updateData);

    if (!data) {
      return res.status(404).json({ success: false, error: 'Bulk order enquiry not found' });
    }

    console.log('Bulk enquiry updated successfully:', data);
    return res.json({ success: true, enquiry: data });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Wholesale Bulk Order Functions (Integrated Checkout)
export const createWholesaleBulkOrder = async (req, res) => {
  try {
    console.log('Creating wholesale bulk order:', req.body);

    const {
      user_id,
      items,
      total_price,
      email,
      contact,
      shipping_address,
      billing_address,
      company_name,
      gst_number
    } = req.body;

    // Validation
    if (!total_price || !email || !contact || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: total_price, email, contact, items'
      });
    }

    const orderData = {
      user_id: user_id || null,
      total_price: parseFloat(total_price),
      email: String(email),
      contact: String(contact),
      company_name: company_name ? String(company_name) : null,
      gst_number: gst_number ? String(gst_number) : null,
      payment_status: 'PAYMENT_PENDING',
      order_status: 'pending'
    };

    // Add shipping address if provided
    if (shipping_address) {
      orderData.shipping_first_name = shipping_address.firstName || null;
      orderData.shipping_last_name = shipping_address.lastName || null;
      orderData.shipping_full_address = shipping_address.fullAddress || null;
      orderData.shipping_apartment = shipping_address.apartment || null;
      orderData.shipping_city = shipping_address.city || null;
      orderData.shipping_country = shipping_address.country || null;
      orderData.shipping_state = shipping_address.state || null;
      orderData.shipping_zip_code = shipping_address.zipCode || null;
    }

    // Add billing address if provided
    if (billing_address) {
      orderData.billing_first_name = billing_address.firstName || null;
      orderData.billing_last_name = billing_address.lastName || null;
      orderData.billing_full_address = billing_address.fullAddress || null;
      orderData.billing_apartment = billing_address.apartment || null;
      orderData.billing_city = billing_address.city || null;
      orderData.billing_country = billing_address.country || null;
      orderData.billing_state = billing_address.state || null;
      orderData.billing_zip_code = billing_address.zipCode || null;
    }

    // Create wholesale bulk order using DAO
    const order = await WholesaleBulkOrderDAO.create(orderData);

    // Create order items using DAO
    const orderItems = items.map(item => ({
      wholesale_bulk_order_id: order.id,
      product_id: String(item.product_id || item.id),
      variant_id: item.variant_id || null,
      variant_name: item.variant_name || null,
      variant_weight: item.variant_weight || null,
      variant_unit: item.variant_unit || null,
      quantity: parseInt(item.quantity),
      price: parseFloat(item.price),
      is_bulk_order: item.is_bulk_order !== undefined ? item.is_bulk_order : true,
      bulk_range: item.bulk_range || null,
      original_price: item.original_price ? parseFloat(item.original_price) : null
    }));

    await WholesaleBulkOrderItemDAO.createBulk(orderItems);

    // Clear cart if user_id provided
    if (user_id) {
      await CartDAO.clearCart(user_id);
    }

    console.log('Wholesale bulk order created successfully:', order);
    return res.status(201).json({
      success: true,
      message: 'Bulk order created successfully',
      order
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getWholesaleBulkOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    console.log('Fetching wholesale bulk orders - Page:', page, 'Limit:', limit, 'Status:', status);

    const { data, count } = await WholesaleBulkOrderDAO.list(
      { status, page: parseInt(page), limit: parseInt(limit) }
    );

    console.log(`Found ${count} total wholesale orders, returning ${data.length} for page ${page}`);

    return res.json({
      success: true,
      orders: data || [],
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateWholesaleBulkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status, payment_status } = req.body;

    console.log(`Updating wholesale bulk order ${id} - Order Status: ${order_status}, Payment Status: ${payment_status}`);

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (order_status) {
      const validOrderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validOrderStatuses.includes(order_status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid order status. Valid statuses: ${validOrderStatuses.join(', ')}`
        });
      }
      updateData.order_status = order_status;
    }

    if (payment_status) {
      const validPaymentStatuses = ['PAYMENT_PENDING', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'REFUNDED'];
      if (!validPaymentStatuses.includes(payment_status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid payment status. Valid statuses: ${validPaymentStatuses.join(', ')}`
        });
      }
      updateData.payment_status = payment_status;
    }

    const data = await WholesaleBulkOrderDAO.update(parseInt(id), updateData);

    if (!data) {
      return res.status(404).json({ success: false, error: 'Wholesale bulk order not found' });
    }

    console.log('Wholesale bulk order updated successfully:', data);
    return res.json({ success: true, order: data });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Enhanced order creation with bulk support
export const createOrderWithBulkSupport = async (req, res) => {
  try {
    const {
      user_id,
      items,
      subtotal,
      shipping,
      total,
      detailedAddress,
      payment_method,
      company_name,
      gst_number,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      gpsLocation
    } = req.body;

    // Check if any items are bulk orders
    const hasBulkItems = items.some(item => item.is_bulk_order);

    // Create address string
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
      subtotal,
      shipping,
      total,
      address: addressString,
      payment_method: hasBulkItems ? 'bulk_order' : payment_method,
      is_bulk_order: hasBulkItems,
      company_name,
      gst_number,
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
      shipping_latitude: gpsLocation?.latitude || null,
      shipping_longitude: gpsLocation?.longitude || null,
      shipping_gps_address: gpsLocation?.formatted_address || null,
    };

    // Add payment details only for non-bulk orders
    if (!hasBulkItems && razorpay_order_id) {
      orderData.razorpay_order_id = razorpay_order_id;
      orderData.razorpay_payment_id = razorpay_payment_id;
      orderData.razorpay_signature = razorpay_signature;
    }

    // Create order using DAO
    const order = await OrderDAO.create(orderData);

    // Create order items using DAO
    const orderItemsToInsert = items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id || item.id,
      quantity: item.quantity,
      price: item.price,
      is_bulk_order: item.is_bulk_order || false,
      bulk_range: item.bulk_range || null,
      original_price: item.original_price || null,
    }));

    for (const item of orderItemsToInsert) {
      await OrderItemDAO.create(item);
    }

    // Clear cart
    if (user_id) {
      await CartDAO.clearCart(user_id);
    }

    return res.json({
      success: true,
      order,
      isBulkOrder: hasBulkItems,
      message: hasBulkItems ? 'Bulk order created successfully. Our team will contact you soon.' : 'Order placed successfully'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};