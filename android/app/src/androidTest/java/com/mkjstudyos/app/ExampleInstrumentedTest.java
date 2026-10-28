package com.mkjstudyos.app;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented smoke test (`./gradlew connectedAndroidTest`, needs a device/emulator).
 *
 * The generated template asserted the placeholder Capacitor package name, which fails on
 * a renamed app. The assertion now matches the real applicationId.
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.mkjstudyos.app", appContext.getPackageName());
    }
}
