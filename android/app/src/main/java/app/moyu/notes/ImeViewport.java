package app.moyu.notes;

import android.graphics.Insets;
import android.view.*;
import org.json.JSONObject;
import java.util.List;
import java.util.function.Consumer;

/** One IME geometry and animation policy for both browser hosts. */
final class ImeViewport {
    private final View root;
    private final View web;
    private final BrowserHost browser;
    private final View decor;
    private final Consumer<Boolean> visibility;
    private boolean closed,ready,sending,animating,visible;
    private int currentInset,startInset,targetInset,animationId,sequence;
    private float fraction=1;
    private String phase="layout";
    private JSONObject pending,snapshot;
    private int deliveryGeneration;
    private final View.OnAttachStateChangeListener attached;
    private final View.OnLayoutChangeListener layout=(v,l,t,r,b,ol,ot,or,ob)->publish("layout");
    private WindowInsetsAnimation activeAnimation;

    @android.annotation.TargetApi(30)
    ImeViewport(View root,BrowserHost browser,Window window,Consumer<Boolean> visibility){
        this.root=root;this.browser=browser;this.web=browser.view();this.decor=window.getDecorView();this.visibility=visibility;
        window.setDecorFitsSystemWindows(false);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        View.OnApplyWindowInsetsListener apply=(view,insets)->{
            Insets bars=insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            root.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            targetInset=insets.getInsets(WindowInsets.Type.ime()).bottom;
            visible=insets.isVisible(WindowInsets.Type.ime());visibility.accept(visible);
            if(!animating){currentInset=startInset=targetInset;fraction=1;publish("layout");}
            // The page receives the measured occlusion below. Do not also let
            // browser apply its own IME viewport resize or caret pan.
            return view.onApplyWindowInsets(withoutIme(insets));
        };
        // A browser may install its own DecorView listener while attaching.
        // The Activity owns IME layout, so claim raw insets after that attach.
        attached=new View.OnAttachStateChangeListener(){
            @Override public void onViewAttachedToWindow(View view){decor.setOnApplyWindowInsetsListener(apply);decor.requestApplyInsets();}
            @Override public void onViewDetachedFromWindow(View view){}
        };
        decor.setOnApplyWindowInsetsListener(apply);web.addOnAttachStateChangeListener(attached);
        decor.setWindowInsetsAnimationCallback(new WindowInsetsAnimation.Callback(WindowInsetsAnimation.Callback.DISPATCH_MODE_STOP){
            @Override public void onPrepare(WindowInsetsAnimation animation){
                if((animation.getTypeMask()&WindowInsets.Type.ime())==0)return;
                activeAnimation=animation;animationId++;animating=true;startInset=currentInset;fraction=0;publish("prepare");
            }
            @Override public WindowInsetsAnimation.Bounds onStart(WindowInsetsAnimation animation,WindowInsetsAnimation.Bounds bounds){
                if(animation==activeAnimation)publish("start");return bounds;
            }
            @Override public WindowInsets onProgress(WindowInsets insets,List<WindowInsetsAnimation> animations){
                if(activeAnimation!=null&&animations.contains(activeAnimation)){
                    currentInset=insets.getInsets(WindowInsets.Type.ime()).bottom;
                    fraction=Math.max(0,Math.min(1,activeAnimation.getInterpolatedFraction()));publish("progress");
                }
                return withoutIme(insets);
            }
            @Override public void onEnd(WindowInsetsAnimation animation){
                if(animation!=activeAnimation)return;
                activeAnimation=null;animating=false;currentInset=targetInset;fraction=1;publish("end");
            }
        });
        web.addOnLayoutChangeListener(layout);
        decor.requestApplyInsets();
    }
    @android.annotation.TargetApi(30)
    private static WindowInsets withoutIme(WindowInsets insets){
        return new WindowInsets.Builder(insets).setInsets(WindowInsets.Type.ime(),Insets.NONE).setVisible(WindowInsets.Type.ime(),false).build();
    }
    static int visibleBottom(int webHeight,int webTop,int windowBottom,int imeBottom){
        return Math.max(0,Math.min(webHeight,windowBottom-imeBottom-webTop));
    }
    private int bottom(int inset){
        int[] location=new int[2],window=new int[2];web.getLocationOnScreen(location);decor.getLocationOnScreen(window);
        return visibleBottom(web.getHeight(),location[1],window[1]+decor.getHeight(),inset);
    }
    private void publish(String nextPhase){
        if(closed||web.getWidth()<=0||web.getHeight()<=0)return;
        // A layout notification must not turn an in-flight IME animation into
        // an unrelated layout event (for example on display-density changes).
        if(!nextPhase.equals("layout")||!animating)phase=nextPhase;
        try{
            snapshot=new JSONObject().put("sequence",++sequence).put("animation",animationId).put("phase",phase)
                .put("width",web.getWidth()).put("height",web.getHeight()).put("bottom",bottom(currentInset))
                .put("startBottom",bottom(startInset)).put("targetBottom",bottom(targetInset))
                .put("visible",visible).put("animating",animating).put("progress",fraction);
            pending=snapshot;flush();
        }catch(org.json.JSONException error){throw new IllegalStateException(error);}
    }
    private void flush(){
        if(closed||!ready||sending||pending==null)return;
        JSONObject value=pending;pending=null;sending=true;int generation=deliveryGeneration;
        browser.publishViewport(value,()->{if(generation!=deliveryGeneration)return;sending=false;flush();});
    }
    void loading(){ready=false;sending=false;deliveryGeneration++;}
    void ready(){ready=true;sending=false;deliveryGeneration++;publish("layout");}
    JSONObject snapshot(){return snapshot;}
    @android.annotation.TargetApi(30)
    void close(){closed=true;ready=false;pending=null;deliveryGeneration++;web.removeOnLayoutChangeListener(layout);web.removeOnAttachStateChangeListener(attached);decor.setWindowInsetsAnimationCallback(null);decor.setOnApplyWindowInsetsListener(null);}
}
