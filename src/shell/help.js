import { mountGuide } from '../ui/guide.js';
import { OS_VERSION } from '../version.js';

export function registerHelp({ wm }) {
  wm.registerSystemApp('help', {
    title: 'Help', icon: '❔', width: 820, height: 620,
    mount(container) {
      return mountGuide(container, { mode: 'help', version: OS_VERSION });
    },
  });
}

