package com.vscodroid.webview

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Test

class ChooserMimeTypesTest {
    @Test
    fun `maps image extensions for gallery providers`() {
        assertArrayEquals(arrayOf("image/png", "image/jpeg"),
            chooserMimeTypes(arrayOf(".PNG,.jpg", "image/jpeg")))
        assertArrayEquals(arrayOf("image/*"), chooserMimeTypes(arrayOf("image/*")))
    }

    @Test
    fun `unfiltered uploads and unknown extensions keep all files visible`() {
        assertArrayEquals(arrayOf("*/*"), chooserMimeTypes(null))
        assertArrayEquals(arrayOf("*/*"), chooserMimeTypes(arrayOf("")))
        assertArrayEquals(arrayOf("*/*"), chooserMimeTypes(arrayOf(".kt", ".png")))
    }
}
