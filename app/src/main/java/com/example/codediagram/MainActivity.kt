package com.example.codediagram

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.example.codediagram.ui.theme.CodeDiagramTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CodeDiagramTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    CodeDiagramWebView(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    )
                }
            }
        }
    }
}

@Composable
fun CodeDiagramWebView(modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                // 에뮬레이터에서 호스트 머신의 localhost에 접근
                loadUrl("http://10.0.2.2:3000")
            }
        }
    )
}
