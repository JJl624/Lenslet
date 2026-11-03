package app.moyu.notes;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.webkit.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.io.*;
import java.util.*;

final class BrowserFactory {
    static BrowserHost create(MainActivity activity) { return new SystemBrowserHost(activity); }
}
final class SystemBrowserHost implements BrowserHost {
    private static final String ORIGIN=MainActivity.ORIGIN;
    private final MainActivity activity;
    private final WebView web;
    private boolean closed;
    SystemBrowserHost(MainActivity activity) { this.activity=activity;web=new WebView(activity); }
    public View view(){return web;}
    public void start(){
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);settings.setBuiltInZoomControls(false);settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(activity)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){if(!closed)activity.viewportLoading();}
            @Override public void onPageFinished(WebView view,String url){if(!closed)activity.viewportReady();}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){if(!closed)activity.browserUnavailable(SystemBrowserHost.this);return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(ORIGIN.equals(uri.getScheme()+"://"+uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/vault/")) {
                    try{activity.bridge.initialize();String path=uri.getPath().substring(7);InputStream stream=activity.bridge.vault.open(path);String type=VaultStore.mime(path);if(type.equals("text/html")||type.contains("javascript"))type="text/plain";return new WebResourceResponse(type,null,200,"OK",Collections.singletonMap("Content-Security-Policy","default-src 'none'; sandbox"),stream);}
                    catch(Exception error){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
                }
                return loader.shouldInterceptRequest(uri);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String url=request.getUrl().toString();
                if(request.isForMainFrame()) {if(url.startsWith(ORIGIN+"/assets/web/"))return false;activity.openExternal(url);return true;}
                return false;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(!closed&&request.isForMainFrame())activity.showStartupError("页面未能加载，请重启应用。文档仍保存在原位置。");}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(activity).setMessage(message).setPositiveButton("确定",(dialog,which)->result.confirm()).setNegativeButton("取消",(dialog,which)->result.cancel()).setOnCancelListener(dialog->result.cancel()).show();return true;}
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(activity).setMessage(message).setPositiveButton("确定",(dialog,which)->result.confirm()).setOnCancelListener(dialog->result.confirm()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams parameters){try{Intent intent=parameters.createIntent();activity.launch(intent,(result,data)->callback.onReceiveValue(FileChooserParams.parseResult(result,data)),callback::onReceiveValue);}catch(Exception error){callback.onReceiveValue(null);}return true;}
        });
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){activity.showStartupError("请先更新 Android System WebView，再打开墨屿。");return;}
        WebViewCompat.addWebMessageListener(web,"MoyuNative",Collections.singleton(ORIGIN),(view,message,source,isMainFrame,reply)->{if(isMainFrame&&"https".equals(source.getScheme())&&"appassets.androidplatform.net".equals(source.getHost())&&(source.getPort()==-1||source.getPort()==443))activity.bridge.request(message.getData(),reply::postMessage);});

        web.loadUrl(ORIGIN+"/assets/web/mobile.html");
    }
    public void event(String name,Object detail){try{String options=new JSONObject().put("detail",detail==null?JSONObject.NULL:detail).toString();web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+","+options+"))",null);}catch(org.json.JSONException ignored){}}
    public void blur(){web.evaluateJavascript("document.activeElement?.blur()",null);}
    public void resume(){web.onResume();}
    public void pause(){web.onPause();}
    public void inspect(String expression,java.util.function.Consumer<String> reply){if(BuildConfig.DEBUG)web.evaluateJavascript(expression,reply::accept);}
    public void publishViewport(JSONObject value,Runnable delivered){web.evaluateJavascript("window.__moyuNativeViewport="+value+";window.dispatchEvent(new CustomEvent('moyu-mobile-viewport',{detail:window.__moyuNativeViewport}))",ignored->delivered.run());}
    public void close(){closed=true;web.removeAllViews();web.destroy();}
}
