import { supabase } from '../config/supabaseClient.js';

// Get current session and user profile
export const getCurrentSession = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Fetch user profile from database
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user profile',
      });
    }

    res.json({
      success: true,
      user: userData,
      session: {
        user: {
          id: userData.id,
          email: userData.email,
        },
      },
    });
  } catch (error) {
    console.error('Get current session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get session',
    });
  }
};
