/* Installed at document start in every frame. Native images go only to the
 * focused editor, through its parent chain; no bridge token enters a webview. */
(function () {
    'use strict';
    if (window.__vscodroidImageInput) return;
    const requests = new Map();
    const prefix = 'vscodroid-image-input';
    const root = window === window.top;
    function frame(element) {
        return element && element.tagName === 'IFRAME' ? element.contentWindow : null;
    }
    function editable(element) {
        return element && (element.isContentEditable || element.tagName === 'TEXTAREA');
    }
    function begin(id) {
        const target = document.activeElement;
        if (!frame(target) && !editable(target)) return false;
        if (requests.has(id)) clearTimeout(requests.get(id).timer);
        const timer = setTimeout(() => requests.delete(id), 15000);
        requests.set(id, { target, timer });
        if (frame(target)) frame(target).postMessage({ type: prefix, action: 'begin', id }, '*');
        return true;
    }
    function deliver(id, image) {
        const request = requests.get(id);
        requests.delete(id);
        if (!request) return false;
        clearTimeout(request.timer);
        const target = request.target;
        if (!target.isConnected || document.activeElement !== target) return false;
        if (frame(target)) {
            frame(target).postMessage({ type: prefix, action: 'deliver', id, image }, '*');
            return true;
        }
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[image?.mime];
        if (!extension || typeof image.base64 !== 'string' || image.base64.length > 28 * 1024 * 1024) return false;
        const bytes = Uint8Array.from(atob(image.base64), character => character.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], 'clipboard.' + extension, { type: image.mime }));
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        return true;
    }
    window.addEventListener('message', event => {
        const message = event.data;
        if (!message || message.type !== prefix || typeof message.id !== 'string') return;
        if (event.source === window.parent && !root) {
            if (message.action === 'begin') begin(message.id);
            if (message.action === 'deliver') deliver(message.id, message.image);
        }
    });
    window.__vscodroidImageInput = { begin, deliver };
})();
