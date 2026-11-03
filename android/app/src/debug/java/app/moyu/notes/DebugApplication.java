package app.moyu.notes;

import android.app.*;
import android.content.*;
import android.os.*;
import java.util.IdentityHashMap;
import java.util.Map;

/** Test-only evaluation without bringing the Activity forward or disturbing its IME. */
public final class DebugApplication extends Application {
    @Override public void onCreate(){
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
            final Map<Activity,BroadcastReceiver> receivers=new IdentityHashMap<>();
            public void onActivityCreated(Activity activity,Bundle state){
                if(!(activity instanceof MainActivity))return;
                BroadcastReceiver receiver=new BroadcastReceiver(){
                    @Override public void onReceive(Context context,Intent intent){
                        ((MainActivity)activity).onNewIntent(new Intent(intent).setAction("app.moyu.GECKO_TEST"));
                    }
                };
                IntentFilter filter=new IntentFilter(BuildConfig.APPLICATION_ID+".QA_EVAL");
                if(Build.VERSION.SDK_INT>=33)activity.registerReceiver(receiver,filter,Context.RECEIVER_EXPORTED);else activity.registerReceiver(receiver,filter);
                receivers.put(activity,receiver);
            }
            public void onActivityDestroyed(Activity activity){BroadcastReceiver receiver=receivers.remove(activity);if(receiver!=null)activity.unregisterReceiver(receiver);}
            public void onActivityStarted(Activity activity){}
            public void onActivityResumed(Activity activity){}
            public void onActivityPaused(Activity activity){}
            public void onActivityStopped(Activity activity){}
            public void onActivitySaveInstanceState(Activity activity,Bundle state){}
        });
    }
}
