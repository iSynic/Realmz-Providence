use serde_json::Value;

pub(crate) fn required_string(params: &Value, name: &str) -> Result<String, String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("missing string parameter {name}"))
}

pub(crate) fn required_value<'a>(params: &'a Value, name: &str) -> Result<&'a Value, String> {
    params
        .get(name)
        .ok_or_else(|| format!("missing parameter {name}"))
}

pub(crate) fn required_u64(params: &Value, name: &str) -> Result<u64, String> {
    params
        .get(name)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("missing integer parameter {name}"))
}

pub(crate) fn required_i64(params: &Value, name: &str) -> Result<i64, String> {
    params
        .get(name)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("missing integer parameter {name}"))
}

pub(crate) fn required_u32(params: &Value, name: &str) -> Result<u32, String> {
    let value = required_u64(params, name)?;
    u32::try_from(value).map_err(|_| format!("integer parameter {name} is outside u32 range"))
}

pub(crate) fn required_u8(params: &Value, name: &str) -> Result<u8, String> {
    let value = required_u64(params, name)?;
    u8::try_from(value).map_err(|_| format!("integer parameter {name} is outside u8 range"))
}

pub(crate) fn required_u16(params: &Value, name: &str) -> Result<u16, String> {
    let value = required_u64(params, name)?;
    u16::try_from(value).map_err(|_| format!("integer parameter {name} is outside u16 range"))
}

pub(crate) fn required_i16(params: &Value, name: &str) -> Result<i16, String> {
    let value = required_i64(params, name)?;
    i16::try_from(value).map_err(|_| format!("integer parameter {name} is outside i16 range"))
}

pub(crate) fn coerce_integral_numbers(value: Value) -> Value {
    match value {
        Value::Number(number) if number.is_f64() => number
            .as_f64()
            .filter(|number| number.is_finite() && number.fract() == 0.0)
            .filter(|number| *number >= i64::MIN as f64 && *number <= i64::MAX as f64)
            .map(|number| Value::Number(serde_json::Number::from(number as i64)))
            .unwrap_or(Value::Number(number)),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(coerce_integral_numbers).collect())
        }
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, coerce_integral_numbers(value)))
                .collect(),
        ),
        value => value,
    }
}
