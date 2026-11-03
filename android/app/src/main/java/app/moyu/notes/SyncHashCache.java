package app.moyu.notes;

import java.io.File;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;
import java.util.LinkedHashMap;

/** Only reliable local change stamps can avoid reading file contents. */
final class SyncHashCache {
    interface Probe { String stamp() throws Exception; }
    interface Reader { String read() throws Exception; }
    private final LinkedHashMap<String,String[]> entries=new LinkedHashMap<>(16,0.75f,true);
    String get(String key,Probe probe,Reader reader) throws Exception {
        String before=probe.stamp();String[] cached=entries.get(key);
        if(before!=null&&cached!=null&&before.equals(cached[0]))return cached[1];
        String hash=reader.read(),after=probe.stamp();
        if(before!=null&&before.equals(after)){
            entries.put(key,new String[]{before,hash});
            while(entries.size()>10000)entries.remove(entries.keySet().iterator().next());
        }else entries.remove(key);
        return hash;
    }
    void clear(){entries.clear();}
    void invalidate(String path){entries.keySet().removeIf(key->key.equals(path)||key.startsWith(path+"/"));}
    static String stamp(File file){
        try {
            // Android's NIO FileTime conversion can truncate ctime to seconds.
            // Read the actual stat timespec; coarse timestamps are not cached.
            StructStat stat=Os.lstat(file.getPath());
            if(!OsConstants.S_ISREG(stat.st_mode)||stat.st_ctim.tv_nsec==0)return null;
            return stat.st_dev+":"+stat.st_ino+":"+stat.st_size+":"+stat.st_mtim.tv_sec+":"+stat.st_mtim.tv_nsec+":"+stat.st_ctim.tv_sec+":"+stat.st_ctim.tv_nsec;
        }catch(Exception unsupported){return null;}
    }
}
