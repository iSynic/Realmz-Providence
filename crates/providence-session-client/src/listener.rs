use crate::endpoint::Endpoint;
use interprocess::local_socket::ListenerOptions;
pub use interprocess::local_socket::{Listener, Stream, prelude::*};

pub fn listen(endpoint: &Endpoint) -> Result<Listener, String> {
    let options = ListenerOptions::new().name(endpoint.name()?);
    #[cfg(windows)]
    let options = {
        use interprocess::os::windows::{
            local_socket::ListenerOptionsExt, security_descriptor::SecurityDescriptor,
        };
        let sddl = widestring::U16CString::from_str("D:P(A;;GA;;;OW)(A;;GA;;;SY)")
            .map_err(|e| e.to_string())?;
        options
            .security_descriptor(SecurityDescriptor::deserialize(&sddl).map_err(|e| e.to_string())?)
    };
    let listener = options.create_sync().map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&endpoint.address, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(listener)
}
