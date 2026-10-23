package com.fmaking.web.rest;

import jakarta.persistence.EntityManager;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;
import com.fmaking.domain.Major;
import com.fmaking.domain.User;
import com.fmaking.domain.Lecturer;
import com.fmaking.repository.LecturerRepository;
import com.fmaking.repository.MajorRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.StudentService;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(authorities = "ROLE_ADMIN")
class StudentImportResourceTest {
    @Autowired private MockMvc mvc;
    @Autowired private MajorRepository majors;
    @MockitoSpyBean private StudentRepository students;
    @Autowired private UserRepository users;
    @Autowired private StudentService service;
    @Autowired private com.fmaking.service.GroupService groupService;
    @Autowired private EntityManager em;
    @Autowired private LecturerRepository lecturers;
    private Long importLecturerId;

    @BeforeEach
    void provideLecturerRequiredByCurrentImportContract() {
        User user = new User(); user.setEmail("import-lecturer@example.com"); user.setName("Import Lecturer");
        user = users.saveAndFlush(user);
        importLecturerId = user.getId();
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode("IMPORT-LECTURER");
        lecturers.saveAndFlush(lecturer);
    }

    @AfterEach
    void removeImportLecturerFixture() {
        lecturers.deleteById(importLecturerId);
        users.deleteById(importLecturerId);
    }

    @Test
    void missingCodesRequireConfirmationWithoutWriting() throws Exception {
        long majorCount = majors.count(), userCount = users.count(), studentCount = students.count();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET", "BEN_XYZ_ET", "BEN_ABC_ET")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.confirmationRequired").value(true))
                .andExpect(jsonPath("$.data.totalImported").value(0))
                .andExpect(jsonPath("$.data.errors").isEmpty())
                .andExpect(jsonPath("$.data.newMajorCodes[0]").value("ABC"))
                .andExpect(jsonPath("$.data.newMajorCodes[1]").value("XYZ"))
                .andExpect(jsonPath("$.data.newMajorCodes.length()").value(2));
        assertThat(majors.count()).isEqualTo(majorCount);
        assertThat(users.count()).isEqualTo(userCount);
        assertThat(students.count()).isEqualTo(studentCount);
    }

    @Test
    void confirmedImportCreatesOneMajorPerCodeAndStoresIds() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_xyz_ET", "BEN_XYZ_ET"))
                        .param("confirmedMajorCodes", "XYZ"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.totalImported").value(2))
                .andExpect(jsonPath("$.data.createdMajorCodes[0]").value("XYZ"));
        em.flush(); em.clear();
        Major major = majors.findByCode("XYZ").orElseThrow();
        assertThat(major.getName()).isEqualTo("XYZ");
        var student = students.findByRollNumberIn(List.of("IMP000")).getFirst();
        assertThat(student.getMajorId()).isEqualTo(major.getId());
        assertThat(student.getCohort()).isEqualTo("BEN_xyz_ET");
        assertThat(student.getSlotType()).isEqualTo("B12/EXE");
        mvc.perform(get("/api/students/{id}", student.getUserId()))
                .andExpect(jsonPath("$.data.cohort").value("BEN_xyz_ET"))
                .andExpect(jsonPath("$.data.slotType").value("B12/EXE"))
                .andExpect(jsonPath("$.data.majorCode").value("XYZ"))
                .andExpect(jsonPath("$.data.majorName").value("XYZ"));
        mvc.perform(get("/api/school-classes/{id}/students", student.getSchoolClassId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].cohort").value("BEN_xyz_ET"))
                .andExpect(jsonPath("$.data[0].slotType").value("B12/EXE"));
        assertThat(students.findByRollNumberIn(List.of("IMP001")).getFirst().getSlotType()).isEmpty();
        assertThat(em.createNativeQuery("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'STUDENTS' AND COLUMN_NAME = 'MAJOR_CODE'")
                .getSingleResult().toString()).isEqualTo("0");
    }

    @Test
    void partialApprovalRequiresConfirmationAgainWithoutWrites() throws Exception {
        long count = majors.count();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET", "BEN_ABC_ET"))
                        .param("confirmedMajorCodes", "XYZ"))
                .andExpect(jsonPath("$.data.confirmationRequired").value(true))
                .andExpect(jsonPath("$.data.totalImported").value(0));
        assertThat(majors.count()).isEqualTo(count);
        assertThat(students.findByRollNumberIn(List.of("IMP000"))).isEmpty();
    }

    @Test
    void invalidRowsNeverCreateMajorsEvenWhenApproved() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET", "BEN__ET"))
                        .param("confirmedMajorCodes", "XYZ"))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.confirmationRequired").value(false))
                .andExpect(jsonPath("$.data.errors[0].row").value(4));
        assertThat(majors.existsByCode("XYZ")).isFalse();
        assertThat(students.findByRollNumberIn(List.of("IMP000"))).isEmpty();
    }

    @Test
    void existingMajorIsReusedIgnoringCase() throws Exception {
        Major major = new Major(); major.setCode("legacy"); major.setName("Legacy Major");
        majors.saveAndFlush(major);
        long count = majors.count();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_LEGACY_ET")))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.createdMajorCodes").isEmpty());
        assertThat(majors.count()).isEqualTo(count);
        assertThat(students.findByRollNumberIn(List.of("IMP000")).getFirst().getMajorId()).isEqualTo(major.getId());
    }

    @Test
    void tooLongCohortIsRejectedBeforeWriting() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_" + "X".repeat(250)))
                        .param("confirmedMajorCodes", "XYZ"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.errors[0].field").value("originalMajor"));
        assertThat(students.findByRollNumberIn(List.of("IMP000"))).isEmpty();
        assertThat(majors.existsByCode("XYZ")).isFalse();
    }

    @Test
    void oneCharacterCodeCanBeItsOwnName() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_X_ET")).param("confirmedMajorCodes", "X"))
                .andExpect(jsonPath("$.data.success").value(true));
        assertThat(majors.findByCode("X").orElseThrow().getName()).isEqualTo("X");
    }

    @Test
    void nameCollisionAndDuplicateStudentsAreValidationErrors() throws Exception {
        Major major = new Major(); major.setCode("OTHER"); major.setName("XYZ"); majors.saveAndFlush(major);
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET")).param("confirmedMajorCodes", "XYZ"))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.errors[0].field").value("majorCode"));
        mvc.perform(multipart("/api/students/import").file(file(true, "BEN_ABC_ET", "BEN_ABC_ET")))
                .andExpect(jsonPath("$.data.confirmationRequired").value(false))
                .andExpect(jsonPath("$.data.errors[0].field").value("rollNumber"));
        assertThat(majors.existsByCode("ABC")).isFalse();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void savingFailureRollsBackNewMajorAndAccounts() throws Exception {
        long majorCount = majors.count(), userCount = users.count(), studentCount = students.count();
        doThrow(new DataIntegrityViolationException("Simulated concurrent conflict")).when(students).saveAll(any());
        assertThatThrownBy(() -> service.importFromExcel(file(false, "BEN_ROLLBACK_ET"), Set.of("ROLLBACK")))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(majors.count()).isEqualTo(majorCount);
        assertThat(users.count()).isEqualTo(userCount);
        assertThat(students.count()).isEqualTo(studentCount);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void flushFailureRollsBackNewMajorAndAccounts() throws Exception {
        long majorCount = majors.count(), userCount = users.count(), studentCount = students.count();
        doThrow(new DataIntegrityViolationException("Simulated insert failure")).when(students).flush();
        assertThatThrownBy(() -> service.importFromExcel(file(false, "BEN_FLUSHFAIL_ET"), Set.of("FLUSHFAIL")))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(majors.count()).isEqualTo(majorCount);
        assertThat(users.count()).isEqualTo(userCount);
        assertThat(students.count()).isEqualTo(studentCount);
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void nonAdminCannotConfirmMajors() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET")).param("confirmedMajorCodes", "XYZ"))
                .andExpect(status().isForbidden());
        assertThat(majors.existsByCode("XYZ")).isFalse();
    }

    @Test
    void malformedWorkbookReturnsBadRequestWithoutWrites() throws Exception {
        long count = majors.count();
        mvc.perform(multipart("/api/students/import").file(new MockMultipartFile("file", "broken.xlsx",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new byte[]{1, 2, 3})))
                .andExpect(status().isBadRequest());
        assertThat(majors.count()).isEqualTo(count);
    }

    @Test
    void resubmittingAnImportedFileDoesNotCreateDuplicateStudents() throws Exception {
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET")).param("confirmedMajorCodes", "XYZ"))
                .andExpect(jsonPath("$.data.success").value(true));
        long count = students.count();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET")).param("confirmedMajorCodes", "XYZ"))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.confirmationRequired").value(false))
                .andExpect(jsonPath("$.data.errors[0].field").value("rollNumber"));
        assertThat(students.count()).isEqualTo(count);
    }

    @Test
    void importPreservesPreviouslyAssignedLecturer() throws Exception {
        var term = new com.fmaking.domain.Term(); term.setName("IMPORTLOCK");
        em.persist(term);
        var assignedUser = new User(); assignedUser.setEmail("locked-import@example.test"); assignedUser.setName("Locked Lecturer");
        assignedUser = users.saveAndFlush(assignedUser);
        var assignedLecturer = new Lecturer(); assignedLecturer.setUserId(assignedUser.getId()); assignedLecturer.setCode("LOCKED-LECTURER");
        lecturers.saveAndFlush(assignedLecturer);
        var schoolClass = new com.fmaking.domain.SchoolClass(); schoolClass.setName("Import Class");
        schoolClass.setTermId(term.getId()); schoolClass.setLecturerId(assignedUser.getId());
        em.persist(schoolClass); em.flush();
        Integer classId = schoolClass.getId(); Long assignedId = assignedUser.getId();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET"))
                        .param("confirmedMajorCodes", "XYZ").param("termId", term.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.success").value(true));
        em.flush(); em.clear();
        assertThat(em.find(com.fmaking.domain.SchoolClass.class, classId).getLecturerId()).isEqualTo(assignedId);
    }

    @Test
    void importCanFillAnUnassignedClass() throws Exception {
        var term = new com.fmaking.domain.Term(); term.setName("IMPORTFILL"); em.persist(term);
        var schoolClass = new com.fmaking.domain.SchoolClass(); schoolClass.setName("Import Class");
        schoolClass.setTermId(term.getId()); em.persist(schoolClass); em.flush();
        Integer classId = schoolClass.getId();
        mvc.perform(multipart("/api/students/import").file(file(false, "BEN_XYZ_ET"))
                        .param("confirmedMajorCodes", "XYZ").param("termId", term.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.success").value(true));
        em.flush(); em.clear();
        assertThat(em.find(com.fmaking.domain.SchoolClass.class, classId).getLecturerId()).isEqualTo(importLecturerId);
    }

    private MockMultipartFile file(boolean duplicate, String... codes) throws Exception {
        try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Students");
            sheet.createRow(0).createCell(0).setCellValue("Title");
            sheet.createRow(1).createCell(0).setCellValue("Headers");
            for (int i = 0; i < codes.length; i++) {
                var row = sheet.createRow(i + 2);
                row.createCell(1).setCellValue("IMP00" + (duplicate ? 0 : i));
                row.createCell(2).setCellValue("Import Student " + i);
                row.createCell(3).setCellValue(codes[i]);
                row.createCell(4).setCellValue("IMPMEMBER" + i);
                row.createCell(5).setCellValue("import" + i + "@example.com");
                if (i == 0) row.createCell(6).setCellValue(" B12/EXE ");
                row.createCell(8).setCellValue("Import Class");
                row.createCell(9).setCellValue("IMPORT-LECTURER");
            }
            workbook.write(output);
            return new MockMultipartFile("file", "students.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", output.toByteArray());
        }
    }

    @Test
    @WithMockUser(username = "import-lecturer@example.com", authorities = "ROLE_ADMIN")
    void workspaceReturnsImportedCohortAndSlotTypeForAssignedAndUnassignedStudents() throws Exception {
        service.importFromExcel(file(false, "BEN_XYZ_ET_19C", "BKR_XYZ_20C"), Set.of("XYZ"));
        var imported = students.findByRollNumberIn(List.of("IMP000", "IMP001"));
        var assigned = imported.stream().filter(s -> s.getRollNumber().equals("IMP000")).findFirst().orElseThrow();
        var unassigned = imported.stream().filter(s -> s.getRollNumber().equals("IMP001")).findFirst().orElseThrow();
        unassigned.setSlotType("C24/EXE");
        var schoolClass = em.find(com.fmaking.domain.SchoolClass.class, assigned.getSchoolClassId());
        var deadline = new com.fmaking.domain.Deadline();
        deadline.setName("Export test");
        deadline.setStartTime(java.time.Instant.now().minusSeconds(60));
        deadline.setEndTime(java.time.Instant.now().plusSeconds(3600));
        deadline.setStatus("ACTIVE");
        deadline.getSchoolClasses().add(schoolClass);
        em.persist(deadline);
        var group = new com.fmaking.domain.Group();
        group.setName("Custom team name");
        group.setSchoolClassId(schoolClass.getId()); group.setDeadlineId(deadline.getId());
        group.setLeaderId(assigned.getUserId()); group.setSequenceNo(1);
        em.persist(group);
        var member = new com.fmaking.domain.GroupMember();
        member.setGroupId(group.getId()); member.setStudentId(assigned.getUserId());
        member.setSchoolClassId(schoolClass.getId()); member.setDeadlineId(deadline.getId());
        member.setRole(com.fmaking.domain.GroupMemberRole.LEADER); member.setJoinedAt(java.time.Instant.now());
        em.persist(member);
        em.flush(); em.clear();

        var workspace = groupService.getWorkspace(deadline.getId(), schoolClass.getId());
        assertThat(workspace.getGroups().getFirst().getMembers().getFirst().getCohort()).isEqualTo("BEN_XYZ_ET_19C");
        assertThat(workspace.getGroups().getFirst().getMembers().getFirst().getSlotType()).isEqualTo("B12/EXE");
        assertThat(workspace.getUnassignedStudents().getFirst().getCohort()).isEqualTo("BKR_XYZ_20C");
        assertThat(workspace.getUnassignedStudents().getFirst().getSlotType()).isEqualTo("C24/EXE");
    }
}
