import { supabase } from '../config/supabaseClient.js';

class BulkWholesaleSettingsDAO {
    async listByProductId(productId, enabledOnly = true) {
        let query = supabase
            .from('bulk_wholesale_settings')
            .select('*')
            .eq('product_id', String(productId))
            .order('sort_order', { ascending: true });

        if (enabledOnly) {
            query = query.eq('is_bulk_enabled', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async listAllEnabled() {
        const { data, error } = await supabase
            .from('bulk_wholesale_settings')
            .select('*')
            .eq('is_bulk_enabled', true)
            .order('product_id')
            .order('sort_order');

        if (error) throw error;
        return data;
    }

    async deleteByProductId(productId) {
        const { error } = await supabase
            .from('bulk_wholesale_settings')
            .delete()
            .eq('product_id', String(productId));

        if (error) throw error;
        return true;
    }

    async createBulk(items) {
        const { data, error } = await supabase
            .from('bulk_wholesale_settings')
            .insert(items)
            .select();

        if (error) throw error;
        return data;
    }
}

export default new BulkWholesaleSettingsDAO();
