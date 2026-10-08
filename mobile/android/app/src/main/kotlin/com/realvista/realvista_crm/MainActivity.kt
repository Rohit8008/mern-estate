package com.realvista.realvista_crm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
// local_auth needs a FragmentActivity host (its BiometricPrompt is a fragment),
// so this extends FlutterFragmentActivity rather than the default FlutterActivity.
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity: FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 8+ shows a notification only through a channel. High importance
        // so a push appears as a heads-up banner with sound, not silently in the
        // shade. Creating an existing channel is a no-op.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "realvista_default",
                "Real Vista notifications",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Leads, tasks, messages and other updates" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
