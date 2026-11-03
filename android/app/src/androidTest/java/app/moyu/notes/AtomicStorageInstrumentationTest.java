package app.moyu.notes;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

@RunWith(AndroidJUnit4.class)
public class AtomicStorageInstrumentationTest {
    @Test public void concurrentReadersNeverRecoverOrRemoveAnotherWritersPendingFile() throws Exception {
        File folder=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"atomic-qa-"+UUID.randomUUID()),file=new File(folder,"sample.bin");
        byte[] a=new byte[512*1024],b=new byte[a.length];Arrays.fill(a,(byte)1);Arrays.fill(b,(byte)2);VaultStore.writePrivate(file,a);
        ExecutorService workers=Executors.newFixedThreadPool(3);CountDownLatch start=new CountDownLatch(1);
        Callable<Void> reader=()->{start.await();for(int i=0;i<60;i++)try(InputStream stream=VaultStore.openPrivate(new File(folder,"./sample.bin"))){byte[] value=VaultStore.readBytes(stream);assertTrue("Must read a complete committed version",Arrays.equals(value,a)||Arrays.equals(value,b));}return null;};
        try{
            Future<Void> writer=workers.submit(()->{start.await();for(int i=0;i<60;i++)VaultStore.writePrivate(file,i%2==0?b:a);return null;});
            Future<Void> first=workers.submit(reader),second=workers.submit(reader);start.countDown();writer.get(30,TimeUnit.SECONDS);first.get(30,TimeUnit.SECONDS);second.get(30,TimeUnit.SECONDS);
            try(InputStream stream=VaultStore.openPrivate(file)){assertArrayEquals(a,VaultStore.readBytes(stream));}
            assertFalse(new File(file+".new").exists());
        }finally{workers.shutdownNow();for(File child:Objects.requireNonNull(folder.listFiles()))assertTrue(child.delete());assertTrue(folder.delete());}
    }
}
