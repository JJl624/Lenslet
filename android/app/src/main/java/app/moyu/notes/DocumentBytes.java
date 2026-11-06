package app.moyu.notes;

import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Text decoding and verified replacement are independent of a storage provider. */
final class DocumentBytes {
    interface Target {
        InputStream read() throws Exception;
        void write(InputStream bytes) throws Exception;
        void remove() throws Exception;
    }
    static final class RecoveryFailure extends IOException {
        RecoveryFailure(Exception original, Exception rollback) {
            super("保存失败且原文件恢复失败。", original);
            addSuppressed(rollback);
        }
    }
    static String text(byte[] bytes) throws IOException {
        final String value;
        try {
            value=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (java.nio.charset.CharacterCodingException error) {
            throw new IOException("文件不是 UTF-8 文本。",error);
        }
        if(value.indexOf('\0')>=0)throw new IOException("不支持编辑二进制文件。");
        return value;
    }
    static byte[] digest(InputStream input) throws Exception {
        MessageDigest hash=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[32768];int count;
        while((count=input.read(buffer))!=-1)hash.update(buffer,0,count);
        return hash.digest();
    }
    static boolean matches(Target target,byte[] expected) throws Exception {
        try(InputStream input=target.read()){return Arrays.equals(expected,digest(input));}
    }
    static void replace(Target target, byte[] next, File previous) throws Exception {
        try {
            target.write(new ByteArrayInputStream(next));
            if(!matches(target,MessageDigest.getInstance("SHA-256").digest(next)))throw new IOException("保存后文件校验失败。");
        } catch(Exception original) {
            try {
                if(previous==null)target.remove();
                else {
                    byte[] expected;
                    try(InputStream input=new FileInputStream(previous)){expected=digest(input);}
                    try(InputStream input=new FileInputStream(previous)){target.write(input);}
                    if(!matches(target,expected))throw new IOException("恢复后文件校验失败。");
                }
            } catch(Exception rollback) {throw new RecoveryFailure(original,rollback);}
            throw new IOException("保存失败，"+(previous==null?"未完成的文件已移除。":"原文件已恢复。"),original);
        }
    }
}
