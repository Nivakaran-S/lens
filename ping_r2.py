#!/usr/bin/env python3
"""
Ping Cloudflare R2 using the credentials in backend/.env.

This is independent of the Lens backend — it talks to R2 directly with boto3
and prints exactly what works and what fails. Use it to confirm whether the
credentials in your .env are correct before suspecting application code.

Usage:
    pip install boto3
    python ping_r2.py
"""

import sys
from pathlib import Path

ENV_PATH = Path(__file__).parent / "backend" / ".env"


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env parser — KEY=VALUE lines, ignores comments and blanks."""
    if not path.exists():
        sys.exit(f"Could not find {path}")

    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        # Strip optional surrounding quotes; remove inline-comment after value
        value = value.split("#", 1)[0].strip().strip('"').strip("'")
        env[key.strip()] = value
    return env


HINTS = {
    "InvalidAccessKeyId": (
        "R2_ACCESS_KEY_ID is wrong. Make sure you copied the S3 Access Key ID "
        "(32-char hex), not the cfat_ bearer token."
    ),
    "SignatureDoesNotMatch": (
        "R2_SECRET_ACCESS_KEY is wrong. The secret is shown only once on "
        "token creation — recreate the token if you missed it."
    ),
    "NoSuchBucket": (
        "R2_BUCKET name doesn't match any existing bucket. "
        "Check the bucket list on the R2 dashboard."
    ),
    "AccessDenied": (
        "The token doesn't have permission on this bucket. "
        "Recreate with 'Object Read & Write' scoped to the right bucket."
    ),
    "Forbidden": (
        "The token has the wrong scope or jurisdiction. "
        "Recreate with explicit bucket permissions."
    ),
}


def diagnose(code: str) -> None:
    if code in HINTS:
        print(f"        → {HINTS[code]}")


def main() -> None:
    try:
        import boto3
        from botocore.exceptions import ClientError, EndpointConnectionError
        from botocore.config import Config
    except ImportError:
        sys.exit("boto3 is not installed. Run:  pip install boto3")

    env = load_env(ENV_PATH)

    required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        sys.exit(f"Missing in {ENV_PATH}: {', '.join(missing)}")

    account_id = env["R2_ACCOUNT_ID"]
    access_key = env["R2_ACCESS_KEY_ID"]
    secret_key = env["R2_SECRET_ACCESS_KEY"]
    bucket = env.get("R2_BUCKET") or "lens-packs"
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    print("R2 ping diagnostic")
    print("==================")
    print(f"Endpoint:       {endpoint}")
    print(f"Bucket:         {bucket}")
    print(f"Access Key ID:  {access_key[:8]}…  (length: {len(access_key)})")
    print(f"Secret length:  {len(secret_key)} chars")
    print()

    s3 = boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(connect_timeout=8, read_timeout=15, retries={"max_attempts": 1}),
    )

    failed = False

    # ── Test 1: list_buckets — proves creds at the account level ──────────
    print("[1/5] list_buckets …", end=" ", flush=True)
    try:
        result = s3.list_buckets()
        names = [b["Name"] for b in result.get("Buckets", [])]
        print(f"ok  ({len(names)} bucket{'s' if len(names) != 1 else ''} visible)")
        for name in names:
            marker = "  ← target" if name == bucket else ""
            print(f"        • {name}{marker}")
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        print(f"FAIL  ({code}: {msg})")
        diagnose(code)
        sys.exit(1)
    except EndpointConnectionError as e:
        print(f"FAIL  (network: {e})")
        sys.exit(1)

    # ── Test 2: head_bucket on the configured bucket ──────────────────────
    print(f"[2/5] head_bucket '{bucket}' …", end=" ", flush=True)
    try:
        s3.head_bucket(Bucket=bucket)
        print("ok")
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        print(f"FAIL  ({code}: {msg})")
        diagnose(code)
        failed = True

    # ── Test 3: list_objects_v2 ────────────────────────────────────────────
    print(f"[3/5] list_objects_v2 (max 5) …", end=" ", flush=True)
    try:
        result = s3.list_objects_v2(Bucket=bucket, MaxKeys=5)
        count = result.get("KeyCount", 0)
        print(f"ok  ({count} object{'s' if count != 1 else ''} in first page)")
        for obj in result.get("Contents", []):
            print(f"        • {obj['Key']}  ({obj['Size']} bytes)")
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        print(f"FAIL  ({code}: {msg})")
        diagnose(code)
        failed = True

    # ── Test 4: presign a PUT URL (local HMAC) ─────────────────────────────
    print(f"[4/5] generate_presigned_url (PUT) …", end=" ", flush=True)
    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": "_diag/ping-test.zip",
                "ContentType": "application/zip",
            },
            ExpiresIn=300,
        )
        print(f"ok")
        print(f"        URL: {url[:90]}…")
    except Exception as e:
        print(f"FAIL  ({e})")
        failed = True

    # ── Test 5: round-trip an actual object (put → get → delete) ───────────
    test_key = "_diag/ping-test.txt"
    test_body = b"lens R2 round-trip ping"
    print(f"[5/5] put → get → delete '{test_key}' …", end=" ", flush=True)
    try:
        s3.put_object(Bucket=bucket, Key=test_key, Body=test_body, ContentType="text/plain")
        got = s3.get_object(Bucket=bucket, Key=test_key)["Body"].read()
        if got != test_body:
            raise RuntimeError(f"round-trip body mismatch: got {got!r}")
        s3.delete_object(Bucket=bucket, Key=test_key)
        print("ok")
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        print(f"FAIL  ({code}: {msg})")
        diagnose(code)
        failed = True
    except Exception as e:
        print(f"FAIL  ({e})")
        failed = True

    print()
    if failed:
        print("✗ One or more tests failed. See errors above.")
        sys.exit(1)
    print("✓ All tests passed — credentials, bucket, and permissions are correct.")
    print("  If the deployed backend still fails, the issue is NOT R2.")


if __name__ == "__main__":
    main()
