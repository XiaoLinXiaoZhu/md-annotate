// Browser global mocks required by Obsidian's app.js
// Adapted for VSCode webview context

window.OBSIDIAN_DEFAULT_I18N = {};
i18next.init({ fallbackLng: 'en', ns: ['app'], defaultNS: 'app', initImmediate: false, interpolation: { escapeValue: false } });

// i18n: 尝试从相对路径加载，失败时使用空对象（不影响核心功能）
(function() {
  // 从当前脚本 src 推断 media base
  const scripts = document.querySelectorAll('script[src]');
  let base = '';
  for (const s of scripts) {
    if (s.src.includes('mock.js')) {
      base = s.src.replace(/mock\.js.*$/, '');
      break;
    }
  }
  fetch(base + 'i18n/en.json')
    .then(r => r.json())
    .then(data => {
      window.OBSIDIAN_DEFAULT_I18N = data;
      i18next.addResourceBundle('en', 'app', data);
    })
    .catch(() => {
      i18next.addResourceBundle('en', 'app', {});
    });
})();

window.DOMPurify = { sanitize(h) { return h; }, addHook(){}, removeHook(){}, setConfig(){}, isSupported: true };
window.activeWindow = window;
window.activeDocument = document;
window.initVimMode = () => ({ Vim: {} });
window.CodeMirrorAdapter = {};
window.process = { platform: 'win32', env: {}, versions: { electron: '28.0.0' }, cwd() { return '/'; } };
window.ready = function() {};

if (!Event.prototype.detach) Event.prototype.detach = function() {};
