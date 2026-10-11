/* BTS Stegen – hjälpbot. Flytande knapp + chattpanel.
   Hämtar spelarens id/PIN ur samma localStorage som inloggningen använder,
   så boten kan svara på "när spelar jag?" utan att fråga om något. */
(function () {
  if (window.__btsHelp) return; window.__btsHelp = true;

  var URL_ASSIST = 'https://fueggdqtgmvldjbhcdfn.supabase.co/functions/v1/assist';
  var HIST = [];
  var BUSY = false;

  function me() {
    try {
      var v = JSON.parse(localStorage.getItem('bts_host_me') || 'null');
      if (v && v.id && v.pin) return { id: v.id, pin: v.pin };
    } catch (e) {}
    return null;
  }

  var css = ''
    + '.bh-fab{position:fixed;right:16px;bottom:16px;z-index:9998;width:54px;height:54px;border:none;border-radius:50%;'
    + 'background:#FF8C42;color:#3a1400;font-size:23px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.45);'
    + 'display:flex;align-items:center;justify-content:center;transition:transform .15s}'
    + '.bh-fab:hover{transform:scale(1.06)}'
    + '.bh-fab.open{background:#133124;color:#F5EDE3}'
    + '.bh-panel{position:fixed;right:16px;bottom:80px;z-index:9999;width:min(340px,calc(100vw - 62px));'
    + 'max-height:min(560px,calc(100vh - 120px));display:none;flex-direction:column;overflow:hidden;'
    + 'background:#0D2A1D;border:1px solid #2A5A42;border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.55);'
    + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#F5EDE3}'
    + '.bh-panel.on{display:flex}'
    + '.bh-head{padding:11px 15px;border-bottom:1px solid #1C3A2B;background:#133124;'
    + 'display:flex;align-items:center;gap:11px}'
    + '.bh-ava{flex:0 0 auto;width:42px;height:42px;border-radius:50%;object-fit:cover;object-position:50% 18%;'
    + 'background:#0D2A1D;border:1.5px solid #2A5A42}'
    + '.bh-htxt{min-width:0}'
    + '.bh-head b{display:block;font-size:14px;letter-spacing:.3px}'
    + '.bh-head span{display:block;font-size:11px;color:rgba(255,255,255,.5);margin-top:2px}'
    + '.bh-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}'
    + '.bh-m{max-width:88%;padding:9px 13px;border-radius:13px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}'
    + '.bh-m.bot{align-self:flex-start;background:#133124;border:1px solid #1C3A2B;border-bottom-left-radius:4px}'
    + '.bh-m.usr{align-self:flex-end;background:#FF8C42;color:#3a1400;border-bottom-right-radius:4px}'
    + '.bh-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}'
    + '.bh-chip{font-size:11.5px;padding:6px 11px;border-radius:100px;border:1px solid #2A5A42;'
    + 'background:transparent;color:rgba(255,255,255,.75);cursor:pointer}'
    + '.bh-chip:hover{border-color:#FF8C42;color:#FF8C42}'
    + '.bh-foot{display:flex;gap:7px;padding:11px;border-top:1px solid #1C3A2B;background:#0D2E20}'
    + '.bh-in{flex:1;background:#0D2A1D;border:1px solid #2A5A42;border-radius:10px;padding:9px 12px;'
    + 'color:#F5EDE3;font-size:13.5px;font-family:inherit}'
    + '.bh-in:focus{outline:none;border-color:#FF8C42}'
    + '.bh-send{border:none;border-radius:10px;background:#FF8C42;color:#3a1400;width:40px;font-size:16px;cursor:pointer}'
    + '.bh-send:disabled{opacity:.45;cursor:default}'
    + '.bh-note{font-size:10.5px;color:rgba(255,255,255,.38);text-align:center;padding:0 14px 9px}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var fab = document.createElement('button');
  fab.className = 'bh-fab'; fab.type = 'button';
  fab.setAttribute('aria-label', 'Fråga Jörn Hälberg');
  fab.textContent = '💬';

  var panel = document.createElement('div');
  panel.className = 'bh-panel';
  panel.innerHTML =
      '<div class="bh-head"><img class="bh-ava" src="jorn.png" alt="" width="42" height="42">'
    + '<div class="bh-htxt"><b>Jörn Hälberg</b><span>Stegens orakel · frågor om stegen</span></div></div>'
    + '<div class="bh-body" id="bhBody"></div>'
    + '<div class="bh-chips" id="bhChips"></div>'
    + '<div class="bh-foot"><input class="bh-in" id="bhIn" maxlength="600" placeholder="Skriv din fråga…" autocomplete="off">'
    + '<button class="bh-send" id="bhSend" type="button">→</button></div>'
    + '<div class="bh-note">Jörn är en AI och kan ha fel. Vid tveksamhet – hör av dig till Joaquim.</div>';

  document.body.appendChild(fab); document.body.appendChild(panel);

  var body = panel.querySelector('#bhBody');
  var chips = panel.querySelector('#bhChips');
  var input = panel.querySelector('#bhIn');
  var send = panel.querySelector('#bhSend');

  function add(text, who) {
    var d = document.createElement('div');
    d.className = 'bh-m ' + (who || 'bot'); d.textContent = text;
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    return d;
  }
  function setChips(list) {
    chips.innerHTML = '';
    list.forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'bh-chip'; b.type = 'button'; b.textContent = q;
      b.onclick = function () { input.value = q; ask(); };
      chips.appendChild(b);
    });
  }

  var greeted = false;
  function greet() {
    if (greeted) return; greeted = true;
    var u = me();
    add(u ? 'Jörn Hälberg här. Jag ser din grupp, dina matcher och var du ligger i tabellen. Fråga på.'
          : 'Jörn Hälberg här, stegens orakel. Fråga mig om reglerna – logga in på sidan så kan jag även svara på dina egna matcher.');
    setChips(u ? ['När spelar jag?', 'Hur ligger jag till?', 'Vad händer om jag förlorar?', 'Hur funkar VO?']
               : ['Hur räknas poängen?', 'Hur funkar VO?', 'Vad är spelpoolen?', 'Vad kostar det?']);
  }

  function ask() {
    if (BUSY) return;
    var q = (input.value || '').trim(); if (!q) return;
    input.value = ''; chips.innerHTML = '';
    add(q, 'usr');
    HIST.push({ role: 'user', content: q });
    BUSY = true; send.disabled = true;
    var thinking = add('skriver…');

    var u = me();
    var payload = { question: q, history: HIST.slice(-6) };
    if (u) { payload.playerId = u.id; payload.pin = u.pin; }

    fetch(URL_ASSIST, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        thinking.textContent = d && d.answer ? d.answer : 'Kunde inte nå hjälpen just nu. Försök igen om en stund.';
        if (d && d.answer) HIST.push({ role: 'assistant', content: d.answer });
      })
      .catch(function () { thinking.textContent = 'Kunde inte nå hjälpen just nu. Försök igen om en stund.'; })
      .then(function () { BUSY = false; send.disabled = false; body.scrollTop = body.scrollHeight; input.focus(); });
  }

  fab.onclick = function () {
    var on = panel.classList.toggle('on');
    fab.classList.toggle('open', on);
    fab.textContent = on ? '✕' : '💬';
    if (on) { greet(); setTimeout(function () { input.focus(); }, 60); }
  };
  send.onclick = ask;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
})();
