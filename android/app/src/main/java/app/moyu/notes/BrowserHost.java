package app.moyu.notes;

import android.view.View;

/** Rendering transport only. Storage, synchronization and pickers stay in MainActivity. */
interface BrowserHost {
    View view();
    void start();
    default void resume() { }
    default void pause() { }
    void event(String name, Object detail);
    void blur();
    void close();
    void publishViewport(org.json.JSONObject value,Runnable delivered);
    default void test(String id, String expression) { }
    void inspect(String expression, java.util.function.Consumer<String> reply);
}
