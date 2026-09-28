import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val signingProps = Properties().apply {
    val f = File(System.getProperty("user.home"), ".devin-mobile-signing.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}
val signingKeystore = File(System.getProperty("user.home"), ".devin-mobile-signing.keystore")
val hasPersistentSigning = signingKeystore.isFile &&
    !signingProps.getProperty("storePassword").isNullOrEmpty() &&
    !signingProps.getProperty("keyPassword").isNullOrEmpty()

android {
    namespace = "com.nancy.devinmobile"
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
        applicationId = "com.nancy.devinmobile"
        minSdk = 24
        targetSdk = 34
        versionCode = 167
        versionName = "3.54"
    }

    buildTypes {
        debug {
            // 有固定 keystore 时用其签名，保证不同机器构建的 APK 可互相覆盖安装；
            // 没有则回退到默认 debug 签名。
            if (hasPersistentSigning) signingConfig = signingConfigs.getByName("persistent")
            // 发布渠道发的是 debug 包——开 R8 + 资源裁剪减小体积
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.android.material:material:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil:2.6.0")
}
