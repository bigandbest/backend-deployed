import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";

// List of authorized admin emails
const ADMIN_EMAILS = [
  "bigandbestmart@gmail.com",
  // Add more admin emails here as needed
];

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Check if the user is an admin
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

    if (!isAdmin) {
      // Sign out the user if they're not an admin
      await supabase.auth.signOut();
      return res.status(403).json({ 
        success: false, 
        error: "You do not have admin privileges" 
      });
    }

    // Add admin role to user_metadata in the response
    const userWithRole = {
      ...data.user,
      user_metadata: {
        ...data.user.user_metadata,
        role: "admin"
      }
    };

    res.json({
      success: true,
      user: userWithRole,
      session: data.session,
    });
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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Check if the user is an admin
    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());

    if (!isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: "You do not have admin privileges" 
      });
    }

    // Add admin role to user_metadata in the response
    const userWithRole = {
      ...user,
      user_metadata: {
        ...user.user_metadata,
        role: "admin"
      }
    };

    res.json({ success: true, user: userWithRole });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

