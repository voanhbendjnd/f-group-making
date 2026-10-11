package tech.djnd.sample.app.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.repository.SchoolClassRepository;
import tech.djnd.sample.app.repository.StudentRepository;
import tech.djnd.sample.app.service.dto.ResultPaginationDTO;
import tech.djnd.sample.app.service.dto.SchoolClassDTO;
import tech.djnd.sample.app.service.dto.StudentDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.service.projection.StudentRow;

import java.time.Instant;
import java.util.List;

@Slf4j
@Service
@Transactional
public class SchoolClassService {

    private final SchoolClassRepository schoolClassRepository;
    private final StudentRepository studentRepository;
    private final TermService termService;

    public SchoolClassService(
            SchoolClassRepository schoolClassRepository,
            StudentRepository studentRepository,
            TermService termService
    ) {
        this.schoolClassRepository = schoolClassRepository;
        this.studentRepository = studentRepository;
        this.termService = termService;
    }

    /**
     * Get paginated school classes with search and term filter.
     */
    @Transactional(readOnly = true)
    public ResultPaginationDTO getSchoolClasses(String search, Integer termId, Pageable pageable) {
        termService.validateTerm(termId);
        String cleanSearch = (search != null && !search.isBlank()) ? search.trim() : null;

        Page<SchoolClassDTO> page = schoolClassRepository.searchClasses(cleanSearch, termId, pageable);

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
        if (!schoolClassRepository.existsById(classId)) {
            throw new BadRequestResourceException(
                    "Lớp học không tồn tại với ID: " + classId,
                    "schoolClassManagement",
                    "classNotFound"
            );
        }

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
