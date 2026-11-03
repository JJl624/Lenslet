package app.moyu.notes;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.JSONObject;
import org.json.JSONArray;
import android.content.Intent;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.attribute.FileTime;
import java.util.concurrent.atomic.AtomicInteger;

@RunWith(AndroidJUnit4.class)
public class SyncIoInstrumentationTest {
    private static JSONObject value(String text) throws Exception {return new JSONObject().put("localHash",VaultPaths.hash(text)).put("remoteEtag","\""+text+"\"");}
    @Test public void deltasRecoverAfterRestartAndTornWritesThenCheckpointWithoutPreferences() throws Exception {
        File root=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"sync-io-"+System.nanoTime());assertTrue(root.mkdirs());
        String key="moyu-mobile-sync-"+VaultPaths.hash("test");File journal=new File(root,"sync/"+VaultPaths.hash("test")+".pending.jsonl"),base=new File(root,"sync/"+VaultPaths.hash("test")+".json");
        try{
            SyncBaselineStore store=new SyncBaselineStore(root);JSONObject initial=new JSONObject().put("old.md",value("old"));store.read(key,initial);
            byte[] original=Files.readAllBytes(base.toPath());for(int i=0;i<100;i++)store.record(key,"note-"+i+".md",value("v"+i));assertArrayEquals(original,Files.readAllBytes(base.toPath()));assertTrue(journal.length()<25000);
            try(FileOutputStream output=new FileOutputStream(journal,true)){output.write("{\"path\":\"torn".getBytes(StandardCharsets.UTF_8));}
            store=new SyncBaselineStore(root);assertEquals(101,store.read(key,new JSONObject()).length());store.record(key,"old.md",null);store.record(key,"new.md",value("new"));
            store.checkpoint(key);assertFalse(journal.exists());JSONObject restored=new SyncBaselineStore(root).read(key,initial);assertFalse(restored.has("old.md"));assertEquals(value("new").toString(),restored.getJSONObject("new.md").toString());assertEquals(101,restored.length());
            long modified=base.lastModified();store.checkpoint(key);assertEquals(modified,base.lastModified());assertFalse(new File(root,"settings.json").exists());
            store.record(key,"after.md",value("after"));
            // A stopped AtomicFile checkpoint must retain its old snapshot and
            // replay the completed delta, rather than importing old preferences.
            android.util.AtomicFile atomic=new android.util.AtomicFile(base);try(FileOutputStream unfinished=atomic.startWrite()){unfinished.write("{\"partial\":".getBytes(StandardCharsets.UTF_8));}
            JSONObject recovered=new SyncBaselineStore(root).read(key,initial);assertTrue(recovered.has("after.md"));assertFalse(recovered.has("old.md"));
            try{store.record(key,"../unsafe",value("no"));fail("reject escaping path");}catch(IllegalArgumentException expected){}
            try{store.read("../unsafe",new JSONObject());fail("reject escaping key");}catch(IOException expected){}
        }finally{VaultStore.deletePrivate(root);}
    }
    @Test public void hashCacheDetectsSameSizeExternalEditsEvenWithRestoredMtimeAndFallsBackWithoutReliableStamps() throws Exception {
        File root=InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),file=File.createTempFile("sync-hash-",".md",root);SyncHashCache cache=new SyncHashCache();AtomicInteger reads=new AtomicInteger();
        try{
            Files.write(file.toPath(),"one".getBytes(StandardCharsets.UTF_8));FileTime modified=Files.getLastModifiedTime(file.toPath());assertNotNull("private storage must expose a reliable ctime",SyncHashCache.stamp(file));
            SyncHashCache.Reader reader=()->{reads.incrementAndGet();return VaultPaths.hash(Files.readAllBytes(file.toPath()));};
            String before=cache.get("a.md",()->SyncHashCache.stamp(file),reader);assertEquals(before,cache.get("a.md",()->SyncHashCache.stamp(file),reader));assertEquals(1,reads.get());
            Files.write(file.toPath(),"two".getBytes(StandardCharsets.UTF_8));Files.setLastModifiedTime(file.toPath(),modified);assertNotEquals(before,cache.get("a.md",()->SyncHashCache.stamp(file),reader));assertEquals(2,reads.get());
            cache.get("provider.md",()->null,reader);cache.get("provider.md",()->null,reader);assertEquals(4,reads.get());
            String[] stamp={"before"};cache.get("changing.md",()->stamp[0],()->{stamp[0]="after";reads.incrementAndGet();return "old";});assertEquals("new",cache.get("changing.md",()->stamp[0],()->"new"));
        }finally{assertTrue(file.delete());}
    }
    @Test public void cancellingAFileCheckAlsoCancelsAnAlreadyCachedHash() throws Exception {
        VaultStore store=new VaultStore(InstrumentationRegistry.getInstrumentation().getTargetContext());store.select(null);String name="hash-cancel-"+System.nanoTime()+".md",job="hash-job-"+System.nanoTime();
        try{store.create(name,"file","body");store.syncHash(name,job);WebDavTransport.cancel(job);try{store.syncHash(name,job);fail("cached hashes must respect cancellation");}catch(IOException expected){assertTrue(expected.getMessage().contains("已取消"));}}
        finally{store.delete(name);store.history.close();}
    }
    @Test public void bridgeMigratesLegacyPreferencesBeforeAcceptingDurableDeltas() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        NativeBridge bridge=new NativeBridge(activity);bridge.initialize();bridge.vault.select(null);
        String suffix=VaultPaths.hash("bridge-sync-"+System.nanoTime()),key="moyu-mobile-sync-"+suffix;
        JSONObject input=new JSONObject().put("root","internal").put("key",key);
        try{
            bridge.invoke("feature",new JSONArray().put("preferences.set-many").put(new JSONObject().put("values",new JSONObject().put(key,new JSONObject().put("a.md",value("before")).toString()))));
            JSONObject baseline=(JSONObject)bridge.invoke("feature",new JSONArray().put("mobile.sync-baseline-read").put(input));assertTrue(baseline.has("a.md"));assertFalse(((JSONObject)bridge.invoke("feature",new JSONArray().put("preferences.get"))).has(key));
            JSONObject delta=new JSONObject(input.toString()).put("path","a.md").put("value",value("after"));bridge.invoke("feature",new JSONArray().put("mobile.sync-baseline-record").put(delta));
            bridge.invoke("feature",new JSONArray().put("mobile.sync-baseline-checkpoint").put(input));
            JSONObject disk=new SyncBaselineStore(activity.getFilesDir()).read(key,new JSONObject());assertEquals(value("after").getString("localHash"),disk.getJSONObject("a.md").getString("localHash"));
        }finally{
            for(String extension:new String[]{".json",".json.bak",".json.new",".pending.jsonl"}){File file=new File(activity.getFilesDir(),"sync/"+suffix+extension);if(file.exists())assertTrue(file.delete());}
            bridge.io.shutdown();instrumentation.runOnMainSync(activity::finish);
        }
    }
}
