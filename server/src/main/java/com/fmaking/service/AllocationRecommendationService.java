package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.AllocationPreviewRepository;
import com.fmaking.service.dto.*;
import com.fmaking.service.dto.AllocationPreviewDTO.GroupView;
import com.fmaking.service.dto.AllocationRecommendationDTO.*;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.fmaking.domain.GroupingRuleCode.*;
import static com.fmaking.service.dto.AllocationRecommendationDTO.ReasonCode.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class AllocationRecommendationService {
    private final AllocationPreviewRepository previews;
    private final AllocationPreviewService snapshots;
    private final AllocationPlanHistoryService history;
    private final SchoolClassAccessService access;
    private final GroupRuleValidationService validator;
    private final GroupScoreService scores;
    private final EntityManager em;

    public AllocationRecommendationService(AllocationPreviewRepository previews, AllocationPreviewService snapshots,
            AllocationPlanHistoryService history, SchoolClassAccessService access, GroupRuleValidationService validator,
            GroupScoreService scores, EntityManager em) {
        this.previews = previews; this.snapshots = snapshots; this.history = history; this.access = access;
        this.validator = validator; this.scores = scores; this.em = em;
    }

    public AllocationRecommendationDTO recommend(Integer deadlineId, Integer classId) {
        var captured = snapshots.captureForHistory(deadlineId, classId); // Same management authorization as Preview/Apply.
        if (captured.isEmpty()) return empty(null);
        var current = captured.get();
        String fingerprint = current.overview().snapshotFingerprint();
        if (AllocationPreviewService.isAllocationComplete(current.overview())
                || "CANCELLED".equals(current.overview().scope().deadlineStatus())) return empty(fingerprint);
        Long owner = access.currentLecturerId();
        Candidate best = null;
        int eligible = 0, equivalent = 0, page = 0;
        boolean more;
        // Scan ALL eligible history, not the visible table page. No per-plan database lookups or engine searches.
        do {
            var batch = previews.findBySchoolClassIdAndDeadlineIdAndOwnerIdAndAppliedAtIsNullAndSnapshotFingerprintOrderByIdAsc(
                classId, deadlineId, owner, fingerprint, PageRequest.of(page++, 50));
            for (var row : batch) {
                try {
                    if (row.getAppliedAt() != null || !Objects.equals(row.getOwnerId(), owner)
                            || !Objects.equals(row.getSchoolClassId(), classId) || !Objects.equals(row.getDeadlineId(), deadlineId)
                            || !Objects.equals(row.getSnapshotFingerprint(), fingerprint)) continue;
                    var saved = history.decode(row); // Reuses format-1/2 and stored plan-fingerprint validation.
                    if (saved == null || saved.result().targetGroupCount() != row.getTargetCount()) continue;
                    Metrics metrics = evaluate(current, saved);
                    if (metrics == null) continue;
                    eligible++;
                    var candidate = new Candidate(row.getId(), row.getPlanFingerprint(), metrics, saved.result().searchComplete());
                    int comparison = best == null ? -1 : compareQuality(candidate.metrics(), best.metrics());
                    if (comparison < 0) { best = candidate; equivalent = 1; }
                    else if (comparison == 0) {
                        equivalent++;
                        if (Comparator.comparing(Candidate::fingerprint).thenComparing(Candidate::id).compare(candidate, best) < 0) best = candidate;
                    }
                } finally { em.detach(row); } // Bound persistence-context memory while scanning payload batches.
            }
            more = batch.hasNext();
        } while (more);
        if (best == null) return empty(fingerprint);
        return new AllocationRecommendationDTO(fingerprint, best.id(), best.metrics().groups(), eligible, equivalent,
            best.metrics(), reasons(best, equivalent));
    }

    private record Candidate(String id, String fingerprint, Metrics metrics, boolean searchComplete) {}
    private static AllocationRecommendationDTO empty(String fingerprint) {
        return new AllocationRecommendationDTO(fingerprint, null, null, 0, 0, null, List.of());
    }

    /** Revalidate against canonical snapshot students, never saved flags, score, optimization or report claims. */
    Metrics evaluate(AllocationPreviewService.Captured current, AllocationPreviewDTO saved) {
        var snapshot = current.snapshot();
        var plan = saved.groups();
        int target = plan.size();
        if (target == 0 || !AllocationBalancePolicy.isBalanced(plan.stream().map(g -> g.members().size()).toList())) return null;
        if (snapshot.rules().stream().anyMatch(rule -> rule.status() &&
            ((rule.code() == MIN_GROUPS_PER_CLASS && target < rule.value()) || (rule.code() == MAX_GROUPS_PER_CLASS && target > rule.value())))) return null;
        Map<Long, GroupMemberDTO> students = snapshot.students().stream().collect(Collectors.toMap(GroupMemberDTO::getStudentId, Function.identity()));
        Map<Long, GroupDTO> original = snapshot.groups().stream().filter(g -> g.getStatus() != GroupStatus.DISBANDED)
            .collect(Collectors.toMap(GroupDTO::getId, Function.identity()));
        Map<Long, GroupDTO> origins = new HashMap<>();
        original.values().forEach(g -> g.getMembers().forEach(m -> origins.put(m.getStudentId(), g)));
        Set<Long> seen = new HashSet<>(), kept = new HashSet<>();
        Set<String> names = new HashSet<>();
        long pairs = 0; int preserved = 0, leaders = 0, moves = 0, three = 0, four = 0, unknown = 0;
        double scoreSum = 0; int scored = 0;
        int validBefore = (int) original.values().stream().filter(g -> draft(g.getStatus()))
            .filter(g -> validator.areAllRulesPassed(validator.evaluateRules(snapshot.rules(), g.getMembers()))).count();
        int protectedCount = 0;
        for (GroupView group : plan) {
            GroupDTO old = original.get(group.groupId());
            boolean fixed = old != null && !draft(old.getStatus());
            if (old != null && (!kept.add(old.getId()) || group.newGroup() || old.getStatus() != group.status())) return null;
            if (fixed != group.protectedGroup() || (old == null && (!group.newGroup() || group.groupId() != null
                || group.status() != GroupStatus.OPEN || group.planGroupKey() == null || !group.planGroupKey().startsWith("new:")))) return null;
            String name = group.name() == null ? "" : group.name().trim();
            if (!names.add(name.toLowerCase(Locale.ROOT))) return null;
            if (group.newGroup() && (name.length() < 2 || name.length() > 100
                    || original.values().stream().anyMatch(g -> g.getName().equalsIgnoreCase(name)))) return null;
            Set<Long> memberIds = new HashSet<>();
            List<GroupMemberDTO> canonical = new ArrayList<>();
            int leaderCount = 0;
            for (var member : group.members()) {
                var actual = students.get(member.getStudentId());
                if (actual == null || !seen.add(actual.getStudentId())) return null;
                memberIds.add(actual.getStudentId()); canonical.add(actual);
                if (member.getRole() == GroupMemberRole.LEADER) {
                    if (!Objects.equals(member.getStudentId(), group.leaderId())) return null;
                    leaderCount++;
                } else if (member.getRole() != GroupMemberRole.MEMBER) return null;
                var from = origins.get(actual.getStudentId());
                if (from != null && !Objects.equals(from.getId(), group.groupId())) moves++;
            }
            if (leaderCount != 1 || !memberIds.contains(group.leaderId())) return null;
            if (group.newGroup() && !Objects.equals(group.leaderId(), memberIds.stream().min(Long::compareTo).orElseThrow())) return null;
            if (fixed) {
                protectedCount++;
                if (!Objects.equals(old.getLeaderId(), group.leaderId()) || !ids(old.getMembers()).equals(memberIds)) return null;
                Map<Long, GroupMemberRole> roles = old.getMembers().stream().collect(Collectors.toMap(GroupMemberDTO::getStudentId, GroupMemberDTO::getRole));
                if (group.members().stream().anyMatch(m -> roles.get(m.getStudentId()) != m.getRole())) return null;
            }
            // All enabled rules must pass for a recommendation, including protected groups and rules labelled soft.
            if (!validator.areAllRulesPassed(validator.evaluateRules(snapshot.rules(), canonical))) return null;
            if (old != null && draft(old.getStatus()) && ids(old.getMembers()).equals(memberIds)
                    && validator.areAllRulesPassed(validator.evaluateRules(snapshot.rules(), old.getMembers()))) preserved++;
            if (old != null && Objects.equals(old.getLeaderId(), group.leaderId())) leaders++;
            pairs += SmartAllocationService.majorConcentration(canonical);
            var majorCounts = canonical.stream().map(GroupMemberDTO::getMajorId).filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
            if (majorCounts.values().stream().anyMatch(n -> n >= 3)) three++;
            if (majorCounts.values().stream().anyMatch(n -> n >= 4)) four++;
            unknown += (int) canonical.stream().filter(m -> m.getMajorId() == null).count();
            var score = scores.evaluateRules(snapshot.rules(), canonical);
            if (score.applicable() && score.scorePercent() != null) { scoreSum += score.scorePercent(); scored++; }
        }
        if (!seen.equals(students.keySet()) || original.values().stream().anyMatch(g -> !draft(g.getStatus()) && !kept.contains(g.getId()))
                || plan.stream().filter(GroupView::newGroup).count() != Math.max(0, target - original.size())) return null;
        long lower = students.values().stream().map(GroupMemberDTO::getMajorId).filter(Objects::nonNull)
            .collect(Collectors.groupingBy(Function.identity(), Collectors.counting())).values().stream()
            .mapToLong(n -> { long q = n / target, r = n % target; return target * q * (q - 1) / 2 + r * q; }).sum();
        var distribution = plan.stream().collect(Collectors.groupingBy(g -> g.members().size(), TreeMap::new, Collectors.counting()))
            .entrySet().stream().map(e -> new SizeCount(e.getKey(), e.getValue().intValue())).toList();
        return new Metrics(seen.size(), target, distribution, distribution.getLast().members() - distribution.getFirst().members(),
            pairs, lower, pairs - lower, three, four, unknown, preserved, validBefore, leaders, original.size(), moves,
            students.size() - origins.size(), protectedCount, scored == 0 ? null : Math.round(scoreSum / scored * 10.0) / 10.0);
    }

    private static Set<Long> ids(List<GroupMemberDTO> members) { return members.stream().map(GroupMemberDTO::getStudentId).collect(Collectors.toSet()); }
    private static boolean draft(GroupStatus status) { return status == GroupStatus.OPEN || status == GroupStatus.REVOKED; }
    private static int compareQuality(Metrics a, Metrics b) {
        int cmp = Long.compare(a.excessMajorPairs(), b.excessMajorPairs());
        if (cmp == 0) cmp = Integer.compare(b.validDraftsPreserved(), a.validDraftsPreserved());
        if (cmp == 0) cmp = Integer.compare(b.leadersPreserved(), a.leadersPreserved());
        if (cmp == 0) cmp = Integer.compare(a.movedStudents(), b.movedStudents());
        // Group Score and candidate Compatibility Score are diagnostic, not additional weighted terms:
        // eligibility has already checked the same rules. Admission utility is not comparable across targets.
        return cmp;
    }
    private static List<Reason> reasons(Candidate selected, int equivalent) {
        Metrics m = selected.metrics();
        List<Reason> reasons = new ArrayList<>();
        reasons.add(reason(ALL_RULES_PASSED, Map.of("groups", m.groups())));
        reasons.add(reason(BALANCED_SIZES, Map.of("difference", m.sizeDifference())));
        reasons.add(reason(MAJOR_DISTRIBUTION, Map.of("excess", m.excessMajorPairs(), "three", m.groupsWithThreePlusSameMajor(), "four", m.groupsWithFourPlusSameMajor())));
        if (m.groupsWithThreePlusSameMajor() > 0) reasons.add(reason(MAJOR_CONCENTRATION_REMAINS, Map.of("three", m.groupsWithThreePlusSameMajor(), "four", m.groupsWithFourPlusSameMajor())));
        if (m.unknownMajorStudents() > 0) reasons.add(reason(UNKNOWN_MAJORS, Map.of("students", m.unknownMajorStudents())));
        if (m.validDraftsBefore() > 0) reasons.add(reason(VALID_DRAFTS_PRESERVED, Map.of("preserved", m.validDraftsPreserved(), "total", m.validDraftsBefore())));
        if (m.leadersBefore() > 0) {
            reasons.add(reason(LEADERS_PRESERVED, Map.of("preserved", m.leadersPreserved(), "total", m.leadersBefore())));
            reasons.add(reason(STUDENT_MOVEMENTS, Map.of("students", m.movedStudents())));
        }
        if (m.unassignedAllocated() > 0) reasons.add(reason(UNASSIGNED_ALLOCATED, Map.of("students", m.unassignedAllocated())));
        if (m.protectedGroups() > 0) reasons.add(reason(PROTECTED_UNCHANGED, Map.of("groups", m.protectedGroups())));
        if (m.averageGroupScore() != null) reasons.add(reason(GROUP_SCORE, Map.of("score", m.averageGroupScore())));
        if (equivalent > 1) reasons.add(reason(EQUIVALENT_PLANS, Map.of("plans", equivalent)));
        if (!selected.searchComplete()) reasons.add(reason(SEARCH_NOT_EXHAUSTIVE, Map.of()));
        return List.copyOf(reasons);
    }
    private static Reason reason(ReasonCode code, Map<String, Number> parameters) { return new Reason(code, parameters); }
}
