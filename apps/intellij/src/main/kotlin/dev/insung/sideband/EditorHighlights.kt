package dev.insung.sideband

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.JBColor
import java.awt.Color
import javax.swing.Icon

/** Draws each anchored thread as a background highlight with a gutter icon that opens it in the tool window. */
class EditorHighlights(private val project: Project, private val onSelect: (ThreadRef) -> Unit) {
    private val key = Key.create<List<RangeHighlighter>>("sideband.highlights")

    private val open = TextAttributes().apply { backgroundColor = JBColor(Color(0xFFF1B3), Color(0x4F4420)) }
    private val focused = TextAttributes().apply { backgroundColor = JBColor(Color(0xFFD866), Color(0x7A6420)) }
    private val resolved = TextAttributes().apply { backgroundColor = JBColor(Color(0xE8E8E8), Color(0x3A3D40)) }

    fun apply(document: Document, documentKey: DocumentKey, threads: List<ViewThread>, selected: ThreadRef?) {
        for (editor in EditorFactory.getInstance().getEditors(document, project)) {
            val markup = editor.markupModel
            editor.getUserData(key)?.forEach { markup.removeHighlighter(it) }
            val added = threads.filter { it.start != null && it.end != null && it.end <= document.textLength }.map { thread ->
                val ref = ThreadRef(documentKey.root, thread.id)
                val attributes = when {
                    ref == selected -> focused
                    thread.resolved -> resolved
                    else -> open
                }
                markup.addRangeHighlighter(thread.start!!, thread.end!!, HighlighterLayer.SELECTION - 1, attributes, HighlighterTargetArea.EXACT_RANGE)
                    .apply { gutterIconRenderer = ThreadGutter(ref, thread) }
            }
            editor.putUserData(key, added)
        }
    }

    private inner class ThreadGutter(private val ref: ThreadRef, private val thread: ViewThread) : GutterIconRenderer() {
        override fun getIcon(): Icon = if (thread.resolved) AllIcons.RunConfigurations.TestPassed else AllIcons.Toolwindows.ToolWindowMessages
        override fun getTooltipText(): String =
            "${thread.comments.firstOrNull()?.authorName.orEmpty()}: ${thread.comments.firstOrNull()?.body.orEmpty().take(120)}" +
                (if (thread.comments.size > 1) " (+${thread.comments.size - 1})" else "")
        override fun getClickAction(): AnAction = object : AnAction() {
            override fun actionPerformed(e: AnActionEvent) {
                onSelect(ref)
                ToolWindowManager.getInstance(project).getToolWindow(SidebandToolWindowFactory.ID)?.show()
            }
        }
        override fun isNavigateAction() = true
        override fun equals(other: Any?) = other is ThreadGutter && other.ref == ref && other.thread == thread
        override fun hashCode() = ref.hashCode() * 31 + thread.hashCode()
    }
}
