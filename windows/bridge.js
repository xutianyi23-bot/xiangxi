'use strict';
window.xiangxiWindows = window.chrome.webview;
window.xiangxiWindows.addEventListener('message', ({data}) => window.receiveNative(...data));
