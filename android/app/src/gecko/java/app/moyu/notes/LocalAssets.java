package app.moyu.notes;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;

/** Read-only, per-process loopback origin. Never exposes a directory listing or writes. */
final class LocalAssets implements AutoCloseable {
    interface Open { Resource open(String path) throws Exception; }
    static final class Resource implements AutoCloseable {
        final InputStream stream; final String type; final long length; final boolean vault;
        Resource(InputStream stream,String type,long length,boolean vault){this.stream=stream;this.type=type;this.length=length;this.vault=vault;}
        public void close() throws IOException {stream.close();}
    }
    private final ServerSocket server;
    private final ExecutorService acceptor=Executors.newSingleThreadExecutor();
    private final ThreadPoolExecutor readers=new ThreadPoolExecutor(2,2,10,TimeUnit.SECONDS,new ArrayBlockingQueue<>(32));
    private final Set<Socket> active=ConcurrentHashMap.newKeySet();
    private final Open open;
    private final String token;
    private volatile boolean closed;
    LocalAssets(Open open) throws IOException {
        this.open=open;byte[] random=new byte[32];new SecureRandom().nextBytes(random);StringBuilder text=new StringBuilder();for(byte b:random)text.append(String.format(Locale.ROOT,"%02x",b));token=text.toString();
        server=new ServerSocket(0,32,InetAddress.getByName("127.0.0.1"));
        acceptor.execute(()->{while(!closed)try{Socket socket=server.accept();socket.setSoTimeout(10000);active.add(socket);try{readers.execute(()->serve(socket));}catch(RejectedExecutionException error){active.remove(socket);socket.close();}}catch(IOException error){if(!closed)android.util.Log.w("MoyuAssets","accept",error);}});
    }
    String origin(){return "http://127.0.0.1:"+server.getLocalPort();}
    String base(){return origin()+"/"+token+"/";}
    private void serve(Socket socket){
        try(Socket connection=socket;InputStream input=connection.getInputStream();OutputStream output=connection.getOutputStream()){
            String request=line(input);String[] parts=request.split(" ");Map<String,String> headers=new HashMap<>();
            for(int total=request.length();;){String header=line(input);if(header.isEmpty())break;total+=header.length();if(total>16384)throw new IOException("headers");int colon=header.indexOf(':');if(colon<1)throw new IOException("header");headers.put(header.substring(0,colon).toLowerCase(Locale.ROOT),header.substring(colon+1).trim());}
            if(parts.length!=3||!(parts[0].equals("GET")||parts[0].equals("HEAD"))){error(output,405);return;}
            if(!("127.0.0.1:"+server.getLocalPort()).equals(headers.get("host"))||headers.containsKey("origin")&&!origin().equals(headers.get("origin"))){error(output,403);return;}
            String raw=parts[1].split("\\?",2)[0],prefix="/"+token+"/";
            if(!raw.startsWith(prefix)){error(output,404);return;}
            String path=URLDecoder.decode(raw.substring(prefix.length()).replace("+","%2B"),"UTF-8");
            try{VaultPaths.checked(path);}catch(IllegalArgumentException invalid){error(output,404);return;}
            try(Resource resource=open.open(path)){
                long start=0,end=resource.length-1;boolean partial=false;
                String range=headers.get("range");
                if(range!=null&&resource.length>=0){
                    if(!range.matches("bytes=(?:\\d{1,18}-\\d{0,18}|-\\d{1,18})")){error(output,416);return;}
                    String[] bounds=range.substring(6).split("-",-1);
                    if(bounds[0].isEmpty()){long suffix=Long.parseLong(bounds[1]);if(suffix<=0){error(output,416);return;}start=Math.max(0,resource.length-suffix);}
                    else{start=Long.parseLong(bounds[0]);if(!bounds[1].isEmpty())end=Math.min(end,Long.parseLong(bounds[1]));}
                    if(start>end||start>=resource.length){error(output,416);return;}partial=true;
                }
                long count=resource.length<0?-1:end-start+1;
                String header="HTTP/1.1 "+(partial?"206 Partial Content":"200 OK")+"\r\nContent-Type: "+resource.type+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: "+(resource.vault?"default-src 'none'; sandbox":"frame-ancestors 'none'; object-src 'none'; base-uri 'self'")+"\r\n";
                if(count>=0)header+="Content-Length: "+count+"\r\nAccept-Ranges: bytes\r\n";
                if(partial)header+="Content-Range: bytes "+start+"-"+end+"/"+resource.length+"\r\n";
                output.write((header+"\r\n").getBytes(StandardCharsets.US_ASCII));
                if(parts[0].equals("HEAD"))return;
                while(start>0){long skipped=resource.stream.skip(start);if(skipped<=0){if(resource.stream.read()<0)throw new EOFException();skipped=1;}start-=skipped;}
                byte[] buffer=new byte[32768];while(count!=0){int n=resource.stream.read(buffer,0,count<0?buffer.length:(int)Math.min(buffer.length,count));if(n<0)break;output.write(buffer,0,n);if(count>0)count-=n;}
            }catch(FileNotFoundException missing){error(output,404);}
        }catch(Exception ignored){/* Closed or rejected request; no vault paths in logs. */}finally{active.remove(socket);}
    }
    private static String line(InputStream input) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();for(int value;(value=input.read())!=-1;){if(value=='\n')return new String(out.toByteArray(),StandardCharsets.US_ASCII).replaceFirst("\r$","");if(out.size()>=8192)throw new IOException("line");out.write(value);}throw new EOFException();}
    private static void error(OutputStream out,int status) throws IOException {out.write(("HTTP/1.1 "+status+" Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").getBytes(StandardCharsets.US_ASCII));}
    public void close(){closed=true;try{server.close();}catch(IOException ignored){}for(Socket socket:active)try{socket.close();}catch(IOException ignored){}acceptor.shutdownNow();readers.shutdownNow();}
}
