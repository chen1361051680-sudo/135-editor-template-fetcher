/**
 * server.js
 * 135-editor-template-fetcher
 *
 * API:
 *   GET /api/template?id=169311
 * -> returns outerHTML (text/plain)
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.status(200).send("ok"));

function getTargetUrl(templateId) {
  return `https://www.135editor.com/editor_styles/${encodeURIComponent(
    templateId
  )}?preview=1`;
}

/**
 * 一组更贴近 135 预览页的候选容器
 * 找不到就退回抓 body
 */
async function tryExtractFromContext(ctx) {
  const selectors = [
    // 微信文章常见容器
    "#js_content",
    "article",
    ".rich_media_content",

    // 编辑器预览常见
    ".preview",
    ".preview-container",
    ".preview-content",
    ".editor-preview",
    ".content",
    ".page",
    "#page",
  ];

  // 稳一点，给渲染一点时间
  await ctx.waitForTimeout?.(800).catch(() => {});

  // 优先尝试命中容器
  try {
    const html = await ctx.evaluate((sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el && el.outerHTML && el.outerHTML.length > 300) {
          return el.outerHTML;
        }
      }
      // 兜底抓 body
      return document.body ? document.body.outerHTML : null;
    }, selectors);

    return html;
  } catch {
    return null;
  }
}

/**
 * 从页面里找一个“最像预览内容”的 iframe
 * 然后在 iframe 里抽取 HTML
 */
async function extractFromIframes(page) {
  const frames = page.frames();

  // 先按 URL 规则筛一遍
  const prefer = frames.find((f) => {
    const u = f.url() || "";
    return (
      u.includes("preview") ||
      u.includes("editor_styles") ||
      u.includes("style") ||
      u.includes("render")
    );
  });

  const candidates = prefer ? [prefer, ...frames.filter((f) => f !== prefer)] : frames;

  for (const frame of candidates) {
    try {
      // iframe 里也走同一套提取策略
      const html = await tryExtractFromContext(frame);
      if (html && html.length > 300) return { html, frameUrl: frame.url() };
    } catch {
      // ignore and try next frame
    }
  }

  return { html: null, frameUrl: null };
}

app.get("/api/template", async (req, res) => {
  const templateId = (req.query.id || "").toString().trim();

  if (!templateId) {
    return res.status(400).json({
      error: "缺少参数 id，例如 /api/template?id=169311",
    });
  }

  const targetUrl = getTargetUrl(templateId);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // 让站点更像正常浏览器
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1400, height: 900 });

    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    // 预览页经常还会二次渲染，多等一下
    await page.waitForTimeout(2500);

    // 1) 先从主页面尝试提取
    let html = await tryExtractFromContext(page);

    // 有些情况下抓到的是壳子，长度很短
    if (!html || html.length < 300) {
      // 2) 再从 iframe 提取
      const iframeResult = await extractFromIframes(page);
      html = iframeResult.html;

      if (!html || html.length < 300) {
        return res.status(404).json({
          error: "未能提取到有效 HTML，可能页面结构变化或需要登录权限",
          targetUrl,
          iframeUrlTried: iframeResult.frameUrl,
        });
      }
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(html.trim());
  } catch (error) {
    console.error("[/api/template] error:", error);
    res.status(500).json({
      error: "服务端抓取失败",
      message: error?.message || String(error),
      targetUrl,
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
