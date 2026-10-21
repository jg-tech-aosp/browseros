"""Build apps/info.beep from the shared guide and release version (stdlib only)."""
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
version = re.search(r"OS_VERSION = '([^']+)'", (root / 'src/version.js').read_text(encoding='utf-8')).group(1)
guide = (root / 'src/ui/guide.js').read_text(encoding='utf-8').replace('export function mountGuide', 'function mountGuide', 1)
main = guide + "\ndocument.body.style.cssText = 'margin:0;height:100vh;overflow:hidden';\n" + 'mountGuide(document.body, {mode:"info", version:' + json.dumps(version) + '});\n' + "const syncMotion = theme => document.documentElement.classList.toggle('bos-reduce-motion', theme?.reduceMotion === true);\nsyncMotion(BOS.os.theme());\nBOS.on('themeChanged', syncMotion);\n"
manifest = {'name':'Info','version':version,'icon':None,'emoji':'ℹ️','author':'BrowserOS','bos':'2.0','width':840,'height':640,'permissions':[],'events':['themeChanged'],'entry':'main.js'}
with zipfile.ZipFile(root / 'apps/info.beep', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, text in [('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'),('main.js',main)]:
        entry = zipfile.ZipInfo(name, (2026,10,21,0,0,0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(entry, text.encode('utf-8'))
print('Built apps/info.beep ' + version)

