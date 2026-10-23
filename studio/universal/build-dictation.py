#!/usr/bin/env python3
"""Build an unsigned *native Apple Shortcut*, not a browser voice app.
Diagnostic stage: native Dictate Text -> Show Result. No OAuth or network calls.
Signing with Apple AEA1 and testing on real iPhone/Watch are separate gates.
"""
import plistlib
import uuid
from pathlib import Path

def uid():
    return str(uuid.uuid4()).upper()

def action(identifier, parameters):
    return {"WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
            "WFWorkflowActionParameters": parameters}

def build():
    dictate_id, result_id = uid(), uid()
    actions = [
        action("dictatetext", {"UUID": dictate_id, "WFDictateTextLanguage": "ru-RU"}),
        action("showresult", {"UUID": result_id, "Text": {
            "Value": {"Type": "ActionOutput", "OutputUUID": dictate_id,
                      "OutputName": "Dictated Text"},
            "WFSerializationType": "WFTextTokenAttachment"}})
    ]
    document = {
        "WFWorkflowName": "Mapkepp — Голосовой прототип",
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "4033.0.4.3",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61440,
                           "WFWorkflowIconStartColor": 4282601983},
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": ["WFWorkflowTypeShowInSearch", "Watch"],
        "WFQuickActionSurfaces": []
    }
    return document

if __name__ == "__main__":
    result = build()
    output = Path(__file__).with_name("Mapkepp-Voice-Dictation-UNSIGNED.shortcut")
    output.write_bytes(plistlib.dumps(result, fmt=plistlib.FMT_XML))
    parsed = plistlib.loads(output.read_bytes())
    assert len(parsed["WFWorkflowActions"]) == 2
    assert parsed["WFWorkflowActions"][0]["WFWorkflowActionIdentifier"].endswith("dictatetext")
    assert parsed["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["Text"]["Value"]["OutputUUID"] == parsed["WFWorkflowActions"][0]["WFWorkflowActionParameters"]["UUID"]
    assert not any(x in output.read_text() for x in ["Bearer ", "api.iot.yandex.net", "YANDEX_OAUTH_TOKEN"])
    print("PASS: valid native plist; action reference; no network, no token")
