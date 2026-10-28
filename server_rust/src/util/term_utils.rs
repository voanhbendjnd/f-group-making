use chrono::{Datelike, Local, NaiveDate};
use regex::Regex;
use std::sync::LazyLock;

static TERM_NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(SP|SU|FALL)(\d{2})$").expect("valid regex"));

/// Determines term name for a given date:
/// - Jan to Apr (1 - 4): SP{yy}
/// - May to Aug (5 - 8): SU{yy}
/// - Sep to Dec (9 - 12): FALL{yy}
pub fn get_current_term_name(date: Option<NaiveDate>) -> String {
    let d = date.unwrap_or_else(|| Local::now().date_naive());
    let month = d.month();
    let year_two_digits = d.year() % 100;
    let year_str = format!("{:02}", year_two_digits);

    let season = if month <= 4 {
        "SP"
    } else if month <= 8 {
        "SU"
    } else {
        "FALL"
    };

    format!("{}{}", season, year_str)
}

pub fn is_valid_term_name(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return false;
    }
    TERM_NAME_REGEX.is_match(trimmed)
}

pub fn normalize(name: &str) -> String {
    name.trim().to_uppercase()
}

/// Calculates an integer order index to compare terms chronologically.
/// SP = 0, SU = 1, FALL = 2.
/// Value = (2000 + yy) * 3 + seasonIndex.
pub fn get_chronological_value(name: &str) -> Option<i32> {
    let trimmed = name.trim();
    let caps = TERM_NAME_REGEX.captures(trimmed)?;
    let season = caps.get(1)?.as_str().to_uppercase();
    let year_two_digits: i32 = caps.get(2)?.as_str().parse().ok()?;
    let full_year = 2000 + year_two_digits;

    let season_index = match season.as_str() {
        "SP" => 0,
        "SU" => 1,
        "FALL" => 2,
        _ => 0,
    };

    Some(full_year * 3 + season_index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_term_utils() {
        assert!(is_valid_term_name("SP26"));
        assert!(is_valid_term_name("su26"));
        assert!(is_valid_term_name("FALL26"));
        assert!(!is_valid_term_name("WI26"));
        assert!(!is_valid_term_name("SP2026"));

        assert_eq!(normalize(" sp26 "), "SP26");

        let sp26 = get_chronological_value("SP26").unwrap();
        let su26 = get_chronological_value("SU26").unwrap();
        let fall26 = get_chronological_value("FALL26").unwrap();
        let sp27 = get_chronological_value("SP27").unwrap();

        assert!(sp26 < su26);
        assert!(su26 < fall26);
        assert!(fall26 < sp27);
    }
}
