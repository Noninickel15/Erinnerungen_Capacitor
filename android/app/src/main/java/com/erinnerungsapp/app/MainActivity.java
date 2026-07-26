package com.erinnerungsapp.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // App-Shortcuts feuern nur über onNewIntent. Beim Kaltstart
        // kommt der Intent in onCreate – daher hier einmal weiterreichen.
        if (savedInstanceState == null) {
            Intent intent = getIntent();
            if (intent != null
                    && Intent.ACTION_VIEW.equals(intent.getAction())
                    && intent.getStringExtra("shortcutId") != null) {
                onNewIntent(intent);
            }
        }
    }
}
