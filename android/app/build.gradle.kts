plugins {
    id("com.android.application")
}

android {
    namespace = "com.cuber.trainer"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.cuber.trainer"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
    }

    // 纯 WebView 壳, 无混淆必要, 关闭以加速构建
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            // 用 debug 签名, 便于直接安装 (个人使用)
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // WebViewAssetLoader: 把 assets 映射为 https 同源,
    // 根治 file:// 下 ES Module / fetch / WebAssembly 加载限制
    implementation("androidx.webkit:webkit:1.12.1")
}
