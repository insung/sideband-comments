package dev.insung.sideband

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.JBSplitter
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.ActionLink
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.tree.TreeUtil
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.nio.file.Path
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath
import javax.swing.tree.TreeSelectionModel

class SidebandToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = SidebandPanel(project, toolWindow)
        toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(panel, "", false))
    }

    companion object { const val ID = "Sideband Comments" }
}

private sealed interface Node
private data class RootNode(val root: Path, val error: String?) : Node
private data class FileNode(val root: Path, val path: String, val threads: List<ViewThread>) : Node
private data class ThreadNode(val ref: ThreadRef, val thread: ViewThread) : Node

/** Comments Explorer (top) and Comment Details (bottom), the same two views as the VS Code extension. */
class SidebandPanel(private val project: Project, toolWindow: ToolWindow) : SimpleToolWindowPanel(true, true) {
    private val service = SidebandProjectService.get(project)
    private val treeModel = DefaultTreeModel(DefaultMutableTreeNode())
    private val tree = Tree(treeModel)
    private val details = JPanel(BorderLayout())
    private var rebuilding = false
    private val drafts = mutableMapOf<ThreadRef, String>()

    init {
        tree.isRootVisible = false
        tree.showsRootHandles = true
        tree.selectionModel.selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION
        tree.cellRenderer = Renderer()
        tree.addTreeSelectionListener {
            if (rebuilding) return@addTreeSelectionListener
            (selectedNode() as? ThreadNode)?.let { service.select(it.ref) }
        }
        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                val node = selectedNode()
                if (e.clickCount == 2 && node is ThreadNode) service.navigate(node.ref, node.thread)
            }
        })

        val splitter = JBSplitter(true, "sideband.comments.splitter", 0.45f)
        splitter.firstComponent = JBScrollPane(tree)
        splitter.secondComponent = details
        setContent(splitter)

        val actions = DefaultActionGroup(ShowResolvedAction(), RefreshAction())
        val toolbar = ActionManager.getInstance().createActionToolbar("SidebandComments", actions, true)
        toolbar.targetComponent = this
        setToolbar(toolbar.component)

        service.addListener(toolWindow.disposable) { rebuild() }
        rebuild()
        service.refreshAll()
    }

    private fun selectedNode(): Node? = (tree.lastSelectedPathComponent as? DefaultMutableTreeNode)?.userObject as? Node

    private fun rebuild() {
        rebuilding = true
        try {
            val top = DefaultMutableTreeNode()
            val roots = (service.explorer.keys + service.explorerErrors.keys).toSortedSet()
            var selectedPath: TreePath? = null
            for (root in roots) {
                val rootNode = DefaultMutableTreeNode(RootNode(root, service.explorerErrors[root]))
                top.add(rootNode)
                service.explorer[root].orEmpty().groupBy { it.documentPath }.toSortedMap().forEach { (path, threads) ->
                    val fileNode = DefaultMutableTreeNode(FileNode(root, path, threads))
                    rootNode.add(fileNode)
                    threads.forEach { thread ->
                        val ref = ThreadRef(root, thread.id)
                        val threadNode = DefaultMutableTreeNode(ThreadNode(ref, thread))
                        fileNode.add(threadNode)
                        if (ref == service.selected) selectedPath = TreePath(threadNode.path)
                    }
                }
            }
            treeModel.setRoot(top)
            TreeUtil.expandAll(tree)
            selectedPath?.let { tree.selectionPath = it; tree.scrollPathToVisible(it) }
        } finally {
            rebuilding = false
        }
        showDetails()
    }

    private fun showDetails() {
        details.removeAll()
        val ref = service.selected
        val thread = ref?.let { service.threadFor(it) }
        if (ref == null || thread == null) {
            details.add(JBLabel("Select a comment, or select text and choose Add Sideband Comment.").apply {
                foreground = UIUtil.getContextHelpForeground(); border = JBUI.Borders.empty(8)
            }, BorderLayout.NORTH)
        } else {
            details.add(JBScrollPane(threadView(ref, thread)), BorderLayout.CENTER)
            details.add(replyView(ref, thread), BorderLayout.SOUTH)
        }
        details.revalidate()
        details.repaint()
    }

    private fun threadView(ref: ThreadRef, thread: ViewThread): JComponent {
        val column = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS); border = JBUI.Borders.empty(8) }
        column.add(JBLabel("${thread.documentPath} · ${thread.status} · ${anchorLabel(thread.anchorState)}").apply {
            foreground = UIUtil.getContextHelpForeground(); alignmentX = 0f
        })
        column.add(quote("Original text", thread.originalQuote))
        if (thread.quote != thread.originalQuote) column.add(quote("Anchored text", thread.quote))
        thread.comments.forEach { comment ->
            val box = JPanel(BorderLayout()).apply { border = JBUI.Borders.emptyTop(10); alignmentX = 0f }
            val header = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply { isOpaque = false }
            header.add(JBLabel(comment.authorName).apply { font = font.deriveFont(java.awt.Font.BOLD) })
            header.add(JBLabel(comment.createdAt.replace('T', ' ').take(16)).apply { foreground = UIUtil.getContextHelpForeground() })
            header.add(ActionLink("Edit") {
                Messages.showMultilineInputDialog(project, "Comment", "Edit Sideband Comment", comment.body, null, null)
                    ?.takeIf { it.isNotBlank() && it != comment.body }
                    ?.let { service.editComment(ref, comment.id, it) }
            })
            header.add(ActionLink("Delete") {
                val answer = Messages.showOkCancelDialog(project,
                    "Only this comment will disappear from the thread. Its append-only JSONL history remains recoverable.",
                    "Delete this Sideband comment?", "Delete", "Cancel", Messages.getWarningIcon())
                if (answer == Messages.OK) service.deleteComment(ref, comment.id)
            })
            box.add(header, BorderLayout.NORTH)
            box.add(textBlock(comment.body), BorderLayout.CENTER)
            column.add(box)
        }
        return column
    }

    private fun replyView(ref: ThreadRef, thread: ViewThread): JComponent {
        val input = JBTextArea(drafts[ref].orEmpty(), 3, 20).apply { lineWrap = true; wrapStyleWord = true }
        input.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent) { drafts[ref] = input.text }
            override fun removeUpdate(e: javax.swing.event.DocumentEvent) { drafts[ref] = input.text }
            override fun changedUpdate(e: javax.swing.event.DocumentEvent) {}
        })
        val send = {
            val body = input.text.trim()
            if (body.isNotEmpty()) service.reply(ref, body) { drafts.remove(ref) }
        }
        input.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER && (e.isMetaDown || e.isControlDown)) { e.consume(); send() }
            }
        })
        val buttons = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 4))
        buttons.add(JButton("Re-anchor to Selection").apply {
            toolTipText = "Attach this thread to the text selected in the editor"
            addActionListener { service.reanchor(ref, thread)?.let { Messages.showInfoMessage(project, it, "Sideband Comments") } }
        })
        buttons.add(JButton(if (thread.resolved) "Reopen" else "Resolve").apply {
            addActionListener { service.setResolved(ref, !thread.resolved) }
        })
        buttons.add(JButton("Reply").apply { addActionListener { send() } })
        return JPanel(BorderLayout()).apply {
            border = JBUI.Borders.compound(JBUI.Borders.customLineTop(JBUI.CurrentTheme.ToolWindow.borderColor()), JBUI.Borders.empty(6, 8))
            add(JBScrollPane(input).apply { toolTipText = "Reply (⌘/Ctrl+Enter)" }, BorderLayout.CENTER)
            add(buttons, BorderLayout.SOUTH)
        }
    }

    private fun quote(title: String, text: String) = JPanel(BorderLayout()).apply {
        alignmentX = 0f
        border = JBUI.Borders.emptyTop(6)
        add(JBLabel(title).apply { foreground = UIUtil.getContextHelpForeground() }, BorderLayout.NORTH)
        add(textBlock(text).apply { border = JBUI.Borders.compound(JBUI.Borders.customLineLeft(JBUI.CurrentTheme.Link.Foreground.ENABLED), JBUI.Borders.emptyLeft(6)) }, BorderLayout.CENTER)
    }

    private fun textBlock(text: String) = JBTextArea(text).apply {
        isEditable = false; lineWrap = true; wrapStyleWord = true; isOpaque = false; border = JBUI.Borders.empty()
    }

    private fun anchorLabel(state: String) = when (state) {
        "resolved" -> "anchored"
        "orphaned" -> "orphaned: quoted text is gone"
        "ambiguous" -> "ambiguous: quoted text appears more than once"
        "missing-file" -> "file is missing"
        else -> state
    }

    private inner class Renderer : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(tree: JTree, value: Any?, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
            when (val node = (value as? DefaultMutableTreeNode)?.userObject) {
                is RootNode -> {
                    icon = AllIcons.Nodes.Folder
                    append(node.root.fileName?.toString() ?: node.root.toString())
                    node.error?.let { append("  $it", SimpleTextAttributes.ERROR_ATTRIBUTES) }
                }
                is FileNode -> {
                    icon = AllIcons.FileTypes.Any_type
                    append(node.path)
                    val open = node.threads.count { !it.resolved }
                    append("  $open open", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
                is ThreadNode -> {
                    val thread = node.thread
                    icon = if (thread.resolved) AllIcons.RunConfigurations.TestPassed else AllIcons.Toolwindows.ToolWindowMessages
                    val style = if (thread.resolved) SimpleTextAttributes.GRAYED_ATTRIBUTES else SimpleTextAttributes.REGULAR_ATTRIBUTES
                    append("\"${thread.quote.lineSequence().first().take(40)}\"", style)
                    append("  ${thread.comments.size} comment${if (thread.comments.size == 1) "" else "s"}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    if (thread.anchorState != "resolved") append("  ${thread.anchorState}", SimpleTextAttributes.ERROR_ATTRIBUTES)
                }
            }
        }
    }

    private inner class ShowResolvedAction : ToggleAction("Show Resolved", "Show resolved threads", AllIcons.Actions.Show), DumbAware {
        override fun getActionUpdateThread() = ActionUpdateThread.BGT
        override fun isSelected(e: AnActionEvent) = SidebandSettings.get().state.showResolved
        override fun setSelected(e: AnActionEvent, state: Boolean) {
            SidebandSettings.get().state.showResolved = state
            service.refreshAll()
        }
    }

    private inner class RefreshAction : DumbAwareAction("Reload", "Reload Sideband comments", AllIcons.Actions.Refresh) {
        override fun getActionUpdateThread() = ActionUpdateThread.BGT
        override fun actionPerformed(e: AnActionEvent) = service.refreshAll()
    }
}
