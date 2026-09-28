import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 与 app/devin-mobile-android 同一套固定签名：keystore 由 blueprint 从
// org secret 重建到 ~/.devin-mobile-signing.keystore + .properties；
// 文件不存在时回退默认 debug 签名。
val signingProps = Properties().apply {
    val f = File(System.getProperty("user.home"), ".devin-mobile-signing.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}
val signingKeystore = File(System.getProperty("user.home"), ".devin-mobile-signing.keystore")
val hasPersistentSigning = signingKeystore.isFile &&
    !signingProps.getProperty("storePassword").isNullOrEmpty() &&
    !signingProps.getProperty("keyPassword").isNullOrEmpty()

android {
    namespace = "com.nancy.playground"
    compileSdk = 34

    if (hasPersistentSigning) {
        signingConfigs {
            create("persistent") {
                storeFile = signingKeystore
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias", "devinmobile")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    defaultConfig {
        applicationId = "com.nancy.playground"
        minSdk = 24
        targetSdk = 34
        versionCode = 138
        versionName = "2.29"
        // 云端曲库上传 token：构建时从环境变量注入（secret GITLAB_PAT），
        // 不入库；没配则 app 内隐藏上传入口
        val tk = providers.environmentVariable("GITLAB_PAT").getOrElse("")
            .replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "GITLAB_TOKEN", "\"$tk\"")
    }

    buildTypes {
        debug {
            // 直接发布的就是 debug 包：关 debuggable 让混淆+资源压缩真正生效
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (hasPersistentSigning) signingConfig = signingConfigs.getByName("persistent")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (hasPersistentSigning) signingConfig = signingConfigs.getByName("persistent")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    aaptOptions {
        // BGM 走 assets.openFd()，不能压缩
        noCompress("mp3", "ogg", "m4a", "wav")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        named("main") {
            assets.srcDir(layout.buildDirectory.dir("gameAssets"))
        }
    }
}

// 合集资源：playground/<game>/index.html → assets/games/<name>/index.html，
// 另生成 games.js（launcher 渲染游戏卡片）和 music.js（assets/music/*.mp3 曲库清单）。
val syncGameAssets = tasks.register("syncGameAssets") {
    val playgroundDir = rootProject.file("..")   // playground/
    val outDir = layout.buildDirectory.dir("gameAssets")
    val out = outDir.get().asFile
    doLast {
        val gamesDir = File(out, "games")
        gamesDir.deleteRecursively()
        val entries = mutableListOf<String>()
        playgroundDir.listFiles()
            ?.filter { it.isDirectory && it.name != "android" && it.name != "dist" }
            ?.sortedBy { it.name }
            ?.forEach { dir ->
                val html = File(dir, "index.html")
                if (!html.isFile) return@forEach
                val target = File(gamesDir, dir.name)
                target.mkdirs()
                // 游戏目录全量拷贝（index.html + assets/ 等），README 除外
                dir.walkTopDown().filter { it.isFile && it.name != "README.md" }
                    .forEach { f ->
                        val rel = f.relativeTo(dir)
                        File(target, rel.path).apply { parentFile?.mkdirs() }
                        f.copyTo(File(target, rel.path), overwrite = true)
                    }
                // README 首个 `# ` 标题作为卡片名，否则用目录名
                val title = File(dir, "README.md").takeIf { it.isFile }
                    ?.useLines { lines -> lines.firstOrNull { it.startsWith("# ") }?.removePrefix("# ")?.trim() }
                    ?: dir.name
                entries += """{"id":"${dir.name}","title":"${title.replace("\"", "\\\"")}"}"""
            }
        File(out, "games.js").writeText("window.GAMES=[${entries.joinToString(",")}];\n")

        // 共享 BGM 池：playground/bgm/ → assets/bgm/，各游戏用相对路径调用，不重复打包
        val bgmOut = File(out, "bgm")
        bgmOut.deleteRecursively(); bgmOut.mkdirs()
        File(playgroundDir, "bgm").listFiles()
            ?.filter { it.isFile }
            ?.forEach { it.copyTo(File(bgmOut, it.name), overwrite = true) }

        val musicDir = File("$playgroundDir/android/app/src/main/assets/music")
        val tracks = musicDir.listFiles()
            ?.filter { it.extension.lowercase() in setOf("mp3", "ogg", "m4a", "wav") }
            ?.sortedBy { it.name }
            ?.joinToString(",") { "\"${it.name}\"" } ?: ""
        File(out, "music.js").writeText("window.MUSIC=[$tracks];\n")
    }
}
tasks.named("preBuild") { dependsOn(syncGameAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.10.0")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
}
