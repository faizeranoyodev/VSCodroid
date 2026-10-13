package com.vscodroid.webview

import android.annotation.SuppressLint
import android.content.ClipDescription
import android.view.inputmethod.InputContentInfo
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Run on a device: the JVM's android.jar cannot enforce WebView thread affinity. */
@RunWith(AndroidJUnit4::class)
class ImageInputThreadInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun image() = InputContentInfo(
        "content://com.vscodroid.test/image".toUri(),
        ClipDescription("screenshot", arrayOf("image/png")), null,
    )

    @SuppressLint("SetJavaScriptEnabled")
    @Test
    fun backgroundKeyboardCommitChecksUrlAndEvaluatesJavaScriptOnUiThread() {
        lateinit var view: ImageInputWebView
        var created = false
        val loaded = CountDownLatch(1)
        val worker = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "InputConnectionHandlerThread")
        }
        try {
            instrumentation.runOnMainSync {
                view = ImageInputWebView(instrumentation.targetContext)
                created = true
                view.settings.javaScriptEnabled = true
                view.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(webView: WebView, url: String) { loaded.countDown() }
                }
                // Return false to avoid reading a real provider URI. This still exercises
                // both WebView calls that were illegally made on the keyboard thread.
                view.loadDataWithBaseURL(
                    "http://127.0.0.1:13337/", """<script>
                    window.__imageInputThreadTest = false;
                    window.__vscodroidImageInput = {begin() {
                        window.__imageInputThreadTest = true; return false;
                    }};</script>""", "text/html", "UTF-8", null,
                )
            }
            assertTrue("test page did not load", loaded.await(10, TimeUnit.SECONDS))
            assertTrue(worker.submit<Boolean> { view.commitKeyboardImage(image(), 0) }.get(5, TimeUnit.SECONDS))
            val completed = CountDownLatch(1)
            var reached = false
            instrumentation.runOnMainSync {
                view.evaluateJavascript("window.__imageInputThreadTest") { result ->
                    reached = result == "true"
                    completed.countDown()
                }
            }
            assertTrue("JavaScript response timed out", completed.await(10, TimeUnit.SECONDS))
            assertTrue("keyboard commit never reached the page", reached)
        } finally {
            worker.shutdownNow()
            if (created) instrumentation.runOnMainSync { view.destroy() }
        }
    }

    @Test
    fun queuedKeyboardCommitAfterDestroyNeverTouchesDeadWebView() {
        lateinit var view: ImageInputWebView
        val worker = Executors.newSingleThreadExecutor()
        try {
            instrumentation.runOnMainSync {
                view = ImageInputWebView(instrumentation.targetContext)
                // Hold the main queue until destruction has completed. The posted
                // commit must check closed before invoking WebView.getUrl().
                assertTrue(worker.submit<Boolean> { view.commitKeyboardImage(image(), 0) }.get(5, TimeUnit.SECONDS))
                view.destroy()
            }
            instrumentation.waitForIdleSync()
            assertFalse(worker.submit<Boolean> { view.commitKeyboardImage(image(), 0) }.get(5, TimeUnit.SECONDS))
        } finally {
            worker.shutdownNow()
        }
    }
}
