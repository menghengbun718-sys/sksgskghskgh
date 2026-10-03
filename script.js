document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle?.querySelector('.theme-toggle-icon');
  const themeText = themeToggle?.querySelector('.theme-toggle-text');
  const savedTheme = localStorage.getItem('mengheng-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      themeIcon.textContent = '☀️';
      themeText.textContent = 'Light';
    } else {
      themeIcon.textContent = '🌙';
      themeText.textContent = 'Theme';
    }
    localStorage.setItem('mengheng-theme', theme);
  }

  applyTheme(initialTheme);

  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  initHeroShader();

  const grid = document.getElementById('productGrid');
  const cards = Array.from(grid.querySelectorAll('.product-card'));
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterButton = document.getElementById('filterButton');
  const filterMenu = document.getElementById('filterMenu');

  let activeFilter = 'all';

  // --- Mark out-of-stock buttons so they can't be clicked ---
  grid.querySelectorAll('.download-button').forEach((btn) => {
    if (btn.textContent.toUpperCase().includes('NO IN STOCK')) {
      btn.classList.add('out-of-stock');
      btn.removeAttribute('href');
    }
  });

  // --- Filter dropdown open/close ---
  filterButton.addEventListener('click', () => {
    const isOpen = filterMenu.classList.toggle('open');
    filterButton.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!filterButton.contains(e.target) && !filterMenu.contains(e.target)) {
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
    }
  });

  filterMenu.querySelectorAll('button[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterMenu.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterButton.firstChild.textContent = btn.textContent.trim() + ' ';
      filterMenu.classList.remove('open');
      filterButton.setAttribute('aria-expanded', 'false');
      applyFilters();
    });
  });

  // --- Search ---
  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const status = (card.dataset.status || '').toLowerCase();
      const category = (card.dataset.category || '').toLowerCase();
      const matchesStatus =
        activeFilter === 'all' ||
        (activeFilter === 'free' && status === 'free') ||
        (activeFilter === 'sell' && status === 'sell') ||
        category === activeFilter.toLowerCase();
      const matchesSearch = !query || (card.dataset.search || '').toLowerCase().includes(query);
      const visible = matchesStatus && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount++;
    });

    emptyState.hidden = visibleCount !== 0;
  }

  // --- Downloads ---
  // Real files use plain <a href="..." download> links and need no JS.
  // This only handles leftover placeholder <button> cards with data-content.
  grid.querySelectorAll('button.download-button[data-content]').forEach((button) => {
    button.addEventListener('click', () => {
      const fileName = button.dataset.file || 'mengheng-download.txt';
      const content = (button.dataset.content || '').replace(/\\n/g, '\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const originalLabel = button.innerHTML;
      button.classList.add('done');
      button.innerHTML = 'Downloaded <span>&#10003;</span>';
      setTimeout(() => {
        button.classList.remove('done');
        button.innerHTML = originalLabel;
      }, 1800);
    });
  });

  // --- Requirements / payment modal for real-file download links ---
  const specsOverlay = document.getElementById('specsOverlay');
  const specsTitle = document.getElementById('specsModalTitle');
  const specsLine = document.getElementById('specsModalSpecs');
  const specsConfirm = document.getElementById('specsConfirm');
  const specsClose = document.getElementById('specsClose');
  const specsCancel = document.getElementById('specsCancel');
  const specsQRWrap = document.getElementById('specsQRWrap');
  const specsQR = document.getElementById('specsQR');
  const specsPrice = document.getElementById('specsPrice');
  const specsStatus = document.getElementById('specsStatus');
  const PAYMENT_STEP_MS = 5000;
  const PAYMENT_TOTAL_MS = PAYMENT_STEP_MS * 2;
  const PENDING_KEY = 'mengheng_pending_downloads';
  let activePaymentLink = null;
  let paymentTimer = null;

  function readPendingDownloads() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function savePendingDownloads(data) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(data));
  }

  function getProductKey(link) {
    return link.dataset.name || link.getAttribute('href') || link.textContent.trim();
  }

  function sendActivityLog(event, link) {
    const isLocalPage = window.location.protocol === 'file:' ||
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const logEndpoint = isLocalPage
      ? 'http://127.0.0.1:8001/api/log'
      : '/api/log';
    fetch(logEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        product: getProductKey(link),
        price: link.dataset.price || 'Not specified',
      }),
    }).then(async (response) => {
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Activity log failed (${response.status}): ${details}`);
      }
    }).catch((error) => {
      console.error('Could not send Telegram activity log:', error);
    });
  }

  function isProductPending(link) {
    const data = readPendingDownloads();
    const key = getProductKey(link);
    const entry = data[key];
    if (!entry) return false;
    if (Date.now() >= Number(entry.expiresAt || 0)) {
      delete data[key];
      savePendingDownloads(data);
      return false;
    }
    return true;
  }

  function setProductWaiting(link) {
    const key = getProductKey(link);
    const data = readPendingDownloads();
    const startedAt = Date.now();
    data[key] = {
      readyAt: startedAt + PAYMENT_STEP_MS,
      expiresAt: startedAt + PAYMENT_TOTAL_MS,
    };
    savePendingDownloads(data);
    if (!link.dataset.originalLabel) {
      link.dataset.originalLabel = link.innerHTML;
    }
    if (!Object.prototype.hasOwnProperty.call(link.dataset, 'originalHref')) {
      link.dataset.originalHref = link.getAttribute('href') || '';
    }
    link.dataset.pending = 'true';
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
  }

  function closeSpecs() {
    specsOverlay.classList.remove('open');
  }

  function cancelPayment() {
    const link = activePaymentLink;
    clearTimeout(paymentTimer);
    paymentTimer = null;

    if (link) {
      const data = readPendingDownloads();
      delete data[getProductKey(link)];
      savePendingDownloads(data);
      link.dataset.pending = 'false';
      link.dataset.unlocked = 'false';
      link.removeAttribute('aria-disabled');
      link.style.pointerEvents = '';
      link.style.opacity = '';
      if (Object.prototype.hasOwnProperty.call(link.dataset, 'originalHref')) {
        link.setAttribute('href', link.dataset.originalHref);
      }
      if (link.dataset.originalLabel) {
        link.innerHTML = link.dataset.originalLabel;
      }
      delete link.dataset.originalLabel;
      delete link.dataset.originalHref;
    }

    activePaymentLink = null;
    closeSpecs();
  }

  // Turns the card's own button into a real, ready-to-click download link.
  function unlockProductButton(link) {
    const key = getProductKey(link);
    const data = readPendingDownloads();
    delete data[key];
    savePendingDownloads(data);
    link.dataset.pending = 'false';
    link.dataset.unlocked = 'true';
    link.removeAttribute('aria-disabled');
    link.style.pointerEvents = '';
    link.style.opacity = '';
    const downloadLink = link.dataset.downloadLink || link.getAttribute('href') || '#';
    link.setAttribute('href', downloadLink);
    if (link.dataset.downloadFile) {
      link.setAttribute('download', link.dataset.downloadFile);
    }
    link.innerHTML = 'Download <span>&#8595;</span>';
  }

  // Step 1: shows the "Generate QR" button. No QR yet, no timer yet.
  function openPaymentModal(link) {
    activePaymentLink = link;
    sendActivityLog('buy_clicked', link);

    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    specsQRWrap.hidden = true;
    specsQR.src = '';

    specsPrice.textContent = link.dataset.price || 'Payment required';
    specsStatus.textContent = 'Click below to generate your payment QR code. | ចុចខាងក្រោមដើម្បីបង្កើត QR ទូទាត់ប្រាក់';

    specsConfirm.hidden = false;
    specsConfirm.removeAttribute('aria-disabled');
    specsConfirm.classList.remove('disabled');
    specsConfirm.innerHTML = 'Generate QR <span>&#8595;</span>';
    specsConfirm.href = '#';
    specsConfirm.removeAttribute('download');
    specsConfirm.dataset.mode = 'generate';
    specsConfirm.dataset.productKey = getProductKey(link);

    specsOverlay.classList.add('open');
  }

  function showReadyToPay(link) {
    const stillOpen = specsOverlay.classList.contains('open') &&
      specsConfirm.dataset.productKey === getProductKey(link);
    if (!stillOpen) return;

    specsStatus.textContent = 'Ready to pay. Download will appear in 5 seconds.';
    specsConfirm.hidden = false;
    specsConfirm.innerHTML = 'Ready to Pay';
    specsConfirm.href = '#';
    specsConfirm.removeAttribute('target');
    specsConfirm.removeAttribute('rel');
    specsConfirm.removeAttribute('download');
    specsConfirm.removeAttribute('aria-disabled');
    specsConfirm.classList.remove('disabled');
    specsConfirm.dataset.mode = 'ready';
  }

  function schedulePaymentStages(link, readyDelay) {
    clearTimeout(paymentTimer);
    paymentTimer = setTimeout(() => {
      showReadyToPay(link);
      const data = readPendingDownloads();
      const entry = data[getProductKey(link)];
      const remaining = Math.max(0, Number(entry?.expiresAt || Date.now()) - Date.now());
      paymentTimer = setTimeout(() => finishPayment(link), remaining);
    }, Math.max(0, readyDelay));
  }

  // Step 2: reveals the QR code and starts the two 20-second stages.
  function generateQR(link) {
    const paymentQR = link.dataset.paymentQr;
    specsQR.src = paymentQR || '';
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = !paymentQR;

    specsStatus.textContent = 'Scan the QR code to complete your payment. Your download link will appear automatically. | សូមស្កេន QR ដើម្បីទូទាត់ ប៊ូតុងទាញយកនឹងលេចឡើងដោយស្វ័យប្រវត្តិ';

    // Hide the next-step button until the first 20-second stage completes.
    specsConfirm.hidden = true;
    specsConfirm.dataset.mode = 'waiting';

    setProductWaiting(link);
    sendActivityLog('qr_generated', link);

    schedulePaymentStages(link, PAYMENT_STEP_MS);
  }

  // Called once the 20s wait is over: unlocks the card button and,
  // if the modal for this product is still open, reveals the Download button in it.
  function finishPayment(link) {
    unlockProductButton(link);
    sendActivityLog('download_ready', link);

    const stillOpen = specsOverlay.classList.contains('open') &&
      specsConfirm.dataset.productKey === getProductKey(link);

    if (stillOpen) {
      specsStatus.textContent = 'Payment confirmed. Your download is ready.';
      specsConfirm.hidden = false;
      specsConfirm.innerHTML = 'Download <span>&#8595;</span>';
      specsConfirm.removeAttribute('aria-disabled');
      specsConfirm.classList.remove('disabled');
      const destination = link.dataset.downloadLink || link.getAttribute('href') || '#';
      specsConfirm.href = destination;
      if (/^https?:\/\//i.test(destination)) {
        specsConfirm.target = '_blank';
        specsConfirm.rel = 'noopener noreferrer';
      } else {
        specsConfirm.removeAttribute('target');
        specsConfirm.removeAttribute('rel');
      }
      specsConfirm.setAttribute('download', link.dataset.downloadFile || link.getAttribute('download') || '');
      specsConfirm.dataset.mode = 'download';
    }

    paymentTimer = null;
    if (activePaymentLink === link) activePaymentLink = null;
  }

  // Re-shows the QR/waiting screen for a product that is already pending
  // (e.g. the customer closed the modal and clicked the card again).
  function openWaitingModal(link) {
    specsTitle.textContent = link.dataset.name || 'This product';
    specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');

    const paymentQR = link.dataset.paymentQr;
    specsQR.src = paymentQR || '';
    specsQR.alt = `${specsTitle.textContent} payment QR code`;
    specsQRWrap.hidden = !paymentQR;

    specsPrice.textContent = link.dataset.price || 'Payment required';
    specsStatus.textContent = 'Scan the QR code to complete your payment. Your download link will appear automatically. | សូមស្កេន QR ដើម្បីទូទាត់ ប៊ូតុងទាញយកនឹងលេចឡើងដោយស្វ័យប្រវត្តិ';

    specsConfirm.dataset.productKey = getProductKey(link);
    activePaymentLink = link;

    specsOverlay.classList.add('open');

    const entry = readPendingDownloads()[getProductKey(link)];
    const readyAt = Number(entry?.readyAt || Date.now() + PAYMENT_STEP_MS);
    if (Date.now() >= readyAt) {
      showReadyToPay(link);
      schedulePaymentStages(link, 0);
    } else {
      specsConfirm.hidden = true;
      specsConfirm.dataset.mode = 'waiting';
      schedulePaymentStages(link, readyAt - Date.now());
    }
  }

  function openFreeDownloadModal(link) {
    specsTitle.textContent = link.dataset.name || 'This product';
    if (link.dataset.specsList) {
      specsLine.innerHTML = `<ul class="specs-list">${link.dataset.specsList.split('|').map((spec) => `<li>${spec}</li>`).join('')}</ul>`;
    } else {
      specsLine.textContent = (link.dataset.specs || '').replace(/\\n/g, '\n');
    }
    specsQRWrap.hidden = true;
    specsPrice.textContent = '';
    specsStatus.textContent = 'Ready to download';
    specsConfirm.hidden = false;
    specsConfirm.innerHTML = 'Download <span>&#8595;</span>';
    const destination = link.getAttribute('href');
    specsConfirm.href = destination;
    if (/^https?:\/\//i.test(destination || '')) {
      specsConfirm.target = '_blank';
      specsConfirm.rel = 'noopener noreferrer';
    } else {
      specsConfirm.removeAttribute('target');
      specsConfirm.removeAttribute('rel');
    }
    specsConfirm.setAttribute('download', link.getAttribute('download') || '');
    specsConfirm.dataset.mode = 'download';

    specsOverlay.classList.add('open');
  }

  // Restore state after a page reload (payment pending, or already unlocked).
  function restorePendingState(link) {
    if (!link.dataset.paymentQr) return;
    const key = getProductKey(link);
    const data = readPendingDownloads();
    const entry = data[key];
    if (!entry) return;
    const msLeft = Number(entry.expiresAt || 0) - Date.now();
    if (msLeft <= 0) {
      delete data[key];
      savePendingDownloads(data);
      return;
    }
    link.dataset.pending = 'true';
    if (!link.dataset.originalLabel) {
      link.dataset.originalLabel = link.innerHTML;
    }
    link.textContent = 'Waiting...';
    link.setAttribute('aria-disabled', 'true');
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.75';
    const readyAt = Number(entry.readyAt || (Number(entry.expiresAt || 0) - PAYMENT_STEP_MS));
    if (Date.now() >= readyAt) {
      schedulePaymentStages(link, 0);
    } else {
      schedulePaymentStages(link, readyAt - Date.now());
    }
  }

  grid.querySelectorAll('a.download-button[data-specs]:not(.out-of-stock)').forEach((link) => {
    restorePendingState(link);

    link.addEventListener('click', (e) => {
      // Already unlocked: it's now a normal working download link, let it through.
      if (link.dataset.unlocked === 'true') {
        return;
      }

      // Still waiting on a payment started earlier: reopen the waiting screen.
      if (link.dataset.pending === 'true') {
        e.preventDefault();
        openWaitingModal(link);
        return;
      }

      // External free links should leave the site directly in a new tab.
      if (!link.dataset.paymentQr && /^https?:\/\//i.test(link.href)) {
        return;
      }

      e.preventDefault();
      if (link.dataset.paymentQr) {
        openPaymentModal(link);
      } else {
        openFreeDownloadModal(link);
      }
    });
  });

  specsConfirm.addEventListener('click', (e) => {
    if (specsConfirm.dataset.mode === 'generate') {
      e.preventDefault();
      generateQR(activePaymentLink);
      return;
    }

    if (specsConfirm.dataset.mode === 'ready') {
      e.preventDefault();
      specsStatus.textContent = 'Waiting... Download will appear in 5 seconds.';
      specsConfirm.innerHTML = 'Waiting...';
      specsConfirm.setAttribute('aria-disabled', 'true');
      specsConfirm.classList.add('disabled');
      specsConfirm.dataset.mode = 'waiting';
      return;
    }

    // 'waiting' mode: button is hidden, so this shouldn't fire.
    // 'download' mode: it's a real download link — let it through, then close.
    setTimeout(closeSpecs, 200);
  });

  specsClose.addEventListener('click', () => {
    cancelPayment();
  });
  specsCancel.addEventListener('click', cancelPayment);
  specsOverlay.addEventListener('click', (e) => {
    if (e.target === specsOverlay) cancelPayment();
  });
});

function initHeroShader() {
  const canvas = document.getElementById('canvas');
  const image = document.getElementById('sourceImage');
  if (!canvas || !image) return;

  const gl = canvas.getContext('webgl', { premultipliedAlpha: false });
  if (!gl) return;

  const vertexSource = `attribute vec2 position; varying vec2 uv; void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
  const fragmentSource = `precision mediump float;
    uniform vec2 resolution; uniform float time; uniform vec2 mouse; uniform sampler2D image;
    varying vec2 uv;
    void main() {
      vec2 centered = uv - 0.5;
      float distanceFromMouse = length(centered - (mouse - 0.5) * 0.25);
      float lens = smoothstep(0.75, 0.05, distanceFromMouse) * 0.035;
      vec2 warped = uv + normalize(centered + 0.001) * lens * sin(time * 0.35);
      float scan = sin((uv.y + time * 0.025) * 18.0) * 0.008;
      vec4 color = texture2D(image, warped + vec2(scan, 0.0));
      float light = 0.10 * sin(time * 0.45 + uv.x * 5.0) + 0.08 * (1.0 - distanceFromMouse);
      gl_FragColor = vec4(color.rgb + light, 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const mouse = gl.getUniformLocation(program, 'mouse');
  let pointer = { x: 0.5, y: 0.5 };
  canvas.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: (event.clientX - bounds.left) / bounds.width, y: 1 - (event.clientY - bounds.top) / bounds.height };
  });

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize); resize();

  function render(now) {
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, now * 0.001); gl.uniform2f(mouse, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); requestAnimationFrame(render);
  }
  image.addEventListener('load', () => {
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    requestAnimationFrame(render);
  });
  if (image.complete) image.dispatchEvent(new Event('load'));
}
