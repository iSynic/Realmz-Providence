pub const SCENARIO_SUPPORT_BYTES: usize = 600;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioSupportCodecError {
    WrongLength { actual: usize },
}

impl std::fmt::Display for ScenarioSupportCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WrongLength { actual } => write!(
                formatter,
                "Scenario support data must contain exactly {SCENARIO_SUPPORT_BYTES} bytes; found {actual}"
            ),
        }
    }
}

impl std::error::Error for ScenarioSupportCodecError {}

pub fn validate_scenario_support(bytes: &[u8]) -> Result<(), ScenarioSupportCodecError> {
    if bytes.len() == SCENARIO_SUPPORT_BYTES {
        Ok(())
    } else {
        Err(ScenarioSupportCodecError::WrongLength {
            actual: bytes.len(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn support_data_accepts_only_the_exact_preserve_only_geometry() {
        assert_eq!(
            validate_scenario_support(&[0; SCENARIO_SUPPORT_BYTES]),
            Ok(())
        );
        assert_eq!(
            validate_scenario_support(&[0; SCENARIO_SUPPORT_BYTES - 1]),
            Err(ScenarioSupportCodecError::WrongLength {
                actual: SCENARIO_SUPPORT_BYTES - 1,
            })
        );
        assert_eq!(
            validate_scenario_support(&[0; SCENARIO_SUPPORT_BYTES + 1]),
            Err(ScenarioSupportCodecError::WrongLength {
                actual: SCENARIO_SUPPORT_BYTES + 1,
            })
        );
    }
}
