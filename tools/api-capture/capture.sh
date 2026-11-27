#!/usr/bin/env bash
# Captures the real API's answers for steps 1 to 3 of the wizard into src/app/core/api/testing/captured/,
# where api-mapper.spec.ts reads them. Run it against a running stack (in ../dijital-sirket-api:
# dev/up.sh, then dev/run.sh with the Worker and the BackOffice).
#
#   tools/api-capture/capture.sh          all steps
#   tools/api-capture/capture.sh step1    step 1 only (one founder)
#   tools/api-capture/capture.sh step2    step 2 only (four founders; step 1's files are left as they are)
#   tools/api-capture/capture.sh step3    step 3 only (one founder; the other files are left as they are)
#   tools/api-capture/capture.sh step45   steps 4 and 5 only (two founders; the other files are left as they are)
#
# Step 1, one founder:
#   profile → verified → evaluating (deck, CV and answers sent; the outside evaluation runs, minutes)
#   → review (defaults from the profile and the account) → review (title, codes, address typed)
#   → titleChecking → titleConflict → titleChecking (new title) → the stage after a reserved title
#   Then two more founders for the evaluation's other ends: the API's stand-in evaluator decides by
#   the deck's file name ("questions" → evaluationQuestions; "failed" → every attempt fails, back to
#   verified). Only `cancelled` cannot be caused from here.
#
# Step 2 (each founder first walks step 1 to a reserved title, saving nothing of it):
#   A  foreign, own funds: the identity check handed to the phone (phone link, the phone routes with
#      the token header), declaration, screening, the result (API stage payment)
#   B  foreign, third-party funds: the identity check on the computer, declaration, manual review,
#      staff approve → payment
#   C  foreign, third-party funds: as B to manual review, staff reject → the read answers 404
#   D  resident (e-Devlet): straight to the declaration after the reserved title
#
# Step 3, one founder (E, foreign, own funds, steps 1 and 2 walked without saving):
#   payment refused without a second factor (403 step_up_required) → step-up code sent, a wrong code
#   refused, the right code (from the development outbox, ../dijital-sirket-api/dev/last-code.sh) →
#   a declined card (tok_test_0002) → payment started (threeDs) → a wrong 3-D Secure code → resend →
#   cancel (back to payment) → paid again without a new code (within 15 minutes) → 123456 → signing.
#   The card is only ever the development token: tok_test_ + four digits (no card number exists here).
#
# Steps 4 and 5 (each founder walks steps 1 to 3 without saving them):
#   F  foreign: signing → the call refused without the consent → consent → call open (calling) → hung up
#      (signing) → hanging up again refused → call again → completed (calling while the certificate is
#      issued) → signed → set-up started (setup null until the Worker creates the steps) → steps created →
#      staff complete the institution tasks (dev/staff.sh setup, in the background) → a read with some
#      results while still in setup → done.
#   R  resident (e-Devlet): signing → `esign/resident {method:"existing"}` → calling (the Worker issuing;
#      no call for a resident) → signed → set-up started → steps created.
#
# Staff are played by ../dijital-sirket-api/dev/staff.sh (`staff.sh -a <reference no> title|review|setup …`).
#
# Personal data: the founders are made-up test people ("Deneme Kurucu", @example.test addresses);
# every e-mail address in the saved JSON is replaced with kurucu@example.test, and the phone link's
# token is replaced with "<token>" before anything is written. The resident's T.C. kimlik no is
# generated in the test range 10000000xxx (valid check digits, as the development e-Devlet stand-in
# requires) and appears in no saved file (the development e-Devlet gives the account the address
# <T.C. kimlik no>@edevlet.test, which is replaced with kurucu@example.test like the others, and the
# run stops if the number is found in a file it wrote). Each run leaves its accounts and applications behind in
# the development database.
#
# The deck is a minimal real PDF of three pages (the evaluation takes 3 to 40), the CV and the
# address document minimal real one-page PDFs.
set -euo pipefail
cd "$(dirname "$0")/../.."
PORTAL=$(pwd)
API_REPO="${DSP_API_REPO:-$PORTAL/../dijital-sirket-api}"
API="${DSP_API:-http://localhost:5149}"
OUT="$PORTAL/src/app/core/api/testing/captured"
WHAT="${1:-all}"
WORK=$(mktemp -d -t dsp-capture)
JAR="$WORK/jar"; BODY="$WORK/body"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"
[ -x "$API_REPO/dev/staff.sh" ] || { echo "[!] $API_REPO/dev/staff.sh is needed"; exit 1; }

# call <expected status> <label> <curl args...>
# The sign-in and phone routes are rate limited (20 a minute per address); on a 429 it waits and tries again.
call() {
  local expected=$1 label=$2; shift 2
  local status tries=0
  while true; do
    status=$(curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR" -c "$JAR" "$@")
    [ "$status" = 429 ] && [ "$tries" -lt 8 ] || break
    tries=$((tries + 1)); printf '  %-40s 429, waiting 10 s\n' "$label" >&2; sleep 10
  done
  # Progress goes to stderr, so that `status` can return the stage on stdout.
  printf '  %-40s %s\n' "$label" "$status" >&2
  [ "$status" = "$expected" ] || { echo "  [!] expected $expected" >&2; sed 's/^/    /' "$BODY" >&2; exit 1; }
}
write() { call "$1" "$2" -X "$3" -H 'X-DSP-Request: 1' -H 'Content-Type: application/json' --data "$4" "$API$5"; }
# keep <name>: the last body, e-mail addresses and tokens replaced, pretty-printed, into captured/ (or the
# temporary folder when that part is not being captured).
DEST="$OUT"
keep() {
  sed -E 's/[A-Za-z0-9._%+-]+@(example|edevlet)\.test/kurucu@example.test/g; s/"token": *"[^"]*"/"token":"<token>"/g' "$BODY" | jq . > "$DEST/$1.json"
  if [ -n "${TCKN:-}" ] && grep -q "$TCKN" "$DEST/$1.json"; then echo "  [!] the T.C. kimlik no is in $1.json"; rm -f "$DEST/$1.json"; exit 1; fi
}
# save <name>: the full read.
save() {
  call 200 "GET /api/application → $1.json" "$API/api/application"
  keep "$1"
  echo "    stage: $(jq -r .stage "$DEST/$1.json")"
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
# phone <expected> <label> <method> <route> [body]: a phone route, with the token in its header only.
phone() {
  local args=(-X "$3" -H "X-DSP-Phone-Token: $PHONE_TOKEN")
  [ "$3" = GET ] || args+=(-H 'X-DSP-Request: 1')
  [ -n "${5:-}" ] && args+=(-H 'Content-Type: application/json' --data "$5")
  # No cookie jar: the phone has no session.
  local status
  status=$(curl -sS -o "$BODY" -w '%{http_code}' "${args[@]}" "$API$4")
  printf '  %-40s %s\n' "$2" "$status" >&2
  [ "$status" = "$1" ] || { echo "  [!] expected $1" >&2; sed 's/^/    /' "$BODY" >&2; exit 1; }
}
staff() { (cd "$API_REPO" && dev/staff.sh -a "$REF" "$@"); }

# A T.C. kimlik no in the test range 10000000xxx (nine digits 1000000NN, then the two check digits).
test_tckn() {
  local n=$((RANDOM % 90 + 10)) i sum=0
  local d=(1 0 0 0 0 0 0 "${n:0:1}" "${n:1:1}")
  local odd=$((d[0] + d[2] + d[4] + d[6] + d[8])) even=$((d[1] + d[3] + d[5] + d[7]))
  local d10=$(( ((odd * 7 - even) % 10 + 10) % 10 ))
  for i in 0 1 2 3 4 5 6 7 8; do sum=$((sum + d[i])); done
  echo "1000000${n}${d10}$(( (sum + d10) % 10 ))"
}

# A founder signed in with a new account: e-mail (foreign) or e-Devlet (resident).
new_founder() {
  rm -f "$JAR"
  TCKN=""
  if [ "$1" = resident ]; then
    TCKN=$(test_tckn)
    call 200 "GET edevlet/start" "$API/api/auth/edevlet/start"
    local state; state=$(jq -r .redirectUrl "$BODY" | sed -E 's/.*state=([^&]*).*/\1/')
    write 204 "POST edevlet (test T.C. kimlik no)" POST "{\"code\":\"$TCKN\",\"state\":\"$state\"}" /api/auth/edevlet
    EMAIL="kurucu@example.test"
    # Where the development e-Devlet's account receives its codes (the second factor); never saved.
    CODE_TO="$TCKN@edevlet.test"
  else
    EMAIL="fixture-$(date +%s)-$RANDOM@example.test"
    local password="Fixture-Sifre-$RANDOM-2026" code
    write 202 "register" POST "{\"firstName\":\"Deneme\",\"lastName\":\"Kurucu\",\"email\":\"$EMAIL\",\"password\":\"$password\"}" /api/auth/register
    sleep 0.5
    code=$( (cd "$API_REPO" && dev/last-code.sh -q "$EMAIL") ) || { echo "  [!] no code in the outbox"; exit 1; }
    write 204 "verify-email" POST "{\"email\":\"$EMAIL\",\"code\":\"$code\"}" /api/auth/verify-email
    CODE_TO="$EMAIL"
  fi
  call 204 "POST /api/application" -X POST -H 'X-DSP-Request: 1' "$API/api/application"
}

# pdf <file> <pages>: a minimal valid PDF with that many empty pages.
pdf() {
  local kids="" i
  for i in $(seq 1 "$2"); do kids="$kids $((i + 2)) 0 R"; done
  { printf '%s\n' '%PDF-1.4' '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj' "2 0 obj <</Type/Pages/Kids[$kids]/Count $2>> endobj"
    for i in $(seq 1 "$2"); do printf '%s\n' "$((i + 2)) 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj"; done
    printf '%s\n' 'trailer <</Root 1 0 R>>' '%%EOF'; } > "$1"
}

# upload_deck <deck file name>: the deck (3 pages), the CV (1 page) and the five answers. The stand-in
# evaluator reads the deck's file name (see the header).
upload_deck() {
  local deck="$WORK/deck.pdf" cv="$WORK/cv.pdf"
  pdf "$deck" 3; pdf "$cv" 1
  call 202 "POST deck ($1, CV, answers)" -X POST -H 'X-DSP-Request: 1' \
    -F "file=@$deck;filename=$1;type=application/pdf" -F "cv=@$cv;filename=Ozgecmis.pdf;type=application/pdf" \
    --form-string 'summary=Lumora, küçük işletmelere veri analitiği yazılımı sunar; abonelikle satılır ve Avrupa pazarında büyür.' \
    -F activityGroupId=1 -F activityId=3 -F businessModelIds=1 -F revenueModelIds=7 -F productTypeIds=2 \
    -F noticeAcknowledged=true -F aiConsent=true "$API/api/application/deck"
}

# step_one <funding>: profile, deck with CV and answers, the evaluation, the company form, title asked.
# Saves only when DEST is captured/. The evaluation takes minutes (the outside service).
step_one() {
  local funding=$1
  save profile
  call 200 "GET /api/reference/wizard → reference.json" "$API/api/reference/wizard"
  keep reference
  call 200 "GET /api/reference/evaluation → reference-evaluation.json" "$API/api/reference/evaluation"
  keep reference-evaluation
  write 204 "PUT profile" PUT "{\"brand\":\"Lumora\",\"sector\":\"software\",\"funding\":\"$funding\",\"nationality\":\"Almanya\",\"phone\":\"+49 151 2345 6700\",\"country\":\"Almanya\"}" /api/application/profile
  save verified

  upload_deck "Lumora Sunum.pdf"
  save evaluating
  call 200 "GET /api/application/status → status-evaluating.json" "$API/api/application/status"
  keep status-evaluating
  wait_stage review 900
  save review-defaults

  write 204 "PATCH review (title, codes, address, postal code, family name)" PATCH \
    '{"fields":{"trade_name":"Lumora Analitik Yazılım","nace_codes":"62.10.00, 63.10.00","residence_address":"Torstraße 45, Berlin","postal_code":"10119","family_name":"Kurucu-Berg"}}' /api/application/review
  save review-edited
  write 204 "PATCH review (title for the conflict)" PATCH '{"fields":{"trade_name":"Lumora Veri Analitiği"}}' /api/application/review
  call 202 "POST review/submit" -X POST -H 'X-DSP-Request: 1' "$API/api/application/review/submit"
  save title-checking
  call 200 "GET /api/application/status → status.json" "$API/api/application/status"
  keep status
  REF=$(jq -r .referenceNo "$DEST/title-checking.json")
}

reserve_title() {
  staff title reserve
  for _ in $(seq 1 30); do
    s=$(status); [ "$s" != titleChecking ] && break; sleep 1
  done
}

# The address document: a minimal valid one-page PDF.
ADDRESS="$WORK/adres-belgesi.pdf"
printf '%s\n' '%PDF-1.4' '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj' '2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj' \
  '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj' 'trailer <</Root 1 0 R>>' '%%EOF' > "$ADDRESS"
declare_address() {
  call 202 "POST declaration (PDF, declared)" -X POST -H 'X-DSP-Request: 1' \
    -F "file=@$ADDRESS;filename=adres-belgesi.pdf;type=application/pdf" -F declared=true "$API/api/application/declaration"
}

if [ "$WHAT" = all ] || [ "$WHAT" = step1 ]; then
  echo "step 1"
  new_founder foreign
  echo "  as $EMAIL"
  step_one own-abroad
  staff title reject "Benzer bir unvan sicilde kayıtlıdır."
  wait_stage titleConflict 30
  save title-conflict
  write 202 "POST title" POST '{"title":"Lumora Analitik Yazılım"}' /api/application/title
  save title-checking-again
  reserve_title
  save title-reserved
  echo "step 1 done ($REF)"
  for end in questions failed; do
    echo "step 1 · evaluation ending $end"
    new_founder foreign
    write 204 "PUT profile" PUT '{"brand":"Lumora","sector":"software","funding":"own-abroad","nationality":"Almanya","phone":"+49 151 2345 6700","country":"Almanya"}' /api/application/profile
    upload_deck "Lumora Sunum $end.pdf"
    if [ "$end" = questions ]; then wait_stage evaluationQuestions 300; else sleep 2; wait_stage verified 600; fi
    save "evaluation-$end"
  done
fi

# step_two_quick: identity on the computer, declaration, list search, until the API is at `payment`. Saves nothing.
step_two_quick() {
  write 204 "POST identity/start {consent:true}" POST '{"consent":true}' /api/application/identity/start
  call 202 "POST identity/complete" -X POST -H 'X-DSP-Request: 1' "$API/api/application/identity/complete"
  wait_stage declaration 20
  declare_address
  wait_stage payment 30
}

# keep_problem <name>: an error body as it came (problem+json; no personal data in it).
keep_problem() { jq . "$BODY" > "$OUT/$1.json"; }

if [ "$WHAT" = all ] || [ "$WHAT" = step3 ]; then
  echo "step 3 · E: second factor and payment"
  DEST="$WORK"; new_founder foreign; step_one own-abroad; reserve_title; step_two_quick; DEST="$OUT"
  save payment-open
  CARD='{"holder":"DENEME KURUCU","cardToken":"tok_test_4242"}'
  write 403 "POST payment (no second factor) → step-up-required.json" POST "$CARD" /api/application/payment
  keep_problem step-up-required
  call 202 "POST auth/step-up" -X POST -H 'X-DSP-Request: 1' "$API/api/auth/step-up"
  write 400 "POST auth/step-up/verify (wrong) → step-up-wrong-code.json" POST '{"code":"000000"}' /api/auth/step-up/verify
  keep_problem step-up-wrong-code
  sleep 0.5
  code=$( (cd "$API_REPO" && dev/last-code.sh -q "$EMAIL") ) || { echo "  [!] no step-up code in the outbox"; exit 1; }
  write 204 "POST auth/step-up/verify (code from the outbox)" POST "{\"code\":\"$code\"}" /api/auth/step-up/verify
  write 422 "POST payment tok_test_0002 → card-declined.json" POST '{"holder":"DENEME KURUCU","cardToken":"tok_test_0002"}' /api/application/payment
  keep_problem card-declined
  write 204 "POST payment tok_test_4242" POST "$CARD" /api/application/payment
  save payment-3ds-pending
  write 422 "POST payment/3ds (wrong) → threeds-wrong-code.json" POST '{"code":"000000"}' /api/application/payment/3ds
  keep_problem threeds-wrong-code
  call 204 "POST payment/3ds/resend" -X POST -H 'X-DSP-Request: 1' "$API/api/application/payment/3ds/resend"
  call 204 "POST payment/3ds/cancel" -X POST -H 'X-DSP-Request: 1' "$API/api/application/payment/3ds/cancel"
  save payment-cancelled
  write 204 "POST payment again (no new code)" POST "$CARD" /api/application/payment
  write 204 "POST payment/3ds 123456" POST '{"code":"123456"}' /api/application/payment/3ds
  save payment-captured
  echo "step 3 done"
fi

# step_up: the second factor for this session (code from the development outbox). Saves nothing.
step_up() {
  call 202 "POST auth/step-up" -X POST -H 'X-DSP-Request: 1' "$API/api/auth/step-up"
  sleep 0.5
  local code
  code=$( (cd "$API_REPO" && dev/last-code.sh -q "$CODE_TO") ) || { echo "  [!] no step-up code in the outbox"; exit 1; }
  write 204 "POST auth/step-up/verify (code from the outbox)" POST "{\"code\":\"$code\"}" /api/auth/step-up/verify
}
# pay_quick: from `payment` to `signing` (second factor, development card token, 3-D Secure 123456). Saves nothing.
pay_quick() {
  step_up
  write 204 "POST payment tok_test_4242" POST '{"holder":"DENEME KURUCU","cardToken":"tok_test_4242"}' /api/application/payment
  write 204 "POST payment/3ds 123456" POST '{"code":"123456"}' /api/application/payment/3ds
  wait_stage signing 10
}
# wait_setup_steps <name>: reads the application until the Worker has created the set-up's steps, then saves it.
wait_setup_steps() {
  for _ in $(seq 1 30); do
    call 200 "GET /api/application (steps yet?)" "$API/api/application"
    [ "$(jq -r '.setup != null' "$BODY")" = true ] && { keep "$1"; echo "    stage: $(jq -r .stage "$DEST/$1.json")"; return 0; }
    sleep 1
  done
  echo "  [!] the set-up's steps did not appear in 30 s"; exit 1
}

if [ "$WHAT" = all ] || [ "$WHAT" = step45 ]; then
  echo "steps 4 and 5 · F: a foreign founder, call and set-up to done"
  DEST="$WORK"; new_founder foreign; step_one own-abroad; reserve_title; step_two_quick; pay_quick; DEST="$OUT"
  save esign-signing
  # The second factor from the payment is still fresh (15 minutes), so the consent check answers.
  call 409 "POST esign/call/start (no consent) → esign-consent-missing.json" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/start"
  keep_problem esign-consent-missing
  write 204 "POST esign/consent {consent:true}" POST '{"consent":true}' /api/application/esign/consent
  save esign-consent
  call 204 "POST esign/call/start" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/start"
  save esign-call-open
  call 204 "POST esign/call/end" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/end"
  save esign-call-ended
  call 409 "POST esign/call/end (none open) → esign-no-open-call.json" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/end"
  keep_problem esign-no-open-call
  call 204 "POST esign/call/start (again)" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/start"
  call 202 "POST esign/call/complete" -X POST -H 'X-DSP-Request: 1' "$API/api/application/esign/call/complete"
  # The Worker issues within a second or two, so the issuing read is made at once.
  save esign-issuing
  wait_stage signed 20
  save esign-signed
  write 202 "POST setup {confirmed:true}" POST '{"confirmed":true}' /api/application/setup
  save setup-started
  call 200 "GET /api/application/status → status-setup.json" "$API/api/application/status"
  keep status-setup
  wait_setup_steps setup-steps
  # Staff complete the six institution tasks in the background; a read is kept as soon as some
  # results have arrived while the stage is still setup.
  (cd "$API_REPO" && dev/staff.sh -a "$REF" setup > "$WORK/staff.log" 2>&1) &
  STAFF=$!
  RESULTS=""
  for _ in $(seq 1 240); do
    call 200 "GET /api/application (results yet?)" "$API/api/application"
    if [ -z "$RESULTS" ] && [ "$(jq -r '.stage == "setup" and ((.results // {}) | length) > 0' "$BODY")" = true ]; then
      keep setup-results; RESULTS=yes; echo "    results: $(jq -c '.results | keys' "$DEST/setup-results.json")"
    fi
    [ "$(jq -r .stage "$BODY")" = done ] && break
    sleep 1
  done
  wait "$STAFF" || { echo "  [!] dev/staff.sh setup failed"; cat "$WORK/staff.log"; exit 1; }
  [ -n "$RESULTS" ] || echo "  [!] no read with partial results was caught (setup-results.json not written)"
  save setup-done
  call 200 "GET /api/application/status → status-done.json" "$API/api/application/status"
  keep status-done

  echo "steps 4 and 5 · R: a resident founder (e-Devlet), method choice and set-up started"
  DEST="$WORK"; new_founder resident; step_one own-turkey no; reserve_title
  declare_address; wait_stage payment 30; pay_quick; DEST="$OUT"
  save resident-signing
  write 202 "POST esign/resident {method:existing}" POST '{"method":"existing"}' /api/application/esign/resident
  save resident-issuing
  wait_stage signed 20
  save resident-signed
  write 202 "POST setup {confirmed:true}" POST '{"confirmed":true}' /api/application/setup
  wait_setup_steps resident-setup-steps
  echo "steps 4 and 5 done (F: see the files above; R: $REF)"
fi

[ "$WHAT" = all ] || [ "$WHAT" = step2 ] || exit 0

echo "step 2 · A: identity on the phone, declaration, screening, result"
DEST="$WORK"; new_founder foreign; step_one own-abroad; reserve_title; DEST="$OUT"
call 200 "POST phone-link → phone-link.json" -X POST -H 'X-DSP-Request: 1' "$API/api/application/phone-link"
PHONE_TOKEN=$(jq -r .token "$BODY")
keep phone-link
phone 200 "GET phone/status → phone-ready.json" GET /api/phone/status
keep phone-ready
phone 204 "POST phone/start {consent:true}" POST /api/phone/start '{"consent":true}'
phone 200 "GET phone/status → phone-running.json" GET /api/phone/status
keep phone-running
save identity-running-phone
phone 202 "POST phone/complete" POST /api/phone/complete
wait_stage declaration 20
phone 200 "GET phone/status → phone-done.json" GET /api/phone/status
keep phone-done
save declaration
declare_address
# The Worker usually finishes the list search within a second or two, so the screening read is made at once.
save screening
wait_stage payment 20
save eligible

echo "step 2 · B: identity on the computer, manual review, staff approve"
DEST="$WORK"; new_founder foreign; step_one third-party no; reserve_title; DEST="$OUT"
write 204 "POST identity/start {consent:true}" POST '{"consent":true}' /api/application/identity/start
save identity-running
call 202 "POST identity/complete" -X POST -H 'X-DSP-Request: 1' "$API/api/application/identity/complete"
wait_stage declaration 20
declare_address
wait_stage manual 20
save manual
staff review approve
wait_stage payment 30
save review-approved

echo "step 2 · C: manual review, staff reject"
DEST="$WORK"; new_founder foreign; step_one third-party no; reserve_title; DEST="$OUT"
write 204 "POST identity/start {consent:true}" POST '{"consent":true}' /api/application/identity/start
call 202 "POST identity/complete" -X POST -H 'X-DSP-Request: 1' "$API/api/application/identity/complete"
wait_stage declaration 20
declare_address
wait_stage manual 20
staff review reject
for _ in $(seq 1 30); do
  code=$(curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR" "$API/api/application/status")
  [ "$code" = 404 ] && break; sleep 1
done
call 404 "GET /api/application → closed.json" "$API/api/application"
keep closed

echo "step 2 · D: a resident founder (e-Devlet)"
DEST="$WORK"; new_founder resident; step_one own-turkey no; reserve_title; DEST="$OUT"
save resident-declaration
echo "done: $OUT"
