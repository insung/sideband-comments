package dev.insung.sideband

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.util.EnvironmentUtil
import java.io.BufferedWriter
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class BridgeException(message: String) : RuntimeException(message)

/**
 * Runs `bridge.cjs` under Node and exchanges one JSON object per line.
 * All `.comments` reads and writes go through it, so the store logic stays the shared TypeScript code.
 */
@Service(Service.Level.APP)
class BridgeClient : Disposable {
    private val log = logger<BridgeClient>()
    private val gson = Gson()
    private val ids = AtomicLong()
    private val pending = ConcurrentHashMap<Long, CompletableFuture<JsonObject>>()
    private var process: Process? = null
    private var writer: BufferedWriter? = null

    fun call(type: String, fields: Map<String, Any?>): JsonElement {
        val id = ids.incrementAndGet()
        val request = JsonObject()
        request.addProperty("id", id)
        request.addProperty("type", type)
        fields.forEach { (key, value) -> if (value != null) request.add(key, gson.toJsonTree(value)) }
        val future = CompletableFuture<JsonObject>()
        pending[id] = future
        try {
            synchronized(this) {
                val out = ensureStarted()
                out.write(request.toString())
                out.newLine()
                out.flush()
            }
            val response = future.get(30, TimeUnit.SECONDS)
            if (response.get("ok")?.asBoolean == true) return response.get("result")
            throw BridgeException(response.get("error")?.asString ?: "Sideband bridge failed.")
        } catch (error: ExecutionException) {
            throw BridgeException(error.cause?.message ?: "Sideband bridge stopped.")
        } catch (error: java.util.concurrent.TimeoutException) {
            restart()
            throw BridgeException("Sideband bridge did not answer within 30 seconds.")
        } catch (error: java.io.IOException) {
            restart()
            throw BridgeException("Sideband bridge stopped: ${error.message}")
        } finally {
            pending.remove(id)
        }
    }

    fun <T> call(type: String, fields: Map<String, Any?>, result: Class<T>): T = gson.fromJson(call(type, fields), result)

    @Synchronized
    fun restart() {
        process?.destroy()
        process = null
        writer = null
    }

    @Synchronized
    private fun ensureStarted(): BufferedWriter {
        val running = process
        if (running != null && running.isAlive) return writer!!
        val node = findNode()
            ?: throw BridgeException("Node.js was not found. Set its path in Settings | Tools | Sideband Comments.")
        val started = ProcessBuilder(node, bridgeScript().toString()).start()
        process = started
        writer = started.outputStream.bufferedWriter(StandardCharsets.UTF_8)
        Thread({ readResponses(started) }, "Sideband bridge reader").apply { isDaemon = true }.start()
        Thread({ started.errorStream.bufferedReader().forEachLine { log.warn("bridge: $it") } }, "Sideband bridge stderr")
            .apply { isDaemon = true }.start()
        return writer!!
    }

    private fun readResponses(started: Process) {
        try {
            started.inputStream.bufferedReader(StandardCharsets.UTF_8).forEachLine { line ->
                val response = runCatching { JsonParser.parseString(line).asJsonObject }.getOrNull() ?: return@forEachLine
                val id = response.get("id")?.takeIf { !it.isJsonNull }?.asLong ?: return@forEachLine
                pending[id]?.complete(response)
            }
        } finally {
            val failure = BridgeException("Sideband bridge stopped (exit ${runCatching { started.waitFor(); started.exitValue() }.getOrNull()}).")
            pending.values.forEach { it.completeExceptionally(failure) }
        }
    }

    private fun findNode(): String? {
        val configured = SidebandSettings.get().state.nodePath?.trim().orEmpty()
        if (configured.isNotEmpty()) return configured.takeIf { File(it).canExecute() }
        // GUI apps on macOS start with a short PATH, so check the usual install locations first.
        val candidates = listOf("/opt/homebrew/bin/node", "/usr/local/bin/node")
        return candidates.firstOrNull { File(it).canExecute() }
            ?: EnvironmentUtil.getValue("PATH").orEmpty().split(File.pathSeparator)
                .map { File(it, "node") }.firstOrNull { it.canExecute() }?.absolutePath
    }

    /** Copies the bundled script to the IDE system directory; the file name carries its hash so updates never reuse a stale copy. */
    private fun bridgeScript(): Path {
        val bytes = javaClass.getResourceAsStream("/bridge/bridge.cjs")?.use { it.readBytes() }
            ?: throw BridgeException("The plugin package is missing bridge/bridge.cjs. Rebuild the plugin.")
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }.take(12)
        val target = Path.of(PathManager.getSystemPath(), "sideband-comments", "bridge-$hash.cjs")
        if (!Files.exists(target)) {
            Files.createDirectories(target.parent)
            val temporary = Files.createTempFile(target.parent, "bridge", ".tmp")
            Files.write(temporary, bytes)
            Files.move(temporary, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        }
        return target
    }

    override fun dispose() = restart()
}
