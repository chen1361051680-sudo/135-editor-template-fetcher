const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// 静态资源：前端页面
app.use(express.static(path.join(__dirname, 'public')));

// API：使用无头浏览器，根据模板编号获取「渲染后目标 DIV 的 outerHTML」
app.get('/api/template/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: '模板编号必须为数字' });
  }

  const targetUrl = `https://www.135editor.com/editor_styles/${id}?preview=1`;

  let browser;
  try {
    const launchOptions = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    // 只有在你显式配置了 CHROME_PATH 时，才指定 executablePath
    // 本地 Windows 可设置：CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
    // Render/Linux 建议不填，让 puppeteer 自己使用它下载的 Chromium
    if (process.env.CHROME_PATH) {
      launchOptions.executablePath = process.env.CHROME_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );

    // 打开页面并等待网络空闲，确保大部分资源加载完成
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 再额外等一小会儿，给页面脚本一个渲染时间缓冲
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const selectors = [
      'div#fullpage.mg-content',
      'div#fullpage',
      'div.mg-content',
      '#fullpage .mg-content',
      '.mg-content'
    ];

    // 在浏览器环境中查找目标 DIV，并返回运行时 DOM 的 outerHTML
    const outerHtml = await page.evaluate((sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el) return el.outerHTML;
      }
      return null;
    }, selectors);

    if (!outerHtml) {
      return res
        .status(404)
        .json({ error: '未在页面中找到模板主 DIV，请检查页面结构是否有变化。' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(outerHtml.trim());
  } catch (error) {
    console.error('使用无头浏览器获取模板失败：', error);
    res.status(500).json({
      error: '使用无头浏览器获取模板失败，请确认编号是否有效或稍后重试。'
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // ignore
      }
    }
  }
});

// Render/容器环境建议绑定 0.0.0.0，确保外部可访问
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
