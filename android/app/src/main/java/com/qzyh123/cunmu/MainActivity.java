package com.qzyh123.cunmu;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlbumPlugin.class);   // 存成一张长图 → the photo library
        super.onCreate(savedInstanceState);
        // r18 the page draws its own scroll indicator (PageRail); the WebView's system bars would double it
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        }
    }
}
