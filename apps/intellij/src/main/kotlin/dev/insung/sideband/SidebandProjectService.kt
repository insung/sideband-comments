package dev.insung.sideband

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runReadActionBlocking
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.io.path.isDirectory
import kotlin.io.path.listDirectoryEntries

/** Where a document lives in a comment store. */
data class DocumentKey(val root: Path, val path: String)

/**
 * Holds the threads shown for one IntelliJ project, keeps editor highlights in step with them,
 * and runs every change through [BridgeClient].
 */
@Service(Service.Level.PROJECT)
class SidebandProjectService(private val project: Project) : Disposable {
    private val log = com.intellij.openapi.diagnostic.logger<SidebandProjectService>()
    private val bridge get() = service<BridgeClient>()
    private val settings get() = SidebandSettings.get()

    private val listeners = mutableListOf<() -> Unit>()
    private val knownRoots = ConcurrentHashMap.newKeySet<Path>()
    private val storeSignatures = ConcurrentHashMap<Path, String>()
    private val documentRefresh = ConcurrentHashMap<Document, ScheduledFuture<*>>()
    private val documentThreads = ConcurrentHashMap<Document, List<ViewThread>>()

    @Volatile var explorer: Map<Path, List<ViewThread>> = emptyMap(); private set
    @Volatile var explorerErrors: Map<Path, String> = emptyMap(); private set
    @Volatile var selected: ThreadRef? = null; private set

    private val highlights = EditorHighlights(project) { ref -> select(ref) }
    private val poller: ScheduledFuture<*>

    init {
        val multicaster = EditorFactory.getInstance().eventMulticaster
        multicaster.addDocumentListener(object : DocumentListener {
            override fun documentChanged(event: DocumentEvent) {
                if (keyOf(event.document) != null) scheduleDocument(event.document, 400)
            }
        }, this)
        multicaster.addCaretListener(object : CaretListener {
            override fun caretPositionChanged(event: CaretEvent) = focusThreadUnderCaret(event.editor)
        }, this)
        EditorFactory.getInstance().addEditorFactoryListener(object : EditorFactoryListener {
            override fun editorCreated(event: EditorFactoryEvent) {
                if (event.editor.project == project) scheduleDocument(event.editor.document, 0)
            }
        }, this)
        // Agents and other editors append to `.comments` from outside the IDE; poll the store files cheaply.
        poller = AppExecutorUtil.getAppScheduledExecutorService()
            .scheduleWithFixedDelay({ pollStores() }, 2, 2, TimeUnit.SECONDS)
    }

    fun addListener(parent: Disposable, listener: () -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
        com.intellij.openapi.util.Disposer.register(parent) { synchronized(listeners) { listeners.remove(listener) } }
    }

    private fun changed() {
        ApplicationManager.getApplication().invokeLater({
            synchronized(listeners) { listeners.toList() }.forEach { it() }
        }, project.disposed)
    }

    // ---- locating documents ----

    fun keyOf(document: Document): DocumentKey? {
        val file = FileDocumentManager.getInstance().getFile(document) ?: return null
        return keyOf(file)
    }

    fun keyOf(file: VirtualFile): DocumentKey? {
        if (file.isDirectory) return null
        val path = diskPath(file) ?: return null
        val root = ProjectRoots.find(path) ?: return null
        val documentPath = ProjectRoots.documentPath(root, path) ?: return null
        // A store first seen through an opened file joins the Comments Explorer right away.
        if (knownRoots.add(root)) background { refreshExplorerNow() }
        return DocumentKey(root, documentPath)
    }

    private fun rootOf(file: VirtualFile): Path? =
        if (file.isDirectory) null else diskPath(file)?.let { ProjectRoots.find(it) }

    /** Null for files that are not on disk (in-memory, remote, or test `temp://` files). */
    private fun diskPath(file: VirtualFile): Path? =
        if (!file.isInLocalFileSystem) null else runCatching { file.toNioPath() }.getOrNull()

    private fun roots(): Set<Path> {
        // Project model and editor lists need a read action off the EDT; the disk checks run outside it.
        val (candidates, files) = runReadActionBlocking {
            val dirs = buildList {
                project.guessProjectDir()?.let(::diskPath)?.let { add(it) }
                ProjectRootManager.getInstance(project).contentRoots.mapNotNull(::diskPath).forEach { add(it) }
            }
            val opened = FileEditorManager.getInstance(project).openFiles.toList() +
                EditorFactory.getInstance().allEditors.filter { it.project == project }
                    .mapNotNull { FileDocumentManager.getInstance().getFile(it.document) }
            dirs to opened
        }
        candidates.forEach { candidate ->
            ProjectRoots.find(candidate)?.let { knownRoots.add(it) }
            // A workspace folder can hold several repositories; pick up the ones one level down that already have comments.
            if (candidate.isDirectory()) runCatching {
                candidate.listDirectoryEntries().filter { Files.isDirectory(it.resolve(".comments")) }.forEach { knownRoots.add(it) }
            }
        }
        files.forEach { file -> rootOf(file)?.let { knownRoots.add(it) } }
        return knownRoots.toSortedSet()
    }

    // ---- refreshing ----

    fun refreshAll() {
        background {
            refreshExplorerNow()
            EditorFactory.getInstance().allEditors.filter { it.project == project }.map { it.document }.toSet()
                .forEach { scheduleDocument(it, 0) }
        }
    }

    private fun refreshExplorerNow() {
        val threads = mutableMapOf<Path, List<ViewThread>>()
        val errors = mutableMapOf<Path, String>()
        for (root in roots()) {
            try {
                threads[root] = bridge.call("project.threads", mapOf("root" to root.toString(), "includeResolved" to settings.state.showResolved), ThreadList::class.java).threads
            } catch (error: BridgeException) {
                errors[root] = error.message.orEmpty()
            }
            storeSignatures[root] = storeSignature(root)
        }
        explorer = threads
        explorerErrors = errors
        changed()
    }

    private fun scheduleDocument(document: Document, delayMs: Long) {
        documentRefresh.remove(document)?.cancel(false)
        documentRefresh[document] = AppExecutorUtil.getAppScheduledExecutorService()
            .schedule({ refreshDocumentNow(document) }, delayMs, TimeUnit.MILLISECONDS)
    }

    private fun refreshDocumentNow(document: Document) {
        if (project.isDisposed) return
        val key = keyOf(document) ?: return
        val (text, stamp) = runReadActionBlocking { document.text to document.modificationStamp }
        val threads = try {
            bridge.call("document.threads", mapOf(
                "root" to key.root.toString(), "path" to key.path, "text" to text,
                "includeResolved" to settings.state.showResolved,
            ), ThreadList::class.java).threads
        } catch (error: BridgeException) {
            notifyError(error); return
        }
        ApplicationManager.getApplication().invokeLater({
            if (document.modificationStamp != stamp) return@invokeLater
            documentThreads[document] = threads
            highlights.apply(document, key, threads, selected)
        }, project.disposed)
    }

    private fun pollStores() {
        if (project.isDisposed) return
        val changedRoots = knownRoots.filter { storeSignatures[it] != null && storeSignatures[it] != storeSignature(it) }
        if (changedRoots.isNotEmpty()) refreshAll()
    }

    private fun storeSignature(root: Path): String {
        val store = root.resolve(".comments")
        return listOf("documents", "threads").joinToString("|") { directory ->
            val folder = store.resolve(directory)
            if (!folder.isDirectory()) "" else runCatching {
                folder.listDirectoryEntries("*.jsonl").sorted().joinToString(",") { "${it.fileName}:${Files.size(it)}:${Files.getLastModifiedTime(it).toMillis()}" }
            }.getOrDefault("")
        }
    }

    // ---- selection ----

    fun threadFor(ref: ThreadRef): ViewThread? {
        documentThreads.forEach { (document, threads) ->
            if (keyOf(document)?.root == ref.root) threads.firstOrNull { it.id == ref.threadId }?.let { return it }
        }
        return explorer[ref.root]?.firstOrNull { it.id == ref.threadId }
    }

    fun select(ref: ThreadRef?) {
        if (selected == ref) return
        selected = ref
        documentThreads.forEach { (document, threads) -> keyOf(document)?.let { highlights.apply(document, it, threads, ref) } }
        changed()
    }

    private fun focusThreadUnderCaret(editor: Editor) {
        if (editor.project != project) return
        val key = keyOf(editor.document) ?: return
        val thread = threadAtOffset(documentThreads[editor.document].orEmpty(), editor.caretModel.offset) ?: return
        select(ThreadRef(key.root, thread.id))
    }

    /** Opens the document at the thread's anchor; falls back to the start of the file when the anchor is gone. */
    fun navigate(ref: ThreadRef, thread: ViewThread) {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(ref.root.resolve(thread.documentPath)) ?: return
        select(ref)
        OpenFileDescriptor(project, file, thread.start ?: 0).navigate(true)
    }

    // ---- changes ----

    fun create(editor: Editor, body: String) {
        val key = keyOf(editor.document) ?: return
        val selection = editor.selectionModel
        if (!selection.hasSelection()) return
        val text = editor.document.text
        val start = selection.selectionStart
        val end = selection.selectionEnd
        mutate(key.root, "thread.create", mapOf("path" to key.path, "text" to text, "start" to start, "end" to end, "body" to body)) {
            select(ThreadRef(key.root, it.id))
        }
    }

    fun reply(ref: ThreadRef, body: String, onDone: () -> Unit = {}) =
        mutate(ref.root, "thread.reply", mapOf("threadId" to ref.threadId, "body" to body)) { onDone() }

    fun setResolved(ref: ThreadRef, resolved: Boolean) =
        mutate(ref.root, if (resolved) "thread.resolve" else "thread.reopen", mapOf("threadId" to ref.threadId))

    fun editComment(ref: ThreadRef, commentId: String, body: String) =
        mutate(ref.root, "comment.edit", mapOf("threadId" to ref.threadId, "commentId" to commentId, "body" to body))

    fun deleteComment(ref: ThreadRef, commentId: String) =
        mutate(ref.root, "comment.delete", mapOf("threadId" to ref.threadId, "commentId" to commentId))

    /** Moves the thread to the selection in the active editor. Returns a message when there is no usable selection. */
    fun reanchor(ref: ThreadRef, thread: ViewThread): String? {
        val editor = FileEditorManager.getInstance(project).selectedTextEditor
        val key = editor?.let { keyOf(it.document) }
        if (editor == null || key == null || key.root != ref.root || key.path != thread.documentPath || !editor.selectionModel.hasSelection()) {
            return "Select the new anchor text in ${thread.documentPath} first."
        }
        mutate(ref.root, "thread.reanchor", mapOf(
            "threadId" to ref.threadId, "path" to key.path, "text" to editor.document.text,
            "start" to editor.selectionModel.selectionStart, "end" to editor.selectionModel.selectionEnd,
        ))
        return null
    }

    private fun mutate(root: Path, type: String, fields: Map<String, Any?>, onDone: (ViewThread) -> Unit = {}) {
        knownRoots.add(root)
        background {
            try {
                val thread = bridge.call(type, fields + mapOf("root" to root.toString(), "author" to settings.author), ViewThread::class.java)
                ApplicationManager.getApplication().invokeLater({ onDone(thread) }, project.disposed)
                refreshAll()
            } catch (error: BridgeException) {
                notifyError(error)
            }
        }
    }

    private fun background(task: () -> Unit) = ApplicationManager.getApplication().executeOnPooledThread {
        try {
            task()
        } catch (error: Throwable) {
            if (error is com.intellij.openapi.progress.ProcessCanceledException) throw error
            log.error("Sideband Comments background task failed", error)
        }
    }

    private fun notifyError(error: BridgeException) {
        NotificationGroupManager.getInstance().getNotificationGroup("Sideband Comments")
            .createNotification("Sideband Comments", error.message.orEmpty(), NotificationType.ERROR)
            .notify(project)
    }

    override fun dispose() {
        poller.cancel(false)
        documentRefresh.values.forEach { it.cancel(false) }
    }

    private class ThreadList(val threads: List<ViewThread>)

    companion object {
        fun get(project: Project): SidebandProjectService = project.service()
    }
}
