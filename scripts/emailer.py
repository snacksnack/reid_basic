"""Shared email delivery helpers for resume-site notifications."""

import base64
import json
import os
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText

DEFAULT_NOTIFICATION_EMAIL = "hire.reid.collins@gmail.com"


def notification_recipient() -> str:
    return (
        os.environ.get("NOTIFICATION_EMAIL")
        or os.environ.get("DIGEST_EMAIL")
        or DEFAULT_NOTIFICATION_EMAIL
    )


def sender_email() -> str:
    return os.environ.get("SMTP_USERNAME") or DEFAULT_NOTIFICATION_EMAIL


def _gmail_access_token() -> str:
    required = {
        "GMAIL_CLIENT_ID": os.environ.get("GMAIL_CLIENT_ID"),
        "GMAIL_CLIENT_SECRET": os.environ.get("GMAIL_CLIENT_SECRET"),
        "GMAIL_REFRESH_TOKEN": os.environ.get("GMAIL_REFRESH_TOKEN"),
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing Gmail OAuth configuration: {', '.join(missing)}")

    payload = urllib.parse.urlencode(
        {
            "client_id": required["GMAIL_CLIENT_ID"],
            "client_secret": required["GMAIL_CLIENT_SECRET"],
            "refresh_token": required["GMAIL_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }
    ).encode()
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"Gmail token refresh failed: {e.code} {detail}") from e

    token = body.get("access_token")
    if not token:
        raise RuntimeError("Gmail token refresh did not return an access token")
    return token


def _send_via_gmail_api(message: MIMEText) -> None:
    token = _gmail_access_token()
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    payload = json.dumps({"raw": raw}).encode()
    request = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20):
            return
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"Gmail send failed: {e.code} {detail}") from e


def _send_via_sendgrid_smtp(message: MIMEText) -> None:
    sg_user = os.environ.get("SENDGRID_USERNAME")
    sg_pass = os.environ.get("SENDGRID_PASSWORD")
    if not sg_user or not sg_pass:
        raise RuntimeError("Email is not configured: Gmail OAuth or SendGrid credentials are required")

    with smtplib.SMTP("smtp.sendgrid.net", 587) as server:
        server.starttls()
        server.login(sg_user, sg_pass)
        server.send_message(message)


def send_notification_email(
    *,
    subject: str,
    body: str,
    from_name: str,
    reply_to: str | None = None,
) -> str:
    recipient = notification_recipient()
    from_email = sender_email()

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = recipient
    if reply_to:
        message["Reply-To"] = reply_to

    if os.environ.get("GMAIL_CLIENT_ID") or os.environ.get("GMAIL_REFRESH_TOKEN"):
        _send_via_gmail_api(message)
        return recipient

    _send_via_sendgrid_smtp(message)
    return recipient
