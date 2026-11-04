package dev.insung.sideband

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel

@Service(Service.Level.APP)
@State(name = "SidebandCommentsSettings", storages = [Storage("sideband-comments.xml")])
class SidebandSettings : SimplePersistentStateComponent<SidebandSettings.Settings>(Settings()) {
    class Settings : BaseState() {
        var authorName by string("")
        var showResolved by property(true)
        var nodePath by string("")
    }

    /** Empty uses the operating-system user name, like the VS Code `sidebandComments.authorName` setting. */
    val author: String
        get() = state.authorName?.trim().orEmpty().ifEmpty { System.getProperty("user.name").orEmpty().ifEmpty { "user" } }

    companion object {
        fun get(): SidebandSettings = service()
    }
}

class SidebandConfigurable : BoundConfigurable("Sideband Comments") {
    private val settings = SidebandSettings.get().state

    override fun createPanel() = panel {
        row("Author name:") {
            textField().columns(30)
                .bindText({ settings.authorName.orEmpty() }, { settings.authorName = it.trim() })
                .comment("Empty uses the operating-system user name.")
        }
        row {
            checkBox("Show resolved threads").bindSelected({ settings.showResolved }, { settings.showResolved = it })
        }
        row("Node.js executable:") {
            textField().columns(30)
                .bindText({ settings.nodePath.orEmpty() }, { settings.nodePath = it.trim() })
                .comment("Node 20 or later. Empty searches /opt/homebrew/bin, /usr/local/bin and the shell PATH.")
        }
    }

    override fun apply() {
        super.apply()
        service<BridgeClient>().restart()
        ProjectManager.getInstance().openProjects.forEach { SidebandProjectService.get(it).refreshAll() }
    }
}
