package com.example.util;

public final class StringUtils {
    private StringUtils() {}

    public static String trim(String s) {
        return s == null ? "" : s.strip();
    }

    public static int parseNumber(String s) {
        String cleaned = trim(s);
        return Integer.parseInt(cleaned);
    }
}
