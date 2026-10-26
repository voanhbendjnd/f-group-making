package com.fmaking.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import static org.assertj.core.api.Assertions.*;

class ZaloShareValidationTest {
    @Test void trimsAndCanonicalizesOnlyGroupLinks() {
        assertThat(ZaloShareValidation.inviteUrl("  https://ZALO.ME/g/abc123  ")).isEqualTo("https://zalo.me/g/abc123");
    }
    @ParameterizedTest @ValueSource(strings = {"http://zalo.me/g/abc", "javascript:alert(1)", "https://zalo.me.evil.test/g/abc",
        "https://evil.test@zalo.me/g/abc", "https://zalo.me/g/abc?redirect=evil", "https://zalo.me/g/abc#x",
        "https://zalo.me:443/g/abc", "https://zalo.me/0123456789", "https://zalo.me/g/%61bc", "https://zalo.me/g/../abc"})
    void rejectsUnsafeOrNonGroupLinks(String url) {
        assertThatThrownBy(() -> ZaloShareValidation.inviteUrl(url)).hasMessageContaining("Invalid Zalo");
    }
    @Test void checksActualImageContentAndMime() throws Exception {
        var output = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(8,8,BufferedImage.TYPE_INT_RGB), "png", output);
        assertThat(ZaloShareValidation.image(new MockMultipartFile("qr", "qr.png", "image/png", output.toByteArray())).format()).isEqualTo("png");
        assertThatThrownBy(() -> ZaloShareValidation.image(new MockMultipartFile("qr", "qr.jpg", "image/jpeg", output.toByteArray()))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> ZaloShareValidation.image(new MockMultipartFile("qr", "qr.png", "image/png", "<svg onload='alert(1)'/>".getBytes()))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> ZaloShareValidation.image(new MockMultipartFile("qr", "qr.png", "image/png", new byte[5*1024*1024+1]))).isInstanceOf(RuntimeException.class);
    }
}
