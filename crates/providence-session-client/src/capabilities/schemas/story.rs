use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "scenario-startup.validate" | "scenario-startup.update" => vec![("startup", startup())],
        "scenario-contact.validate" | "scenario-contact.update" => vec![("contact", contact())],
        "scenario-restrictions.validate" | "scenario-restrictions.update" => {
            vec![("restrictions", restrictions())]
        }
        "text.allocate" => vec![("family", choices(&["message", "option-label"]))],
        "text.apply-draft" => vec![(
            "draft",
            object(
                json!({
                    "family":choices(&["message","option-label"]),"nativeId":integer(0,32767),
                    "expectedText":nullable(text(255)),"text":text(255)
                }),
                &["expectedText"],
            ),
        )],
        "option-label.update" => vec![(
            "optionLabel",
            object(
                json!({
                    "identity":identity(),"nativeId":integer(0,32767),"text":text(24),"authored":{"type":"boolean"}
                }),
                &["authored"],
            ),
        )],
        "quest-label.upsert" => vec![(
            "questLabel",
            object(
                json!({
                    "id":integer(1,126),"label":text(4096),"note":text(16384)
                }),
                &["note"],
            ),
        )],
        "global-macro.update" => vec![
            (
                "hook",
                choices(&["start", "death", "quit", "shop", "temple"]),
            ),
            ("target", nullable(identity())),
        ],
        "global-macro.update-all" => vec![(
            "hooks",
            object(
                json!({
                    "start":nullable(identity()),"death":nullable(identity()),"quit":nullable(identity()),
                    "shop":nullable(identity()),"temple":nullable(identity())
                }),
                &[],
            ),
        )],
        "start-location.set" => vec![(
            "location",
            object(json!({"map":identity(),"coordinate":coordinate()}), &[]),
        )],
        _ => vec![],
    }
}

fn startup() -> Value {
    object(
        json!({
            "name":text(255),"markerFilename":text(255),
            "recommendedPartyLevels":integer(0,i32::MAX.into()),
            "maximumPartyLevels":integer(0,i32::MAX.into()),
            "creatorUserCheck":text(255),
            "startLocation":object(json!({"map":identity(),"coordinate":coordinate()}),&[])
        }),
        &[],
    )
}

fn contact() -> Value {
    let mut properties = json!({});
    let fields = [
        "title",
        "version",
        "date",
        "author",
        "email",
        "web",
        "fee",
        "description",
    ];
    for field in fields {
        properties[field] = text(255);
    }
    object(properties, &[])
}

fn restrictions() -> Value {
    object(
        json!({
            "description":text(255),"maxPartySize":integer(1,6),"maxLevel":integer(0,32767),
            "bannedRaces":array(identity(),0,30),"bannedCastes":array(identity(),0,30)
        }),
        &[],
    )
}
