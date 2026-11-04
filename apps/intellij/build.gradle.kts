import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.4.21"
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "dev.insung"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        local(providers.gradleProperty("localIdePath"))
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")
}

// IntelliJ 2026.3 runs on Java 25 (product-info.json minRequiredJavaVersion).
kotlin {
    jvmToolchain(25)
}

intellijPlatform {
    buildSearchableOptions = false
    instrumentCode = false
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "263"
            untilBuild = provider { null }
        }
    }
}

// The bridge runs the shared TypeScript store (packages/core, packages/jsonl-store) under Node.
val buildBridge by tasks.registering(Exec::class) {
    workingDir = projectDir
    commandLine("npm", "run", "build")
    inputs.dir("bridge/src")
    inputs.dir("../../packages/core/src")
    inputs.dir("../../packages/jsonl-store/src")
    outputs.file("build/bridge/bridge.cjs")
}

tasks.processResources {
    from(buildBridge) { into("bridge") }
}
