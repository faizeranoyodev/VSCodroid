package com.vscodroid.webview

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputContentInfo
import android.webkit.WebView
import androidx.core.net.toUri
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.vscodroid.bridge.ClipboardBridge
import com.vscodroid.util.Logger
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Gboard sends image URI content through InputConnection, not ClipboardEvent. */
class ImageInputWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = android.R.attr.webViewStyle,
) : WebView(context, attrs, defStyleAttr) {
    @Volatile private var closed = false
    private val ui = Handler(Looper.getMainLooper())
    private val imageMimeTypes = arrayOf("image/png", "image/jpeg", "image/gif", "image/webp")
    private val images = ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, ArrayBlockingQueue(2))
    private val imageScriptAvailable = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

    init {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                this, context.assets.open("image-input.js").bufferedReader().use { it.readText() }, setOf("*"),
            )
        }
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val original = super.onCreateInputConnection(outAttrs) ?: return null
        if (!imageScriptAvailable) return original
        outAttrs.contentMimeTypes = imageMimeTypes
        return object : InputConnectionWrapper(original, false) {
            override fun commitContent(content: InputContentInfo, flags: Int, opts: Bundle?): Boolean =
                commitKeyboardImage(content, flags)
        }
    }

    /** InputConnection callbacks run on Chromium's input thread, not the WebView thread. */
    internal fun commitKeyboardImage(content: InputContentInfo, flags: Int): Boolean {
        val supported = imageMimeTypes.any { content.description.hasMimeType(it) }
        if (closed || !supported || content.contentUri.scheme != "content") return false
        val granted = flags and InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION != 0
        try {
            // Acquire the IME's URI grant before acknowledging this asynchronous commit.
            if (granted) content.requestPermission()
        } catch (error: Exception) {
            Logger.w("ImageInput", "Keyboard image permission failed: ${error.message}")
            return false
        }
        val release = {
            if (granted) try {
                content.releasePermission()
            } catch (error: Exception) {
                Logger.w("ImageInput", "Keyboard image permission release failed: ${error.message}")
            }
        }
        // Never read url or call evaluateJavascript on InputConnectionHandlerThread.
        // A Handler also runs the cleanup if the view is detached before dispatch.
        val queued = ui.post {
            if (closed || (url ?: "").toUri().host !in setOf("127.0.0.1", "localhost", "::1")) {
                release()
                return@post
            }
            val id = JSONObject.quote(UUID.randomUUID().toString())
            evaluateJavascript("window.__vscodroidImageInput?.begin($id) === true") { ready ->
                if (closed || ready != "true") {
                    release()
                } else try {
                    images.execute {
                        try {
                            val image = ClipboardBridge(context).readImage(content.contentUri)
                            ui.post {
                                if (!closed && (url ?: "").toUri().host in setOf("127.0.0.1", "localhost", "::1")) {
                                    evaluateJavascript("window.__vscodroidImageInput?.deliver($id,$image)", null)
                                }
                            }
                        } catch (error: Exception) {
                            Logger.w("ImageInput", "Keyboard image read failed: ${error.message}")
                        } finally {
                            release()
                        }
                    }
                } catch (_: RejectedExecutionException) {
                    release()
                }
            }
        }
        if (!queued) release()
        return queued
    }

    override fun destroy() {
        closed = true
        // Finish queued reads so every granted URI permission gets released.
        images.shutdown()
        super.destroy()
    }
}
