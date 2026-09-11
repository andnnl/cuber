package com.cuber.trainer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * WebView 壳 Activity: 通过 WebViewAssetLoader 把 assets 映射为
 * https://appassets.androidplatform.net 同源地址 (https 语义),
 * 以支持 ES Module / fetch / WebAssembly (Cross 求解器) 在 WebView 内正常加载。
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/www/index.html?mode=crossf2l";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private BleBridge bleBridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 屏幕常亮 (训练场景方便对照操作)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        // localStorage 持久化 (打乱/预判/收纳态等偏好)
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100); // 固定字号, 随系统字体缩放会破坏布局
        // ES Module 支持 (动态 import wasm 胶水模块需要)
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        // 禁止 WebView 自身滚动/边距, 布局完全交给页面 (100vh)
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        // JS console 桥接到 logcat (tag "WebConsole"): 排查求解器加载/兼容问题无需连 Chrome
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.i("WebConsole", cm.message());
                return true;
            }
        });
        // 远程调试: chrome://inspect 可直接查看页面 console 与网络 (排查用)
        WebView.setWebContentsDebuggingEnabled(true);
        // 原生 BLE 桥 (蓝牙魔方训练): 页面仅来自本地 assets, 接口收窄为 5 个方法
        bleBridge = new BleBridge(this, webView);
        webView.addJavascriptInterface(bleBridge, "__bleNative");
        webView.loadUrl(START_URL);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == BleBridge.REQ_PERMISSIONS && bleBridge != null) {
            boolean granted = grantResults.length > 0;
            for (int r : grantResults) {
                granted = granted && r == android.content.pm.PackageManager.PERMISSION_GRANTED;
            }
            bleBridge.onPermissionResult(granted);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (bleBridge != null) {
            bleBridge.onActivityResult(requestCode, resultCode);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }

    /** 沉浸式全屏: 隐藏状态栏/导航栏 (legacy API, minSdk 24 可用) */
    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
