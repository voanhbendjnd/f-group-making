package tech.djnd.sample.app.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tech.djnd.sample.app.domain.Authority;
import tech.djnd.sample.app.domain.Lecturer;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.repository.AuthorityRepository;
import tech.djnd.sample.app.repository.LecturerQueryRepository;
import tech.djnd.sample.app.repository.LecturerRepository;
import tech.djnd.sample.app.repository.LecturerSpecifications;
import tech.djnd.sample.app.repository.UserRepository;
import tech.djnd.sample.app.security.AuthoritiesConstants;
import tech.djnd.sample.app.service.dto.*;
import tech.djnd.sample.app.service.errors.ExcelImportException;
import tech.djnd.sample.app.service.projection.LecturerRow;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class LecturerService {

    private static final long MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024L; // 5 MB
    private static final String XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final LecturerRepository lecturerRepository;
    private final LecturerQueryRepository lecturerQueryRepository;
    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;
    private final UserService userService;
    private final NotificationAsyncService notificationAsyncService;
    private final org.springframework.cache.CacheManager cacheManager;

    public LecturerService(
            LecturerRepository lecturerRepository,
            LecturerQueryRepository lecturerQueryRepository,
            UserRepository userRepository,
            AuthorityRepository authorityRepository,
            UserService userService,
            NotificationAsyncService notificationAsyncService,
            org.springframework.cache.CacheManager cacheManager
    ) {
        this.lecturerRepository = lecturerRepository;
        this.lecturerQueryRepository = lecturerQueryRepository;
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.userService = userService;
        this.notificationAsyncService = notificationAsyncService;
        this.cacheManager = cacheManager;
    }

    /**
     * Import lecturers from Excel file (.xlsx)
     */
    public ImportResultDTO importFromExcel(MultipartFile file) {
        validateFile(file);
        log.info("Starting Lecturer Excel import: filename={}, size={} bytes",
                file.getOriginalFilename(), file.getSize());

        List<LecturerImportRowDTO> rows = parseExcelRows(file);
        if (rows.isEmpty()) {
            log.warn("Excel file is empty or contains no lecturer data");
            throw new ExcelImportException("Excel file contains no lecturer data.");
        }

        List<ImportRowErrorDTO> errors = validateRows(rows);
        if (!errors.isEmpty()) {
            log.warn("Lecturer import validation failed: {} error(s) found", errors.size());
            return ImportResultDTO.builder()
                    .success(false)
                    .totalImported(0)
                    .errors(errors)
                    .build();
        }

        Authority lecturerAuthority = authorityRepository.findById(AuthoritiesConstants.LECTURE)
                .orElseGet(() -> {
                    Authority auth = new Authority();
                    auth.setName(AuthoritiesConstants.LECTURE);
                    return authorityRepository.save(auth);
                });

        List<User> usersToSave = new ArrayList<>();
        for (LecturerImportRowDTO row : rows) {
            User user = new User();
            user.setEmail(row.getEmail());
            user.setName(row.getCode());
            user.setActivated(false);
            user.setAuthorities(new HashSet<>(Set.of(lecturerAuthority)));
            usersToSave.add(user);
        }

        List<User> savedUsers = userRepository.saveAll(usersToSave);
        Map<String, Long> userEmailToIdMap = savedUsers.stream()
                .collect(Collectors.toMap(User::getEmail, User::getId));

        List<Lecturer> lecturersToSave = new ArrayList<>();
        for (LecturerImportRowDTO row : rows) {
            Lecturer lecturer = new Lecturer();
            lecturer.setUserId(userEmailToIdMap.get(row.getEmail()));
            lecturer.setCode(row.getCode());
            lecturersToSave.add(lecturer);
        }

        lecturerRepository.saveAll(lecturersToSave);
        lecturerRepository.flush();

        log.info("Lecturer import completed successfully: {} lecturer(s) saved", lecturersToSave.size());

        return ImportResultDTO.builder()
                .success(true)
                .totalImported(lecturersToSave.size())
                .errors(List.of())
                .build();
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getLecturers(
            String search, Boolean activated, Boolean hasActivationKey, Pageable pageable) {

        Specification<Lecturer> spec = LecturerSpecifications.withFilter(search, activated, hasActivationKey);
        Page<LecturerRow> page = lecturerQueryRepository.search(spec, pageable);

        List<LecturerDTO> dtoList = page.getContent().stream()
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
                .result(dtoList)
                .build();
    }

    public BatchActivationResultDTO activateAllMatching(String search) {
        Specification<Lecturer> spec = LecturerSpecifications.withFilter(search, false, null);
        List<Lecturer> matchingLecturers = lecturerRepository.findAll(spec);

        List<Long> userIds = matchingLecturers.stream()
                .map(Lecturer::getUserId)
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

    private LecturerDTO toDTO(LecturerRow row) {
        boolean hasKey = row.activationKey() != null;
        boolean expired = row.activationKeyExpiresAt() != null
                && row.activationKeyExpiresAt().isBefore(Instant.now());

        return LecturerDTO.builder()
                .userId(row.userId())
                .code(row.code())
                .name(row.name())
                .email(row.email())
                .activated(Boolean.TRUE.equals(row.activated()))
                .hasActivationKey(hasKey)
                .activationKeyExpiresAt(row.activationKeyExpiresAt())
                .isKeyExpired(expired)
                .createdDate(row.createdDate())
                .lastModifiedDate(row.lastModifiedDate())
                .build();
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ExcelImportException("File must not be empty.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new ExcelImportException(
                    String.format("File size exceeds maximum allowed limit (%.1f MB).", MAX_FILE_SIZE_BYTES / (1024.0 * 1024)));
        }
        String contentType = file.getContentType();
        String originalFilename = Objects.requireNonNullElse(file.getOriginalFilename(), "");
        boolean isXlsxByType = XLSX_CONTENT_TYPE.equals(contentType);
        boolean isXlsxByName = originalFilename.toLowerCase().endsWith(".xlsx");
        if (!isXlsxByType && !isXlsxByName) {
            throw new ExcelImportException("Only .xlsx files are supported.");
        }
    }

    private List<LecturerImportRowDTO> parseExcelRows(MultipartFile file) {
        List<LecturerImportRowDTO> rows = new ArrayList<>();
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = findLecturerSheet(workbook);
            if (sheet == null) {
                throw new ExcelImportException("Cannot find lecturer or mentor sheet in the Excel file.");
            }

            int headerRowIndex = 0;
            Row headerRow = sheet.getRow(headerRowIndex);
            if (headerRow == null) {
                throw new ExcelImportException("Header row not found in sheet: " + sheet.getSheetName());
            }

            int colCode = -1;
            int colEmail = -1;

            for (Cell cell : headerRow) {
                String val = getCellValueAsString(cell).trim().toLowerCase(Locale.ROOT);
                if (val.contains("mentor") || val.contains("gv") || val.contains("lecturer") || val.contains("code") || val.contains("mã")) {
                    if (!val.contains("group")) {
                        colCode = cell.getColumnIndex();
                    }
                } else if (val.contains("email") || val.contains("mail")) {
                    colEmail = cell.getColumnIndex();
                }
            }

            // Fallback default for DS_Mentor_email.xlsx sheet 2: Col 1 = Mentor, Col 2 = Email
            if (colCode == -1 && sheet.getRow(0).getLastCellNum() >= 2) {
                colCode = 1;
            }
            if (colEmail == -1 && sheet.getRow(0).getLastCellNum() >= 3) {
                colEmail = 2;
            }

            if (colCode == -1 || colEmail == -1) {
                throw new ExcelImportException("Could not detect Mentor/Lecturer and Email columns in sheet " + sheet.getSheetName());
            }

            for (int r = headerRowIndex + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null || isRowEmpty(row)) {
                    continue;
                }
                String code = getCellValueAsString(row.getCell(colCode, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL)).trim();
                String email = getCellValueAsString(row.getCell(colEmail, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL)).trim().toLowerCase(Locale.ENGLISH);

                rows.add(LecturerImportRowDTO.builder()
                        .rowIndex(r + 1)
                        .code(code)
                        .email(email)
                        .build());
            }

        } catch (IOException | RuntimeException e) {
            log.error("Failed to read Excel file: {}", e.getMessage(), e);
            throw new ExcelImportException("Cannot read Excel file. Please verify file format: " + e.getMessage());
        }
        return rows;
    }

    private Sheet findLecturerSheet(Workbook workbook) {
        // Priority 1: Sheet containing "mentor" or "giảng viên" or "lecturer"
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            String name = workbook.getSheetName(i).trim().toLowerCase(Locale.ROOT);
            if (name.contains("mentor") || name.contains("giang vien") || name.contains("giảng viên") || name.contains("lecturer")) {
                return workbook.getSheetAt(i);
            }
        }
        // Priority 2: If sheet count >= 2 and sheet 2 has mentor, return sheet at index 1
        if (workbook.getNumberOfSheets() >= 2) {
            return workbook.getSheetAt(1);
        }
        // Priority 3: Fallback first sheet
        return workbook.getNumberOfSheets() > 0 ? workbook.getSheetAt(0) : null;
    }

    private List<ImportRowErrorDTO> validateRows(List<LecturerImportRowDTO> rows) {
        List<ImportRowErrorDTO> errors = new ArrayList<>();

        List<String> codesInFile = rows.stream()
                .map(LecturerImportRowDTO::getCode)
                .filter(c -> c != null && !c.isBlank())
                .toList();

        List<String> emailsInFile = rows.stream()
                .map(LecturerImportRowDTO::getEmail)
                .filter(e -> e != null && !e.isBlank())
                .toList();

        Set<String> existingCodes = lecturerRepository.findByCodeIgnoreCaseIn(codesInFile)
                .stream()
                .map(l -> l.getCode().toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());

        Set<String> existingEmails = userRepository.findByEmailIn(emailsInFile)
                .stream()
                .map(User::getEmail)
                .collect(Collectors.toSet());

        Map<String, Integer> seenCodes = new HashMap<>();
        Map<String, Integer> seenEmails = new HashMap<>();

        for (LecturerImportRowDTO row : rows) {
            // Check code
            if (row.getCode() == null || row.getCode().isBlank()) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .field("code")
                        .message("Lecturer / Mentor code must not be empty.")
                        .build());
            } else if (row.getCode().length() < 2 || row.getCode().length() > 50) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .field("code")
                        .message("Lecturer / Mentor code must be between 2 and 50 characters.")
                        .build());
            } else {
                String normalizedCode = row.getCode().toLowerCase(Locale.ROOT);
                if (seenCodes.containsKey(normalizedCode)) {
                    errors.add(ImportRowErrorDTO.builder()
                            .row(row.getRowIndex())
                            .field("code")
                            .message(String.format("Lecturer code '%s' is duplicated in file (already appeared at row %d).",
                                    row.getCode(), seenCodes.get(normalizedCode)))
                            .build());
                } else {
                    seenCodes.put(normalizedCode, row.getRowIndex());
                }

                if (existingCodes.contains(normalizedCode)) {
                    errors.add(ImportRowErrorDTO.builder()
                            .row(row.getRowIndex())
                            .field("code")
                            .message(String.format("Lecturer code '%s' already exists in the system.", row.getCode()))
                            .build());
                }
            }

            // Check email
            if (row.getEmail() == null || row.getEmail().isBlank()) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .field("email")
                        .message("Email must not be empty.")
                        .build());
            } else if (row.getEmail().length() > 254 || !EMAIL_PATTERN.matcher(row.getEmail()).matches()) {
                errors.add(ImportRowErrorDTO.builder()
                        .row(row.getRowIndex())
                        .field("email")
                        .message("A valid email of at most 254 characters is required.")
                        .build());
            } else {
                String normalizedEmail = row.getEmail();
                if (seenEmails.containsKey(normalizedEmail)) {
                    errors.add(ImportRowErrorDTO.builder()
                            .row(row.getRowIndex())
                            .field("email")
                            .message(String.format("Email '%s' is duplicated in file (already appeared at row %d).",
                                    row.getEmail(), seenEmails.get(normalizedEmail)))
                            .build());
                } else {
                    seenEmails.put(normalizedEmail, row.getRowIndex());
                }

                if (existingEmails.contains(normalizedEmail)) {
                    errors.add(ImportRowErrorDTO.builder()
                            .row(row.getRowIndex())
                            .field("email")
                            .message(String.format("Email '%s' already exists in the system.", row.getEmail()))
                            .build());
                }
            }
        }

        return errors;
    }

    private String getCellValueAsString(Cell cell) {
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
                    && !getCellValueAsString(cell).isBlank()) {
                return false;
            }
        }
        return true;
    }

    public void deleteLecturer(Long userId) {
        if (userId == null) {
            throw new tech.djnd.sample.app.service.errors.BadRequestResourceException("Lecturer ID must not be null", "lecturerManagement", "idnull");
        }
        Lecturer lecturer = lecturerRepository.findById(userId)
                .orElseThrow(() -> new tech.djnd.sample.app.service.errors.BadRequestResourceException("Lecturer not found with ID: " + userId, "lecturerManagement", "notfound"));

        lecturerRepository.delete(lecturer);
        lecturerRepository.flush();

        userRepository.findById(userId).ifPresent(user -> {
            userRepository.delete(user);
            userRepository.flush();
            clearUserCaches(user);
        });
        log.info("Deleted lecturer and user account with ID: {}", userId);
    }

    public void deleteLecturers(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }
        List<Long> distinctIds = userIds.stream().filter(Objects::nonNull).distinct().toList();
        List<Lecturer> lecturers = lecturerRepository.findAllById(distinctIds);
        if (!lecturers.isEmpty()) {
            lecturerRepository.deleteAll(lecturers);
            lecturerRepository.flush();
        }

        List<User> users = userRepository.findAllById(distinctIds);
        if (!users.isEmpty()) {
            userRepository.deleteAll(users);
            userRepository.flush();
            users.forEach(this::clearUserCaches);
        }
        log.info("Deleted {} lecturer(s) and corresponding user accounts", distinctIds.size());
    }

    private void clearUserCaches(User user) {
        var cacheByEmail = cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE);
        if (cacheByEmail != null && user.getEmail() != null) {
            cacheByEmail.evict(user.getEmail().trim().toLowerCase(Locale.ENGLISH));
        }
    }
}
