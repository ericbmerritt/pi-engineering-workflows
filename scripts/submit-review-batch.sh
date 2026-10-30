#!/bin/bash
# Public transport adapter for the validated batched-review wrapper pattern.
# Call through github_submit_review: that tool validates the payload, anchors,
# reviewed revision, and human approval before invoking this transport.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo 'Usage: bash submit-review-batch.sh <hostname> <owner/repo> <pr> <payload-file>' >&2
  exit 1
fi

HOST="$1"
REPO="$2"
PR_NUMBER="$3"
PAYLOAD_FILE="$4"

if [ ! -f "$PAYLOAD_FILE" ]; then
  echo 'Review payload file does not exist.' >&2
  exit 1
fi

# Preserve JSON number/array types using --input, not per-field CLI flags.
# Leave stdout/stderr separate. The caller reconciles ambiguous outcomes and
# never retries the POST automatically.
gh api "repos/${REPO}/pulls/${PR_NUMBER}/reviews" \
  --hostname "$HOST" -X POST --input "$PAYLOAD_FILE"
