package com.fmaking.service;

import com.fmaking.domain.GroupMemberRole;
import com.fmaking.domain.GroupStatus;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.service.dto.*;
import com.fmaking.service.dto.AllocationResultDTO.*;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.fmaking.domain.GroupingRuleCode.*;
import static com.fmaking.service.dto.AllocationResultDTO.ReasonCode.*;
import static com.fmaking.service.dto.AllocationResultDTO.Status.*;

/** Bounded, deterministic, in-memory search. No repository, events, authorization or persistence side effects. */
@Service
public class SmartAllocationService {
    private final GroupRuleValidationService validator;
    private final GroupScoreService scores;

    public SmartAllocationService(GroupRuleValidationService validator, GroupScoreService scores) {
        this.validator = validator;
        this.scores = scores;
    }

    /** Runtime safeguards, not business limits. Exhaustion never proves infeasibility. */
    public record SearchLimits(long maximumNodes, int maximumDepth) {
        public SearchLimits {
            if (maximumNodes < 1 || maximumDepth < 1) throw new IllegalArgumentException("Invalid search limits");
        }
        public static SearchLimits defaults() { return new SearchLimits(100000, 256); }
    }

    public PreliminaryRange preliminaryRange(AllocationSnapshotDTO snapshot) {
        return range(new Context(snapshot));
    }

    public AllocationResultDTO allocate(AllocationSnapshotDTO snapshot, int target, long seed) {
        return allocate(snapshot, target, seed, SearchLimits.defaults());
    }

    public AllocationResultDTO allocate(AllocationSnapshotDTO snapshot, int target, long seed, SearchLimits limits) {
        Objects.requireNonNull(limits, "limits");
        Context context = new Context(snapshot);
        PreliminaryRange range = range(context);
        List<Reason> failures = targetFailures(context, target);
        if (!failures.isEmpty()) return result(PROVEN_INFEASIBLE, target, seed, range, List.of(), List.of(), failures, 0, true, null);
        if (context.pool.size() + context.drafts.size() > limits.maximumDepth()) {
            return result(SEARCH_LIMIT_REACHED, target, seed, range, List.of(), List.of(),
                List.of(reason(SEARCH_DEPTH_LIMIT, context.pool.size() + context.drafts.size(), limits.maximumDepth())), 0, false, null);
        }
        Search search = new Search(context, target, seed, limits);
        search.select(0, new ArrayList<>());
        if (search.best == null) return result(search.limited ? SEARCH_LIMIT_REACHED : PROVEN_INFEASIBLE,
            target, seed, range, List.of(), List.of(), List.of(reason(search.limited ? SEARCH_BUDGET_EXHAUSTED : NO_PARTITION,
                search.nodes, limits.maximumNodes())), search.nodes, !search.limited, null);
        var reasons = new ArrayList<>(context.warnings);
        if (search.limited) reasons.add(reason(SEARCH_BUDGET_EXHAUSTED, search.nodes, limits.maximumNodes()));
        return result(FEASIBLE, target, seed, range, search.best, search.disbanded, reasons,
            search.nodes, !search.limited, search.bestObjective);
    }

    /** Only a target with a validated witness may be suggested. Other targets remain unclassified. */
    public Suggestion suggest(AllocationSnapshotDTO snapshot, long seed) {
        Context context = new Context(snapshot);
        PreliminaryRange range = range(context);
        if (!range.hasCandidates()) return new Suggestion(null, PROVEN_INFEASIBLE, range.reasons(), List.of());
        int preferred = context.groups.size();
        if (context.validDraftIds.size() != context.drafts.size()) {
            int average = context.maximumMembers == Integer.MAX_VALUE ? context.minimumMembers
                : (int) (((long) context.minimumMembers + context.maximumMembers) / 2);
            preferred = context.protectedGroups.size() + ceil(context.pool.size(), Math.max(1, average));
        }
        final int desired = preferred;
        List<Integer> candidates = new ArrayList<>();
        for (int count = range.minimum(); count <= range.maximum(); count++) candidates.add(count);
        candidates.sort(Comparator.comparingInt((Integer count) -> Math.abs(count - desired)).thenComparingInt(Integer::intValue));
        List<CheckedTarget> checked = new ArrayList<>();
        boolean unknown = false;
        // Bound the entire suggestion operation as well as each target search.
        for (int count : candidates.stream().limit(12).toList()) {
            var allocation = allocate(snapshot, count, seed);
            checked.add(new CheckedTarget(count, allocation.status()));
            if (allocation.status() == FEASIBLE) return new Suggestion(count, FEASIBLE,
                List.of(reason(VALIDATED_SUGGESTION, count, context.students.size()),
                    reason(SUGGESTED_BALANCED_SIZE, context.pool.size(), count - context.protectedGroups.size()),
                    reason(SUGGESTED_PRESERVES_VALID_GROUPS, allocation.optimization().validGroupsPreserved(), context.validDraftIds.size()),
                    reason(PROTECTED_COUNTS_INCLUDED, context.protectedGroups.size(), count)), List.copyOf(checked));
            unknown |= allocation.status() == SEARCH_LIMIT_REACHED;
        }
        Status status = unknown || checked.size() < candidates.size() ? SEARCH_LIMIT_REACHED : PROVEN_INFEASIBLE;
        return new Suggestion(null, status, List.of(reason(NO_CONFIRMED_SUGGESTION, checked.size(), candidates.size())), List.copyOf(checked));
    }

    private PreliminaryRange range(Context c) {
        int fixed = c.protectedGroups.size();
        int lower = Math.max(1, Math.max(c.minimumGroups, fixed + ceil(c.pool.size(), c.maximumMembers)));
        int upper = Math.min(c.maximumGroups, fixed + Math.min(c.drafts.size(), c.pool.size() / c.minimumMembers));
        if (c.minimumSe > 0) upper = Math.min(upper, fixed + (int) (c.pool.stream().filter(SmartAllocationService::isSe).count() / c.minimumSe));
        List<Reason> reasons = new ArrayList<>();
        Map<Integer, Long> majorCounts = c.pool.stream().filter(s -> s.getMajorId() != null)
            .collect(Collectors.groupingBy(GroupMemberDTO::getMajorId, Collectors.counting()));
        while (upper >= lower && upper > fixed) {
            int editable = upper - fixed;
            long coverage = majorCounts.values().stream().mapToLong(count -> Math.min(count, editable)).sum();
            if (coverage >= (long) editable * c.minimumMajors) break;
            upper--;
        }
        if (c.minimumMembers > c.maximumMembers || c.minimumMajors > c.maximumMajors) {
            upper = lower - 1;
            reasons.add(reason(RULE_BOUNDS_CONFLICT, 0, 0));
        }
        if (lower > upper) {
            reasons.addAll(targetFailures(c, lower));
        } else {
            while (lower <= upper && !balancedTarget(c, lower)) lower++;
            while (upper >= lower && !balancedTarget(c, upper)) upper--;
            if (lower > upper) reasons.add(reason(BALANCED_SIZE_CONFLICT, c.students.size(), 1));
            // This is intentionally not a claim that all intermediate targets are feasible.
            reasons.add(reason(PRELIMINARY_ONLY, lower, upper));
        }
        return new PreliminaryRange(lower, upper, fixed, c.pool.size(), List.copyOf(reasons));
    }

    private List<Reason> targetFailures(Context c, int target) {
        List<Reason> reasons = new ArrayList<>();
        int fixed = c.protectedGroups.size();
        int editable = target - fixed;
        if (target < 1) reasons.add(reason(TARGET_MUST_BE_POSITIVE, target, 1));
        if (editable < 0) reasons.add(reason(TARGET_BELOW_PROTECTED, target, fixed));
        if (target > c.groups.size()) reasons.add(reason(NEW_GROUPS_NOT_ALLOWED, target, c.groups.size()));
        if (target < c.minimumGroups || target > c.maximumGroups) reasons.add(reason(CLASS_GROUP_BOUND, target,
            target < c.minimumGroups ? c.minimumGroups : c.maximumGroups));
        if (c.minimumMembers > c.maximumMembers || c.minimumMajors > c.maximumMajors) reasons.add(reason(RULE_BOUNDS_CONFLICT, 0, 0));
        if (target > 0 && !balancedTarget(c, target)) reasons.add(reason(BALANCED_SIZE_CONFLICT, c.students.size(), target));
        if (editable == 0 && !c.pool.isEmpty()) reasons.add(reason(NO_EDITABLE_GROUP, c.pool.size(), 0));
        if (editable > 0) {
            if ((long) editable * c.maximumMembers < c.pool.size()) reasons.add(reason(MEMBER_CAPACITY, c.pool.size(), (long) editable * c.maximumMembers));
            if ((long) editable * c.minimumMembers > c.pool.size()) reasons.add(reason(INSUFFICIENT_MEMBERS, c.pool.size(), (long) editable * c.minimumMembers));
            long se = c.pool.stream().filter(SmartAllocationService::isSe).count();
            if (se < (long) editable * c.minimumSe) reasons.add(reason(INSUFFICIENT_SE, se, (long) editable * c.minimumSe));
            Map<Integer, Long> majors = c.pool.stream().map(GroupMemberDTO::getMajorId).filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
            long coverage = majors.values().stream().mapToLong(count -> Math.min(count, editable)).sum();
            if (coverage < (long) editable * c.minimumMajors) reasons.add(reason(INSUFFICIENT_MAJORS, coverage, (long) editable * c.minimumMajors));
        }
        return reasons;
    }

    private boolean balancedTarget(Context c, int target) {
        int low = AllocationBalancePolicy.minimumSize(c.students.size(), target);
        int high = AllocationBalancePolicy.maximumSize(c.students.size(), target);
        if (c.protectedGroups.stream().anyMatch(g -> g.members().size() < low || g.members().size() > high)) return false;
        int editable = target - c.protectedGroups.size();
        if (editable < 0 || low < 1) return false;
        int minimum = Math.max(c.minimumMembers, low), maximum = Math.min(c.maximumMembers, high);
        return editable == 0 ? c.pool.isEmpty()
            : minimum <= maximum && (long) minimum * editable <= c.pool.size() && (long) maximum * editable >= c.pool.size();
    }

    private final class Context {
        final List<GroupingRuleDTO> rules;
        final Map<Long, GroupMemberDTO> students = new TreeMap<>();
        final List<ExistingGroup> groups = new ArrayList<>(), drafts = new ArrayList<>(), protectedGroups = new ArrayList<>();
        final Map<Long, Long> origins = new HashMap<>();
        final Set<Long> validDraftIds = new HashSet<>();
        final List<GroupMemberDTO> pool;
        final List<Reason> warnings = new ArrayList<>();
        final int minimumMembers, maximumMembers, minimumMajors, maximumMajors, minimumSe, minimumGroups, maximumGroups;

        Context(AllocationSnapshotDTO snapshot) {
            Objects.requireNonNull(snapshot, "snapshot");
            if (snapshot.classId() == null || snapshot.deadlineId() == null || snapshot.classId() < 1 || snapshot.deadlineId() < 1)
                throw invalid("Invalid class/session");
            var configured = new EnumMap<GroupingRuleCode, GroupingRuleDTO>(GroupingRuleCode.class);
            for (var rule : Objects.requireNonNull(snapshot.rules(), "rules")) {
                if (rule == null || rule.code() == null || rule.value() == null || rule.status() == null
                    || rule.value() < rule.code().getMinimumValue() || configured.put(rule.code(), rule) != null) throw invalid("Invalid rules");
            }
            rules = Arrays.stream(GroupingRuleCode.values()).map(code -> configured.getOrDefault(code,
                new GroupingRuleDTO(code, code.getSuggestedValue(), code.isEnabledByDefault()))).toList();
            minimumMajors = bound(MIN_MAJORS_PER_GROUP, 0); maximumMajors = bound(MAX_MAJORS_PER_GROUP, Integer.MAX_VALUE);
            minimumSe = bound(MIN_SE_MEMBERS_PER_GROUP, 0);
            minimumMembers = Math.max(1, Math.max(bound(MIN_MEMBERS_PER_GROUP, 1), Math.max(minimumMajors, minimumSe)));
            maximumMembers = bound(MAX_MEMBERS_PER_GROUP, Integer.MAX_VALUE);
            minimumGroups = bound(MIN_GROUPS_PER_CLASS, 1); maximumGroups = bound(MAX_GROUPS_PER_CLASS, Integer.MAX_VALUE);
            for (var student : Objects.requireNonNull(snapshot.students(), "students")) {
                if (student == null || student.getStudentId() == null || student.getStudentId() < 1
                    || students.put(student.getStudentId(), copy(student)) != null) throw invalid("Duplicate or invalid student");
            }
            Set<Long> ids = new HashSet<>();
            for (var group : Objects.requireNonNull(snapshot.groups(), "groups")) {
                if (group == null || group.getId() == null || group.getId() < 1 || !ids.add(group.getId())
                    || !Objects.equals(group.getSchoolClassId(), snapshot.classId())
                    || !Objects.equals(group.getDeadlineId(), snapshot.deadlineId()) || group.getStatus() == null) throw invalid("Invalid group scope or ID");
                if (group.getStatus() == GroupStatus.DISBANDED) {
                    if (group.getMembers() != null && !group.getMembers().isEmpty()) throw invalid("Disbanded group has members");
                    continue;
                }
                if (group.getMembers() == null || group.getMembers().isEmpty()) throw invalid("Group has no valid leader");
                List<GroupMemberDTO> members = new ArrayList<>();
                int leaders = 0;
                for (var member : group.getMembers()) {
                    if (member == null || !students.containsKey(member.getStudentId())
                        || origins.putIfAbsent(member.getStudentId(), group.getId()) != null
                        || member.getRole() == null || (member.getGroupId() != null && !member.getGroupId().equals(group.getId())))
                        throw invalid("Invalid or duplicate membership");
                    GroupMemberDTO canonical = students.get(member.getStudentId());
                    if (!Objects.equals(member.getMajorId(), canonical.getMajorId())
                        || !Objects.equals(member.getMajorCode(), canonical.getMajorCode())) throw invalid("Inconsistent student academic data");
                    if (member.getRole() == GroupMemberRole.LEADER) {
                        leaders++;
                        if (!Objects.equals(member.getStudentId(), group.getLeaderId())) throw invalid("Leader mismatch");
                    }
                    members.add(copy(member));
                }
                if (leaders != 1) throw invalid("Exactly one leader required");
                ExistingGroup row = new ExistingGroup(group.getId(), group.getName(), group.getStatus(), group.getLeaderId(), List.copyOf(members));
                groups.add(row);
                boolean valid = valid(members);
                if (group.getStatus() == GroupStatus.PENDING || group.getStatus() == GroupStatus.ACCEPTED) {
                    protectedGroups.add(row);
                    if (!valid) warnings.add(reason(PROTECTED_RULE_WARNING, group.getId(), 0));
                } else if (group.getStatus() == GroupStatus.OPEN || group.getStatus() == GroupStatus.REVOKED) {
                    drafts.add(row);
                    if (valid) validDraftIds.add(row.id());
                } else throw invalid("Unsupported group state");
            }
            groups.sort(Comparator.comparing(ExistingGroup::id));
            Set<Long> fixedStudents = protectedGroups.stream().flatMap(g -> g.members().stream()).map(GroupMemberDTO::getStudentId).collect(Collectors.toSet());
            pool = students.values().stream().filter(student -> !fixedStudents.contains(student.getStudentId())).toList();
        }

        int bound(GroupingRuleCode code, int fallback) {
            return rules.stream().filter(rule -> rule.code() == code && rule.status()).mapToInt(GroupingRuleDTO::value).findFirst().orElse(fallback);
        }
        boolean valid(List<GroupMemberDTO> members) { return validator.areAllRulesPassed(validator.evaluateRules(rules, members)); }
    }

    private record ExistingGroup(Long id, String name, GroupStatus status, Long leaderId, List<GroupMemberDTO> members) {}

    private final class Search {
        final Context c; final int target; final SearchLimits limits; final Random random;
        final List<ExistingGroup> candidates; final List<GroupMemberDTO> ordered;
        final int minimumMembers, maximumMembers;
        long nodes; boolean limited;
        List<PlannedGroup> best; List<Long> disbanded; Optimization bestObjective;

        Search(Context c, int target, long seed, SearchLimits limits) {
            this.c = c; this.target = target; this.limits = limits;
            minimumMembers = Math.max(c.minimumMembers, AllocationBalancePolicy.minimumSize(c.students.size(), target));
            maximumMembers = Math.min(c.maximumMembers, AllocationBalancePolicy.maximumSize(c.students.size(), target));
            // Mix nearby seeds before Random's first shuffle (small adjacent seeds otherwise correlate).
            random = new Random(new SplittableRandom(seed).nextLong());
            candidates = new ArrayList<>(c.drafts); candidates.sort(Comparator.comparing(ExistingGroup::id));
            Collections.shuffle(candidates, random);
            candidates.sort(Comparator.comparing((ExistingGroup g) -> !c.validDraftIds.contains(g.id())));
            ordered = new ArrayList<>(c.pool);
            Map<Integer, Long> frequency = c.pool.stream().filter(s -> s.getMajorId() != null)
                .collect(Collectors.groupingBy(GroupMemberDTO::getMajorId, Collectors.counting()));
            Set<Long> leaders = c.drafts.stream().map(ExistingGroup::leaderId).collect(Collectors.toSet());
            Collections.shuffle(ordered, random);
            ordered.sort(Comparator.comparing((GroupMemberDTO s) -> !isSe(s))
                .thenComparingLong(s -> frequency.getOrDefault(s.getMajorId(), Long.MAX_VALUE))
                .thenComparing(s -> !leaders.contains(s.getStudentId())));
        }

        boolean visit() {
            if (nodes >= limits.maximumNodes() || Thread.currentThread().isInterrupted()) { limited = true; return false; }
            nodes++; return true;
        }

        void select(int index, List<ExistingGroup> chosen) {
            if (limited || !visit()) return;
            int need = target - c.protectedGroups.size() - chosen.size();
            if (need < 0 || candidates.size() - index < need) return;
            if (need == 0) {
                List<List<GroupMemberDTO>> slots = new ArrayList<>();
                chosen.forEach(group -> slots.add(new ArrayList<>()));
                assign(0, chosen, slots);
                return;
            }
            if (index == candidates.size()) return;
            chosen.add(candidates.get(index)); select(index + 1, chosen); chosen.removeLast();
            select(index + 1, chosen);
        }

        void assign(int index, List<ExistingGroup> chosen, List<List<GroupMemberDTO>> slots) {
            if (limited || !visit() || !canComplete(index, slots)) return;
            if (index == ordered.size()) { consider(chosen, slots); return; }
            var student = ordered.get(index);
            List<Integer> positions = new ArrayList<>();
            for (int i = 0; i < slots.size(); i++) positions.add(i);
            Collections.shuffle(positions, random);
            positions.sort(Comparator.comparing((Integer i) -> !Objects.equals(c.origins.get(student.getStudentId()), chosen.get(i).id()))
                .thenComparing(Comparator.comparingInt((Integer i) -> admissionUtility(c, slots.get(i), student)).reversed()));
            for (int position : positions) {
                var members = slots.get(position);
                if (members.size() >= maximumMembers) continue;
                Set<Integer> majors = majors(members);
                if (student.getMajorId() != null) majors.add(student.getMajorId());
                if (majors.size() > c.maximumMajors) continue;
                members.add(student); assign(index + 1, chosen, slots); members.removeLast();
                if (limited) return;
            }
        }

        boolean canComplete(int index, List<List<GroupMemberDTO>> slots) {
            int remaining = ordered.size() - index;
            long seLeft = 0; Set<Integer> remainingMajors = new HashSet<>(); int knownMajors = 0;
            for (int j = index; j < ordered.size(); j++) {
                var student = ordered.get(j);
                if (isSe(student)) seLeft++;
                if (student.getMajorId() != null) { remainingMajors.add(student.getMajorId()); knownMajors++; }
            }
            long missingPeople = 0, capacity = 0, missingSe = 0, missingMajors = 0;
            for (var members : slots) {
                missingPeople += Math.max(0, minimumMembers - members.size());
                capacity += (long) maximumMembers - members.size();
                long se = members.stream().filter(SmartAllocationService::isSe).count();
                missingSe += Math.max(0, c.minimumSe - se);
                Set<Integer> majors = majors(members);
                missingMajors += Math.max(0, c.minimumMajors - majors.size());
                majors.addAll(remainingMajors);
                if (majors.size() < c.minimumMajors) return false;
            }
            return missingPeople <= remaining && capacity >= remaining && missingSe <= seLeft && missingMajors <= knownMajors;
        }

        void consider(List<ExistingGroup> chosen, List<List<GroupMemberDTO>> slots) {
            if (slots.stream().anyMatch(members -> members.isEmpty() || !c.valid(members))) return;
            int preserved = 0, leaders = 0, movements = 0; long utility = 0;
            for (int i = 0; i < chosen.size(); i++) {
                var group = chosen.get(i); var members = slots.get(i);
                Set<Long> ids = members.stream().map(GroupMemberDTO::getStudentId).collect(Collectors.toSet());
                if (c.validDraftIds.contains(group.id()) && ids.equals(group.members().stream().map(GroupMemberDTO::getStudentId).collect(Collectors.toSet()))) preserved++;
                Long leader = ids.contains(group.leaderId()) ? group.leaderId()
                    : members.stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow();
                if (leader.equals(group.leaderId())) leaders++;
                for (var student : members) {
                    if (!Objects.equals(c.origins.get(student.getStudentId()), group.id())) movements++;
                    utility += admissionUtility(c, members.stream().filter(s -> !s.getStudentId().equals(student.getStudentId())).toList(), student);
                }
            }
            var objective = new Optimization(preserved, leaders, movements, utility);
            if (bestObjective != null && !better(objective, bestObjective)) return;
            List<PlannedGroup> plan = new ArrayList<>();
            for (var group : c.protectedGroups) plan.add(planned(c, group, group.leaderId(), group.members(), true));
            for (int i = 0; i < chosen.size(); i++) {
                var group = chosen.get(i); var members = slots.get(i);
                Long leader = members.stream().anyMatch(s -> s.getStudentId().equals(group.leaderId())) ? group.leaderId()
                    : members.stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow();
                plan.add(planned(c, group, leader, members, false));
            }
            plan.sort(Comparator.comparing(PlannedGroup::groupId));
            best = List.copyOf(plan); bestObjective = objective;
            Set<Long> retained = chosen.stream().map(ExistingGroup::id).collect(Collectors.toSet());
            disbanded = c.drafts.stream().map(ExistingGroup::id).filter(id -> !retained.contains(id)).sorted().toList();
        }
    }

    private PlannedGroup planned(Context c, ExistingGroup group, Long leader, List<GroupMemberDTO> members, boolean fixed) {
        List<GroupMemberDTO> copies = members.stream().map(member -> {
            var copy = copy(member);
            if (!fixed) {
                copy.setGroupId(group.id());
                copy.setRole(copy.getStudentId().equals(leader) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER);
            }
            return copy;
        }).toList();
        return new PlannedGroup(group.id(), group.name(), group.status(), leader, fixed, copies, scores.evaluateRules(c.rules, copies));
    }

    /** Rule-deficit heuristic, consistent with recommendation priorities; never grants eligibility. Bio is excluded. */
    private static int admissionUtility(Context c, List<GroupMemberDTO> members, GroupMemberDTO student) {
        int score = 50;
        if (isSe(student) && members.stream().filter(SmartAllocationService::isSe).count() < c.minimumSe) score += 40;
        Set<Integer> majors = majors(members);
        if (majors.size() < c.minimumMajors && student.getMajorId() != null && !majors.contains(student.getMajorId())) score += 25;
        if (members.size() < c.bound(MIN_MEMBERS_PER_GROUP, 0)) score += 15;
        return Math.min(100, score);
    }

    private static boolean better(Optimization a, Optimization b) {
        if (a.validGroupsPreserved() != b.validGroupsPreserved()) return a.validGroupsPreserved() > b.validGroupsPreserved();
        if (a.leadersPreserved() != b.leadersPreserved()) return a.leadersPreserved() > b.leadersPreserved();
        if (a.movedStudents() != b.movedStudents()) return a.movedStudents() < b.movedStudents();
        return a.compatibilityUtility() > b.compatibilityUtility();
    }

    private static Set<Integer> majors(List<GroupMemberDTO> members) {
        return members.stream().map(GroupMemberDTO::getMajorId).filter(Objects::nonNull).collect(Collectors.toSet());
    }
    private static boolean isSe(GroupMemberDTO student) { return student.getMajorCode() != null && "SE".equalsIgnoreCase(student.getMajorCode().trim()); }
    private static int ceil(int value, int divisor) { return (int) (((long) value + divisor - 1) / divisor); }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
    private static Reason reason(ReasonCode code, long actual, long required) {
        return new Reason(code, Map.of("actual", actual, "required", required));
    }
    private static AllocationResultDTO result(Status status, int target, long seed, PreliminaryRange range, List<PlannedGroup> groups,
            List<Long> disbanded, List<Reason> reasons, long nodes, boolean complete, Optimization objective) {
        return new AllocationResultDTO(status, target, seed, range, groups, disbanded, List.copyOf(reasons), nodes, complete, objective);
    }
    private static GroupMemberDTO copy(GroupMemberDTO row) {
        return GroupMemberDTO.builder().id(row.getId()).groupId(row.getGroupId()).studentId(row.getStudentId())
            .rollNumber(row.getRollNumber()).fullName(row.getFullName()).email(row.getEmail()).memberCode(row.getMemberCode())
            .majorId(row.getMajorId()).majorCode(row.getMajorCode()).majorName(row.getMajorName()).role(row.getRole())
            .joinedAt(row.getJoinedAt()).selfDescription(row.getSelfDescription()).matchScore(row.getMatchScore())
            .matchReasons(row.getMatchReasons() == null ? null : List.copyOf(row.getMatchReasons())).build();
    }
}
