package com.fmaking.domain;

/** Supported numeric conditions; adding a code also requires its validation logic. */
public enum GroupingRuleCode {
    MIN_MEMBERS_PER_GROUP(4),
    MAX_MEMBERS_PER_GROUP(6),
    MIN_GROUPS_PER_CLASS(1),
    MAX_GROUPS_PER_CLASS(50),
    MIN_MAJORS_PER_GROUP(2),
    MAX_MAJORS_PER_GROUP(6),
    MIN_SE_MEMBERS_PER_GROUP(1, 0);

    private final int suggestedValue;
    private final int minimumValue;

    GroupingRuleCode(int suggestedValue) {
        this(suggestedValue, 1);
    }

    GroupingRuleCode(int suggestedValue, int minimumValue) {
        this.suggestedValue = suggestedValue;
        this.minimumValue = minimumValue;
    }

    public boolean isEnabledByDefault() {
        return this != MIN_GROUPS_PER_CLASS && this != MAX_GROUPS_PER_CLASS;
    }

    public int getSuggestedValue() {
        return suggestedValue;
    }

    public int getMinimumValue() {
        return minimumValue;
    }
}
