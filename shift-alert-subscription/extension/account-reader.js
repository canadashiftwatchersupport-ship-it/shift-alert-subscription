(() => {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== 'read-amazon-account') return;
    (async () => {
      if (!location.hash.startsWith('#/contactInformation')) return { ok: false };
      const title = [...document.querySelectorAll('h1')].some(e => /contact information/i.test(e.innerText));
      if (!title) return { ok: false };
      const values = [...document.querySelectorAll('input:disabled')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .map(e => String(e.value || e.placeholder || '').trim().toLowerCase())
        .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      if (values.length !== 1) return { ok: false };
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('amazon-ca-email:' + values[0]));
      return { ok: true, accountHash: [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('') };
    })().then(reply).catch(() => reply({ ok: false }));
    return true;
  });
})();
