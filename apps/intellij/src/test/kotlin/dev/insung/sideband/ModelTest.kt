package dev.insung.sideband

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.nio.file.Path

class ModelTest {
    private fun thread(id: String, start: Int?, end: Int?) =
        ViewThread(id, "a.md", "open", "q", "q", if (start == null) "orphaned" else "resolved", start, end, emptyList(), 0, "")

    @Test
    fun `finds the nearest directory with comments or git`() {
        val existing = setOf(Path.of("/w/repo/.git"), Path.of("/w/.comments"))
        assertEquals(Path.of("/w/repo"), ProjectRoots.find(Path.of("/w/repo/src/a.kt")) { it in existing })
        assertEquals(Path.of("/w"), ProjectRoots.find(Path.of("/w/notes/b.md")) { it in existing })
        assertNull(ProjectRoots.find(Path.of("/other/c.md")) { it in existing })
    }

    @Test
    fun `document paths are root-relative with forward slashes and never inside the store`() {
        val root = Path.of("/w/repo")
        assertEquals("src/main/a.kt", ProjectRoots.documentPath(root, Path.of("/w/repo/src/main/a.kt")))
        assertNull(ProjectRoots.documentPath(root, Path.of("/w/other/a.kt")))
        assertNull(ProjectRoots.documentPath(root, Path.of("/w/repo/.comments/documents/x.jsonl")))
        assertNull(ProjectRoots.documentPath(root, root))
    }

    @Test
    fun `caret picks the innermost anchored thread`() {
        val threads = listOf(thread("outer", 0, 20), thread("inner", 5, 8), thread("gone", null, null))
        assertEquals("inner", threadAtOffset(threads, 6)?.id)
        assertEquals("outer", threadAtOffset(threads, 15)?.id)
        assertNull(threadAtOffset(threads, 30))
    }
}
