package tech.djnd.sample.app.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.Major;
import tech.djnd.sample.app.repository.MajorRepository;
import tech.djnd.sample.app.repository.MajorSpecifications;
import tech.djnd.sample.app.util.MajorCode;
import tech.djnd.sample.app.service.dto.MajorDTO;
import tech.djnd.sample.app.service.dto.ResultPaginationDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.service.errors.DataResourceConflictException;
import tech.djnd.sample.app.service.errors.DataResourceNotFoundException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class MajorService {

    private static final String ENTITY_NAME = "major";

    private final MajorRepository majorRepository;

    public MajorService(MajorRepository majorRepository) {
        this.majorRepository = majorRepository;
    }

    public MajorDTO createMajor(MajorDTO dto) {
        if (dto.getId() != null) {
            throw new BadRequestResourceException("A new major cannot have an ID", ENTITY_NAME, "idexists");
        }

        String code = normalizeCode(dto.getCode());
        String name = normalizeName(dto.getName());
        validateUniqueCodeAndName(code, name, null);

        Major major = new Major();
        major.setCode(code);
        major.setName(name);
        return toDTO(majorRepository.save(major));
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getMajors(String search, Boolean temporaryName, Pageable pageable) {
        Page<Major> page = majorRepository.findAll(MajorSpecifications.withSearch(search)
                .and(MajorSpecifications.withTemporaryName(temporaryName)), pageable);
        List<MajorDTO> majors = new ArrayList<>();
        for (Major major : page.getContent()) {
            majors.add(toDTO(major));
        }

        ResultPaginationDTO.Meta meta = new ResultPaginationDTO.Meta();
        meta.setPage(page.getNumber() + 1);
        meta.setPageSize(page.getSize());
        meta.setPages(page.getTotalPages());
        meta.setTotal(page.getTotalElements());

        ResultPaginationDTO result = new ResultPaginationDTO();
        result.setMeta(meta);
        result.setResult(majors);
        return result;
    }

    @Transactional(readOnly = true)
    public MajorDTO getMajorById(Integer id) {
        return toDTO(findMajorById(id));
    }

    public MajorDTO updateMajor(Integer id, MajorDTO dto) {
        if (dto.getId() != null && !dto.getId().equals(id)) {
            throw new BadRequestResourceException("Major ID does not match the URL", ENTITY_NAME, "idinvalid");
        }

        Major major = findMajorById(id);
        String code = normalizeCode(dto.getCode());
        String name = normalizeName(dto.getName());
        validateUniqueCodeAndName(code, name, id);

        // Keep codes stable for future imports using the published catalog.
        if (!MajorCode.normalize(major.getCode()).equals(code) && majorRepository.hasStudents(id)) {
            throw new DataResourceConflictException(
                    "Cannot change the code of a major used by students", ENTITY_NAME, "majorcodeinuse");
        }

        major.setCode(code);
        major.setName(name);
        return toDTO(majorRepository.save(major));
    }

    public void deleteMajor(Integer id) {
        Major major = findMajorById(id);
        if (majorRepository.hasStudents(id) || majorRepository.hasMajorTerms(id)) {
            throw new DataResourceConflictException(
                    "Cannot delete a major used by students or terms", ENTITY_NAME, "majorinuse");
        }
        majorRepository.delete(major);
    }

    private Major findMajorById(Integer id) {
        Optional<Major> major = majorRepository.findById(id);
        if (major.isEmpty()) {
            throw new DataResourceNotFoundException("Major not found with ID: " + id, ENTITY_NAME, "majornotfound");
        }
        return major.get();
    }

    private String normalizeCode(String code) {
        if (!MajorCode.isValid(MajorCode.normalize(code))) {
            throw new BadRequestResourceException("Major code must start with a letter or digit and contain only letters, digits or hyphens (1-20 characters)", ENTITY_NAME, "invalidcode");
        }
        return MajorCode.normalize(code);
    }

    private String normalizeName(String name) {
        if (name == null || name.trim().length() < 1 || name.trim().length() > 50) {
            throw new BadRequestResourceException("Major name must contain between 1 and 50 characters", ENTITY_NAME, "invalidname");
        }
        return name.trim();
    }

    private void validateUniqueCodeAndName(String code, String name, Integer id) {
        boolean codeExists;
        boolean nameExists;
        if (id == null) {
            codeExists = majorRepository.existsByCodeIgnoreCase(code);
            nameExists = majorRepository.existsByNameIgnoreCase(name);
        } else {
            codeExists = majorRepository.existsByCodeIgnoreCaseAndIdNot(code, id);
            nameExists = majorRepository.existsByNameIgnoreCaseAndIdNot(name, id);
        }

        if (codeExists) {
            throw new DataResourceConflictException("Major code already exists: " + code, ENTITY_NAME, "codeexists");
        }
        if (nameExists) {
            throw new DataResourceConflictException("Major name already exists: " + name, ENTITY_NAME, "nameexists");
        }
    }

    private MajorDTO toDTO(Major major) {
        MajorDTO dto = new MajorDTO();
        dto.setId(major.getId());
        dto.setCode(major.getCode());
        dto.setName(major.getName());
        return dto;
    }
}
