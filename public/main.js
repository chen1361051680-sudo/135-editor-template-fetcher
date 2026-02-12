const templateIdInput = document.getElementById('templateId');
const goButton = document.getElementById('goButton');
const copyButton = document.getElementById('copyButton');
const codeOutput = document.getElementById('codeOutput');
const statusText = document.getElementById('statusText');

function setStatus(message, type = 'info') {
  statusText.textContent = message || '';
  statusText.style.color =
    type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#6b7280';
}

function getCurrentIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || '';
}

function updateUrlWithId(id) {
  const params = new URLSearchParams(window.location.search);
  if (id) {
    params.set('id', id);
  } else {
    params.delete('id');
  }
  const newUrl =
    window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
  window.history.pushState({ id }, '', newUrl);
}

async function loadTemplate(id) {
  if (!id) {
    codeOutput.value = '';
    setStatus('请先输入模板编号。');
    return;
  }

  if (!/^\d+$/.test(id)) {
    setStatus('模板编号必须为数字。', 'error');
    return;
  }

  setStatus(`正在获取模板 ${id} 的 HTML，请稍候...`);
  codeOutput.value = '';

  try {
    const response = await fetch(`/api/template/${id}`);
    if (!response.ok) {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        setStatus(json.error || `获取失败（HTTP ${response.status}）`, 'error');
      } catch {
        setStatus(`获取失败（HTTP ${response.status}）`, 'error');
      }
      return;
    }

    const html = await response.text();
    codeOutput.value = html;
    setStatus(`模板 ${id} 的 HTML 已加载完成。`, 'success');
  } catch (err) {
    console.error(err);
    setStatus('请求出错，请检查网络或稍后重试。', 'error');
  }
}

function handleGo() {
  const id = templateIdInput.value.trim();
  updateUrlWithId(id);
  loadTemplate(id);
}

goButton.addEventListener('click', handleGo);

templateIdInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    handleGo();
  }
});

copyButton.addEventListener('click', async () => {
  const text = codeOutput.value;
  if (!text) {
    setStatus('当前没有可复制的代码。', 'error');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // 兼容性降级
      codeOutput.select();
      document.execCommand('copy');
    }
    setStatus('代码已复制到剪贴板。', 'success');
  } catch (err) {
    console.error(err);
    setStatus('复制失败，请手动复制文本框中的代码。', 'error');
  }
});

// 页面加载时，根据 URL 自动加载对应模板
window.addEventListener('DOMContentLoaded', () => {
  const currentId = getCurrentIdFromUrl();
  if (currentId) {
    templateIdInput.value = currentId;
    loadTemplate(currentId);
  } else {
    setStatus('请输入模板编号，然后点击「跳转并获取」。');
  }
});

