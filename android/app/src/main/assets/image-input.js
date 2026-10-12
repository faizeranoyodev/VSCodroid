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
    async function read(id) {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const mime = item.types.find(type => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type));
                if (!mime) continue;
                const blob = await item.getType(mime);
                if (blob.size > 20 * 1024 * 1024) return;
                const reader = new FileReader();
                reader.onload = () => deliver(id, { mime, base64: reader.result.split(',')[1] });
                reader.readAsDataURL(blob);
                return;
            }
        } catch (error) { console.error('VSCodroid image clipboard read failed', error); }
    }
    window.addEventListener('message', event => {
        const message = event.data;
        if (!message || message.type !== prefix || typeof message.id !== 'string') return;
        if (event.source === window.parent && !root) {
            if (message.action === 'begin') begin(message.id);
            if (message.action === 'deliver') deliver(message.id, message.image);
        } else if (event.source === frame(document.activeElement) && message.action === 'read') {
            if (!begin(message.id)) return;
            if (root) read(message.id);
            else window.parent.postMessage(message, '*');
        }
    });
    // Normal clipboard paste inside extension frames cannot access the native
    // clipboard bridge. Ask the focused parent chain to perform that read.
    if (!root) document.addEventListener('paste', event => {
        if (!event.isTrusted || !editable(document.activeElement) || !event.clipboardData ||
            event.clipboardData.files.length || event.clipboardData.getData('text/plain') ||
            event.clipboardData.getData('text/html')) return;
        const id = crypto.randomUUID();
        if (!begin(id)) return;
        event.preventDefault();
        window.parent.postMessage({ type: prefix, action: 'read', id }, '*');
    }, true);
    window.__vscodroidImageInput = { begin, deliver };
})();
