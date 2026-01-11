import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

// Quick test notification creation
router.post('/create-notification', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([
        {
          user_id: user_id,
          heading: 'Return Request Approved',
          description: 'Your return request has been approved. Refund processing will begin shortly.',
          related_type: 'return',
          related_id: 'test-order-123',
          notification_type: 'user',
          is_read: false,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, notification: data[0] });
  } catch (error) {
    console.error('Exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get notifications for user
router.get('/notifications/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, notifications: data });
  } catch (error) {
    console.error('Exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run migration to add quantity column to contact_queries
router.get("/migrate-contact-quantity", async (req, res) => {
  try {
    const { error } = await supabase.rpc('run_sql', {
      sql: `ALTER TABLE contact_queries ADD COLUMN IF NOT EXISTS quantity TEXT;`
    });

    // If RPC not available, try direct raw query if supported or inform user
    // Since we can't easily run raw SQL without RPC 'run_sql' or direct connection, 
    // we will try to use a dummy insert/select to check if column exists, 
    // but typically standard Supabase client doesn't support DDL.
    // HOWEVER, we can try to use the 'rpc' method if a function exists, 
    // OR we can just instruct the user to run it. 

    // BETTER APPROACH for this environment:
    // Attempt to just select the column. If it errors, we know we need it.
    // But we can't CREATE it from here with standard client unless we have a specific setup.

    // Let's assume (based on typical setup) we might need to ask user to run SQL.
    // BUT, I can try to use a postgres function if one exists for executing sql.

    // Fallback: Just return instructions if we can't auto-run.
    // Checking if we can use the 'run_migration' pattern seen in some projects.

    return res.status(200).json({
      message: "Please run this SQL in your Supabase SQL Editor:",
      sql: "ALTER TABLE contact_queries ADD COLUMN IF NOT EXISTS quantity TEXT;"
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;