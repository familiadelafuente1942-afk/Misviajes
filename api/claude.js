export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: { message: "Método no permitido" } }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: { message: "Falta ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables)." } }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) { res.status(500).json({ error: { message: e.message || "Error en el proxy" } }); }
}
