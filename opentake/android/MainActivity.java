/* SPDX-License-Identifier: GPL-3.0-or-later */
package org.opentake.preview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int OPEN = 10;
    private static final int SAVE = 11;
    private static final int MAX_EXPORT_CHARACTERS = 32 * 1024 * 1024;
    private ValueCallback<Uri[]> openResult;
    private byte[] pendingExport;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff171620);
        getWindow().setNavigationBarColor(0xff171620);
        WebView view = new WebView(this);
        view.setBackgroundColor(0xff13131b);
        setContentView(view);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setUseWideViewPort(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setSupportMultipleWindows(false);
        view.addJavascriptInterface(new ExportBridge(), "OpenTakeAndroid");
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                return !request.isForMainFrame() || !START.equals(request.getUrl().toString());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if (!"GET".equals(request.getMethod()) || !"https".equals(url.getScheme())
                        || !HOST.equals(url.getHost()) || url.getPort() != -1
                        || path == null || !path.matches("/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*")
                        || path.contains("..")) return missing();
                try {
                    String mime = contentType(path);
                    String encoding = mime.startsWith("text/") || mime.startsWith("application/") ? "UTF-8" : null;
                    return new WebResourceResponse(mime, encoding, 200, "OK",
                        Collections.singletonMap("Content-Security-Policy",
                            "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"),
                        getAssets().open("web" + path));
                } catch (IOException ignored) {
                    return missing();
                }
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView web, ValueCallback<Uri[]> result, FileChooserParams params) {
                if (openResult != null) openResult.onReceiveValue(null);
                openResult = result;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(intent, OPEN);
                } catch (RuntimeException error) {
                    openResult = null;
                    result.onReceiveValue(null);
                    message("Could not open the Android file picker.");
                }
                return true;
            }
        });
        view.loadUrl(START);
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "text/plain";
    }

    public final class ExportBridge {
        @JavascriptInterface
        public void saveFile(String filename, String base64) {
            if (filename == null || base64 == null || base64.length() > MAX_EXPORT_CHARACTERS
                    || !filename.matches("(?is).+\\.(otake|csv|ale)")) {
                runOnUiThread(() -> message("This export format or size is unavailable."));
                return;
            }
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException ignored) {
                runOnUiThread(() -> message("Could not read the export."));
                return;
            }
            runOnUiThread(() -> {
                if (pendingExport != null) return;
                pendingExport = bytes;
                String name = filename.replaceAll("[\\p{Cntrl}/\\\\]", "_");
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(intent, SAVE);
                } catch (RuntimeException error) {
                    pendingExport = null;
                    message("Could not open the Android save picker.");
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (request == OPEN && openResult != null) {
            openResult.onReceiveValue(uri == null ? null : new Uri[]{uri});
            openResult = null;
        } else if (request == SAVE) {
            byte[] bytes = pendingExport;
            pendingExport = null;
            if (uri == null || bytes == null) return;
            new Thread(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "w")) {
                    if (stream == null) throw new IOException("No output stream");
                    stream.write(bytes);
                } catch (IOException | SecurityException error) {
                    runOnUiThread(() -> message("Export failed. Try choosing another location."));
                    return;
                }
                runOnUiThread(() -> message("Export saved."));
            }).start();
        }
    }

    private void message(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }
}
