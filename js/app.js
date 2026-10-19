(() => {
  'use strict';

  const CFG = window.KAHWIN_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // localStorage can throw (private mode, blocked storage) — never let it break the app
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('kahwincam:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('kahwincam:' + k, JSON.stringify(v)); return true; } catch { return false; }
    },
  };

  const els = {
    video: $('#video'), stage: $('#stage'), vf: $('#viewfinder'), countdown: $('#countdown'),
    flash: $('#flash'), camError: $('#camError'), progress: $('#progress'), panel: $('#panel'),
    shutter: $('#shutterBtn'), gallery: $('#galleryBtn'), reset: $('#resetBtn'), file: $('#fileInput'),
    resultImg: $('#resultImg'), status: $('#uploadStatus'), del: $('#deleteBtn'), retry: $('#retryBtn'),
    mineGrid: $('#mineGrid'), mineCount: $('#mineCount'), guest: $('#guestName'), toast: $('#toast'),
    start: $('#startBtn'), pickBtn: $('#pickBtn'), pick: $('#pickPreview'),
  };

  const S = {
    frame: null, layout: 1, filter: Filters.list[0], facing: 'user', deviceId: null,
    stream: null, shots: [], busy: false, cancel: false,
    mode: 'camera', // 'camera' = live viewfinder, 'picked' = previewing photos from the gallery
    result: null, // { blob, url, canvas, id, token, status }
  };

  let frames = [];
  let current = 'home';
  let camRequest = 0;
  const placeholders = Frames.placeholders();

  const fontsReady = Promise.race([
    Promise.all([
      '400 100px "Great Vibes"',
      '500 40px "Cormorant Garamond"',
      '600 40px "Cormorant Garamond"',
      '400 30px "Poppins"',
    ].map((f) => document.fonts.load(f))).catch(() => {}),
    sleep(4000),
  ]);

  // ---------- small UI helpers ----------
  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function show(id) {
    current = id;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
    if (id === 'camera') {
      if (S.mode === 'picked') {
        requestAnimationFrame(renderPick);
      } else {
        startCamera();
        requestAnimationFrame(fitViewfinder);
      }
    } else {
      S.cancel = true;
      stopCamera();
    }
    if (id === 'mine') renderMine();
    if (id === 'home') updateMineCount();
  }

  function fillText() {
    document.querySelectorAll('[data-text]').forEach((el) => { el.textContent = CFG[el.dataset.text] || ''; });
    if (CFG.couple) document.title = `Kahwin Cam · ${CFG.couple}`;
  }

  // ---------- music ----------
  function syncMusicButtons() {
    const on = Music.playing;
    document.querySelectorAll('.music-toggle').forEach((b) => {
      b.classList.toggle('off', !on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- options panel ----------
  function makeOpt(cls, label, onClick) {
    const b = document.createElement('button');
    b.className = 'opt ' + cls;
    b.onclick = onClick;
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    return b;
  }

  function renderFrameOptions() {
    const wrap = $('#opt-frame');
    wrap.innerHTML = '';
    frames.forEach((f) => {
      const b = makeOpt('frame-opt', f.name, () => setFrame(f));
      b.dataset.id = f.id;
      b.prepend(Frames.compose({ frame: f, layout: S.layout, shots: placeholders, scale: 0.1 }));
      wrap.append(b);
    });
    markSelected();
  }

  function renderFilterOptions() {
    const wrap = $('#opt-filter');
    wrap.innerHTML = '';
    Filters.list.forEach((f) => {
      const b = makeOpt('filter-opt', f.name, () => setFilter(f));
      b.dataset.id = f.id;
      const sw = document.createElement('i');
      sw.className = 'swatch';
      sw.style.filter = Filters.css(f);
      b.prepend(sw);
      wrap.append(b);
    });
  }

  function renderLayoutOptions() {
    const wrap = $('#opt-layout');
    wrap.classList.add('layout-options');
    wrap.innerHTML = '';
    [1, 2, 4].forEach((n) => {
      const b = makeOpt('layout-opt', `${n} gambar`, () => setLayout(n));
      b.dataset.id = String(n);
      const lay = document.createElement('i');
      lay.className = 'lay l' + n;
      lay.innerHTML = '<span></span>'.repeat(n);
      b.prepend(lay);
      wrap.append(b);
    });
  }

  function markSelected() {
    const mark = (sel, id) => document.querySelectorAll(sel).forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    mark('#opt-frame .opt', S.frame && S.frame.id);
    mark('#opt-filter .opt', S.filter.id);
    mark('#opt-layout .opt', String(S.layout));
  }

  function discardShots() {
    if (S.shots.length) {
      S.shots = [];
      toast('Gambar tadi dibuang');
    }
    updateProgress();
  }

  function setFrame(f) {
    if (S.busy || f === S.frame) return;
    S.frame = f;
    store.set('frame', f.id);
    markSelected();
    if (S.mode === 'picked') {
      renderPick();
    } else {
      discardShots();
      fitViewfinder();
    }
  }

  function setLayout(n) {
    if (S.busy || n === S.layout) return;
    S.layout = n;
    store.set('layout', n);
    renderFrameOptions();
    if (S.mode === 'picked') {
      renderPick();
    } else {
      discardShots();
      fitViewfinder();
    }
  }

  function setFilter(f) {
    S.filter = f;
    store.set('filter', f.id);
    els.video.style.filter = Filters.css(f);
    markSelected();
    renderPick();
  }

  function updateProgress() {
    const n = S.layout, k = S.shots.length;
    const label = S.mode === 'picked' ? `${Math.min(k, n)}/${n}` : `${Math.min(k + 1, n)}/${n}`;
    els.progress.innerHTML = n === 1 ? '' :
      Array.from({ length: n }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('') +
      `<span>${label}</span>`;
  }

  // ---------- gallery photos ----------
  function setMode(mode) {
    S.mode = mode;
    const picked = mode === 'picked';
    els.vf.hidden = picked;
    els.pick.hidden = !picked;
    els.shutter.classList.toggle('send', picked);
    els.shutter.setAttribute('aria-label', picked ? 'Hantar gambar' : 'Ambil gambar');
    $('#flipBtn').style.visibility = picked ? 'hidden' : '';
    if (current === 'camera') {
      if (picked) {
        S.cancel = true;
        stopCamera();
        requestAnimationFrame(renderPick);
      } else {
        startCamera();
        requestAnimationFrame(fitViewfinder);
      }
    }
    updateProgress();
  }

  // Live preview of the finished photo, so guests can try frames/filters before sending
  function renderPick() {
    if (S.mode !== 'picked' || current !== 'camera' || !S.frame) return;
    const src = Frames.compose({ frame: S.frame, layout: S.layout, filter: S.filter, shots: S.shots, scale: 0.5 });
    const c = els.pick;
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    const r = els.stage.getBoundingClientRect();
    const pad = 16, aspect = Frames.W / Frames.H;
    let w = r.width - pad * 2, h = w / aspect;
    if (h > r.height - pad * 2) { h = r.height - pad * 2; w = h * aspect; }
    c.style.width = Math.max(0, w) + 'px';
    c.style.height = Math.max(0, h) + 'px';
    updateProgress();
  }

  let pickFrom = 'camera';
  function openPicker(from) {
    pickFrom = from;
    els.file.multiple = true;
    els.file.click();
  }

  // The viewfinder takes the exact shape of one photo slot, so guests see what they'll get
  function fitViewfinder() {
    if (!S.frame || current !== 'camera') return;
    const cell = Frames.cellsFor(S.frame, S.layout)[0];
    const aspect = cell.w / cell.h;
    const r = els.stage.getBoundingClientRect();
    const pad = 16;
    let w = r.width - pad * 2, h = w / aspect;
    if (h > r.height - pad * 2) { h = r.height - pad * 2; w = h * aspect; }
    els.vf.style.width = Math.max(0, w) + 'px';
    els.vf.style.height = Math.max(0, h) + 'px';
  }

  // ---------- camera ----------
  function cameraError(msg) {
    els.camError.hidden = false;
    els.camError.querySelector('p').textContent = msg + ' Anda masih boleh pilih gambar dari galeri.';
  }

  const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  const BACK_RE = /back|rear|environment|belakang|後|背/i;
  const FRONT_RE = /front|user|face|depan|前/i;

  async function videoInputs() {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  // Phones often ignore a plain facingMode hint, so insist on it first, then fall
  // back to choosing the camera by its label, and finally to any camera at all.
  async function openStream(facing, avoidId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...SIZE, facingMode: { exact: facing } } });
    } catch (e) {
      if (e.name === 'NotAllowedError') throw e;
    }
    const cams = await videoInputs();
    const re = facing === 'environment' ? BACK_RE : FRONT_RE;
    const pick = cams.find((c) => re.test(c.label)) || cams.find((c) => c.deviceId && c.deviceId !== avoidId);
    if (pick && pick.deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...SIZE, deviceId: { exact: pick.deviceId } } });
      } catch (e) {
        if (e.name === 'NotAllowedError') throw e;
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { ...SIZE, facingMode: facing } });
  }

  // Which way the opened camera really faces (may differ from what we asked for)
  function actualFacing(stream, wanted) {
    const track = stream.getVideoTracks()[0];
    const settings = (track && track.getSettings && track.getSettings()) || {};
    if (settings.facingMode === 'user' || settings.facingMode === 'environment') return settings.facingMode;
    const label = (track && track.label) || '';
    if (BACK_RE.test(label)) return 'environment';
    if (FRONT_RE.test(label)) return 'user';
    return wanted;
  }

  async function updateFlipButton() {
    const cams = await videoInputs();
    // labels/count are only reliable after permission; hide only when we're sure there's one camera
    $('#flipBtn').hidden = cams.length === 1 && !!cams[0].label;
  }

  async function startCamera(flipping = false) {
    const req = ++camRequest;
    const prevId = flipping ? S.deviceId : null;
    stopCamera();
    els.camError.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraError(window.isSecureContext ? 'Pelayar ini tidak menyokong kamera.' : 'Kamera hanya berfungsi melalui pautan https://.');
      return;
    }
    try {
      // some phones can't open a second camera until the first is fully released
      if (flipping) await sleep(150);
      const stream = await openStream(S.facing, prevId);
      if (req !== camRequest || current !== 'camera') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      S.deviceId = track && track.getSettings ? track.getSettings().deviceId : null;
      const facing = actualFacing(stream, S.facing);
      if (flipping && S.deviceId && S.deviceId === prevId) toast('Kamera lain tidak dijumpai');
      S.facing = facing;
      S.stream = stream;
      els.video.muted = true;
      els.video.srcObject = stream;
      els.video.classList.toggle('mirror', facing === 'user');
      await els.video.play().catch(() => {});
      updateFlipButton();
    } catch (e) {
      if (req !== camRequest) return;
      console.error(e);
      const msg = e.name === 'NotAllowedError'
        ? 'Akses kamera ditolak. Benarkan kamera dalam tetapan pelayar, kemudian muat semula halaman.'
        : e.name === 'NotFoundError' || e.name === 'OverconstrainedError'
          ? 'Kamera tidak dijumpai.'
          : 'Kamera tidak dapat dibuka.';
      cameraError(msg);
    }
  }

  function stopCamera() {
    if (S.stream) {
      S.stream.getTracks().forEach((t) => t.stop());
      S.stream = null;
    }
    els.video.srcObject = null;
  }

  function grabFrame() {
    const v = els.video;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (S.facing === 'user') { // match the mirrored preview
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    return c;
  }

  function setBusy(on) {
    S.busy = on;
    els.panel.classList.toggle('locked', on);
    els.shutter.classList.toggle('busy', on);
    els.gallery.disabled = on;
    $('#flipBtn').disabled = on;
  }

  async function countdown(n) {
    const cd = els.countdown;
    for (let i = n; i > 0; i--) {
      if (S.cancel) break;
      cd.textContent = i;
      cd.classList.remove('pop');
      void cd.offsetWidth; // restart animation
      cd.classList.add('pop');
      Music.beep(880);
      await sleep(1000);
    }
    cd.textContent = '';
    cd.classList.remove('pop');
    return !S.cancel;
  }

  function flash() {
    els.flash.classList.remove('go');
    void els.flash.offsetWidth;
    els.flash.classList.add('go');
  }

  async function shoot() {
    if (S.mode === 'picked') {
      if (S.shots.length < S.layout) {
        toast(`Pilih ${S.layout - S.shots.length} gambar lagi`);
        openPicker('camera');
        return;
      }
      finish();
      return;
    }
    if (S.busy) { // tapping again while counting down cancels
      S.cancel = true;
      return;
    }
    if (!S.stream || !els.video.videoWidth) {
      toast('Kamera belum sedia…');
      return;
    }
    S.cancel = false;
    setBusy(true);
    try {
      while (S.shots.length < S.layout) {
        if (!(await countdown(3))) return;
        S.shots.push(grabFrame());
        flash();
        Music.shutter();
        updateProgress();
        if (S.shots.length < S.layout) {
          await sleep(900);
          if (S.cancel) return;
        }
      }
    } finally {
      setBusy(false);
    }
    finish();
  }

  async function loadImageFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onFilesPicked() {
    const files = [...els.file.files].slice(0, 4);
    els.file.value = '';
    const loaded = [];
    for (const f of files) {
      try {
        loaded.push(await loadImageFile(f));
      } catch (e) {
        console.error(e);
        toast('Tak dapat buka gambar itu');
      }
    }
    if (!loaded.length) return;

    if (pickFrom === 'home') {
      // pick a layout that fits how many photos they chose
      S.shots = loaded;
      S.layout = loaded.length === 1 ? 1 : loaded.length === 2 ? 2 : 4;
      store.set('layout', S.layout);
      renderFrameOptions();
      setMode('picked');
      show('camera');
    } else {
      S.shots = [...S.shots, ...loaded].slice(0, 4);
      setMode('picked');
    }
    if (S.shots.length < S.layout) toast(`Pilih ${S.layout - S.shots.length} gambar lagi, atau tukar susunan`);
  }

  // ---------- result + upload ----------
  async function finish() {
    await fontsReady;
    const canvas = Frames.compose({ frame: S.frame, layout: S.layout, filter: S.filter, shots: S.shots });
    S.shots = [];
    updateProgress();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (S.result && S.result.status !== 'uploading') URL.revokeObjectURL(S.result.url);
    const r = { blob, url: URL.createObjectURL(blob), canvas, id: null, token: null, status: 'idle' };
    S.result = r;
    els.resultImg.src = r.url;
    show('result');
    setMode('camera');
    upload(r);
  }

  function randomToken() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function blobToBase64(blob) {
    return new Promise((ok, fail) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(',')[1]);
      fr.onerror = fail;
      fr.readAsDataURL(blob);
    });
  }

  function thumbOf(canvas) {
    const t = document.createElement('canvas');
    t.width = 300;
    t.height = 400;
    t.getContext('2d').drawImage(canvas, 0, 0, 300, 400);
    return t.toDataURL('image/jpeg', 0.7);
  }

  // text/plain avoids a CORS preflight, which Apps Script can't answer
  async function api(payload) {
    const res = await fetch(CFG.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'failed');
    return data;
  }

  async function upload(r) {
    if (!CFG.scriptUrl) {
      r.status = 'demo';
      renderStatus();
      return;
    }
    r.status = 'uploading';
    renderStatus();
    r.token = r.token || randomToken();
    try {
      const image = await blobToBase64(r.blob);
      const data = await api({ action: 'upload', image, mimeType: 'image/jpeg', guest: els.guest.value.trim(), token: r.token });
      r.id = data.id;
      r.status = 'done';
      const mine = store.get('mine', []);
      mine.push({ id: data.id, token: r.token, thumb: thumbOf(r.canvas), time: Date.now() });
      if (!store.set('mine', mine)) { // storage full — keep the token, drop thumbnails of old ones
        store.set('mine', mine.map((m, i) => (i < mine.length - 1 ? { ...m, thumb: '' } : m)));
      }
    } catch (e) {
      console.error(e);
      r.status = 'error';
    }
    if (S.result === r) renderStatus();
    else URL.revokeObjectURL(r.url);
    updateMineCount();
  }

  async function deleteUpload(id, token) {
    try {
      await api({ action: 'delete', id, token });
    } catch (e) {
      if (e.message !== 'not_found') {
        console.error(e);
        return false;
      }
    }
    store.set('mine', store.get('mine', []).filter((m) => m.id !== id));
    if (S.result && S.result.id === id) {
      S.result.status = 'deleted';
      renderStatus();
    }
    updateMineCount();
    return true;
  }

  function renderStatus() {
    const r = S.result;
    if (!r) return;
    const st = els.status;
    st.className = 'status';
    els.del.hidden = r.status !== 'done';
    els.retry.hidden = r.status !== 'error';
    switch (r.status) {
      case 'uploading':
        st.innerHTML = '<span class="spinner"></span> Menghantar kepada pengantin…';
        break;
      case 'done':
        st.classList.add('ok');
        st.textContent = '✓ Sudah sampai kepada pengantin. Terima kasih! 💌';
        break;
      case 'error':
        st.classList.add('err');
        st.textContent = 'Gagal dihantar. Semak sambungan internet anda.';
        break;
      case 'deleted':
        st.textContent = 'Gambar ini telah dipadam daripada album pengantin.';
        break;
      case 'demo':
        st.textContent = 'Mod demo: gambar tidak dihantar (scriptUrl belum diisi dalam config.js).';
        break;
      default:
        st.textContent = '';
    }
  }

  async function savePhoto() {
    const r = S.result;
    if (!r) return;
    const name = `KahwinCam-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    const file = new File([r.blob], name, { type: 'image/jpeg' });
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    // On phones the share sheet is the reliable way to "Save Image" into Photos
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = r.url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  // ---------- my photos ----------
  function updateMineCount() {
    els.mineCount.textContent = store.get('mine', []).length;
  }

  function renderMine() {
    const grid = els.mineGrid;
    const items = store.get('mine', []);
    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = '<p class="empty">Belum ada gambar dari telefon ini.</p>';
      return;
    }
    items.slice().reverse().forEach((it) => {
      const card = document.createElement('div');
      card.className = 'mine-item';
      const img = new Image();
      img.alt = '';
      if (it.thumb) img.src = it.thumb;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const time = document.createElement('span');
      time.textContent = new Date(it.time).toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const btn = document.createElement('button');
      btn.textContent = 'Padam';
      btn.onclick = async () => {
        if (!confirm('Padam gambar ini daripada album pengantin?')) return;
        btn.disabled = true;
        btn.textContent = '…';
        if (await deleteUpload(it.id, it.token)) {
          card.remove();
          toast('Gambar dipadam');
          if (!grid.querySelector('.mine-item')) renderMine();
        } else {
          btn.disabled = false;
          btn.textContent = 'Padam';
          toast('Gagal memadam. Cuba lagi.');
        }
      };
      meta.append(time, btn);
      card.append(img, meta);
      grid.append(card);
    });
  }

  // ---------- wiring ----------
  function wire() {
    els.guest.addEventListener('change', () => store.set('guest', els.guest.value.trim()));

    const begin = () => {
      store.set('guest', els.guest.value.trim());
      if (store.get('music', CFG.music !== false) && !Music.playing) {
        Music.play();
        syncMusicButtons();
      }
    };
    els.start.onclick = () => {
      begin();
      show('camera');
    };
    els.pickBtn.onclick = () => {
      begin();
      openPicker('home');
    };

    document.querySelectorAll('.music-toggle').forEach((b) => {
      b.onclick = () => {
        store.set('music', Music.toggle());
        syncMusicButtons();
      };
    });

    $('#mineBtn').onclick = () => show('mine');
    $('#mineBack').onclick = () => show('home');
    $('#camBack').onclick = () => {
      S.shots = [];
      show('home');
      setMode('camera');
    };
    $('#resBack').onclick = () => show('home');
    $('#againBtn').onclick = () => show('camera');

    $('#flipBtn').onclick = () => {
      if (S.busy) return;
      S.facing = S.facing === 'user' ? 'environment' : 'user';
      startCamera(true);
    };

    document.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
        ['frame', 'filter', 'layout'].forEach((k) => { $('#opt-' + k).hidden = k !== t.dataset.tab; });
      };
    });

    els.shutter.onclick = shoot;
    els.reset.onclick = () => {
      if (S.busy) S.cancel = true;
      S.shots = [];
      if (S.mode === 'picked') setMode('camera');
      else updateProgress();
    };
    els.gallery.onclick = () => openPicker('camera');
    els.file.onchange = onFilesPicked;

    $('#saveBtn').onclick = savePhoto;
    els.retry.onclick = () => S.result && upload(S.result);
    els.del.onclick = async () => {
      const r = S.result;
      if (!r || !r.id || !confirm('Padam gambar ini daripada album pengantin?')) return;
      els.del.disabled = true;
      const ok = await deleteUpload(r.id, r.token);
      els.del.disabled = false;
      toast(ok ? 'Gambar dipadam' : 'Gagal memadam. Cuba lagi.');
    };

    window.addEventListener('resize', () => (S.mode === 'picked' ? renderPick() : fitViewfinder()));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        Music.suspend();
        if (current === 'camera') {
          S.cancel = true;
          stopCamera();
        }
      } else {
        Music.resume();
        if (current === 'camera' && S.mode === 'camera') startCamera();
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (S.result && S.result.status === 'uploading') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  async function init() {
    fillText();
    els.guest.value = store.get('guest', '');
    syncMusicButtons();
    updateMineCount();
    wire();

    frames = await Frames.init(CFG);
    S.frame = frames.find((f) => f.id === store.get('frame')) || frames[0];
    const savedLayout = store.get('layout', 1);
    S.layout = [1, 2, 4].includes(savedLayout) ? savedLayout : 1;
    setFilter(Filters.list.find((f) => f.id === store.get('filter')) || Filters.list[0]);

    renderFilterOptions();
    renderLayoutOptions();
    renderFrameOptions();
    updateProgress();
    els.start.disabled = false;
    els.pickBtn.disabled = false;

    fontsReady.then(renderFrameOptions); // redraw thumbnails once script fonts arrive
  }

  init();
})();
