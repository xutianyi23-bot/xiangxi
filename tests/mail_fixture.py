"""Exercise the app's mail reader against an in-memory IMAP transcript."""
import json
import sys
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "macos"))
from mail_reader import read_box

message = EmailMessage()
message["Subject"] = "Manuscript revision"
message["From"] = "reviewer@example.test"
message.set_content("Please add a comparison.\nThe remaining text is original.")
message.add_alternative("<p>HTML alternative</p>", subtype="html")
raw = message.as_bytes()

with patch("imaplib.IMAP4_SSL") as connection:
    mailbox = connection.return_value.__enter__.return_value
    mailbox.select.return_value = ("OK", [b"1"])
    mailbox.response.return_value = ("UIDVALIDITY", [b"101"])
    mailbox.uid.side_effect = [
        ("OK", [b"42"]),
        ("OK", [b"1 (RFC822.SIZE %d)" % len(raw)]),
        ("OK", [(b"1", raw)]),
    ]
    config = dict(host="imap.example.test", port="993", user="researcher", secret="fixture")
    page = read_box(config)
    mailbox.select.assert_called_once_with("INBOX", readonly=True)
    mailbox.uid.assert_called_with("fetch", "42", "(BODY.PEEK[])")
    assert page["items"][0]["body"] == message.get_body(preferencelist=("plain",)).get_content()
    print(json.dumps(page))
