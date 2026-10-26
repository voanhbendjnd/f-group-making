package com.fmaking.service;

import com.fmaking.web.rest.errors.BadRequestAlertException;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.Arrays;
import java.util.Locale;

final class ZaloShareValidation {
    static final int MAX_BYTES = 5 * 1024 * 1024;
    private ZaloShareValidation() {}

    static String inviteUrl(String input) {
        try {
            var uri = new URI(input.trim());
            // Do not fetch the URL. Only canonical HTTPS Zalo group invite links are accepted.
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"zalo.me".equalsIgnoreCase(uri.getHost())
                || uri.getRawUserInfo() != null || uri.getPort() != -1 || uri.getRawFragment() != null
                || uri.getRawQuery() != null || !uri.getRawPath().matches("/g/[A-Za-z0-9]+/?")) throw invalid("zaloInvalidLink");
            return "https://zalo.me" + uri.getRawPath();
        } catch (Exception ex) { throw invalid("zaloInvalidLink"); }
    }

    static Image image(MultipartFile file) {
        if (file == null) return null;
        if (file.isEmpty() || file.getSize() > MAX_BYTES) throw invalid("zaloImageSize");
        try {
            byte[] data = file.getBytes();
            if (data.length == 0 || data.length > MAX_BYTES) throw invalid("zaloImageSize");
            String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
            String format;
            if (data.length > 24 && Arrays.equals(Arrays.copyOf(data, 8), new byte[]{(byte)137,80,78,71,13,10,26,10})) format = "png";
            else if (data.length > 4 && (data[0] & 255) == 255 && (data[1] & 255) == 216 && (data[2] & 255) == 255) format = "jpg";
            else if (data.length > 20 && new String(data, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                && new String(data, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")
                && java.util.Set.of("VP8 ", "VP8L", "VP8X").contains(new String(data, 12, 4, java.nio.charset.StandardCharsets.US_ASCII))) format = "webp";
            else throw invalid("zaloImageType");
            if (!name.endsWith("." + format) && !(format.equals("jpg") && name.endsWith(".jpeg"))) throw invalid("zaloImageType");
            String expected = "image/" + (format.equals("jpg") ? "jpeg" : format);
            if (!expected.equalsIgnoreCase(file.getContentType())) throw invalid("zaloImageType");
            if (!format.equals("webp")) {
                try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
                    var readers = ImageIO.getImageReaders(stream);
                    if (!readers.hasNext()) throw invalid("zaloImageType");
                    var reader = readers.next();
                    try {
                        reader.setInput(stream);
                        if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096) throw invalid("zaloImageSize");
                        if (reader.read(0) == null) throw invalid("zaloImageType");
                    } finally { reader.dispose(); }
                }
            }
            return new Image(data, format);
        } catch (BadRequestAlertException ex) { throw ex; }
        catch (Exception ex) { throw invalid("zaloImageType"); }
    }

    static BadRequestAlertException invalid(String code) {
        return new BadRequestAlertException("Invalid Zalo sharing data", "zaloShare", code);
    }
    record Image(byte[] bytes, String format) {}
}
