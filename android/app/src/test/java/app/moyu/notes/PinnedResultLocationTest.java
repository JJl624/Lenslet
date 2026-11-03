package app.moyu.notes;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
public class PinnedResultLocationTest {
    @Test public void bothFormatsResolveToTheSamePayload() throws Exception {
        PinnedResultLocation old = new PinnedResultLocation("目录/笔记.assets/results/001a/results.json", "");
        PinnedResultLocation current = new PinnedResultLocation("目录/笔记.assets/document.json", "001a");
        assertFalse(old.consolidated);assertTrue(current.consolidated);assertEquals(old.folder,current.folder);
    }
    @Test public void invalidIdsAndUnrelatedMetadataAreRejected() throws Exception {
        for(String id:new String[]{"", "0000", "../a", "001a/other", "not-an-id"}) {
            try {new PinnedResultLocation("笔记.assets/document.json",id);fail(id);}catch(IOException expected){}
        }
        try {new PinnedResultLocation("笔记.assets/attachments/document.json","001a");fail();}catch(IOException expected){}
        try {new PinnedResultLocation("笔记.assets/results/0000/results.json","");fail();}catch(IOException expected){}
    }
}
