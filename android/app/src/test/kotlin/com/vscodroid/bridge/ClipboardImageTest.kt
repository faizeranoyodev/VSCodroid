package com.vscodroid.bridge

import java.io.ByteArrayInputStream
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ClipboardImageTest {
    @Test
    fun `recognises image bytes rather than trusting a provider MIME label`() {
        assertEquals("image/png", clipboardImageMime(byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)))
        assertEquals("image/jpeg", clipboardImageMime(byteArrayOf(-1, -40, -1)))
        assertEquals("image/gif", clipboardImageMime("GIF89a".toByteArray()))
        assertEquals("image/webp", clipboardImageMime("RIFF0000WEBP".toByteArray()))
        assertNull(clipboardImageMime("not an image".toByteArray()))
        assertNull(clipboardImageMime(byteArrayOf(-119, 80)))
    }

    @Test
    fun `rejects oversized images even when no size metadata exists`() {
        assertThrows(IllegalArgumentException::class.java) {
            readClipboardImageBytes(ByteArrayInputStream(ByteArray(MAX_CLIPBOARD_IMAGE_BYTES + 1)))
        }
        val bytes = "GIF89a".toByteArray()
        assertArrayEquals(bytes, readClipboardImageBytes(ByteArrayInputStream(bytes)))
    }
}
