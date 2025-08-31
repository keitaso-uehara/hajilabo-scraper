import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ヘルス（GET /）
app.get("/", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ルート一覧（認証より前）

// （任意）簡易認証：SCRAPER_SECRET があるときだけ有効
app.use((req, res, next) => {
  const secret = process.env.SCRAPER_SECRET;
  if (secret && req.get("X-Auth") !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// 本命: スクレイプ
app.post("/scrape", async (req, res) => {
  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls[] is required" });
  }
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({
        urls,
        showSources: true,
        scrapeOptions: { formats: ["markdown","links"], onlyMainContent: true }
      })
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!r.ok) return res.status(502).json({ upstreamStatus: r.status, upstream: json });
    return res.json({ sources: json?.data?.sources ?? [] });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`OK on ${PORT}`));
app.get("/debug-routes", (req, res) => {
  try {
    const stack = (app._router?.stack || []);
    const routes = [];
    for (const mw of stack) {
      if (mw.route && mw.route.path) {
        const methods = Object.keys(mw.route.methods).map(m=>m.toUpperCase());
        for (const m of methods) routes.push(`${m} ${mw.route.path}`);
      } else if (mw.name === "router" && mw.handle?.stack) {
        for (const r of mw.handle.stack) {
          if (r.route) {
            const methods = Object.keys(r.route.methods).map(m=>m.toUpperCase());
            for (const m of methods) routes.push(`${m} ${r.route.path}`);
          }
        }
      }
    }
    res.json(routes);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
