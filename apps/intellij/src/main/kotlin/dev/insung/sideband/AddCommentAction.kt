package dev.insung.sideband

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager

/** Editor right-click → Add Sideband Comment on the selected text. */
class AddCommentAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val project = e.project
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = project != null && editor != null &&
            editor.selectionModel.hasSelection() &&
            SidebandProjectService.get(project).keyOf(editor.document) != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val service = SidebandProjectService.get(project)
        if (service.keyOf(editor.document) == null) return
        val body = Messages.showMultilineInputDialog(project, "Comment", "Add Sideband Comment", "", null, null)
            ?.trim()?.takeIf { it.isNotEmpty() } ?: return
        service.create(editor, body)
        ToolWindowManager.getInstance(project).getToolWindow(SidebandToolWindowFactory.ID)?.show()
    }
}

/** Starts highlighting and store polling as soon as a project opens, before the tool window is shown. */
class SidebandStartup : ProjectActivity {
    override suspend fun execute(project: Project) {
        SidebandProjectService.get(project).refreshAll()
    }
}
