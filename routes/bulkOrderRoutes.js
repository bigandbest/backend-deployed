import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import {
  createBulkOrderEnquiry,
  getBulkOrderEnquiries,
  updateBulkOrderEnquiry,
  createWholesaleBulkOrder,
  getWholesaleBulkOrders,
  updateWholesaleBulkOrder,
  createOrderWithBulkSupport
} from '../controller/bulkOrderController.js';

const router = express.Router();

console.log('Setting up Bulk Orders routes...');

// B2B Bulk Order Enquiry Routes
router.post('/enquiry', createBulkOrderEnquiry);
router.get('/enquiries', getBulkOrderEnquiries);
router.put('/enquiry/:id', updateBulkOrderEnquiry);
router.get('/enquiry/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('bulk_order_enquiries')
      .select('*')
      .eq('id', parseInt(id))
      .single();
    
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Enquiry not found' });
    }
    
    return res.json({ success: true, enquiry: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Wholesale Bulk Order Routes (Integrated Checkout)
router.post('/wholesale', createWholesaleBulkOrder);
router.get('/wholesale', getWholesaleBulkOrders);
router.put('/wholesale/:id', updateWholesaleBulkOrder);
router.get('/wholesale/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('wholesale_bulk_orders')
      .select(`
        *,
        wholesale_bulk_order_items(
          id,
          product_id,
          quantity,
          price,
          is_bulk_order,
          bulk_range,
          original_price
        )
      `)
      .eq('id', parseInt(id))
      .single();
    
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    return res.json({ success: true, order: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Enhanced order creation with bulk support
router.post('/order-with-bulk-support', createOrderWithBulkSupport);

// Bulk orders statistics
router.get('/stats', async (req, res) => {
  try {
    const { data: enquiries } = await supabase
      .from('bulk_order_enquiries')
      .select('status');
    
    const { data: orders } = await supabase
      .from('wholesale_bulk_orders')
      .select('order_status, payment_status, total_price')
      .eq('is_deleted', false);
    
    const stats = {
      enquiries: {
        total: enquiries?.length || 0,
        pending: enquiries?.filter(e => e.status === 'Pending').length || 0,
        in_progress: enquiries?.filter(e => e.status === 'In Progress').length || 0,
        completed: enquiries?.filter(e => e.status === 'Completed').length || 0
      },
      orders: {
        total: orders?.length || 0,
        pending: orders?.filter(o => o.order_status === 'pending').length || 0,
        confirmed: orders?.filter(o => o.order_status === 'confirmed').length || 0,
        delivered: orders?.filter(o => o.order_status === 'delivered').length || 0,
        total_value: orders?.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0) || 0
      }
    };
    
    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

console.log('Bulk Orders routes configured successfully');

export default router;