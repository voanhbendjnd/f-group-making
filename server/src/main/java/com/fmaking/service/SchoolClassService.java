package com.fmaking.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.repository.SchoolClassRepository;
import com.fmaking.repository.LecturerRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.service.dto.SchoolClassDTO;
import com.fmaking.service.dto.StudentDTO;
import com.fmaking.service.errors.BadRequestResourceException;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import com.fmaking.web.rest.errors.ConflictAlertException;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@Transactional
public class SchoolClassService {

    private final SchoolClassRepository schoolClassRepository;
    private final StudentRepository studentRepository;
    private final SchoolClassAccessService accessService;
    private final TermService termService;
    private final LecturerRepository lecturerRepository;
    private final GroupEventPublisher groupEventPublisher;

    public SchoolClassService(
            SchoolClassRepository schoolClassRepository,
            StudentRepository studentRepository,
            SchoolClassAccessService accessService,
            TermService termService,
            LecturerRepository lecturerRepository,
            GroupEventPublisher groupEventPublisher
    ) {
        this.schoolClassRepository = schoolClassRepository;
        this.studentRepository = studentRepository;
        this.accessService = accessService;
        this.termService = termService;
        this.lecturerRepository = lecturerRepository;
        this.groupEventPublisher = groupEventPublisher;
    }

    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public SchoolClassDTO assignLecturer(Integer classId, Long lecturerId, Long expectedLecturerId) {
        var schoolClass = schoolClassRepository.findByIdForUpdate(classId)
                .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        if (!Objects.equals(schoolClass.getLecturerId(), expectedLecturerId)) {
            throw new ConflictAlertException("The class lecturer has changed", "schoolClass", "lecturerAssignmentConflict");
        }
        if (lecturerId == null || lecturerId <= 0) {
            throw new BadRequestResourceException("A positive lecturer ID is required", "schoolClass", "invalidLecturerId");
        }
        if (!lecturerRepository.existsById(lecturerId)) {
            throw new NotFoundAlertException("Lecturer not found", "schoolClass", "lecturerNotFound");
        }
        if (!Objects.equals(schoolClass.getLecturerId(), lecturerId)) {
            schoolClass.setLecturerId(lecturerId);
            schoolClassRepository.saveAndFlush(schoolClass);
            // Assignment changes also change which lecturer-wide Zalo students may view.
            groupEventPublisher.publish("ZALO_SHARE_UPDATED", null, null, classId, null, null);
        }
        return schoolClassRepository.findClassDTOById(classId).orElseThrow();
    }

    /**
     * Get paginated school classes with search and term filter.
     */
    @Transactional(readOnly = true)
    public ResultPaginationDTO getSchoolClasses(String search, Integer termId, Pageable pageable) {
        return searchClasses(search, termId, null, pageable);
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getMySchoolClasses(String search, Integer termId, Pageable pageable) {
        return searchClasses(search, termId, accessService.currentLecturerId(), pageable);
    }

    private ResultPaginationDTO searchClasses(String search, Integer termId, Long lecturerId, Pageable pageable) {
        termService.validateTerm(termId);

        String cleanSearch = (search != null && !search.isBlank()) ? search.trim() : null;

        Page<SchoolClassDTO> page = schoolClassRepository.searchClasses(cleanSearch, termId, lecturerId, pageable);

        ResultPaginationDTO.Meta meta = ResultPaginationDTO.Meta.builder()
                .page(pageable.getPageNumber() + 1)
                .pageSize(pageable.getPageSize())
                .pages(page.getTotalPages())
                .total(page.getTotalElements())
                .build();

        return ResultPaginationDTO.builder()
                .meta(meta)
                .result(page.getContent())
                .build();
    }

    /**
     * Get class details by ID.
     */
    @Transactional(readOnly = true)
    public SchoolClassDTO getSchoolClassById(Integer classId) {
        accessService.requireReadAccess(schoolClassRepository.findById(classId)
                .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound")));
        return schoolClassRepository.findClassDTOById(classId)
                .orElseThrow(() -> new BadRequestResourceException(
                        "Lớp học không tồn tại với ID: " + classId,
                        "schoolClassManagement",
                        "classNotFound"
                ));
    }

    /**
     * Get all students belonging to a class.
     */
    @Transactional(readOnly = true)
    public List<StudentDTO> getStudentsByClassId(Integer classId) {
        accessService.requireReadAccess(schoolClassRepository.findById(classId)
                .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound")));

        List<StudentRow> rows = studentRepository.findStudentsBySchoolClassId(classId);

        return rows.stream()
                .map(this::toStudentDTO)
                .toList();
    }

    private StudentDTO toStudentDTO(StudentRow row) {
        boolean hasKey = row.activationKey() != null;
        boolean expired = row.activationKeyExpiresAt() != null
                && row.activationKeyExpiresAt().isBefore(Instant.now());

        return StudentDTO.builder()
                .userId(row.userId())
                .rollNumber(row.rollNumber())
                .fullName(row.fullName())
                .email(row.email())
                .memberCode(row.memberCode())
                .cohort(row.cohort())
                .slotType(row.slotType())
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
}
