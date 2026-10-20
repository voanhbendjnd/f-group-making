package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.service.dto.AllocationPreviewDTO.*;
import com.fmaking.service.dto.AllocationResultDTO.Reason;
import com.fmaking.service.dto.AllocationResultDTO.ReasonCode;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.fmaking.domain.GroupingRuleCode.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class AllocationPreviewService {
    private final SchoolClassRepository classes;
    private final DeadlineRepository deadlines;
    private final StudentRepository students;
    private final GroupRepository groups;
    private final GroupMemberRepository memberships;
    private final SchoolClassAccessService access;
    private final DeadlinePolicy deadlinePolicy;
    private final GroupRuleValidationService validator;
    private final GroupScoreService scores;
    private final SmartAllocationService engine;
    private final ObjectMapper mapper;
    private final AllocationPreviewStore previewStore;
    private final GroupInvitationRepository invitations;
    private final SecureRandom seeds = new SecureRandom();

    public AllocationPreviewService(SchoolClassRepository classes, DeadlineRepository deadlines, StudentRepository students,
            GroupRepository groups, GroupMemberRepository memberships, SchoolClassAccessService access,
            DeadlinePolicy deadlinePolicy, GroupRuleValidationService validator, GroupScoreService scores,
            SmartAllocationService engine, ObjectMapper mapper, AllocationPreviewStore previewStore, GroupInvitationRepository invitations) {
        this.classes = classes; this.deadlines = deadlines; this.students = students; this.groups = groups;
        this.memberships = memberships; this.access = access; this.deadlinePolicy = deadlinePolicy;
        this.validator = validator; this.scores = scores; this.engine = engine; this.mapper = mapper; this.previewStore = previewStore;
        this.invitations = invitations;
    }

    public Overview overview(Integer deadlineId, Integer classId) { return overview(load(deadlineId, classId)); }

    public Setup setup(Integer deadlineId, Integer classId, Long requestedSeed) {
        Loaded loaded = load(deadlineId, classId);
        long seed = seed(requestedSeed);
        Overview overview = overview(loaded);
        var limits = SmartAllocationService.SearchLimits.defaults();
        return new Setup(loaded.scope(), loaded.fingerprint(), seed, overview.summary(), engine.preliminaryRange(loaded.snapshot()),
            engine.suggest(loaded.snapshot(), seed), new SmartLimits(limits.maximumNodes(), limits.maximumDepth(), false), overview.warnings());
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public AllocationPreviewDTO preview(Integer deadlineId, Integer classId, AllocationPreviewRequest request) {
        if (request == null || request.targetGroupCount() == null || request.targetGroupCount() < 1)
            throw new BadRequestAlertException("Positive target required", "allocation", "invalidAllocationTarget");
        Loaded loaded = load(deadlineId, classId);
        long seed = seed(request.seed());
        Overview before = overview(loaded);
        var result = engine.allocate(loaded.snapshot(), request.targetGroupCount(), seed);
        boolean feasible = result.status() == AllocationResultDTO.Status.FEASIBLE;
        List<GroupView> proposed = feasible ? result.groups().stream().map(group -> view(loaded.snapshot().rules(), group.groupId(),
            group.name(), group.status(), group.leaderId(), group.members(), result.groups().size())).toList() : List.of();
        String planFingerprint = feasible ? planFingerprint(loaded.fingerprint(), proposed) : null;
        boolean same = feasible && planFingerprint.equals(request.previousPlanFingerprint());
        List<Reason> warnings = new ArrayList<>(before.warnings()); warnings.addAll(result.reasons());
        if (same) warnings.add(new Reason(ReasonCode.SAME_AS_PREVIOUS_PLAN, Map.of()));
        var summary = new SearchSummary(result.status(), result.targetGroupCount(), seed, result.range(),
            warnings.stream().distinct().toList(), result.visitedNodes(), result.searchComplete(), result.optimization());
        var response = new AllocationPreviewDTO(loaded.scope(), loaded.fingerprint(), planFingerprint, same, summary, proposed,
            feasible ? report(before, proposed, result.disbandedGroupIds()) : null, null, null, null);
        return feasible ? previewStore.store(response) : response;
    }

    public record Captured(Overview overview, AllocationSnapshotDTO snapshot) {}
    public Captured capture(Integer deadlineId, Integer classId) {
        Loaded loaded = load(deadlineId, classId);
        return new Captured(overview(loaded), loaded.snapshot());
    }
    public String planFingerprint(String snapshotFingerprint, List<GroupView> proposed) {
        return hash(new PlanIdentity(snapshotFingerprint, proposed.stream().sorted(Comparator.comparing(GroupView::groupId)).map(group ->
            new Assignment(group.groupId(), group.status(), group.leaderId(), group.members().stream().map(GroupMemberDTO::getStudentId).sorted().toList())).toList()));
    }

    private record Loaded(Scope scope, AllocationSnapshotDTO snapshot, String fingerprint) {}
    private record FingerprintData(String format, Scope scope, String storedDeadlineStatus, Instant baseEndTime,
                                   List<GroupingRuleDTO> rules, List<GroupMemberDTO> students, List<GroupDTO> groups, List<InvitationState> invitations) {}
    private record InvitationState(Long id, Long groupId, Long studentId, Long inviterId, Instant createdAt) {}
    private record Assignment(Long groupId, GroupStatus status, Long leaderId, List<Long> members) {}
    private record PlanIdentity(String snapshotFingerprint, List<Assignment> assignments) {}

    private Loaded load(Integer deadlineId, Integer classId) {
        if (classId == null || deadlineId == null || classId < 1 || deadlineId < 1)
            throw new BadRequestAlertException("Invalid class/session", "allocation", "invalidAllocationScope");
        SchoolClass schoolClass = classes.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        // Allocation is a management tool: Master has no additional access to another lecturer's class.
        access.requireWriteAccess(schoolClass);
        Deadline deadline = deadlines.findById(deadlineId)
            .orElseThrow(() -> new NotFoundAlertException("Deadline not found", "deadline", "ERR_DEADLINE_NOT_FOUND"));
        if (deadlines.countByDeadlineIdAndClassId(deadlineId, classId) != 1)
            throw new ForbiddenAlertException("Deadline not in class", "deadline", "ERR_DEADLINE_NOT_IN_CLASS");
        if (deadlines.findAllBySchoolClassId(classId).size() != 1) throw conflict();

        List<StudentRow> rows = students.findStudentsBySchoolClassId(classId);
        if (students.countBySchoolClassId(classId) != rows.size()) throw conflict();
        Map<Long, GroupMemberDTO> studentMap = new TreeMap<>();
        Map<Long, StudentRow> rowsById = new HashMap<>();
        for (var row : rows) {
            var dto = student(row);
            if (studentMap.putIfAbsent(row.userId(), dto) != null) throw conflict();
            rowsById.put(row.userId(), row);
        }
        List<Group> stored = groups.findBySchoolClassIdAndDeadlineId(classId, deadlineId).stream()
            .sorted(Comparator.comparing(Group::getId)).toList();
        Map<Long, Group> groupMap = stored.stream().collect(Collectors.toMap(Group::getId, Function.identity()));
        var memberRows = memberships.findAllocationMemberships(classId, deadlineId, new ArrayList<>(groupMap.keySet()), new ArrayList<>(studentMap.keySet()));
        Map<Long, List<GroupMemberDTO>> byGroup = new HashMap<>();
        for (var member : memberRows) {
            if (!Objects.equals(member.getSchoolClassId(), classId) || !Objects.equals(member.getDeadlineId(), deadlineId)
                || !groupMap.containsKey(member.getGroupId()) || !studentMap.containsKey(member.getStudentId())) throw conflict();
            var dto = student(rowsById.get(member.getStudentId()));
            dto.setId(member.getId()); dto.setGroupId(member.getGroupId()); dto.setRole(member.getRole()); dto.setJoinedAt(member.getJoinedAt());
            byGroup.computeIfAbsent(member.getGroupId(), id -> new ArrayList<>()).add(dto);
        }
        List<GroupDTO> groupDtos = stored.stream().map(group -> GroupDTO.builder().id(group.getId()).name(group.getName())
            .schoolClassId(group.getSchoolClassId()).deadlineId(group.getDeadlineId()).leaderId(group.getLeaderId())
            .status(group.getStatus()).version(group.getVersion()).rejectReason(group.getRejectReason())
            .submittedRulesVersion(group.getSubmittedRulesVersion()).isLecturerCreated(group.getIsLecturerCreated())
            .members(byGroup.getOrDefault(group.getId(), List.of()).stream().sorted(Comparator.comparing(GroupMemberDTO::getStudentId)).toList()).build()).toList();
        List<GroupingRuleDTO> rules = validator.getClassRules(classId);
        var snapshot = new AllocationSnapshotDTO(classId, deadlineId, List.copyOf(studentMap.values()), groupDtos, rules);
        try { engine.preliminaryRange(snapshot); } // Structural validation, not a claim of target feasibility.
        catch (IllegalArgumentException exception) { throw conflict(); }
        var scope = new Scope(classId, schoolClass.getName(), schoolClass.getTermId(), schoolClass.getLecturerId(), schoolClass.getRulesVersion(),
            deadlineId, deadline.getName(), deadlinePolicy.status(deadline, classId).name(), deadline.getStartTime(), deadline.endTimeFor(classId), deadline.getVersion());
        var pending = invitations.findBySchoolClassIdAndDeadlineIdAndStatus(classId, deadlineId, GroupInvitationStatus.PENDING).stream()
            .sorted(Comparator.comparing(GroupInvitation::getId)).map(inv -> new InvitationState(inv.getId(), inv.getGroupId(), inv.getStudentId(), inv.getInviterId(), inv.getCreatedAt())).toList();
        return new Loaded(scope, snapshot, hash(new FingerprintData("allocation-snapshot-v2", scope, deadline.getStatus(),
            deadline.getEndTime(), rules, snapshot.students(), groupDtos, pending)));
    }

    private Overview overview(Loaded loaded) {
        var snapshot = loaded.snapshot();
        List<GroupDTO> active = snapshot.groups().stream().filter(group -> group.getStatus() != GroupStatus.DISBANDED).toList();
        List<GroupView> views = active.stream().map(group -> view(snapshot.rules(), group.getId(), group.getName(), group.getStatus(),
            group.getLeaderId(), group.getMembers(), active.size())).toList();
        Set<Long> assigned = active.stream().flatMap(group -> group.getMembers().stream()).map(GroupMemberDTO::getStudentId).collect(Collectors.toSet());
        var unassigned = snapshot.students().stream().filter(student -> !assigned.contains(student.getStudentId())).toList();
        int valid = (int) views.stream().filter(GroupView::allRulesPassed).count();
        int fixed = (int) views.stream().filter(GroupView::protectedGroup).count();
        List<Reason> warnings = views.stream().filter(group -> group.protectedGroup() && !group.allRulesPassed())
            .map(group -> new Reason(ReasonCode.PROTECTED_RULE_WARNING, Map.of("actual", group.groupId(), "required", 0L))).toList();
        return new Overview(loaded.scope(), loaded.fingerprint(), new Summary(snapshot.students().size(), active.size(), unassigned.size(),
            valid, active.size() - valid, fixed), snapshot.rules(), views, unassigned, warnings);
    }

    private GroupView view(List<GroupingRuleDTO> rules, Long id, String name, GroupStatus status, Long leader,
            List<GroupMemberDTO> members, int groupCount) {
        List<RuleView> evaluations = new ArrayList<>(validator.evaluateRules(rules, members).stream().map(rule ->
            new RuleView(rule.getCode(), RuleScope.GROUP, rule.getActualValue(), rule.getTargetValue(), rule.isPassed(), rule.isHardRule())).toList());
        rules.stream().filter(rule -> rule.status() && (rule.code() == MIN_GROUPS_PER_CLASS || rule.code() == MAX_GROUPS_PER_CLASS))
            .forEach(rule -> evaluations.add(new RuleView(rule.code(), RuleScope.CLASS, groupCount, rule.value(),
                rule.code() == MIN_GROUPS_PER_CLASS ? groupCount >= rule.value() : groupCount <= rule.value(), false)));
        String leaderName = members.stream().filter(member -> member.getStudentId().equals(leader)).map(GroupMemberDTO::getFullName).findFirst().orElse(null);
        return new GroupView(id, name, status, leader, leaderName, status == GroupStatus.PENDING || status == GroupStatus.ACCEPTED,
            members, scores.evaluateRules(rules, members), List.copyOf(evaluations), evaluations.stream().allMatch(RuleView::passed));
    }

    private Report report(Overview before, List<GroupView> after, List<Long> disbanded) {
        Map<Long, GroupView> original = before.groups().stream().collect(Collectors.toMap(GroupView::groupId, Function.identity()));
        Map<Long, GroupView> proposed = after.stream().collect(Collectors.toMap(GroupView::groupId, Function.identity()));
        Map<Long, GroupView> origins = new HashMap<>();
        before.groups().forEach(group -> group.members().forEach(member -> origins.put(member.getStudentId(), group)));
        List<Movement> movements = new ArrayList<>(); List<LeaderChange> leaders = new ArrayList<>();
        for (var group : after) {
            var old = original.get(group.groupId());
            if (!Objects.equals(old.leaderId(), group.leaderId())) leaders.add(new LeaderChange(group.groupId(), old.leaderId(),
                old.leaderName(), group.leaderId(), group.leaderName()));
            for (var member : group.members()) {
                var from = origins.get(member.getStudentId());
                if (from == null || !from.groupId().equals(group.groupId())) movements.add(new Movement(member.getStudentId(), member.getFullName(),
                    member.getRollNumber(), from == null ? null : from.groupId(), from == null ? null : from.name(), group.groupId(), group.name(), from == null));
            }
        }
        List<GroupChange> changes = before.groups().stream().map(old -> {
            var updated = proposed.get(old.groupId());
            return new GroupChange(old.groupId(), old.name(), old.protectedGroup(), updated == null,
                old.leaderId(), old.leaderName(), updated == null ? null : updated.leaderId(), updated == null ? null : updated.leaderName(), old.score(),
                updated == null ? null : updated.score(), old.rules(), updated == null ? List.of() : updated.rules());
        }).toList();
        return new Report(before.summary().totalGroups(), after.size(), before.summary().totalStudents(),
            after.stream().mapToInt(group -> group.members().size()).sum(), before.summary().unassignedStudents(), 0,
            after.stream().map(GroupView::groupId).toList(), disbanded, List.of(),
            after.stream().filter(GroupView::protectedGroup).map(GroupView::groupId).toList(), List.copyOf(movements), List.copyOf(leaders), changes);
    }

    private static GroupMemberDTO student(StudentRow row) {
        // Deliberately do not serialize the StudentRow: it also contains activation credentials.
        return GroupMemberDTO.builder().studentId(row.userId()).fullName(row.fullName()).rollNumber(row.rollNumber())
            .memberCode(row.memberCode()).email(row.email()).majorId(row.majorId()).majorCode(row.majorCode())
            .majorName(row.majorName()).selfDescription(row.selfDescription()).role(GroupMemberRole.MEMBER).build();
    }

    private String hash(Object canonicalData) {
        try {
            byte[] payload = mapper.writeValueAsString(canonicalData).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Cannot fingerprint allocation snapshot", exception);
        }
    }

    private static ConflictAlertException conflict() {
        return new ConflictAlertException("Allocation source data is inconsistent; refresh or review memberships/session", "allocation", "allocationDataConflict");
    }

    private long seed(Long requested) {
        if (requested == null) return seeds.nextLong(AllocationPreviewRequest.MAX_SAFE_SEED + 1);
        if (requested < -AllocationPreviewRequest.MAX_SAFE_SEED || requested > AllocationPreviewRequest.MAX_SAFE_SEED)
            throw new BadRequestAlertException("Seed must be a JavaScript-safe integer", "allocation", "invalidAllocationSeed");
        return requested;
    }
}
