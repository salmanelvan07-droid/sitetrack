/* MXM SiteTrack — ön yüz (PWA) */
'use strict';
var APP_SURUM = '1.0.0';
var API = window.MXM_API || '';
var DEMO = !!window.MXM_MOCK;

/* ================= depolama ================= */
function ls(k, v) {
  try {
    if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { return null; }
}
var K = { tok: 'mxm_k', dil: 'mxm_dil', D: 'mxm_D', Q: 'mxm_Q', ben: 'mxm_ben', ada: 'mxm_ada', grup: 'mxm_grup', mod: 'mxm_mod', cal: 'mxm_cal' };

/* ================= durum ================= */
var D = null;           // sunucudan gelen veri
var META = null;        // harita meta
var S = {
  dil: ls(K.dil) || '', scr: 'yukle', tab: 'harita',
  ada: ls(K.ada) || 'C', grup: ls(K.grup) || 'Finishing Works', mod: ls(K.mod) || 'genel',
  ara: '', cins: 'all', big: true, secA: false, secG: false,
  villa: null, vg: null, ed: {}, acik: {}, tarihAc: {}, notAc: {},
  tp: { k: '', d: 'DEVAM', y: '', f: '', sec: {} },
  on: { tab: 'giris', sec: {}, ada: 'all' },
  sub: null, rp: { ada: 'C', grup: '', dil: '', sonuc: null, busy: false },
  fe: null, gps: { on: false, pos: null, watch: null }, calYeni: [], sonSenk: ls('mxm_son') || '', online: navigator.onLine
};
function L(tr, en) { return S.dil === 'EN' ? en : tr; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function jq(s) { return esc(JSON.stringify(String(s))); }
function $(id) { return document.getElementById(id); }
function kopya(o) { return JSON.parse(JSON.stringify(o || {})); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function bugun() { var d = new Date(); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
function simdi() { var d = new Date(); return bugun() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function toISO(s) { var m = /^(\d\d)\.(\d\d)\.(\d{4})/.exec(s || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; }
function fromISO(s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; }
function num(v, d) { return Number(v).toLocaleString(S.dil === 'EN' ? 'en-GB' : 'tr-TR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

var toastT = null;
function toast(m, ms) {
  var t = $('toast'); t.textContent = m; t.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(function () { t.style.opacity = 0; }, ms || 2600);
}

/* ================= API ================= */
function tok() { return ls(K.tok) || ''; }
function api(a, p, ms) {
  var body = Object.assign({ a: a, k: tok() }, p || {});
  var pr;
  if (DEMO) pr = window.MXM_MOCK(body);
  else {
    if (!API || /BURAYA/.test(API)) return Promise.reject(new Error(L('config.js içinde API adresi tanımlı değil.', 'API address is not set in config.js.')));
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 45000);
    pr = fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  return pr.then(function (j) {
    if (!j || !j.ok) { var e = new Error((j && j.hata) || 'Hata'); e.kod = j && j.kod; e.data = j; throw e; }
    return j;
  });
}
function hata(e) {
  var m = String(e && e.message || e);
  if (e && e.name === 'AbortError') m = L('Sunucu yanıt vermedi.', 'Server did not respond.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = L('Bağlantı yok.', 'No connection.');
  if (e && e.kod === 'KAYITSIZ') { ls(K.tok, null); ls(K.ben, null); S.scr = 'kayit'; render(); }
  else if (e && e.kod === 'BEKLIYOR') { S.scr = 'bekle'; render(); }
  else if (e && e.kod === 'PASIF') { S.scr = 'pasif'; render(); }
  else if (e && e.kod === 'RED') { S.scr = 'red'; render(); }
  toast(m, 4500);
}

/* ================= veri yardımcıları ================= */
var DUR = ['BASLANMAMIS', 'DEVAM', 'TAMAMLANDI', 'YOK'];
function dAd(d) { return { BASLANMAMIS: L('Başlamadı', 'Not started'), DEVAM: L('Devam', 'In progress'), TAMAMLANDI: L('Bitti', 'Done'), YOK: L('Yok', 'N/A') }[d] || d; }
function dCls(d) { return { BASLANMAMIS: 'non', DEVAM: 'wip', TAMAMLANDI: 'ok', YOK: 'yok' }[d] || 'non'; }
function gAd(g) { return g === 'Betonarme' ? L('Betonarme', 'Structural') : (g === 'Finishing Works' ? L('Finishing', 'Finishing') : g); }
function cAd(c) { return { 'Beach': L('Beach', 'Beach'), 'Su üstü': L('Su üstü', 'Overwater'), 'Reef': 'Reef', 'Personel': L('Personel (PV)', 'Staff (PV)') }[c] || c; }
function kAd(k) { return S.dil === 'EN' && k.en ? k.en : k.ad; }
function gruplar() { var g = []; D.kalemler.forEach(function (k) { if (g.indexOf(k.grup) < 0) g.push(k.grup); }); return g; }
function kalemlerOf(g) { return D.kalemler.filter(function (k) { return k.grup === g; }); }
function kalem(id) { for (var i = 0; i < D.kalemler.length; i++) if (D.kalemler[i].id === id) return D.kalemler[i]; return null; }
var BIDX = {};
function idx() { BIDX = {}; D.binalar.forEach(function (b) { BIDX[b.id] = b; }); }
function bina(id) { return BIDX[id]; }
function adaHarf(b) { return String(b.ada).charAt(0); }
function adaBinalar(a) { return D.binalar.filter(function (b) { return a === 'AC' || adaHarf(b) === a; }); }
function onayli(b, k) { return D.durum[b + '|' + k] || { d: 'BASLANMAMIS' }; }
function bek(b, k) { return D.bekleyen[b + '|' + k]; }
function ben() { return D && D.ben || ls(K.ben) || {}; }
function admin() { return ben().rol === 'YONETICI'; }
function gpsYetki() { return !!(D && D.gpsYetkili); }
function benim(p) { return p && p.u === ben().ad; }
/* Kullanıcının düzenlemeye başlayacağı değer: kendi bekleyen girişi varsa o, yoksa onaylı değer */
function gor(b, k) { var p = bek(b, k); if (p && benim(p)) { var r = kopya(p); r.pend = true; return r; } return kopya(onayli(b, k)); }
function mq(b, kid) { return (D.metraj || {})[b.tip + '|' + kid] || 0; }
function birimAd(u) { return u === 'ton' ? 't' : (u || ''); }
function fmtQ(v, u) { return u === 'ton' ? num(v, 1) + ' t' : num(Math.round(v)) + ' ' + (u || ''); }
function oran(s) { if (!s || s.d === 'YOK') return null; if (s.d === 'TAMAMLANDI') return 1; if (s.d === 'DEVAM') { var y = Number(s.y); return (s.y !== '' && s.y != null && !isNaN(y)) ? y / 100 : 0.10; } return 0; }
function firma(ad) { return (D.firmalar || []).filter(function (f) { return f.ad === ad; })[0]; }
function fkisa(ad) { var f = firma(ad); return f ? (f.kisa || f.ad) : ad; }
function firmalarOf(kid) { return (D.firmalar || []).filter(function (f) { return f.aktif && f.kalemler.indexOf(kid) >= 0; }); }
function bekleyenListe() { return Object.keys(D.bekleyen).map(function (k) { return D.bekleyen[k]; }); }
function bekKul() { return (D.kullanicilar || []).filter(function (u) { return u.durum === 'BEKLIYOR'; }); }
function onaySayi() { return admin() ? bekleyenListe().length + bekKul().length : bekleyenListe().filter(benim).length; }

/* villa genel durumu: seçili grubun kapsamdaki kalemleri ya da tek kalem */
function villaDurum(bid, g, mod) {
  var ks = mod && mod !== 'genel' ? [kalem(mod)].filter(Boolean) : kalemlerOf(g);
  var n = 0, ok = 0, bas = 0;
  ks.forEach(function (k) { var s = onayli(bid, k.id); if (s.d === 'YOK') return; n++; if (s.d === 'TAMAMLANDI') ok++; else if (s.d === 'DEVAM') bas++; });
  if (!n) return 'yok';
  if (ok === n) return 'ok';
  if (ok || bas) return 'wip';
  return 'non';
}
function villaYuzde(bid, g) {
  var top = 0, n = 0;
  kalemlerOf(g).forEach(function (k) { var o = oran(onayli(bid, k.id)); if (o === null) return; n++; top += o; });
  return n ? Math.round(top / n * 100) : null;
}
function villaBekliyor(bid, g) {
  return kalemlerOf(g).some(function (k) { return !!bek(bid, k.id); });
}
function metrajOzet(binalar, kal) {
  return kal.map(function (k) {
    var top = 0, yap = 0, n = 0, ok = 0, wip = 0;
    binalar.forEach(function (b) {
      var s = onayli(b.id, k.id), o = oran(s); if (o === null) return;
      n++; if (s.d === 'TAMAMLANDI') ok++; else if (s.d === 'DEVAM') wip++;
      var q = mq(b, k.id); if (q) { top += q; yap += q * o; }
    });
    return { k: k, top: top, yap: yap, p: top ? yap / top * 100 : (n ? (ok + wip * 0.1) / n * 100 : 0), n: n, ok: ok, wip: wip };
  });
}

/* ================= kuyruk (çevrimdışı) ================= */
function kuyruk() { return ls(K.Q) || []; }
function yerelUygula(c) {
  var k = c.bina + '|' + c.kalem, a = D.durum[k] || {};
  D.bekleyen[k] = { id: 'yerel', t: c.zaman, u: ben().ad, bina: c.bina, kalem: c.kalem, ed: a.d || '', d: c.d, b: c.b, e: c.e, ob: c.ob, oe: c.oe, y: c.y, n: c.n, f: c.f, ef: a.f || '', yerel: true };
}
function kuyrukUygula() { kuyruk().forEach(function (p) { p.changes.forEach(yerelUygula); }); }
var gonderiliyor = false;
function gonder() {
  var q = kuyruk();
  if (!q.length || gonderiliyor || !D) return;
  gonderiliyor = true;
  api('kaydet', { changes: q[0].changes }).then(function (r) {
    gonderiliyor = false;
    var q2 = kuyruk(); q2.shift(); ls(K.Q, q2);
    Object.keys(r.bekleyen).forEach(function (k) { D.bekleyen[k] = r.bekleyen[k]; });
    ls(K.D, D);
    toast(L(r.adet + ' giriş gönderildi · onay bekliyor', r.adet + ' entries sent · awaiting approval'));
    if (q2.length) gonder(); else render();
  }, function (e) {
    gonderiliyor = false;
    var m = String(e && e.message || e);
    if (e && e.kod) return hata(e);
    if (/Geçersiz|Bilinmeyen/.test(m)) { var q3 = kuyruk(); q3.shift(); ls(K.Q, q3); toast(L('Giriş reddedildi: ', 'Entry rejected: ') + m, 5000); }
    render();
  });
}
function kaydetDegisiklik(changes) {
  if (!changes.length) return;
  changes.forEach(yerelUygula);
  var q = kuyruk(); q.push({ changes: changes, at: Date.now() }); ls(K.Q, q); ls(K.D, D);
  render(); gonder();
}
function paket(b, k, t) { return { bina: b, kalem: k, d: t.d, b: t.b || '', e: t.e || '', ob: t.ob || '', oe: t.oe || '', y: t.y == null ? '' : String(t.y), n: t.n || '', f: t.f || '', zaman: simdi() }; }
function yeniDurum(eski, d) {
  var t = bugun();
  var n = { d: d, b: eski.b || '', e: eski.e || '', ob: eski.ob || '', oe: eski.oe || '', y: eski.y || '', n: eski.n || '', f: eski.f || '' };
  if (d === 'BASLANMAMIS' || d === 'YOK') { n.b = ''; n.e = ''; n.ob = ''; n.oe = ''; n.y = ''; }
  if (d === 'DEVAM') { if (!n.ob) n.ob = t; n.oe = ''; n.e = ''; }
  if (d === 'TAMAMLANDI') { if (!n.ob) n.ob = t; n.oe = t; n.y = ''; }
  return n;
}
function efB(s) { return s.b ? s.b : (s.ob || ''); }
function efE(s) { return s.e ? s.e : (s.oe || ''); }

/* ================= veri yükleme ================= */
function veriAl(sessiz, zorla) {
  var dm = !zorla && D && S.scr === 'ana' ? (D.damga || '') : '';
  return api('veri', { damga: dm }).then(function (r) {
    delete r.ok;
    S.sonSenk = simdi(); ls('mxm_son', S.sonSenk);
    if (r.degismedi) { if (S.scr === 'ana') hdrCiz(); gonder(); return r; }
    D = r; idx(); kuyrukUygula(); ls(K.D, D); ls(K.ben, r.ben);
    if (!kalemlerOf(S.grup).length) S.grup = gruplar()[0];
    if (S.scr !== 'ana') S.scr = 'ana';
    render(); gonder();
    return r;
  }, function (e) { if (!sessiz || e.kod) hata(e); throw e; });
}
function baslat() {
  var bq = (new URLSearchParams(location.search)).get('bag');
  if (bq) {
    if (tok()) { if (history.replaceState) history.replaceState(null, '', location.pathname); setTimeout(function () { toast(L('Bu cihaz zaten bir hesaba bağlı', 'This device is already linked to an account'), 4000); }, 600); }
    else { S.kayitMod = 'bag'; S.bagKod = bq.replace(/\D/g, '').slice(0, 6); }
  }
  if (!S.dil) { S.scr = 'dil'; return render(); }
  if (!tok()) { S.scr = 'kayit'; return render(); }
  var c = ls(K.D), b = ls(K.ben);
  if (c && b && b.durum === 'ONAYLI') {
    D = c; D.ben = b; idx(); D.bekleyen = D.bekleyen || {}; kuyrukUygula(); S.scr = 'ana'; render();
    veriAl(true).catch(function () { toast(L('Çevrimdışı: son kayıtlı veri gösteriliyor', 'Offline: showing last saved data'), 3500); });
    return;
  }
  S.scr = 'yukle'; render();
  api('ben').then(function (r) {
    ls(K.ben, r.kullanici);
    if (r.kullanici.durum === 'ONAYLI') return veriAl();
    S.scr = r.kullanici.durum === 'PASIF' ? 'pasif' : r.kullanici.durum === 'REDDEDILDI' ? 'red' : 'bekle'; render();
  }).catch(function (e) { if (!e.kod) { S.scr = 'baglanti'; S.hataMsg = String(e.message || e); render(); } else hata(e); });
}

/* ================= ikonlar ================= */
function svg(p, w, sw) { return '<svg width="' + (w || 22) + '" height="' + (w || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2.2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
var I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>', 22, 2.4),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 22, 2.4),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 18),
  map: svg('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  toplu: svg('<path d="M4 12l4 4L20 5"/><path d="M4 19h16"/>'),
  onay: svg('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  more: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>', 18, 2.6),
  up: svg('<path d="M6 15l6-6 6 6"/>', 18, 2.6),
  ok: svg('<path d="M5 12l5 5L20 7"/>', 18, 3),
  clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 18, 2.4),
  ring: svg('<circle cx="12" cy="12" r="6"/>', 16, 2.4),
  dash: svg('<path d="M7 12h10"/>', 16, 2.6),
  gps: svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>', 18, 2.4),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 2.6),
  doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
  firm: svg('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  qr: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7M17 21v-3"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  link: svg('<rect x="2" y="5" width="12" height="9" rx="1.5"/><path d="M5 18h6M8 14v4"/><rect x="16" y="8" width="6" height="12" rx="1.5"/><path d="M18.5 17.5h1"/>'),
  devices: svg('<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>')
};

/* ================= giriş ekranları ================= */
function gate(icerik) {
  return '<div class="gate"><div class="box"><div class="logo"><div class="mk">MXM</div><div><div class="h" style="font-size:20px">MXM SiteTrack</div><div class="mut" style="font-size:12.5px;font-weight:600">MAXX Royal · Island A & C</div></div></div>' + icerik + '</div></div>';
}
function vDil() {
  return gate('<div class="h">Dil seçin · Choose language</div>' +
    '<div class="langs"><button onclick="dilSec(\'TR\')">Türkçe<small>Arayüz ve raporlar</small></button><button onclick="dilSec(\'EN\')">English<small>Interface and reports</small></button></div>' +
    '<div class="mut" style="font-size:12.5px">Daha sonra menüden değiştirebilirsiniz · You can change it later in the menu.</div>');
}
function dilSec(d) {
  S.dil = d; ls(K.dil, d); ls('mxm_dil_el', 1); document.documentElement.lang = d === 'EN' ? 'en' : 'tr';
  if (S.scr === 'dil') baslat(); else { if (tok() && D) api('dil', { dil: d }).catch(function () {}); render(); if (MAP) mapEtiketYazi(); }
}
var FIRMA_LISTE = null;
function vKayit() {
  if (!FIRMA_LISTE) {
    api('firmalar').then(function (r) { FIRMA_LISTE = r.firmalar; render(); }, function (e) { FIRMA_LISTE = []; S.kayitHata = String(e.message || e); render(); });
    return gate('<div style="display:flex;justify-content:center;padding:30px"><div class="spin"></div></div>');
  }
  var kod = (new URLSearchParams(location.search)).get('kod') || '';
  var kodAc = S.kodAc || !!kod;
  var sekmeler = '<div class="seg sm"><button class="' + (S.kayitMod !== 'bag' ? 'on' : '') + '" onclick="kayitTut();S.kayitMod=\'yeni\';S.kayitHata=\'\';render()">' + L('Yeni kayıt', 'New registration') + '</button>' +
    '<button class="' + (S.kayitMod === 'bag' ? 'on' : '') + '" onclick="kayitTut();S.kayitMod=\'bag\';S.kayitHata=\'\';render()">' + L('Hesabım var', 'I have an account') + '</button></div>';
  if (S.kayitMod === 'bag') return gate(sekmeler + '<div class="h">' + L('Bu cihazı hesabına bağla', 'Link this device') + '</div>' +
    '<div class="mut" style="font-size:14px;line-height:1.5">' + L('Giriş yapmış olduğun telefonda <b>Diğer › Başka cihazda aç</b> ekranını aç. Oradaki 6 haneli kodu buraya yaz ya da QR kodu bu cihazın kamerasıyla okut. Kod 10 dakika geçerlidir.', 'On the device where you are signed in, open <b>More › Open on another device</b>. Type the 6-digit code here or scan the QR code with this device’s camera. The code is valid for 10 minutes.') + '</div>' +
    (S.kayitHata ? '<div class="banner bad">' + esc(S.kayitHata) + '</div>' : '') +
    '<div class="field"><label for="bKod">' + L('Bağlama kodu', 'Link code') + '</label><input id="bKod" class="inp" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" style="font:800 28px Manrope,sans-serif;letter-spacing:.3em;text-align:center;height:64px" value="' + esc(S.bagKod || '') + '" onkeydown="if(event.key===\'Enter\')cihazBagla()"></div>' +
    '<button class="btn acc full" id="bBtn" onclick="cihazBagla()">' + L('Cihazı bağla', 'Link device') + '</button>' +
    '<button class="lnk" style="align-self:center" onclick="S.scr=\'dil\';render()">' + I.globe.replace('22', '16').replace('22', '16') + ' ' + (S.dil === 'EN' ? 'English' : 'Türkçe') + '</button>');
  return gate(sekmeler + '<div class="h">' + L('Kayıt ol', 'Register') + '</div>' +
    '<div class="mut" style="font-size:14px;line-height:1.45">' + L('Adınızı ve firmanızı girin. Kaydınız MRAC tarafından onaylandıktan sonra veri girişine başlayabilirsiniz. Google hesabı gerekmez.', 'Enter your name and company. Once MRAC approves your registration you can start entering data. No Google account needed.') + '</div>' +
    (DEMO ? '<div class="banner info">' + L('DEMO: ilk yönetici olmak için “Kurulum kodum var” → 123456. Veriler yalnızca bu tarayıcıda tutulur.', 'DEMO: to become the first admin use “I have a setup code” → 123456. Data stays in this browser only.') + '</div>' : '') +
    (S.kayitHata ? '<div class="banner bad">' + esc(S.kayitHata) + '</div>' : '') +
    '<div class="field"><label for="kAd">' + L('Ad Soyad', 'Full name') + '</label><input id="kAd" class="inp" autocomplete="name" value="' + esc(S.kAd || '') + '"></div>' +
    '<div class="field"><label for="kFirma">' + L('Firma', 'Company') + '</label><select id="kFirma" class="inp"><option value="">' + L('Firma seçin', 'Select company') + '</option>' +
    FIRMA_LISTE.map(function (f) { return '<option' + (S.kFirma === f ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select></div>' +
    (kodAc ? '<div class="field"><label for="kKod">' + L('Kurulum kodu (yalnızca ilk yönetici)', 'Setup code (first administrator only)') + '</label><input id="kKod" class="inp" inputmode="numeric" value="' + esc(kod) + '"></div>'
      : '<button class="lnk" style="align-self:flex-start;padding:0" onclick="S.kodAc=true;kayitTut();render()">' + L('Kurulum kodum var', 'I have a setup code') + '</button>') +
    '<button class="btn acc full" id="kBtn" onclick="kayitOl()">' + L('Kaydı gönder', 'Send registration') + '</button>' +
    '<button class="lnk" style="align-self:center" onclick="S.scr=\'dil\';render()">' + I.globe.replace('22', '16').replace('22', '16') + ' ' + (S.dil === 'EN' ? 'English' : 'Türkçe') + '</button>');
}
function cihazAdi() {
  var ua = navigator.userAgent || '', os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android telefon' : 'Android tablet') : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Cihaz';
  var br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  var pwa = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ? ' · ' + L('uygulama', 'app') : '';
  return os + (br ? ' · ' + br : '') + pwa;
}
function cihazBagla() {
  var k = ($('bKod') ? $('bKod').value : S.bagKod || '').replace(/\D/g, '');
  S.bagKod = k;
  if (k.length !== 6) return toast(L('6 haneli kodu girin', 'Enter the 6-digit code'));
  if ($('bBtn')) $('bBtn').disabled = true;
  api('bagla', { kod: k, cihaz: cihazAdi() }).then(function (r) {
    ls(K.tok, r.anahtar); ls(K.ben, r.kullanici); S.bagKod = ''; S.kayitMod = '';
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    toast(L('Cihaz bağlandı: ', 'Device linked: ') + r.kullanici.ad);
    veriAl();
  }, function (e) { S.kayitHata = String(e.message || e); render(); });
}
function kayitTut() { var a = $('kAd'), f = $('kFirma'); if (a) S.kAd = a.value; if (f) S.kFirma = f.value; }
function kayitOl() {
  kayitTut();
  var ad = (S.kAd || '').trim(), fi = S.kFirma, kd = $('kKod') ? $('kKod').value.trim() : '';
  if (ad.length < 3) return toast(L('Ad soyad girin', 'Enter your full name'));
  if (!fi && !kd) return toast(L('Firma seçin', 'Select a company'));
  $('kBtn').disabled = true;
  api('kayit', { ad: ad, firma: fi || 'MRAC', dil: S.dil, kurulumKodu: kd, cihaz: cihazAdi(), zorla: !!S.kayitZorla }).then(function (r) {
    if (r.uyari === 'AYNI_AD') {
      $('kBtn').disabled = false;
      return soru(L('Bu adla bir hesap var', 'An account with this name exists'),
        L('<b>' + esc(ad) + '</b> · ' + esc(fi) + ' adına onaylı bir hesap zaten var. Bu sizseniz yeni kayıt yerine bu cihazı mevcut hesabınıza bağlayın: diğer cihazınızda <b>Diğer › Başka cihazda aç</b> ile kod alın.',
          'An approved account for <b>' + esc(ad) + '</b> · ' + esc(fi) + ' already exists. If that is you, link this device instead of registering again: get a code on your other device under <b>More › Open on another device</b>.'),
        L('Kodum var', 'I have a code'), function () { S.kayitMod = 'bag'; render(); }, 'acc', L('Yine de kayıt ol', 'Register anyway'),
        function () { S.kayitZorla = true; kayitOl(); }, true);
    }
    S.kayitZorla = false;
    ls(K.tok, r.anahtar); ls(K.ben, r.kullanici);
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    if (r.kullanici.durum === 'ONAYLI') { toast(L('Yönetici olarak kaydedildiniz', 'Registered as administrator')); veriAl(); }
    else { S.scr = 'bekle'; render(); }
  }, function (e) { S.kayitHata = String(e.message || e); render(); });
}
function vBekle() {
  var u = ls(K.ben) || {};
  return gate('<div class="h">' + L('Onay bekleniyor', 'Awaiting approval') + '</div>' +
    '<div class="card" style="background:var(--soft);box-shadow:none"><div class="t1">' + esc(u.ad) + '</div><div class="t2">' + esc(u.firma) + ' · ' + esc(u.kayit || '') + '</div></div>' +
    '<div class="mut" style="font-size:14px;line-height:1.45">' + L('Kaydınız MRAC yöneticisine iletildi. Onaylandığında bu ekran kendiliğinden açılır.', 'Your registration was sent to the MRAC administrator. This screen opens automatically once approved.') + '</div>' +
    '<button class="btn full" onclick="baslat()">' + L('Durumu kontrol et', 'Check status') + '</button>');
}
function vPasif(red) {
  return gate('<div class="h">' + (red ? L('Kayıt reddedildi', 'Registration rejected') : L('Hesap pasif', 'Account inactive')) + '</div>' +
    '<div class="mut" style="font-size:14px">' + L('Bilgi için MRAC yöneticisiyle görüşün.', 'Please contact the MRAC administrator.') + '</div>' +
    '<button class="btn soft full" onclick="baslat()">' + L('Tekrar kontrol et', 'Check again') + '</button>' +
    '<button class="btn full" onclick="cihazCik(true)">' + L('Yeniden kayıt ol', 'Register again') + '</button>');
}
function cihazCik(sor) {
  var f = function () { ls(K.tok, null); ls(K.ben, null); ls(K.D, null); ls(K.Q, null); D = null; mapYoket(); S.scr = 'kayit'; render(); };
  if (!sor) return f();
  soru(L('Bu cihazdan çıkılsın mı?', 'Sign out of this device?'), L('Tekrar giriş için yeniden kayıt ve onay gerekir.', 'You will need to register and be approved again.') +
    (kuyruk().length ? '<div class="banner bad" style="margin-top:10px">' + L(kuyruk().length + ' gönderilmemiş giriş silinecek!', kuyruk().length + ' unsent entries will be deleted!') + '</div>' : ''), L('Çık', 'Sign out'), f, 'bad');
}

/* ================= modal ================= */
var MODAL_CB = null, MODAL_IPTAL = null;
function modalSil() { var m = $('modal'); if (m) m.remove(); }
var MODAL_ARKA = true;
function soru(baslik, govde, evet, cb, tur, hayir, iptal, arkaKapatmaz) {
  modalSil(); MODAL_CB = cb; MODAL_IPTAL = iptal || null; MODAL_ARKA = !arkaKapatmaz;
  var m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><div class="h">' + baslik + '</div><div style="font-size:14.5px;line-height:1.45;color:var(--ink2)">' + (govde || '') + '</div>' +
    '<div class="acts"><button class="btn soft" onclick="modalKapat()">' + (hayir || L('Vazgeç', 'Cancel')) + '</button>' +
    (evet ? '<button class="btn ' + (tur || 'acc') + '" onclick="modalEvet()">' + evet + '</button>' : '') + '</div></div>';
  m.addEventListener('click', function (e) { if (e.target === m) { if (MODAL_ARKA) modalKapat(); else { MODAL_IPTAL = null; modalSil(); } } });
  document.body.appendChild(m);
}
function modalKapat() { var ip = MODAL_IPTAL; MODAL_IPTAL = null; modalSil(); if (ip) ip(); }
function modalEvet() { var cb = MODAL_CB; MODAL_IPTAL = null; var v = {}; Array.prototype.forEach.call(document.querySelectorAll('#modal [data-v]'), function (x) { v[x.getAttribute('data-v')] = x.value; }); modalSil(); if (cb) cb(v); }

/* ================= ana iskelet ================= */
var SHELL = false;
function render() {
  var app = $('app');
  if (S.scr !== 'ana') {
    if (SHELL) { mapYoket(); SHELL = false; }
    app.innerHTML = S.scr === 'dil' ? vDil() : S.scr === 'kayit' ? vKayit() : S.scr === 'bekle' ? vBekle() : S.scr === 'pasif' ? vPasif(false) : S.scr === 'red' ? vPasif(true) :
      S.scr === 'baglanti' ? gate('<div class="h">' + L('Bağlantı kurulamadı', 'Could not connect') + '</div><div class="banner bad">' + esc(S.hataMsg) + '</div><button class="btn full" onclick="baslat()">' + L('Tekrar dene', 'Try again') + '</button>') :
      gate('<div style="display:flex;justify-content:center;padding:30px"><div class="spin"></div></div>');
    return;
  }
  if (!SHELL) {
    app.innerHTML = '<div id="shell"><nav id="rail" aria-label="menu"></nav><div id="col"><header id="hdr"></header><div id="stage"><div id="mapWrap"><div id="map"></div><div id="mapUi"></div></div><div id="view" class="hide"></div></div><nav id="nav" aria-label="menu"></nav></div><aside id="panel" class="hide"></aside></div>';
    SHELL = true; mapKur();
    try { new ResizeObserver(function () { if (MAP) MAP.resize(); }).observe($('stage')); } catch (e) {}
  }
  hdrCiz(); navCiz(); viewCiz(); panelCiz();
  if (MAP_HAZIR) { mapUiCiz(); etiketBoya(); }
}
var SUB_DERIN = 0;
function sekme(t) {
  S.tab = t;
  if (S.sub && SUB_DERIN > 0) { var d = SUB_DERIN; SUB_DERIN = 0; S.subGeri = 1; try { history.go(-d); } catch (e) { S.subGeri = 0; } }
  S.sub = null;
  render();
  if (t === 'harita' && MAP) setTimeout(function () { MAP.resize(); }, 30);
}
function navCiz() {
  var n = onaySayi();
  var it = [['harita', L('Harita', 'Map'), I.map], ['liste', L('Villalar', 'Villas'), I.grid], ['toplu', L('Toplu', 'Bulk'), I.toplu],
    ['onay', admin() ? L('Onay', 'Approve') : L('Girişlerim', 'My entries'), I.onay], ['diger', L('Diğer', 'More'), I.more]];
  var h = it.map(function (x) {
    return '<button class="' + (S.tab === x[0] ? 'on' : '') + '" onclick="sekme(\'' + x[0] + '\')" aria-label="' + x[1] + '">' + x[2] + x[1] + (x[0] === 'onay' && n ? '<span class="badge">' + n + '</span>' : '') + '</button>';
  }).join('');
  $('nav').innerHTML = h;
  $('rail').innerHTML = '<div class="mk">MXM</div>' + h;
}

/* ---------- üst seçim alanı (büyük → ince) ---------- */
function hdrVar() { return S.tab === 'harita' || S.tab === 'liste' || S.tab === 'toplu' || (S.tab === 'onay' && false); }
function senkPill() {
  var q = kuyruk().length;
  if (!S.online) return '<span class="pill off">' + L('Çevrimdışı', 'Offline') + (q ? ' · ' + q : '') + '</span>';
  if (q) return '<button class="pill warn" onclick="gonder()">' + q + ' ' + L('gönderilecek', 'to send') + '</button>';
  return '';
}
function hdrCiz() {
  var h = $('hdr');
  if (!hdrVar()) { h.className = 'hide'; return; }
  var ks = kalemlerOf(S.grup);
  var modAd = S.mod === 'genel' ? L('Modül geneli', 'Module overall') : (kalem(S.mod) ? kAd(kalem(S.mod)) : '');
  if (!S.big) {
    h.className = 'thin';
    h.innerHTML = '<button class="thinbar" onclick="S.big=true;hdrCiz()" aria-label="' + L('Seçimleri aç', 'Open selections') + '">' +
      '<span class="sum"><b>' + L(S.ada + ' Adası', 'Island ' + S.ada) + '</b> · ' + gAd(S.grup) + (S.tab === 'harita' ? ' · ' + esc(modAd) : '') + (S.ara ? ' · “' + esc(S.ara) + '”' : '') + '</span>' +
      senkPill() + '<span class="chev">' + I.down + '</span></button>';
    return;
  }
  h.className = 'big';
  var u = ben();
  var cinsler = ['all'].concat(uniq(adaBinalar(S.ada).map(function (b) { return b.cins; })));
  h.innerHTML = '<div class="row"><div class="brand"><span class="h">MXM SiteTrack</span><small>' + esc(u.ad || '') + ' · ' + esc(fkisa(u.firma || '')) + '</small></div>' + senkPill() +
    '<button class="ava" onclick="sekme(\'diger\')" aria-label="' + L('Menü', 'Menu') + '">' + esc(((u.ad || '?').trim().charAt(0) || '?').toUpperCase()) + '</button></div>' +
    '<div class="grid2"><div class="seg">' + ['A', 'C'].map(function (a) { return '<button class="' + (S.ada === a ? 'on' : '') + '" onclick="adaSec(\'' + a + '\')">' + L(a + ' Adası', 'Island ' + a) + '</button>'; }).join('') + '</div>' +
    '<div class="seg acc">' + gruplar().map(function (g) { return '<button class="' + (S.grup === g ? 'on' : '') + '" onclick="grupSec(' + jq(g) + ')">' + esc(gAd(g)) + '</button>'; }).join('') + '</div></div>' +
    '<label class="search">' + I.search + '<input id="ara" type="search" inputmode="search" placeholder="' + L('Villa no veya tip ara', 'Search villa no or type') + '" value="' + esc(S.ara) + '" oninput="araYaz(this.value)" onkeydown="if(event.key===\'Enter\'){araGit();this.blur()}"></label>' +
    (S.tab === 'harita'
      ? '<div class="chips">' + '<button class="chip acc ' + (S.mod === 'genel' ? 'on' : '') + '" onclick="modSec(\'genel\')">' + L('Modül geneli', 'Module overall') + '</button>' +
        ks.map(function (k) { return '<button class="chip acc ' + (S.mod === k.id ? 'on' : '') + '" onclick="modSec(\'' + k.id + '\')">' + esc(kAd(k)) + '</button>'; }).join('') + '</div>'
      : '<div class="chips">' + cinsler.map(function (c) { return '<button class="chip ' + (S.cins === c ? 'on' : '') + '" onclick="S.cins=' + jq(c).replace(/"/g, '&quot;') + ';render()">' + (c === 'all' ? L('Tümü', 'All') : esc(cAd(c))) + '</button>'; }).join('') + '</div>') +
    ((S.secA && S.secG) || true ? '<div class="grab" onclick="daralt()" role="button" aria-label="' + L('Daralt', 'Collapse') + '"></div>' : '');
}
function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
function daralt() { if (!S.big) return; S.big = false; hdrCiz(); }
function secimKontrol() { if (S.secA && S.secG) { S.secA = S.secG = false; setTimeout(daralt, 350); } }
function adaSec(a) {
  var deg = S.ada !== a; S.ada = a; ls(K.ada, a); S.secA = true; S.cins = 'all'; S.tp.sec = {};
  render(); if (deg || S.tab === 'harita') adaUcus(); secimKontrol();
}
function grupSec(g) {
  S.grup = g; ls(K.grup, g); S.secG = true; S.mod = 'genel'; ls(K.mod, 'genel'); S.tp.k = ''; S.tp.sec = {};
  render(); secimKontrol();
}
function modSec(m) { S.mod = m; ls(K.mod, m); hdrCiz(); etiketBoya(); mapUiCiz(); }
var araT = null;
function araYaz(v) {
  S.ara = v; clearTimeout(araT);
  araT = setTimeout(function () { if (S.tab === 'harita') { etiketBoya(); } else viewCiz(); }, 180);
}
function araGit() {
  var q = S.ara.trim().toLowerCase(); if (!q) return;
  var b = D.binalar.filter(function (x) { return x.id.toLowerCase() === q; })[0] || D.binalar.filter(function (x) { return x.id.toLowerCase().indexOf(q) === 0; })[0];
  if (!b) return toast(L('Bulunamadı', 'Not found'));
  if (adaHarf(b) !== S.ada) { S.ada = adaHarf(b); ls(K.ada, S.ada); render(); }
  if (S.tab === 'harita') { villaGoster(b.id); daralt(); } else villaAc(b.id);
}

/* ================= harita ================= */
var MAP = null, MAP_HAZIR = false, MK = {}, GPSMK = null;
var RENK = { ok: '#2BB673', wip: '#F2B93B', non: '#D0D5DD', yok: '#F2F4F7' };
function koyu(h, f) { var n = parseInt(h.slice(1), 16); var r = (n >> 16) * (1 - f), g = ((n >> 8) & 255) * (1 - f), b = (n & 255) * (1 - f); return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
function mapYoket() { if (MAP) { try { MAP.remove(); } catch (e) {} } MAP = null; MAP_HAZIR = false; MK = {}; GPSMK = null; gpsKapat(); }
function metaAl() {
  if (META) return Promise.resolve(META);
  return fetch('meta.json').then(function (r) { return r.json(); }).then(function (m) { META = m; return m; });
}
function mapKur() {
  if (!window.maplibregl) { $('mapUi').innerHTML = '<div class="near">' + L('Harita yüklenemedi', 'Map could not load') + '</div>'; return; }
  metaAl().then(function (meta) {
    if (!$('map')) return;
    var map = new maplibregl.Map({
      container: 'map', attributionControl: false, maxZoom: 21.5, minZoom: 13, dragRotate: false, pitchWithRotate: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#6C93B6' } }] },
      bounds: adaSinir(S.ada), fitBoundsOptions: { padding: 30 }
    });
    MAP = map; window.map = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'top-left');
    var W = function (a, b) { return ['interpolate', ['exponential', 2], ['zoom'], 14, a, 21, b]; };
    map.on('load', function () {
      map.addSource('ocean', { type: 'image', url: 'ocean.jpg', coordinates: meta.ocean });
      map.addLayer({ id: 'ocean', type: 'raster', source: 'ocean', paint: { 'raster-fade-duration': 0 } });
      map.addSource('d', { type: 'geojson', data: 'map.json' });
      var F = function (id, k, paint, type) { map.addLayer({ id: id, type: type || 'fill', source: 'd', filter: ['==', ['get', 'k'], k], paint: paint }); };
      var roof = meta.roof || '#D58C6E';
      F('halo', 'halo', { 'fill-color': '#FFFFFF' });
      F('island', 'island', { 'fill-color': '#FBF7EE', 'fill-outline-color': '#A88A55' });
      F('shrub', 'shrub', { 'fill-color': '#A9CF8E' });
      F('path', 'path', { 'fill-color': '#FFFDF8', 'fill-outline-color': '#B9A783' });
      F('bridge', 'bridge', { 'fill-color': '#CFAE84', 'fill-outline-color': '#7A5A3A' });
      F('ldeck', 'ldeck', { 'fill-color': '#C9A57A' }); F('lpool', 'lpool', { 'fill-color': '#7FD0DA' });
      F('lbldg', 'lbldg', { 'fill-color': '#F4F2EE', 'fill-outline-color': '#8F8A82' });
      var C = Math.cos(4.2 * Math.PI / 180) * 40075016.7;
      map.addLayer({ id: 'tree', type: 'circle', source: 'd', filter: ['==', ['get', 'k'], 'tree'], paint: {
        'circle-color': ['case', ['==', ['get', 'palm'], 1], '#8CC170', '#6FA865'], 'circle-opacity': 0.92, 'circle-stroke-color': '#4A8043', 'circle-stroke-width': 0.5,
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 13, ['*', ['get', 'r'], Math.pow(2, 13) * 512 / C], 22, ['*', ['get', 'r'], Math.pow(2, 22) * 512 / C]] } });
      F('vdeck', 'vdeck', { 'fill-color': '#FBF8F1', 'fill-outline-color': '#6A5D47' });
      F('vline', 'vline', { 'line-color': '#6A5D47', 'line-width': W(.2, 1.2) }, 'line');
      F('vwall', 'vwall', { 'line-color': '#52402A', 'line-width': W(.25, 1.6) }, 'line');
      F('vbld', 'vbld', { 'fill-color': ['case', ['==', ['get', 'v'], 1], roof, '#ECE8E1'], 'fill-outline-color': koyu(roof, .5) });
      F('vroof', 'vroof', { 'line-color': ['case', ['==', ['get', 'v'], 1], koyu(roof, .55), '#9A958C'], 'line-width': W(.15, 1) }, 'line');
      F('vpool', 'vpool', { 'fill-color': '#7FD0DA', 'fill-outline-color': '#1D6B78' });
      var ORG = { top: '50% 0%', bottom: '50% 100%', left: '0% 50%', right: '100% 50%' };
      meta.villas.forEach(function (v) {
        var e = document.createElement('div'); e.className = 'vl';
        e.innerHTML = '<div class="in" style="--o:' + ORG[v.a] + '"><b>' + esc(v.no) + '</b><i>' + esc(v.t) + '</i></div>';
        e.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (map.getZoom() < 17.6) { map.flyTo({ center: v.p, zoom: 18.4, duration: 600 }); daralt(); return; }
          villaAc(v.no);
        });
        new maplibregl.Marker({ element: e, anchor: v.a }).setLngLat(v.p).addTo(map);
        MK[v.no] = { el: e, v: v };
      });
      (meta.names || []).forEach(function (n) {
        var e = document.createElement('div'); e.style.pointerEvents = 'none';
        var sp = document.createElement('div'); sp.className = 'nm ' + (n.g ? 'g' : 's'); sp.textContent = n.n; e.appendChild(sp);
        new maplibregl.Marker({ element: e }).setLngLat(n.p).addTo(map);
      });
      var upd = function () { var z = map.getZoom(); var r = document.documentElement.style; r.setProperty('--s', Math.min(2.2, Math.max(0.42, Math.pow(2, (z - 18.6) * 0.7)))); r.setProperty('--n', Math.min(1.5, Math.max(1, Math.pow(2, (z - 15) / 4)))); };
      map.on('zoom', upd); upd();
      map.on('dragstart', function () { if (S.tab === 'harita') daralt(); });
      MAP_HAZIR = true; etiketBoya(); mapUiCiz();
    });
  }).catch(function () { $('mapUi').innerHTML = '<div class="near">' + L('Harita dosyası yüklenemedi', 'Map file could not load') + '</div>'; });
}
function mapEtiketYazi() { /* etiketler numara/tip içerir; dil bağımsız */ }
function adaSinir(a) {
  var pts = (META ? META.villas : []).filter(function (v) { var b = D && bina(v.no); return b ? (a === 'AC' || adaHarf(b) === a) : false; }).map(function (v) { return v.p; });
  if (!pts.length) return META ? META.bounds : [[73.475, 4.187], [73.525, 4.212]];
  var x0 = 999, y0 = 999, x1 = -999, y1 = -999;
  pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return [[x0, y0], [x1, y1]];
}
function adaUcus() { if (MAP && S.tab === 'harita') MAP.fitBounds(adaSinir(S.ada), { padding: { top: 40, bottom: 140, left: 30, right: 30 }, duration: 700 }); }
function etiketBoya() {
  if (!MAP_HAZIR || !D) return;
  var q = S.ara.trim().toLowerCase();
  Object.keys(MK).forEach(function (no) {
    var m = MK[no], b = bina(no), inn = m.el.firstChild;
    var st = b ? villaDurum(no, S.grup, S.mod) : 'yok';
    var c = RENK[st];
    inn.style.setProperty('--c', c); inn.style.setProperty('--b', koyu(c, st === 'yok' ? .2 : .4)); inn.style.setProperty('--t', st === 'ok' ? '#F0FFF5' : koyu(c, .62));
    inn.style.setProperty('--tx', st === 'ok' ? '#FFFFFF' : (st === 'yok' ? '#98A2B3' : '#1D2939'));
    var p = b && (S.mod === 'genel' ? villaBekliyor(no, S.grup) : !!bek(no, S.mod));
    var pd = inn.querySelector('.p');
    if (p && !pd) { pd = document.createElement('span'); pd.className = 'p'; inn.appendChild(pd); } else if (!p && pd) pd.remove();
    var dim = q && !(no.toLowerCase().indexOf(q) === 0 || (m.v.t || '').toLowerCase().indexOf(q) === 0);
    m.el.classList.toggle('dim', !!dim);
  });
}
function mapUiCiz() {
  var u = $('mapUi'); if (!u) return;
  var vis = S.tab === 'harita';
  $('mapWrap').classList.toggle('hide', !vis && !(window.innerWidth >= 1000 && S.villa && S.tab === 'harita'));
  if (!vis) return;
  var bs = adaBinalar(S.ada), say = { ok: 0, wip: 0, non: 0 };
  bs.forEach(function (b) { var s = villaDurum(b.id, S.grup, S.mod); if (say[s] != null) say[s]++; });
  var tt = S.mod === 'genel' ? gAd(S.grup) + ' · ' + L('modül geneli', 'overall') : kAd(kalem(S.mod) || { ad: '' });
  var g = S.gps;
  var nr = '';
  if (g.on) {
    var cal = kalibrasyon();
    if (!g.pos) nr = '<div class="near"><div class="spin" style="width:20px;height:20px"></div><div class="grow t2" style="margin:0">' + L('Konum alınıyor…', 'Getting location…') + '</div><button class="iconbtn" onclick="gpsKapat();mapUiCiz()">' + I.close + '</button></div>';
    else if (!cal.f) nr = '<div class="near"><span class="ico" style="background:var(--wipS);color:var(--wipT)">' + I.gps + '</span><div class="grow"><div class="t1" style="font-size:13.5px">' + L('GPS kalibrasyonu gerekli', 'GPS calibration needed') + ' (' + cal.n + '/3)</div><div class="t2">' + (gpsYetki() ? L('Villada dururken “Bu villadayım” ile nokta ekleyin.', 'Add points with “I am at this villa” on site.') : L('Kalibrasyon henüz yapılmadı.', 'Calibration has not been done yet.')) + '</div></div>' + (gpsYetki() ? '<button class="btn sm acc" onclick="sekme(\'diger\');altSayfa(\'gps\')">' + L('Aç', 'Open') + '</button>' : '<button class="iconbtn" onclick="gpsKapat();mapUiCiz()">' + I.close + '</button>') + '</div>';
    else {
      var y = yakinlar(g.pos, 3);
      nr = '<div class="near"><span class="gpsdot" style="flex:none"></span><div class="grow"><div class="t2" style="margin:0">' + L('En yakın villa', 'Nearest villa') + ' · ±' + Math.round(g.pos.acc + cal.err) + ' m</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' + y.map(function (x, i) { return '<button class="' + (i ? 'fchip' : 'fchip on') + '" onclick="villaAc(\'' + x.no + '\')">' + esc(x.no) + ' · ' + Math.round(x.d) + ' m</button>'; }).join('') + '</div></div>' +
        '<button class="iconbtn" onclick="gpsKapat();mapUiCiz()">' + I.close + '</button></div>';
    }
  }
  u.innerHTML = nr +
    '<div class="legend"><div class="tt">' + esc(tt) + '</div><div class="r"><span><i style="background:' + RENK.ok + '"></i>' + L('Bitti', 'Done') + ' ' + say.ok + '</span><span><i style="background:' + RENK.wip + '"></i>' + L('Başladı', 'Started') + ' ' + say.wip + '</span><span><i style="background:' + RENK.non + '"></i>' + L('Başlamadı', 'Not started') + ' ' + say.non + '</span></div></div>' +
    '<div class="mapctl"><button onclick="gpsAc()" class="' + (g.on ? 'on' : '') + '" aria-label="GPS">' + I.gps + '</button><button onclick="adaUcus()" aria-label="' + L('Adaya sığdır', 'Fit island') + '">' + I.fit + '</button></div>';
}
function villaGoster(no) {
  var m = MK[no]; if (!m || !MAP) return;
  MAP.flyTo({ center: m.v.p, zoom: Math.max(MAP.getZoom(), 18.6), duration: 800 });
  m.el.classList.remove('hit'); void m.el.offsetWidth; m.el.classList.add('hit');
  setTimeout(function () { m.el.classList.remove('hit'); }, 3800);
}

/* ---------- GPS ve kalibrasyon ---------- */
var R_E = 6378137;
function yerel(lon, lat, o) { return [(lon - o[0]) * Math.PI / 180 * R_E * Math.cos(o[1] * Math.PI / 180), (lat - o[1]) * Math.PI / 180 * R_E]; }
function geri(x, y, o) { return [o[0] + x / (R_E * Math.cos(o[1] * Math.PI / 180)) * 180 / Math.PI, o[1] + y / R_E * 180 / Math.PI]; }
/* GPS (lon,lat) → harita (lon,lat): Helmert (kaydırma + dönme + tek ölçek), en küçük kareler.
   Noktalar tek bir şerit üzerinde olsa da kararlıdır. */
function kalibre(pts) {
  var n = pts.length; if (n < 2) return { n: n, f: null, err: 0, res: [], hat: false };
  var og = [pts[0].lon, pts[0].lat], oh = [pts[0].hx, pts[0].hy];
  var G = pts.map(function (p) { return yerel(p.lon, p.lat, og); }), H = pts.map(function (p) { return yerel(p.hx, p.hy, oh); });
  var gc = [0, 0], hc = [0, 0];
  G.forEach(function (g, i) { gc[0] += g[0] / n; gc[1] += g[1] / n; hc[0] += H[i][0] / n; hc[1] += H[i][1] / n; });
  var sa = 0, sb = 0, sg = 0, sxx = 0, syy = 0, sxy = 0;
  G.forEach(function (g, i) {
    var x = g[0] - gc[0], y = g[1] - gc[1], u = H[i][0] - hc[0], v = H[i][1] - hc[1];
    sa += x * u + y * v; sb += x * v - y * u; sg += x * x + y * y; sxx += x * x; syy += y * y; sxy += x * y;
  });
  if (sg < 1) return { n: n, f: null, err: 0, res: [], hat: false };
  var a = sa / sg, b = sb / sg;
  var tf = function (x, y) { var dx = x - gc[0], dy = y - gc[1]; return [hc[0] + a * dx - b * dy, hc[1] + b * dx + a * dy]; };
  var res = G.map(function (g, i) { var q = tf(g[0], g[1]); return Math.hypot(q[0] - H[i][0], q[1] - H[i][1]); });
  /* yayılım: noktalar neredeyse tek hat üzerindeyse uyar (dar eksen std < 40 m ya da geniş eksenin %8'i) */
  var tr = (sxx + syy) / n, det = (sxx * syy - sxy * sxy) / (n * n);
  var l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = Math.max(0, tr - l1);
  var hat = n >= 3 && (Math.sqrt(l2) < 40 || Math.sqrt(l2) < 0.08 * Math.sqrt(l1));
  return { n: n, err: res.length ? Math.max.apply(null, res) : 0, res: res, hat: hat,
    f: function (lon, lat) { var g = yerel(lon, lat, og); var q = tf(g[0], g[1]); return geri(q[0], q[1], oh); } };
}
function kalibrasyon() { var pts = (D && D.gps) || []; var k = kalibre(pts); if (pts.length < 3) k.f = null; return k; }
function yakinlar(pos, n) {
  var cal = kalibrasyon(); if (!cal.f) return [];
  var p = cal.f(pos.lon, pos.lat);
  return META.villas.filter(function (v) { return bina(v.no); }).map(function (v) { var a = yerel(v.p[0], v.p[1], p); return { no: v.no, d: Math.hypot(a[0], a[1]) }; })
    .sort(function (a, b) { return a.d - b.d; }).slice(0, n);
}
function gpsAc() {
  var g = S.gps;
  if (g.on) { gpsKapat(); return mapUiCiz(); }
  if (!navigator.geolocation) return toast(L('Bu cihazda konum yok', 'Location not available'));
  g.on = true; g.pos = null; mapUiCiz();
  g.watch = navigator.geolocation.watchPosition(function (p) {
    g.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 0 };
    var cal = kalibrasyon();
    if (cal.f && MAP) {
      var m = cal.f(g.pos.lon, g.pos.lat);
      if (!GPSMK) { var e = document.createElement('div'); e.className = 'gpsdot'; GPSMK = new maplibregl.Marker({ element: e }).setLngLat(m).addTo(MAP); MAP.flyTo({ center: m, zoom: Math.max(MAP.getZoom(), 18) }); }
      else GPSMK.setLngLat(m);
    }
    mapUiCiz();
  }, function (e) { toast(L('Konum alınamadı: ', 'Location error: ') + e.message, 4000); gpsKapat(); mapUiCiz(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function gpsKapat() {
  var g = S.gps; if (g.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(g.watch);
  g.watch = null; g.on = false; g.pos = null; if (GPSMK) { GPSMK.remove(); GPSMK = null; }
}
/* en iyi konumu ~8 sn içinde topla */
function konumOlc(cb) {
  if (!navigator.geolocation) return toast(L('Bu cihazda konum yok', 'Location not available'));
  var best = null, n = 0, bitti = false, w = null;
  soru(L('Konum ölçülüyor…', 'Measuring location…'), '<div style="display:flex;gap:12px;align-items:center"><div class="spin"></div><div id="olcY">' + L('Villanın yanında hareketsiz durun.', 'Stand still next to the villa.') + '</div></div>', null, null, null, null,
    function () { if (bitti) return; bitti = true; if (w != null) navigator.geolocation.clearWatch(w); toast(L('Ölçüm iptal edildi', 'Measurement cancelled')); });
  w = navigator.geolocation.watchPosition(function (p) {
    n++; if (!best || p.coords.accuracy < best.acc) best = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    var y = $('olcY'); if (y) y.textContent = L('Ölçüm ', 'Reading ') + n + ' · ±' + Math.round(best.acc) + ' m';
  }, function (e) { if (!bitti) { bitti = true; navigator.geolocation.clearWatch(w); MODAL_IPTAL = null; modalSil(); toast(e.message, 4000); } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  setTimeout(function () { if (bitti) return; bitti = true; navigator.geolocation.clearWatch(w); MODAL_IPTAL = null; modalSil(); if (best) cb(best); else toast(L('Konum alınamadı', 'No location'), 4000); }, 8000);
}
function buradayim(no) {
  var m = META && META.villas.filter(function (v) { return v.no === no; })[0];
  if (!m) return toast(L('Villa haritada yok', 'Villa not on map'));
  konumOlc(function (p) {
    var pts = (D.gps || []).filter(function (x) { return x.no !== no; });
    pts.push({ no: no, haritaLon: m.p[0], haritaLat: m.p[1], lat: p.lat, lon: p.lon, dogruluk: p.acc });
    var gonder_ = pts.map(function (x) { return { no: x.no, haritaLon: x.haritaLon != null ? x.haritaLon : x.hx, haritaLat: x.haritaLat != null ? x.haritaLat : x.hy, lat: x.lat, lon: x.lon, dogruluk: x.dogruluk != null ? x.dogruluk : x.acc }; });
    api('gps', { noktalar: gonder_ }).then(function (r) {
      D.gps = r.gps; ls(K.D, D);
      toast(L('Nokta eklendi: ', 'Point added: ') + no + ' (' + r.gps.length + ')');
      render();
    }, hata);
  });
}

/* ================= görünüm dağıtıcı ================= */
function viewCiz() {
  var v = $('view');
  mapUiCiz();
  if (S.tab === 'harita') { v.classList.add('hide'); return; }
  v.classList.remove('hide');
  var y = v.scrollTop;
  v.innerHTML = S.tab === 'liste' ? vListe() : S.tab === 'toplu' ? vToplu() : S.tab === 'onay' ? vOnay() : vDiger();
  v.scrollTop = y;
  if (!v._bagli) { v._bagli = 1; v.addEventListener('scroll', function () { if (v.scrollTop > 30 && (S.tab === 'liste' || S.tab === 'toplu')) daralt(); }, { passive: true }); }
  if (S.tab === 'diger' && S.sub === 'davet') qrCiz();
  if (S.tab === 'diger' && S.sub === 'bagkod') bagQrCiz();
  if (!(S.tab === 'diger' && S.sub === 'bagkod')) bagSayacDur();
}
function kuyrukBanner() {
  var q = kuyruk().length; if (!q) return '';
  return '<div class="banner" style="margin-bottom:10px">' + I.sync + '<span class="grow">' + L(q + ' giriş paketi henüz gönderilmedi. Bağlantı gelince otomatik gönderilir; uygulamayı silmeyin.', q + ' entry batches not sent yet. They will be sent automatically when online; do not uninstall the app.') + '</span><button class="btn sm" onclick="gonder()">' + L('Gönder', 'Send') + '</button></div>';
}
function filtre(bs) {
  var q = S.ara.trim().toLowerCase();
  return bs.filter(function (b) { return (S.cins === 'all' || b.cins === S.cins) && (!q || b.id.toLowerCase().indexOf(q) === 0 || String(b.tip).toLowerCase().indexOf(q) === 0); });
}

/* ================= villa listesi ================= */
function vListe() {
  var bs = filtre(adaBinalar(S.ada)), ks = kalemlerOf(S.grup);
  var gruplar_ = {};
  bs.forEach(function (b) { var g = b.cins; (gruplar_[g] = gruplar_[g] || []).push(b); });
  var h = kuyrukBanner();
  if (!bs.length) h += '<div class="card mut">' + L('Eşleşen villa yok.', 'No matching villas.') + '</div>';
  Object.keys(gruplar_).forEach(function (g) {
    var L_ = gruplar_[g], ok = L_.filter(function (b) { return villaDurum(b.id, S.grup) === 'ok'; }).length;
    h += '<div class="grpT"><b>' + esc(cAd(g)) + '</b><span class="t2">' + ok + ' / ' + L_.length + ' ' + L('bitti', 'done') + '</span></div><div class="vgrid">' +
      L_.map(function (b) { return villaKart(b, ks); }).join('') + '</div>';
  });
  return h;
}
function villaKart(b, ks, secim) {
  var p = villaYuzde(b.id, S.grup), st = villaDurum(b.id, S.grup);
  var dots = ks.map(function (k) { var s = onayli(b.id, k.id); return '<span class="dot ' + (s.d === 'YOK' ? 'yok' : dCls(s.d)) + '" title="' + esc(kAd(k)) + ': ' + dAd(s.d) + '"></span>'; }).join('');
  var col = st === 'ok' ? 'var(--okB)' : 'var(--wip)';
  return '<button class="vc" onclick="villaAc(\'' + b.id + '\')">' + (villaBekliyor(b.id, S.grup) ? '<span class="pd"></span>' : '') +
    '<div><div class="no">' + esc(b.id) + '</div><div class="tp">' + L('Tip ', 'Type ') + esc(b.tip) + ' · ' + esc(b.ada) + '</div></div>' +
    '<div class="bar"><i style="width:' + (p || 0) + '%;background:' + col + '"></i></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center"><div class="dots">' + dots + '</div><span class="t2" style="margin:0;font-weight:700">' + (p == null ? '—' : '%' + p) + '</span></div></button>';
}

/* ================= villa paneli ================= */
function villaAc(id) {
  if (!bina(id)) return toast(L('Villa bulunamadı', 'Villa not found'));
  if (S.villa && S.villa !== id && degisiklikSay() > 0) {
    return soru(L('Kaydedilmemiş değişiklik', 'Unsaved changes'), L('Villa ' + S.villa + ' için değişiklikler gönderilmedi. Vazgeçilsin mi?', 'Changes for villa ' + S.villa + ' were not sent. Discard them?'), L('Vazgeç ve aç', 'Discard and open'), function () { S.ed = {}; villaAc(id); }, 'bad', L('Kal', 'Stay'));
  }
  var ilk = !S.villa;
  S.villa = id; S.vg = S.grup; S.ed = {}; S.acik = {}; S.tarihAc = {}; S.notAc = {};
  if (ilk) try { history.pushState({ p: 'villa' }, ''); } catch (e) {}
  panelCiz();
  if (MAP && S.tab === 'harita') { var m = MK[id]; if (m) { m.el.classList.add('hit'); setTimeout(function () { m.el.classList.remove('hit'); }, 2500); } }
}
function villaKapat(gecmis) {
  var f = function () { S.villa = null; S.ed = {}; panelCiz(); if (!gecmis) try { history.back(); } catch (e) {} };
  if (degisiklikSay() > 0) return soru(L('Değişiklikler gönderilmedi', 'Changes not sent'), L('Çıkarsanız bu villadaki değişiklikler kaybolur.', 'If you leave, the changes for this villa are lost.'), L('Çık', 'Leave'), f, 'bad', L('Kal', 'Stay'));
  f();
}
window.addEventListener('popstate', function () { if (S.villa) { if (degisiklikSay() > 0) { try { history.pushState({ p: 'villa' }, ''); } catch (e) {} villaKapat(true); } else { S.villa = null; panelCiz(); } } else if (S.subGeri) { S.subGeri = 0; } else if (S.sub) { SUB_DERIN = Math.max(0, SUB_DERIN - 1); S.sub = S.sub === 'firma' ? 'firmalar' : null; render(); } });
function taslak(k) { return S.ed[k]; }
function degisiklikSay() { return Object.keys(S.ed).filter(function (k) { return farkli(k); }).length; }
function farkli(kid) {
  var t = S.ed[kid]; if (!t) return false;
  var b = gor(S.villa, kid);
  return ['d', 'b', 'e', 'y', 'n', 'f'].some(function (x) { return String(t[x] || '') !== String(b[x] || ''); });
}
function panelCiz() {
  var p = $('panel'); if (!p) return;
  if (!S.villa) { p.classList.add('hide'); p.innerHTML = ''; if (MAP) setTimeout(function () { MAP.resize(); }, 20); return; }
  var b = bina(S.villa), g = S.vg || S.grup, ks = kalemlerOf(g);
  var aktif = ks.filter(function (k) { return onayli(b.id, k.id).d !== 'YOK' || (taslak(k.id) && taslak(k.id).d !== 'YOK'); });
  var yok = ks.filter(function (k) { return aktif.indexOf(k) < 0; });
  var n = degisiklikSay(), pc = villaYuzde(b.id, g);
  p.classList.remove('hide');
  p.innerHTML = '<div class="ph"><div class="row" style="display:flex;align-items:center;gap:10px">' +
    '<button class="iconbtn" onclick="villaKapat()" aria-label="' + L('Kapat', 'Close') + '">' + I.back + '</button>' +
    '<div class="grow"><div class="h" style="font-size:24px;line-height:1.1">' + L('Villa ', 'Villa ') + esc(b.id) + (pc != null ? ' <span style="font-size:14px;color:var(--mut2)">%' + pc + '</span>' : '') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap"><span class="tag">' + esc(cAd(b.cins)) + '</span><span class="tag">' + L('Tip ', 'Type ') + esc(b.tip) + '</span><span class="tag">' + esc(b.ada) + (b.bolge ? ' · ' + L('Bölge ', 'Zone ') + esc(b.bolge) : '') + '</span></div></div>' +
    (gpsYetki() ? '<button class="iconbtn" onclick="buradayimSor()" aria-label="' + L('Bu villadayım (GPS)', 'I am at this villa (GPS)') + '" title="' + L('Bu villadayım (GPS kalibrasyon)', 'I am at this villa (GPS calibration)') + '">' + I.pin + '</button>' : '') +
    '<button class="iconbtn acc" onclick="haritadaGoster()" aria-label="' + L('Haritada göster', 'Show on map') + '">' + I.map + '</button></div>' +
    '<div class="tabs">' + gruplar().map(function (x) { return '<button class="' + (x === g ? 'on' : '') + '" onclick="panelGrup(' + jq(x) + ')">' + esc(gAd(x)) + '</button>'; }).join('') + '</div></div>' +
    '<div class="pb">' + (b.kontrol ? '<div class="banner">' + esc(b.kontrol) + '</div>' : '') +
    aktif.map(function (k) { return kalemKart(b, k); }).join('') +
    (yok.length ? '<div class="sec">' + L('Kapsam dışı', 'Out of scope') + '</div>' + yok.map(function (k) { return kalemKart(b, k); }).join('') : '') +
    '</div>' +
    '<div class="pf"><button class="btn full" ' + (n ? '' : 'disabled') + ' onclick="villaGonder()">' + (n ? L(n + ' değişikliği onaya gönder', 'Send ' + n + ' change' + (n > 1 ? 's' : '') + ' for approval') : L('Değişiklik yok', 'No changes')) + '</button></div>';
}
function panelGrup(g) { S.vg = g; panelCiz(); }
function haritadaGoster() {
  var id = S.villa;
  if (window.innerWidth < 700) { if (degisiklikSay() > 0) return toast(L('Önce değişiklikleri gönderin', 'Send your changes first')); S.villa = null; panelCiz(); try { history.back(); } catch (e) {} }
  if (S.tab !== 'harita') sekme('harita');
  setTimeout(function () { villaGoster(id); }, 120);
}
function buradayimSor() {
  var id = S.villa;
  soru(L('Bu villadayım', 'I am at this villa'), L('Telefonun GPS konumu Villa ' + id + ' ile eşleştirilecek. Villanın yanında durduğunuzdan emin olun. Haritanın doğru hizalanması için birbirinden uzak en az 3 villada yapın.', 'Your phone’s GPS position will be matched to Villa ' + id + '. Make sure you are standing next to it. Do this at least at 3 villas far apart for correct alignment.'), L('Ölç', 'Measure'), function () { buradayim(id); });
}
function kalemKart(b, k) {
  var a = onayli(b.id, k.id), p = bek(b.id, k.id), base = gor(b.id, k.id), t = taslak(k.id), v = t || base;
  var ed = !!t && farkli(k.id), ac = S.acik[k.id];
  var cls = base.pend ? 'pend' : dCls(v.d);
  var q = mq(b, k.id);
  var mt = q ? ' <span style="font-size:12px;font-weight:600;color:var(--mut2)">· ' + fmtQ(q, k.birim) + '</span>' : '';
  var ic = v.d === 'TAMAMLANDI' ? I.ok : v.d === 'DEVAM' ? I.clock : v.d === 'YOK' ? I.dash : I.ring;
  var alt = [];
  if (efB(v)) alt.push(efB(v)); if (efE(v)) alt.push('→ ' + efE(v));
  if (v.d === 'DEVAM') alt.push('%' + (v.y !== '' && v.y != null ? v.y : '—'));
  if (v.f) alt.push(fkisa(v.f));
  var stLab = base.pend && !ed ? L('Onayda', 'Pending') : dAd(v.d);
  var h = '<div class="kc ' + (ac || ed ? 'ed' : '') + '"><button class="top" onclick="kalemAc(\'' + k.id + '\')">' +
    '<span class="sico ' + (base.pend && !ed ? 'pend' : dCls(v.d)) + '">' + ic + '</span>' +
    '<span class="grow"><span class="t1" style="display:block">' + esc(kAd(k)) + mt + '</span><span class="t2" style="display:block">' + esc(alt.join(' · ') || (base.pend ? L('Onaylı: ', 'Approved: ') + dAd(a.d) : '')) + '</span></span>' +
    '<span class="st ' + (base.pend && !ed ? 'pend' : dCls(v.d)) + '">' + stLab + (ed ? ' •' : '') + '</span></button>';
  if (p && !benim(p)) h += '<div class="pendbox">' + L('Onay bekliyor: ', 'Pending: ') + esc(dAd(p.d)) + (p.y ? ' %' + esc(p.y) : '') + (p.f ? ' · ' + esc(fkisa(p.f)) : '') + ' · ' + esc(p.u) + ' · ' + esc(String(p.t).slice(0, 16)) + '</div>';
  if (p && admin() && p.id !== 'yerel') h += '<div style="display:flex;gap:8px"><button class="btn sm bad" style="flex:1" onclick="tekOnay(\'' + p.id + '\',\'RED\')">' + L('Reddet', 'Reject') + '</button><button class="btn sm ok" style="flex:2" onclick="tekOnay(\'' + p.id + '\',\'ONAY\')">' + L('Onayla', 'Approve') + '</button></div>';
  if (ac) {
    h += '<div class="dseg">' + DUR.map(function (d) { return '<button class="' + d + (v.d === d ? ' on' : '') + '" onclick="durumSec(\'' + k.id + '\',\'' + d + '\')">' + dAd(d) + '</button>'; }).join('') + '</div>';
    if (k.takip !== 'DURUM' && v.d === 'DEVAM') {
      var y = v.y !== '' && v.y != null ? Number(v.y) : null;
      h += '<div class="prog"><div class="lab"><span>' + L('İlerleme · girilmezse %10 sayılır', 'Progress · counts as 10% if empty') + '</span><b id="yl_' + k.id + '">' + (y == null ? '—' : '%' + y) + (q && y != null ? ' <span style="font-size:12px;color:var(--mut2)">≈ ' + fmtQ(q * y / 100, k.birim) + '</span>' : '') + '</b></div><div class="note">' + L('Devam en fazla %95; tamamlandıysa “Bitti” seçin.', 'In progress max 95%; choose “Done” when finished.') + '</div>' +
        '<input type="range" min="0" max="95" step="5" value="' + (y == null ? 10 : y) + '" oninput="yuzdeSec(\'' + k.id + '\',this.value,true)" onchange="yuzdeSec(\'' + k.id + '\',this.value)" aria-label="%">' +
        '<div class="qk">' + [25, 50, 75, 90].map(function (x) { return '<button class="' + (y === x ? 'on' : '') + '" onclick="yuzdeSec(\'' + k.id + '\',' + x + ')">' + x + '</button>'; }).join('') + '<button onclick="yuzdeSec(\'' + k.id + '\',\'\')">' + L('Boş', 'Clear') + '</button></div></div>';
    }
    var fs = firmalarOf(k.id), gerek = fs.length && (v.d === 'DEVAM' || v.d === 'TAMAMLANDI');
    var fl = fs.slice(); if (v.f && !fs.some(function (f) { return f.ad === v.f; })) { var fx = firma(v.f); fl.push(fx || { ad: v.f, kisa: v.f }); }
    h += '<div class="frow"><span class="lb">' + L('Firma', 'Company') + '</span>' +
      fl.map(function (f) { return '<button class="fchip ' + (v.f === f.ad ? 'on' : (gerek && !v.f && ed ? 'req' : '')) + '" onclick="firmaSec(\'' + k.id + '\',' + jq(f.ad) + ')">' + esc(f.kisa || f.ad) + '</button>'; }).join('') +
      '<button class="lnk" onclick="firmaListe(\'' + k.id + '\')">' + (fl.length ? L('Diğer', 'Other') : L('Firma seç', 'Choose')) + '</button>' +
      '<button class="lnk" style="margin-left:auto" onclick="S.tarihAc[\'' + k.id + '\']=!S.tarihAc[\'' + k.id + '\'];panelCiz()">' + L('Tarih', 'Dates') + '</button>' +
      '<button class="lnk" onclick="S.notAc[\'' + k.id + '\']=!S.notAc[\'' + k.id + '\'];panelCiz()">' + L('Not', 'Note') + '</button></div>';
    if (gerek && !v.f && ed) h += '<div class="note" style="color:var(--bad);font-weight:600">' + L('Bu kalem için firma seçimi zorunlu.', 'A company is required for this item.') + '</div>';
    if (S.tarihAc[k.id]) h += '<div class="dates"><div class="field"><label>' + L('Gerçek başlama', 'Actual start') + '</label><input type="date" class="inp" max="' + toISO(bugun()) + '" value="' + toISO(v.b) + '" onchange="tarihSec(\'' + k.id + '\',\'b\',this.value)"></div>' +
      '<div class="field"><label>' + L('Gerçek bitiş', 'Actual finish') + '</label><input type="date" class="inp" max="' + toISO(bugun()) + '"' + (v.b ? ' min="' + toISO(v.b) + '"' : '') + ' value="' + toISO(v.e) + '" onchange="tarihSec(\'' + k.id + '\',\'e\',this.value)"></div></div>' +
      '<div class="note">' + L('Giriş tarihleri otomatik: ', 'Entry dates are automatic: ') + esc(v.ob || '—') + ' → ' + esc(v.oe || '—') + '</div>';
    if (S.notAc[k.id] || v.n) h += '<textarea class="inp" rows="2" placeholder="' + L('Not (isteğe bağlı)', 'Note (optional)') + '" onchange="notYaz(\'' + k.id + '\',this.value)">' + esc(v.n || '') + '</textarea>';
    if (ed) h += '<button class="lnk" style="align-self:flex-start;padding:0" onclick="delete S.ed[\'' + k.id + '\'];panelCiz()">' + L('Değişikliği geri al', 'Undo change') + '</button>';
  }
  return h + '</div>';
}
function kalemAc(kid) { S.acik[kid] = !S.acik[kid]; panelCiz(); }
function tEnsure(kid) { if (!S.ed[kid]) S.ed[kid] = kopya(gor(S.villa, kid)); delete S.ed[kid].pend; return S.ed[kid]; }
function durumSec(kid, d) {
  var t = tEnsure(kid), n = yeniDurum(t, d);
  Object.keys(n).forEach(function (x) { t[x] = n[x]; });
  if ((d === 'DEVAM' || d === 'TAMAMLANDI') && !t.f) { var fs = firmalarOf(kid); if (fs.length === 1) t.f = fs[0].ad; }
  panelCiz();
}
function yuzdeSec(kid, v, canli) {
  var t = tEnsure(kid); t.y = v === '' ? '' : String(v);
  if (canli) { var b = $('yl_' + kid); if (b) b.firstChild.nodeValue = '%' + v; return; }
  panelCiz();
}
function firmaSec(kid, ad) {
  var a = onayli(S.villa, kid), t = tEnsure(kid);
  if (t.f === ad) { t.f = ''; return panelCiz(); }
  if (a.f && a.f !== ad) {
    return soru(L('Firma değişsin mi?', 'Change company?'), L('Bu kalemin onaylı firması <b>' + esc(fkisa(a.f)) + '</b>. <b>' + esc(fkisa(ad)) + '</b> olarak değiştirilsin mi?', 'The approved company for this item is <b>' + esc(fkisa(a.f)) + '</b>. Change it to <b>' + esc(fkisa(ad)) + '</b>?'), L('Değiştir', 'Change'), function () { t.f = ad; panelCiz(); });
  }
  t.f = ad; panelCiz();
}
function firmaListe(kid) {
  var fs = (D.firmalar || []).filter(function (f) { return f.aktif; });
  soru(L('Firma seçin', 'Choose company'), '<div class="stack" style="max-height:50vh;overflow:auto">' + fs.map(function (f) {
    return '<button class="list-row" style="box-shadow:none;background:var(--soft)" onclick="modalKapat();firmaSec(\'' + kid + '\',' + jq(f.ad) + ')"><span class="grow t1">' + esc(f.ad) + '</span></button>';
  }).join('') + '</div>', null, null);
}
function tarihNo(s) { var m = /^(\d\d)\.(\d\d)\.(\d{4})$/.exec(s || ''); return m ? Number(m[3] + m[2] + m[1]) : null; }
function tarihHata(t) {
  var bg = tarihNo(bugun());
  if ((t.b && tarihNo(t.b) > bg) || (t.e && tarihNo(t.e) > bg)) return L('İleri tarih girilemez.', 'Future dates are not allowed.');
  if (t.b && t.e && tarihNo(t.e) < tarihNo(t.b)) return L('Bitiş tarihi başlamadan önce olamaz.', 'Finish date cannot be before start.');
  return '';
}
function tarihSec(kid, x, v) {
  var t = tEnsure(kid), eski = t[x]; t[x] = fromISO(v);
  var h = tarihHata(t); if (h) { t[x] = eski; toast(h, 3500); }
  panelCiz();
}
function notYaz(kid, v) { var t = tEnsure(kid); t.n = v; panelCiz(); }
function villaGonder() {
  var ch = [], eksik = [];
  Object.keys(S.ed).forEach(function (kid) {
    if (!farkli(kid)) return;
    var t = S.ed[kid];
    if (firmalarOf(kid).length && (t.d === 'DEVAM' || t.d === 'TAMAMLANDI') && !t.f) eksik.push(kAd(kalem(kid)));
    ch.push(paket(S.villa, kid, t));
  });
  if (eksik.length) { Object.keys(S.ed).forEach(function (k) { S.acik[k] = true; }); panelCiz(); return toast(L('Firma seçin: ', 'Choose company: ') + eksik.join(', '), 4000); }
  if (!ch.length) return;
  for (var i = 0; i < ch.length; i++) { var th = tarihHata(ch[i]); if (th) return toast(kAd(kalem(ch[i].kalem)) + ': ' + th, 4000); }
  var git = function () { S.ed = {}; S.acik = {}; kaydetDegisiklik(ch); toast(L(ch.length + ' değişiklik onaya gönderildi', ch.length + ' changes sent for approval')); };
  ustuneYazUyar(ch, git);
}
/* Başkasının onay bekleyen girişinin yerine geçecek girişler için uyarı */
function ustuneYazUyar(ch, git) {
  var ca = ch.map(function (c) { var p = bek(c.bina, c.kalem); return p && !benim(p) ? { c: c, p: p } : null; }).filter(Boolean);
  if (!ca.length) return git();
  soru(L('Bekleyen giriş var', 'Pending entry exists'),
    L('Aşağıdaki girişler başka kişilerin onay bekleyen girişlerinin yerine geçecek; onlarınki geçersiz olur:', 'These entries will replace other people’s pending entries; theirs will be voided:') +
    '<div class="stack" style="margin-top:10px;max-height:40vh;overflow:auto">' + ca.slice(0, 40).map(function (x) {
      return '<div class="pendbox">' + L('Villa ', 'Villa ') + esc(x.c.bina) + ' · ' + esc(kalem(x.c.kalem) ? kAd(kalem(x.c.kalem)) : x.c.kalem) + ' — ' + esc(x.p.u) + ': ' + esc(dAd(x.p.d)) + (x.p.y ? ' %' + esc(x.p.y) : '') + '</div>';
    }).join('') + (ca.length > 40 ? '<div class="note">+' + (ca.length - 40) + '</div>' : '') + '</div>',
    L('Yine de gönder', 'Send anyway'), git, 'bad');
}
function tekOnay(id, karar) {
  api('onayla', { ids: [id], karar: karar }).then(function (r) { onaySonuc(r, karar); }, hata);
}
function onaySonuc(r, karar) {
  Object.keys(r.durum || {}).forEach(function (k) { D.durum[k] = r.durum[k]; });
  var set = {}; (r.islenen || []).forEach(function (x) { set[x] = 1; });
  Object.keys(D.bekleyen).forEach(function (k) { if (set[D.bekleyen[k].id]) delete D.bekleyen[k]; });
  S.on.sec = {}; ls(K.D, D);
  toast(L(r.adet + (karar === 'ONAY' ? ' giriş onaylandı' : ' giriş reddedildi'), r.adet + (karar === 'ONAY' ? ' entries approved' : ' entries rejected')));
  render();
}

/* ================= toplu giriş ================= */
function vToplu() {
  var ks = kalemlerOf(S.grup), tp = S.tp;
  if (!tp.k || !kalem(tp.k) || kalem(tp.k).grup !== S.grup) tp.k = ks[0] ? ks[0].id : '';
  var k = kalem(tp.k); if (!k) return '<div class="card mut">' + L('Kalem yok', 'No items') + '</div>';
  var fs = firmalarOf(k.id);
  var bs = filtre(adaBinalar(S.ada)).filter(function (b) { return onayli(b.id, k.id).d !== 'YOK'; });
  var secN = Object.keys(tp.sec).filter(function (x) { return tp.sec[x]; }).length;
  var h = kuyrukBanner() + '<div class="card stack"><div class="sec" style="margin:0">1 · ' + L('Kalem', 'Item') + '</div><div class="chips" style="flex-wrap:wrap;padding:0">' +
    ks.map(function (x) { return '<button class="chip acc ' + (x.id === k.id ? 'on' : '') + '" onclick="S.tp.k=\'' + x.id + '\';S.tp.sec={};S.tp.f=\'\';viewCiz()">' + esc(kAd(x)) + '</button>'; }).join('') + '</div>' +
    '<div class="sec" style="margin:4px 0 0">2 · ' + L('Yeni durum', 'New status') + '</div><div class="dseg">' + DUR.map(function (d) { return '<button class="' + d + (tp.d === d ? ' on' : '') + '" onclick="S.tp.d=\'' + d + '\';viewCiz()">' + dAd(d) + '</button>'; }).join('') + '</div>' +
    (k.takip !== 'DURUM' && tp.d === 'DEVAM' ? '<div class="qk">' + ['', 25, 50, 75, 90].map(function (x) { return '<button class="' + (String(tp.y) === String(x) ? 'on' : '') + '" onclick="S.tp.y=\'' + x + '\';viewCiz()">' + (x === '' ? L('% değişmesin', 'Keep %') : '%' + x) + '</button>'; }).join('') + '</div>' : '') +
    (tp.d === 'DEVAM' || tp.d === 'TAMAMLANDI' ? '<div class="frow"><span class="lb">' + L('Firma', 'Company') + (fs.length ? ' *' : '') + '</span>' + (fs.length ? fs : (D.firmalar || []).filter(function (f) { return f.aktif; }).slice(0, 0)).map(function (f) { return '<button class="fchip ' + (tp.f === f.ad ? 'on' : '') + '" onclick="S.tp.f=S.tp.f===' + jq(f.ad) + '?\'\':' + jq(f.ad) + ';viewCiz()">' + esc(f.kisa || f.ad) + '</button>'; }).join('') +
      '<span class="note">' + (fs.length ? L('Boş bırakılırsa villadaki mevcut firma korunur.', 'If empty, the villa’s current company is kept.') : L('Bu kaleme atanmış firma yok.', 'No company assigned to this item.')) + '</span></div>' : '') +
    '</div>' +
    '<div class="grpT"><b>3 · ' + L('Villalar', 'Villas') + ' <span class="t2">(' + secN + '/' + bs.length + ')</span></b><span><button class="lnk" onclick="topluHepsi(true)">' + L('Tümü', 'All') + '</button><button class="lnk" onclick="topluHepsi(false)">' + L('Temizle', 'Clear') + '</button></span></div>' +
    '<div class="vgrid">' + bs.map(function (b) {
      var s = onayli(b.id, k.id), sel = !!tp.sec[b.id];
      return '<button class="vc ' + (sel ? 'sel' : '') + '" onclick="S.tp.sec[\'' + b.id + '\']=!S.tp.sec[\'' + b.id + '\'];viewCiz()"><span class="ck">' + (sel ? I.ok : '') + '</span>' +
        '<div><div class="no">' + esc(b.id) + '</div><div class="tp">' + L('Tip ', 'Type ') + esc(b.tip) + '</div></div><span class="sb ' + s.d + '" style="align-self:flex-start">' + dAd(s.d) + (s.d === 'DEVAM' && s.y ? ' %' + esc(s.y) : '') + (bek(b.id, k.id) ? ' •' : '') + '</span></button>';
    }).join('') + '</div>' +
    '<div class="foot"><button class="btn full" ' + (secN ? '' : 'disabled') + ' onclick="topluKaydet()">' + L(secN + ' villaya uygula · onaya gönder', 'Apply to ' + secN + ' villas · send for approval') + '</button></div>';
  return h;
}
function topluHepsi(on) {
  var k = kalem(S.tp.k); S.tp.sec = {};
  if (on) filtre(adaBinalar(S.ada)).forEach(function (b) { if (onayli(b.id, k.id).d !== 'YOK') S.tp.sec[b.id] = true; });
  viewCiz();
}
function topluKaydet() {
  var tp = S.tp, k = kalem(tp.k), ids = Object.keys(tp.sec).filter(function (x) { return tp.sec[x]; });
  var fs = firmalarOf(k.id);
  var eksik = (tp.d === 'DEVAM' || tp.d === 'TAMAMLANDI') && fs.length ? ids.filter(function (id) { return !tp.f && !gor(id, k.id).f; }) : [];
  if (eksik.length) return toast(L('Firma seçin (firmasız villa: ', 'Choose a company (villas without company: ') + eksik.slice(0, 6).join(', ') + (eksik.length > 6 ? '…' : '') + ')', 4500);
  var degis = ids.filter(function (id) { var a = onayli(id, k.id).f; return tp.f && a && a !== tp.f; });
  soru(L('Toplu giriş', 'Bulk entry'), '<b>' + esc(kAd(k)) + '</b> → <b>' + dAd(tp.d) + (tp.d === 'DEVAM' && tp.y ? ' %' + tp.y : '') + '</b>' + (tp.f ? ' · ' + esc(fkisa(tp.f)) : '') + '<br>' + ids.length + ' ' + L('villa', 'villas') + ': ' + esc(ids.slice(0, 30).join(', ')) + (ids.length > 30 ? '…' : '') +
    (degis.length ? '<div class="banner" style="margin-top:10px">' + L(degis.length + ' villada firma değişecek: ', 'Company will change on ' + degis.length + ' villas: ') + esc(degis.join(', ')) + '</div>' : ''),
    L('Onaya gönder', 'Send for approval'), function () {
      var ch = ids.map(function (id) {
        var e = gor(id, k.id), n = yeniDurum(e, tp.d);
        if (tp.d === 'DEVAM' && k.takip !== 'DURUM' && tp.y !== '') n.y = tp.y;
        if (tp.f) n.f = tp.f;
        return paket(id, k.id, n);
      });
      ustuneYazUyar(ch, function () { S.tp.sec = {}; kaydetDegisiklik(ch); });
    });
}

/* ================= onay ================= */
function vOnay() {
  if (!admin()) {
    var benim_ = bekleyenListe().filter(benim).sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    return kuyrukBanner() + '<div class="h" style="font-size:24px;margin:4px 2px 10px">' + L('Girişlerim', 'My entries') + '</div>' +
      '<div class="banner info" style="margin-bottom:10px">' + L('Girişleriniz MRAC onayından sonra raporlara ve haritaya yansır.', 'Your entries appear on reports and the map after MRAC approval.') + '</div>' +
      (benim_.length ? '<div class="stack">' + benim_.map(function (p) { return onaySatir(p, false); }).join('') + '</div>' : '<div class="card mut">' + L('Onay bekleyen girişiniz yok.', 'You have no entries awaiting approval.') + '</div>');
  }
  var on = S.on, ku = bekKul();
  var tum = bekleyenListe().filter(function (p) { var b = bina(p.bina); return b && (on.ada === 'all' || adaHarf(b) === on.ada); })
    .sort(function (a, b) { return String(a.t).localeCompare(String(b.t)); });
  var h = kuyrukBanner() + '<div class="h" style="font-size:24px;margin:4px 2px 10px">' + L('Onay', 'Approval') + '</div>' +
    '<div class="seg sm" style="margin-bottom:12px"><button class="' + (on.tab === 'giris' ? 'on' : '') + '" onclick="S.on.tab=\'giris\';viewCiz()">' + L('Girişler', 'Entries') + ' (' + bekleyenListe().length + ')</button><button class="' + (on.tab === 'kul' ? 'on' : '') + '" onclick="S.on.tab=\'kul\';viewCiz()">' + L('Kullanıcılar', 'Users') + (ku.length ? ' (' + ku.length + ')' : '') + '</button></div>';
  if (on.tab === 'kul') return h + kullaniciListe();
  var secN = tum.filter(function (p) { return on.sec[p.id]; }).length;
  h += '<div class="chips" style="padding-top:0">' + [['all', L('Tümü', 'All')], ['A', L('A Adası', 'Island A')], ['C', L('C Adası', 'Island C')]].map(function (x) { return '<button class="chip ' + (on.ada === x[0] ? 'on' : '') + '" onclick="S.on.ada=\'' + x[0] + '\';S.on.sec={};viewCiz()">' + x[1] + '</button>'; }).join('') +
    '<button class="chip" style="margin-left:auto" onclick="onayHepsi()">' + (secN === tum.filter(function (p) { return p.id !== 'yerel'; }).length && secN ? L('Seçimi kaldır', 'Clear selection') : L('Tümünü seç', 'Select all')) + '</button></div>';
  if (!tum.length) return h + '<div class="card mut">' + L('Onay bekleyen giriş yok.', 'No entries awaiting approval.') + '</div>';
  h += '<div class="stack">' + tum.map(function (p) { return onaySatir(p, true); }).join('') + '</div>' +
    '<div class="foot"><button class="btn bad" style="flex:1" ' + (secN ? '' : 'disabled') + ' onclick="topluOnay(\'RED\')">' + L('Reddet', 'Reject') + '</button><button class="btn ok" style="flex:2" ' + (secN ? '' : 'disabled') + ' onclick="topluOnay(\'ONAY\')">' + L(secN + ' girişi onayla', 'Approve ' + secN) + '</button></div>';
  return h;
}
function onaySatir(p, sec) {
  var k = kalem(p.kalem) || { ad: p.kalem }, s = S.on.sec[p.id], yer = p.id === 'yerel';
  var fd = p.ef && p.f && p.ef !== p.f;
  return '<div class="orow ' + (s ? 'sel' : '') + '" ' + (sec && !yer ? 'onclick="S.on.sec[\'' + p.id + '\']=!S.on.sec[\'' + p.id + '\'];viewCiz()"' : '') + ' role="button">' +
    (sec ? '<span class="cbx">' + (s ? I.ok : '') + '</span>' : '') +
    '<div class="grow"><div class="t1">' + L('Villa ', 'Villa ') + esc(p.bina) + ' · ' + esc(kAd(k)) + '</div>' +
    '<div class="arrow"><span class="sb ' + (p.ed || 'BASLANMAMIS') + '">' + dAd(p.ed || 'BASLANMAMIS') + '</span>→<span class="sb ' + p.d + '">' + dAd(p.d) + (p.y ? ' %' + esc(p.y) : '') + '</span>' + (p.f ? '<span class="tag">' + esc(fkisa(p.f)) + '</span>' : '') + (fd ? '<span class="tag" style="background:var(--wipS);color:var(--wipT)">' + L('firma değişti: ', 'company changed: ') + esc(fkisa(p.ef)) + '</span>' : '') + '</div>' +
    '<div class="t2">' + esc(p.u) + ' · ' + esc(String(p.t).slice(0, 16)) + (p.b || p.e ? ' · ' + L('tarih: ', 'dates: ') + esc((p.b || '—') + ' → ' + (p.e || '—')) : '') + (yer ? ' · ' + L('gönderilmeyi bekliyor', 'waiting to send') : '') + '</div>' +
    (p.n ? '<div class="note" style="margin-top:4px">“' + esc(p.n) + '”</div>' : '') + '</div>' +
    '<button class="iconbtn" style="width:38px;height:38px" onclick="event.stopPropagation();villaAc(\'' + p.bina + '\')" aria-label="' + L('Villayı aç', 'Open villa') + '">' + I.chev + '</button></div>';
}
function onayHepsi() {
  var tum = bekleyenListe().filter(function (p) { var b = bina(p.bina); return p.id !== 'yerel' && b && (S.on.ada === 'all' || adaHarf(b) === S.on.ada); });
  var hepsi = tum.length && tum.every(function (p) { return S.on.sec[p.id]; });
  S.on.sec = {}; if (!hepsi) tum.forEach(function (p) { S.on.sec[p.id] = true; });
  viewCiz();
}
function topluOnay(karar) {
  var ids = Object.keys(S.on.sec).filter(function (x) { return S.on.sec[x]; });
  if (!ids.length) return;
  var f = function () { api('onayla', { ids: ids, karar: karar }).then(function (r) { onaySonuc(r, karar); }, hata); };
  if (karar === 'RED') return soru(L(ids.length + ' giriş reddedilsin mi?', 'Reject ' + ids.length + ' entries?'), L('Reddedilen girişler raporlara yansımaz.', 'Rejected entries will not appear in reports.'), L('Reddet', 'Reject'), f, 'bad');
  f();
}
function kullaniciListe() {
  var us = (D.kullanicilar || []).slice();
  var sira = { BEKLIYOR: 0, ONAYLI: 1, PASIF: 2, REDDEDILDI: 3, BIRLESTI: 4 };
  us.sort(function (a, b) { return (sira[a.durum] - sira[b.durum]) || String(a.ad).localeCompare(String(b.ad)); });
  if (!us.length) return '<div class="card mut">' + L('Kullanıcı yok', 'No users') + '</div>';
  var lab = { BEKLIYOR: L('Onay bekliyor', 'Pending'), ONAYLI: L('Onaylı', 'Approved'), PASIF: L('Pasif', 'Inactive'), REDDEDILDI: L('Reddedildi', 'Rejected'), BIRLESTI: L('Birleştirildi', 'Merged') };
  var renk = { BEKLIYOR: 'var(--pendS);color:var(--pend)', ONAYLI: 'var(--okS);color:var(--ok)', PASIF: 'var(--soft);color:var(--mut)', REDDEDILDI: 'var(--badS);color:var(--bad)', BIRLESTI: 'var(--soft);color:var(--mut2)' };
  return '<div class="stack">' + us.map(function (u) {
    var bu = u.id === ben().id;
    var btn = u.durum === 'BEKLIYOR' ? '<button class="btn sm bad" onclick="kulKarar(\'' + u.id + '\',\'RED\')">' + L('Reddet', 'Reject') + '</button><button class="btn sm ok" onclick="kulKarar(\'' + u.id + '\',\'ONAY\')">' + L('Onayla', 'Approve') + '</button>'
      : u.durum === 'ONAYLI' ? (bu ? '<span class="tag">' + L('Siz', 'You') + '</span>' : u.id === D.kurucu ? '<span class="tag">' + L('Kurucu', 'Owner') + '</span>' : '<button class="btn sm soft" onclick="kulKarar(\'' + u.id + '\',\'PASIF\')">' + L('Pasif yap', 'Deactivate') + '</button>')
        : u.durum === 'BIRLESTI' ? '' : '<button class="btn sm soft" onclick="kulKarar(\'' + u.id + '\',\'AKTIF\')">' + L('Aktif yap', 'Activate') + '</button>';
    if (u.durum !== 'BIRLESTI') btn += '<button class="btn sm soft" onclick="kulCihazlar(\'' + u.id + '\')">' + I.devices.replace(/22/g, '16') + (u.cihaz || 0) + '</button>';
    if (u.durum !== 'BIRLESTI' && u.id !== D.kurucu && !bu) btn += '<button class="btn sm soft" onclick="kulBirlestir(\'' + u.id + '\')">' + L('Birleştir', 'Merge') + '</button>';
    return '<div class="list-row" style="flex-wrap:wrap"><span class="ico" style="background:' + (u.rol === 'YONETICI' ? 'var(--ink);color:#fff' : 'var(--accS);color:var(--acc)') + '">' + esc((u.ad || '?').charAt(0).toUpperCase()) + '</span>' +
      '<div class="grow"><div class="t1">' + esc(u.ad) + (u.rol === 'YONETICI' ? ' <span class="tag">' + L('Yönetici', 'Admin') + '</span>' : '') + '</div><div class="t2">' + esc(u.firma) + ' · ' + esc(String(u.kayit || '').slice(0, 10)) + (u.son ? ' · ' + L('son: ', 'last: ') + esc(String(u.son).slice(0, 10)) : '') + '</div>' +
      '<span class="sb" style="display:inline-block;margin-top:6px;background:' + renk[u.durum] + '">' + (lab[u.durum] || u.durum) + '</span></div>' +
      (btn ? '<div style="display:flex;gap:6px;flex-wrap:wrap;width:100%;padding-left:52px">' + btn + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}
function kulKarar(id, karar) {
  var u = (D.kullanicilar || []).filter(function (x) { return x.id === id; })[0] || {};
  var f = function () { api('kullaniciKarar', { id: id, karar: karar }).then(function (r) { D.kullanicilar = r.kullanicilar; ls(K.D, D); toast(L('Kaydedildi', 'Saved')); render(); }, hata); };
  if (karar === 'ONAY' && u.firma === D.yoneticiFirma) return soru(L('Yönetici onayı', 'Admin approval'), L(esc(u.ad) + ' MRAC personeli olarak yönetici yetkisi alacak (tüm girişleri onaylayabilir).', esc(u.ad) + ' will get admin rights as MRAC staff (can approve all entries).'), L('Onayla', 'Approve'), f, 'ok');
  if (karar === 'RED' || karar === 'PASIF') return soru(esc(u.ad), karar === 'RED' ? L('Kayıt reddedilsin mi?', 'Reject this registration?') : L('Kullanıcı pasif yapılsın mı? Bu cihazdan giriş yapamaz.', 'Deactivate this user? They will no longer be able to sign in.'), karar === 'RED' ? L('Reddet', 'Reject') : L('Pasif yap', 'Deactivate'), f, 'bad');
  f();
}

/* ================= diğer ================= */
function altSayfa(s) { if (s === 'bagkod') BAG = null; if (s === 'cihazlar') CIHAZ = null; S.sub = s; try { history.pushState({ p: 'sub' }, ''); SUB_DERIN++; } catch (e) {} if (s === 'rapor') { S.rp.grup = S.rp.grup || S.grup; S.rp.ada = S.rp.ada || S.ada; S.rp.dil = S.rp.dil || S.dil; S.rp.sonuc = null; } render(); }
function geriBas(baslik, sag) {
  return '<div style="display:flex;align-items:center;gap:10px;margin:0 0 12px"><button class="iconbtn" onclick="history.back()" aria-label="' + L('Geri', 'Back') + '">' + I.back + '</button><div class="h grow" style="font-size:24px">' + baslik + '</div>' + (sag || '') + '</div>';
}
function vDiger() {
  switch (S.sub) {
    case 'rapor': return vRapor();
    case 'firmalar': return vFirmalar();
    case 'firma': return vFirmaDuzen();
    case 'kalem': return vKalemEkle();
    case 'davet': return vDavet();
    case 'bagkod': return vBagKod();
    case 'cihazlar': return vCihazlar();
    case 'gps': return vGps();
    case 'hakkinda': return vHakkinda();
    case 'kullanicilar': return geriBas(L('Kullanıcılar', 'Users')) + kullaniciListe();
  }
  var u = ben(), ad = admin();
  var sat = function (s, ic, t, a, ek) { return '<button class="list-row" onclick="' + (s.indexOf('(') >= 0 ? s : 'altSayfa(\'' + s + '\')') + '"><span class="ico" style="background:var(--accS);color:var(--acc)">' + ic + '</span><span class="grow"><span class="t1" style="display:block">' + t + '</span>' + (a ? '<span class="t2" style="display:block">' + a + '</span>' : '') + '</span>' + (ek || '') + I.chev + '</button>'; };
  var q = kuyruk().length;
  return kuyrukBanner() +
    '<div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="ava">' + esc((u.ad || '?').charAt(0).toUpperCase()) + '</span><div class="grow"><div class="t1">' + esc(u.ad) + '</div><div class="t2">' + esc(u.firma) + ' · ' + (ad ? L('Yönetici', 'Administrator') : L('Saha kullanıcısı', 'Field user')) + '</div></div></div>' +
    '<div class="stack">' +
    sat('rapor', I.doc, L('Rapor ve metraj', 'Report and quantities'), L('A / C / A+C · PDF · Türkçe / İngilizce', 'A / C / A+C · PDF · Turkish / English')) +
    sat('firmalar', I.firm, L('Firmalar', 'Companies'), (D.firmalar || []).length + ' ' + L('firma', 'companies')) +
    (ad ? sat('kalem', I.plus, L('Yeni kalem ekle', 'Add new item'), L('Betonarme veya Finishing', 'Structural or Finishing')) : '') +
    (ad ? sat('kullanicilar', I.user, L('Kullanıcılar', 'Users'), (D.kullanicilar || []).length + ' ' + L('kayıtlı', 'registered') + (bekKul().length ? ' · ' + bekKul().length + ' ' + L('onay bekliyor', 'pending') : '')) : '') +
    sat('bagkod', I.link, L('Başka cihazda aç', 'Open on another device'), L('Bilgisayar ya da tabletten aynı hesapla gir', 'Use the same account on a computer or tablet')) +
    sat('cihazlar', I.devices, L('Cihazlarım', 'My devices'), L('Bağlı cihazları gör ve kaldır', 'See and remove linked devices')) +
    sat('davet', I.qr, L('Davet linki ve QR', 'Invite link and QR'), L('Yeni kullanıcı kaydı için', 'For new user registration')) +
    (gpsYetki() ? sat('gps', I.gps, L('GPS kalibrasyonu', 'GPS calibration'), ((D.gps || []).length) + ' ' + L('nokta', 'points') + ((D.gps || []).length >= 3 ? ' · ' + L('hazır', 'ready') : ' · ' + L('en az 3 gerekli', 'at least 3 needed'))) : '') +
    sat('dilDegis()', I.globe, L('Dil: Türkçe', 'Language: English'), L('English’e geç', 'Switch to Türkçe')) +
    sat('hakkinda', I.info, L('Hakkında ve senkron', 'About and sync'), 'v' + APP_SURUM + (q ? ' · ' + q + ' ' + L('gönderilecek', 'to send') : '') + (S.sonSenk ? ' · ' + L('son senkron ', 'last sync ') + esc(S.sonSenk) : '')) +
    '</div>';
}
function dilDegis() { dilSec(S.dil === 'EN' ? 'TR' : 'EN'); }

/* ---------- rapor ---------- */
function vRapor() {
  var rp = S.rp, bs = adaBinalar(rp.ada === 'AC' ? 'AC' : rp.ada), ks = kalemlerOf(rp.grup), mo = metrajOzet(bs, ks);
  var h = geriBas(L('Rapor', 'Report')) +
    '<div class="card stack"><div class="seg sm">' + [['A', L('A adası', 'Island A')], ['C', L('C adası', 'Island C')], ['AC', 'A + C']].map(function (x) { return '<button class="' + (rp.ada === x[0] ? 'on' : '') + '" onclick="S.rp.ada=\'' + x[0] + '\';S.rp.sonuc=null;viewCiz()">' + x[1] + '</button>'; }).join('') + '</div>' +
    '<div class="seg sm acc">' + gruplar().map(function (g) { return '<button class="' + (rp.grup === g ? 'on' : '') + '" onclick="S.rp.grup=' + jq(g) + ';S.rp.sonuc=null;viewCiz()">' + esc(gAd(g)) + '</button>'; }).join('') + '</div>' +
    '<div class="frow"><span class="lb">' + L('Rapor dili', 'Report language') + '</span>' + [['TR', 'Türkçe'], ['EN', 'English']].map(function (x) { return '<button class="fchip ' + (rp.dil === x[0] ? 'on' : '') + '" onclick="S.rp.dil=\'' + x[0] + '\';S.rp.sonuc=null;viewCiz()">' + x[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="grpT"><b>' + L('Yaklaşık ilerleme', 'Approximate progress') + '</b><span class="t2">' + L('onaylı veri · Devam %’siz = %10', 'approved data · In progress w/o % = 10%') + '</span></div><div class="stack">';
  mo.forEach(function (r) {
    var p = Math.round(r.p), pc = p >= 15 ? 'var(--ok)' : (p > 0 ? '#A66F00' : 'var(--mut2)');
    h += '<div class="card mrow"><div class="hd"><span class="t1">' + esc(kAd(r.k)) + '</span><span class="pc" style="color:' + pc + '">%' + p + '</span></div>' +
      '<div class="mbar"><i style="width:' + Math.max(p, 1) + '%;background:' + (p >= 15 ? 'var(--okB)' : 'var(--wip)') + '"></i></div>' +
      (r.top ? '<div class="mnums"><span>' + L('Yapılan', 'Done') + ' <b>' + fmtQ(r.yap, r.k.birim) + '</b></span><span>' + L('Kalan', 'Remaining') + ' ' + fmtQ(r.top - r.yap, r.k.birim) + '</span><span>' + L('Toplam', 'Total') + ' ' + fmtQ(r.top, r.k.birim) + '</span></div>' : '') +
      '<div class="mnums" style="margin-top:4px"><span>' + L('Bitti', 'Done') + ' <b>' + r.ok + '</b></span><span>' + L('Devam', 'In progress') + ' <b>' + r.wip + '</b></span><span>' + L('Başlamadı', 'Not started') + ' <b>' + (r.n - r.ok - r.wip) + '</b></span><span>/ ' + r.n + '</span></div></div>';
  });
  h += '</div>';
  var so = rp.sonuc;
  h += '<div class="foot">' + (rp.busy ? '<button class="btn full" disabled><span class="spin" style="width:20px;height:20px;border-color:#fff4;border-top-color:#fff"></span>' + L('PDF hazırlanıyor…', 'Preparing PDF…') + '</button>'
    : so && so.pdf ? '<button class="btn soft" onclick="S.rp.sonuc=null;viewCiz()">' + L('Yeni', 'New') + '</button><a class="btn lt" style="flex:1;text-decoration:none" href="' + esc(so.pdf) + '" target="_blank" rel="noopener">' + L('Aç', 'Open') + '</a><a class="btn ok" style="flex:1;text-decoration:none" href="' + esc(so.indir) + '" target="_blank" rel="noopener">' + L('İndir', 'Download') + '</a>'
      : '<button class="btn full" onclick="raporAl()">' + L('PDF oluştur', 'Create PDF') + '</button>') + '</div>';
  return h;
}
function raporAl() {
  if (!S.online) return toast(L('PDF için bağlantı gerekli', 'Connection required for PDF'));
  S.rp.busy = true; viewCiz();
  api('rapor', { grup: S.rp.grup, ada: S.rp.ada, dil: S.rp.dil }, 150000).then(function (r) {
    S.rp.busy = false; S.rp.sonuc = r; viewCiz(); if (r.uyari) toast(r.uyari, 5000);
  }, function (e) { S.rp.busy = false; viewCiz(); hata(e); });
}

/* ---------- firmalar ---------- */
function vFirmalar() {
  var q = (S.fAra || '').toLowerCase(), fs = (D.firmalar || []).filter(function (f) { return !q || f.ad.toLowerCase().indexOf(q) >= 0; });
  var h = geriBas(L('Firmalar', 'Companies') + ' <span style="font-size:14px;color:var(--mut2)">' + (D.firmalar || []).length + '</span>') +
    '<label class="search" style="margin:0 0 12px;background:#fff;box-shadow:var(--sh)">' + I.search + '<input type="search" placeholder="' + L('Firma ara', 'Search company') + '" value="' + esc(S.fAra || '') + '" oninput="S.fAra=this.value;clearTimeout(araT);araT=setTimeout(viewCiz,200)"></label><div class="stack">';
  fs.forEach(function (f) {
    var on = f.kalemler.length;
    var ini = f.ad.replace(/[^A-Za-zÇĞİÖŞÜ0-9 ]/g, '').trim().split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2);
    h += '<button class="list-row" ' + (admin() ? 'onclick="firmaAc(\'' + f.id + '\')"' : '') + ' style="' + (f.aktif ? '' : 'opacity:.5') + '"><span class="ico" style="background:' + (on ? 'var(--accS);color:var(--acc)' : 'var(--soft);color:var(--mut)') + '">' + esc(ini) + '</span>' +
      '<span class="grow"><span class="t1" style="display:block">' + esc(f.ad) + (f.kisa && f.kisa !== f.ad ? ' <span class="t2">(' + esc(f.kisa) + ')</span>' : '') + '</span><span class="t2" style="display:block;color:' + (on ? 'var(--acc)' : 'var(--mut2)') + ';font-weight:600">' +
      (on ? f.kalemler.map(function (k) { return kalem(k) ? esc(kAd(kalem(k))) : k; }).join(' · ') : L('Kalem atanmamış', 'No items assigned')) + (f.yetkili ? ' · ' + esc(f.yetkili) : '') + '</span></span>' + (admin() ? I.chev : '') + '</button>';
  });
  h += '</div>' + (admin() ? '<div class="foot"><button class="btn acc full" onclick="firmaAc(null)">' + I.plus + L('Firma ekle', 'Add company') + '</button></div>' : '');
  return h;
}
function firmaAc(id) {
  var f = id ? (D.firmalar || []).filter(function (x) { return x.id === id; })[0] : null;
  S.fe = f ? kopya(f) : { ad: '', kisa: '', yetkili: '', tel: '', kalemler: [], aktif: true };
  S.sub = 'firma'; try { history.pushState({ p: 'sub' }, ''); SUB_DERIN++; } catch (e) {} render();
}
function vFirmaDuzen() {
  var f = S.fe;
  var inp = function (k, lab, tp) { return '<div class="field"><label>' + lab + '</label><input class="inp" ' + (tp || '') + ' value="' + esc(f[k] || '') + '" oninput="S.fe.' + k + '=this.value"></div>'; };
  return geriBas(f.id ? esc(f.ad) : L('Yeni firma', 'New company')) + '<div class="card stack">' +
    inp('ad', L('Firma adı', 'Company name')) + inp('kisa', L('Kısa ad (etiketlerde)', 'Short name (labels)')) + inp('yetkili', L('Yetkili', 'Contact person')) + inp('tel', L('Telefon', 'Phone'), 'type="tel"') +
    '<div class="field"><label>' + L('Atandığı kalemler', 'Assigned items') + '</label><div class="chips" style="flex-wrap:wrap;padding:0">' + D.kalemler.map(function (k) { var on = f.kalemler.indexOf(k.id) >= 0; return '<button class="chip acc ' + (on ? 'on' : '') + '" onclick="firmaKalem(\'' + k.id + '\')">' + esc(kAd(k)) + '</button>'; }).join('') + '</div></div>' +
    '<div class="frow"><span class="lb">' + L('Durum', 'Status') + '</span><button class="fchip ' + (f.aktif ? 'on' : '') + '" onclick="S.fe.aktif=true;viewCiz()">' + L('Aktif', 'Active') + '</button><button class="fchip ' + (!f.aktif ? 'on' : '') + '" onclick="S.fe.aktif=false;viewCiz()">' + L('Pasif', 'Inactive') + '</button></div></div>' +
    '<div class="foot"><button class="btn acc full" onclick="firmaKaydet()">' + L('Kaydet', 'Save') + '</button></div>';
}
function firmaKalem(k) { var a = S.fe.kalemler, i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); viewCiz(); }
function firmaKaydet() {
  if (!S.fe.ad.trim()) return toast(L('Firma adı gerekli', 'Company name required'));
  api('firmaKaydet', { firma: S.fe }).then(function () { toast(L('Firma kaydedildi', 'Company saved')); history.back(); veriAl(true).catch(function () {}); }, hata);
}

/* ---------- kalem ekle ---------- */
function vKalemEkle() {
  var y = S.ke = S.ke || { grup: S.grup, ad: '', en: '', kisa: '', takip: 'DURUM_YUZDE', birim: '', kapsam: { tur: 'TUM', paket: '', cinsler: [] } };
  var cinsler = uniq(D.binalar.map(function (b) { return b.cins; }));
  var adet = D.binalar.filter(function (b) { var k = y.kapsam; if (k.tur === 'PAKET') return k.paket && onayli(b.id, k.paket).d !== 'YOK'; if (k.tur === 'CINS') return k.cinsler.indexOf(b.cins) >= 0; return true; }).length;
  var inp = function (k, lab) { return '<div class="field"><label>' + lab + '</label><input class="inp" value="' + esc(y[k] || '') + '" oninput="S.ke.' + k + '=this.value"></div>'; };
  return geriBas(L('Yeni kalem', 'New item')) + '<div class="card stack">' +
    '<div class="seg sm acc">' + gruplar().map(function (g) { return '<button class="' + (y.grup === g ? 'on' : '') + '" onclick="S.ke.grup=' + jq(g) + ';viewCiz()">' + esc(gAd(g)) + '</button>'; }).join('') + '</div>' +
    inp('ad', L('Kalem adı (Türkçe)', 'Item name (Turkish)')) + inp('en', L('Kalem adı (İngilizce)', 'Item name (English)')) + inp('kisa', L('Kısa ad (3 harf, isteğe bağlı)', 'Short code (3 letters, optional)')) +
    '<div class="frow"><span class="lb">' + L('Takip', 'Tracking') + '</span><button class="fchip ' + (y.takip === 'DURUM' ? 'on' : '') + '" onclick="S.ke.takip=\'DURUM\';viewCiz()">' + L('Yalnız durum', 'Status only') + '</button><button class="fchip ' + (y.takip !== 'DURUM' ? 'on' : '') + '" onclick="S.ke.takip=\'DURUM_YUZDE\';viewCiz()">' + L('Durum + %', 'Status + %') + '</button></div>' +
    '<div class="frow"><span class="lb">' + L('Birim', 'Unit') + '</span>' + [['', L('Yok', 'None')], ['m²', 'm²'], ['ton', 'ton'], ['adet', L('adet', 'pcs')]].map(function (x) { return '<button class="fchip ' + (y.birim === x[0] ? 'on' : '') + '" onclick="S.ke.birim=\'' + x[0] + '\';viewCiz()">' + x[1] + '</button>'; }).join('') + '</div>' +
    '<div class="field"><label>' + L('Hangi villalarda var?', 'Which villas have it?') + '</label><div class="seg sm">' +
    [['TUM', L('Tümü', 'All')], ['PAKET', L('Bir kalemin olduğu', 'Same as item')], ['CINS', L('Villa cinsine göre', 'By villa kind')]].map(function (x) { return '<button class="' + (y.kapsam.tur === x[0] ? 'on' : '') + '" onclick="S.ke.kapsam.tur=\'' + x[0] + '\';viewCiz()">' + x[1] + '</button>'; }).join('') + '</div></div>' +
    (y.kapsam.tur === 'PAKET' ? '<div class="chips" style="flex-wrap:wrap;padding:0">' + D.kalemler.map(function (k) { return '<button class="chip acc ' + (y.kapsam.paket === k.id ? 'on' : '') + '" onclick="S.ke.kapsam.paket=\'' + k.id + '\';viewCiz()">' + esc(kAd(k)) + '</button>'; }).join('') + '</div>' : '') +
    (y.kapsam.tur === 'CINS' ? '<div class="chips" style="flex-wrap:wrap;padding:0">' + cinsler.map(function (c) { var on = y.kapsam.cinsler.indexOf(c) >= 0; return '<button class="chip acc ' + (on ? 'on' : '') + '" onclick="keCins(' + jq(c) + ')">' + esc(cAd(c)) + '</button>'; }).join('') + '</div>' : '') +
    '<div class="banner info">' + L(adet + ' villaya “Başlamadı” olarak eklenecek; diğerleri “Yok”.', 'Will be added as “Not started” to ' + adet + ' villas; others “N/A”.') + '</div>' +
    '<div class="note">' + L('Metraj gerekiyorsa e-tablodaki Metraj sayfasına tip bazında eklenir.', 'Quantities, if needed, are added per type in the Metraj sheet.') + '</div></div>' +
    '<div class="foot"><button class="btn acc full" onclick="kalemGonder()">' + L('Kalemi ekle', 'Add item') + '</button></div>';
}
function keCins(c) { var a = S.ke.kapsam.cinsler, i = a.indexOf(c); if (i >= 0) a.splice(i, 1); else a.push(c); viewCiz(); }
function kalemGonder() {
  var y = S.ke; if (!y.ad.trim()) return toast(L('Kalem adı gerekli', 'Item name required'));
  if (y.kapsam.tur === 'PAKET' && !y.kapsam.paket) return toast(L('Kapsam kalemini seçin', 'Choose the scope item'));
  soru(L('Kalem eklensin mi?', 'Add item?'), esc(gAd(y.grup)) + ' · <b>' + esc(y.ad) + '</b>' + (y.en ? ' / ' + esc(y.en) : ''), L('Ekle', 'Add'), function () {
    api('kalemEkle', { veri: y }).then(function (r) { toast(L('Kalem eklendi: ', 'Item added: ') + r.id); S.ke = null; history.back(); veriAl(true).catch(function () {}); }, hata);
  });
}

/* ---------- davet / QR ---------- */
function davetLink() { var a = (D && D.uygulamaAdresi) || ''; if (!a || DEMO) a = location.origin + location.pathname; return a; }
function vDavet() {
  var l = davetLink();
  return geriBas(L('Davet', 'Invite')) + '<div class="card stack" style="align-items:center;text-align:center">' +
    '<div id="qr" style="width:240px;height:240px;background:#fff;padding:8px;border-radius:16px"></div>' +
    '<div class="t1" style="word-break:break-all">' + esc(l) + '</div>' +
    '<div class="mut" style="font-size:13.5px;line-height:1.45">' + L('Linki veya QR kodu gönderin. Kişi açınca dili seçer, adını ve firmasını yazar; kayıt sizin onayınıza düşer.', 'Send the link or QR code. The person chooses a language, enters name and company; the registration comes to you for approval.') + '</div>' +
    '<div style="display:flex;gap:8px;width:100%"><button class="btn soft" style="flex:1" onclick="kopyala(' + jq(l) + ')">' + L('Kopyala', 'Copy') + '</button>' +
    (navigator.share ? '<button class="btn" style="flex:1" onclick="navigator.share({title:\'MXM SiteTrack\',url:' + jq(l) + '}).catch(function(){})">' + L('Paylaş', 'Share') + '</button>' : '') +
    '<button class="btn acc" style="flex:1" onclick="qrIndir()">' + L('QR indir', 'Save QR') + '</button></div></div>';
}
function qrCiz() {
  var el = $('qr'); if (!el || !window.qrcode) return;
  var q = qrcode(0, 'M'); q.addData(davetLink()); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  var s = el.querySelector('svg'); if (s) { s.style.width = '100%'; s.style.height = '100%'; }
}
function qrIndir() {
  var q = qrcode(0, 'M'); q.addData(davetLink()); q.make();
  var n = q.getModuleCount(), cs = 16, m = 4, W = (n + m * 2) * cs;
  var c = document.createElement('canvas'); c.width = W; c.height = W + 90; var x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#0B1220';
  for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (q.isDark(r, cc)) x.fillRect((cc + m) * cs, (r + m) * cs, cs, cs);
  x.font = 'bold 44px Inter, sans-serif'; x.textAlign = 'center'; x.fillText('MXM SiteTrack', W / 2, W + 52);
  var a = document.createElement('a'); a.download = 'MXM_SiteTrack_QR.png'; a.href = c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
}
function kopyala(t) {
  var ok = function () { toast(L('Kopyalandı', 'Copied')); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function () { prompt('', t); }); else prompt('', t);
}

/* ---------- başka cihazda aç (bağlama kodu) ---------- */
var BAG = null, BAG_T = null;
function bagSayacDur() { if (BAG_T) { clearInterval(BAG_T); BAG_T = null; } }
function bagKodAl() {
  BAG = { yukleniyor: true }; viewCiz();
  api('bagKod').then(function (r) { BAG = { kod: r.kod, bitis: Date.now() + r.sure * 1000 }; viewCiz(); }, function (e) { BAG = { hata: String(e.message || e) }; viewCiz(); });
}
function bagLink() { return davetLink() + '?bag=' + BAG.kod; }
function vBagKod() {
  if (!BAG) { BAG = { yukleniyor: true }; setTimeout(bagKodAl, 0); }
  var h = geriBas(L('Başka cihazda aç', 'Open on another device'));
  if (BAG.yukleniyor) return h + '<div class="card" style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>';
  if (BAG.hata) return h + '<div class="banner bad">' + esc(BAG.hata) + '</div><div class="foot"><button class="btn soft" style="flex:1" onclick="altSayfa(\'cihazlar\')">' + L('Cihazlarım', 'My devices') + '</button><button class="btn" style="flex:1" onclick="bagKodAl()">' + L('Tekrar dene', 'Try again') + '</button></div>';
  var bitti = BAG.bitis <= Date.now();
  return h + '<div class="card stack" style="align-items:center;text-align:center">' +
    '<div class="t2" style="margin:0">' + L('Yeni cihazda uygulamayı aç › <b>Hesabım var</b> › bu kodu yaz', 'On the new device open the app › <b>I have an account</b> › enter this code') + '</div>' +
    '<div class="h" style="font-size:44px;letter-spacing:.18em;' + (bitti ? 'color:var(--mut2);text-decoration:line-through' : '') + '">' + esc(BAG.kod.slice(0, 3) + ' ' + BAG.kod.slice(3)) + '</div>' +
    '<div id="bagSayac" class="pill ' + (bitti ? 'off' : '') + '">' + bagKalan() + '</div>' +
    '<div class="t2" style="margin:6px 0 0">' + L('ya da yeni cihazın kamerasıyla QR’ı okut', 'or scan the QR with the new device’s camera') + '</div>' +
    '<div id="bagQr" style="width:220px;height:220px;background:#fff;padding:8px;border-radius:16px;' + (bitti ? 'opacity:.2' : '') + '"></div>' +
    '<div class="note">' + L('Kod tek kullanımlıktır. Hesap başına en fazla 3 cihaz bağlanabilir.', 'The code works once. Up to 3 devices per account.') + '</div></div>' +
    '<div class="foot"><button class="btn ' + (bitti ? 'acc' : 'soft') + ' full" onclick="bagKodAl()">' + L('Yeni kod al', 'Get a new code') + '</button></div>';
}
function bagKalan() {
  var s = Math.max(0, Math.round((BAG.bitis - Date.now()) / 1000));
  return s ? L('Kalan süre ', 'Expires in ') + Math.floor(s / 60) + ':' + pad(s % 60) : L('Süresi doldu', 'Expired');
}
function bagQrCiz() {
  var el = $('bagQr'); if (!el || !BAG || !BAG.kod || !window.qrcode) return;
  var q = qrcode(0, 'M'); q.addData(bagLink()); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  var sv = el.querySelector('svg'); if (sv) { sv.style.width = '100%'; sv.style.height = '100%'; }
  bagSayacDur();
  BAG_T = setInterval(function () {
    var e = $('bagSayac'); if (!e) return bagSayacDur();
    if (BAG.bitis <= Date.now()) { bagSayacDur(); viewCiz(); return; }
    e.textContent = bagKalan();
  }, 1000);
}

/* ---------- cihazlarım ---------- */
var CIHAZ = null;
function cihazYukle(uid) {
  CIHAZ = { yukleniyor: true, uid: uid || '' }; viewCiz();
  (uid ? api('kullaniciCihazlar', { id: uid }) : api('cihazlar')).then(function (r) { CIHAZ = { liste: r.cihazlar, uid: uid || '' }; viewCiz(); if ($('modal') && uid) kulCihazModal(uid); }, function (e) { CIHAZ = { hata: String(e.message || e) }; viewCiz(); });
}
function cihazSatiri(c, uid) {
  return '<div class="list-row" style="' + (uid ? 'box-shadow:none;background:var(--soft)' : '') + '"><span class="ico" style="background:var(--accS);color:var(--acc)">' + I.devices + '</span><div class="grow"><div class="t1">' + esc(c.ad || L('Cihaz', 'Device')) + (c.bu ? ' <span class="tag">' + L('Bu cihaz', 'This device') + '</span>' : '') + '</div>' +
    '<div class="t2">' + L('Bağlandı ', 'Linked ') + esc(String(c.eklenme || '').slice(0, 10)) + (c.son ? ' · ' + L('son ', 'last ') + esc(String(c.son).slice(0, 10)) : '') + '</div></div>' +
    (c.bu ? '' : '<button class="btn sm soft" onclick="cihazKaldir(\'' + c.id + '\',' + jq(c.ad || '') + ',' + jq(uid || '') + ')">' + L('Kaldır', 'Remove') + '</button>') + '</div>';
}
function vCihazlar() {
  if (!CIHAZ || CIHAZ.uid) setTimeout(function () { cihazYukle(''); }, 0);
  var h = geriBas(L('Cihazlarım', 'My devices'));
  if (!CIHAZ || CIHAZ.yukleniyor || CIHAZ.uid) return h + '<div class="card" style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>';
  if (CIHAZ.hata) return h + '<div class="banner bad">' + esc(CIHAZ.hata) + '</div>';
  return h + '<div class="banner info" style="margin-bottom:10px">' + L('Hesabına en fazla 3 cihaz bağlanabilir. Kaybolan ya da artık kullanmadığın cihazı kaldır.', 'Up to 3 devices can be linked. Remove a device that is lost or no longer used.') + '</div>' +
    '<div class="stack">' + CIHAZ.liste.map(function (c) { return cihazSatiri(c, ''); }).join('') + '</div>' +
    '<div class="foot">' + (CIHAZ.liste.length < 3 ? '<button class="btn acc full" onclick="BAG=null;altSayfa(\'bagkod\')">' + I.plus + L('Cihaz ekle', 'Add device') + '</button>' : '') + '</div>';
}
function cihazKaldir(id, ad, uid) {
  soru(L('Cihaz kaldırılsın mı?', 'Remove device?'), '<b>' + esc(ad) + '</b> ' + L('bu hesaptan çıkarılır; o cihazda uygulama yeniden kayıt ekranına döner. Gönderilmemiş girişleri varsa kaybolur.', 'will be signed out of this account; the app on it returns to registration. Unsent entries on it will be lost.'),
    L('Kaldır', 'Remove'), function () {
      api('cihazKaldir', { id: id }).then(function (r) {
        toast(L('Cihaz kaldırıldı', 'Device removed'));
        if (uid) { CIHAZ = { liste: r.cihazlar, uid: uid }; veriAl(true, true).catch(function () {}); kulCihazModal(uid); }
        else { CIHAZ = { liste: r.cihazlar, uid: '' }; viewCiz(); }
      }, hata);
    }, 'bad');
}
/* yönetici: bir kişinin cihazları ve birleştirme */
function kulCihazlar(uid) { CIHAZ = null; soru(L('Cihazlar', 'Devices'), '<div style="display:flex;justify-content:center;padding:20px"><div class="spin"></div></div>', null, null); cihazYukle(uid); }
function kulCihazModal(uid) {
  var u = (D.kullanicilar || []).filter(function (x) { return x.id === uid; })[0] || {};
  var ls_ = CIHAZ && CIHAZ.liste || [];
  soru(esc(u.ad || '') + ' · ' + L('cihazlar', 'devices'), (ls_.length ? '<div class="stack">' + ls_.map(function (c) { return cihazSatiri(c, uid); }).join('') + '</div>' : '<div class="mut">' + L('Bağlı cihaz yok.', 'No linked devices.') + '</div>') +
    (uid === D.kurucu && uid !== ben().id ? '<div class="note" style="margin-top:8px">' + L('Kurucu hesabın cihazlarını yalnızca kurucu kaldırabilir.', 'Only the owner can remove the owner’s devices.') + '</div>' : ''), null, null, null, L('Kapat', 'Close'));
}
function kulBirlestir(kaynak) {
  var k = (D.kullanicilar || []).filter(function (x) { return x.id === kaynak; })[0] || {};
  var adaylar = (D.kullanicilar || []).filter(function (x) { return x.id !== kaynak && x.durum === 'ONAYLI'; })
    .sort(function (a, b) { var ka = a.firma === k.firma ? 0 : 1, kb = b.firma === k.firma ? 0 : 1; return (ka - kb) || String(a.ad).localeCompare(String(b.ad)); });
  soru(L('Başka hesapla birleştir', 'Merge into another account'),
    L('<b>' + esc(k.ad) + '</b> (' + esc(k.firma) + ') kaydının cihazları seçtiğiniz hesaba taşınır, bu kayıt kapanır. Geçmiş girişler olduğu gibi kalır.', 'Devices of <b>' + esc(k.ad) + '</b> (' + esc(k.firma) + ') move to the chosen account and this record is closed. Past entries stay as they are.') +
    '<select class="inp" data-v="hedef" style="margin-top:10px"><option value="">' + L('Hedef hesabı seçin', 'Choose target account') + '</option>' +
    adaylar.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.ad) + ' · ' + esc(x.firma) + ' · ' + esc(x.id) + '</option>'; }).join('') + '</select>',
    L('Birleştir', 'Merge'), function (v) {
      if (!v.hedef) return toast(L('Hedef hesap seçin', 'Choose a target account'));
      api('birlestir', { kaynak: kaynak, hedef: v.hedef }).then(function (r) { D.kullanicilar = r.kullanicilar; ls(K.D, D); toast(L('Hesaplar birleştirildi', 'Accounts merged')); render(); }, hata);
    }, 'bad');
}

/* ---------- GPS kalibrasyonu ---------- */
function vGps() {
  if (!gpsYetki()) return geriBas(L('GPS kalibrasyonu', 'GPS calibration')) + '<div class="card mut">' + L('Bu ekran yalnızca GPS yetkilisine açık.', 'This screen is only for the GPS owner.') + '</div>';
  var pts = D.gps || [], k = kalibre(pts);
  var h = geriBas(L('GPS kalibrasyonu', 'GPS calibration')) +
    '<div class="banner info" style="margin-bottom:10px">' + L('Harita çizimi konum olarak yaklaşıktır. Sahada bir villanın yanında dururken haritada o villayı açıp <b>Bu villadayım</b> (iğne simgesi) düğmesine basın. Birbirinden uzak en az 3 villa (tercihen 4–5) ile harita GPS’e hizalanır ve en yakın villa önerilir.', 'The map drawing is only approximately located. On site, stand next to a villa, open it on the map and tap <b>I am at this villa</b> (pin icon). With at least 3 villas far apart (preferably 4–5), the map is aligned to GPS and the nearest villa is suggested.') + '</div>' +
    '<div class="card" style="margin-bottom:10px"><div class="t1">' + (pts.length >= 3 ? L('Hazır', 'Ready') + ' · ' + L('en büyük sapma ', 'max deviation ') + Math.round(k.err) + ' m' : L('Eksik', 'Incomplete') + ' · ' + pts.length + '/3') + '</div><div class="t2">' + (pts.length >= 3 && k.hat ? L('Noktalar neredeyse aynı hat üzerinde; adanın farklı uçlarından ve diğer adadan nokta ekleyin.', 'Points are almost on one line; add points from different ends and the other island.') : pts.length >= 3 && k.err > 15 ? L('Sapma yüksek: hatalı noktayı silip yeniden ölçün.', 'Deviation is high: delete the wrong point and measure again.') : L('Noktalar e-tablodaki Ayarlar sayfasında saklanır; tüm cihazlarda geçerlidir.', 'Points are stored in the Ayarlar sheet and apply to all devices.')) + '</div></div><div class="stack">';
  pts.forEach(function (p, i) {
    h += '<div class="list-row"><span class="ico" style="background:var(--accS);color:var(--acc)">' + esc(p.no) + '</span><div class="grow"><div class="t1">' + L('Villa ', 'Villa ') + esc(p.no) + '</div><div class="t2">±' + Math.round(p.acc || 0) + ' m GPS' + (k.res[i] != null && pts.length >= 3 ? ' · ' + L('sapma ', 'residual ') + num(k.res[i], 1) + ' m' : '') + ' · ' + esc(p.t || '') + ' · ' + esc(p.u || '') + '</div></div><button class="btn sm soft" onclick="gpsSil(' + i + ')">' + L('Sil', 'Delete') + '</button></div>';
  });
  if (!pts.length) h += '<div class="card mut">' + L('Henüz nokta yok.', 'No points yet.') + '</div>';
  h += '</div><div class="foot"><button class="btn soft" style="flex:1" onclick="gpsVillaSor()">' + I.pin + L('Villa no ile ekle', 'Add by villa no') + '</button>' + (pts.length ? '<button class="btn bad" onclick="gpsSil(-1)">' + L('Sıfırla', 'Reset') + '</button>' : '') + '</div>';
  return h;
}
function gpsVillaSor() {
  soru(L('Hangi villadasınız?', 'Which villa are you at?'), '<input class="inp" data-v="no" inputmode="numeric" placeholder="' + L('Villa no (ör. 445)', 'Villa no (e.g. 445)') + '" value="' + esc(S.villa || '') + '">', L('Ölç', 'Measure'), function (v) {
    var no = String(v.no || '').trim().toUpperCase(); if (!bina(no)) return toast(L('Villa bulunamadı', 'Villa not found')); buradayim(no);
  });
}
function gpsSil(i) {
  var f = function () {
    var pts = (D.gps || []).slice(); if (i < 0) pts = []; else pts.splice(i, 1);
    api('gps', { noktalar: pts.map(function (x) { return { no: x.no, haritaLon: x.hx, haritaLat: x.hy, lat: x.lat, lon: x.lon, dogruluk: x.acc }; }) }).then(function (r) { D.gps = r.gps; ls(K.D, D); render(); }, hata);
  };
  soru(i < 0 ? L('Tüm noktalar silinsin mi?', 'Delete all points?') : L('Nokta silinsin mi?', 'Delete point?'), '', L('Sil', 'Delete'), f, 'bad');
}

/* ---------- hakkında ---------- */
function vHakkinda() {
  var q = kuyruk();
  return geriBas(L('Hakkında', 'About')) + '<div class="card stack">' +
    '<div><div class="t1">MXM SiteTrack</div><div class="t2">' + L('Uygulama', 'App') + ' v' + APP_SURUM + ' · ' + L('sunucu', 'server') + ' v' + esc(D.surum || '?') + (DEMO ? ' · DEMO' : '') + '</div></div>' +
    '<div><div class="t1">' + L('Son senkron', 'Last sync') + '</div><div class="t2">' + esc(S.sonSenk || '—') + ' · ' + (S.online ? L('çevrimiçi', 'online') : L('çevrimdışı', 'offline')) + '</div></div>' +
    '<div><div class="t1">' + L('Gönderilmeyi bekleyen', 'Waiting to send') + '</div><div class="t2">' + q.length + ' ' + L('paket', 'batches') + ' · ' + q.reduce(function (a, p) { return a + p.changes.length; }, 0) + ' ' + L('giriş', 'entries') + '</div></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="veriAl(false,true).then(function(){toast(L(\'Veriler yenilendi\',\'Data refreshed\'))})">' + I.sync + L('Verileri yenile', 'Refresh data') + '</button>' +
    (q.length ? '<button class="btn sm acc" onclick="gonder()">' + L('Şimdi gönder', 'Send now') + '</button>' : '') +
    '<button class="btn sm soft" onclick="guncelle()">' + L('Uygulamayı güncelle', 'Update app') + '</button></div></div>' +
    '<div class="card" style="margin-top:10px"><div class="t2" style="margin:0;line-height:1.5">' + L('Veriler Google E-Tablolar’da (MXM SiteTrack Veri) saklanır ve her gün yedeklenir. Uygulama güncellemesi verilere dokunmaz.', 'Data is stored in Google Sheets (MXM SiteTrack Veri) and backed up daily. App updates never touch the data.') + '</div></div>' +
    '<button class="btn bad full" style="margin-top:14px" onclick="cihazCik(true)">' + L('Bu cihazdan çık', 'Sign out of this device') + '</button>';
}
function guncelle() {
  if (kuyruk().length) return toast(L('Önce bekleyen girişleri gönderin', 'Send pending entries first'), 3500);
  var f = function () { location.reload(); };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update().then(f, f); else f(); }, f); else f();
}

/* ================= başlatma ================= */
window.addEventListener('online', function () { S.online = true; gonder(); if (S.scr === 'ana') hdrCiz(); });
window.addEventListener('offline', function () { S.online = false; if (S.scr === 'ana') hdrCiz(); });
window.addEventListener('beforeunload', function (e) { if (kuyruk().length && !navigator.onLine) { e.preventDefault(); e.returnValue = ''; } });
setInterval(gonder, 30000);
setInterval(function () { if (S.scr === 'ana' && document.visibilityState === 'visible' && !S.villa && !kuyruk().length) veriAl(true).catch(function () {}); }, 120000);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.scr === 'ana') { gonder(); if (!S.villa) veriAl(true).catch(function () {}); } });
var _mq = window.innerWidth;
window.addEventListener('resize', function () { var w = window.innerWidth; if ((w >= 1000) !== (_mq >= 1000) && S.scr === 'ana') render(); _mq = w; });
if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    reg.addEventListener('updatefound', function () {
      var w = reg.installing; if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast(L('Yeni sürüm indirildi. Menü › Hakkında › Uygulamayı güncelle', 'New version downloaded. Menu › About › Update app'), 6000);
      });
    });
  }).catch(function () {});
}
setInterval(function () { if (S.scr === 'bekle' && document.visibilityState === 'visible') api('ben').then(function (r) { ls(K.ben, r.kullanici); if (r.kullanici.durum === 'ONAYLI') { toast(L('Kaydınız onaylandı', 'Your registration was approved')); veriAl(); } }, function (e) { if (e.kod) hata(e); }); }, 30000);
document.documentElement.lang = S.dil === 'EN' ? 'en' : 'tr';
baslat();
