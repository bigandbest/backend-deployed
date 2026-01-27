import { supabase } from '../config/supabaseClient.js';

class WholesaleBulkOrderDAO {
    async create(data) {
        const { data: record, error } = await supabase
            .from('wholesale_bulk_orders')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return record;
    }

    async getById(id) {
        const { data: record, error } = await supabase
            .from('wholesale_bulk_orders')
            .select(`
                *,
                wholesale_bulk_order_items(*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        return record;
    }

    async list(filters = {}, pagination = {}) {
        const { status, page = 1, limit = 10, isDeleted = false } = filters;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('wholesale_bulk_orders')
            .select(`
                *,
                wholesale_bulk_order_items(count)
            `, { count: 'exact' })
            .eq('is_deleted', isDeleted)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status && status !== 'all') {
            query = query.eq('order_status', status);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        return { data, count };
    }

    async update(id, data) {
        const { data: record, error } = await supabase
            .from('wholesale_bulk_orders')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return record;
    }

    async delete(id) {
        const { error } = await supabase
            .from('wholesale_bulk_orders')
            .update({ is_deleted: true })
            .eq('id', id);

        if (error) throw error;
        return true;
    }
}

export default new WholesaleBulkOrderDAO();
