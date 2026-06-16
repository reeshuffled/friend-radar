import { Router } from "express";
import { getAuthUrl, exchangeCode } from "../google.js";
import { getAuth } from "../db/queries.js";

const router = Router();

// Redirect to Google's OAuth consent screen
router.get("/google", (req, res) => {
  res.redirect(getAuthUrl());
});

// Google redirects here after user grants access
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code) return res.status(400).send("No code returned.");

  try {
    const email = await exchangeCode(code);
    res.send(`<!DOCTYPE html><html><body><p>Connected as ${email}…</p><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'google-auth-complete', email: ${JSON.stringify(email)} }, '*');
        window.close();
      } else {
        document.body.innerHTML = '<h2>Connected as ${email}</h2><p>You can close this tab.</p>';
      }
    </script></body></html>`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Failed to exchange code.");
  }
});

// Status check — the React app can poll this to know if auth is set up
router.get("/status", (req, res) => {
  const auth = getAuth();
  res.json({ connected: !!auth, email: auth?.gmail_address ?? null });
});

export default router;
