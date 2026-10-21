package com.fmaking.service;

import java.util.Collection;

/** Allocation-only constraint. Manual formation and configured group rules are unchanged. */
public final class AllocationBalancePolicy {
    private AllocationBalancePolicy() {}

    public static int minimumSize(int students, int groups) { return students / groups; }
    public static int maximumSize(int students, int groups) { return students / groups + (students % groups == 0 ? 0 : 1); }

    public static boolean isBalanced(Collection<Integer> sizes) {
        if (sizes.isEmpty()) return false;
        int minimum = sizes.stream().mapToInt(Integer::intValue).min().orElseThrow();
        int maximum = sizes.stream().mapToInt(Integer::intValue).max().orElseThrow();
        return minimum > 0 && maximum - minimum <= 1;
    }
}
