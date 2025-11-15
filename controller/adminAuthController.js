import { supabase } from '../config/supabaseClient.js';

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    
    res.json({ success: true, user: data.user, session: data.session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function adminLogout(req, res) {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getAdminMe(req, res) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}