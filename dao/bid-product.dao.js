import { supabase } from '../config/supabaseClient.js';

class BidProductDAO {
    async createBulk(items) {
        const { data, error } = await supabase
            .from('bid_products')
            .insert(items)
            .select();

        if (error) throw error;
        return data;
    }

    async deleteByBidId(bidId) {
        const { data, error } = await supabase
            .from('bid_products')
            .delete()
            .eq('bid_id', bidId);

        if (error) throw error;
        return data;
    }

    async listByBidId(bidId) {
        const { data, error } = await supabase
            .from('bid_products')
            .select('*')
            .eq('bid_id', bidId);

        if (error) throw error;
        return data;
    }
}

export default new BidProductDAO();
