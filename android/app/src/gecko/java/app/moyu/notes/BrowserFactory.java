package app.moyu.notes;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.view.*;
import org.json.*;
import org.mozilla.geckoview.*;
import java.io.*;
import java.util.*;

final class BrowserFactory {
    static BrowserHost create(MainActivity activity){return new GeckoBrowserHost(activity);}
}

final class GeckoBrowserHost implements BrowserHost {
    private static GeckoRuntime runtime;
    private final MainActivity activity;
    private final GeckoView view;
    private final GeckoSession session=new GeckoSession();
    private final List<JSONObject> waiting=new ArrayList<>(),waitingTests=new ArrayList<>();
    private final Map<String,java.util.function.Consumer<String>> inspections=new HashMap<>();
    private LocalAssets assets;
    private WebExtension.Port port,testPort;
    private Runnable viewportDelivered;
    private int viewportSequence;
    private boolean closed;
    GeckoBrowserHost(MainActivity activity){this.activity=activity;view=new GeckoView(activity);}
    public View view(){return view;}
    public void start(){
        try{
            assets=new LocalAssets(path->{
                if(path.startsWith("vault/")){
                    activity.bridge.initialize();String file=path.substring(6),type=VaultStore.mime(file);
                    if(type.equals("text/html")||type.contains("javascript"))type="text/plain";
                    return new LocalAssets.Resource(activity.bridge.vault.open(file),type,activity.bridge.vault.byteLength(file),true);
                }
                String type=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".wasm")?"application/wasm":VaultStore.mime(path);
                return new LocalAssets.Resource(activity.getAssets().open("web/"+path),type,-1,false);
            });
            if(runtime==null)runtime=GeckoRuntime.create(activity.getApplicationContext(),new GeckoRuntimeSettings.Builder().consoleOutput(BuildConfig.DEBUG).remoteDebuggingEnabled(BuildConfig.DEBUG).inputAutoZoomEnabled(false).build());
            session.setNavigationDelegate(new GeckoSession.NavigationDelegate(){
                @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession current,LoadRequest request){
                    if(request.uri.equals(pageUri()))return GeckoResult.fromValue(AllowOrDeny.ALLOW);
                    activity.openExternal(request.uri);return GeckoResult.fromValue(AllowOrDeny.DENY);
                }
                @Override public GeckoResult<GeckoSession> onNewSession(GeckoSession current,String uri){activity.openExternal(uri);return GeckoResult.fromValue(null);}
                @Override public GeckoResult<String> onLoadError(GeckoSession current,String uri,WebRequestError error){if(!closed)activity.showStartupError("页面未能加载，请重启应用。文档仍保存在原位置。");return null;}
            });
            session.setContentDelegate(new GeckoSession.ContentDelegate(){
                @Override public void onCrash(GeckoSession current){if(!closed)activity.browserUnavailable(GeckoBrowserHost.this);}
                @Override public void onKill(GeckoSession current){if(!closed)activity.browserUnavailable(GeckoBrowserHost.this);}
                @Override public void onCloseRequest(GeckoSession current){event("moyu-mobile-back",null);}
            });
            session.setPromptDelegate(new GeckoSession.PromptDelegate(){
                @Override public GeckoResult<PromptResponse> onAlertPrompt(GeckoSession current,AlertPrompt prompt){GeckoResult<PromptResponse> result=new GeckoResult<>();new AlertDialog.Builder(activity).setMessage(prompt.message).setPositiveButton("确定",(d,w)->result.complete(prompt.dismiss())).setOnCancelListener(d->result.complete(prompt.dismiss())).show();return result;}
                @Override public GeckoResult<PromptResponse> onButtonPrompt(GeckoSession current,ButtonPrompt prompt){GeckoResult<PromptResponse> result=new GeckoResult<>();new AlertDialog.Builder(activity).setMessage(prompt.message).setPositiveButton("确定",(d,w)->result.complete(prompt.confirm(ButtonPrompt.Type.POSITIVE))).setNegativeButton("取消",(d,w)->result.complete(prompt.confirm(ButtonPrompt.Type.NEGATIVE))).setOnCancelListener(d->result.complete(prompt.dismiss())).show();return result;}
                @Override public GeckoResult<PromptResponse> onFilePrompt(GeckoSession current,FilePrompt prompt){
                    GeckoResult<PromptResponse> result=new GeckoResult<>();Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,prompt.type==FilePrompt.Type.MULTIPLE);
                    if(prompt.mimeTypes!=null&&prompt.mimeTypes.length>0)intent.putExtra(Intent.EXTRA_MIME_TYPES,prompt.mimeTypes);
                    try{activity.launch(intent,(code,data)->{if(code!=android.app.Activity.RESULT_OK||data==null){result.complete(prompt.dismiss());return;}ArrayList<Uri> uris=new ArrayList<>();if(data.getClipData()!=null)for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());else if(data.getData()!=null)uris.add(data.getData());result.complete(uris.isEmpty()?prompt.dismiss():prompt.confirm(activity,uris.toArray(new Uri[0])));},null);}catch(Exception error){result.complete(prompt.dismiss());}return result;
                }
            });
            session.open(runtime);view.setSession(session);
            runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/moyu-bridge/","native@moyu.app").accept(extension->{
                if(closed)return;
                WebExtension.MessageDelegate messages=new WebExtension.MessageDelegate(){
                    @Override public void onConnect(WebExtension.Port connected){
                        if(closed||connected.sender.session!=session||!connected.sender.isTopLevel()||!connected.sender.url.equals(pageUri())){connected.disconnect();return;}
                        if(connected.name.equals("moyu_test")&&!BuildConfig.DEBUG){connected.disconnect();return;}
                        if(connected.name.equals("moyu")){port=connected;for(JSONObject message:waiting)connected.postMessage(message);waiting.clear();}else{testPort=connected;for(JSONObject message:waitingTests)connected.postMessage(message);waitingTests.clear();}
                        connected.setDelegate(new WebExtension.PortDelegate(){
                            @Override public void onPortMessage(Object value,WebExtension.Port source){
                                if(!(value instanceof JSONObject)||closed)return;JSONObject message=(JSONObject)value;
                                if(source==testPort&&BuildConfig.DEBUG){try{int[] location=new int[2];view.getLocationOnScreen(location);message.put("bounds",new JSONObject().put("x",location[0]).put("y",location[1]).put("width",view.getWidth()).put("height",view.getHeight()));}catch(JSONException ignored){}String id=message.optString("id");java.util.function.Consumer<String> inspect=inspections.remove(id);if(inspect!=null){inspect.accept(message.optBoolean("ok")?message.optString("payload","null"):JSONObject.quote("JS_ERROR: "+message.optString("error")));return;}if(id.matches("[a-zA-Z0-9_-]{1,80}"))activity.bridge.io.execute(()->{try{VaultStore.writePrivate(new File(activity.getFilesDir(),"gecko-test/"+id+".json"),message.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception error){android.util.Log.e("MoyuGeckoTest","result",error);}});}
                                else if(source==port&&message.optBoolean("viewportReady")){activity.viewportReady();}
                                else if(source==port&&message.has("viewportAck")){if(message.optInt("viewportAck")==viewportSequence&&viewportDelivered!=null){Runnable delivered=viewportDelivered;viewportDelivered=null;delivered.run();}}
                                else if(source==port&&message.has("request"))activity.bridge.request(message.optString("request"),reply->{try{source.postMessage(new JSONObject().put("reply",reply));}catch(JSONException invalid){throw new IllegalStateException(invalid);}});
                            }
                            @Override public void onDisconnect(WebExtension.Port source){if(source==port){port=null;viewportDelivered=null;if(!closed)activity.viewportLoading();}if(source==testPort)testPort=null;}
                        });
                    }
                };
                session.getWebExtensionController().setMessageDelegate(extension,messages,"moyu");
                if(BuildConfig.DEBUG)session.getWebExtensionController().setMessageDelegate(extension,messages,"moyu_test");
                session.loadUri(pageUri());
            },error->{if(!closed)activity.showStartupError("无法启动内置浏览器，请重新打开应用。");});
        }catch(Exception error){activity.showStartupError("无法启动内置浏览器，请重新打开应用。");android.util.Log.e("MoyuGecko","startup",error);}
    }
    private String pageUri(){return assets.base()+"mobile.html";}
    private void send(JSONObject message){if(closed)return;if(port!=null)port.postMessage(message);else if(waiting.size()<32)waiting.add(message);}
    public void event(String name,Object detail){try{send(new JSONObject().put("event",name).put("detail",detail==null?JSONObject.NULL:detail));}catch(JSONException ignored){}}
    public void publishViewport(JSONObject value,Runnable delivered){try{viewportSequence=value.getInt("sequence");viewportDelivered=delivered;send(new JSONObject().put("event","moyu-mobile-viewport").put("detail",value).put("viewportSequence",viewportSequence));}catch(JSONException error){viewportDelivered=null;delivered.run();}}
    public void blur(){try{send(new JSONObject().put("blur",true));}catch(JSONException ignored){}}
    public void resume(){if(!closed&&session.isOpen())session.setActive(true);}
    public void pause(){if(!closed&&session.isOpen())session.setActive(false);}
    public void test(String id,String expression){if(BuildConfig.DEBUG&&!closed)try{JSONObject message=new JSONObject().put("id",id).put("expression",expression);if(testPort!=null)testPort.postMessage(message);else if(waitingTests.size()<8)waitingTests.add(message);}catch(JSONException ignored){}}
    public void inspect(String expression,java.util.function.Consumer<String> reply){if(BuildConfig.DEBUG){String id="inspect-"+UUID.randomUUID();inspections.put(id,reply);test(id,expression);}}
    public void close(){closed=true;viewportDelivered=null;waiting.clear();waitingTests.clear();for(java.util.function.Consumer<String> reply:inspections.values())reply.accept("null");inspections.clear();if(port!=null)port.disconnect();if(testPort!=null)testPort.disconnect();view.releaseSession();if(session.isOpen())session.close();if(assets!=null)assets.close();}
}
