import { supabase } from '../config/supabaseClient.js';

class BulkProductSettingsDAO {
    async getSettings(productId, variantId = null) {
        let query = supabase
            .from('bulk_product_settings')
            .select('*')
            .eq('product_id', productId);

        if (variant_id) {
            query = query.eq('variant_id', variantId);
        } else {
            query = query.is('variant_id', null);
        }

        const { data, error } = await query;
        if (error && !error.message.includes('does not exist')) throw error;
        return data || [];
    }

    async getByVariantId(variantId) {
        const { data, error } = await supabase
            .from('bulk_product_settings')
            .select(`
                *,
                product_variants (*)
            `)
            .eq('variant_id', variantId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    async listAllWithProducts() {
        const { data, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                image,
                price,
                bulk_product_settings (*),
                product_variants (*)
            `)
            .order('name');

        if (error) throw error;
        return data;
    }

    async findExisting(productId, variantId = null) {
        let query = supabase
            .from('bulk_product_settings')
            .select('id')
            .eq('product_id', productId);

        if (variantId) {
            query = query.eq('variant_id', variantId);
        } else {
            query = query.is('variant_id', null);
        }

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data;
    }

    async create(data) {
        const { data: record, error } = await supabase
            .from('bulk_product_settings')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return record;
    }

    async update(id, data) {
        const { data: record, error } = await supabase
            .from('bulk_product_settings')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return record;
    }
}

export default new BulkProductSettingsDAO();
