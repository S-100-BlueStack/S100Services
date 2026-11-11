"""Convert local Outlook samples to bounded offline JSON; never contacts a mailbox or API.

Install the development-only reader with `python -m pip install extract-msg==0.55.0`.
Original report bytes are retained for format-detection testing. Output contains
private correspondence: use a private scratch directory and do not commit it.
"""

import argparse
import base64
import email.utils
import hashlib
import json
from pathlib import Path

import extract_msg


def main():
    """Normalize each .msg into one replay document, with trust explicitly disabled."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    for source in sorted(args.source.glob("*.msg")):
        if source.stat().st_size > 24 * 1024 * 1024:
            raise ValueError("Sample exceeds 24 MiB")
        with extract_msg.Message(source) as message:
            attachments = []
            total = 0
            for attachment in message.attachments:
                name = attachment.longFilename or attachment.shortFilename or "unknown"
                if not name.upper().startswith(("P007_", "DMDLOAD_")):
                    continue
                data = attachment.data
                total += len(data)
                if len(data) > 8 * 1024 * 1024 or total > 16 * 1024 * 1024:
                    raise ValueError("Report exceeds replay limit")
                attachments.append({"Name": name, "Content": base64.b64encode(data).decode("ascii")})
            if message.date is None or message.date.tzinfo is None:
                raise ValueError("Sample must have a timestamp with an explicit offset")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            normalized = {
                "Id": "offline-" + digest,
                "InternetMessageId": message.messageId,
                "Sender": email.utils.parseaddr(message.sender or "")[1],
                # Offline .msg replay uses the sample's message date; it never applies live results.
                "ReceivedAt": message.date.isoformat(),
                "Subject": message.subject or "",
                "Body": message.body or "",
                "Attachments": attachments,
                "TrustedSender": False,
            }
            (args.destination / (digest + ".json")).write_text(json.dumps(normalized, ensure_ascii=False), encoding="utf-8")
    print("Normalized samples for offline dry-run only.")


if __name__ == "__main__":
    main()
