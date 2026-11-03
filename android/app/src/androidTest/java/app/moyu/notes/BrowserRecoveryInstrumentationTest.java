package app.moyu.notes;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.os.Build;
import android.util.TypedValue;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.TimeUnit;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BrowserRecoveryInstrumentationTest {
    private void awaitFrontend(MainActivity activity,Instrumentation instrumentation) throws Exception {
        Field cover=MainActivity.class.getDeclaredField("pageCover");cover.setAccessible(true);
        java.util.concurrent.atomic.AtomicBoolean ready=new java.util.concurrent.atomic.AtomicBoolean();
        long deadline=android.os.SystemClock.uptimeMillis()+90000;
        do{
            instrumentation.runOnMainSync(()->{try{ready.set(cover.get(activity)==null);}catch(IllegalAccessException error){throw new AssertionError(error);}});
            if(ready.get())return;
            android.os.SystemClock.sleep(100);
        }while(android.os.SystemClock.uptimeMillis()<deadline);
        fail("The frontend did not finish loading through the native bridge");
    }
    @Test public void aLostBackgroundBrowserRestartsOnResumeWithoutReplacingStorageOrSavingDrafts() throws Exception {
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Field field=MainActivity.class.getDeclaredField("browser");field.setAccessible(true);
        BrowserHost original=(BrowserHost)field.get(activity);NativeBridge storage=activity.bridge;
        String path="recovery-"+System.nanoTime()+".md";
        try{
            storage.io.submit(()->{try{storage.initialize();storage.invoke("create",new JSONArray().put(path).put("file").put("saved"));storage.invoke("feature",new JSONArray().put("mobile.draft").put(new JSONObject().put("root","internal").put("path",path).put("content","unsaved").put("version",((JSONObject)storage.invoke("read",new JSONArray().put(path))).getString("version"))));}catch(Exception error){throw new RuntimeException(error);}}).get(30,TimeUnit.SECONDS);
            awaitFrontend(activity,instrumentation);
            instrumentation.runOnMainSync(()->{instrumentation.callActivityOnPause(activity);
                if(original.view() instanceof android.webkit.WebView){android.webkit.WebView web=(android.webkit.WebView)original.view();assertTrue(web.getWebViewClient().onRenderProcessGone(web,new android.webkit.RenderProcessGoneDetail(){public boolean didCrash(){return false;}public int rendererPriorityAtExit(){return android.webkit.WebView.RENDERER_PRIORITY_BOUND;}}));}
                else try{Field sessionField=original.getClass().getDeclaredField("session");sessionField.setAccessible(true);Object session=sessionField.get(original);Object delegate=session.getClass().getMethod("getContentDelegate").invoke(session);java.lang.reflect.Method killed=delegate.getClass().getMethod("onKill",session.getClass());killed.setAccessible(true);killed.invoke(delegate,session);}catch(Exception error){throw new AssertionError(error);}
            });
            instrumentation.waitForIdleSync();assertSame(original,field.get(activity));
            instrumentation.runOnMainSync(()->instrumentation.callActivityOnResume(activity));
            instrumentation.waitForIdleSync();assertNotSame(original,field.get(activity));assertSame(storage,activity.bridge);
            awaitFrontend(activity,instrumentation);
            storage.io.submit(()->{try{assertEquals("saved",((JSONObject)storage.invoke("read",new JSONArray().put(path))).getString("content"));JSONArray drafts=(JSONArray)storage.invoke("feature",new JSONArray().put("mobile.drafts"));boolean found=false;for(int i=0;i<drafts.length();i++){JSONObject draft=drafts.getJSONObject(i);if(path.equals(draft.optString("path"))){assertEquals("unsaved",draft.getString("content"));found=true;}}assertTrue(found);}catch(Exception error){throw new RuntimeException(error);}}).get(30,TimeUnit.SECONDS);
        }finally{
            storage.io.submit(()->{try{storage.invoke("feature",new JSONArray().put("mobile.draft-clear").put(new JSONObject().put("root","internal").put("path",path)));storage.invoke("trash",new JSONArray().put(path));}catch(Exception error){throw new RuntimeException(error);}}).get(30,TimeUnit.SECONDS);
            instrumentation.runOnMainSync(activity::finish);
        }
    }
    @Test public void launcherAndSplashUseSeparateMaskSafeDrawables(){
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getDrawable(R.mipmap.ic_launcher) instanceof AdaptiveIconDrawable);
        if(Build.VERSION.SDK_INT>=31){android.content.res.Resources.Theme theme=context.getResources().newTheme();theme.applyStyle(R.style.AppTheme,true);TypedValue value=new TypedValue();assertTrue(theme.resolveAttribute(android.R.attr.windowSplashScreenAnimatedIcon,value,true));assertEquals(R.drawable.ic_splash,value.resourceId);}
        android.graphics.Bitmap image=android.graphics.Bitmap.createBitmap(288,288,android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.drawable.Drawable logo=context.getDrawable(R.drawable.ic_splash);logo.setBounds(0,0,288,288);logo.draw(new android.graphics.Canvas(image));
        int painted=0;for(int y=0;y<288;y++)for(int x=0;x<288;x++)if(android.graphics.Color.alpha(image.getPixel(x,y))>0){painted++;assertTrue("Splash artwork exceeds the system's circular safe area",Math.hypot(x-143.5,y-143.5)<=96);}
        assertTrue(painted>1000);image.recycle();
    }
}
