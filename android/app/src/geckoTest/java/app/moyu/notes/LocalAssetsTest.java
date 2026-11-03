package app.moyu.notes;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

public class LocalAssetsTest {
    private String request(LocalAssets server,String path,String method,String headers) throws Exception {
        URI base=URI.create(server.base());try(Socket socket=new Socket("127.0.0.1",base.getPort())){
            socket.setSoTimeout(2000);socket.getOutputStream().write((method+" "+path+" HTTP/1.1\r\nHost: "+base.getAuthority()+"\r\n"+headers+"\r\n").getBytes(StandardCharsets.US_ASCII));return new String(socket.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        }
    }
    @Test public void tokensOriginsAndTraversalAreCheckedBeforeOpening() throws Exception {
        AtomicInteger reads=new AtomicInteger();try(LocalAssets server=new LocalAssets(path->{reads.incrementAndGet();return new LocalAssets.Resource(new ByteArrayInputStream(new byte[0]),"text/plain",0,true);})){
            String prefix=URI.create(server.base()).getPath();
            for(String path:new String[]{"/vault/note.md",prefix+"../note.md",prefix+"vault/%2e%2e/note.md",prefix+"vault/a%5cb"})assertTrue(request(server,path,"GET","").startsWith("HTTP/1.1 404"));
            assertTrue(request(server,prefix+"vault/note.md","GET","Origin: https://example.com\r\n").startsWith("HTTP/1.1 403"));
            assertTrue(request(server,prefix+"vault/note.md","POST","").startsWith("HTTP/1.1 405"));assertEquals(0,reads.get());
        }
    }
    @Test public void utf8PathsRangesAndHeadStreamWithoutReadingWholeFiles() throws Exception {
        byte[] data="0123456789".getBytes(StandardCharsets.UTF_8);
        try(LocalAssets server=new LocalAssets(path->{assertEquals("vault/图片 +.png",path);return new LocalAssets.Resource(new ByteArrayInputStream(data),"image/png",data.length,true);})){
            String path=URI.create(server.base()).getPath()+"vault/"+URLEncoder.encode("图片 +.png",StandardCharsets.UTF_8).replace("+","%20");
            String partial=request(server,path,"GET","Range: bytes=2-4\r\n");assertTrue(partial.startsWith("HTTP/1.1 206"));assertTrue(partial.endsWith("\r\n\r\n234"));assertTrue(partial.contains("Content-Range: bytes 2-4/10"));assertTrue(partial.contains("default-src 'none'; sandbox"));
            assertTrue(request(server,path,"GET","Range: bytes=-3\r\n").endsWith("\r\n\r\n789"));
            assertTrue(request(server,path,"HEAD","").endsWith("\r\n\r\n"));assertTrue(request(server,path,"GET","Range: bytes=99-\r\n").startsWith("HTTP/1.1 416"));
        }
    }
}
