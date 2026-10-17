package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.RejectGroupRequest;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:group-review-mail;DB_CLOSE_DELAY=-1;MODE=MySQL",
        "spring.jpa.properties.hibernate.cache.use_second_level_cache=false"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class GroupReviewNotificationIntegrationTest {
    @Autowired GroupService service;
    @Autowired UserRepository users;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired DeadlineRepository deadlines;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired MajorRepository majors;
    @Autowired TermRepository terms;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean JavaMailSenderImpl mailSender;
    User teacher;
    User otherTeacher;
    SchoolClass schoolClass;
    Deadline deadline;
    Group group;
    final List<User> groupStudents = new ArrayList<>();

    User account(String name) {
        User user = new User(); user.setEmail(UUID.randomUUID() + "@example.test");
        user.setName(name); user.setActivated(true); return users.saveAndFlush(user);
    }
    void login(User user, String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                user.getEmail(), "test", AuthorityUtils.createAuthorityList(role)));
    }
    @BeforeEach void setup() {
        when(mailSender.createMimeMessage()).thenAnswer(call -> new MimeMessage(Session.getInstance(new Properties())));
        teacher = account("Giảng viên phụ trách"); otherTeacher = account("Giảng viên lớp khác");
        Term term = new Term(); term.setName("M" + UUID.randomUUID().toString().substring(0, 7)); term = terms.saveAndFlush(term);
        schoolClass = new SchoolClass(); schoolClass.setName("EXE102_MAIL"); schoolClass.setTermId(term.getId());
        schoolClass.setLecturerId(teacher.getId()); schoolClass = classes.saveAndFlush(schoolClass);
        SchoolClass other = new SchoolClass(); other.setName("EXE102_OTHER"); other.setTermId(term.getId());
        other.setLecturerId(otherTeacher.getId()); classes.saveAndFlush(other);
        deadline = new Deadline(); deadline.setName("Đợt đăng ký nhóm"); deadline.setStartTime(Instant.now().minusSeconds(60));
        deadline.setEndTime(Instant.now().plusSeconds(3600)); deadline.getSchoolClasses().add(schoolClass);
        deadline = deadlines.saveAndFlush(deadline);
        Major se = majors.findAll().stream().filter(m -> "SE".equals(m.getCode())).findFirst().orElseGet(() -> {
            Major value = new Major(); value.setCode("SE"); value.setName("Software"); return majors.saveAndFlush(value);
        });
        Major otherMajor = new Major(); otherMajor.setCode("M" + UUID.randomUUID().toString().substring(0, 5));
        otherMajor.setName("Other major " + UUID.randomUUID()); otherMajor = majors.saveAndFlush(otherMajor);
        groupStudents.clear();
        for (int i = 0; i < 4; i++) {
            User user = account("Sinh viên " + (i + 1)); groupStudents.add(user);
            Student student = new Student(); student.setUserId(user.getId()); student.setFullName(user.getName());
            student.setRollNumber("SE" + user.getId()); student.setMemberCode("M" + user.getId());
            student.setSchoolClassId(schoolClass.getId()); student.setMajorId(i % 2 == 0 ? se.getId() : otherMajor.getId());
            students.saveAndFlush(student);
        }
        group = new Group(); group.setName("Nhóm Sáng Tạo"); group.setSchoolClassId(schoolClass.getId());
        group.setDeadlineId(deadline.getId()); group.setLeaderId(groupStudents.getFirst().getId()); group = groups.saveAndFlush(group);
        for (int i = 0; i < groupStudents.size(); i++) {
            GroupMember member = new GroupMember(); member.setGroupId(group.getId()); member.setStudentId(groupStudents.get(i).getId());
            member.setSchoolClassId(schoolClass.getId()); member.setDeadlineId(deadline.getId());
            member.setRole(i == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER); member.setJoinedAt(Instant.now());
            members.saveAndFlush(member);
        }
    }
    @AfterEach void clearSecurity() { SecurityContextHolder.clearContext(); }
    void pending() { group.setStatus(GroupStatus.PENDING); group = groups.saveAndFlush(group); }
    void review(boolean accept) {
        if (accept) service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        else {
            RejectGroupRequest request = new RejectGroupRequest(); request.setReason("Cần điều chỉnh chuyên ngành.\nVui lòng trao đổi lại với nhóm.");
            service.rejectGroup(deadline.getId(), schoolClass.getId(), group.getId(), request);
        }
    }
    List<MimeMessage> sent(int count) {
        ArgumentCaptor<MimeMessage> messages = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender, timeout(5000).times(count)).send(messages.capture());
        return messages.getAllValues();
    }

    @Test void studentSubmissionEmailsOnlyAssignedTeacherAfterCommit() throws Exception {
        login(groupStudents.getFirst(), "ROLE_STUDENT");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId());
            verifyNoInteractions(mailSender);
        });
        MimeMessage mail = sent(1).getFirst();
        assertThat(mail.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly(teacher.getEmail());
        assertThat(mail.getSubject()).contains("chờ bạn duyệt", group.getName());
        assertThat((String) mail.getContent()).contains("/lecturer/group-review?", "classId=" + schoolClass.getId(), "termId=" + schoolClass.getTermId());
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.PENDING);
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void reviewEmailsEveryCurrentMemberIncludingLeaderIndividually(boolean accept) throws Exception {
        pending(); login(teacher, "ROLE_LECTURE"); review(accept);
        List<MimeMessage> messages = sent(4);
        List<String> recipients = new ArrayList<>();
        for (MimeMessage mail : messages) {
            assertThat(mail.getRecipients(Message.RecipientType.TO)).hasSize(1);
            assertThat(mail.getRecipients(Message.RecipientType.CC)).isNull();
            assertThat(mail.getRecipients(Message.RecipientType.BCC)).isNull();
            recipients.add(mail.getRecipients(Message.RecipientType.TO)[0].toString());
            String html = (String) mail.getContent();
            assertThat(html).contains(group.getName(), schoolClass.getName(), "/student/groups/select?", "deadlineId=" + deadline.getId());
            if (accept) assertThat(html).contains("Nhóm của bạn đã được duyệt").doesNotContain("Lý do từ chối");
            else assertThat(html).contains("Nhóm của bạn chưa được duyệt", "Lý do từ chối", "Cần điều chỉnh chuyên ngành.");
        }
        assertThat(recipients).containsExactlyInAnyOrderElementsOf(groupStudents.stream().map(User::getEmail).toList());
    }

    @Test void rolledBackSubmissionSendsNoEmail() {
        login(groupStudents.getFirst(), "ROLE_STUDENT");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId()); status.setRollbackOnly();
        });
        verifyNoInteractions(mailSender);
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.OPEN);
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void rolledBackReviewSendsNoEmail(boolean accept) {
        pending(); login(teacher, "ROLE_LECTURE");
        new TransactionTemplate(transactions).executeWithoutResult(status -> { review(accept); status.setRollbackOnly(); });
        verifyNoInteractions(mailSender);
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.PENDING);
    }

    @Test void unauthorizedTeacherCannotTriggerReviewMail() {
        pending(); login(otherTeacher, "ROLE_LECTURE");
        assertThatThrownBy(() -> review(true)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> review(false)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(mailSender);
    }

    @Test void nonLeaderCannotTriggerSubmissionMail() {
        login(groupStudents.get(1), "ROLE_STUDENT");
        assertThatThrownBy(() -> service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(mailSender);
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void repeatedReviewDoesNotEmailMembersAgain(boolean accept) {
        pending(); login(teacher, "ROLE_LECTURE"); review(accept); sent(4);
        clearInvocations(mailSender);
        assertThatThrownBy(() -> review(accept)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(mailSender);
    }

    @Test void submissionWithoutAssignedTeacherStillCommitsWithoutSendingToOtherTeachers() {
        schoolClass.setLecturerId(null); classes.saveAndFlush(schoolClass);
        login(groupStudents.getFirst(), "ROLE_STUDENT");
        service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        verifyNoInteractions(mailSender);
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.PENDING);
    }

    @Test void mailFailureDoesNotUndoApprovalOrPreventOtherRecipients() {
        doThrow(new MailSendException("SMTP unavailable for first recipient")).doNothing().when(mailSender).send(any(MimeMessage.class));
        pending(); login(teacher, "ROLE_LECTURE");
        assertThatCode(() -> review(true)).doesNotThrowAnyException(); sent(4);
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.ACCEPTED);
    }

    @Test void mailUsesRecipientAndContentSnapshotBeforeCommit() throws Exception {
        pending(); login(teacher, "ROLE_LECTURE");
        String originalEmail = groupStudents.getFirst().getEmail();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            review(true);
            User changed = users.findById(groupStudents.getFirst().getId()).orElseThrow();
            changed.setEmail(UUID.randomUUID() + "@example.test"); users.save(changed);
            Group renamed = groups.findById(group.getId()).orElseThrow(); renamed.setName("Renamed after decision"); groups.save(renamed);
            verifyNoInteractions(mailSender);
        });
        List<MimeMessage> messages = sent(4);
        List<String> recipients = new ArrayList<>();
        for (MimeMessage mail : messages) {
            recipients.add(mail.getRecipients(Message.RecipientType.TO)[0].toString());
            assertThat((String) mail.getContent()).contains("Nhóm Sáng Tạo").doesNotContain("Renamed after decision");
        }
        assertThat(recipients).contains(originalEmail);
    }
}
