#!/bin/bash
# Script to update template.yaml with new RDS endpoint

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <rds-endpoint>"
  echo "Example: $0 cachao-dev-db.xxxxx.rds.amazonaws.com"
  exit 1
fi

NEW_ENDPOINT="$1"
TEMPLATE_FILE="template.yaml"
OLD_ENDPOINT="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"

echo "🔄 Updating template.yaml with new RDS endpoint..."
echo "   Old: $OLD_ENDPOINT"
echo "   New: $NEW_ENDPOINT"
echo ""

# Count occurrences
COUNT=$(grep -c "$OLD_ENDPOINT" "$TEMPLATE_FILE" || echo "0")

if [ "$COUNT" -eq 0 ]; then
  echo "⚠️  No occurrences of old endpoint found. It may have already been updated."
  exit 0
fi

echo "   Found $COUNT occurrence(s) to update"
echo ""

# Backup template
cp "$TEMPLATE_FILE" "${TEMPLATE_FILE}.backup"
echo "✅ Backup created: ${TEMPLATE_FILE}.backup"

# Replace all occurrences
sed -i '' "s|$OLD_ENDPOINT|$NEW_ENDPOINT|g" "$TEMPLATE_FILE"

echo "✅ Updated template.yaml"
echo ""
echo "📝 Changes made:"
grep -n "$NEW_ENDPOINT" "$TEMPLATE_FILE" | head -5
if [ "$COUNT" -gt 5 ]; then
  echo "   ... and $((COUNT - 5)) more"
fi

echo ""
echo "✅ Done! You can now deploy with: sam build && sam deploy"




