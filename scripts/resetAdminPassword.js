import { supabase } from '../config/supabaseClient.js';

async function resetAdminPassword() {
  try {
    const { data, error } = await supabase.auth.admin.updateUserById(
      'c804c112-6393-4737-8058-153a6e639c6c',
      { password: 'vikas1234' }
    );

    if (error) {
      console.error('Error resetting password:', error);
    } else {
      console.log('Password reset successfully:', data);
    }
  } catch (error) {
    console.error('Script error:', error);
  }
}

resetAdminPassword();