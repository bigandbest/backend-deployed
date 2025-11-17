import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";

export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    // For simplicity, hardcode admin credentials (in production, use proper auth)
    if (email === "admin@gmail.com" && password === "admin123") {
      const payload = {
        _id: "690a497b61316fae052f181b",
        email: email,
        role: "admin",
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" }
      );

      res.json({
        success: true,
        user: payload,
        session: { access_token: token },
      });
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Invalid credentials" });
    }
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

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
