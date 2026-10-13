package tech.djnd.sample.app.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import tech.djnd.sample.app.domain.Lecturer;
import tech.djnd.sample.app.domain.Major;
import tech.djnd.sample.app.domain.SchoolClass;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.repository.LecturerRepository;
import tech.djnd.sample.app.repository.MajorRepository;
import tech.djnd.sample.app.repository.SchoolClassRepository;
import tech.djnd.sample.app.repository.StudentQueryRepository;
import tech.djnd.sample.app.repository.StudentRepository;
import tech.djnd.sample.app.repository.StudentSpecifications;
import tech.djnd.sample.app.repository.TermRepository;
import tech.djnd.sample.app.repository.UserRepository;
import tech.djnd.sample.app.service.dto.BatchActivationResultDTO;
import tech.djnd.sample.app.service.dto.ImportResultDTO;
import tech.djnd.sample.app.service.dto.ImportRowErrorDTO;
import tech.djnd.sample.app.service.dto.ResultPaginationDTO;
import tech.djnd.sample.app.service.dto.StudentDTO;
import tech.djnd.sample.app.service.dto.StudentImportRowDTO;
import tech.djnd.sample.app.service.dto.UserDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.service.errors.ExcelImportException;
import tech.djnd.sample.app.service.projection.StudentRow;
import tech.djnd.sample.app.util.MajorCode;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class StudentService {

    private static final long MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024L; // 5 MB
    private static final String XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final int HEADER_ROW_INDEX = 0;
    private static final int TITLE_ROW_INDEX = 1;

    // Excel column indices (0-based)
    private static final int COL_ROLL_NUMBER = 1;   // Column B: Roll number
    private static final int COL_FULL_NAME   = 2;   // Column C: Full name
    private static final int COL_MAJOR       = 3;   // Column D: Major (BEN_CHN_ET_19C,...)
    private static final int COL_MEMBER_CODE = 4;   // Column E: Member code
    private static final int COL_EMAIL       = 5;   // Column F: Email
    private static final int COL_GROUP_NAME  = 8;   // Column I: GroupName (SchoolClass)
    private static final int COL_LECTURER_CODE = 9; // Column J: GV (Lecturer code)

    private final StudentQueryRepository studentQueryRepository;
    private final StudentRepository studentRepository;
    private final MajorRepository majorRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final LecturerRepository lecturerRepository;
    private final NotificationAsyncService notificationAsyncService;
    private final SchoolClassRepository schoolClassRepository;
    private final TermRepository termRepository;
    private final TermService termService;

    public StudentService(
            StudentRepository studentRepository,
            MajorRepository majorRepository,
            UserRepository userRepository,
            UserService userService,
            NotificationAsyncService notificationAsyncService,
            StudentQueryRepository studentQueryRepository,
            LecturerRepository lecturerRepository,
            SchoolClassRepository schoolClassRepository,
            TermRepository termRepository,
            TermService termService
    ) {
        this.studentRepository = studentRepository;
        this.majorRepository = majorRepository;
        this.userRepository = userRepository;
        this.userService = userService;
        this.studentQueryRepository = studentQueryRepository;
        this.notificationAsyncService = notificationAsyncService;
        this.lecturerRepository = lecturerRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.termRepository = termRepository;
        this.termService = termService;
    }

    /**
     * Import student list from Excel file (.xlsx) with default parameters.
     */
    public ImportResultDTO importFromExcel(MultipartFile file) {
        return importFromExcel(file, null, Set.of());
    }

    public ImportResultDTO importFromExcel(MultipartFile file, Set<String> confirmedMajorCodes) {
        return importFromExcel(file, null, confirmedMajorCodes);
    }

    public ImportResultDTO importFromExcel(MultipartFile file, Integer termId, Set<String> confirmedMajorCodes) {
        // Step 1: Validate file (format, size, empty)
        validateFile(file);
        log.info("Starting Excel import: filename={}, size={} bytes, termId={}",
                file.getOriginalFilename(), file.getSize(), termId);

        // Determine effective term
        final Integer effectiveTermId;
        if (termId == null) {
            effectiveTermId = termService.ensureCurrentTerm().getId();
        } else {
            if (!termRepository.existsById(termId)) {
                throw new BadRequestResourceException("Học kỳ (Term) không tồn tại với ID: " + termId, "studentManagement", "termNotFound");
            }
            effectiveTermId = termId;
        }

        // Step 2: Parse Excel file to DTO list
        List<StudentImportRowDTO> rows = parseExcelRows(file);

        if (rows.isEmpty()) {
            log.warn("Excel file is empty or contains only headers");
            throw new ExcelImportException("Excel file contains no student data.");
        }

        // Step 3: Validate each row according to business rules
        List<Major> catalog = majorRepository.findAll();
        Map<String, Major> majorsByCode = catalog.stream().collect(Collectors.toMap(
                major -> MajorCode.normalize(major.getCode()), major -> major));
        
        // Fetch lecturers corresponding to lecturerCodes present in the file
        Set<String> lecturerCodesInFile = rows.stream()
                .map(StudentImportRowDTO::getLecturerCode)
                .filter(code -> code != null && !code.isBlank())
                .map(code -> code.trim().toUpperCase(Locale.ROOT))
                .collect(Collectors.toSet());

        Map<String, Lecturer> lecturersByCode = lecturerRepository
                .findByCodeIgnoreCaseIn(lecturerCodesInFile)
                .stream()
                .collect(Collectors.toMap(
                        l -> l.getCode().trim().toUpperCase(Locale.ROOT),
                        l -> l,
                        (existing, replacement) -> existing
                ));

        List<ImportRowErrorDTO> errors = validateRows(rows, lecturersByCode);
        Set<String> existingNames = catalog.stream().map(major -> major.getName().trim().toUpperCase(Locale.ROOT))
                .collect(Collectors.toSet());
        for (StudentImportRowDTO row : rows) {
            if (row.getMajorCode() != null && !majorsByCode.containsKey(row.getMajorCode())
                    && existingNames.contains(row.getMajorCode())) {
                errors.add(ImportRowErrorDTO.builder().row(row.getRowIndex()).rollNumber(row.getRollNumber())
                        .field("majorCode").message("Cannot use code as the temporary name because a major already has that name: "
                                + row.getMajorCode()).build());
            }
        }

        // Step 4: All-or-nothing — if any errors exist, reject entire file
        if (!errors.isEmpty()) {
            log.warn("Import validation failed: {} error(s) found", errors.size());
            return ImportResultDTO.builder()
                    .success(false)
                    .totalImported(0)
                    .errors(errors)
                    .build();
        }

        List<String> newMajorCodes = rows.stream().map(StudentImportRowDTO::getMajorCode)
                .distinct().filter(code -> !majorsByCode.containsKey(code)).sorted().toList();
        Set<String> approvedCodes = confirmedMajorCodes == null ? Set.of() : confirmedMajorCodes.stream()
                .map(MajorCode::normalize).collect(Collectors.toSet());
        if (!approvedCodes.containsAll(newMajorCodes)) {
            return ImportResultDTO.builder().success(false).totalImported(0)
                    .confirmationRequired(true).newMajorCodes(newMajorCodes).build();
        }

        // Create only explicitly approved codes, in the transaction that saves students/users.
        for (String code : newMajorCodes) {
            Major major = new Major();
            major.setCode(code);
            major.setName(code);
            majorsByCode.put(code, majorRepository.save(major));
        }

        // Find or create SchoolClass for each unique groupName in the file
        Map<String, SchoolClass> schoolClassMap = new HashMap<>();
        for (StudentImportRowDTO row : rows) {
            String groupName = row.getGroupName().trim();
            String classKey = groupName.toUpperCase(Locale.ROOT);
            if (!schoolClassMap.containsKey(classKey)) {
                String normalizedLec = row.getLecturerCode().trim().toUpperCase(Locale.ROOT);
                Lecturer lecturer = lecturersByCode.get(normalizedLec);
                Long lecturerId = lecturer != null ? lecturer.getUserId() : null;

                SchoolClass schoolClass = schoolClassRepository
                        .findByNameIgnoreCaseAndTermId(groupName, effectiveTermId)
                        .orElseGet(() -> {
                            SchoolClass sc = new SchoolClass();
                            sc.setName(groupName);
                            sc.setTermId(effectiveTermId);
                            sc.setLecturerId(lecturerId);
                            return schoolClassRepository.save(sc);
                        });

                if (schoolClass.getLecturerId() == null && lecturerId != null) {
                    schoolClass.setLecturerId(lecturerId);
                    schoolClass = schoolClassRepository.save(schoolClass);
                }
                schoolClassMap.put(classKey, schoolClass);
            }
        }

        List<StudentDTO> studentDTOs = mapToEntities(rows, majorsByCode, schoolClassMap);

        // Create user accounts before creating student records
        List<User> userStudents = new ArrayList<>();
        studentDTOs.forEach(student -> {
            User user = new User();
            user.setEmail(student.getEmail());
            user.setName(student.getFullName());
            userStudents.add(user);
        });
        Map<String, Long> userStudentMap = userRepository.saveAll(userStudents).stream()
                .collect(Collectors.toMap(User::getEmail, User::getId));
        studentDTOs.forEach(student -> {
            Long userId = userStudentMap.get(student.getEmail());
            student.setUserId(userId);
        });

        studentRepository.saveAll(studentDTOs.stream().map(this::toEntity).toList());
        studentRepository.flush();

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                log.info("Import completed successfully: {} student(s) saved into termId={}",
                        studentDTOs.size(), effectiveTermId);
            }
        });
        return ImportResultDTO.builder()
                .success(true)
                .totalImported(studentDTOs.size())
                .createdMajorCodes(newMajorCodes)
                .errors(List.of())
                .build();
    }

    private Student toEntity(StudentDTO dto) {
        Student student = new Student();
        student.setUserId(dto.getUserId());
        student.setRollNumber(dto.getRollNumber());
        student.setFullName(dto.getFullName());
        student.setMemberCode(dto.getMemberCode());
        student.setMajorId(dto.getMajorId());
        student.setSchoolClassId(dto.getSchoolClassId());
        return student;
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getStudents(
            String search, String majorSearch, Integer majorId, Boolean activated,
            Boolean hasActivationKey, Pageable pageable) {
        return getStudents(search, majorSearch, majorId, activated, hasActivationKey, pageable, null);
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getStudents(String search, String majorSearch, Integer majorId, Boolean activated,
            Boolean hasActivationKey, Pageable pageable, Integer termId) {
        termService.validateTerm(termId);

        Specification<Student> spec =
                StudentSpecifications.withFilter(search, majorSearch, majorId, activated, hasActivationKey)
                        .and(StudentSpecifications.withTerm(termId));
        Page<StudentRow> page = studentQueryRepository.search(spec, pageable);

        List<StudentDTO> studentDTOs = page.getContent().stream()
                .map(this::toDTO)
                .toList();

        ResultPaginationDTO.Meta meta = ResultPaginationDTO.Meta.builder()
                .page(pageable.getPageNumber() + 1)
                .pageSize(pageable.getPageSize())
                .pages(page.getTotalPages())
                .total(page.getTotalElements())
                .build();

        return ResultPaginationDTO.builder()
                .meta(meta)
                .result(studentDTOs)
                .build();
    }

    private StudentDTO toDTO(StudentRow row) {
        boolean hasKey = row.activationKey() != null;
        boolean expired = row.activationKeyExpiresAt() != null
                && row.activationKeyExpiresAt().isBefore(Instant.now());

        return StudentDTO.builder()
                .userId(row.userId())
                .rollNumber(row.rollNumber())
                .fullName(row.fullName())
                .email(row.email())
                .memberCode(row.memberCode())
                .majorId(row.majorId())
                .majorCode(row.majorCode())
                .majorName(row.majorName())
                .activated(Boolean.TRUE.equals(row.activated()))
                .hasActivationKey(hasKey)
                .activationKeyExpiresAt(row.activationKeyExpiresAt())
                .isKeyExpired(expired)
                .createdDate(row.createdDate())
                .lastModifiedDate(row.lastModifiedDate())
                .build();
    }

    /**
     * Get student details by userId.
     */
    @Transactional(readOnly = true)
    public StudentDTO getStudentByUserId(Long userId) {
        StudentRow student = studentRepository.findStudentProjectionById(userId)
                .orElseThrow(() -> new BadRequestResourceException(
                        "Student not found with ID: " + userId,
                        "studentManagement",
                        "studentnotfound"
                ));
        return toDTO(student);
    }

    /**
     * Activate and send emails to all unactivated students matching filter criteria.
     */
    public BatchActivationResultDTO activateAllMatching(String search, String majorSearch, Integer majorId) {
        return activateAllMatching(search, majorSearch, majorId, null);
    }

    public BatchActivationResultDTO activateAllMatching(String search, String majorSearch, Integer majorId, Integer termId) {
        termService.validateTerm(termId);
        Specification<Student> spec = StudentSpecifications.withFilter(search, majorSearch, majorId, false, null)
                .and(StudentSpecifications.withTerm(termId));
        List<Student> matchingStudents = studentRepository.findAll(spec);

        List<Long> userIds = matchingStudents.stream()
                .map(Student::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        if (userIds.isEmpty()) {
            return BatchActivationResultDTO.builder()
                    .totalRequested(0)
                    .totalProcessed(0)
                    .totalSkippedAlreadyActive(0)
                    .sentEmails(List.of())
                    .build();
        }

        List<UserDTO> usersToActivate = userService.initActivateKeyMulAccount(userIds);
        notificationAsyncService.sendMailActivatedAccount(usersToActivate);

        return BatchActivationResultDTO.builder()
                .totalRequested(userIds.size())
                .totalProcessed(usersToActivate.size())
                .totalSkippedAlreadyActive(userIds.size() - usersToActivate.size())
                .sentEmails(usersToActivate.stream().map(UserDTO::getEmail).toList())
                .build();
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ExcelImportException("File must not be empty.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new ExcelImportException("File size exceeds 5MB limit.");
        }
        String contentType = file.getContentType();
        boolean isXlsxByType = contentType != null && contentType.equalsIgnoreCase(XLSX_CONTENT_TYPE);
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            throw new ExcelImportException("Invalid file name.");
        }
        boolean isXlsxByName = originalFilename.toLowerCase().endsWith(".xlsx");
        if (!isXlsxByType && !isXlsxByName) {
            throw new ExcelImportException("Only .xlsx files are supported.");
        }
    }

    /**
     * Parse Excel rows into DTO list.
     */
    private List<StudentImportRowDTO> parseExcelRows(MultipartFile file) {
        List<StudentImportRowDTO> rows = new ArrayList<>();
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            for (Row row : sheet) {
                if (row.getRowNum() == HEADER_ROW_INDEX || row.getRowNum() == TITLE_ROW_INDEX) {
                    continue;
                }
                if (isRowEmpty(row)) {
                    continue;
                }
                String rollNumber    = getCellValueAsString(row, COL_ROLL_NUMBER).trim();
                String fullName      = getCellValueAsString(row, COL_FULL_NAME).trim();
                String originalMajor = getCellValueAsString(row, COL_MAJOR).trim();
                String memberCode    = getCellValueAsString(row, COL_MEMBER_CODE).trim();
                String email         = getCellValueAsString(row, COL_EMAIL).trim().toLowerCase(Locale.ENGLISH);
                String majorCode     = parseMajorCode(originalMajor);
                String groupName     = getCellValueAsString(row, COL_GROUP_NAME).trim();
                String lecturerCode  = getCellValueAsString(row, COL_LECTURER_CODE).trim();

                rows.add(StudentImportRowDTO.builder()
                        .rowIndex(row.getRowNum() + 1)
                        .rollNumber(rollNumber)
                        .fullName(fullName)
                        .email(email)
                        .memberCode(memberCode)
                        .originalMajor(originalMajor)
                        .majorCode(majorCode)
                        .groupName(groupName)
                        .lecturerCode(lecturerCode)
                        .build());
            }
        } catch (IOException | RuntimeException e) {
            log.error("Failed to read Excel file: {}", e.getMessage(), e);
            throw new ExcelImportException("Cannot read Excel file. Please verify file format.");
        }
        return rows;
    }

    /**
     * Validate all rows and collect error details.
     */
    private List<ImportRowErrorDTO> validateRows(List<StudentImportRowDTO> rows, Map<String, Lecturer> lecturersByCode) {
        List<ImportRowErrorDTO> errors = new ArrayList<>();
        List<String> rollNumbersInFile = rows.stream()
                .map(StudentImportRowDTO::getRollNumber)
                .filter(r -> r != null && !r.isBlank())
                .toList();
        List<String> memberCodesInFile = rows.stream()
                .map(StudentImportRowDTO::getMemberCode)
                .filter(m -> m != null && !m.isBlank())
                .toList();
        List<String> emailsInFile = rows.stream()
                .map(StudentImportRowDTO::getEmail)
                .filter(e -> e != null && !e.isBlank())
                .toList();

        Set<String> existingRollNumbers = studentRepository
                .findByRollNumberIgnoreCaseIn(rollNumbersInFile)
                .stream()
                .map(student -> student.getRollNumber().toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
        Set<String> existingMemberCodes = studentRepository
                .findByMemberCodeIgnoreCaseIn(memberCodesInFile)
                .stream()
                .map(student -> student.getMemberCode().toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
        Set<String> existingEmails = userRepository
                .findByEmailIn(emailsInFile)
                .stream()
                .map(User::getEmail)
                .collect(Collectors.toSet());

        Map<String, Integer> seenRollNumbers = new HashMap<>();
        Map<String, Integer> seenMemberCodes = new HashMap<>();
        Map<String, Integer> seenEmails = new HashMap<>();
        Map<String, String> classToLecturerInFile = new HashMap<>();

        for (StudentImportRowDTO row : rows) {
            validateSingleRow(
                    row,
                    existingRollNumbers,
                    existingMemberCodes,
                    existingEmails,
                    seenRollNumbers,
                    seenMemberCodes,
                    seenEmails,
                    lecturersByCode,
                    classToLecturerInFile,
                    errors
            );
        }
        return errors;
    }

    /**
     * Validate an individual row according to all business rules.
     */
    private void validateSingleRow(
            StudentImportRowDTO row,
            Set<String> existingRollNumbers,
            Set<String> existingMemberCodes,
            Set<String> existingEmails,
            Map<String, Integer> seenRollNumbers,
            Map<String, Integer> seenMemberCodes,
            Map<String, Integer> seenEmails,
            Map<String, Lecturer> lecturersByCode,
            Map<String, String> classToLecturerInFile,
            List<ImportRowErrorDTO> errors) {

        // Rule 1: rollNumber must not be empty
        if (row.getRollNumber() == null || row.getRollNumber().isBlank()) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(null)
                    .field("rollNumber")
                    .message("Student roll number must not be empty.")
                    .build());
            return;
        }

        // Rule 2a: rollNumber duplicate within file
        if (seenRollNumbers.containsKey(row.getRollNumber().toLowerCase(Locale.ROOT))) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("rollNumber")
                    .message(String.format(
                            "Roll number '%s' is duplicated in file (already appeared at row %d).",
                            row.getRollNumber(), seenRollNumbers.get(row.getRollNumber().toLowerCase(Locale.ROOT))))
                    .build());
        } else {
            seenRollNumbers.put(row.getRollNumber().toLowerCase(Locale.ROOT), row.getRowIndex());
        }

        // Rule 2b: memberCode duplicate within file
        if (row.getMemberCode() != null && !row.getMemberCode().isBlank()) {
            if (seenMemberCodes.containsKey(row.getMemberCode().toLowerCase(Locale.ROOT))) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .rollNumber(row.getRollNumber())
                        .field("memberCode")
                        .message(String.format(
                                "Member code '%s' is duplicated in file (already appeared at row %d).",
                                row.getMemberCode(), seenMemberCodes.get(row.getMemberCode().toLowerCase(Locale.ROOT))))
                        .build());
            } else {
                seenMemberCodes.put(row.getMemberCode().toLowerCase(Locale.ROOT), row.getRowIndex());
            }
        }

        // Rule 2c: email duplicate within file
        if (row.getEmail() != null && !row.getEmail().isBlank()) {
            if (seenEmails.containsKey(row.getEmail())) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .rollNumber(row.getRollNumber())
                        .field("email")
                        .message(String.format(
                                "Email '%s' is duplicated in file (already appeared at row %d).",
                                row.getEmail(), seenEmails.get(row.getEmail())))
                        .build());
            } else {
                seenEmails.put(row.getEmail(), row.getRowIndex());
            }
        }

        // Rule 3: duplicate check against DB
        if (existingRollNumbers.contains(row.getRollNumber().toLowerCase(Locale.ROOT))) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("rollNumber")
                    .message(String.format("Roll number '%s' already exists in the system.", row.getRollNumber()))
                    .build());
        }
        if (row.getMemberCode() != null && existingMemberCodes.contains(row.getMemberCode().toLowerCase(Locale.ROOT))) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("memberCode")
                    .message(String.format("Member code '%s' already exists in the system.", row.getMemberCode()))
                    .build());
        }
        if (existingEmails.contains(row.getEmail())) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("email")
                    .message(String.format("Email '%s' already exists in the system.", row.getEmail()))
                    .build());
        }

        // Rule 4: fullName must not be empty
        if (row.getFullName() == null || row.getFullName().isBlank() || row.getFullName().length() > 50) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("fullName")
                    .message("Student full name must contain between 1 and 50 characters.")
                    .build());
        }

        // Rule 5: originalMajor must not be empty
        if (row.getOriginalMajor() == null || row.getOriginalMajor().isBlank()) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("originalMajor")
                    .message("Major information must not be empty.")
                    .build());
            return;
        }

        // Rule 6: originalMajor format
        if (row.getMajorCode() == null) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("originalMajor")
                    .message(String.format(
                            "Major format '%s' is invalid. Required format: PREFIX_MAJORCODE_... (e.g. BEN_CHN_ET_19C).",
                            row.getOriginalMajor()))
                    .build());
            return;
        }

        // Rule 7: member code must not be null/blank
        if (row.getMemberCode() == null || row.getMemberCode().isBlank()) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .field("memberCode")
                    .message("Member code must not be empty.")
                    .build());
            return;
        }

        // Rule 8: email must not be null/blank
        if (row.getEmail() == null || row.getEmail().length() > 254
                || !row.getEmail().matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .field("email")
                    .message("A valid email of at most 254 characters is required.")
                    .build());
        }

        // Rule 9: Group name (SchoolClass) validation
        if (row.getGroupName() == null || row.getGroupName().isBlank()) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("groupName")
                    .message("Group name (tên lớp) không được để trống.")
                    .build());
        } else if (row.getGroupName().length() > 50) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("groupName")
                    .message("Group name (tên lớp) không được vượt quá 50 ký tự.")
                    .build());
        }

        // Rule 10: Lecturer code validation (Must exist in database)
        if (row.getLecturerCode() == null || row.getLecturerCode().isBlank()) {
            errors.add(ImportRowErrorDTO.builder()
                    .row(row.getRowIndex())
                    .rollNumber(row.getRollNumber())
                    .field("lecturerCode")
                    .message("Mã giảng viên không được để trống.")
                    .build());
        } else {
            String normalizedLecCode = row.getLecturerCode().trim().toUpperCase(Locale.ROOT);
            if (!lecturersByCode.containsKey(normalizedLecCode)) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .rollNumber(row.getRollNumber())
                        .field("lecturerCode")
                        .message(String.format("Giảng viên với mã '%s' không tìm thấy trong hệ thống.", row.getLecturerCode()))
                        .build());
            }
        }

        // Rule 11: Consistent lecturer per class within file
        if (row.getGroupName() != null && !row.getGroupName().isBlank()
                && row.getLecturerCode() != null && !row.getLecturerCode().isBlank()) {
            String classKey = row.getGroupName().trim().toUpperCase(Locale.ROOT);
            String currentLec = row.getLecturerCode().trim().toUpperCase(Locale.ROOT);
            if (classToLecturerInFile.containsKey(classKey)
                    && !classToLecturerInFile.get(classKey).equalsIgnoreCase(currentLec)) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .rollNumber(row.getRollNumber())
                        .field("groupName")
                        .message(String.format("Lớp '%s' có nhiều mã giảng viên khác nhau trong cùng file ('%s' và '%s').",
                                row.getGroupName(), classToLecturerInFile.get(classKey), row.getLecturerCode()))
                        .build());
            } else {
                classToLecturerInFile.put(classKey, currentLec);
            }
        }
    }

    /**
     * Map validated DTO list to Student entity list.
     */
    private List<StudentDTO> mapToEntities(
            List<StudentImportRowDTO> rows,
            Map<String, Major> majorsByCode,
            Map<String, SchoolClass> schoolClassMap) {

        return rows.stream().map(row -> {
            Major major = majorsByCode.get(row.getMajorCode());
            SchoolClass schoolClass = schoolClassMap.get(row.getGroupName().trim().toUpperCase(Locale.ROOT));

            StudentDTO student = new StudentDTO();
            student.setRollNumber(row.getRollNumber());
            student.setFullName(row.getFullName());
            student.setEmail(row.getEmail());
            student.setMemberCode(row.getMemberCode());
            student.setMajorId(major.getId());
            student.setGroupName(row.getGroupName());
            student.setLecturerCode(row.getLecturerCode());
            if (schoolClass != null) {
                student.setSchoolClassId(schoolClass.getId());
            }
            return student;
        }).toList();
    }

    // =========================================================================
    // EXCEL UTILITIES
    // =========================================================================

    private String parseMajorCode(String originalMajor) {
        if (originalMajor == null || originalMajor.isBlank()) {
            return null;
        }
        String[] tokens = originalMajor.split("_", 3);
        if (tokens.length < 2 || tokens[1].isBlank()) {
            return null;
        }
        String code = MajorCode.normalize(tokens[1]);
        return MajorCode.isValid(code) ? code : null;
    }

    private String getCellValueAsString(Row row, int colIndex) {
        Cell cell = row.getCell(colIndex, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (cell == null) {
            return "";
        }
        return switch (cell.getCellType()) {
            case STRING  -> cell.getStringCellValue();
            case NUMERIC -> {
                double numericValue = cell.getNumericCellValue();
                if (numericValue == Math.floor(numericValue)) {
                    yield String.valueOf((long) numericValue);
                }
                yield String.valueOf(numericValue);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield cell.getStringCellValue();
                } catch (Exception ex) {
                    yield String.valueOf(cell.getNumericCellValue());
                }
            }
            default -> "";
        };
    }

    private boolean isRowEmpty(Row row) {
        if (row == null) return true;
        for (int i = row.getFirstCellNum(); i < row.getLastCellNum(); i++) {
            Cell cell = row.getCell(i);
            if (cell != null && cell.getCellType() != CellType.BLANK
                    && !getCellValueAsString(row, i).isBlank()) {
                return false;
            }
        }
        return true;
    }
}
