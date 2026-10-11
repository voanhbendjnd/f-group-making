package tech.djnd.sample.app.util;

import java.time.LocalDate;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class TermUtils {

    private static final Pattern TERM_NAME_PATTERN = Pattern.compile("^(SP|SU|FALL)(\\d{2})$", Pattern.CASE_INSENSITIVE);

    private TermUtils() {
    }

    /**
     * Determines term name for a given date:
     * - Jan to Apr (1 - 4): SP{yy}
     * - May to Aug (5 - 8): SU{yy}
     * - Sep to Dec (9 - 12): FALL{yy}
     */
    public static String getCurrentTermName(LocalDate date) {
        if (date == null) {
            date = LocalDate.now();
        }
        int month = date.getMonthValue();
        int yearTwoDigits = date.getYear() % 100;
        String yearStr = String.format("%02d", yearTwoDigits);

        String season;
        if (month >= 1 && month <= 4) {
            season = "SP";
        } else if (month >= 5 && month <= 8) {
            season = "SU";
        } else {
            season = "FALL";
        }
        return season + yearStr;
    }

    public static String getCurrentTermName() {
        return getCurrentTermName(LocalDate.now());
    }

    public static boolean isValidTermName(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }
        return TERM_NAME_PATTERN.matcher(name.trim()).matches();
    }

    public static String normalize(String name) {
        if (name == null) {
            return null;
        }
        return name.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Calculates an integer order index to compare terms chronologically.
     * SP = 0, SU = 1, FALL = 2.
     * Value = year * 3 + seasonIndex.
     */
    public static Integer getChronologicalValue(String name) {
        if (name == null) {
            return null;
        }
        Matcher matcher = TERM_NAME_PATTERN.matcher(name.trim());
        if (!matcher.matches()) {
            return null;
        }
        String season = matcher.group(1).toUpperCase(Locale.ROOT);
        int year2Digits = Integer.parseInt(matcher.group(2));
        int fullYear = 2000 + year2Digits;

        int seasonIndex = switch (season) {
            case "SP" -> 0;
            case "SU" -> 1;
            case "FALL" -> 2;
            default -> 0;
        };

        return fullYear * 3 + seasonIndex;
    }
}
