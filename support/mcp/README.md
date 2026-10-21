# Local assistant setup

Providence includes `providence-mcp` alongside its native adapter. Setup is optional. Providence never changes another application's configuration automatically.

Open the project in Providence, choose **Tools → MCP Connections → Client Setup**, choose allowed project/output folders and copy the configuration. This includes the editor's application-support settings so both clients can attach to the same session. Paste it into a local stdio MCP client's settings yourself.

For headless use, adapt `client-config.example.json`. Replace all example paths with absolute local paths. On Windows the executable ends in `.exe`; on macOS both executables are in the application's `Contents/MacOS` folder. On Linux use the bundled runtime directory. Keep the server beside its matching native adapter. Supply the same application-support arguments used by Providence when attaching to an open editor.

The project root restricts create/open locations; the output root restricts publications. Choose dedicated folders. Existing output is protected by no-clobber behavior. A project already owned by a different build or support configuration reports the mismatch rather than opening another writable session.

The shared host enforces the output grant separately for each assistant client. Optional `--input-root` arguments grant existing input folders for supported file-reading tools; configuring them does not add an unsupported import capability. File inputs use absolute paths. Grants remain local connection configuration and never travel in a scenario project.

Connected assistant changes share native revisions and Undo/Redo. Native drafts pause assistant mutations; reads remain available. Apply or discard drafts yourself. A disconnected editor's unresolved hold requires reconnecting or an explicit release in MCP Connections.

Current implementation and certification limits are documented in `docs/mcp/README.md` in the source distribution. MCP protocol, adapter protocol, portable snapshot format and exported package schema are independent versions. New scenario exports use schema v6.
