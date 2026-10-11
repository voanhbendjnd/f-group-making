package tech.djnd.sample.app.util;

import java.util.Locale;

public final class MajorCode {
    private MajorCode() {}

    public static String normalize(String code) {
        return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    public static boolean isValid(String code) {
        return code != null && code.matches("[A-Z0-9][A-Z0-9-]{0,19}");
    }
}
