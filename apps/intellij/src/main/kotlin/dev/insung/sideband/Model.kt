package dev.insung.sideband

import java.nio.file.Files
import java.nio.file.Path

/** One comment in a thread, as the bridge reports it. */
data class ViewComment(
    val id: String,
    val authorName: String,
    val createdAt: String,
    val body: String,
)

/** A thread as the bridge reports it. `start`/`end` are UTF-16 offsets, the same unit as IntelliJ documents. */
data class ViewThread(
    val id: String,
    val documentPath: String,
    val status: String,
    val quote: String,
    val originalQuote: String,
    val anchorState: String,
    val start: Int?,
    val end: Int?,
    val comments: List<ViewComment>,
    val revision: Int,
    val updatedAt: String,
) {
    val resolved: Boolean get() = status == "resolved"
}

/** Points at one thread inside one comment store. */
data class ThreadRef(val root: Path, val threadId: String)

object ProjectRoots {
    private val markers = listOf(".comments", ".git")

    /** Same rule as the VS Code extension: the nearest directory holding `.comments` or `.git`. */
    fun find(path: Path, exists: (Path) -> Boolean = Files::exists): Path? {
        var directory: Path? = if (Files.isDirectory(path)) path else path.parent
        while (directory != null) {
            val current = directory
            if (markers.any { exists(current.resolve(it)) }) return current
            directory = directory.parent
        }
        return null
    }

    /** The store's document path: relative to the root, with `/` separators. Null outside the root or inside `.comments`. */
    fun documentPath(root: Path, file: Path): String? {
        val normalizedRoot = root.toAbsolutePath().normalize()
        val normalizedFile = file.toAbsolutePath().normalize()
        if (!normalizedFile.startsWith(normalizedRoot) || normalizedFile == normalizedRoot) return null
        val relative = normalizedRoot.relativize(normalizedFile).joinToString("/")
        return if (relative == ".comments" || relative.startsWith(".comments/")) null else relative
    }
}

/** The thread whose anchor holds the offset. Overlapping anchors resolve to the innermost one (as in VS Code). */
fun threadAtOffset(threads: List<ViewThread>, offset: Int): ViewThread? =
    threads.filter { it.start != null && it.end != null && offset >= it.start && offset <= it.end }
        .minByOrNull { it.end!! - it.start!! }
