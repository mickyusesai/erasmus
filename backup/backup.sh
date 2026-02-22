#!/bin/sh
set -e

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
FILENAME="erasmus_backup_${TIMESTAMP}.sql.gz"

# Build R2 endpoint — respects EU jurisdiction if set
if [ -n "$R2_JURISDICTION" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.${R2_JURISDICTION}.r2.cloudflarestorage.com"
else
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

echo "=== EasyReimburse DB Backup: $FILENAME ==="

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_BUCKET_NAME" ]; then
  echo "ERROR: R2 environment variables are not set"
  exit 1
fi

# Dump and compress
echo "Running pg_dump..."
pg_dump "$DATABASE_URL" | gzip > "/tmp/$FILENAME"
SIZE=$(du -sh "/tmp/$FILENAME" | cut -f1)
echo "Dump complete. Compressed size: $SIZE"

# Upload to R2
echo "Uploading to R2 bucket: $R2_BUCKET_NAME/db-backups/$FILENAME"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "/tmp/$FILENAME" "s3://${R2_BUCKET_NAME}/db-backups/$FILENAME" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

rm -f "/tmp/$FILENAME"
echo "=== Backup complete: db-backups/$FILENAME ==="
