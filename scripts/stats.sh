#!/bin/sh
# Aggregate usage counts from production (counts only). Key: INIF_STATS_KEY in this venture's .env,
# set on the Worker as the secret STATS_KEY.
set -a; . "$(dirname "$0")/../.env"; set +a
curl -s -H "x-stats-key: $INIF_STATS_KEY" https://pb-in-if.pages.dev/api/__stats; echo
