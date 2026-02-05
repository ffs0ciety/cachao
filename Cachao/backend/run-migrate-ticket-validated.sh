#!/usr/bin/env bash
# Run the ticket validation migration in AWS (adds validated_at to ticket_orders).
# Uses AWS profile and region from samconfig (e.g. profile=personal, region=eu-west-1).

set -e
cd "$(dirname "$0")"

STACK_NAME="${SAM_STACK_NAME:-Cachao}"
REGION="${AWS_REGION:-eu-west-1}"
PROFILE="${AWS_PROFILE:-personal}"

API_URL=$(AWS_PROFILE="$PROFILE" AWS_REGION="$REGION" aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='CachaoApi'].OutputValue" \
  --output text)

if [[ -z "$API_URL" ]]; then
  echo "Could not get API URL from stack $STACK_NAME. Deploy first: sam build && sam deploy"
  exit 1
fi

# Remove trailing slash
API_BASE="${API_URL%/}"
MIGRATE_URL="${API_BASE}/admin/migrate-add-ticket-validated"

echo "Calling migration: POST $MIGRATE_URL"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$MIGRATE_URL" -H "Content-Type: application/json")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)

echo "$BODY"
if [[ "$CODE" != "200" ]]; then
  echo "HTTP $CODE"
  exit 1
fi
echo "Migration completed successfully."
