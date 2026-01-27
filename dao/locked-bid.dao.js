import { supabase } from '../config/supabaseClient.js';

class LockedBidDAO {
    async create(data) {
        const { data: record, error } = await supabase
            .from('locked_bids')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return record;
    }

    async getById(id) {
        const { data: record, error } = await supabase
            .from('locked_bids')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return record;
    }

    async getActiveByUser(userId) {
        const { data: record, error } = await supabase
            .from('locked_bids')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'PENDING_PAYMENT')
            .maybeSingle();

        if (error) throw error;
        return record;
    }

    async updateStatus(id, status, extraData = {}) {
        const { data: record, error } = await supabase
            .from('locked_bids')
            .update({ status, ...extraData })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return record;
    }
}

export default new LockedBidDAO();
