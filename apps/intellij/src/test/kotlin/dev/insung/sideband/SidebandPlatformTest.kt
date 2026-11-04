package dev.insung.sideband

import com.google.gson.JsonArray
import com.google.gson.JsonParser
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.fixtures.TempDirTestFixture
import com.intellij.testFramework.fixtures.impl.TempDirTestFixtureImpl
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

/**
 * Runs the plugin inside a headless IntelliJ with the real Node bridge and the agent tool
 * (`plugin/skills/sideband-comments/scripts/sideband_comments.py`) as the other client.
 */
class SidebandPlatformTest : BasePlatformTestCase() {
    private val tool = File("../../plugin/skills/sideband-comments/scripts/sideband_comments.py").absoluteFile
    private val text = "# 배포 안내 😀\n\n`npm run deploy` 를 실행하면 즉시 운영에 배포한다.\n\n롤백은 온콜에게 연락한다.\n"
    private lateinit var root: Path

    // Local files, so the plugin finds `.comments` on disk like it does for a real project.
    override fun createTempDirTestFixture(): TempDirTestFixture = TempDirTestFixtureImpl()

    override fun setUp() {
        super.setUp()
        // The path IntelliJ reports for the temp directory, which is what the plugin keys stores by.
        root = myFixture.tempDirFixture.getFile("")!!.toNioPath()
        Files.createDirectories(root.resolve(".comments"))
        myFixture.tempDirFixture.createFile("docs/guide.md", text)
    }

    private fun agent(vararg args: String): String {
        val process = ProcessBuilder(listOf("python3", tool.path, "--root", root.toString(), "--author", "Codex") + args)
            .redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().readText()
        assertEquals(output, 0, process.waitFor())
        return output
    }

    private fun agentThreads(): JsonArray {
        val report = JsonParser.parseString(agent("list", "--json", root.resolve("docs/guide.md").toString()))
        return if (report.isJsonArray) report.asJsonArray else report.asJsonObject.getAsJsonArray("threads")
    }

    private fun waitFor(what: String, condition: () -> Boolean) = waitFor({ what }, condition)

    private fun waitFor(what: () -> String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 15_000
        while (!condition()) {
            if (System.currentTimeMillis() > deadline) fail("timed out waiting for ${what()}")
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            Thread.sleep(50)
        }
    }

    private fun highlightedQuotes(): List<String> = myFixture.editor.markupModel.allHighlighters
        .filter { it.gutterIconRenderer != null }
        .map { myFixture.editor.document.getText(com.intellij.openapi.util.TextRange(it.startOffset, it.endOffset)) }

    fun testThreadsTravelBetweenIntelliJAndTheAgentTool() {
        val service = SidebandProjectService.get(project)

        // AC-01: a thread written by another client shows at its quoted text.
        agent("create", "docs/guide.md", "--exact", "즉시 운영에 배포한다", "--body", "「즉시」가 언제인가?")
        myFixture.configureFromTempProjectFile("docs/guide.md")
        service.refreshAll()
        waitFor("agent thread highlight") { highlightedQuotes() == listOf("즉시 운영에 배포한다") }
        waitFor({ "Comments Explorer at $root: ${service.explorer.mapValues { it.value.size }} ${service.explorerErrors}" }) { service.explorer[root].orEmpty().size == 1 }
        val agentThread = service.explorer[root].orEmpty().single()
        assertEquals("Codex", agentThread.comments.single().authorName)

        // AC-02: a thread, reply and resolve made in IntelliJ read back the same through the agent tool.
        val start = text.indexOf("롤백")
        myFixture.editor.selectionModel.setSelection(start, start + "롤백은 온콜에게".length)
        service.create(myFixture.editor, "연락 수단을 적어 주세요.")
        waitFor("IntelliJ thread") { service.explorer[root].orEmpty().size == 2 }
        val created = service.explorer[root].orEmpty().first { it.id != agentThread.id }
        val ref = ThreadRef(root, created.id)
        service.reply(ref, "Slack #oncall")
        waitFor("reply") { service.threadFor(ref)?.comments?.size == 2 }
        service.setResolved(ref, true)
        waitFor("resolve") { service.threadFor(ref)?.resolved == true }

        val stored = agentThreads().map { it.asJsonObject }.first { it.toString().contains(created.id) }
        assertTrue(stored.toString(), stored.toString().contains("연락 수단을 적어 주세요."))
        assertTrue(stored.toString(), stored.toString().contains("Slack #oncall"))
        assertTrue(stored.toString(), stored.toString().contains("롤백은 온콜에게"))
        assertTrue(stored.toString(), stored.toString().contains("resolved"))

        // AC-03: a reply the agent appends from outside the IDE appears without pressing Reload.
        val body = Files.createTempFile("reply", ".txt").also { Files.writeString(it, "운영 직전 승인 후 배포합니다.") }
        agent("reply", agentThread.id, "--body-file", body.toString())
        waitFor("agent reply via store polling") {
            service.threadFor(ThreadRef(root, agentThread.id))?.comments?.any { it.body == "운영 직전 승인 후 배포합니다." } == true
        }
    }

}
