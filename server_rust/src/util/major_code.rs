use regex::Regex;
use std::sync::LazyLock;

static MAJOR_CODE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z0-9][A-Z0-9-]{0,19}$").expect("valid regex"));

pub fn normalize(code: &str) -> String {
    code.trim().to_uppercase()
}

pub fn is_valid(code: &str) -> bool {
    MAJOR_CODE_REGEX.is_match(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_major_code() {
        assert!(is_valid("SE"));
        assert!(is_valid("AI"));
        assert!(is_valid("IA-01"));
        assert!(!is_valid(""));
        assert!(!is_valid("-SE"));
        assert!(!is_valid("se")); // must be uppercase before isValid, or after normalize
        assert!(is_valid(&normalize("se")));
    }
}
