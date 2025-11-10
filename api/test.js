import express from "express";
import cors from "cors";

const app = express();

// Test if basic server works
app.use(cors());

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Minimal test server",
    timestamp: new Date().toISOString(),
  });
});

export default app;