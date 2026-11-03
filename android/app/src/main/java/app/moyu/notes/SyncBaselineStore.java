package app.moyu.notes;

import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;


/** Durable per-file deltas, checkpointed without rewriting application preferences. */
final class SyncBaselineStore {
    private final File directory;
    private final LinkedHashMap<String,JSONObject> states=new LinkedHashMap<>(4,0.75f,true);
    SyncBaselineStore(File files){directory=new File(files,"sync");}
    private File file(String key,String suffix) throws IOException {
        if(!key.matches("moyu-mobile-sync-[a-f0-9]{64}"))throw new IOException("同步状态标识无效。");
        return new File(directory,key.substring("moyu-mobile-sync-".length())+suffix);
    }
    private static void validate(JSONObject entry) throws Exception {
        if(!entry.getString("localHash").matches("[a-f0-9]{64}")||entry.getString("remoteEtag").length()>4096)throw new IOException("同步状态无效。");
    }
    private static void apply(JSONObject state,JSONObject step) throws Exception {
        String path=VaultPaths.checked(step.getString("path"));
        if(step.isNull("value"))state.remove(path);else{JSONObject value=step.getJSONObject("value");validate(value);state.put(path,value);}
    }
    private static byte[] bounded(File file) throws IOException {
        if(file.length()>16*1024*1024)throw new IOException("同步状态文件过大。");
        return Files.readAllBytes(file.toPath());
    }
    synchronized JSONObject read(String key,JSONObject initial) throws Exception {
        JSONObject cached=states.get(key);if(cached!=null)return cached;
        File base=file(key,".json"),journal=file(key,".pending.jsonl");
        JSONObject state;boolean loaded;
        try(InputStream input=VaultStore.openPrivate(base)){
            byte[] bytes=VaultStore.readBytes(input);if(bytes.length>16*1024*1024)throw new IOException("同步状态文件过大。");
            state=new JSONObject(new String(bytes,StandardCharsets.UTF_8));loaded=true;
        }catch(FileNotFoundException missing){state=new JSONObject(initial.toString());loaded=false;}
        for(java.util.Iterator<String> keys=state.keys();keys.hasNext();){String path=keys.next();VaultPaths.checked(path);validate(state.getJSONObject(path));}
        if(journal.isFile()){
            byte[] bytes=bounded(journal);int end=bytes.length;while(end>0&&bytes[end-1]!='\n')end--;
            String complete=new String(bytes,0,end,StandardCharsets.UTF_8);
            for(String line:complete.split("\n"))if(!line.isEmpty())apply(state,new JSONObject(line));
            if(end!=bytes.length)try(RandomAccessFile output=new RandomAccessFile(journal,"rw")){output.setLength(end);output.getFD().sync();}
        }
        // Old preference-based baselines are copied once before accepting deltas.
        if(!loaded&&initial.length()>0)VaultStore.writePrivate(base,state.toString().getBytes(StandardCharsets.UTF_8));
        states.put(key,state);while(states.size()>4)states.remove(states.keySet().iterator().next());
        return state;
    }
    synchronized void record(String key,String path,JSONObject value) throws Exception {
        VaultPaths.checked(path);if(value!=null)validate(value);
        JSONObject state=read(key,new JSONObject());
        if(value==null?!state.has(path):state.has(path)&&state.getJSONObject(path).toString().equals(value.toString()))return;
        File journal=file(key,".pending.jsonl");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("无法创建同步状态目录。");
        if(journal.length()>1024*1024)checkpoint(key);
        JSONObject step=new JSONObject().put("path",path).put("value",value==null?JSONObject.NULL:value);
        try(FileOutputStream output=new FileOutputStream(journal,true)){output.write((step+"\n").getBytes(StandardCharsets.UTF_8));output.getFD().sync();}
        catch(Exception error){states.remove(key);throw error;}
        apply(state,step);
    }
    synchronized void checkpoint(String key) throws Exception {
        File journal=file(key,".pending.jsonl");if(!journal.exists())return;
        JSONObject state=read(key,new JSONObject());
        byte[] bytes=state.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>16*1024*1024)throw new IOException("同步状态文件过大。");
        VaultStore.writePrivate(file(key,".json"),bytes);
        if(!journal.delete())throw new IOException("无法合并同步状态。");
    }
}
