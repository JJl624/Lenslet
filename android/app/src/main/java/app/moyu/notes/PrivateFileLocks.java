package app.moyu.notes;
import java.io.File;
import java.io.IOException;

/** AtomicFile recovery must never race a writer in another Activity/store instance. */
final class PrivateFileLocks {
    private static final Object[] locks=new Object[128];
    static {for(int i=0;i<locks.length;i++)locks[i]=new Object();}
    static Object forFile(File file) throws IOException {return locks[(file.getCanonicalPath().hashCode()&0x7fffffff)%locks.length];}
}
