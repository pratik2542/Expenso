package com.prtk.expenso;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View rootView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());

            if (getBridge() != null && getBridge().getWebView() != null) {
                String js = "(function(){" +
                        "var root=document.documentElement;" +
                        "root.style.setProperty('--native-safe-top','" + systemBars.top + "px');" +
                        "root.style.setProperty('--native-safe-right','" + systemBars.right + "px');" +
                        "root.style.setProperty('--native-safe-bottom','" + systemBars.bottom + "px');" +
                        "root.style.setProperty('--native-safe-left','" + systemBars.left + "px');" +
                        "})();";

                getBridge().getWebView().evaluateJavascript(js, null);
            }

            return windowInsets;
        });
        ViewCompat.requestApplyInsets(rootView);

        registerPlugin(GoogleAuth.class);
    }
}
