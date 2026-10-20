/**
 * BrowserOS 3 — Native Calendar and Clock apps.
 */

function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function makeButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'border:1px solid var(--wm-control-border);border-radius:7px;padding:7px 10px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit';
  return button;
}

function sectionTitle(text) {
  const el = document.createElement('h2');
  el.textContent = text;
  el.style.cssText = 'font-size:17px;margin:18px 0 10px;color:var(--wm-text)';
  return el;
}

export function registerCalendarApp({ wm, db }) {
  wm.registerSystemApp('calendar', {
    title: 'Calendar',
    icon: '📅',
    width: 620,
    height: 560,
    mount(container, instanceId, args = {}) {
      container.style.cssText = 'height:100%;overflow:auto;padding:20px;background:var(--wm-bg);color:var(--wm-text);font-family:var(--wm-font)';
      let selected = args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? new Date(args.date + 'T12:00:00') : new Date();
      let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
      let events = {};
      let closed = false;

      const toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px';
      const previous = makeButton('‹');
      previous.title = 'Previous month';
      const next = makeButton('›');
      next.title = 'Next month';
      const today = makeButton('Today');
      const heading = document.createElement('h1');
      heading.style.cssText = 'font-size:22px;margin:0;text-align:center;flex:1';
      toolbar.append(previous, heading, today, next);
      container.appendChild(toolbar);

      const weekdayRow = document.createElement('div');
      weekdayRow.style.cssText = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center;color:var(--wm-text-dim);font-size:12px;padding:4px 0';
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(day => {
        const el = document.createElement('div');
        el.textContent = day;
        weekdayRow.appendChild(el);
      });
      container.appendChild(weekdayRow);

      const days = document.createElement('div');
      days.style.cssText = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px';
      container.appendChild(days);

      const selectedLabel = document.createElement('div');
      selectedLabel.style.cssText = 'font-size:15px;font-weight:600;margin:16px 0 8px';
      container.appendChild(selectedLabel);
      const eventList = document.createElement('div');
      eventList.style.cssText = 'display:flex;flex-direction:column;gap:6px';
      container.appendChild(eventList);

      const addTitle = document.createElement('h2');
      addTitle.textContent = 'Add an event';
      addTitle.style.cssText = 'font-size:14px;margin:16px 0 7px';
      container.appendChild(addTitle);
      const form = document.createElement('form');
      form.style.cssText = 'display:flex;gap:8px';
      const eventInput = document.createElement('input');
      eventInput.type = 'text';
      eventInput.maxLength = 120;
      eventInput.placeholder = 'Event title';
      eventInput.setAttribute('aria-label', 'Event title');
      eventInput.style.cssText = 'flex:1;min-width:0;border:1px solid var(--wm-control-border);border-radius:7px;padding:8px;background:var(--wm-control-bg);color:var(--wm-text);font:inherit';
      const add = makeButton('Add');
      form.append(eventInput, add);
      container.appendChild(form);

      async function saveEvents() {
        await db.settings.set('calendarEvents', events);
      }

      function render() {
        if (closed) return;
        heading.textContent = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
        days.innerHTML = '';
        const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
        const leading = (firstDay.getDay() + 6) % 7;
        const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        for (let i = 0; i < leading; i++) days.appendChild(document.createElement('div'));
        const todayKey = dateKey(new Date());
        for (let day = 1; day <= count; day++) {
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const key = dateKey(date);
          const button = makeButton(String(day));
          button.style.cssText += ';height:42px;padding:4px;position:relative;border-color:' +
            (key === dateKey(selected) ? 'var(--wm-accent)' : 'transparent') + ';background:' +
            (key === dateKey(selected) ? 'var(--wm-accent)' : key === todayKey ? 'var(--wm-control-hover)' : 'transparent') +
            ';color:' + (key === dateKey(selected) ? '#fff' : 'var(--wm-text)');
          if ((events[key] || []).length) button.title = (events[key] || []).length + ' event(s)';
          button.onclick = () => { selected = date; render(); };
          days.appendChild(button);
        }

        selectedLabel.textContent = selected.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        eventList.innerHTML = '';
        const list = events[dateKey(selected)] || [];
        if (!list.length) {
          const empty = document.createElement('div');
          empty.textContent = 'No events for this day.';
          empty.style.cssText = 'font-size:13px;color:var(--wm-text-dim);padding:8px 0';
          eventList.appendChild(empty);
        } else {
          list.forEach(event => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--wm-border);border-radius:7px;background:var(--wm-control-bg)';
            const title = document.createElement('span');
            title.textContent = event.title;
            title.style.cssText = 'flex:1;overflow-wrap:anywhere';
            const remove = makeButton('Remove');
            remove.title = 'Remove event';
            remove.onclick = async () => {
              events[dateKey(selected)] = list.filter(item => item.id !== event.id);
              if (!events[dateKey(selected)].length) delete events[dateKey(selected)];
              await saveEvents();
              render();
            };
            row.append(title, remove);
            eventList.appendChild(row);
          });
        }
      }

      previous.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); };
      next.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); };
      today.onclick = () => { selected = new Date(); month = new Date(selected.getFullYear(), selected.getMonth(), 1); render(); };
      form.onsubmit = async event => {
        event.preventDefault();
        const title = eventInput.value.trim();
        if (!title) return;
        const key = dateKey(selected);
        events[key] ||= [];
        events[key].push({ id: (crypto.randomUUID?.() || Date.now() + '-' + Math.random()), title });
        await saveEvents();
        eventInput.value = '';
        render();
      };

      (async () => {
        events = await db.settings.get('calendarEvents') || {};
        if (!closed) render();
      })();
      return () => { closed = true; };
    }
  });
}

export function registerClockApp({ wm }) {
  wm.registerSystemApp('clock', {
    title: 'Clock',
    icon: '🕒',
    width: 430,
    height: 440,
    mount(container) {
      container.style.cssText = 'height:100%;overflow:auto;padding:20px;background:var(--wm-bg);color:var(--wm-text);font-family:var(--wm-font)';
      const tabs = document.createElement('div');
      tabs.style.cssText = 'display:flex;gap:8px;margin-bottom:18px';
      const content = document.createElement('div');
      container.append(tabs, content);
      let active = 'clock';
      let stopwatchElapsed = 0;
      let stopwatchStarted = 0;
      let stopwatchRunning = false;
      let timerEndsAt = 0;
      let timerRemaining = 0;
      let timerRunning = false;
      let tick = null;
      let destroyed = false;
      let laps = [];

      function setTab(tab) {
        active = tab;
        tabs.innerHTML = '';
        [['clock','Clock'],['stopwatch','Stopwatch'],['timer','Timer']].forEach(([id,label]) => {
          const button = makeButton(label);
          if (id === active) button.style.borderColor = 'var(--wm-accent)';
          button.onclick = () => setTab(id);
          tabs.appendChild(button);
        });
        render();
      }

      function formatDuration(ms, tenths = false) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return (hours ? String(hours).padStart(2,'0') + ':' : '') +
          String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0') +
          (tenths ? '.' + Math.floor((ms % 1000) / 100) : '');
      }

      function bigText(text) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = 'font-size:42px;font-weight:300;text-align:center;font-variant-numeric:tabular-nums;margin:28px 0 12px';
        return el;
      }

      function render() {
        if (destroyed) return;
        content.innerHTML = '';
        if (active === 'clock') {
          content.appendChild(sectionTitle('Local time'));
          const now = new Date();
          content.appendChild(bigText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })));
          const date = document.createElement('div');
          date.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          date.style.cssText = 'text-align:center;color:var(--wm-text-dim);margin-bottom:22px';
          content.appendChild(date);
          const timezone = document.createElement('div');
          timezone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
          timezone.style.cssText = 'text-align:center;font-size:12px;color:var(--wm-text-dim)';
          content.appendChild(timezone);
        } else if (active === 'stopwatch') {
          content.appendChild(sectionTitle('Stopwatch'));
          const elapsed = stopwatchElapsed + (stopwatchRunning ? performance.now() - stopwatchStarted : 0);
          content.appendChild(bigText(formatDuration(elapsed, true)));
          const controls = document.createElement('div');
          controls.style.cssText = 'display:flex;justify-content:center;gap:8px';
          const toggle = makeButton(stopwatchRunning ? 'Pause' : 'Start');
          toggle.onclick = () => {
            if (stopwatchRunning) {
              stopwatchElapsed += performance.now() - stopwatchStarted;
              stopwatchRunning = false;
            } else {
              stopwatchStarted = performance.now();
              stopwatchRunning = true;
            }
            render();
          };
          const reset = makeButton('Reset');
          reset.onclick = () => { stopwatchRunning = false; stopwatchElapsed = 0; laps = []; render(); };
          controls.append(toggle, reset);
          content.appendChild(controls);
          if (stopwatchRunning) {
            const lap = makeButton('Lap');
            lap.style.margin = '10px auto';
            lap.onclick = () => { laps.unshift(formatDuration(elapsed, true)); render(); };
            content.appendChild(lap);
          }
          laps.forEach((value, index) => {
            const line = document.createElement('div');
            line.textContent = 'Lap ' + (laps.length - index) + ' · ' + value;
            line.style.cssText = 'padding:6px 4px;border-bottom:1px solid var(--wm-separator);font-variant-numeric:tabular-nums';
            content.appendChild(line);
          });
        } else {
          content.appendChild(sectionTitle('Timer'));
          const display = bigText(formatDuration(timerRemaining));
          content.appendChild(display);
          const inputRow = document.createElement('div');
          inputRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin:12px 0';
          const minutes = document.createElement('input');
          minutes.type = 'number'; minutes.min = '0'; minutes.max = '999'; minutes.value = '5';
          minutes.setAttribute('aria-label','Timer minutes');
          minutes.style.cssText = 'width:80px;padding:8px;border:1px solid var(--wm-control-border);border-radius:7px;background:var(--wm-control-bg);color:var(--wm-text);font:inherit';
          const seconds = document.createElement('input');
          seconds.type = 'number'; seconds.min = '0'; seconds.max = '59'; seconds.value = '0';
          seconds.setAttribute('aria-label','Timer seconds');
          seconds.style.cssText = minutes.style.cssText;
          const sep = document.createElement('span'); sep.textContent = ':';
          inputRow.append(minutes, sep, seconds);
          content.appendChild(inputRow);
          const controls = document.createElement('div');
          controls.style.cssText = 'display:flex;justify-content:center;gap:8px';
          const start = makeButton(timerRunning ? 'Running…' : 'Start timer');
          start.disabled = timerRunning;
          start.onclick = () => {
            const total = Math.max(0, Number(minutes.value) * 60 + Number(seconds.value));
            if (!total) { wm.notify('Set a timer longer than zero seconds'); return; }
            timerRemaining = total * 1000;
            timerEndsAt = Date.now() + timerRemaining;
            timerRunning = true;
            render();
          };
          const cancel = makeButton('Cancel');
          cancel.disabled = !timerRunning && !timerRemaining;
          cancel.onclick = () => { timerRunning = false; timerRemaining = 0; render(); };
          controls.append(start, cancel);
          content.appendChild(controls);
        }
      }

      tick = setInterval(() => {
        if (destroyed) return;
        if (active === 'clock') render();
        if (active === 'stopwatch' && stopwatchRunning) render();
        if (active === 'timer' && timerRunning) {
          timerRemaining = Math.max(0, timerEndsAt - Date.now());
          if (timerRemaining === 0) {
            timerRunning = false;
            wm.notify('Timer finished');
          }
          render();
        }
      }, 100);
      setTab('clock');
      return () => { destroyed = true; clearInterval(tick); };
    }
  });
}
