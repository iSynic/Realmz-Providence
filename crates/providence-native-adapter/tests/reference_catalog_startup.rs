use std::io::Write;
use std::process::{Command, Output, Stdio};

use providence_core::codecs::{ResourceEntry, encode_scenario_icon_cicn, write_resource_fork};
use serde_json::{Value, json};

fn run(arguments: &[&str], requests: &[Value]) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_providence-native-adapter"))
        .args(arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start actual adapter executable");
    let mut input = child.stdin.take().unwrap();
    for request in requests {
        writeln!(input, "{request}").unwrap();
    }
    drop(input);
    child.wait_with_output().unwrap()
}

fn responses(output: &Output) -> Vec<Value> {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout.clone())
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[test]
fn reference_catalog_startup_loads_vault_in_the_actual_demo_process() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("Divinity Data");
    let catalog = temporary.path().join("catalog");
    std::fs::create_dir(&source).unwrap();
    let artwork = encode_scenario_icon_cicn(&vec![255; 32 * 32 * 4], 32, 32).unwrap();
    for (name, id) in [
        ("Bag of Holding.rsrc", -185),
        ("Vault of Arcana.rsrc", 9000),
    ] {
        let fork = write_resource_fork(&[ResourceEntry {
            resource_type: *b"cicn",
            id,
            name: "Controlled startup artwork".into(),
            attributes: 0,
            data: artwork.clone(),
        }])
        .unwrap();
        std::fs::write(source.join(name), fork).unwrap();
    }
    let imported = responses(&run(
        &["serve-demo"],
        &[
            json!({"id": 1, "method": "reference-catalog.import-divinity", "params": {
                "sourceDirectory": source, "libraryRoot": catalog
            }}),
        ],
    ));
    assert_eq!(imported[0]["ok"], true, "{imported:?}");
    let list = json!({"id": 2, "method": "reference-catalog.list", "params": {
        "kind": "vault-icon", "limit": 1, "offset": 0
    }});
    let absent = responses(&run(&["serve-demo"], std::slice::from_ref(&list)));
    assert_eq!(absent[0]["result"]["configured"], false);
    let loaded = responses(&run(
        &[
            "serve-demo",
            "--reference-catalog-root",
            catalog.to_str().unwrap(),
        ],
        &[
            list,
            json!({"id": 3, "method": "reference-catalog.preview", "params": {
                "identity": "divinity:vault-icon:9000"
            }}),
            json!({"id": 4, "method": "project.save", "params": {}}),
        ],
    ));
    assert_eq!(loaded[0]["ok"], true);
    assert_eq!(loaded[0]["result"]["configured"], true);
    assert_eq!(loaded[0]["result"]["total"], 1);
    assert_eq!(
        loaded[0]["result"]["items"][0]["identity"],
        "divinity:vault-icon:9000"
    );
    assert_eq!(loaded[1]["ok"], true);
    assert_eq!(loaded[1]["result"]["mimeType"], "image/png");
    assert!(
        loaded[1]["result"]["base64"]
            .as_str()
            .unwrap()
            .starts_with("iVBOR")
    );
    assert_eq!(
        loaded[2]["ok"], false,
        "Loading a library must not turn the example into a saved project"
    );
    let invalid = run(&["serve-demo", "--reference-catalog-root"], &[]);
    assert!(
        !invalid.status.success(),
        "Startup must not silently ignore library options"
    );
}
