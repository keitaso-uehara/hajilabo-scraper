import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

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
    const json = await r.json();
    res.json({ sources: json?.data?.sources ?? [] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`OK on ${PORT}`));
