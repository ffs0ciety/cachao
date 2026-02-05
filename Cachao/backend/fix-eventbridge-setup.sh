#!/bin/bash
# Script to check and fix EventBridge setup

echo "🔧 Checking EventBridge Partner Event Source"
echo "============================================="
echo ""

EVENT_SOURCE_NAME="aws.partner/stripe.com/ed_test_61Tw6AOzu6iJQhjyn16Tw5y8SfCQEXXHewXuBVM88FuC"

echo "1️⃣ Checking partner event source status:"
echo "----------------------------------------"
aws events describe-event-source \
  --name "$EVENT_SOURCE_NAME" \
  --profile personal \
  --region eu-west-1 \
  --output json 2>/dev/null | jq -r '{Name: .Name, State: .State, CreatedBy: .CreatedBy}' || echo "❌ Could not describe event source"

echo ""
echo "2️⃣ Listing all partner event sources:"
echo "--------------------------------------"
aws events list-partner-event-sources \
  --profile personal \
  --region eu-west-1 \
  --query 'PartnerEventSources[*].[Name,State]' \
  --output table 2>/dev/null || echo "Could not list partner sources"

echo ""
echo "3️⃣ Checking if event source is associated with event bus:"
echo "-----------------------------------------------------------"
aws events list-event-sources \
  --profile personal \
  --region eu-west-1 \
  --query 'EventSources[?contains(Name, `stripe`) || contains(Name, `ed_test_61Tw6AOzu6iJQhjyn16Tw5y8SfCQEXXHewXuBVM88FuC`)].{Name:Name,State:State}' \
  --output table 2>/dev/null || echo "Could not list event sources"

echo ""
echo "💡 If the event source shows as 'PENDING' or is not associated:"
echo ""
echo "   In AWS Console:"
echo "   1. Go to: https://eu-west-1.console.aws.amazon.com/events/home?region=eu-west-1#/partners"
echo "   2. Find: $EVENT_SOURCE_NAME"
echo "   3. Click on it"
echo "   4. If it says 'Pending', click 'Associate with event bus'"
echo "   5. Select 'default' event bus"
echo "   6. Click 'Associate'"
echo ""
echo "   Or use AWS CLI:"
echo "   aws events create-partner-event-source-account \\"
echo "     --event-source-name '$EVENT_SOURCE_NAME' \\"
echo "     --account '109539191011' \\"
echo "     --profile personal \\"
echo "     --region eu-west-1"


