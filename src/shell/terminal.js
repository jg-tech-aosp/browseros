/**
 * BrowserOS v2 — Terminal (Native System Component)
 * src/shell/terminal.js
 */

export function registerTerminal({ wm, fs, launcher, kernel, settings, db }) {

  wm.registerSystemApp('terminal', {
    title:  'Terminal',
    icon:   '⌨️',
    width:  640,
    height: 420,
    mount(container, instanceId, args) {
      let cwd = args?.path || '/';
      const history = [];
      let histPos = -1;
      const startedAt = Date.now();

      container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0a0a14';

      // Output
      const out = document.createElement('div');
      out.style.cssText = 'flex:1;overflow-y:auto;padding:10px;font-family:monospace;font-size:13px;line-height:1.6;min-height:0';
      container.appendChild(out);

      // Input row
      const inputRow = document.createElement('div');
      inputRow.style.cssText = 'display:flex;align-items:center;padding:6px 10px;border-top:1px solid rgba(255,255,255,0.05);background:#0a0a14;flex-shrink:0;gap:6px';

      const promptEl = document.createElement('span');
      promptEl.style.cssText = 'color:#44ff88;font-family:monospace;font-size:13px;white-space:nowrap';

      const inp = document.createElement('input');
      inp.style.cssText = 'flex:1;background:transparent;border:none;color:#aaffaa;font-family:monospace;font-size:13px;outline:none';
      inp.autocomplete = 'off';
      inp.spellcheck   = false;

      inputRow.appendChild(promptEl);
      inputRow.appendChild(inp);
      container.appendChild(inputRow);

      // ── Helpers ───────────────────────────────────────────────────────────────

      function updatePrompt() {
        const profile = settings?.get('userProfile');
        const username = String(profile?.name || 'user').replace(/[^a-z0-9_-]/gi, '_');
        promptEl.textContent = username + '@browseros:' + (cwd || '/') + ' $ ';
      }

      function print(text, color) {
        const line = document.createElement('div');
        line.style.color = color || '#aaffaa';
        line.style.fontFamily = 'monospace';
        line.style.fontSize = '13px';
        line.style.whiteSpace = 'pre-wrap';
        line.style.wordBreak = 'break-all';
        line.textContent = text;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
      }

      function printHTML(html) {
        const line = document.createElement('div');
        line.style.fontFamily = 'monospace';
        line.style.fontSize = '13px';
        line.innerHTML = html;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
      }

      function resolvePath(p) {
        p = String(p || '/').trim();
        if (p === '~') p = '/';
        else if (p.startsWith('~/')) p = '/' + p.slice(2);
        const absolute = p.startsWith('/') ? p : (cwd.replace(/\/$/, '') + '/' + p);
        const parts = [];
        for (const part of absolute.split('/')) {
          if (!part || part === '.') continue;
          if (part === '..') parts.pop();
          else parts.push(part);
        }
        return '/' + parts.join('/');
      }

      function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, ch => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[ch]);
      }

      // ── Commands ──────────────────────────────────────────────────────────────

      const CMDS = {
        help(args) {
          print('BrowserOS Terminal — Available commands:');
          print('');
          print('File system:');
          print('  ls [path]          List directory contents');
          print('  cd [path]          Change directory');
          print('  pwd                Print working directory');
          print('  mkdir [-p] <path>  Create a directory and optional parents');
          print('  touch <path>       Create an empty file');
          print('  write <path> <text> Create or replace a text file');
          print('  append <path> <text> Append text to a file');
          print('  rm <path>          Remove a file or empty directory');
          print('  rmdir <path>       Remove an empty directory');
          print('  cat <path>         Print a text file');
          print('  head/tail [n] <path> Show the first or last lines');
          print('  grep <text> <path> Search lines for literal text');
          print('  cp <src> <dst>     Copy a file');
          print('  mv <src> <dst>     Move or rename a file or directory');
          print('  find [path]        List paths recursively');
          print('  wc <path>          Word/line/character count');
          print('  stat <path>        File information');
          print('  tree [path]        Directory tree');
          print('');
          print('Apps:');
          print('  open <appId> [file] Open a native or installed app');
          print('  launch <path> [file] Launch a .beep app');
          print('  apps               List native and installed apps');
          print('');
          print('System:');
          print('  echo <text>        Print text');
          print('  date               Print current date/time');
          print('  whoami             Print current user');
          print('  uname [-a]         System information');
          print('  sysinfo            Browser and session details');
          print('  storage            Browser storage usage estimate');
          print('  uptime             Time since this Terminal opened');
          print('  version            BrowserOS version');
          print('  history [-c]       Show or clear session history');
          print('  clear              Clear output (Ctrl+L)');
          print('  exit               Close terminal');
        },

        async ls(args) {
          const pathArg = args.find(a => !a.startsWith('-'));
          const path = pathArg ? resolvePath(pathArg) : cwd;
          const items = await fs.ls(path);
          if (!items) { print('ls: cannot access "' + path + '": No such directory', '#ff8888'); return; }
          if (items.length === 0) { print('(empty)', '#8888aa'); return; }
          const long = args.includes('-l') || args.includes('--long');
          const unknownFlag = args.find(a => a.startsWith('-') && a !== '-l' && a !== '--long');
          if (unknownFlag) { print('ls: unsupported option: ' + unknownFlag, '#ff8888'); return; }
          if (long) {
            items.forEach(item => print(
              (item.type === 'dir' ? 'DIR ' : 'FILE') + '\t' +
              String(item.size || 0).padStart(8) + ' bytes\t' +
              new Date(item.modified || 0).toLocaleString() + '\t' + item.name,
              item.type === 'dir' ? '#66aaff' : '#aaffaa'
            ));
            return;
          }
          const dirs  = items.filter(i => i.type === 'dir').map(i => i.name + '/');
          const files = items.filter(i => i.type !== 'dir').map(i => i.name);
          const parts = [
            ...dirs.map(d => `<span style="color:#66aaff">${escapeHTML(d)}</span>`),
            ...files.map(f => `<span style="color:#aaffaa">${escapeHTML(f)}</span>`),
          ];
          printHTML(parts.join('  '));
        },

        async cd(args) {
          const p = resolvePath(args[0] || '~');
          const stat = await fs.stat(p);
          if (!stat || stat.type !== 'dir') { print('cd: not a directory: ' + (args[0] || '~'), '#ff8888'); return; }
          cwd = p;
          updatePrompt();
        },

        pwd() { print(cwd); },

        async mkdir(args) {
          const recursive = args[0] === '-p';
          const rawPath = args[recursive ? 1 : 0];
          if (!rawPath) { print('mkdir: missing operand', '#ff8888'); return; }
          const path = resolvePath(rawPath);
          if (!recursive) {
            const result = await fs.mkdir(path);
            if (!result.ok) print('mkdir: ' + result.error, '#ff8888');
            else print('Created directory ' + path);
            return;
          }
          let current = '';
          for (const part of path.split('/').filter(Boolean)) {
            current += '/' + part;
            const existing = await fs.stat(current);
            if (existing) {
              if (existing.type !== 'dir') { print('mkdir: not a directory: ' + current, '#ff8888'); return; }
              continue;
            }
            const result = await fs.mkdir(current);
            if (!result.ok) { print('mkdir: ' + result.error, '#ff8888'); return; }
          }
          print('Created directory path ' + path);
        },

        async touch(args) {
          if (!args[0]) { print('touch: missing operand', '#ff8888'); return; }
          const path = resolvePath(args[0]);
          if (await fs.stat(path)) return;
          const result = await fs.writeUnique(path, '');
          if (!result.ok) print('touch: ' + result.error, '#ff8888');
          else print('Created ' + result.path);
        },

        async write(args) {
          if (args.length < 2) { print('write: usage: write <path> <text>', '#ff8888'); return; }
          const path = resolvePath(args[0]);
          if (await fs.stat(path) && !confirm(path + ' already exists. Replace its contents?')) {
            print('write: cancelled', '#8888aa');
            return;
          }
          const result = await fs.write(path, args.slice(1).join(' '));
          if (!result.ok) print('write: ' + result.error, '#ff8888');
          else print('Wrote ' + path);
        },

        async append(args) {
          if (args.length < 2) { print('append: usage: append <path> <text>', '#ff8888'); return; }
          const path = resolvePath(args[0]);
          const existing = await fs.read(path);
          if (existing === null && await fs.stat(path)) { print('append: cannot append to a directory', '#ff8888'); return; }
          const result = await fs.write(path, (existing || '') + args.slice(1).join(' '));
          if (!result.ok) print('append: ' + result.error, '#ff8888');
          else print('Appended to ' + path);
        },

        async rm(args) {
          if (!args[0]) { print('rm: missing operand', '#ff8888'); return; }
          const path = resolvePath(args[0]);
          const result = await fs.rm(path);
          if (!result.ok) print('rm: ' + result.error, '#ff8888');
          else print('Removed ' + path);
        },

        async rmdir(args) {
          if (!args[0]) { print('rmdir: missing operand', '#ff8888'); return; }
          const path = resolvePath(args[0]);
          const stat = await fs.stat(path);
          if (!stat) { print('rmdir: no such directory: ' + path, '#ff8888'); return; }
          if (stat.type !== 'dir') { print('rmdir: not a directory: ' + path, '#ff8888'); return; }
          const result = await fs.rm(path);
          if (!result.ok) print('rmdir: ' + result.error, '#ff8888');
          else print('Removed directory ' + path);
        },

        async cat(args) {
          if (!args[0]) { print('cat: missing operand', '#ff8888'); return; }
          const content = await fs.read(resolvePath(args[0]));
          if (content === null) { print('cat: ' + args[0] + ': No such file', '#ff8888'); return; }
          if (content.startsWith('data:')) { print('[binary file]', '#8888aa'); return; }
          content.split('\n').forEach(l => print(l));
        },

        async head(args) {
          let count = 10;
          let pathArg = args[0];
          if (/^\d+$/.test(args[0] || '') && args[1]) { count = Math.min(1000, Number(args[0])); pathArg = args[1]; }
          if (!pathArg) { print('head: usage: head [line-count] <path>', '#ff8888'); return; }
          const content = await fs.read(resolvePath(pathArg));
          if (content === null) { print('head: cannot read: ' + pathArg, '#ff8888'); return; }
          if (content.startsWith('data:')) { print('[binary file]', '#8888aa'); return; }
          content.split('\n').slice(0, count).forEach(line => print(line));
        },

        async tail(args) {
          let count = 10;
          let pathArg = args[0];
          if (/^\d+$/.test(args[0] || '') && args[1]) { count = Math.min(1000, Number(args[0])); pathArg = args[1]; }
          if (!pathArg) { print('tail: usage: tail [line-count] <path>', '#ff8888'); return; }
          const content = await fs.read(resolvePath(pathArg));
          if (content === null) { print('tail: cannot read: ' + pathArg, '#ff8888'); return; }
          if (content.startsWith('data:')) { print('[binary file]', '#8888aa'); return; }
          const lines = content.split('\n');
          lines.slice(Math.max(0, lines.length - count)).forEach(line => print(line));
        },

        async grep(args) {
          if (args.length < 2) { print('grep: usage: grep <literal-text> <path>', '#ff8888'); return; }
          const content = await fs.read(resolvePath(args[1]));
          if (content === null) { print('grep: cannot read: ' + args[1], '#ff8888'); return; }
          if (content.startsWith('data:')) { print('[binary file]', '#8888aa'); return; }
          let matches = 0;
          content.split('\n').forEach((line, index) => {
            if (line.includes(args[0])) { print((index + 1) + ':' + line); matches++; }
          });
          if (!matches) print('No matches found.', '#8888aa');
        },

        echo(args) { print(args.join(' ')); },

        clear() { out.replaceChildren(); },

        date() { print(new Date().toString()); },

        whoami() {
          const profile = settings?.get('userProfile');
          print(profile?.name || 'User');
        },

        uname(args) {
          print(args[0] === '-a' ? 'BrowserOS 3 Dev / HTML5 / IndexedDB / ES Modules' : 'BrowserOS 3 Dev');
        },

        version() {
          print('BrowserOS Terminal v3.0');
          print('BOS API: 2.0');
          print('Engine: HTML5 / ES Modules / IndexedDB');
        },

        sysinfo() {
          print('BrowserOS 3 Dev', '#66aaff');
          print('Browser: ' + (navigator.userAgent || 'Unknown'));
          print('Platform: ' + (navigator.userAgentData?.platform || navigator.platform || 'Unknown'));
          print('Language: ' + (navigator.language || 'Unknown'));
          print('Viewport: ' + window.innerWidth + ' × ' + window.innerHeight);
          print('Online: ' + (navigator.onLine ? 'yes' : 'no'));
        },

        async storage() {
          if (!navigator.storage?.estimate) { print('Storage estimates are unavailable.', '#8888aa'); return; }
          const estimate = await navigator.storage.estimate();
          const used = (estimate.usage || 0) / 1024 / 1024;
          const quota = (estimate.quota || 0) / 1024 / 1024;
          print('Browser storage: ' + used.toFixed(1) + ' MB used of ' + quota.toFixed(0) + ' MB');
        },

        uptime() {
          const seconds = Math.floor((Date.now() - startedAt) / 1000);
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          print('Terminal session uptime: ' + (hours ? hours + 'h ' : '') + (minutes ? minutes + 'm ' : '') + (seconds % 60) + 's');
        },

        async cp(args) {
          if (args.length < 2) { print('cp: missing operand', '#ff8888'); return; }
          const content = await fs.read(resolvePath(args[0]));
          if (content === null) { print('cp: source not found', '#ff8888'); return; }
          const result = await fs.writeUnique(resolvePath(args[1]), content);
          if (!result.ok) { print('cp: ' + result.error, '#ff8888'); return; }
          print('Copied ' + args[0] + ' → ' + result.path);
        },

        async mv(args) {
          if (args.length < 2) { print('mv: missing operand', '#ff8888'); return; }
          const res = await fs.move(resolvePath(args[0]), resolvePath(args[1]));
          if (res?.error) print('mv: ' + res.error, '#ff8888');
          else print('Moved ' + args[0] + ' → ' + args[1]);
        },

        async wc(args) {
          if (!args[0]) { print('wc: missing operand', '#ff8888'); return; }
          const content = await fs.read(resolvePath(args[0]));
          if (content === null) { print('wc: cannot read: ' + args[0], '#ff8888'); return; }
          const lines = content.split('\n').length;
          const words = content.trim().split(/\s+/).filter(Boolean).length;
          print(lines + '\t' + words + '\t' + content.length + '\t' + args[0]);
        },

        async stat(args) {
          if (!args[0]) { print('stat: missing operand', '#ff8888'); return; }
          const s = await fs.stat(resolvePath(args[0]));
          if (!s) { print('stat: no such file: ' + args[0], '#ff8888'); return; }
          print('  File: ' + resolvePath(args[0]));
          print('  Type: ' + s.type);
          print('  Size: ' + (s.size || 0) + ' bytes');
          if (s.modified) print('  Modified: ' + new Date(s.modified).toLocaleString());
          if (s.mime) print('  MIME: ' + s.mime);
        },

        async find(args) {
          const base = resolvePath(args[0] || '/');
          async function walk(path) {
            print(path);
            const items = await fs.ls(path);
            if (!items) return;
            for (const item of items) {
              await walk((path === '/' ? '' : path) + '/' + item.name);
            }
          }
          await walk(base);
        },

        async tree(args) {
          const base = resolvePath(args[0] || cwd);
          async function walk(path, prefix) {
            const items = await fs.ls(path);
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              const last = i === items.length - 1;
              const item = items[i];
              const connector = last ? '└── ' : '├── ';
              const color = item.type === 'dir' ? '#66aaff' : '#aaffaa';
              printHTML(prefix + connector + `<span style="color:${color}">${escapeHTML(item.name)}${item.type === 'dir' ? '/' : ''}</span>`);
              if (item.type === 'dir') {
                await walk((path === '/' ? '' : path) + '/' + item.name, prefix + (last ? '    ' : '│   '));
              }
            }
          }
          print(base, '#66aaff');
          await walk(base, '');
        },

        async open(args) {
          if (!args[0]) { print('open: usage: open <appId> [file-path]', '#ff8888'); return; }
          const appId = args[0];
          const fileArgs = args[1] ? { path: resolvePath(args[1]) } : {};
          if (wm._systemApps?.has(appId)) {
            wm.openSystemApp(appId, fileArgs);
            return;
          }
          try {
            if (!db || !await db.apps.get(appId)) { print('open: app not found: ' + appId, '#ff8888'); return; }
            await launcher.launchById(appId, fileArgs);
          } catch (error) { print('open: ' + error.message, '#ff8888'); }
        },

        async launch(args) {
          if (!args[0]) { print('launch: usage: launch <package-path> [file-path]', '#ff8888'); return; }
          try {
            const fileArgs = args[1] ? { path: resolvePath(args[1]) } : {};
            await launcher.launch(resolvePath(args[0]), fileArgs);
          } catch (error) { print('launch: ' + error.message, '#ff8888'); }
        },

        async apps() {
          print('Native system apps:', '#8888aa');
          for (const [id, app] of wm._systemApps) {
            print('  ' + app.icon + ' ' + id + ' — ' + app.title);
          }
          const installed = db ? await db.apps.all() : [];
          print('');
          print('Installed .beep apps:', '#8888aa');
          if (!installed.length) print('  (none)', '#8888aa');
          installed.forEach(app => print('  ' + (app.emoji || app.icon || '⚡') + ' ' + app.id + ' — ' + app.name + ' v' + app.version));
        },

        history(args) {
          if (args[0] === '-c') { history.length = 0; histPos = -1; print('Session history cleared.'); return; }
          if (!history.length) { print('(no history)', '#8888aa'); return; }
          history.forEach((cmd, i) => print('  ' + (i + 1) + '  ' + cmd));
        },

        exit() { wm.close(instanceId); },
        quit() { wm.close(instanceId); },
      };

      // ── Input handler ─────────────────────────────────────────────────────────

      inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter') {
          const raw = inp.value.trim();
          if (!raw) return;
          history.unshift(raw); histPos = -1;
          print(promptEl.textContent + raw, '#888899');
          inp.value = '';

          const parts = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
          const cmd = parts[0];
          const cmdArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));

          if (CMDS[cmd]) {
            try { await CMDS[cmd](cmdArgs); }
            catch(err) { print('Error: ' + err.message, '#ff8888'); }
          } else if (cmd) {
            print(cmd + ': command not found. Type "help" for available commands.', '#ff8888');
          }
        }
        else if (e.key === 'ArrowUp') {
          histPos = Math.min(histPos + 1, history.length - 1);
          inp.value = history[histPos] || '';
          e.preventDefault();
        }
        else if (e.key === 'ArrowDown') {
          histPos = Math.max(histPos - 1, -1);
          inp.value = histPos >= 0 ? history[histPos] : '';
          e.preventDefault();
        }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const val   = inp.value;
          const parts = val.split(/\s+/);
          const last  = parts[parts.length - 1];
          const dir   = last.includes('/') ? resolvePath(last.substring(0, last.lastIndexOf('/') + 1)) : cwd;
          const prefix = last.includes('/') ? last.substring(last.lastIndexOf('/') + 1) : last;
          const items  = await fs.ls(dir) || [];
          const matches = items.filter(i => i.name.startsWith(prefix));
          if (matches.length === 1) {
            parts[parts.length - 1] = (last.includes('/') ? last.substring(0, last.lastIndexOf('/') + 1) : '') +
              matches[0].name + (matches[0].type === 'dir' ? '/' : '');
            inp.value = parts.join(' ');
          } else if (matches.length > 1) {
            print(matches.map(m => m.name + (m.type === 'dir' ? '/' : '')).join('  '));
          }
        }
        else if (e.key === 'l' && e.ctrlKey) {
          e.preventDefault();
          out.innerHTML = '';
        }
        else if (e.key === 'c' && e.ctrlKey) {
          e.preventDefault();
          print(promptEl.textContent + inp.value + '^C', '#888899');
          inp.value = '';
        }
      });

      container.addEventListener('click', () => inp.focus());

      // ── Boot message ──────────────────────────────────────────────────────────

      print('BrowserOS Terminal v3.0', '#66aaff');
      print('Type "help" for commands. Tab completes paths; ↑/↓ browse session history; Ctrl+L clears output.', '#8888aa');
      print('');
      updatePrompt();
      inp.focus();

      // Start in specific path if launched with one
      if (args?.path) {
        fs.stat(args.path).then(stat => {
          if (stat && stat.type === 'dir') {
            cwd = args.path;
            updatePrompt();
          }
        });
      }
    }
  });
}
