package com.fmaking.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.Term;
import com.fmaking.repository.TermRepository;
import com.fmaking.service.dto.CreateTermRequestDTO;
import com.fmaking.service.dto.TermDTO;
import com.fmaking.service.errors.BadRequestResourceException;
import com.fmaking.util.TermUtils;

import java.util.Comparator;
import java.util.List;

@Slf4j
@Service
@Transactional
public class TermService {

    private final TermRepository termRepository;

    public TermService(TermRepository termRepository) {
        this.termRepository = termRepository;
    }

    @Transactional(readOnly = true)
    public void validateTerm(Integer termId) {
        if (termId != null && (termId <= 0 || !termRepository.existsById(termId))) {
            throw new BadRequestResourceException("Term not found", "termManagement", "termNotFound");
        }
    }

    @Transactional(readOnly = true)
    public void validateUserIdsInTerm(List<Long> userIds, Integer termId) {
        validateTerm(termId);
        if (termId == null) return;
        if (userIds == null || userIds.isEmpty() || userIds.stream().anyMatch(java.util.Objects::isNull)) {
            throw new BadRequestResourceException("User IDs must not be empty or null", "termManagement", "invalidids");
        }
        List<Long> distinctIds = userIds.stream().distinct().toList();
        if (termRepository.findUserIdsInTerm(distinctIds, termId).size() != distinctIds.size()) {
            throw new BadRequestResourceException("One or more users do not belong to the selected term",
                    "termManagement", "userOutsideTerm");
        }
    }

    @Transactional(readOnly = true)
    public void validateEmailInTerm(String email, Integer termId) {
        validateTerm(termId);
        if (termId == null) return;
        Long userId = termRepository.findUserIdByEmail(email.trim())
                .orElseThrow(() -> new BadRequestResourceException("User not found", "termManagement", "usernotfound"));
        validateUserIdsInTerm(List.of(userId), termId);
    }

    /**
     * Ensures that the current active term exists in DB. If not, automatically creates it.
     */
    public Term ensureCurrentTerm() {
        String currentTermName = TermUtils.getCurrentTermName();
        return termRepository.findByNameIgnoreCase(currentTermName)
                .orElseGet(() -> {
                    log.info("Current term '{}' not found in database. Auto-creating term...", currentTermName);
                    Term newTerm = new Term();
                    newTerm.setName(currentTermName);
                    return termRepository.save(newTerm);
                });
    }

    /**
     * Get available terms.
     * When currentAndFutureOnly is true, only returns terms from the current term onwards.
     */
    @Transactional
    public List<TermDTO> getAvailableTerms(Boolean currentAndFutureOnly) {
        // Ensure current term exists
        Term currentTerm = ensureCurrentTerm();
        String currentTermName = currentTerm.getName();
        Integer currentChronologicalVal = TermUtils.getChronologicalValue(currentTermName);

        List<Term> allTerms = termRepository.findAll();

        return allTerms.stream()
                .filter(term -> {
                    if (Boolean.FALSE.equals(currentAndFutureOnly)) {
                        return true;
                    }
                    Integer termVal = TermUtils.getChronologicalValue(term.getName());
                    // Keep if unknown format or chronological value >= current
                    return termVal == null || (currentChronologicalVal != null && termVal >= currentChronologicalVal);
                })
                .sorted(Comparator.comparing(
                        term -> TermUtils.getChronologicalValue(term.getName()),
                        Comparator.nullsLast(Comparator.naturalOrder())
                ))
                .map(term -> TermDTO.builder()
                        .id(term.getId())
                        .name(term.getName())
                        .isCurrent(term.getName().equalsIgnoreCase(currentTermName))
                        .build())
                .toList();
    }

    /**
     * Get current active term.
     */
    public TermDTO getCurrentTerm() {
        Term term = ensureCurrentTerm();
        return TermDTO.builder()
                .id(term.getId())
                .name(term.getName())
                .isCurrent(true)
                .build();
    }

    /**
     * Create a term (current or future only).
     */
    public TermDTO createFutureTerm(CreateTermRequestDTO request) {
        if (!TermUtils.isValidTermName(request.getName())) {
            throw new BadRequestResourceException(
                    "Term name format is invalid. Required format: SP{yy}, SU{yy}, or FALL{yy}",
                    "termManagement",
                    "invalidTermFormat"
            );
        }

        String normalizedName = TermUtils.normalize(request.getName());

        if (termRepository.existsByNameIgnoreCase(normalizedName)) {
            throw new BadRequestResourceException(
                    "Term '" + normalizedName + "' already exists.",
                    "termManagement",
                    "termAlreadyExists"
            );
        }

        Integer newTermVal = TermUtils.getChronologicalValue(normalizedName);
        Integer currentTermVal = TermUtils.getChronologicalValue(TermUtils.getCurrentTermName());

        if (newTermVal != null && currentTermVal != null && newTermVal < currentTermVal) {
            throw new BadRequestResourceException(
                    "Cannot create a past term. Only current or future terms are allowed.",
                    "termManagement",
                    "pastTermNotAllowed"
            );
        }

        Term term = new Term();
        term.setName(normalizedName);
        Term saved = termRepository.save(term);
        log.info("Created term: id={}, name={}", saved.getId(), saved.getName());

        return TermDTO.builder()
                .id(saved.getId())
                .name(saved.getName())
                .isCurrent(saved.getName().equalsIgnoreCase(TermUtils.getCurrentTermName()))
                .build();
    }
}
