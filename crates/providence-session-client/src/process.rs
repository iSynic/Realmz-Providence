//! A session host must not retain a client's inherited console or pipe handles.
use std::{io, path::Path};

#[cfg(not(windows))]
pub fn spawn_host(executable: &Path, arguments: &[String]) -> io::Result<()> {
    use std::process::{Command, Stdio};
    let mut child = Command::new(executable)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(windows)]
pub fn spawn_host(executable: &Path, arguments: &[String]) -> io::Result<()> {
    use std::{
        os::windows::io::{FromRawHandle, OwnedHandle},
        ptr,
    };
    use windows_sys::Win32::System::Threading::{
        CREATE_NO_WINDOW, CreateProcessW, PROCESS_INFORMATION, STARTUPINFOW,
    };
    let application = wide(executable.as_os_str())?;
    let mut line = quote(executable.as_os_str())?;
    for argument in arguments {
        line.push(b' ' as u16);
        line.extend(quote(std::ffi::OsStr::new(argument))?);
    }
    line.push(0);
    // These Win32 structures are plain data. Both strings are NUL-terminated,
    // live for the call, and the command line is writable as Win32 requires.
    let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
    startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    let mut result: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    // No inheritable handles cross this boundary. In particular, an editor or
    // MCP client can finish while another client keeps the session host alive.
    let created = unsafe {
        CreateProcessW(
            application.as_ptr(),
            line.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            0,
            CREATE_NO_WINDOW,
            ptr::null(),
            ptr::null(),
            &startup,
            &mut result,
        )
    };
    if created == 0 {
        return Err(io::Error::last_os_error());
    }
    // A successful CreateProcess transfers these two unique owned handles.
    let _process = unsafe { OwnedHandle::from_raw_handle(result.hProcess) };
    let _thread = unsafe { OwnedHandle::from_raw_handle(result.hThread) };
    Ok(())
}

#[cfg(windows)]
fn wide(argument: &std::ffi::OsStr) -> io::Result<Vec<u16>> {
    use std::os::windows::ffi::OsStrExt;
    let mut result = argument.encode_wide().collect::<Vec<_>>();
    if result.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "process argument contains NUL",
        ));
    }
    result.push(0);
    Ok(result)
}

#[cfg(windows)]
fn quote(argument: &std::ffi::OsStr) -> io::Result<Vec<u16>> {
    let mut result = vec![b'"' as u16];
    let mut slashes = 0;
    let mut argument = wide(argument)?;
    argument.pop();
    for value in argument {
        if value == b'\\' as u16 {
            slashes += 1;
            continue;
        }
        let escaping = value == b'"' as u16;
        result.extend(std::iter::repeat_n(
            b'\\' as u16,
            if escaping { slashes * 2 + 1 } else { slashes },
        ));
        result.push(value);
        slashes = 0;
    }
    result.extend(std::iter::repeat_n(b'\\' as u16, slashes * 2));
    result.push(b'"' as u16);
    Ok(result)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn windows_arguments_preserve_spaces_quotes_and_trailing_backslashes() {
        let encode =
            |text: &str| String::from_utf16(&quote(std::ffi::OsStr::new(text)).unwrap()).unwrap();
        assert_eq!(encode(""), "\"\"");
        assert_eq!(encode("a b"), "\"a b\"");
        assert_eq!(encode("a\"b"), "\"a\\\"b\"");
        assert_eq!(encode("c:\\folder\\"), "\"c:\\folder\\\\\"");
        assert_eq!(encode("Café"), "\"Café\"");
    }
}
