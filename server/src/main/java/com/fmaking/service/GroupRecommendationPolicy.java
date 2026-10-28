package com.fmaking.service;

import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.service.dto.GroupingRuleDTO;
import com.fmaking.service.projection.StudentRow;

import java.util.*;

import static com.fmaking.domain.GroupingRuleCode.*;

/** Read-only admission ranking, shared by both directions of group recommendations. */
final class GroupRecommendationPolicy {
    private final int minMembers;
    private final int maxMembers;
    private final int minSe;
    private final int minMajors;
    private final int maxMajors;

    GroupRecommendationPolicy(List<GroupingRuleDTO> rules) {
        minMembers = bound(rules, MIN_MEMBERS_PER_GROUP, 0);
        maxMembers = bound(rules, MAX_MEMBERS_PER_GROUP, Integer.MAX_VALUE);
        minSe = bound(rules, MIN_SE_MEMBERS_PER_GROUP, 0);
        minMajors = bound(rules, MIN_MAJORS_PER_GROUP, 0);
        maxMajors = bound(rules, MAX_MAJORS_PER_GROUP, Integer.MAX_VALUE);
    }

    record Match(int score, List<String> reasons) {}
    private record CandidateType(Integer majorId, boolean se) {}
    private record Availability(int count, int se) {}
    private record Completion(int members, int se, int newMajors) {}

    int maxMembers() { return maxMembers; }

    Map<Long, Match> scoreCandidates(List<StudentRow> members, int memberCount, List<StudentRow> available) {
        return scoreCandidates(members, memberCount, available, available);
    }

    Map<Long, Match> scoreCandidates(List<StudentRow> members, int memberCount, List<StudentRow> available,
                                     List<StudentRow> candidates) {
        if (memberCount >= maxMembers) return Map.of();
        Map<Integer, Integer> counts = new HashMap<>();
        members.stream().map(StudentRow::majorId).filter(Objects::nonNull)
            .forEach(major -> counts.merge(major, 1, Integer::sum));
        int seCount = (int) members.stream().filter(GroupRecommendationPolicy::isSe).count();
        Map<CandidateType, Optional<Match>> cache = new HashMap<>();
        Map<Long, Match> matches = new HashMap<>();
        for (StudentRow candidate : candidates) {
            // Students of the same major/SE type leave the same remaining supply.
            // Reuse the feasibility search; bios and names never affect the score.
            CandidateType type = new CandidateType(candidate.majorId(), isSe(candidate));
            Optional<Match> match = cache.computeIfAbsent(type,
                ignored -> score(candidate, memberCount, counts, seCount, available));
            match.ifPresent(value -> matches.put(candidate.userId(), value));
        }
        return matches;
    }

    private Optional<Match> score(StudentRow candidate, int memberCount, Map<Integer, Integer> counts,
                                  int seCount, List<StudentRow> available) {
        boolean newMajor = candidate.majorId() != null && !counts.containsKey(candidate.majorId());
        Set<Integer> afterMajors = new HashSet<>(counts.keySet());
        if (candidate.majorId() != null) afterMajors.add(candidate.majorId());
        if (afterMajors.size() > maxMajors || !canComplete(candidate, memberCount + 1, afterMajors,
                seCount + (isSe(candidate) ? 1 : 0), available)) return Optional.empty();

        // The bonuses sum to at most 100, so clamping cannot erase ranking differences.
        int score = 30;
        List<String> reasons = new ArrayList<>();
        if (seCount < minSe && isSe(candidate)) {
            score += 35;
            reasons.add("Bổ sung sinh viên SE để đáp ứng số lượng SE tối thiểu");
        }
        if (counts.size() < minMajors && newMajor) {
            score += 5;
            reasons.add("Giúp nhóm đạt số ngành tối thiểu");
        }
        if (candidate.majorId() != null) {
            int sameMajor = counts.getOrDefault(candidate.majorId(), 0);
            score += (int) Math.round(25.0 / (sameMajor + 1));
            reasons.add(newMajor
                ? "Bổ sung ngành chưa có trong nhóm (" + (candidate.majorCode() == null ? candidate.majorId() : candidate.majorCode()) + ")"
                : "Cân bằng phân bố ngành: nhóm hiện có " + sameMajor + " thành viên cùng ngành");
        }
        if (memberCount < minMembers) {
            score += 5;
            reasons.add("Giúp nhóm đạt sĩ số tối thiểu (" + (memberCount + 1) + "/" + minMembers + ")");
        }
        return Optional.of(new Match(score, List.copyOf(reasons)));
    }

    /**
     * Check whether some subset of the remaining pool can finish this group.
     * Buckets count each new major once; a chosen SE can also satisfy diversity.
     * The search is bounded by missing requirements and available students, even
     * when the maximum group size is disabled. It does not enumerate student subsets.
     */
    private boolean canComplete(StudentRow candidate, int count, Set<Integer> majors, int se,
                                List<StudentRow> available) {
        int needMembers = Math.max(0, minMembers - count);
        int needSe = Math.max(0, minSe - se);
        int needMajors = Math.max(0, minMajors - majors.size());
        if (needMembers == 0 && needSe == 0 && needMajors == 0) return true;
        int slots = Math.min(maxMembers - count, Math.max(needMembers, needSe + needMajors));
        int newMajorLimit = Math.min(maxMajors - majors.size(), slots);
        if (slots < Math.max(needMembers, Math.max(needSe, needMajors)) || newMajorLimit < needMajors) return false;

        Map<Integer, Availability> buckets = new HashMap<>();
        for (StudentRow student : available) {
            if (Objects.equals(student.userId(), candidate.userId())) continue;
            buckets.merge(student.majorId(), new Availability(1, isSe(student) ? 1 : 0),
                (a, b) -> new Availability(a.count() + b.count(), a.se() + b.se()));
        }
        if (buckets.values().stream().mapToInt(Availability::count).sum() < needMembers
                || buckets.values().stream().mapToInt(Availability::se).sum() < needSe) return false;

        Map<Completion, Integer> states = Map.of(new Completion(0, 0, 0), 0);
        for (var bucket : buckets.entrySet()) {
            boolean newMajor = bucket.getKey() != null && !majors.contains(bucket.getKey());
            Availability supply = bucket.getValue();
            Map<Completion, Integer> next = new HashMap<>();
            for (var entry : states.entrySet()) {
                Completion before = entry.getKey();
                for (int take = 0; take <= Math.min(supply.count(), slots - entry.getValue()); take++) {
                    int newMajors = before.newMajors() + (newMajor && take > 0 ? 1 : 0);
                    if (newMajors > newMajorLimit) continue;
                    int leastSe = Math.max(0, take - (supply.count() - supply.se()));
                    for (int takeSe = leastSe; takeSe <= Math.min(take, supply.se()); takeSe++) {
                        Completion after = new Completion(Math.min(needMembers, before.members() + take),
                            Math.min(needSe, before.se() + takeSe), newMajors);
                        if (after.members() == needMembers && after.se() == needSe && after.newMajors() >= needMajors) return true;
                        next.merge(after, entry.getValue() + take, Math::min);
                    }
                }
            }
            states = next;
        }
        return false;
    }

    private static int bound(List<GroupingRuleDTO> rules, GroupingRuleCode code, int disabled) {
        return rules.stream().filter(rule -> rule.code() == code).findFirst()
            .map(rule -> Boolean.TRUE.equals(rule.status()) ? rule.value() : disabled)
            .orElse(code.isEnabledByDefault() ? code.getSuggestedValue() : disabled);
    }

    private static boolean isSe(StudentRow student) {
        return student.majorCode() != null && "SE".equalsIgnoreCase(student.majorCode().trim());
    }
}
