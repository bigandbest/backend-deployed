import { supabase } from '../config/supabaseClient.js';

async function createAdmin() {
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: 'bigandbestmart@gmail.com',
      password: 'vikas1234',
      email_confirm: true
    });

    if (error) {
      console.error('Error creating admin:', error);
    } else {
      console.log('Admin user created successfully:', data);
    }
  } catch (error) {
    console.error('Script error:', error);
  }
}

createAdmin();