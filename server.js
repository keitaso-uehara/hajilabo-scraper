import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 認証（/ と /debug-routes は公開、それ以外は X-Auth 必須）
const openPaths = new Set(["/", "/debug-routes"]);
app.use((req, res, next) => {
  const secret = process.env.SCRAPER_SECRET;
  if (secret && !openPaths.has(req.path) && req.get("X-Auth") !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// ヘルス
app.get("/", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ルート一覧（任意）
app.get("/debug-routes", (req, res) => {
  try {
    const stack = app._router?.stack || [];
    const routes = [];
    for (const mw of stack) {
      if (mw.route?.path) {
        for (const m of Object.keys(mw.route.methods)) routes.push(`${m.toUpperCase()} ${mw.route.path}`);
      }
    }
    res.json(routes);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ========== 本命：複数URLをまとめてスクレイプ ==========
app.post("/scrape", async (req, res) => {
  const { urls, onlyMainContent = true } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls[] is required" });
  }
  const token = process.env.FIRECRAWL_API_KEY;
  if (!token) return res.status(500).json({ error: "FIRECRAWL_API_KEY not set" });

  try {
    // 1) ジョブ作成
    const start = await fetch("https://api.firecrawl.dev/v2/batch/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        urls,
        formats: ["markdown", "links"],
        onlyMainContent
      })
    });

    const startText = await start.text();
    if (!start.ok) return res.status(502).json({ step: "start", upstreamStatus: start.status, upstream: startText });
    let { id } = JSON.parse(startText) || {};
    if (!id) return res.status(502).json({ step: "start", error: "no job id", upstream: startText });

    // 2) ポーリング（最大 N 回 / interval ms）
    const MAX_TRIES = Number(process.env.FIRECRAWL_MAX_TRIES || 20);     // ~40秒想定
    const INTERVAL_MS = Number(process.env.FIRECRAWL_POLL_MS || 2000);   // 2秒ごと
    let resp, tries = 0;

    while (tries < MAX_TRIES) {
      await new Promise(r => setTimeout(r, INTERVAL_MS));
      const r2 = await fetch(`https://api.firecrawl.dev/v2/batch/scrape/${id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const txt = await r2.text();
      try { resp = JSON.parse(txt); } catch { resp = { raw: txt }; }

      if (resp?.status === "completed") break;
      if (resp?.status === "failed") {
        // 失敗詳細（任意）
        return res.status(502).json({ step: "poll", status: resp?.status, upstream: resp });
      }
      tries++;
    }

    if (!resp || resp?.status !== "completed") {
      return res.status(504).json({ step: "poll", error: "timeout", last: resp });
    }

    // 3) 正規化：data[] -> sources[]
    // resp.data = [ { markdown, links, metadata:{ sourceURL, statusCode, error?... } }, ... ]
    const sources = (resp.data || []).map(d => ({
      url: d?.metadata?.sourceURL,
      statusCode: d?.metadata?.statusCode,
      error: d?.metadata?.error || null,
      markdown: d?.markdown || "",
      links: Array.isArray(d?.links) ? d.links : []
    }));

    return res.json({
      jobId: id,
      count: sources.length,
      sources
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`OK on ${PORT}`));