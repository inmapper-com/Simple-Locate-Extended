#!/usr/bin/env bash
# One-time: connect GitHub → Cloud Build trigger for tubitak-1507-2025
# Run in Cloud SDK Shell AFTER first `bash gcp/deploy.sh` (SQL + secrets exist).
#
# Prerequisites:
#   1) Cloud Console → Cloud Build → Repositories → Connect repository (GitHub)
#   2) Select this repo
#   3) Then run this script OR create trigger in Console
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-tubitak-1507-2025}"
REGION="${REGION:-europe-west1}"
REPO_OWNER="${REPO_OWNER:-inmapper-com}"
REPO_NAME="${REPO_NAME:-Simple-Locate-Extended}"
BRANCH="${BRANCH:-^main$}"
TRIGGER_NAME="${TRIGGER_NAME:-simple-locate-deploy}"

gcloud config set project "$PROJECT_ID"
gcloud services enable cloudbuild.googleapis.com secretmanager.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com sqladmin.googleapis.com \
  storage.googleapis.com artifactregistry.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "==> Grant Cloud Build SA deploy roles"
for ROLE in \
  roles/cloudfunctions.developer \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/storage.admin \
  roles/secretmanager.secretAccessor \
  roles/cloudsql.client \
  roles/artifactregistry.writer \
  roles/cloudbuild.builds.builder
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CB_SA}" \
    --role="$ROLE" \
    --condition=None >/dev/null || true
done

# Default compute SA also needs to run the function with secrets (already done in deploy.sh)
echo "==> Create / update trigger: $TRIGGER_NAME"
# 2nd gen GitHub connection uses --repository if linked via Developer Connect / CB repos.
# Classic GitHub App connection:
if gcloud builds triggers describe "$TRIGGER_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "Trigger exists — updating"
  gcloud builds triggers update github "$TRIGGER_NAME" \
    --region="$REGION" \
    --repo-owner="$REPO_OWNER" \
    --repo-name="$REPO_NAME" \
    --branch-pattern="$BRANCH" \
    --build-config=cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_BUCKET=${PROJECT_ID}-simple-locate,_FN_NAME=logs-api,_SQL_INSTANCE=simple-locate-db" \
    || true
else
  gcloud builds triggers create github \
    --name="$TRIGGER_NAME" \
    --region="$REGION" \
    --repo-owner="$REPO_OWNER" \
    --repo-name="$REPO_NAME" \
    --branch-pattern="$BRANCH" \
    --build-config=cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_BUCKET=${PROJECT_ID}-simple-locate,_FN_NAME=logs-api,_SQL_INSTANCE=simple-locate-db"
fi

echo ""
echo "Done. Push to main → Cloud Build runs cloudbuild.yaml"
echo "Manual test:"
echo "  gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID"
echo ""
echo "If create failed: Console → Cloud Build → Triggers → Create"
echo "  Source: connected GitHub repo"
echo "  Config: cloudbuild.yaml"
echo "  Branch: ^main$"
