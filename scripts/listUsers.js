import { supabase } from '../config/supabaseClient.js';

async function listUsers() {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('Error listing users:', error);
    } else {
      console.log('Users:', data.users);
      const admin = data.users.find(u => u.email === 'bigandbestmart@gmail.com');
      if (admin) {
        console.log('Admin user ID:', admin.id);
      }
    }
  } catch (error) {
    console.error('Script error:', error);
  }
}

listUsers();