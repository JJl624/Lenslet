package app.moyu.notes;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class HighRefreshRateInstrumentationTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity start(){return (MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
    private void verify(MainActivity activity){
        WindowManager.LayoutParams attributes=activity.getWindow().getAttributes();
        assertEquals("Keep the system's per-app refresh selector available",0,attributes.preferredRefreshRate,0);
        assertEquals("Never select a physical display mode",0,attributes.preferredDisplayModeId);
        if(Build.VERSION.SDK_INT>=35){assertFalse(activity.getWindow().isFrameRatePowerSavingsBalanced());assertTrue(activity.getWindow().getFrameRateBoostOnTouchEnabled());}
    }
    @Test public void startupFocusChangesAndNewWindowsDoNotDeclareAFixedAppRate(){
        for(int launch=0;launch<2;launch++){
            MainActivity activity=start();
            try{instrumentation.runOnMainSync(()->{verify(activity);activity.onWindowFocusChanged(false);activity.onWindowFocusChanged(true);verify(activity);});}
            finally{instrumentation.runOnMainSync(activity::finish);instrumentation.waitForIdleSync();}
        }
    }
    @Test public void theThemeOptsOutBeforeBrowserCreation(){
        MainActivity activity=start();
        try{instrumentation.runOnMainSync(()->{
            if(Build.VERSION.SDK_INT>=35){android.content.res.TypedArray values=activity.obtainStyledAttributes(new int[]{android.R.attr.windowIsFrameRatePowerSavingsBalanced});try{assertFalse(values.getBoolean(0,true));}finally{values.recycle();}}
            verify(activity);
        });}finally{instrumentation.runOnMainSync(activity::finish);}
    }
}
