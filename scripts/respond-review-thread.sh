#!/bin/bash
# Transport only. github_respond_to_review supplies fixed, validated GraphQL
# payloads after preview/approval and reconciles each effect independently.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo 'Usage: bash respond-review-thread.sh <hostname> <payload-file>' >&2
  exit 1
fi

HOST="$1"
PAYLOAD_FILE="$2"
if [ ! -f "$PAYLOAD_FILE" ]; then
  echo 'Response payload file does not exist.' >&2
  exit 1
fi

# JSON file input preserves variables and literal reply text. Never retry here:
# an error or interruption after submission may follow an accepted mutation.
gh api graphql --hostname "$HOST" --method POST --input "$PAYLOAD_FILE"
