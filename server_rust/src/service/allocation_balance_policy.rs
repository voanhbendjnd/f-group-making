pub struct AllocationBalancePolicy;

impl AllocationBalancePolicy {
    pub fn minimum_size(students: i32, groups: i32) -> i32 {
        if groups <= 0 {
            0
        } else {
            students / groups
        }
    }

    pub fn maximum_size(students: i32, groups: i32) -> i32 {
        if groups <= 0 {
            0
        } else {
            students / groups + if students % groups == 0 { 0 } else { 1 }
        }
    }

    pub fn is_balanced(sizes: &[i32]) -> bool {
        if sizes.is_empty() {
            return false;
        }
        let min = match sizes.iter().min() {
            Some(&m) => m,
            None => return false,
        };
        let max = match sizes.iter().max() {
            Some(&m) => m,
            None => return false,
        };
        min > 0 && max - min <= 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_balance_policy() {
        assert_eq!(AllocationBalancePolicy::minimum_size(10, 3), 3);
        assert_eq!(AllocationBalancePolicy::maximum_size(10, 3), 4);
        assert!(AllocationBalancePolicy::is_balanced(&[3, 3, 4]));
        assert!(AllocationBalancePolicy::is_balanced(&[4, 4, 4]));
        assert!(!AllocationBalancePolicy::is_balanced(&[3, 3, 5]));
        assert!(!AllocationBalancePolicy::is_balanced(&[0, 1, 1]));
        assert!(!AllocationBalancePolicy::is_balanced(&[]));
    }
}
