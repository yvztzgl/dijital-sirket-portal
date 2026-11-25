#!/usr/bin/env bash
# Captures the real API's answers for step 1 of the wizard into src/app/core/testing/captured/,
# where api-mapper.spec.ts reads them. Run it against a running stack (in ../dijital-sirket-api:
# dev/up.sh, then dev/run.sh with the Worker); it walks one fresh founder through
#
#   profile → verified → scanning → review (difference open) → review (decided, fields filled)
#   → titleChecking → titleConflict → titleChecking (new title) → the stage after a reserved title
#
# The last three need staff to decide the trade name. They use ../dijital-sirket-api/dev/staff.sh
# (`staff.sh -a <reference no> title reject|reserve`) when it exists; without it the walk stops at
# titleChecking and says so.
#
# Personal data: the founder is a made-up test person ("Deneme Kurucu", an @example.test address);
# every e-mail address in the saved JSON is replaced with kurucu@example.test before it is written.
# Nothing else about the founder is real. Each run leaves one account and application behind in the
# development database.
#
# The deck is a "PDF" whose bytes are UTF-8 text: it starts with the PDF signature (the API's file
# check) and then has "key: value" lines, which the development deck reader (FakeDeckReader) takes as
# the fields it read. Its phone differs from the profile's, so the review has an open difference.
set -euo pipefail
cd "$(dirname "$0")/../.."
PORTAL=$(pwd)
API_REPO="${DSP_API_REPO:-$PORTAL/../dijital-sirket-api}"
API="${DSP_API:-http://localhost:5149}"
OUT="$PORTAL/src/app/core/testing/captured"
EMAIL="fixture-$(date +%s)-$RANDOM@example.test"
PASSWORD="Fixture-Sifre-$RANDOM-2026"
WORK=$(mktemp -d -t dsp-capture)
JAR="$WORK/jar"; BODY="$WORK/body"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

# call <expected status> <label> <curl args...>
call() {
  local expected=$1 label=$2; shift 2
  local status
  status=$(curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR" -c "$JAR" "$@")
  # Progress goes to stderr, so that `status` can return the stage on stdout.
  printf '  %-40s %s\n' "$label" "$status" >&2
  [ "$status" = "$expected" ] || { echo "  [!] expected $expected" >&2; sed 's/^/    /' "$BODY" >&2; exit 1; }
}
write() { call "$1" "$2" -X "$3" -H 'X-DSP-Request: 1' -H 'Content-Type: application/json' --data "$4" "$API$5"; }
# save <name>: the full read, e-mail addresses replaced, pretty-printed.
save() {
  call 200 "GET /api/application → $1.json" "$API/api/application"
  sed -E 's/[A-Za-z0-9._%+-]+@example\.test/kurucu@example.test/g' "$BODY" | jq . > "$OUT/$1.json"
  echo "    stage: $(jq -r .stage "$OUT/$1.json")"
}
status() { call 200 "GET /api/application/status" "$API/api/application/status"; jq -r .stage "$BODY"; }
# wait_stage <stage> <seconds>: polls the status read until the stage is reached.
wait_stage() {
  for _ in $(seq 1 "$2"); do
    [ "$(status)" = "$1" ] && return 0
    sleep 1
  done
  echo "  [!] stage $1 not reached in $2 s"; exit 1
}

echo "capturing against $API as $EMAIL"
write 202 "register" POST "{\"firstName\":\"Deneme\",\"lastName\":\"Kurucu\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" /api/auth/register
sleep 0.5
CODE=$( (cd "$API_REPO" && dev/last-code.sh -q "$EMAIL") ) || { echo "  [!] no code in the outbox"; exit 1; }
write 204 "verify-email" POST "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" /api/auth/verify-email
call 204 "POST /api/application" -X POST -H 'X-DSP-Request: 1' "$API/api/application"
save profile
call 200 "GET /api/reference/wizard → reference.json" "$API/api/reference/wizard"
jq . "$BODY" > "$OUT/reference.json"

write 204 "PUT profile" PUT '{"brand":"Lumora","sector":"software","funding":"own-abroad","nationality":"Almanya","phone":"+49 151 2345 6700","country":"Almanya"}' /api/application/profile
save verified

DECK="$WORK/Lumora Sunum.pdf"
printf '%s\n' '%PDF-1.4' \
  'trade_name: Lumora Veri Analitiği' 'nace_codes: 62.01, 63.11' 'shareholding: %100' \
  'given_name: Deneme' 'family_name: Kurucu' 'nationality: Almanya' "email: $EMAIL" \
  'phone: +49 151 2345 6789' 'residence_address: Torstraße 45, 10119 Berlin' 'source_of_funds: own-abroad' > "$DECK"
call 202 "POST deck" -X POST -H 'X-DSP-Request: 1' -F "file=@$DECK;filename=Lumora Sunum.pdf;type=application/pdf" \
  -F noticeAcknowledged=true -F aiConsent=true "$API/api/application/deck"
# The Worker usually reads it within a second, so the scanning read is made at once.
save scanning
wait_stage review 15
save review-open

# Two differences: the phone, and the country (the API compares the stated country with the deck's
# whole address line, which names the city, not the country).
write 204 "resolve phone → read" POST '{"choice":"read"}' /api/application/cross-checks/phone
write 204 "resolve country → stated" POST '{"choice":"stated"}' /api/application/cross-checks/country
write 204 "PATCH review (postal code, family name)" PATCH '{"fields":{"postal_code":"10119","family_name":"Kurucu-Test"}}' /api/application/review
save review-decided
call 202 "POST review/submit" -X POST -H 'X-DSP-Request: 1' "$API/api/application/review/submit"
save title-checking
call 200 "GET /api/application/status → status.json" "$API/api/application/status"
jq . "$BODY" > "$OUT/status.json"

REF=$(jq -r .referenceNo "$OUT/title-checking.json")
STAFF="$API_REPO/dev/staff.sh"
if [ ! -x "$STAFF" ]; then
  echo "  [!] $STAFF is not there: stopping at titleChecking ($REF)"
  exit 0
fi
(cd "$API_REPO" && dev/staff.sh -a "$REF" title reject "Benzer bir unvan sicilde kayıtlıdır.")
wait_stage titleConflict 30
save title-conflict
write 202 "POST title" POST '{"title":"Lumora Analitik Yazılım"}' /api/application/title
save title-checking-again
(cd "$API_REPO" && dev/staff.sh -a "$REF" title reserve)
for _ in $(seq 1 30); do
  s=$(status); [ "$s" != titleChecking ] && break; sleep 1
done
save title-reserved
echo "done: $OUT ($REF)"
