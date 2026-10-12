/* Android WebView denies clipboard.read(); preserve native answers when available. */
(function () {
    if (window.__vscodroidImageClipboardPatched || typeof AndroidBridge === 'undefined') return;
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof ClipboardItem === 'undefined') return;
    window.__vscodroidImageClipboardPatched = true;
    const channel = new BroadcastChannel('vscodroid-bridge');
    const pending = new Map();
    channel.onmessage = function ({ data }) {
        const request = data && pending.get(data.id);
        if (!request || data.cmd) return;
        pending.delete(data.id);
        clearTimeout(request.timer);
        if (data.ok) {
            try { request.resolve(JSON.parse(data.data)); } catch (error) { request.reject(error); }
        } else request.reject(new Error(data.error));
    };
    function readImage() {
        return new Promise((resolve, reject) => {
            const id = 'clipboard-image-' + crypto.randomUUID();
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error('Reading the Android clipboard image timed out'));
            }, 15000);
            pending.set(id, { resolve, reject, timer });
            channel.postMessage({ id, cmd: 'readClipboardImage' });
        });
    }
    function imageBlob(image) {
        const binary = atob(image.base64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return new Blob([bytes], { type: image.mime });
    }
    const nativeRead = typeof clipboard.read === 'function' ? clipboard.read.bind(clipboard) : null;
    clipboard.read = async function () {
        if (nativeRead) {
            try { return await nativeRead(); } catch (error) {
                // Only permission failures should use Android's clipboard instead.
                if (error.name !== 'NotAllowedError' && error.name !== 'SecurityError') throw error;
            }
        }
        const image = await readImage();
        if (image) return [new ClipboardItem({ [image.mime]: imageBlob(image) })];
        const text = await clipboard.readText();
        return text ? [new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) })] : [];
    };
    // Android sometimes sends an empty paste event for a copied image. Restore
    // its File payload for Monaco and composers that consume clipboardData.
    document.addEventListener('paste', async function (event) {
        if (!event.isTrusted || !event.clipboardData || event.clipboardData.files.length ||
            event.clipboardData.getData('text/plain') || event.clipboardData.getData('text/html')) return;
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('[contenteditable="true"],textarea')) return;
        const focused = document.activeElement;
        event.preventDefault();
        try {
            const image = await readImage();
            if (!image || !target.isConnected || document.activeElement !== focused) return;
            const data = new DataTransfer();
            const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
                'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tiff' }[image.mime];
            data.items.add(new File([imageBlob(image)], 'clipboard.' + extension, { type: image.mime }));
            target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        } catch (error) { console.error('VSCodroid image paste failed', error); }
    }, true);
})();
