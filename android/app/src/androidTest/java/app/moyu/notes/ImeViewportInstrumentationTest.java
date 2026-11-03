package app.moyu.notes;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Insets;
import android.os.Build;
import android.view.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class ImeViewportInstrumentationTest {
    @Test public void bothHostsConsumeImeInsetsAndPublishTheSameGeometryContract() throws Exception {
        assumeTrue(Build.VERSION.SDK_INT>=30);
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            long deadline=System.currentTimeMillis()+10000;
            while(activity.rootView.getHeight()==0&&System.currentTimeMillis()<deadline)Thread.sleep(50);
            instrumentation.runOnMainSync(()->{
                assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING,activity.getWindow().getAttributes().softInputMode&WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
                View browser=activity.rootView.getChildAt(0);assertTrue(browser.getHeight()>0);
                int bottomPadding=activity.rootView.getPaddingBottom(),occlusion=Math.min(600,browser.getHeight()/2);
                WindowInsets initial=activity.rootView.getRootWindowInsets();assertNotNull(initial);
                WindowInsets result=activity.getWindow().getDecorView().dispatchApplyWindowInsets(new WindowInsets.Builder(initial).setInsets(WindowInsets.Type.ime(),Insets.of(0,0,0,occlusion)).setVisible(WindowInsets.Type.ime(),true).build());
                assertFalse(result.isVisible(WindowInsets.Type.ime()));assertEquals(0,result.getInsets(WindowInsets.Type.ime()).bottom);
                assertEquals(bottomPadding,activity.rootView.getPaddingBottom());
                try{activity.dispatchPicker("feature",new org.json.JSONArray().put("mobile.viewport"),(value,error)->{
                    assertNull(error);assertTrue(value instanceof JSONObject);JSONObject state=(JSONObject)value;
                    assertEquals(browser.getWidth(),state.optInt("width"));assertEquals(browser.getHeight(),state.optInt("height"));
                    assertTrue(state.optBoolean("visible"));assertTrue(state.optInt("bottom")<state.optInt("height"));assertTrue(state.optInt("bottom")>=0);
                });}catch(Exception error){throw new AssertionError(error);}
            });
        }finally{instrumentation.runOnMainSync(activity::finish);}
    }
}
