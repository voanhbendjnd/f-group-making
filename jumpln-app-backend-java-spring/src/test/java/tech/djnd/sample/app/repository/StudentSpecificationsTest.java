package tech.djnd.sample.app.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import jakarta.persistence.EntityManager;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.service.projection.StudentRow;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "djnd.client.base-url=http://localhost:3000",
        "djnd.client.allow-localhost=true"
})
@Transactional
class StudentSpecificationsTest {

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private StudentQueryRepository studentQueryRepository;

    private User activeUser;
    private User pendingUserWithValidKey;
    private User pendingUserWithExpiredKey;
    private User pendingUserWithoutKey;

    @Autowired
    private MajorRepository majorRepository;

    private Student student1;
    private Student student2;
    private Student student3;
    private Student student4;

    @Autowired
    private EntityManager entityManager;

    @BeforeEach
    void setUp() {
        studentRepository.deleteAll();
        userRepository.deleteAll();

        Instant now = Instant.now();

        // 1. Active user
        activeUser = new User();
        activeUser.setEmail("active.student@fpt.edu.vn");
        activeUser.setName("Nguyen Van Active");
        activeUser.setPassword("password123");
        activeUser.setActivated(true);
        activeUser = userRepository.save(activeUser);

        student1 = new Student();
        student1.setUserId(activeUser.getId());
        student1.setRollNumber("SE10001");
        student1.setFullName("Nguyen Van Active");
        student1.setMajorId(majorRepository.findByCode("SE").orElseThrow().getId());
        student1.setMemberCode("MEM001");
        student1 = studentRepository.save(student1);

        // 2. Pending user with valid activation key
        pendingUserWithValidKey = new User();
        pendingUserWithValidKey.setEmail("pending.valid@fpt.edu.vn");
        pendingUserWithValidKey.setName("Tran Thi Pending");
        pendingUserWithValidKey.setPassword("password123");
        pendingUserWithValidKey.setActivated(false);
        pendingUserWithValidKey.setActivationKey("VALIDKEY123");
        pendingUserWithValidKey.setActivationKeyExpiresAt(now.plus(24, ChronoUnit.HOURS));
        pendingUserWithValidKey = userRepository.save(pendingUserWithValidKey);

        student2 = new Student();
        student2.setUserId(pendingUserWithValidKey.getId());
        student2.setRollNumber("IA20002");
        student2.setFullName("Tran Thi Pending");
        student2.setMajorId(majorRepository.findByCode("IA").orElseThrow().getId());
        student2.setMemberCode("MEM002");
        student2 = studentRepository.save(student2);

        // 3. Pending user with expired activation key
        pendingUserWithExpiredKey = new User();
        pendingUserWithExpiredKey.setEmail("expired.key@fpt.edu.vn");
        pendingUserWithExpiredKey.setName("Le Van Expired");
        pendingUserWithExpiredKey.setPassword("password123");
        pendingUserWithExpiredKey.setActivated(false);
        pendingUserWithExpiredKey.setActivationKey("EXPIREDKEY456");
        pendingUserWithExpiredKey.setActivationKeyExpiresAt(now.minus(2, ChronoUnit.HOURS));
        pendingUserWithExpiredKey = userRepository.save(pendingUserWithExpiredKey);

        student3 = new Student();
        student3.setUserId(pendingUserWithExpiredKey.getId());
        student3.setRollNumber("SE30003");
        student3.setFullName("Le Van Expired");
        student3.setMajorId(majorRepository.findByCode("SE").orElseThrow().getId());
        student3.setMemberCode("MEM003");
        student3 = studentRepository.save(student3);

        // 4. Pending user without activation key
        pendingUserWithoutKey = new User();
        pendingUserWithoutKey.setEmail("nokey.user@fpt.edu.vn");
        pendingUserWithoutKey.setName("Pham Van NoKey");
        pendingUserWithoutKey.setPassword("password123");
        pendingUserWithoutKey.setActivated(false);
        pendingUserWithoutKey.setActivationKey(null);
        pendingUserWithoutKey = userRepository.save(pendingUserWithoutKey);

        student4 = new Student();
        student4.setUserId(pendingUserWithoutKey.getId());
        student4.setRollNumber("GD40004");
        student4.setFullName("Pham Van NoKey");
        student4.setMajorId(majorRepository.findByCode("GD").orElseThrow().getId());
        student4.setMemberCode("MEM004");
        student4 = studentRepository.save(student4);
    }

    @Test
    @DisplayName("Should return all students when filters are null or blank")
    void testFindAllNoFilters() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, null, null, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(4);
    }

    @Test
    @DisplayName("Should filter by search roll number")
    void testFilterByRollNumber() {
        Specification<Student> spec = StudentSpecifications.withFilter("SE10001", null, null, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getRollNumber()).isEqualTo("SE10001");
    }

    @Test
    void majorTextMatchesCodeOrNameWhileSelectedIdIsExact() {
        int kt = majorRepository.findByCode("KT").orElseThrow().getId();
        int mkt = majorRepository.findByCode("MKT").orElseThrow().getId();
        student1.setMajorId(kt);
        student2.setMajorId(mkt);
        studentRepository.flush();
        assertThat(studentRepository.findAll(StudentSpecifications.withFilter(null, "kt", null, null, null)))
                .extracting(Student::getUserId).containsExactlyInAnyOrder(student1.getUserId(), student2.getUserId());
        assertThat(studentRepository.findAll(StudentSpecifications.withFilter(null, "kt", kt, null, null)))
                .extracting(Student::getUserId).containsExactly(student1.getUserId());
        assertThat(studentRepository.findAll(StudentSpecifications.withFilter(null, "software engineering", null, null, null)))
                .extracting(Student::getUserId).containsExactly(student3.getUserId());
        assertThat(studentRepository.findAll(StudentSpecifications.withFilter(null, "%", null, null, null))).isEmpty();
        assertThat(studentRepository.findAll(StudentSpecifications.withFilter(null, null, mkt, false, null)))
                .extracting(Student::getUserId).containsExactly(student2.getUserId());
        var page = studentQueryRepository.search(StudentSpecifications.withFilter(null, null, kt, null, null), PageRequest.of(0, 10));
        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent().getFirst().majorCode()).isEqualTo("KT");
        assertThat(page.getContent().getFirst().majorName()).isEqualTo("Korean Studies");
    }

    @Test
    @DisplayName("Should filter by search student full name")
    void testFilterByFullName() {
        Specification<Student> spec = StudentSpecifications.withFilter("Tran Thi", null, null, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getFullName()).isEqualTo("Tran Thi Pending");
    }

    @Test
    @DisplayName("Should filter by search user email via subquery without entity relationship")
    void testFilterByUserEmail() {
        Specification<Student> spec = StudentSpecifications.withFilter("active.student@fpt.edu.vn", null, null, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getUserId()).isEqualTo(activeUser.getId());
    }

    @Test
    @DisplayName("Should filter by major code")
    void testFilterByMajorCode() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, "SE", null, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(2)
                .extracting(Student::getRollNumber)
                .containsExactlyInAnyOrder("SE10001", "SE30003");
    }

    @Test
    @DisplayName("Should filter by activated = true via User subquery")
    void testFilterByActivatedTrue() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, null, true, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getUserId()).isEqualTo(activeUser.getId());
    }

    @Test
    @DisplayName("Should filter by activated = false via User subquery")
    void testFilterByActivatedFalse() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, null, false, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(3)
                .extracting(Student::getUserId)
                .containsExactlyInAnyOrder(
                        pendingUserWithValidKey.getId(),
                        pendingUserWithExpiredKey.getId(),
                        pendingUserWithoutKey.getId()
                );
    }

    @Test
    @DisplayName("Should filter by hasActivationKey = true (key present and unexpired)")
    void testFilterByHasActivationKeyTrue() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, null, null, true);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getUserId()).isEqualTo(pendingUserWithValidKey.getId());
    }

    @Test
    @DisplayName("Should filter by hasActivationKey = false (null or expired key)")
    void testFilterByHasActivationKeyFalse() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, null, null, false);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(3)
                .extracting(Student::getUserId)
                .containsExactlyInAnyOrder(
                        activeUser.getId(),
                        pendingUserWithExpiredKey.getId(),
                        pendingUserWithoutKey.getId()
                );
    }

    @Test
    @DisplayName("Should combine majorCode and activated = false")
    void testCombineMajorAndUnactivated() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, "SE", false, null);
        List<Student> result = studentRepository.findAll(spec);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getRollNumber()).isEqualTo("SE30003");
    }

    @Test
    @DisplayName("Should work with StudentQueryRepository search and pagination")
    void testStudentQueryRepositorySearch() {
        Specification<Student> spec = StudentSpecifications.withFilter(null, "SE", false, null);
        Page<StudentRow> page = studentQueryRepository.search(spec, PageRequest.of(0, 10));

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent()).hasSize(1);
        StudentRow row = page.getContent().get(0);
        assertThat(row.rollNumber()).isEqualTo("SE30003");
        assertThat(row.email()).isEqualTo("expired.key@fpt.edu.vn");
        assertThat(row.activated()).isFalse();
    }

    @Test
    void newestStudentsUseUserCreationTimeAndIdToBreakTies() {
        entityManager.flush();
        entityManager.createNativeQuery("UPDATE users SET created_date = :created")
                .setParameter("created", java.sql.Timestamp.valueOf("2023-01-01 00:00:00")).executeUpdate();
        entityManager.createNativeQuery("UPDATE users SET created_date = :created WHERE id IN (:first, :second)")
                .setParameter("created", java.sql.Timestamp.valueOf("2024-01-01 00:00:00"))
                .setParameter("first", activeUser.getId()).setParameter("second", pendingUserWithValidKey.getId()).executeUpdate();
        var spec = StudentSpecifications.withFilter(null, null, null, null);
        var sort = Sort.by(Sort.Direction.DESC, "createdDate", "userId");
        var firstPage = studentQueryRepository.search(spec, PageRequest.of(0, 2, sort));
        assertThat(firstPage.getContent()).extracting(StudentRow::userId)
                .containsExactly(pendingUserWithValidKey.getId(), activeUser.getId());
        var secondPage = studentQueryRepository.search(spec, PageRequest.of(1, 2, sort));
        assertThat(secondPage.getContent()).extracting(StudentRow::userId)
                .containsExactly(pendingUserWithoutKey.getId(), pendingUserWithExpiredKey.getId());
        assertThat(firstPage.getTotalElements()).isEqualTo(4);
        var explicitSort = studentQueryRepository.search(spec, PageRequest.of(0, 10, Sort.by("rollNumber")));
        assertThat(explicitSort.getContent()).extracting(StudentRow::rollNumber)
                .containsExactly("GD40004", "IA20002", "SE10001", "SE30003");
    }

    @Test
    @DisplayName("Should find student projection by userId")
    void testFindStudentProjectionById() {
        Optional<StudentRow> opt = studentRepository.findStudentProjectionById(student1.getUserId());
        assertThat(opt).isPresent();
        StudentRow row = opt.get();
        assertThat(row.userId()).isEqualTo(student1.getUserId());
        assertThat(row.rollNumber()).isEqualTo("SE10001");
        assertThat(row.email()).isEqualTo("active.student@fpt.edu.vn");
        assertThat(row.activated()).isTrue();
    }
}
