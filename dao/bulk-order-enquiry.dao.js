import { supabase } from '../config/supabaseClient.js';

class BulkOrderEnquiryDAO {
    async create(data) {
        const { data: record, error } = await supabase
            .from('bulk_order_enquiries')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return record;
    }

    async getById(id) {
        const { data: record, error } = await supabase
            .from('bulk_order_enquiries')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return record;
    }

    async list(filters = {}, pagination = {}) {
        const { status, page = 1, limit = 10 } = filters;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('bulk_order_enquiries')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        return { data, count };
    }

    async update(id, data) {
        const { data: record, error } = await supabase
            .from('bulk_order_enquiries')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return record;
    }
}

export default new BulkOrderEnquiryDAO();
