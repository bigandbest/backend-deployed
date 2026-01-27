import { supabase } from '../config/supabaseClient.js';

class WholesaleBulkOrderItemDAO {
    async createBulk(items) {
        const { data, error } = await supabase
            .from('wholesale_bulk_order_items')
            .insert(items)
            .select();

        if (error) throw error;
        return data;
    }

    async listByOrderId(orderId) {
        const { data, error } = await supabase
            .from('wholesale_bulk_order_items')
            .select('*')
            .eq('wholesale_bulk_order_id', orderId);

        if (error) throw error;
        return data;
    }
}

export default new WholesaleBulkOrderItemDAO();
