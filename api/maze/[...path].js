const BACKEND_URL = process.env.MAZE_BACKEND_URL || "http://fi10.bot-hosting.net:21204";

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const target = `${BACKEND_URL.replace(/\/$/, "")}/api/maze/${path}`;

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: "Maze backend unavailable" });
  }
}
