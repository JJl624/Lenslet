package app.moyu.notes;

import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;

public class DocumentBytesTest {
    @Rule public TemporaryFolder files=new TemporaryFolder();
    private File backup(byte[] bytes)throws Exception{File file=files.newFile();java.nio.file.Files.write(file.toPath(),bytes);return file;}
    @Test public void invalidTextNeverBecomesEditableReplacementCharacters() throws Exception {
        assertEquals("中文\r\n",DocumentBytes.text("中文\r\n".getBytes(StandardCharsets.UTF_8)));
        for(byte[] bytes:new byte[][]{{(byte)0xff},{(byte)0xe4,(byte)0xb8},{65,0,66}}){
            try{DocumentBytes.text(bytes);fail("Invalid text must be rejected");}catch(IOException expected){}
        }
    }
    static class FileTarget implements DocumentBytes.Target {
        byte[] bytes={1,2,3};int writes;boolean failRestore,truncate;
        public InputStream read(){return new ByteArrayInputStream(bytes);}
        public void write(InputStream next)throws Exception{writes++;bytes=next.readAllBytes();
            if(writes==1){bytes=new byte[]{9};if(!truncate)throw new IOException("provider disconnected");}
            else if(failRestore)throw new IOException("provider unavailable");
        }
        public void remove(){bytes=null;}
    }
    @Test public void failedAndShortWritesRestoreExactOriginalBytes()throws Exception{
        for(boolean truncate:new boolean[]{false,true}){
            FileTarget target=new FileTarget();target.truncate=truncate;byte[] before=target.bytes.clone();
            try{DocumentBytes.replace(target,new byte[]{4,5},backup(before));fail();}catch(IOException expected){}
            assertArrayEquals(before,target.bytes);
        }
    }
    @Test public void failedRestoreIsDistinguishedForDurableBackupRetention()throws Exception{
        FileTarget target=new FileTarget();target.failRestore=true;
        try{DocumentBytes.replace(target,new byte[]{4},backup(target.bytes));fail();}
        catch(DocumentBytes.RecoveryFailure expected){assertEquals(1,expected.getSuppressed().length);}
    }
    @Test public void failedNewFileIsRemoved()throws Exception{
        FileTarget target=new FileTarget();try{DocumentBytes.replace(target,new byte[]{4},null);fail();}catch(IOException expected){}
        assertNull(target.bytes);
    }
}
