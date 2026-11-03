package app.moyu.notes;

import java.io.IOException;

/** Both on-disk layouts address the same independently stored HTML payload. */
final class PinnedResultLocation {
    final boolean consolidated;
    final String folder;
    PinnedResultLocation(String metadata, String id) throws IOException {
        consolidated = metadata.matches("(?i).+\\.assets/document\\.json");
        if (consolidated) {
            if (!id.matches("(?!0000)[a-f0-9]{4}")) throw new IOException("HTML 结果 ID 无效。");
            folder = metadata.substring(0, metadata.length() - "document.json".length()) + "results/" + id + "/";
        } else {
            if (!metadata.matches("(?i).+\\.assets/results/(?!0000)[a-f0-9]{4}/results\\.json")) throw new IOException("HTML 结果路径无效。");
            folder = metadata.substring(0, metadata.length() - "results.json".length());
        }
    }
}
