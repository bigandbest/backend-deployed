import { supabase } from "../config/supabaseClient.js";

class CartAvailabilityDAO {
    async checkDeliveryAvailability(items, latitude, longitude) {
        // For now, return all items as deliverable (bypass location check)
        const deliverableProductIds = items.map(item => item.product_id);
        const undeliverableProductIds = [];
        
        return {
            deliverableProductIds,
            undeliverableProductIds
        };
    }

    async getProductsByIds(productIds) {
        const { data, error } = await supabase
            .from('products')
            .select('id, name, status')
            .in('id', productIds);
        
        if (error) throw error;
        return data;
    }
}

export default new CartAvailabilityDAO();