package com.fmaking.service;

import com.cloudinary.Cloudinary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.zalando.problem.Problem;
import org.zalando.problem.Status;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Service
public class ZaloQrStorage {
    private static final Logger log = LoggerFactory.getLogger(ZaloQrStorage.class);
    private final Cloudinary cloudinary;
    private final boolean configured;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    public ZaloQrStorage(@Value("${djnd.soundcloud.cloudinary.name:}") String name,
                         @Value("${djnd.soundcloud.cloudinary.key:}") String key,
                         @Value("${djnd.soundcloud.cloudinary.secret:}") String secret) {
        configured = !name.isBlank() && !key.isBlank() && !secret.isBlank();
        cloudinary = new Cloudinary(Map.of("cloud_name", name, "api_key", key, "api_secret", secret, "secure", true));
    }

    public void upload(byte[] bytes, String publicId, String format) {
        requireConfiguration();
        try {
            var result = cloudinary.uploader().upload(bytes, Map.of("public_id", publicId,
                "resource_type", "image", "type", "authenticated", "overwrite", false,
                "allowed_formats", new String[]{format}, "timeout", 20000));
            if (!publicId.equals(result.get("public_id")) || !format.equals(result.get("format"))) throw new IllegalStateException();
        } catch (Exception ex) { throw unavailable(); }
    }

    public byte[] read(String publicId, String format) {
        requireConfiguration();
        try {
            String url = cloudinary.privateDownload(publicId, format, Map.of("type", "authenticated",
                "resource_type", "image", "expires_at", Instant.now().plusSeconds(60).getEpochSecond()));
            URI uri = URI.create(url);
            if (!"https".equals(uri.getScheme()) || !"api.cloudinary.com".equals(uri.getHost())) throw new IllegalStateException();
            var response = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                if (response.statusCode() != 200) throw new IllegalStateException();
                byte[] data = body.readNBytes(ZaloShareValidation.MAX_BYTES + 1);
                if (data.length == 0 || data.length > ZaloShareValidation.MAX_BYTES) throw new IllegalStateException();
                return data;
            }
        } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception ex) { throw unavailable(); }
    }

    public void deleteSafely(String publicId) {
        if (publicId == null) return;
        try {
            cloudinary.uploader().destroy(publicId, Map.of("resource_type", "image", "type", "authenticated", "invalidate", true));
        } catch (Exception ex) {
            // Never log provider exceptions/URLs: they may include credentials or signed media links.
            log.warn("Cloudinary QR cleanup failed for asset {}; manual cleanup may be required", publicId);
        }
    }

    private void requireConfiguration() { if (!configured) throw unavailable(); }
    private static RuntimeException unavailable() {
        return Problem.builder().withStatus(Status.SERVICE_UNAVAILABLE).withTitle("QR storage unavailable")
            .with("message", "error.zaloStorageUnavailable").build();
    }
}
